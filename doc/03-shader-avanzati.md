# Shader Avanzati: Ombre, Trasparenza, Animazione

## Ombre Planari (Planar Shadow Projection)

Le ombre dei vermi sul terreno sono implementate con la tecnica della **planar shadow projection**: nessuna shadow map, nessuna estensione WebGL. Per ogni luce attiva, una matrice di proiezione schiaccia la geometria del verme sul piano Y=0 nella direzione della luce.

### Derivazione della Shadow Matrix

Data una luce puntiforme $\mathbf{L} = (l_x, l_y, l_z)$ e un vertice del verme $\mathbf{V} = (v_x, v_y, v_z)$, il punto ombra $\mathbf{S}$ è l'intersezione della retta $\mathbf{L} \to \mathbf{V}$ con il piano $y = 0$.

La retta parametrica è:

$$\mathbf{P}(t) = \mathbf{L} + t \cdot (\mathbf{V} - \mathbf{L})$$

Si impone $P_y(t) = 0$:

$$l_y + t(v_y - l_y) = 0 \implies t = \frac{l_y}{l_y - v_y}$$

Sostituendo (e moltiplicando per $l_y - v_y$ per eliminare la divisione):

$$S_x = l_y v_x - l_x v_y$$
$$S_y = 0$$
$$S_z = l_y v_z - l_z v_y$$
$$w   = l_y - v_y$$

Questo si codifica come matrice 4×4 in coordinate omogenee (column-major per WebGL):

```javascript
// src/models/worm.js
function buildShadowMatrix(lx, ly, lz) {
    return new Float32Array([
        ly,   0,    0,    0,  // col 0: moltiplica v.x
       -lx,   0,  -lz,  -1,  // col 1: moltiplica v.y
        0,    0,   ly,   0,  // col 2: moltiplica v.z
        0,    0,    0,   ly  // col 3: moltiplica 1
    ]);
}
```

La colonna relativa a $v_y$ (seconda colonna) contiene $(-l_x, 0, -l_z, -1)$, che produce la componente $w = l_y - v_y$ necessaria per la divisione prospettica interna alla GPU.

### Shadow Model Matrix — perché è separata

Per costruire l'ombra corretta, si usa una `shadowModelMatrix` dedicata invece della normale model matrix del verme:

```javascript
// src/models/worm.js — drawWorm (shadow pass)
const shadowModelMatrix = m4.multiply(
    m4.translation(px, SHADOW_HEIGHT, pz),
    m4.multiply(
        m4.yRotation(wormInstance.heading),
        m4.scaling(WORM_SCALE, 0, WORM_SCALE)  // Y=0 schiaccia il modello
    )
);

const shadowMVP = m4.multiply(
    viewProjectionMatrix,
    m4.multiply(shadowMatrix, shadowModelMatrix)
);
```

Tre scelte deliberate:

1. **Scala Y=0**: schiaccia il cilindro corporeo del verme prima della proiezione. Senza questo, ogni sezione del corpo proietterebbe un'ombra con diametro diverso a seconda della propria altezza originale, producendo un'ombra più larga del verme visibile dalla camera.

2. **Traslazione Y=`SHADOW_HEIGHT`=0.1**: il verme schiacciato parte da Y=0.1 (non da Y=0). Questo fornisce una piccola altezza da cui la shadow matrix calcola la direzione direzionale proiettando correttamente. Se si usasse Y=0, il punto di partenza sarebbe già sul piano e la formula $t = l_y / (l_y - v_y)$ diventerebbe indeterminata per $v_y = 0$.

3. **Nessuna correzione $-y_{min} \cdot s$**: nella normal pass questa correzione serve per alzare il verme sopra il terreno, ma nell'ombra i vertici partono già a Y=0.1 (dopo lo schiacciamento) quindi non serve.

### Fragment Shader per l'Ombra

Il fragment shader ha un branch speciale per la shadow pass:

```glsl
// src/models/worm.js — fragment shader
if (u_isShadow > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, u_shadowAlpha);
    return;
}
```

Il colore è nero puro con alpha controllata dall'intensità della luce: `u_shadowAlpha = 0.15 * intensity`. Luci più forti proiettano ombre più scure. Con più luci attive le ombre si sovrappongono tramite alpha blending e si scuriscono nelle zone di sovrapposizione — comportamento fisicamente plausibile senza logica aggiuntiva.

### Polygon Offset per Evitare Z-fighting

L'ombra è a Y≈0 e il terreno è a Y=0. Senza correzione, il depth buffer non sa quale superficie disegnare sopra e si produce **z-fighting** (sfarfallio). Si risolve con:

```javascript
// src/models/worm.js — shadow pass
gl.enable(gl.POLYGON_OFFSET_FILL);
gl.polygonOffset(-1, -1);
```

`polygonOffset(-1, -1)` sposta leggermente il depth del triangolo ombra verso la camera, facendolo "vincere" sul terreno nel depth test senza visibilmente spostare la geometria.

---

## Animazione Sinusoidale del Corpo

Il corpo del verme viene deformato nel vertex shader con un'onda sinusoidale viaggiante. L'asse del corpo del modello OBJ è **Z** (testa verso $-Z$, coda verso $+Z$).

### Parametro di Posizione sul Corpo

```glsl
// src/models/worm.js — vertex shader
float s = (a_position.z - u_bodyMin) / (u_bodyMax - u_bodyMin);
```

`s` normalizza la coordinata Z di ogni vertice nell'intervallo $[0, 1]$: 0 corrisponde alla testa, 1 alla coda. `u_bodyMin` e `u_bodyMax` sono calcolati in JavaScript leggendo il bounding box dell'OBJ caricato:

