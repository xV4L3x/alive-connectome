# Geometria Procedurale

Diversi oggetti della scena non vengono caricati da file OBJ ma generati a runtime via JavaScript. Questo consente parametrizzazione, scala dinamica e geometrie che dipendono da costanti della scena.

---

## Teca di Vetro (`src/models/tank.js`)

La teca è una scatola aperta (4 pareti, senza pavimento e soffitto) definita tramite 8 vertici espliciti:

```javascript
// src/models/tank.js
const TANK_WIDTH = 8;   // semilato X: da -8 a +8
const TANK_HEIGHT = 4;  // altezza: da 0 a 4
const TANK_DEPTH = 8;   // semilato Z: da -8 a +8

const planningVectors = {
    A: [-TANK_WIDTH, 0, TANK_DEPTH],           // fronte-sinistra-basso
    B: [-TANK_WIDTH, TANK_HEIGHT, TANK_DEPTH],  // fronte-sinistra-alto
    // ...
}
```

I triangoli vengono costruiti concatenando i vertici come array:

```javascript
const triangles = {
    ABD: planningVectors.A.concat(planningVectors.B, planningVectors.D),
    // ...
}
```

Ogni faccia è formata da 2 triangoli (6 vertici). Le costanti `TANK_WIDTH`, `TANK_HEIGHT`, `TANK_DEPTH` sono usate anche da `lights.js` per posizionare i faretti agli angoli superiori della teca — cambiarle aggiorna automaticamente sia la geometria che le luci.

---

## Bancone Metallico (`src/models/cabinet.js`)

Il cabinet è un parallelepipedo chiuso (6 facce) costruito con lo stesso pattern della teca:

```javascript
// src/models/cabinet.js
const CABINET_WIDTH  = PLANE_EXTENSION + 4;  // leggermente più largo del piano
const CABINET_DEPTH  = PLANE_EXTENSION + 4;
const CABINET_HEIGHT = 10;                   // altezza del bancone
```

La dipendenza da `PLANE_EXTENSION` (definito in `plane.js`) garantisce che il bancone sia sempre più grande della teca: cambiare le dimensioni del piano aggiorna automaticamente il bancone. Per questo i file devono essere caricati nell'ordine corretto in `index.html`.

Il cabinet ha un array di normali esplicito (hardcoded per ogni faccia) e un array UV per mappare le texture:

```javascript
// src/models/cabinet.js
const cabinetNormals = new Float32Array([
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1, // front
    0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1, // rear
    -1,0, 0, -1,0, 0, -1,0, 0, -1,0, 0, -1,0, 0, -1,0, 0,     // left
    // ...
]);
```

---

## Faretti (`src/models/spotlight.js`)

Ogni faretto è un cilindro tridimensionale generato proceduralmente con `CYLINDER_SIDES = 12` spicchi:

```javascript
// src/models/spotlight.js — generateCylinderPositions
for (let i = 0; i < CYLINDER_SIDES; i++) {
    const angle1 = (i / CYLINDER_SIDES) * 2 * Math.PI;
    const angle2 = ((i + 1) / CYLINDER_SIDES) * 2 * Math.PI;

    const x1 = CYLINDER_RADIUS * Math.cos(angle1);
    const z1 = CYLINDER_RADIUS * Math.sin(angle1);
    const x2 = CYLINDER_RADIUS * Math.cos(angle2);
    const z2 = CYLINDER_RADIUS * Math.sin(angle2);

    // Superficie laterale: 2 triangoli
    positions.push(x1, 0, z1,    x1, -CYLINDER_HEIGHT, z1,   x2, 0, z2);
    positions.push(x2, 0, z2,    x1, -CYLINDER_HEIGHT, z1,   x2, -CYLINDER_HEIGHT, z2);

    // Disco superiore: 1 triangolo dal centro
    positions.push(0, 0, 0,   x2, 0, z2,   x1, 0, z1);
}
```

