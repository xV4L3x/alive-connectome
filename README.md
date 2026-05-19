# Alive Connectome

Exam project for the Computer Graphics course — Master's Degree in Computer Science, University of Bologna.

## Overview

A virtual ecosystem inhabited by specimens of the nematode *C. elegans*, whose locomotor behavior is entirely driven by a simulation of the worm's real synaptic connections, sourced from the [OpenWorm](https://openworm.org) project. Worms move autonomously based on their neural network activity, reacting to environmental stimuli such as light and temperature.

## Libraries

Provided by the professor — no external dependencies:

- `m4.js` — 4×4 matrix math (transformations, perspective, lookAt)
- `webgl-utils.js` — WebGL utilities
- `gl-matrix.js` — linear algebra
- `dat.gui.js` — GUI control panel

## Implementation

### Base Rendering
- OBJ model loading and parsing (positions, normals, per-material colors)
- MTL parsing for diffuse material colors (`Hypodermis`, `Generic_Transparency`)
- Per-vertex color attribute passed through vertex → fragment shader
- MVP matrix pipeline (Model / View / Projection) for correct 3D perspective

### Phong Lighting Model

Each fragment is shaded using the Phong reflection model, composed of three terms:

$$I = I_a + I_d + I_s$$

**Ambient** — constant base light, independent of surface orientation:

$$I_a = k_a \cdot c_{object}$$

```glsl
vec3 ambient = ambientStrength * v_color.rgb;
```

**Diffuse** — depends on the angle between the surface normal $\mathbf{N}$ and the light direction $\mathbf{L}$:

$$I_d = \max(\mathbf{N} \cdot \mathbf{L},\ 0) \cdot c_{object}$$

```glsl
float diff = max(dot(normal, lightDir), 0.0);
vec3 diffuse = diff * v_color.rgb;
```

The `max(..., 0.0)` clamps negative values (back-facing surfaces receive no diffuse light).

**Specular** — models the bright highlight. $\mathbf{R}$ is the reflection of $-\mathbf{L}$ around $\mathbf{N}$, $\mathbf{V}$ is the direction toward the camera, and $n$ is the shininess exponent:

$$I_s = k_s \cdot \max(\mathbf{R} \cdot \mathbf{V},\ 0)^{n}$$

$$\mathbf{R} = \text{reflect}(-\mathbf{L},\ \mathbf{N}) = 2(\mathbf{N} \cdot \mathbf{L})\mathbf{N} - \mathbf{L}$$

```glsl
vec3 reflectDir = reflect(-lightDir, normal);
float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
vec3 specular = specularStrength * spec * vec3(1.0);
```

Higher shininess $n$ produces a smaller, sharper highlight. The specular color is white regardless of the object color, simulating a physical surface gloss.

**Normal transformation** — normals must be transformed to world space using only the rotational part of the model matrix (upper-left 3×3), since translations do not affect directions:

```glsl
v_normal = mat3(u_modelMatrix) * a_normal;
```

### Camera Orbitale

La camera ruota attorno al target (il verme) usando **coordinate sferiche**. La posizione della camera è descritta da tre parametri:

- $\phi$ (`azimuth`) — angolo orizzontale, aggiornato dal drag orizzontale del mouse
- $\theta$ (`elevation`) — angolo verticale, aggiornato dal drag verticale del mouse
- $r$ (`distance`) — distanza dal target, aggiornata dalla rotella del mouse

La conversione da coordinate sferiche a cartesiane:

$$x = r \cdot \cos\theta \cdot \sin\phi$$
$$y = r \cdot \sin\theta$$
$$z = r \cdot \cos\theta \cdot \cos\phi$$

```javascript
const x = camera.distance * Math.cos(camera.elevation) * Math.sin(camera.azimuth);
const y = camera.distance * Math.sin(camera.elevation);
const z = camera.distance * Math.cos(camera.elevation) * Math.cos(camera.azimuth);
```

La view matrix è l'inversa della `lookAt(eye, target, up)`, ricalcolata ogni frame con la nuova posizione `eye`.

L'elevation è vincolata all'intervallo $\left(-\frac{\pi}{2} + \varepsilon,\ \frac{\pi}{2} - \varepsilon\right)$ per evitare singolarità ai poli, dove `lookAt` diventa instabile (il vettore `up` e la direzione di vista diventano paralleli).

**Vincolo piano pavimento:**

La camera non può scendere sotto il pavimento della stanza (Y = $-H_{cabinet}$). Il vincolo è calcolato dinamicamente invertendo la formula delle coordinate sferiche per l'asse Y:

$$y_{eye} = t_y + r \cdot \sin\theta \geq -H_{cabinet} + \varepsilon$$

Risolvendo per $\theta$:

$$\theta_{min} = \arcsin\!\left(\text{clamp}\!\left(\frac{-H_{cabinet} + \varepsilon - t_y}{r},\ -1,\ 1\right)\right)$$

dove $\varepsilon = 0.5$ è un margine di sicurezza, $t_y$ la componente Y del target e $r$ la distanza corrente. Il `clamp` su $[-1, 1]$ è necessario perché $\arcsin$ è definita solo in quell'intervallo — senza di esso, se la camera fosse molto vicina al target, il rapporto potrebbe uscire dal dominio. Clampare $\theta$ prima di chiamare `computeEye` preserva la distanza $r$ intatta: la camera si ferma al livello del pavimento senza avvicinarsi al target.

### Modalità Camera

Quando un verme è selezionato, il pannello di selezione espone il bottone **Change View** che cicla tra tre modalità:

| Valore | Modalità | Descrizione |
|---|---|---|
| `0` | Free Camera | Vista orbitale predefinita, controlli mouse abilitati |
| `1` | Third Person | Camera dietro e sopra il verme selezionato, controlli disabilitati |
| `2` | First Person | Camera agli occhi del verme, guarda nella direzione di marcia, controlli disabilitati |

La modalità corrente è visualizzata nel pannello principale (voce **Camera**). Quando il verme viene deselezionato o ucciso, la modalità torna automaticamente a `0`.

**Disabilitazione dei controlli:** `setupCameraControls` riceve una funzione `getEnabled` che viene interrogata a ogni evento mouse. I listener di `mousemove` e `wheel` eseguono un early return se `getEnabled()` ritorna `false`, così i controlli smettono di funzionare nelle modalità 1 e 2 senza rimuovere i listener.

**Terza persona — `computeThirdPerson(worm)`:**

Il vettore forward è $\mathbf{f} = (\sin h,\ 0,\ \cos h)$ dove $h$ è l'heading del verme (la stessa formula usata per il movimento). La camera si posiziona arretrando lungo $-\mathbf{f}$ e salendo sull'asse Y:

$$\mathbf{eye} = \mathbf{p}_{verme} - \mathbf{f} \cdot d_{back} + (0,\ h_{up},\ 0)$$
$$\mathbf{target} = \mathbf{p}_{verme} + (0,\ 1,\ 0)$$

con $d_{back} = 5$ unità dietro e $h_{up} = 3$ unità sopra (calibrabili visivamente). Il target è il centro del verme leggermente sollevato per evitare di puntare al pavimento.

**Prima persona — `computeFirstPerson(worm)`:**

L'occhio è posizionato davanti al verme (sommando $+\mathbf{f}$ invece di sottrarlo) ad altezza testa. Il punto di mira è 5 unità più avanti nella stessa direzione, alla stessa altezza:

$$\mathbf{eye} = \mathbf{p}_{verme} + \mathbf{f} \cdot d_{head} + (0,\ h_{eye},\ 0)$$
$$\mathbf{target} = \mathbf{eye} + \mathbf{f} \cdot 5$$

con $d_{head} = 1.5$ e $h_{eye} = 1.0$. La camera segue heading e posizione del verme ogni frame, ruotando con lui.

