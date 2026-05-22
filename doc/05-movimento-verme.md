# Movimento del Verme

La funzione `updateWorm(wormInstance, deltaTime, stimuli, foods)` in `src/models/worm.js` è chiamata ogni frame per ogni verme. Aggiorna simulazione neurale, fisica, e comportamento.

---

## Stato di un'Istanza

```javascript
// src/models/worm.js — createWormInstance
{
    position:      [x, y, z],    // posizione nel piano XZ (y=0 fisso)
    heading:       angle,         // angolo di marcia in radianti
    targetHeading: angle,         // heading target (per le rotazioni graduate)
    speed:         0,             // velocità scalare (unità/s, negativa = indietro)
    hunger:        0,             // [0,1]: fame interna

    directionSmooth: 1,           // direzione filtrata (low-pass)
    freqTimeSmooth:  0,           // freqTime filtrato per lo shader
    omegaTimer:      0,           // secondi rimanenti rotazione omega
    reversalTimer:   0,           // secondi di retromarcia iniziale post-collisione
    pirouetteTimer:  random,      // timer per la prossima rotazione casuale
    touchTimer:      0,           // timer effetto collisione
    touchDirection:  0,           // +1 (testa) / -1 (coda)

    connectome:      instance,    // istanza neurale indipendente
    alive:           true,
    overrideActive:  false,       // motor override attivo
    overrideInput:   {x:0, z:0}, // input thumbstick normalizzato
    overrideDir:     1            // direzione committata dell'override
}
```

---

## Fisica della Velocità

La velocità è uno scalare aggiornato con **attrito** (modello stile "car project"):

$$v_{target} = A \cdot v_{max} \cdot d$$

$$v \mathrel{+}= (v_{target} - v) \cdot f \cdot \Delta t$$

dove:
- $A$ = `amplitude` dal connectome ∈ [0,1]
- $v_{max}$ = `MAX_SPEED = 3.0` unità/s
- $d$ = `direction` (+1 avanti, −1 indietro)
- $f$ = `FRICTION = 2.0`

```javascript
// src/models/worm.js — updateWorm
const targetSpeed = amplitude * MAX_SPEED * direction;
wormInstance.speed += (targetSpeed - wormInstance.speed) * FRICTION * deltaTime;
```

Il termine $(v_{target} - v) \cdot f \cdot \Delta t$ è la discretizzazione dell'equazione differenziale:

$$\dot{v} = f \cdot (v_{target} - v)$$

Con $f = 2.0$ la velocità raggiunge ~86% del target in 0.5 s e ~98% in ~1 s — risposta rapida ma non istantanea. Il segno di `direction` inverte la velocità target: un valore negativo produce retromarcia.

---

## Direzione con Deadband e Filtro Passa-Basso

La direzione non viene presa direttamente dal connectome ma calcolata con due meccanismi di stabilizzazione:

### Calcolo del Drive

```javascript
// src/models/worm.js — updateWorm
const forwardDrive  = (AVBL + AVBR + PVCL + PVCR) / 4;
const backwardDrive = (AVAL + AVAR + AVDL + AVDR) / 4;

const hungerDrive = hunger > 0.5 ? (hunger - 0.5) * 2 : 0;
const driveDiff = (forwardDrive + touchForward + hungerDrive * 3.0)
                - (backwardDrive + touchBackward);
```

Il `hungerDrive` aggiunge fino a 3.0 al forward drive quando la fame è massima, sovrastando qualsiasi backward drive (massimo ~1.0). Questo garantisce che un verme affamato avanzi sempre verso il cibo.

### Deadband e Segno

```javascript
const rawDirection = driveDiff >= -DIRECTION_DEADBAND ? 1 : -1;
// DIRECTION_DEADBAND = 0.15
```

La **deadband** fa sì che il verme rimanga in avanzamento finché il backward drive non supera il forward di almeno 0.15. Senza deadband, piccole oscillazioni del connectome causerebbero inversioni continue del segno.

### Filtro Passa-Basso sulla Direzione

```javascript
wormInstance.directionSmooth += (rawDirection - wormInstance.directionSmooth) * 5.0 * deltaTime;
const direction = Math.sign(wormInstance.directionSmooth);
```

$$\dot{d}_{smooth} = \lambda \cdot (d_{raw} - d_{smooth}) \quad \lambda = 5.0\ \text{s}^{-1}$$

La costante di tempo è $\tau = 1/5 = 0.2\ \text{s}$: la transizione tra avanti e indietro impiega circa 0.2 secondi, rendendo il cambio di direzione graduale invece di istantaneo.

