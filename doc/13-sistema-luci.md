# Sistema di Illuminazione Multi-Luce

## Struttura

`src/core/lights.js` è un singleton (IIFE) che gestisce le 4 sorgenti luminose della scena:

```javascript
// src/core/lights.js
const Lights = (() => {
    const positions = [
        [-TANK_WIDTH, TANK_HEIGHT,  TANK_DEPTH],  // fronte-sinistra
        [ TANK_WIDTH, TANK_HEIGHT,  TANK_DEPTH],  // fronte-destra
        [-TANK_WIDTH, TANK_HEIGHT, -TANK_DEPTH],  // retro-sinistra
        [ TANK_WIDTH, TANK_HEIGHT, -TANK_DEPTH],  // retro-destra
    ];

    const intensities = [1.0, 0.0, 0.0, 1.0];   // valori iniziali
    // ...
})();
```

Le posizioni dipendono da `TANK_WIDTH/HEIGHT/DEPTH` definite in `tank.js` — i faretti si trovano esattamente agli angoli superiori della teca. Se le dimensioni della teca cambiano, le luci si spostano automaticamente.

---

## Rendering Multi-Luce nel Fragment Shader

Tutti i fragment shader che usano illuminazione ricevono le 4 luci come array uniform:

```glsl
// Dichiarazione comune a tutti i fragment shader con Phong
uniform vec3  u_lightPositions[4];
uniform float u_lightIntensities[4];
```

Il loop accumula i contributi:

```glsl
// Struttura comune (es. src/models/worm.js — fragment shader)
vec3 result = ambientStrength * v_color.rgb;   // ambient una sola volta

for (int i = 0; i < 4; i++) {
    vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos);

    float diff   = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * v_color.rgb * u_lightIntensities[i];

    vec3  reflectDir = reflect(-lightDir, normal);
    float spec       = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec3  specular   = specularStrength * spec * vec3(1.0) * u_lightIntensities[i];

    result += diffuse + specular;
}
gl_FragColor = vec4(result, 1.0);
```

L'ambient è calcolato **una sola volta** fuori dal loop perché è indipendente dalle sorgenti puntuali. Con 4 luci di uguale intensità, il contributo diffuse e specular di ognuna si somma — spegnere una luce riduce l'illuminazione proporzionalmente in quella zona.

---

## Attenuazione per-Verme (`computeAt`)

Oltre al rendering visivo, le intensità dei faretti influenzano il comportamento neurale. `computeAt(position)` calcola lo scalare di luce $\in [0,1]$ percepito da un punto della scena:

$$\text{light} = \min\!\left(1,\ \sum_{i=0}^{3} \frac{I_i}{1 + k \cdot d_i^2}\right)$$

dove $d_i = \|\mathbf{p} - \mathbf{L}_i\|$ è la distanza 3D tra il punto e il faretto $i$, $I_i$ la sua intensità, e $k = 0.02$ la costante di attenuazione.

```javascript
// src/core/lights.js — computeAt
function computeAt(position) {
    const [px, py, pz] = position;
    let total = 0;
    for (let i = 0; i < 4; i++) {
        const [lx, ly, lz] = positions[i];
        const dx = px - lx, dy = py - ly, dz = pz - lz;
        const dist2 = dx*dx + dy*dy + dz*dz;
        total += intensities[i] / (1 + 0.02 * dist2);
    }
    return Math.min(1, total);
}
```

Non serve la radice quadrata perché la formula agisce direttamente su $d^2$ (il coefficiente $k$ è stato calibrato per $d^2$ e non per $d$). Il risultato viene passato come stimolo `light` al connectome di ogni verme ogni frame — abbassare un faretto dalla GUI riduce istantaneamente la luce percepita dai vermi in quella zona.

---

## Direzione della Luce per la Fotofobia (`computeDirectionAt`)

`computeDirectionAt(position)` restituisce il vettore unitario nel piano XZ che punta **verso** il baricentro luminoso ponderato, usato nel calcolo della fotofobia dei vermi:

$$\mathbf{d}_{luce} = \text{normalize}\!\left(\sum_{i=0}^{3} \frac{I_i}{(1 + k \cdot d_i^2)^2} \cdot (\mathbf{L}_i - \mathbf{p})_{XZ}\right)$$

```javascript
// src/core/lights.js — computeDirectionAt
function computeDirectionAt(position) {
    const [px, py, pz] = position;
    let wx = 0, wz = 0;
    for (let i = 0; i < 4; i++) {
        const [lx, ly, lz] = positions[i];
        const dx = px - lx, dy = py - ly, dz = pz - lz;
        const dist2 = dx*dx + dy*dy + dz*dz;
        const denom = 1 + 0.02 * dist2;
        const weight = intensities[i] / (denom * denom);   // gradiente: derivata di 1/(1+kd²)
        wx += (lx - px) * weight;   // verso la luce
        wz += (lz - pz) * weight;
    }
    const len = Math.sqrt(wx*wx + wz*wz);
    if (len < 0.001) return [0, 0, 0];
    return [wx / len, 0, wz / len];
}
```

Il peso $1/(1+kd^2)^2$ è la derivata negativa dell'attenuazione rispetto alla distanza (gradiente del campo luminoso): darà più peso alle luci vicine. La soglia `len < 0.001` evita la divisione per zero quando tutte le luci sono spente.

La direzione di fuga usata dai vermi è l'opposto: $\mathbf{d}_{fuga} = -\mathbf{d}_{luce}$.

---

## API Pubblica

```javascript
Lights.getPositionsFlat()     // Float32Array di 12 float (4 × vec3), per gl.uniform3fv
Lights.getPositionsRaw()      // array JS di 4 × [x,y,z], per iterazione
Lights.getIntensities()       // Float32Array di 4 float, per gl.uniform1fv
Lights.getIntensitiesRaw()    // array JS di 4 float, per lettura diretta
Lights.setIntensity(i, v)     // imposta intensità i-esima (0–1), chiamata dagli slider GUI
Lights.computeAt(pos)         // scalare luce in quel punto, per il connectome
Lights.computeDirectionAt(pos)// vettore direzione verso la luce, per la fotofobia
```

`getPositionsFlat()` e `getIntensities()` restituiscono `Float32Array` già pronti per `gl.uniform3fv` / `gl.uniform1fv` (WebGL richiede TypedArray o Array, non array JS ordinari per questi metodi). `getPositionsRaw()` e `getIntensitiesRaw()` restituiscono gli array interni di JavaScript per l'iterazione in codice lato CPU.

---

## Aggiornamento in Tempo Reale

Gli slider della GUI chiamano direttamente `Lights.setIntensity`:

```javascript
// src/hud.js — initHUD
lightsFolder.add({l1: lightIntensities[0]}, 'l1', 0, 1)
    .step(0.01)
    .name('Front Left')
    .onChange(v => Lights.setIntensity(0, v));
```

Al frame successivo, ogni oggetto che chiama `Lights.getIntensities()` / `Lights.getPositionsFlat()` riceve automaticamente i valori aggiornati. Non c'è caching né notify pattern: ogni frame rilegge i valori correnti. L'effetto è visibile istantaneamente sia sull'illuminazione della scena che sul comportamento dei vermi (che reagiscono alla luce percepita).