### Connectome — Motore Neurale
  
Il comportamento locomotorio è guidato da una simulazione della rete sinaptica reale del *C. elegans*, caricata dal dataset OpenWorm (`herm_full_edgelist.csv`, 7378 sinapsi,
448 neuroni).

#### Struttura dati

Ogni neurone ha due campi:
- `activation` ∈ [0, 1] — livello di attivazione corrente
- `spiked` — flag booleano, vero se ha superato la soglia nel frame corrente

Le connessioni sono pre-calcolate in una `adjacencyMap`: un dizionario `nome → [{target, weight}]` costruito al caricamento. Iterare solo i neuroni che fanno spike
(tipicamente 20–80 su 448) riduce il lavoro di circa 10×.

#### Neuroni inibitori (GABAergici)

I motoneuroni **DD01–DD06** e **VD01–VD13** sono *reciprocal inhibitors*: quando i muscoli dorsali si contraggono, i DD inibiscono quelli ventrali, e viceversa. Senza questa
inibizione reciproca, dorso e ventre si contraggono insieme e non si produce alcuna onda locomotoria. Implementazione: i pesi delle sinapsi uscenti da questi neuroni vengono
negati durante la costruzione dell'`adjacencyMap`.

#### Loop di simulazione (`step`)

Ogni frame esegue 4 fasi in sequenza:

1. **Reset spike** — `spiked = false` su tutti i neuroni
2. **Iniezione stimoli** — gli interneuroni di comando vengono sovrascritti direttamente con i valori degli stimoli (vedi sezione Stimoli). Questi neuroni vengono esclusi dal leaky integrator al passo 3.
3. **Propagazione + leaky integrator** — calcolo dell'input sinaptico accumulato per ogni neurone:

$$\text{input}[j] \mathrel{+}= a_i \cdot w_{ij} \cdot s \quad \forall\, i : a_i > \theta$$

Poi aggiornamento con equazione differenziale discreta (**leaky integrator**):

$$\Delta a_j = \frac{\Delta t}{\tau} \cdot \bigl(-a_j + \text{input}[j]\bigr)$$

Il termine $-a_j$ è la forza di ripristino: porta ogni neurone verso il proprio input di equilibrio $a_{\text{eq}} = \text{input}[j]$, prevenendo la saturazione a cascata tipica del modello a decay moltiplicativo.

4. **Clamp** — $a \leftarrow \text{clamp}(a,\ 0,\ 1)$

Parametri: soglia $\theta = 0.1$, costante di tempo $\tau = 0.1\,\text{s}$, scala pesi $s = 0.02$.

**Perché il leaky integrator invece del decay moltiplicativo:**
Il modello originale usava $a \leftarrow a \cdot D$ (decay). Il connectome del *C. elegans* ha centinaia di connessioni eccitatorie ricorrenti: con quel modello il segnale si auto-amplificava saturando tutti i neuroni indipendentemente dagli stimoli. Il leaky integrator stabilizza la rete — neuroni non stimolati decadono a zero, la saturazione avviene solo dove il segnale sinaptico è genuinamente alto.

#### Output locomotorio (`getWaveParams`)

Dopo ogni step, tre valori vengono estratti per lo shader:

$$\text{forwardDrive} = \text{mean}(\text{AVBL, AVBR, PVCL, PVCR})$$
$$\text{backwardDrive} = \text{mean}(\text{AVAL, AVAR, AVDL, AVDR, AVEL, AVER})$$
$$\text{motorActivity} = \text{mean}(\text{DB01–DB07, VB01–VB11, DA01–DA09, VA01–VA12})$$

$$\text{direction} = \text{sign}(\text{forwardDrive} - \text{backwardDrive})$$
$$\text{amplitude} = \text{motorActivity}$$
$$\text{freqTime} = \text{direction} \times (0.5 + \text{motorActivity} \times 2)$$

`freqTime` con segno positivo produce un'onda da testa a coda (verme avanza); negativo la inverte. `0.5` implica movimento minimo costante

### Collegamento Connectome → Shader 

Ogni frame, prima del disegno, il loop di render:

1. Calcola `deltaTime` dalla differenza tra timestamp RAF consecutivi
2. Chiama `Connectome.step(deltaTime)` per far avanzare la simulazione neurale
3. Legge `Connectome.getWaveParams()` → `{ amplitude, freqTime }`
4. Passa i valori alla GPU come uniform float

Le uniform passate allo shader ogni frame:

| Uniform | Valore | Significato |
|---|---|---|
| `u_amplitude` | `amplitude * 0.5` | Ampiezza visiva scalata |
| `u_freqTime` | `freqTime` | Velocità temporale onda (segno = direzione) |
| `u_freqSpace` | `6.28` (costante) | Frequenza spaziale (~1 onda sul corpo) |
| `u_time` | tempo cumulativo in secondi | Variabile temporale per il seno |
| `u_bodyMin`, `u_bodyMax` | range Z del modello | Estensione del corpo per normalizzare `s` |


### Pannello di Controllo e Stimoli Ambientali

Un pannello `dat.GUI` espone gli slider in tempo reale. I valori vengono passati a `Connectome.updateStimuli()` ogni frame prima di `step()`.

| Stimolo | Sorgente | Neuroni target |
|---|---|---|
| Luce | calcolata per-verme da `Lights.computeAt()` | AVAL, AVAR, AVDL, AVDR (backward — contributo lineare: `activation += light × 1.5`) |
| Temperatura | slider globale [0, 1] | AFDL, AFDR |
| Fame | stato interno per-verme `wormInstance.hunger` | AWAL, AWAR, ADFL, ADFR |

La luce non è più uno slider globale: ogni verme riceve un valore di luce diverso in base alla propria posizione nella teca e alle intensità correnti dei 4 faretti (vedi sezione Sistema di Illuminazione Multi-Luce — `computeAt`).

**Modello di stimolazione continua:**
L'iniezione degli interneuroni di comando usa un modello **lineare continuo**, senza soglie if/else, per evitare le oscillazioni discontinue del modello precedente:

- I neuroni **forward** (AVBL, AVBR, PVCL, PVCR) ricevono una baseline costante = **0.5** — il verme esplora in avanti per default anche al buio.
- I neuroni **backward** (AVAL, AVAR, AVDL, AVDR) ricevono un contributo lineare proporzionale alla luce: `activation += light × 1.5`.

La soglia naturale di inversione si trova a `light ≈ 0.33` (quando il backward drive supera la baseline 0.5 forward). Non esiste discontinuità: a `light = 0.4` il backward drive è 0.6 > 0.5, a `light = 0.32` è 0.48 < 0.5. La vecchia formula if/else a `light = 0.5` produceva un salto istantaneo da AVB a AVA, causando oscillazione frame-per-frame.

**Calcolo ponderato della direzione:**
La direzione del movimento non è determinata da un singolo stimolo, ma dalla combinazione dell'attività neurale degli interneuroni di comando con un eventuale bias da collisione:

$$\text{forwardDrive} = \frac{1}{4}(\text{AVBL} + \text{AVBR} + \text{PVCL} + \text{PVCR}) + \text{touchForward} + \text{hungerDrive} \cdot k_{hf}$$
$$\text{backwardDrive} = \frac{1}{4}(\text{AVAL} + \text{AVAR} + \text{AVDL} + \text{AVDR}) + \text{touchBackward}$$

La decisione finale non usa un if/else istantaneo ma applica una **deadband** e un **filtro passa-basso**:

$$\text{driveDiff} = \text{forwardDrive} - \text{backwardDrive}$$
$$\text{rawDirection} = \begin{cases} +1 & \text{se driveDiff} \geq -\delta \\ -1 & \text{altrimenti} \end{cases} \qquad \delta = \text{DIRECTION\_DEADBAND} = 0.15$$

