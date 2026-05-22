# Simulazione del Connectome del C. elegans

## Contesto Biologico

Il *Caenorhabditis elegans* è un nematode di ~1 mm usato come organismo modello in biologia. È il primo organismo di cui si conosce completamente il **connettoma** (mappa di tutte le connessioni neurali): 302 neuroni, ~7.000 sinapsi chimiche. Il progetto [OpenWorm](https://openworm.org) ha reso pubblico il dataset completo (`herm_full_edgelist.csv`, forma ermafrodita).

Il dataset usato in questo progetto contiene **448 neuroni** (alcuni con nomi diversi rispetto alla versione classica a 302) e **7378 sinapsi** nel formato CSV:

```
"Source","Target","Weight","Type"
"AVAL","AVBL",3,"S"
...
```

I campi Source e Target contengono nomi di neuroni con eventuali spazi da trimmizzare.

---

## Struttura del Modulo

`src/connectome.js` è organizzato come **IIFE** (Immediately Invoked Function Expression) che espone due funzioni:

```javascript
const Connectome = (() => {
    // dati condivisi (read-only dopo init)
    let sharedAdjacencyMap = {};
    let sharedNeuronNames  = [];

    function init(csvText) { /* costruisce la struttura */ }
    function createInstance() { /* crea uno stato per un singolo verme */ }

    return { init, createInstance };
})();
```

`init` è chiamata una volta sola e costruisce la struttura dati condivisa da tutti i vermi. `createInstance` crea un oggetto con stato **isolato** per ogni verme: stessi neuroni, stessa topologia, ma attivazioni indipendenti.

---

## Inizializzazione (`init`)

### Parsing CSV

```javascript
// src/connectome.js
function parseConnectomeCsv(text) {
    const synapses = [];
    const lines = text.split('\n');
    for (let i = 1; i < lines.length; i++) {   // salta header
        const parts = line.split(',');
        synapses.push({
            source: parts[0].trim(),
            target: parts[1].trim(),
            weight: parseInt(parts[2].trim())
        });
    }
    return synapses;
}
```

Il weight del CSV è un intero che rappresenta il numero di connessioni sinaptiche (giunzioni). Più connessioni = peso più alto = segnale più forte.

### Adjacency Map

La struttura centrale è `sharedAdjacencyMap`: un dizionario `nome_neurone → [{target, weight}]` con i pesi normalizzati e il segno applicato per i neuroni inibitori:

```javascript
// src/connectome.js — init
for (const s of synapses) {
    if (!adjacencyMap[s.source]) adjacencyMap[s.source] = [];
    const sign = INHIBITORY_NEURONS.has(s.source) ? -1 : 1;
    adjacencyMap[s.source].push({ target: s.target, weight: sign * s.weight });
}
```

### Neuroni Inibitori (GABAergici)

Nel *C. elegans* i motoneuroni **DD01–DD06** e **VD01–VD13** sono **GABAergici**: liberano GABA (acido gamma-amminobutirrico) che inibisce i neuroni postsinaptici invece di eccitarli. Questi neuroni formano il circuito di **inibizione reciproca**: quando i muscoli dorsali si contraggono (attivati dai motoneuroni DB/DA), i neuroni DD inibiscono i motoneuroni ventrali (VB/VA), e viceversa.

Senza questa inibizione reciproca, dorsale e ventrale si contrarrebbero insieme e non si produrrebbe alcuna onda locomotoria. I pesi delle sinapsi uscenti da DD/VD vengono negati durante la costruzione della mappa:

```javascript
const INHIBITORY_NEURONS = new Set([
    'DD01','DD02','DD03','DD04','DD05','DD06',
    'VD01','VD02','VD03','VD04','VD05','VD06','VD07',
    'VD08','VD09','VD10','VD11','VD12','VD13'
]);
```

Il loop di propagazione non cambia: la somma `input += activation * weight * WEIGHT_SCALE` funziona correttamente sia con pesi positivi (eccitatori) che negativi (inibitori).

---

## Stato di Ogni Istanza (`createInstance`)

Ogni istanza del connectome ha un oggetto `neurons` indipendente:

```javascript
// src/connectome.js — createInstance
const neurons = {};
for (const name of sharedNeuronNames) {
    neurons[name] = { activation: 0, spiked: false };
}
let stimuli = { light: 0, hunger: 0 };
```

- `activation` ∈ [0, 1]: livello di attivazione corrente del neurone
- `spiked`: flag booleano, vero se il neurone ha superato la soglia nel frame corrente

---

## Loop di Simulazione (`step`)

Ogni frame esegue le seguenti fasi in sequenza:

### Fase 1: Reset

```javascript
for (const name in neurons) neurons[name].spiked = false;
```

### Fase 2: Iniezione Stimoli

I neuroni di comando non vengono simulati tramite la rete: i loro livelli di attivazione vengono **sovrascritti direttamente** ogni frame in base agli stimoli ambientali.

**Circuito forward** (AVBL, AVBR, PVCL, PVCR): ricevono una baseline costante di 0.5, affinché il verme esplori in avanti per default anche al buio.

**Circuito backward** (AVAL, AVAR, AVDL, AVDR): parte da 0.0, poi riceve un contributo lineare proporzionale alla luce:

```javascript
// src/connectome.js — step
for (const n of forwardNeurons)  neurons[n].activation = 0.5;
for (const n of backwardNeurons) neurons[n].activation = 0.0;

if (stimuli.light > 0.01) {
    for (const n of backwardNeurons)
        neurons[n].activation += stimuli.light * 1.5;
}
```

A `light = 0.33` il backward drive raggiunge $0.33 \times 1.5 = 0.495 \approx 0.5$ = pareggio con il forward drive. Sopra questa soglia il verme inverte la marcia.

**Neuroni del cibo** (AWAL, AWAR, ADFL, ADFR): impostati direttamente al valore della fame interna:

```javascript
for (const n of foodNeurons) neurons[n].activation = stimuli.hunger;
```

### Fase 3: Propagazione + Leaky Integrator

Per ogni neurone con `activation > THRESHOLD = 0.1`:

$$\text{input}[j] \mathrel{+}= a_i \cdot w_{ij} \cdot s \quad \forall\, i : a_i > \theta$$

con $s$ = `WEIGHT_SCALE = 0.02`.

```javascript
// src/connectome.js — step
const input = {};
for (const name in neurons) input[name] = 0;

for (const name in neurons) {
    const neuron = neurons[name];
    if (neuron.activation <= THRESHOLD) continue;
    neuron.spiked = true;
    const conns = sharedAdjacencyMap[name];
    if (!conns) continue;
    for (const conn of conns) {
        if (neurons[conn.target] !== undefined)
            input[conn.target] += neuron.activation * conn.weight * WEIGHT_SCALE;
    }
}
```

Poi **leaky integrator** a tempo continuo (eccetto per i neuroni di stimolo già impostati):

$$\Delta a_j = \frac{\Delta t}{\tau} \cdot (-a_j + \text{input}[j])$$

```javascript
// src/connectome.js — step
const TAU = 0.1;
const stimulusNeurons = new Set([...forwardNeurons, ...backwardNeurons, ...foodNeurons]);
for (const name in neurons) {
    if (stimulusNeurons.has(name)) continue;  // non sovrascrivere gli stimoli
    neurons[name].activation += (deltaTime / TAU) * (-neurons[name].activation + input[name]);
}
```

Il termine $-a_j$ è la **forza di ripristino** (leaky): porta ogni neurone verso il proprio punto di equilibrio $a_{eq} = \text{input}[j]$. Se un neurone non riceve input, decade a zero con costante di tempo $\tau = 0.1\ \text{s}$.

**Perché il leaky integrator invece del decay moltiplicativo**: il modello originale del README usava $a \leftarrow a \cdot D$ (decay). Il connectome del *C. elegans* ha centinaia di connessioni eccitatorie ricorrenti: con quel modello il segnale si auto-amplificava saturando tutti i neuroni indipendentemente dagli stimoli. Il leaky integrator stabilizza la rete: neuroni non stimolati decadono a zero, la saturazione avviene solo dove il segnale sinaptico è genuinamente alto.

### Fase 4: Clamp

```javascript
for (const name in neurons) {
    const a = neurons[name].activation;
    neurons[name].activation = a < 0 ? 0 : a > 1 ? 1 : a;
}
```

Mantiene l'attivazione in $[0, 1]$. I pesi negativi dei neuroni GABAergici possono portare l'input sotto zero, che il clamp azzera.

---

## Output Locomotorio (`getWaveParams`)

Dopo ogni step vengono letti i valori medi di attivazione di tre gruppi di neuroni:

$$\text{forwardDrive} = \frac{1}{4}(\text{AVBL} + \text{AVBR} + \text{PVCL} + \text{PVCR})$$

$$\text{backwardDrive} = \frac{1}{6}(\text{AVAL} + \text{AVAR} + \text{AVDL} + \text{AVDR} + \text{AVEL} + \text{AVER})$$

$$\text{motorActivity} = \text{mean}(\text{DB01–DB07},\ \text{VB01–VB11},\ \text{DA01–DA09},\ \text{VA01–VA12})$$

```javascript
// src/connectome.js — getWaveParams
const direction   = forwardDrive >= backwardDrive ? 1 : -1;
const amplitude   = motorActivity;
const freqTime    = direction * (0.5 + motorActivity * 2);
return { direction, amplitude, freqTime };
```

- `direction` = +1 avanti, −1 indietro
- `amplitude` ∈ [0,1]: scala l'ampiezza visiva dell'onda
- `freqTime`: velocità dell'onda per lo shader; il termine costante 0.5 garantisce movimento minimo anche con poca attività motoria

---

## Parametri della Simulazione

| Parametro | Valore | Effetto |
|---|---|---|
| `THRESHOLD` | 0.1 | Soglia di spike: neuroni sotto questa attivazione non propagano segnale |
| `WEIGHT_SCALE` | 0.02 | Normalizza i pesi grezzi del CSV (range 1–100+) in input ragionevoli |
| `TAU` | 0.1 s | Costante di tempo del leaky integrator: decay a zero in ~0.1 s senza input |
| Baseline forward | 0.5 | Drive costante che mantiene il verme in avanzamento per default |
| Guadagno luce | 1.5 | Amplifica l'effetto della luce sul circuito backward |

---

## Performance

Con 448 neuroni e 7378 sinapsi, il loop di propagazione è il collo di bottiglia. Usando la `adjacencyMap` e saltando i neuroni sotto soglia (`activation <= THRESHOLD`), tipicamente solo 20–80 neuroni propagano per frame, riducendo il lavoro di circa 10× rispetto a iterare tutte le sinapsi. Con 10 vermi attivi si eseguono ~80 × 10 = 800 lookup per frame, trascurabile rispetto al rendering.