```javascript
// src/models/worm.js — initWorm
for (let i = 0; i < objData.positions.length; i += 3) {
    const z = objData.positions[i + 2]; // indice 2 = coordinata Z
    if (z < bodyMin) bodyMin = z;
    if (z > bodyMax) bodyMax = z;
}
```

### Onda Sinusoidale

$$\Delta x = A \cdot \sin(k \cdot s + \omega \cdot t)$$

```glsl
float wave = u_amplitude * sin(u_freqSpace * s + u_freqTime * u_time);
vec4 deformed = vec4(a_position.x + wave, a_position.y, a_position.z, 1.0);
```

| Uniform | Valore | Significato |
|---|---|---|
| `u_amplitude` | `motorActivity * 2.0` | Ampiezza dell'onda (da connectome, scalata ×2) |
| `u_freqSpace` | 6.28 | Frequenza spaziale ≈ un'onda completa sul corpo |
| `u_freqTime` | `freqTimeSmooth` | Velocità temporale; il segno determina la direzione |
| `u_time` | tempo cumulativo (s) | Variabile temporale del seno |
| `u_bodyMin/Max` | Z min/max del modello | Per normalizzare `s` |

**Perché il segno di `u_freqTime` determina la direzione**: nell'onda viaggiante $\sin(ks + \omega t)$, il fronte d'onda si sposta nella direzione $-s$ se $\omega > 0$ (onda che va da coda a testa, verme che avanza). Se $\omega < 0$ l'onda va da testa a coda (verme che arretra). Il segno di `freqTime` codifica la direzione senza bisogno di una uniform separata.

### Filtro Passa-Basso su `freqTime`

`freqTime` dal connectome può cambiare segno bruscamente in un singolo frame (es. da +2 a −2 quando la direzione si inverte), producendo un salto discontinuo nell'animazione. Per evitarlo viene filtrato con un **low-pass filter a tempo continuo**:

```javascript
// src/models/worm.js — updateWorm
wormInstance.freqTimeSmooth +=
    (freqTime * WAVE_FREQUENCY_MULTIPLIER - wormInstance.freqTimeSmooth) * 3.0 * deltaTime;
```

Questa è l'equazione differenziale discreta:

$$\dot{f}_{smooth} = \lambda_f \cdot (f_{target} - f_{smooth})$$

con $\lambda_f = 3.0\ \text{s}^{-1}$ e $f_{target} = \text{freqTime} \times 2.0$ (`WAVE_FREQUENCY_MULTIPLIER = 2.0`). La costante di tempo è $\tau = 1/\lambda = 0.33\ \text{s}$: la transizione da avanti a indietro impiega circa 0.33 secondi, durante i quali l'onda rallenta, si ferma brevemente e poi riprende nell'altra direzione.

---

## Trasparenza della Teca di Vetro

La teca è formata da 4 pareti (nessun pavimento, nessun soffitto) con alpha blending:

```glsl
// src/models/tank.js — fragment shader
void main() {
    vec3 glassColor = vec3(0.8, 0.95, 1.0); // ciano chiaro
    float alpha = 0.10;                       // quasi completamente trasparente
    gl_FragColor = vec4(glassColor, alpha);
}
```

Il fragment shader non ha bisogno di normali né di posizioni in world space perché non calcola illuminazione — la teca è trattata come un vetro neutro con colore fisso.

```javascript
// src/models/tank.js — drawTank
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.depthMask(false);

gl.drawArrays(gl.TRIANGLES, 0, tank.vertexCount);

gl.depthMask(true);
gl.disable(gl.BLEND);
```

`gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)` implementa la formula:

$$\text{output} = \alpha \cdot C_{src} + (1 - \alpha) \cdot C_{dst}$$

dove $C_{src}$ è il colore del vetro e $C_{dst}$ è il colore già presente nel framebuffer (gli oggetti dietro). Con $\alpha = 0.10$ il vetro aggiunge solo una lieve tinta ciano senza occludere ciò che c'è dentro.

`gl.depthMask(false)` impedisce alla teca di scrivere nel depth buffer: se scrivesse, i vermi e il cibo renderizzati prima (che visivamente stanno "dentro" la teca) risulterebbero occultati da essa nel depth test del frame successivo. Disabilitando il depth write, la teca non "blocca" mai nulla.

La teca viene renderizzata **per ultima** nell'ordine di disegno, dopo tutti gli oggetti opachi e il cibo trasparente, per rispettare il corretto ordinamento della trasparenza.

---

## Hover del Verme — Outline Arancione

Quando il mouse si trova sopra un verme, il verme viene ridisegnato con un colore fisso arancione semitrasparente:

```glsl
// src/models/worm.js — fragment shader
if (u_isOutline > 0.5) {
    gl_FragColor = vec4(1.0, 0.5, 0.0, 0.65);
    return;
}
```

Il branch `return` cortocircuita tutto il calcolo Phong. In JavaScript:

```javascript
// src/models/worm.js — drawWorm
gl.uniform1f(worm.locations.isOutline, highlighted ? 1.0 : 0.0);
if (highlighted) gl.enable(gl.BLEND), gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.drawArrays(gl.TRIANGLES, 0, worm.vertexCount);
if (highlighted) gl.disable(gl.BLEND);
```

Il colore arancione con alpha=0.65 sovrascrive parzialmente il colore del verme già disegnato nel frame corrente, producendo una tinta arancione semitrasparente.