La deadband fa sì che il verme rimanga forward finché il backward drive non supera il forward di almeno 0.15 — piccole fluttuazioni non causano inversioni. Il segnale grezzo viene poi smorzato con un filtro passa-basso a tempo continuo:

$$\dot{d}_{smooth} = \lambda \cdot (\text{rawDirection} - d_{smooth}) \qquad \lambda = 5.0\ \text{s}^{-1}$$

Il `direction` effettivo usato dal codice è `sign(directionSmooth)`. Il filtro garantisce che il verme non cambi marcia istantaneamente tra frame consecutivi — la transizione impiega ~0.2 s.

Il bias da collisione (`touchForward` / `touchBackward`) è un impulso esterno al connectome, attivato dal rilevamento di una collisione e descritto nella sezione Movimento del Verme.

**Hunger forward bias** — quando `hunger > 0.5`, la fame aggiunge un contributo extra al `forwardDrive`:

$$\text{hungerDrive} = \begin{cases} (\text{hunger} - 0.5) \cdot 2 & \text{se hunger} > 0.5 \\ 0 & \text{altrimenti} \end{cases}$$

con $k_{hf}$ = `HUNGER_FORWARD_STRENGTH = 3.0`. A `hunger = 1.0` il bias vale 3.0, sufficiente a sovrastare qualsiasi `backwardDrive` (massimo ~1.0 dal connectome). Questo garantisce che un verme affamato avanzi sempre verso il cibo indipendentemente dalla luce. La fame ha priorità sulla fotofobia.

Il comportamento osservabile:

$$\text{luce} > 0.33,\ \text{hunger} < 0.5 \Rightarrow \text{backward drive} > 0.5 \Rightarrow \text{verme tende ad arretrare (allontanandosi dalla luce)}$$
$$\text{luce} \leq 0.33,\ \text{hunger} < 0.5 \Rightarrow \text{forward baseline domina} \Rightarrow \text{verme esplora avanti}$$
$$\text{hunger} > 0.5 \Rightarrow \text{hungerDrive sovrasta backward drive} \Rightarrow \text{verme avanza verso il cibo}$$

### Movimento del Verme

`updateWorm(wormInstance, deltaTime, stimuli)` è chiamata ogni frame per ogni verme. La funzione aggiorna la simulazione neurale, calcola velocità e direzione, fa avanzare la posizione e gestisce le collisioni con le pareti.

**Fisica della velocità:**

La velocità è uno scalare aggiornato con attrito (stile "Car Project"):

$$v_{target} = A \cdot v_{max} \cdot \text{direction}$$
$$v \mathrel{+}= (v_{target} - v) \cdot f \cdot \Delta t$$

dove $A$ = `amplitude` dal connectome ∈ [0,1], $v_{max}$ = `MAX_SPEED = 2.0` unità/s, $f$ = `FRICTION = 2.0`. Valori alti di $f$ producono risposta immediata; valori bassi inerzia. Il segno di `direction` inverte la velocità: un valore negativo significa movimento all'indietro.

**Strategia run + pirouette:**

Il *C. elegans* esplora con lunghi tratti dritti interrotti da rotazioni casuali (*pirouette*). Un timer per ogni istanza conta il tempo: ogni 3–8 secondi viene estratto un nuovo `targetHeading` con uno scarto casuale di ±π/2 rispetto all'heading corrente. L'heading ruota gradualmente verso il target a velocità massima `TURN_SPEED = 0.5` rad/s:

```javascript
pirouetteTimer -= deltaTime;
if (pirouetteTimer <= 0) {
    targetHeading = heading + (Math.random() - 0.5) * Math.PI;
    pirouetteTimer = PIROUETTE_MIN + Math.random() * (PIROUETTE_MAX - PIROUETTE_MIN);
}
let diff = targetHeading - heading;
// normalizza in [-π, π] per evitare rotazioni nel verso sbagliato
while (diff >  Math.PI) diff -= 2 * Math.PI;
while (diff < -Math.PI) diff += 2 * Math.PI;
heading += Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * deltaTime);
```

**Aggiornamento posizione:**

Il verme si muove nel piano XZ. L'asse del corpo del modello OBJ è Z; dopo la rotazione Y di `heading`, la direzione forward nel mondo è:

$$\Delta x = \sin(\text{heading}) \cdot v \cdot \Delta t$$
$$\Delta z = \cos(\text{heading}) \cdot v \cdot \Delta t$$

**Collisioni con le pareti:**

Le pareti della teca formano un AABB con semilati `TANK_WIDTH` e `TANK_DEPTH`. Ogni frame, la posizione viene bloccata entro i limiti con hitbox sferica di raggio `WORM_RADIUS = 0.8`:

$$x \leftarrow \text{clamp}(x,\ -W + r,\ W - r) \qquad z \leftarrow \text{clamp}(z,\ -D + r,\ D - r)$$

**Risposta alla collisione — touch bias:**

Quando il verme tocca una parete, vengono modificati `touchTimer` e `touchDirection` nell'istanza del verme — non direttamente i neuroni del connectome (che nel *C. elegans* reale si saturano a cascata per le connessioni ricorrenti). Il bias agisce esternamente nel calcolo della direzione:

```javascript
if (touchTimer > 0) {
    const intensity = (touchTimer / TOUCH_DURATION) * TOUCH_STRENGTH;
    if (touchDirection > 0) touchForward  = intensity;
    else                    touchBackward = intensity;
}
```

Con `TOUCH_STRENGTH = 4.0` e `TOUCH_DURATION = 1.5` s, il bias sovrasta temporaneamente il drive del connectome per circa un secondo e mezzo, forzando l'inversione di marcia prima che il timer scada.

**Omega turn — risposta all'urto frontale:**

La sola retromarcia non basta: senza cambiare direzione il verme tornerebbe contro la stessa parete. Come nel *C. elegans* reale, l'urto frontale innesca una sequenza a tre fasi stereotipata:

1. **Scatto immediato** — la velocità è impostata direttamente a `−MAX_SPEED`, bypassando il FRICTION. Produce una retromarcia istantanea di circa 1–2 lunghezze corporee.
2. **Rotazione acuta (omega turn)** — `targetHeading` viene spostato di un angolo casuale tra 90° e 180° in direzione casuale. Un timer `omegaTimer = OMEGA_DURATION` attiva la velocità di rotazione rapida `OMEGA_TURN_SPEED = 3.0` rad/s invece dei normali `TURN_SPEED = 0.5` rad/s.
3. **Ripresa in avanti** — una volta esaurito `omegaTimer`, il verme prosegue nella nuova direzione alla velocità normale.

```javascript
if (direction > 0) {                                              // urto frontale
    wormInstance.speed = -MAX_SPEED;
    const sign = Math.random() < 0.5 ? 1 : -1;
    wormInstance.targetHeading = wormInstance.heading
        + sign * (Math.PI * 0.5 + Math.random() * Math.PI * 0.5);
    wormInstance.omegaTimer = OMEGA_DURATION;
} else {                                                          // urto in coda
    wormInstance.speed = MAX_SPEED;
}
```

L'urto in coda produce solo lo scatto in avanti — biologicamente corrisponde all'attivazione di PLM → AVB senza coinvolgere il circuito RIM/SMD responsabile dell'omega turn.

**Transizione fluida dell'onda — `freqTimeSmooth`:**

`freqTime` dal connectome può cambiare segno bruscamente in un singolo frame (es. da +2 a −2 quando la direzione si inverte). Nello shader questo produrrebbe un salto discontinuo nell'animazione sinusoidale — l'onda teleporta invece di invertirsi gradualmente. Per evitarlo, `freqTime` non viene passato allo shader direttamente ma filtrato con lo stesso schema passa-basso:

