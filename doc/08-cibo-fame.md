# Sistema Cibo e Fame

## Oggetti Cibo

Il cibo rappresenta colonie batteriche (*E. coli*) sul terreno della teca. Ogni istanza è un disco piatto semi-trasparente renderizzato via geometria procedurale.

### Struttura Dati

```javascript
// src/models/food.js — createFoodInstance
{
    position:  [x, 0.01, z],   // Y=0.01 per evitare z-fighting con il terreno
    nutrients: 0.3..1.0,        // [0,1]: quantità rimasta
}
```

La posizione Y=0.01 (invece di Y=0) è un piccolo offset per evitare il **z-fighting** con il piano del terreno: senza di esso il depth buffer non sa quale superficie disegnare sopra e produce flickering.

### Geometria del Disco

Il disco è generato a runtime come ventaglio di 20 triangoli dal centro:

```javascript
// src/models/food.js — generateDiscPositions
for (let i = 0; i < FOOD_SIDES; i++) {           // FOOD_SIDES = 20
    const angle1 = (i / FOOD_SIDES) * 2 * Math.PI;
    const angle2 = ((i + 1) / FOOD_SIDES) * 2 * Math.PI;

    positions.push(0, 0, 0);    // centro
    positions.push(FOOD_RADIUS * Math.cos(angle1), 0, FOOD_RADIUS * Math.sin(angle1));
    positions.push(FOOD_RADIUS * Math.cos(angle2), 0, FOOD_RADIUS * Math.sin(angle2));
    // FOOD_RADIUS = 0.4
}
```

Per ogni spicchio $i$:

$$\theta_1 = \frac{i}{N} 2\pi \qquad \theta_2 = \frac{i+1}{N} 2\pi$$

Il triangolo ha vertici nel centro $(0,0,0)$ e nei due punti sul bordo $(r\cos\theta, 0, r\sin\theta)$. Tutti i vertici hanno Y=0 nello spazio modello — il disco è orizzontale per costruzione.

### Scala Dinamica

La model matrix scala il disco in base ai `nutrients` rimasti:

```javascript
// src/models/food.js — drawFood
const modelMatrix = m4.multiply(
    m4.translation(px, py, pz),
    m4.scaling(foodInstance.nutrients, 1, foodInstance.nutrients)
);
```

Quando `nutrients = 1.0` il disco ha raggio massimo `FOOD_RADIUS = 0.4`; quando si azzera, il disco scompare visivamente. Lo scaling uniforme su X e Z mantiene la forma circolare.

### Normale Hardcoded nel Fragment Shader

Il cibo non ha un buffer di normali:

```glsl
// src/models/food.js — fragment shader
vec3 normal = vec3(0.0, 1.0, 0.0);   // sempre verticale verso l'alto
```

Funziona perché il disco è sempre parallelo al piano XZ e non viene mai ruotato.

### Rendering Trasparente

```javascript
// src/models/food.js — drawFood
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.depthMask(false);
gl.drawArrays(gl.TRIANGLES, 0, food.vertexCount);
gl.depthMask(true);
gl.disable(gl.BLEND);
```

`gl.uniform1f(food.locations.alpha, 0.65)` — il cibo è 65% opaco. Il cibo viene renderizzato **dopo tutti gli oggetti opachi** (vermi, piano, teca) per rispettare il corretto ordinamento della trasparenza.

---

## Spawn Automatico del Cibo

Per evitare che i vermi esauriscano tutto il cibo disponibile, il loop di rendering genera nuovi dischi con una probabilità costante per unità di tempo:

```javascript
// src/main.js — render
const FOOD_SPAWN_RATE = 0.05; // probabilità per secondo
const MAX_FOODS = 8;          // cap massimo

if (foods.length < MAX_FOODS && Math.random() < FOOD_SPAWN_RATE * deltaTime) {
    const x = (Math.random() * 2 - 1) * (TANK_WIDTH - 1);
    const z = (Math.random() * 2 - 1) * (TANK_DEPTH - 1);
    const nutrients = 0.3 + Math.random() * 0.7;
    foods.push(createFoodInstance([x, 0, z], nutrients));
}
```

**Probabilità frame-rate independent** — il pattern `Math.random() < rate * deltaTime` è il modo standard per convertire una probabilità per secondo in una probabilità per frame. Con `FOOD_SPAWN_RATE = 0.05` e un frame da 16 ms la probabilità per frame è $0.05 \times 0.016 \approx 0.08\%$, pari in media a uno spawn ogni 20 secondi. La frequenza di spawn è identica a 30 FPS e a 60 FPS.

**`MAX_FOODS = 8`** — il cap evita l'accumulo illimitato nei periodi senza vermi. Il cibo spawnato manualmente via HUD si somma a quello automatico e rispetta lo stesso limite.