Il cilindro ha il fondo aperto (l'apertura da cui "esce" la luce). Il fondo viene disegnato separatamente come disco emissivo con colore variabile secondo l'intensità:

```javascript
// src/models/spotlight.js — drawSpotlight
gl.uniform3fv(spotlight.locations.color, [1.0 * intensity, 0.98 * intensity, 0.75 * intensity]);
```

Il colore caldo (bianco-giallastro, RGB ≈ 1.0/0.98/0.75) simula una lampadina incandescente. A intensità zero il disco diventa nero.

### Orientamento del Faretto

Ogni faretto viene posizionato agli angoli superiori della teca $(\pm W, H, \pm D)$ e orientato in modo che l'apertura punti verso l'origine:

```javascript
// src/models/spotlight.js — drawSpotlight
const [px, py, pz] = positions[i];
const horizontalDistance = Math.sqrt(px*px + pz*pz);
const yaw   = Math.atan2(-px, -pz);               // rotazione Y (piano XZ)
const pitch = Math.atan2(horizontalDistance, py);  // inclinazione

const modelMatrix = m4.multiply(
    m4.translation(px, py, pz),
    m4.multiply(m4.yRotation(yaw), m4.xRotation(-pitch))
);
```

**Yaw** ($\varphi$) — angolo orizzontale calcolato con `atan2`:

$$\varphi = \text{atan2}(-p_x,\ -p_z)$$

`atan2(a, b)` gestisce tutti e 4 i quadranti: $(-5,-5)$ e $(5,5)$ producono angoli diversi, mentre `atan(-p_x/-p_z)` darebbe lo stesso risultato.

**Pitch** ($\alpha$) — inclinazione verso il basso:

$$\alpha = \text{atan2}\!\left(\sqrt{p_x^2 + p_z^2},\ p_y\right)$$

$\sqrt{p_x^2 + p_z^2}$ è la distanza orizzontale del faretto dall'asse verticale. Il rapporto tra distanza orizzontale e altezza $p_y$ determina l'angolo di inclinazione dalla verticale.

Le trasformazioni si applicano da destra a sinistra: prima $R_X(-\alpha)$ inclina il cilindro nel piano YZ locale, poi $R_Y(\varphi)$ lo ruota nella direzione corretta, poi $T$ lo trasla all'angolo. Il segno negativo di $-\alpha$ è necessario perché $R_X$ positivo inclina il fondo verso $-Z$ locale (lontano dal centro), mentre il negativo lo porta verso $+Z$ locale (verso il centro dopo la rotazione Y).

### Shader Emissivo

I faretti non usano illuminazione Phong: il fragment shader restituisce un colore costante indipendente dalla geometria di lighting:

```glsl
// src/models/spotlight.js — fragment shader
uniform vec3 u_color;
void main() {
    gl_FragColor = vec4(u_color, 1.0);
}
```

---

## Stanza Laboratorio (`src/models/room.js`)

La stanza è un guscio rettangolare di 6 superfici (pavimento, 4 pareti, soffitto) definite come array statici di vertici. Le dimensioni dipendono da `CABINET_HEIGHT` (definita in `cabinet.js`):

```javascript
// src/models/room.js
const ROOM_SIZE   = 50;   // semilato XZ
const ROOM_HEIGHT = 60;   // altezza della stanza

// Il pavimento è a Y = -CABINET_HEIGHT (sotto il bancone)
const roomFloorPositions = new Float32Array([
    -ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,
    // ...
]);
```

La parete frontale non c'è (verso lo spettatore) lasciando la scena "aperta" davanti.

Le UV del pavimento sono scalate di `TILE_REPEAT = 2` per ottenere una ripetizione texture 2×2, mentre le pareti usano `WALL_REPEAT_H = 8` orizzontalmente e `WALL_REPEAT_V = 3` verticalmente.

---

## Badge (`src/models/badge.js`)

Il badge è la geometria più complessa generata proceduralmente: un rettangolo con **angoli arrotondati** in 3D (ha spessore), più una corda che sale verso l'alto.

### Perimetro con Angoli Arrotondati

```javascript
// src/models/badge.js — buildPerimeter
function buildPerimeter(halfW, halfH, cornerRadius, numCornerSegs) {
    const cx = halfW - cornerRadius;
    const cy = halfH - cornerRadius;

    const cornerDefs = [
        { ox: cx,  oy: cy,  startAngle: 0 },              // top-right
        { ox: -cx, oy: cy,  startAngle: Math.PI / 2 },    // top-left
        { ox: -cx, oy: -cy, startAngle: Math.PI },         // bottom-left
        { ox: cx,  oy: -cy, startAngle: 3 * Math.PI / 2}, // bottom-right
    ];

    for (const {ox, oy, startAngle} of cornerDefs) {
        for (let i = 0; i <= numCornerSegs; i++) {
            const angle = startAngle + (i / numCornerSegs) * (Math.PI / 2);
            points.push({
                x: ox + cornerRadius * Math.cos(angle),
                y: oy + cornerRadius * Math.sin(angle),
            });
        }
    }
    return points;
}
```

Per ogni angolo del rettangolo, un piccolo arco di `numCornerSegs = 6` segmenti raccorda i due lati adiacenti. Il centro dell'arco è a `(halfW - cornerRadius, halfH - cornerRadius)` (e simmetrici), e l'arco copre un quarto di cerchio (90°).

### Facce Fronte e Retro

La faccia frontale è un ventaglio di triangoli dal centro ai punti del perimetro. Le UV sono calcolate normalizzando le coordinate XY del perimetro nell'intervallo [0,1]:

```javascript
// src/models/badge.js — generateBadgeGeometry (front face)
uvs.push(
    0.5, 0.5,   // centro
    (current.x + BADGE_HALF_WIDTH)  / (2 * BADGE_HALF_WIDTH),
    (current.y + BADGE_HALF_HEIGHT) / (2 * BADGE_HALF_HEIGHT),
    // ...
);
```

La faccia posteriore inverte le UV in U (`1.0 - u`) per far sì che l'immagine sia leggibile dalla parte opposta senza essere specchiata.

### Bordi Laterali

I bordi collegano i punti del perimetro frontale con quelli del retro. La normale di ogni bordo è calcolata perpendicolare al segmento del perimetro nel piano XY:

```javascript
// src/models/badge.js — generateBadgeGeometry (side)
const ex = next.x - curr.x;
const ey = next.y - curr.y;
const len = Math.sqrt(ex*ex + ey*ey);
const nx  =  ey / len;    // perpendicolare: ruota di 90°
const ny  = -ex / len;
```

### Tre Draw Call per il Badge

Il fragment shader sceglie la texture in base al valore di `u_mode` (uniform intera):

```javascript
// src/models/badge.js — drawBadge
gl.uniform1i(badge.badgeLoc.mode, 0); gl.drawArrays(..., badge.frontCount);  // foto
gl.uniform1i(badge.badgeLoc.mode, 1); gl.drawArrays(..., badge.backCount);   // retro
gl.uniform1i(badge.badgeLoc.mode, 2); gl.drawArrays(..., badge.sideCount);   // plastica
```

### Corda

La corda è un prisma rettangolare sottile (sezione `2 × ROPE_HALF_WIDTH × 2 × ROPE_HALF_WIDTH`) che si estende da `BADGE_Y + BADGE_HALF_HEIGHT` (sommità del badge) fino a `ROPE_ANCHOR_Y = 40` (fuori dalla scena visibile). È composta da 4 facce rettangolari, ognuna con 2 triangoli e normale costante per tutta la faccia.
