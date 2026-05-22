# Sistema di Collisioni

Le collisioni sono gestite in due funzioni separate in `src/models/worm.js`:
- `checkWallCollision(wormInstance, direction)` — verme contro i bordi della teca
- `checkWormCollisions(worms)` — collisioni tra coppie di vermi

Entrambe eseguono due operazioni in parallelo nello stesso frame:
1. **Separazione fisica**: sposta la geometria fuori dall'overlap *prima* che il frame finisca
2. **Risposta comportamentale**: imposta i timer che modificano velocità e heading nei frame successivi

---

## Collisioni Verme-Muro

La teca forma un **AABB** (Axis-Aligned Bounding Box) con semilati `TANK_WIDTH = 8` (asse X) e `TANK_DEPTH = 8` (asse Z). Ogni verme ha una hitbox sferica di raggio `WORM_WALL_RADIUS = 0.8`.

```javascript
// src/models/worm.js — checkWallCollision
function checkWallCollision(wormInstance, direction) {
    const pos = wormInstance.position;
    let hit = false;

    if (pos[0] < -TANK_WIDTH + WORM_WALL_RADIUS) {
        pos[0] = -TANK_WIDTH + WORM_WALL_RADIUS;
        hit = true;
    } else if (pos[0] > TANK_WIDTH - WORM_WALL_RADIUS) {
        pos[0] = TANK_WIDTH - WORM_WALL_RADIUS;
        hit = true;
    }
    // stesso controllo per Z...
```

Il clamp riporta la posizione al limite lecito: il verme non può "passare attraverso" il muro. Se c'è stato un hit si imposta la risposta:

```javascript
    if (hit) {
        wormInstance.touchTimer = TOUCH_DURATION;          // 1.5 s
        wormInstance.touchDirection = direction > 0 ? -1 : 1;  // testa → indietro

        if (direction > 0) {   // urto frontale
            wormInstance.directionSmooth = -1;    // inversione immediata
            wormInstance.speed = -MAX_SPEED;      // scatto indietro
            wormInstance.targetHeading = wormInstance.heading;
            wormInstance.reversalTimer = REVERSAL_DURATION;   // ritarda omega
        } else {               // urto in coda
            wormInstance.speed = MAX_SPEED;       // scatto avanti
        }
    }
```

**Urto frontale** (`direction > 0`): il verme stava andando avanti quando ha toccato la parete, quindi la testa ha urtato. Viene avviata la sequenza reversal+omega (vedi [05-movimento-verme.md](05-movimento-verme.md)).

**Urto in coda** (`direction < 0`): il verme stava andando indietro. Scatto in avanti (`speed = MAX_SPEED`) senza omega turn — biologicamente corrisponde all'attivazione di PLM → AVB (neuroni della coda) senza coinvolgere il circuito di omega turn.

---

## Touch Bias

Il `touchTimer` attiva un bias esterno al connectome nel calcolo della direzione:

```javascript
// src/models/worm.js — updateWorm
if (wormInstance.touchTimer > 0) {
    wormInstance.touchTimer -= deltaTime;
    const intensity = (wormInstance.touchTimer / TOUCH_DURATION) * TOUCH_STRENGTH;
    if (wormInstance.touchDirection > 0) touchForward  = intensity;
    else                                  touchBackward = intensity;
}
```

Con `TOUCH_STRENGTH = 4.0` e `TOUCH_DURATION = 1.5` s, il bias parte da 4.0 e decresce linearmente a zero nel corso di 1.5 secondi. Il valore 4.0 sovrasta il drive massimo del connectome (~1.0) per garantire la risposta comportamentale anche con un connectome in stato stazionario.

---

## Collisioni Verme-Verme

Le collisioni tra vermi vengono testate **dopo** aver aggiornato tutti i vermi e **prima** del rendering, per garantire che la separazione fisica sia visibile nello stesso frame:

```javascript
// src/main.js — render
for (const worm of worms) updateWorm(worm, deltaTime, params, foods);
checkWormCollisions(worms);  // prima di disegnare
for (worm) drawWorm(...)
```

### Test di Collisione

```javascript
// src/models/worm.js — checkWormCollisions
for (let i = 0; i < worms.length; i++) {
    for (let j = i + 1; j < worms.length; j++) {
        const dx = a.position[0] - b.position[0];
        const dz = a.position[2] - b.position[2];
        const d  = Math.sqrt(dx*dx + dz*dz);
        const minD = WORM_WORM_RADIUS * 2;  // WORM_WORM_RADIUS = 0.5

        if (d >= minD || d === 0) continue;
        const overlap = minD - d;
```

La distanza è calcolata solo nel **piano XZ**: i vermi si muovono tutti alla stessa altezza (Y=0), e il confronto verticale non è discriminante. Il caso `d === 0` (due vermi nello stesso punto) viene saltato per evitare la divisione per zero nella normalizzazione.

### Separazione Fisica

Il vettore di separazione è normalizzato dividendo per `d`:

$$\hat{n} = \frac{(\Delta x,\ \Delta z)}{d}$$

```javascript
const sdx = dx / d;  // normalizzato
const sdz = dz / d;

a.position[0] += sdx * overlap * 0.5;   // A si allontana di metà overlap
a.position[2] += sdz * overlap * 0.5;
b.position[0] -= sdx * overlap * 0.5;   // B si allontana nella direzione opposta
b.position[2] -= sdz * overlap * 0.5;
```

Ogni verme si sposta di `overlap/2` lungo il vettore che li separa: la separazione è **simmetrica** — nessuno dei due vermi "ha ragione" sulla collisione. Moltiplicando la direzione normalizzata per `overlap/2` si ottiene esattamente lo spostamento necessario per eliminare la sovrapposizione.

### Risposta Comportamentale

```javascript
// direzione in base alla velocità attuale
const dirA = a.speed >= 0 ? 1 : -1;
const dirB = b.speed >= 0 ? 1 : -1;

a.touchTimer     = TOUCH_DURATION;
a.touchDirection = dirA > 0 ? -1 : 1;   // testa→indietro, coda→avanti

// Se andava avanti (testa urtata) → reversal + omega
if (dirA > 0 && a.reversalTimer <= 0) {
    a.directionSmooth = -1;
    a.speed           = -MAX_SPEED;
    a.targetHeading   = a.heading;
    a.reversalTimer   = REVERSAL_DURATION;
}
```

La condizione `reversalTimer <= 0` evita di avviare un nuovo reversal se il verme è già in fase di inversione — senza questo controllo, collisioni consecutive potrebbero resettare ripetutamente il timer impedendo il completamento dell'omega turn.

---

## Aggiornamento dell'Ordine

```
frame N:
  updateWorm(A)       → posizione aggiornata
  updateWorm(B)       → posizione aggiornata
  checkWormCollisions → separazione fisica applicata
  drawWorm(A)         → rendering con separazione già applicata
  drawWorm(B)
```

Se l'aggiornamento e il disegno fossero nello stesso loop (interleaved), alcuni vermi verrebbero renderizzati prima che le collisioni siano risolte, producendo frame in cui i vermi si sovrappongono visivamente.