---

## Strategia Run + Pirouette

Il *C. elegans* reale esplora con lunghi tratti dritti interrotti da rotazioni casuali (*pirouette*). Un timer per-istanza controlla quando cambiare direzione:

```javascript
// src/models/worm.js — updateWorm
wormInstance.pirouetteTimer -= deltaTime;
if (wormInstance.pirouetteTimer <= 0) {
    wormInstance.targetHeading  = wormInstance.heading + (Math.random() - 0.5) * Math.PI;
    wormInstance.pirouetteTimer = PIROUETTE_MIN + Math.random() * (PIROUETTE_MAX - PIROUETTE_MIN);
    // PIROUETTE_MIN=3.0, PIROUETTE_MAX=8.0 s
}
```

Ogni 3–8 secondi viene estratto un nuovo `targetHeading` con uno scarto casuale di ±π/2 rispetto all'heading corrente. Il turn verso il target avviene gradualmente:

```javascript
let diff = wormInstance.targetHeading - wormInstance.heading;
while (diff >  Math.PI) diff -= 2 * Math.PI;
while (diff < -Math.PI) diff += 2 * Math.PI;
const turnSpeed = wormInstance.omegaTimer > 0 ? OMEGA_TURN_SPEED : TURN_SPEED;
wormInstance.heading += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * deltaTime);
```

La normalizzazione di `diff` in $[-\pi, \pi]$ garantisce la rotazione nel verso più breve (es. non girare 270° in senso orario quando si può girare 90° in senso antiorario). `Math.min(Math.abs(diff), turnSpeed * deltaTime)` limita la rotazione massima per frame: il verme non "teleporta" mai verso il target ma lo raggiunge gradualmente a velocità costante.

---

## Omega Turn — Risposta alle Collisioni

Una semplice retromarcia non basta: il verme tornerebbe contro la stessa parete. L'urto frontale innesca una sequenza in due fasi:

### Fase 1: Scatto Immediato

```javascript
// src/models/worm.js — checkWallCollision
if (direction > 0) {  // urto frontale
    wormInstance.directionSmooth = -1;        // forza direzione backward istantanea
    wormInstance.speed = -MAX_SPEED;          // velocità massima indietro (bypassa friction)
    wormInstance.targetHeading = wormInstance.heading;
    wormInstance.reversalTimer = REVERSAL_DURATION;  // 1.2 s di retromarcia pura
}
```

`directionSmooth = -1` forzato bypassa il filtro passa-basso e inverte immediatamente la direzione. `speed = -MAX_SPEED` bypassa l'attrito.

### Fase 2: Rotazione Omega (Rimanda)

```javascript
// src/models/worm.js — updateWorm
if (wormInstance.reversalTimer > 0) {
    wormInstance.reversalTimer -= deltaTime;
    if (wormInstance.reversalTimer <= 0) {
        const sign  = Math.random() < 0.5 ? 1 : -1;
        const angle = Math.PI * 0.5 + Math.random() * Math.PI * 0.5;
        wormInstance.targetHeading = wormInstance.heading + sign * angle;
        wormInstance.omegaTimer = OMEGA_DURATION;  // 1.2 s di rotazione rapida
    }
}
```

Dopo `REVERSAL_DURATION = 1.2` s di retromarcia, viene scelto un nuovo heading con scarto casuale tra 90° e 180°. Per `OMEGA_DURATION = 1.2` s la velocità di rotazione passa da `TURN_SPEED = 0.5` rad/s a `OMEGA_TURN_SPEED = 2.5` rad/s — una svolta rapida biologicamente corretta.

---

## Chemotassi — Orientamento verso il Cibo

Quando `hunger > 0.5` e sono presenti cibi nella scena, il verme orienta il proprio heading verso la sorgente più vicina:

$$\text{angleToFood} = \text{atan2}(\Delta x,\ \Delta z)$$

```javascript
// src/models/worm.js — updateWorm
const dx = nearestFood.position[0] - wormInstance.position[0];
const dz = nearestFood.position[2] - wormInstance.position[2];
const angleToFood = Math.atan2(dx, dz);

let foodDiff = angleToFood - wormInstance.heading;
while (foodDiff >  Math.PI) foodDiff -= 2 * Math.PI;
while (foodDiff < -Math.PI) foodDiff += 2 * Math.PI;

const bias = (wormInstance.hunger - 0.5) * 2;   // [0,1]
wormInstance.heading += foodDiff * bias * FOOD_TURN_STRENGTH * deltaTime;
// FOOD_TURN_STRENGTH = 3.5
```