$$\dot{f}_{smooth} = \lambda_f \cdot (\text{freqTime} - f_{smooth}) \qquad \lambda_f = 3.0\ \text{s}^{-1}$$

Lo shader riceve `freqTimeSmooth` al posto di `freqTime`. La transizione da avanti a indietro impiega ~0.3 s: l'onda rallenta attraverso zero, si ferma brevemente, poi riprende nell'altra direzione. Questo è anche biologicamente plausibile — il *C. elegans* non inverte l'onda istantaneamente.

**Collisioni verme-verme:**

Ogni coppia $(i, j)$ con $i < j$ viene testata ogni frame in `checkWormCollisions(worms)`, chiamata dopo aver aggiornato tutti i vermi e prima di disegnarli. L'ordine è importante: se aggiornamento e disegno fossero nello stesso loop, alcuni vermi verrebbero renderizzati prima che le collisioni siano risolte.

La sovrapposizione tra due bounding sphere è:

$$\text{overlap} = 2r - \|\mathbf{p}_A - \mathbf{p}_B\|_{XZ}$$

dove $r$ = `WORM_RADIUS = 0.8`. La distanza è calcolata solo nel piano XZ (i vermi si muovono sul piano orizzontale). Se $\text{overlap} > 0$ si eseguono due operazioni in parallelo nello stesso frame:

**1. Separazione fisica** — i due vermi vengono spostati in direzioni opposte di metà overlap ciascuno, lungo il vettore normalizzato che li separa:

$$\hat{n} = \frac{\mathbf{p}_A - \mathbf{p}_B}{\|\mathbf{p}_A - \mathbf{p}_B\|} \qquad \mathbf{p}_A \mathrel{+}= \hat{n} \cdot \frac{\text{overlap}}{2} \qquad \mathbf{p}_B \mathrel{-}= \hat{n} \cdot \frac{\text{overlap}}{2}$$

La normalizzazione divide `dx` e `dz` per la distanza, ottenendo un vettore di lunghezza 1 nella direzione giusta — moltiplicando poi per `overlap/2` si ottiene uno spostamento di esattamente quella grandezza indipendentemente da quanto i vermi siano lontani.

**2. Touch bias** — il segno di `speed` determina quale estremità ha urtato: se il verme stava andando avanti (`speed ≥ 0`), ha urtato con la testa e il bias lo spinge indietro; se stava andando indietro, ha urtato con la coda e il bias lo spinge avanti.

```javascript
const dirA = a.speed >= 0 ? 1 : -1;
a.touchTimer     = TOUCH_DURATION;
a.touchDirection = dirA > 0 ? -1 : 1;  // testa → indietro, coda → avanti
```

**Chemotassi — bias verso il cibo:**

Quando `stimuli.hunger > 0.5`, il verme percepisce i gradienti chimici del cibo e orienta il proprio movimento verso la fonte più vicina. Il bias si somma alla rotazione della pirouette ogni frame, senza sostituirla.

Ogni frame, dopo l'aggiornamento dell'heading da pirouette, viene calcolato l'angolo verso il cibo più vicino:

$$\text{angleToFood} = \text{atan2}(\Delta x,\ \Delta z)$$

L'uso di $\text{atan2}(\Delta x, \Delta z)$ — con $x$ come primo argomento — è coerente con la convenzione del sistema di movimento: $\text{heading} = 0$ corrisponde a $+Z$, e la posizione si aggiorna con $\Delta x = \sin(\text{heading}) \cdot v \cdot \Delta t$.

La differenza angolare viene normalizzata in $[-\pi, \pi]$ per garantire la rotazione nel verso più corto, e il contributo finale sull'heading è:

$$\text{bias} = (\text{hunger} - 0.5) \cdot 2 \qquad \in [0, 1]$$
$$\Delta\text{heading} = \text{foodDiff} \cdot \text{bias} \cdot k_f \cdot \Delta t$$

dove $k_f$ = `FOOD_TURN_STRENGTH = 3.5`. Il coefficiente `(hunger − 0.5) × 2` vale 0 esattamente a hunger=0.5 e 1 a hunger=1.0 — sotto la soglia il bias è assente, sopra cresce linearmente.

**Fotofobia — fuga dalla luce:**

Il *C. elegans* è fortemente fotofobico: la luce è percepita come stimolo nocicettivo e innesca una risposta di fuga. Nella simulazione questo si traduce in un bias direzionale sull'heading, indipendente dal circuito AVA/AVB.

`Lights.computeDirectionAt(position)` restituisce il vettore unitario nel piano XZ che punta dal verme verso il baricentro luminoso ponderato:

$$\mathbf{d}_{luce} = \text{normalize}\!\left(\sum_{i=0}^{3} \frac{I_i}{1 + k \cdot d_i^2} \cdot (\mathbf{L}_i - \mathbf{p})_{XZ}\right)$$

La direzione di fuga è l'opposto: $\mathbf{d}_{fuga} = -\mathbf{d}_{luce}$. Il bias sull'heading usa la stessa convenzione `atan2(x, z)` della chemotassi, con intensità proporzionale alla luce locale:

$$\Delta\text{heading} = \text{lightDiff} \cdot \text{localLight} \cdot k_{fl} \cdot \text{lightFleeScale} \cdot \Delta t$$

con $k_{fl}$ = `LIGHT_FLEE_STRENGTH = 1.2`. In piena luce il verme gira rapidamente verso l'ombra; in penombra la correzione è quasi nulla. La soglia `localLight > 0.05` evita di calcolare direzioni spurie quando è quasi buio.

**fleeMult — inversione della fuga in retromarcia:** quando il verme si muove all'indietro (`direction < 0`), l'heading punta nella direzione opposta alla direzione di moto. Fuggire dalla luce girando *l'heading* nella direzione opposta alla luce significherebbe in realtà *avanzare* verso di essa. Il fattore `fleeMult = direction > 0 ? -1 : 1` inverte il vettore di fuga quando il verme è in retromarcia, garantendo che il moto risultante porti sempre allontanandosi dalla sorgente.

**lightFleeScale — sopravvivenza prima della fotofobia:** quando la fame sale sopra 0.5, la scala della fuga decresce linearmente fino a zero a `hunger = 1.0`:

$$\text{lightFleeScale} = 1 - \max(0,\ (\text{hunger} - 0.5) \cdot 2) \in [0, 1]$$

Un verme sull'orlo della morte ignora completamente la luce per raggiungere il cibo — biologicamente: la sopravvivenza immediata supera il riflesso di fuga.

```javascript
if (localLight > 0.05) {
    const lightDir = Lights.computeDirectionAt(wormInstance.position);
    const fleeMult = direction > 0 ? -1 : 1;
    const fleeAngle = Math.atan2(fleeMult * lightDir[0], fleeMult * lightDir[2]);
    let lightDiff = fleeAngle - wormInstance.heading;
    while (lightDiff >  Math.PI) lightDiff -= 2 * Math.PI;
    while (lightDiff < -Math.PI) lightDiff += 2 * Math.PI;
    const lightFleeScale = 1.0 - Math.max(0, (wormInstance.hunger - 0.5) * 2);
    wormInstance.heading += lightDiff * localLight * LIGHT_FLEE_STRENGTH * lightFleeScale * deltaTime;
}
```

### Oggetti Cibo

Il cibo è rappresentato come colonie batteriche piatte sul terreno — dischi procedurali rossi semitrasparenti. Ogni istanza ha:

```javascript
{ position: [x, y, z], nutrients: 0.3..1.0 }
```

**Geometria:** un ventaglio di `FOOD_SIDES = 20` triangoli dal centro. Per ogni spicchio $i$:

$$\theta_1 = \frac{i}{N} 2\pi \qquad \theta_2 = \frac{i+1}{N} 2\pi$$