**`nutrients` casuale** — ogni disco nasce con una riserva tra 0.3 e 1.0, rendendo variabile sia la durata che la dimensione iniziale del disco.

---

## Sistema di Fame Progressiva

Ogni verme ha uno stato di fame interno **indipendente** dagli altri vermi e dal segnale neurale:

- `wormInstance.hunger` ∈ [0, 1] — riserva energetica: 0 = sazio, 1 = morte imminente
- `stimuli.hunger` che arriva al connectome — segnale della fame usato dai neuroni AWAL/AWAR/ADFL/ADFR

La separazione è deliberata: la fame interna e il segnale sensoriale crescono con logiche diverse.

### Crescita della Fame

```javascript
// src/models/worm.js — updateWorm
wormInstance.hunger = Math.min(1, wormInstance.hunger + HUNGER_RATE * deltaTime);
// HUNGER_RATE = 0.01 /s → raggiunge hunger=1 in ~100 s senza mangiare
if (wormInstance.hunger >= 1.0) wormInstance.alive = false;
```

### Mangiare

Se il verme è affamato (`hunger > 0.5`) e il cibo più vicino è entro `EAT_RADIUS = 0.8`:

```javascript
// src/models/worm.js — updateWorm
if (nearestDist < EAT_RADIUS) {
    wormInstance.hunger = Math.max(0, wormInstance.hunger - EAT_RATE * deltaTime);
    nearestFood.nutrients = Math.max(0, nearestFood.nutrients - CONSUME_RATE * deltaTime);
}
```

Con `EAT_RATE = 0.10` e `HUNGER_RATE = 0.01`, il netto è $-0.09\ \text{s}^{-1}$: da `hunger=1.0` a 0 in circa 11 secondi di mangiata continua. Con `CONSUME_RATE = 0.2`, un disco pieno (`nutrients=1.0`) si esaurisce in 5 secondi con un verme solo.

Se più vermi mangiano lo stesso disco simultaneamente, ogni verme applica la propria riduzione di `nutrients` indipendentemente — con $N$ vermi il cibo si esaurisce $N$ volte più velocemente, emergendo naturalmente senza logica aggiuntiva.

### Rimozione Cibo Esaurito

```javascript
// src/main.js — render
for (let i = foods.length - 1; i >= 0; i--) {
    if (foods[i].nutrients <= 0) foods.splice(i, 1);
}
```

L'iterazione al contrario (da `length-1` a 0) evita che `splice` sposti gli indici degli elementi non ancora controllati — un pattern standard per la rimozione in-place da array JavaScript.

---

## Iniezione nel Connectome

Ogni frame, la fame viene passata al connectome come stimolo sensoriale:

```javascript
// src/models/worm.js — updateWorm
const localLight = Lights.computeAt(wormInstance.position);
wormInstance.connectome.updateStimuli({
    light:  localLight,
    hunger: wormInstance.hunger
});
```

Il valore `hunger` arriva ai neuroni AWAL/AWAR/ADFL/ADFR (chemosensori del cibo), influenzando il forward drive tramite la propagazione sinaptica normale.

---

## Morte del Verme

Due cause di morte:

**Morte per inedia** — `hunger >= 1.0`: il flag `alive` viene impostato a `false` in `updateWorm`. Il frame successivo, il loop di pulizia rimuove il verme:

```javascript
// src/main.js — render
for (let i = worms.length - 1; i >= 0; i--) {
    if (!worms[i].alive) {
        if (worms[i] === selectedWorm) { selectedWorm = null; rebuildSelectionGui(); }
        worms.splice(i, 1);
    }
}
```

Se il verme che muore è quello selezionato, il pannello di selezione viene chiuso prima della rimozione — altrimenti rimarrebbe un riferimento pendente a un oggetto non più in scena.

**Kill manuale** — il pannello di selezione espone il bottone "Kill Worm":

```javascript
// src/hud.js — rebuildSelectionGui
selectionGui.add({
    kill: () => { selectedWorm.alive = false; selectedWorm = null; rebuildSelectionGui(); }
}, 'kill').name('Kill Worm');
```

La rimozione dall'array avviene al frame successivo tramite lo stesso loop di pulizia.

---

## Parametri del Sistema Fame

| Parametro | Valore | Effetto |
|---|---|---|
| `HUNGER_RATE` | 0.01 /s | Muore di fame in ~100 s senza mangiare |
| `EAT_RATE` | 0.10 /s | Fame netta: $-0.09$ /s (EAT - HUNGER) |
| `CONSUME_RATE` | 0.20 /s | Un disco pieno dura ~5 s con un verme |
| `EAT_RADIUS` | 0.8 | Raggio minimo per mangiare (uguale alla hitbox) |
| `FOOD_SIDES` | 20 | Numero di triangoli del disco |
| `FOOD_RADIUS` | 0.4 | Raggio massimo del disco (`nutrients=1.0`) |