L'uso di `atan2(dx, dz)` — con $x$ come primo argomento — è coerente con la convenzione del sistema di movimento, dove `heading=0` corrisponde a $+Z$ e la posizione si aggiorna con $\Delta x = \sin(\text{heading}) \cdot v \cdot \Delta t$.

Il coefficiente `bias = (hunger - 0.5) * 2` vale 0 esattamente a `hunger=0.5` e 1 a `hunger=1.0`: sotto la soglia il bias è assente, sopra cresce linearmente. Il bias si **somma** alla rotazione della pirouette — non la sostituisce.

---

## Fotofobia — Fuga dalla Luce

Il *C. elegans* è fortemente fotofobico: la luce è percepita come stimolo nocicettivo. In aggiunta al meccanismo neurale (luce → backward drive), c'è un bias direzionale diretto sull'heading:

```javascript
// src/models/worm.js — updateWorm
if (localLight > 0.05) {
    const lightDir = Lights.computeDirectionAt(wormInstance.position);
    const fleeMult = direction > 0 ? -1 : 1;
    const fleeAngle = Math.atan2(fleeMult * lightDir[0], fleeMult * lightDir[2]);
    let lightDiff = fleeAngle - wormInstance.heading;
    while (lightDiff >  Math.PI) lightDiff -= 2 * Math.PI;
    while (lightDiff < -Math.PI) lightDiff += 2 * Math.PI;
    const lightFleeScale = 1.0 - Math.max(0, (wormInstance.hunger - 0.5) * 2);
    wormInstance.heading += lightDiff * localLight * LIGHT_FLEE_STRENGTH * lightFleeScale * deltaTime;
    // LIGHT_FLEE_STRENGTH = 2.0
}
```

**`fleeMult`** — correzione per la retromarcia: quando il verme si muove all'indietro (`direction < 0`), l'heading punta nella direzione opposta al moto. Fuggire dalla luce ruotando l'heading nella direzione "lontano dalla luce" significherebbe in realtà muoversi verso di essa. Il fattore `fleeMult = direction > 0 ? -1 : 1` inverte il vettore di fuga in retromarcia, garantendo che il moto risultante porti sempre lontano dalla sorgente.

**`lightFleeScale`** — priorità sopravvivenza su fotofobia: quando la fame supera 0.5, la scala della fuga decresce linearmente fino a zero a `hunger = 1.0`:

$$\text{lightFleeScale} = 1 - \max(0,\ (\text{hunger} - 0.5) \cdot 2) \in [0, 1]$$

Un verme sull'orlo della morte ignora completamente la luce per raggiungere il cibo — biologicamente: la sopravvivenza immediata supera il riflesso di fuga.

---

## Aggiornamento della Posizione

```javascript
// src/models/worm.js — updateWorm
wormInstance.position[0] += Math.sin(wormInstance.heading) * wormInstance.speed * deltaTime;
wormInstance.position[2] += Math.cos(wormInstance.heading) * wormInstance.speed * deltaTime;
```

Il verme si muove nel piano XZ. `heading=0` corrisponde a $+Z$, `heading=π/2` corrisponde a $+X$. L'uso di `sin/cos` (e non `cos/sin`) riflette la convenzione matematica del sistema: l'asse di riferimento è Z, non X.

---

## Parametri del Movimento

| Costante | Valore | Effetto |
|---|---|---|
| `MAX_SPEED` | 3.0 unità/s | Velocità massima di avanzamento |
| `FRICTION` | 2.0 | Quanto velocemente la velocità raggiunge il target |
| `TURN_SPEED` | 0.5 rad/s | Velocità di rotazione normale |
| `OMEGA_TURN_SPEED` | 2.5 rad/s | Velocità di rotazione durante l'omega turn |
| `OMEGA_DURATION` | 1.2 s | Durata della rotazione rapida |
| `REVERSAL_DURATION` | 1.2 s | Durata retromarcia pre-omega |
| `PIROUETTE_MIN/MAX` | 3.0/8.0 s | Intervallo tra rotazioni casuali |
| `DIRECTION_DEADBAND` | 0.15 | Margine prima di cambiare direzione |
| `FOOD_TURN_STRENGTH` | 3.5 | Forza del bias verso il cibo |
| `LIGHT_FLEE_STRENGTH` | 2.0 | Forza del bias di fuga dalla luce |
| `HUNGER_FORWARD_STRENGTH` | 3.0 | Boost al forward drive dalla fame |