I vertici del triangolo sono il centro $(0,0,0)$ e i due punti sul bordo $(r\cos\theta,\ 0,\ r\sin\theta)$. Tutti a Y=0 nello spazio modello — il disco è naturalmente orizzontale.

**Scala dinamica:** il disco si restringe con `nutrients`. La model matrix applica uno scaling uniforme su X e Z:

$$\mathbf{M} = \mathbf{T}(x, y, z) \cdot \mathbf{S}(\text{nutrients},\ 1,\ \text{nutrients})$$

Quando `nutrients = 1.0` il disco ha raggio massimo `FOOD_RADIUS = 0.4`; quando si azzera il disco scompare.

**Illuminazione Phong:** la normale è hardcoded nel fragment shader come $(0, 1, 0)$ — il disco è sempre orizzontale e non ha rotazioni, quindi non serve un buffer di normali. Il calcolo diffuse + specular usa le stesse 4 luci dei vermi.

**Trasparenza:** il disco è disegnato con alpha blending (`u_alpha = 0.75`) e `depthMask(false)` durante il draw, riabilitato subito dopo. Questo evita che il disco occluda oggetti dietro di sé nel depth buffer. Il cibo viene renderizzato **dopo tutti gli oggetti opachi** (vermi, piano, teca) per rispettare l'ordinamento corretto della trasparenza.

**Z-offset:** il disco è posizionato a Y=0.01 invece di Y=0 per evitare z-fighting con il terreno — senza questo offset il depth buffer non sa quale superficie disegnare sopra e produce flickering.

### Sistema di Fame Progressiva

Ogni verme tiene uno stato interno di fame indipendente dagli altri, distinto dal segnale sensoriale passato al connectome:

- `wormInstance.hunger` ∈ [0, 1] — riserva energetica interna: 0 = sazio, 1 = morte imminente
- `stimuli.hunger` — segnale chimico che arriva ai neuroni AWAL/AWAR/ADFL/ADFR: codifica quanto cibo è percepito nell'ambiente

La separazione è deliberata: un verme molto affamato è più reattivo ai gradienti chimici del cibo (chemotassi più aggressiva), ma la fame interna e il segnale sensoriale crescono con logiche diverse.

**Aggiornamento della fame ogni frame:**

$$\text{hunger} \leftarrow \min\!\left(1,\ \text{hunger} + k_h \cdot \Delta t\right)$$

con $k_h$ = `HUNGER_RATE = 0.02` s⁻¹. In assenza di cibo il verme raggiunge hunger = 1 in circa 50 secondi.

**Iniezione nel connectome:**

La fame interna di ogni verme viene fusa con gli stimoli ambientali globali (luce, temperatura) prima di essere passata al connectome:

```javascript
const localLight = Lights.computeAt(wormInstance.position);
wormInstance.connectome.updateStimuli({
    light:  localLight,
    temp:   stimuli.temp,
    hunger: wormInstance.hunger
});
```

I tre stimoli hanno sorgenti distinte: `light` è calcolata per-verme dalla posizione nella teca, `temp` è globale (slider del pannello, uguale per tutti), `hunger` è locale (stato interno indipendente per ogni verme). Questo significa che due vermi vicini ma sotto faretti diversi ricevono stimoli di luce diversi, producendo comportamenti diversificati nonostante lo stesso ambiente.

**Soglia chemotassi e mangiare:**

Quando `hunger > 0.5`, ogni frame viene cercato il cibo più vicino. Il blocco fa due cose indipendenti:

1. **Mangiare** — se il cibo più vicino è entro `EAT_RADIUS = 0.8` (uguale al raggio del hitbox), il verme mangia:

$$\text{hunger} \leftarrow \max(0,\ \text{hunger} - k_e \cdot \Delta t)$$
$$\text{nutrients} \leftarrow \max(0,\ \text{nutrients} - k_c \cdot \Delta t)$$

con $k_e$ = `EAT_RATE = 0.10` s⁻¹ e $k_c$ = `CONSUME_RATE = 0.02` s⁻¹. Mangiando, la fame cala con netto $-0.08$ s⁻¹ (EAT_RATE − HUNGER_RATE), quindi il verme si sazia da 1.0 a 0 in circa 12 secondi di mangiata continua. Un disco pieno dura ~50 secondi con un verme solo.

Se più vermi mangiano lo stesso disco simultaneamente, ogni verme applica la propria riduzione di `nutrients` indipendentemente — con $N$ vermi il cibo si esaurisce $N$ volte più velocemente, emergendo naturalmente senza logica aggiuntiva.

2. **Chemotassi** — il bias direzionale verso il cibo si applica sempre (quando `hunger > 0.5`), indipendentemente dalla distanza. Il coefficiente di intensità vale:

$$\text{bias} = (\text{hunger} - 0.5) \cdot 2 \in [0,\ 1]$$

Sotto la soglia il verme esplora casualmente; sopra vira progressivamente verso la fonte più vicina.

**Rimozione cibo esaurito:**

Ogni frame, dopo aver aggiornato tutti i vermi, i cibi con `nutrients <= 0` vengono rimossi dall'array `foods`. L'iterazione avviene al contrario per evitare che `splice` sposti gli indici degli elementi non ancora controllati:

```javascript
for (let i = foods.length - 1; i >= 0; i--) {
    if (foods[i].nutrients <= 0) foods.splice(i, 1);
}
```

### Morte del Verme

Due cause di morte distinte:

**Morte per inedia** — quando `hunger >= 1.0`, il flag `alive` viene impostato a `false` alla fine di `updateWorm`. Il frame successivo, il loop di pulizia rimuove il verme dall'array:

```javascript
for (let i = worms.length - 1; i >= 0; i--) {
    if (!worms[i].alive) {
        if (worms[i] === selectedWorm) { selectedWorm = null; rebuildSelectionGui(); }
        worms.splice(i, 1);
    }
}
```

Se il verme che muore è quello selezionato, il pannello di selezione viene chiuso prima della rimozione — altrimenti rimarrebbe un riferimento pendente a un oggetto non più in scena.

**Kill manuale** — il pannello di selezione espone un bottone "Kill Worm" che imposta `alive = false` e azzera la selezione immediatamente. La rimozione dall'array avviene al frame successivo tramite lo stesso loop di pulizia.

---

### Selezione Verme con Ray Casting

Per selezionare un verme con il mouse si costruisce un raggio nel spazio 3D partendo dalle coordinate del mouse sullo schermo, e si testa l'intersezione con la bounding sphere di ogni verme.

**1. Conversione da pixel a NDC (Normalized Device Coordinates)**

Le coordinate del mouse $\bigl(x_m,\ y_m\bigr)$ in pixel vengono convertite nel sistema NDC $[-1, 1]^2$:

$$x_{NDC} = \frac{x_m}{w_{canvas}} \cdot 2 - 1$$

$$y_{NDC} = -\!\left(\frac{y_m}{h_{canvas}} \cdot 2 - 1\right)$$

L'asse Y è invertito perché nel DOM le coordinate crescono verso il basso, mentre in NDC (e OpenGL) crescono verso l'alto.

**2. Unprojection — da NDC a spazio mondo**

La pipeline di rendering trasforma i punti mondo → clip → NDC tramite la matrice $\mathbf{VP} = \mathbf{P} \cdot \mathbf{V}$. Per costruire il raggio è necessario fare l'operazione inversa. Dato un punto in coordinate omogenee NDC:

$$\mathbf{p}_{clip} = \begin{pmatrix} x_{NDC} \\ y_{NDC} \\ z_{NDC} \\ 1 \end{pmatrix}$$

la sua posizione nel spazio mondo si ottiene applicando la matrice inversa $\mathbf{VP}^{-1}$ e dividendo per la componente $w$ (divisione prospettica inversa):

$$\tilde{\mathbf{p}}_{world} = \mathbf{VP}^{-1} \cdot \mathbf{p}_{clip} = \begin{pmatrix} \tilde{x} \\ \tilde{y} \\ \tilde{z} \\ \tilde{w} \end{pmatrix} \qquad \Rightarrow \qquad \mathbf{p}_{world} = \begin{pmatrix} \tilde{x}/\tilde{w} \\ \tilde{y}/\tilde{w} \\ \tilde{z}/\tilde{w} \end{pmatrix}$$

La matrice $\mathbf{VP}^{-1}$ è calcolata una sola volta per frame con `m4.inverse(viewProjectionMatrix)`. La moltiplicazione è eseguita in forma espansa per rispettare il layout column-major di WebGL:

```javascript
function unproject(z) {
    const v = [ndcX, ndcY, z, 1.0];
    const x = M[0]*v[0] + M[4]*v[1] + M[8] *v[2] + M[12]*v[3];
    const y = M[1]*v[0] + M[5]*v[1] + M[9] *v[2] + M[13]*v[3];
    const z2= M[2]*v[0] + M[6]*v[1] + M[10]*v[2] + M[14]*v[3];
    const w = M[3]*v[0] + M[7]*v[1] + M[11]*v[2] + M[15]*v[3];
    return [x/w, y/w, z2/w];
}
```

**3. Costruzione del raggio**

Il raggio è definito da due punti sul frustum: il piano vicino ($z_{NDC} = -1$) e il piano lontano ($z_{NDC} = +1$):

$$\mathbf{o} = \text{unproject}(-1) \qquad \mathbf{f} = \text{unproject}(+1)$$

La direzione normalizzata del raggio è:

$$\mathbf{d} = \frac{\mathbf{f} - \mathbf{o}}{\|\mathbf{f} - \mathbf{o}\|}$$

Il raggio è quindi $\mathbf{r}(t) = \mathbf{o} + t\mathbf{d}$ con $t \geq 0$.

**4. Test di intersezione raggio-sfera**

Per ogni verme si definisce una bounding sphere con centro $\mathbf{c}$ e raggio $R = 1.2$. Il centro è spostato verso l'alto rispetto alla posizione del verme per coprire meglio il corpo (che si estende in altezza):

$$\mathbf{c} = \bigl(p_x,\ p_y + 1.0,\ p_z\bigr)$$

L'intersezione si ricava sostituendo l'equazione del raggio nell'equazione della sfera $|\mathbf{r}(t) - \mathbf{c}|^2 = R^2$:

$$|(\mathbf{o} - \mathbf{c}) + t\mathbf{d}|^2 = R^2$$

Espandendo, con $\mathbf{oc} = \mathbf{o} - \mathbf{c}$:

$$t^2\underbrace{|\mathbf{d}|^2}_{=1} + 2t\,(\mathbf{d} \cdot \mathbf{oc}) + |\mathbf{oc}|^2 - R^2 = 0$$

Poiché $\mathbf{d}$ è normalizzato $|\mathbf{d}|^2 = 1$, si ottiene un'equazione di secondo grado in $t$:

$$t^2 + 2bt + c = 0 \qquad \text{con } b = \mathbf{d} \cdot \mathbf{oc},\ c = |\mathbf{oc}|^2 - R^2$$

Il discriminante (diviso per 4) è:

$$\Delta = b^2 - c$$

- $\Delta < 0$: nessuna intersezione (raggio passa fuori dalla sfera)
- $\Delta \geq 0$: il raggio colpisce la sfera

Le soluzioni sarebbero $t_{1,2} = -b \pm \sqrt{\Delta}$, ma per il picking basta verificare il segno di $\Delta$ — non serve calcolare i punti di intersezione effettivi.

```javascript
function raySphereIntersect(ray, center, radius) {
    const ox = ray.origin[0] - center[0];
    const oy = ray.origin[1] - center[1];
    const oz = ray.origin[2] - center[2];
    const b = ox*ray.dir[0] + oy*ray.dir[1] + oz*ray.dir[2];
    const c = ox*ox + oy*oy + oz*oz - radius*radius;
    return (b*b - c) >= 0;
}
```

**5. Selezione del verme più vicino**

Tra tutti i vermi la cui sfera interseca il raggio, viene scelto quello più vicino alla camera, confrontando le distanze quadrate (evita una radice quadrata per frame):

$$d^2 = (p_x - e_x)^2 + (p_z - e_z)^2$$

Il confronto avviene solo sul piano XZ perché i vermi si trovano tutti alla stessa altezza e la profondità verticale non è discriminante.

**6. Feedback visivo e selezione**

Il verme sotto il cursore (`hoveredWorm`) è evidenziato con un rendering arancione semitrasparente — implementato con un'unica uniform `u_isOutline` nel fragment shader, che bypassa il calcolo Phong e restituisce un colore fisso:

```glsl
if (u_isOutline > 0.5) {
    gl_FragColor = vec4(1.0, 0.5, 0.0, 0.65);
    return;
}
```

Il cursore cambia da freccia a puntatore (`cursor: pointer`) quando `hoveredWorm` è non nullo. Un click fissa la selezione su `selectedWorm` e apre il pannello laterale con l'attività neurale in tempo reale.

---

### Override Motorio — Thumbstick

Quando un verme è selezionato, il pannello laterale espone il bottone **Motor Override**. Attivandolo, il connectome viene bypassato completamente: i neuroni motori smettono di pilotare il verme e il controllo passa a un thumbstick virtuale visualizzato nella parte inferiore dello schermo.

**Interfaccia thumbstick:**

Il thumbstick è composto da due elementi HTML sovrapposti al canvas:

- `#thumbstick-base` — anello esterno fisso, definisce il raggio di movimento
- `#thumbstick-knob` — punto interno mobile, segue il dito/mouse entro il raggio

L'elemento usa `touch-action: none` per disabilitare lo scroll/zoom nativo del browser sul componente e `pointer-events: none` sul knob per far passare tutti gli eventi al base sottostante.

**Gestione eventi (Pointer Events API):**

I listener usano la Pointer Events API al posto dei Mouse Events per gestire mouse e touch con lo stesso codice:

- `pointerdown` sul base: registra il centro del base come origine del drag; determina la direzione committata (vedi sotto); applica l'input iniziale
- `pointermove` sul document: aggiorna posizione del knob e `overrideInput` finché `thumbstickActive` è `true`. Il listener è sul `document` (non sul base) per continuare a ricevere eventi anche quando il dito esce dall'elemento
- `pointerup` sul document: riporta il knob al centro, azzera `overrideInput`

**Clamping radiale:**

La posizione del knob viene limitata al raggio del base:

$$d = \sqrt{dx^2 + dy^2}$$

$$dx' = \begin{cases} dx & \text{se } d \leq r \\ dx \cdot r / d & \text{altrimenti} \end{cases}$$

L'input normalizzato scritto in `overrideInput` è:

$$ix = dx' / r \in [-1, 1] \qquad iz = -dy' / r \in [-1, 1]$$

Il segno negativo su $dy'$ converte le coordinate DOM (Y crescente verso il basso) in coordinate di movimento (Z positivo = avanti).

**Direzione committata (`overrideDir`):**

Per evitare che ruotare il thumbstick dalla metà superiore a quella inferiore inverta la direzione di marcia a metà gesture, la direzione viene fissata al momento del `pointerdown`:

$$\text{overrideDir} = \begin{cases} +1 & \text{se } iz \geq 0 \text{ (metà superiore = avanti)} \\ -1 & \text{se } iz < 0 \text{ (metà inferiore = indietro)} \end{cases}$$

Il campo `overrideDir` è scritto una sola volta per gesture e non viene mai aggiornato durante il drag.

**Fisica dell'override (in `updateWorm`):**

Quando `overrideActive` è `true`, la funzione salta l'intero blocco connectome e applica direttamente:

$$\text{magnitude} = \sqrt{ix^2 + iz^2}$$

$$v = \text{magnitude} \cdot v_{max} \cdot \text{overrideDir}$$

La velocità usa `overrideDir` per il segno (direzione committata) e `magnitude` per l'intensità — il verme rallenta automaticamente se il pollice si avvicina al centro.

**Sterzata con compensazione di direzione:**

Il componente laterale $ix$ controlla la variazione dell'heading. Per garantire che "destra su schermo = sterza a destra" sia coerente sia in avanti che in indietro, il segno della sterzata viene invertito in base alla direzione committata:

$$\text{steerDir} = \begin{cases} -1 & \text{se overrideDir} \geq 0 \\ +1 & \text{se overrideDir} < 0 \end{cases}$$

Senza questa compensazione, lo stesso incremento di heading produce effetti opposti su schermo tra avanti e indietro, perché il segno della velocità inverte il contributo di $ix$ alla traiettoria percepita.

La variazione di heading per frame è scalata per ridurre lo spinning quando il thumbstick è in posizione diagonale:

$$\text{steerScale} = 1 - \left|\frac{ix}{\text{magnitude}}\right| \cdot 0.4$$

Il fattore $|ix / \text{magnitude}|$ vale 1 quando il thumbstick è puramente laterale (rotazione attenuata del 40%) e 0 quando è puramente verticale (rotazione piena). Questo riduce la tendenza del verme a girare su se stesso in diagonale.

$$\Delta\text{heading} = \text{steerDir} \cdot ix \cdot \text{steerScale} \cdot \omega_{or} \cdot \Delta t$$

con $\omega_{or}$ = `OVERRIDE_TURN_RATE = 3.5` rad/s.

La funzione termina con `return` dopo l'aggiornamento di posizione e la verifica delle collisioni con le pareti, saltando integralmente connectome, pirouette e chemotassi.

---

### Animazione Sinusoidale del Corpo

Il vertex shader deforma ogni vertice lungo l'asse X (laterale).
L'asse del corpo del modello OBJ è **Z** (testa verso la camera).

La posizione normalizzata lungo il corpo:

$$s = \frac{z - z_{min}}{z_{max} - z_{min}} \in [0, 1]$$

La deformazione laterale:

$$\Delta x = A \cdot \sin(k \cdot s + \omega \cdot t)$$

dove $A$ = `u_amplitude`, $k$ = `u_freqSpace`, $\omega$ = `u_freqTime`, $t$ = `u_time`.

```glsl
float s = (a_position.z - u_bodyMin) / (u_bodyMax - u_bodyMin);
float wave = u_amplitude * sin(u_freqSpace * s + u_freqTime * u_time);
vec4 deformed = vec4(a_position.x + wave, a_position.y, a_position.z, 1.0);
```

### Terreno della Teca con Texture

Il piano del terreno è un rettangolo piatto (2 triangoli, 6 vertici) sul piano XZ a Y=0. Ogni vertice porta un attributo aggiuntivo: la **coordinata UV** $(u, v) \in [0,1]^2$, che indica quale punto della texture corrisponde a quel vertice. La GPU interpola le coordinate UV tra i vertici nello stesso modo in cui interpola colori e normali.

Pipeline di caricamento della texture:

```javascript
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
gl.generateMipmap(gl.TEXTURE_2D);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
```

- `texImage2D` — copia i pixel dell'immagine sulla GPU
- `generateMipmap` — genera versioni ridotte della texture per le viste a distanza (evita aliasing)
- `REPEAT` — la texture si ripete (tiling) quando le UV escono da $[0,1]$

Nel fragment shader il colore viene letto con `texture2D` e sostituisce `v_color.rgb` nelle equazioni Phong:

```glsl
uniform sampler2D u_texture;
vec3 color = texture2D(u_texture, v_texCoord).rgb;
```

**Posizionamento dinamico:** il verme viene posizionato sopra il terreno calcolando il vertice più basso $y_{min}$ del modello OBJ e traslando di conseguenza:

$$\Delta y = -y_{min} \cdot s$$

dove $s$ è il fattore di scala. Garantisce che il punto più basso del verme sia a Y=0 indipendentemente dal modello caricato.

### Sistema di Illuminazione Multi-Luce

La scena è illuminata da **4 faretti** posizionati agli angoli superiori della teca, alle coordinate $(\pm W,\ H,\ \pm D)$ dove $W$ = `TANK_WIDTH`, $H$ = `TANK_HEIGHT`, $D$ = `TANK_DEPTH`. Le posizioni sono calcolate automaticamente da `lights.js` leggendo le costanti della teca, in modo che le luci si aggiornino automaticamente al variare delle dimensioni.

Il fragment shader riceve le 4 posizioni e intensità come array uniform e accumula il contributo Phong di ciascuna luce:

```glsl
uniform vec3  u_lightPositions[4];
uniform float u_lightIntensities[4];

vec3 result = 0.3 * color;              // ambient calcolato una sola volta

for (int i = 0; i < 4; i++) {
    vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos);

    float diff   = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * color * u_lightIntensities[i];

    vec3  reflectDir = reflect(-lightDir, normal);
    float spec       = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec3  specular   = 0.2 * spec * vec3(1.0) * u_lightIntensities[i];

    result += diffuse + specular;
}
```

L'ambient è sommato una sola volta fuori dal loop perché rappresenta la luce ambientale indipendente dalle sorgenti puntuali. Ogni luce contribuisce con diffuse e specular scalati per la propria intensità, controllabile in tempo reale tramite slider `dat.GUI`.

**Attenuazione per-verme (`computeAt`):**

Oltre al rendering visivo, le intensità dei faretti influenzano direttamente il comportamento neurale di ogni verme. Il metodo `Lights.computeAt(position)` calcola lo scalare di luce [0, 1] percepito da un verme in quella posizione, sommando il contributo di ogni faretto con la legge di attenuazione inversa al quadrato:

$$\text{light}_{verme} = \min\!\left(1,\ \sum_{i=0}^{3} \frac{I_i}{1 + k \cdot d_i^2}\right)$$

dove $d_i = \|\mathbf{p}_{verme} - \mathbf{L}_i\|$ è la distanza 3D tra il verme e il faretto $i$, $I_i$ la sua intensità corrente, e $k = 0.005$ la costante di attenuazione.

```javascript
function computeAt(position) {
    const [px, py, pz] = position;
    let total = 0;
    for (let i = 0; i < 4; i++) {
        const [lx, ly, lz] = positions[i];
        const dx = px - lx, dy = py - ly, dz = pz - lz;
        total += intensities[i] / (1 + 0.005 * (dx*dx + dy*dy + dz*dz));
    }
    return Math.min(1, total);
}
```

Non serve la radice quadrata perché la formula agisce direttamente su $d^2$. Il risultato viene passato come stimolo `light` al connectome di quel verme ogni frame — abbassare un faretto dalla GUI riduce istantaneamente la luce percepita dai vermi nella sua zona, alterandone il comportamento motorio.

### Faretti della Teca — Orientamento Direzionale

Ogni faretto è un cilindro 3D generato proceduralmente, posizionato agli angoli superiori della teca e orientato in modo che la propria apertura (fondo) punti verso l'origine $\mathbf{O} = (0,0,0)$.

**Geometria del cilindro:** generata con un loop che suddivide il cerchio in $N$ spicchi. Per ogni spicchio $i$ con angoli $\theta_1 = \frac{i}{N} 2\pi$ e $\theta_2 = \frac{i+1}{N} 2\pi$:

$$\text{bordo}_i = (r\cos\theta,\ 0,\ r\sin\theta) \quad \text{con } \theta \in \{\theta_1, \theta_2\}$$

Si generano 2 triangoli per la superficie laterale e 1 per il disco superiore (chiuso). Il fondo rimane aperto — è l'apertura da cui esce la luce.

**Calcolo dell'orientamento:** dato un faretto in posizione $\mathbf{P} = (p_x,\ p_y,\ p_z)$, la direzione verso il centro è:

$$\mathbf{d} = \text{normalize}(\mathbf{O} - \mathbf{P}) = \text{normalize}(-p_x,\ -p_y,\ -p_z)$$

L'orientamento del cilindro si ottiene con due rotazioni sequenziali:

**1. Yaw $\varphi$ — rotazione attorno all'asse Y (piano orizzontale XZ):**

$$\varphi = \text{atan2}(-p_x,\ -p_z)$$

$\text{atan2}(a, b)$ restituisce l'angolo della direzione $(b, a)$ nel range $(-\pi, \pi]$, gestendo correttamente tutti e 4 i quadranti. Usare $\text{atan}(-p_x / -p_z)$ non sarebbe sufficiente perché non distingue i quadranti opposti: ad esempio $(-5, -5)$ e $(5, 5)$ darebbero lo stesso valore di $\arctan$ pur essendo direzioni opposte. Con $\text{atan2}(-p_x, -p_z)$ i segni separati dei due argomenti identificano univocamente il quadrante.

Nota: in WebGL l'asse Z cresce verso la camera (sistema right-handed), quindi l'angolo nel piano orizzontale si calcola su $(x, z)$ e non su $(x, y)$ come in un piano 2D classico.

**2. Pitch $\alpha$ — inclinazione verso il basso (piano verticale):**

$$\alpha = \text{atan2}\!\left(\sqrt{p_x^2 + p_z^2},\ p_y\right)$$

$\sqrt{p_x^2 + p_z^2}$ è la distanza orizzontale del faretto dall'asse verticale centrale. Il rapporto tra distanza orizzontale e altezza $p_y$ determina l'angolo di inclinazione dalla verticale: se il faretto è direttamente sopra il centro ($\text{horizontal} = 0$) l'inclinazione è nulla; più è lontano in XZ rispetto all'altezza, più si avvicina all'orizzontale.

**Ordine delle trasformazioni:**

$$\mathbf{M} = \mathbf{T}(p_x, p_y, p_z)\ \cdot\ R_Y(\varphi)\ \cdot\ R_X(-\alpha)$$

Le matrici si applicano **da destra verso sinistra** su ogni vertice $\mathbf{v}$:

$$\mathbf{M} \cdot \mathbf{v} = \mathbf{T} \cdot \bigl(R_Y \cdot (R_X \cdot \mathbf{v})\bigr)$$

1. $R_X(-\alpha)$ — inclina il cilindro nel piano YZ locale. Il segno negativo è necessario: $R_X$ positivo inclinerebbe il fondo verso $-Z$ locale (allontanandosi dal centro), mentre il segno negativo lo porta verso $+Z$ locale (verso il centro dopo la rotazione Y).
2. $R_Y(\varphi)$ — ruota il cilindro attorno a Y nella direzione orizzontale corretta.
3. $\mathbf{T}$ — trasla il cilindro all'angolo della teca.

Il materiale è **emissivo**: il fragment shader restituisce un colore costante indipendente dall'illuminazione, così il faretto appare sempre luminoso come una sorgente di luce.

### Stanza del Laboratorio

La scena è ambientata in una stanza da laboratorio a luci spente. La stanza è una scatola di 80×80 unità nel piano XZ e 30 unità in altezza, centrata sull'origine.

**Geometria:**

Cinque superfici, tutte definite direttamente in coordinate mondo (model matrix = identità):

| Superficie | Posizione | Normale |
|---|---|---|
| Pavimento | Y = $-H_{cabinet}$ | $(0, +1, 0)$ |
| Parete posteriore | Z = $-R_{stanza}$ | $(0, 0, +1)$ |
| Parete sinistra | X = $-R_{stanza}$ | $(+1, 0, 0)$ |
| Parete destra | X = $+R_{stanza}$ | $(-1, 0, 0)$ |
| Parete frontale | Z = $+R_{stanza}$ | $(0, 0, -1)$ |
| Soffitto | Y = $-H_{cabinet} + H_{stanza}$ | $(0, -1, 0)$ |

con $R_{stanza} = 40$ e $H_{stanza} = 30$.

**Texture:**

- **Pavimento** — piastrelle bianche grandi (`Tiles133D_1K-JPG_Color.jpg`): UV scalate di `TILE_REPEAT = 20` per asse, ogni piastrella occupa 4 unità di scena.
- **Pareti e soffitto** — cemento (`Concrete034_1K-JPG_Color.jpg`): UV scalate con `WALL_REPEAT_H = 8` orizzontalmente e `WALL_REPEAT_V = 3` verticalmente, ogni blocco occupa circa 10 unità. La modalità `gl.REPEAT` consente alle UV di superare 1.0 ripetendo automaticamente la texture.

**Atmosfera buia — attenuazione quadratica della luce:**

Le superfici della stanza e del cabinet usano un modello di **attenuazione quadratica** che simula la caduta di intensità degli spotlight con la distanza:

$$a(d) = \frac{1}{1 + k_L \cdot d + k_Q \cdot d^2}$$

| Coefficiente | Valore | Ruolo |
|---|---|---|
| $k_L$ | 0.02 | **Lineare** — governa la caduta a distanze brevi/medie. Aumentarlo oscura il cabinet stesso. |
| $k_Q$ | 0.003 | **Quadratico** — domina a grandi distanze. Aumentarlo buia le pareti senza toccare le zone vicine. |

Il termine quadratico cresce molto più rapidamente del lineare: a $d = 30$ vale $k_Q \cdot d^2 = 2.7$ contro $k_L \cdot d = 0.6$, producendo la caduta rapida nelle zone lontane tipica di un laboratorio in penombra.

Valori rappresentativi:

| Distanza | $a(d)$ | Zona |
|---|---|---|
| 0 | 1.00 | Direttamente sotto gli spotlight |
| 10 | 0.67 | Vicino al cabinet |
| 20 | 0.38 | Metà stanza |
| 30 | 0.23 | Zona lontana |
| 40 | 0.15 | Parete |

Nel fragment shader l'attenuazione moltiplica sia il termine diffuse che lo specular, lasciando invariato l'ambient (che è già prossimo a zero: `ambientStrength = 0.03`):

```glsl
float dist        = length(u_lightPositions[i] - v_worldPos);
float attenuation = 1.0 / (1.0 + 0.02 * dist + 0.003 * dist * dist);

vec3 diffuse  = diff  * color      * u_lightIntensities[i] * attenuation;
vec3 specular = spec  * vec3(1.0)  * u_lightIntensities[i] * attenuation;
```

**Differenza con le superfici interne alla teca:**
Il piano del terreno e i vermi non usano attenuazione — si trovano sempre a distanza ridotta dagli spotlight e devono apparire pienamente illuminati. L'attenuazione si applica solo alle superfici esterne (stanza e cabinet), dove la distanza dagli spotlight è significativamente maggiore.

## Limiti
- Nessuna presenza di sostanze chimiche rilevabili dai vermi
- Rilevazione di cibo tramite radar di direzione dei cerchi piuttosto che calcolo della giusta direzione basato sulla differenza di distanza nel tempo (scenario biologico)
- Nessuna modalità di accoppiamento

## References
- Worm 3D model: [VirtualWorm](http://www.openworm.org/animatedworm.html) — WormBase / Caltech, MIT License
- Connectome dataset: [OpenWorm / CElegansNeuroML](https://github.com/openworm/CElegansNeuroML) — MIT License
