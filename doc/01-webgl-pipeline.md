# Pipeline di Rendering WebGL

## Inizializzazione

Il punto di ingresso è `main()` in `src/main.js`. Al caricamento della pagina vengono eseguiti in sequenza:

1. Recupero del contesto WebGL dal canvas HTML (`id="gl-canvas"`)
2. Caricamento asincrono dei tre file dati principali via `fetch`:
   - `worm-cuticle.obj` — geometria del verme
   - `worm-cuticle.mtl` — materiali del verme
   - `herm_full_edgelist.csv` — dataset sinaptico del connectome
3. Parsing dei file e inizializzazione di tutti gli oggetti 3D
4. Avvio del loop di rendering con `requestAnimationFrame`

```javascript
// src/main.js
const objData = parseOBJ(objFileContent, mtlData);
Connectome.init(csvFileContent);
const wormGPU = initWorm(gl, objData);
// ...altri oggetti...
requestAnimationFrame(render);
```

---

## Compilazione degli Shader

Ogni oggetto 3D ha il proprio coppia di shader (vertex + fragment) definita come stringa JavaScript nello stesso file. La compilazione avviene tramite `createShaderProgram` in `src/core/utilities.js`:

```javascript
// src/core/utilities.js
function createShaderProgram(gl, vertexSource, fragmentSource) {
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);
    // controllo errori...

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);
    // controllo errori...

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    return program;
}
```

La funzione compila separatamente i due shader, li lega a un programma e verifica lo stato di compilazione e linking con `gl.getShaderParameter` / `gl.getProgramParameter`. In caso di errore, il log GLSL viene stampato in console.

---

## Pipeline MVP (Model-View-Projection)

Per ogni frame, la posizione di ogni vertice passa attraverso tre trasformazioni matriciali successive prima di arrivare alle coordinate di schermo (NDC — Normalized Device Coordinates):

$$\mathbf{p}_{clip} = \mathbf{P} \cdot \mathbf{V} \cdot \mathbf{M} \cdot \mathbf{p}_{model}$$

dove:
- $\mathbf{M}$ (**Model Matrix**) — trasforma da spazio modello a spazio mondo: posizione, rotazione, scala del singolo oggetto
- $\mathbf{V}$ (**View Matrix**) — trasforma da spazio mondo a spazio camera: rappresenta il punto di vista dell'osservatore
- $\mathbf{P}$ (**Projection Matrix**) — trasforma da spazio camera a coordinate clip (include la prospettiva)

### Costruzione delle matrici in `src/main.js`

```javascript
// PROJECTION: 45° FOV, aspect ratio del canvas, near=0.1, far=1000
const projectionMatrix = m4.perspective(Math.PI / 4, aspect, 0.1, 1000.0);

// VIEW: inversa della lookAt(eye, target, up)
const viewMatrix = m4.inverse(m4.lookAt(eye, lookTarget, [0, 1, 0]));

// VP combinata, riusata per tutti gli oggetti del frame
const viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);
```

La `lookAt(eye, target, up)` costruisce una matrice che orienta la camera in `eye` verso `target` con il vettore "su" dato. L'**inversa** è necessaria perché `lookAt` restituisce la matrice della camera nel mondo, ma per trasformare i vertici serve la matrice che porta il mondo nel sistema di riferimento della camera — cioè l'operazione opposta.

La **view-projection matrix** è calcolata una volta per frame e poi moltiplicata per la model matrix specifica di ogni oggetto. Questo evita di ricalcolare la VP per ogni draw call.

### Model Matrix del verme (`src/models/worm.js`)

```javascript
// src/models/worm.js
const wormModelMatrix = m4.multiply(
    m4.translation(px, -worm.yMin * WORM_SCALE + py, pz),
    m4.multiply(
        m4.yRotation(wormInstance.heading),
        m4.scaling(WORM_SCALE, WORM_SCALE, WORM_SCALE)
    )
);
```

Le trasformazioni si applicano **da destra verso sinistra** (convenzione column-major di WebGL):
1. `m4.scaling(0.3, 0.3, 0.3)` — scala il modello (che in OBJ è in unità Blender)
2. `m4.yRotation(heading)` — ruota il verme nel piano XZ secondo il suo heading
3. `m4.translation(px, -yMin * scale + py, pz)` — posiziona nel mondo; il termine $-y_{min} \cdot s$ sposta verticalmente il verme in modo che il punto più basso del modello tocchi Y=0 (il piano del terreno), indipendentemente dalla forma del modello caricato

### Uniform MVP nel vertex shader

```glsl
// src/models/worm.js — vertex shader
uniform mat4 u_matrix;      // MVP matrix (VP × M)
uniform mat4 u_modelMatrix; // sola M, per calcoli in world space

void main() {
    // ...deformazione onda...
    gl_Position = u_matrix * deformed;
    v_worldPos = (u_modelMatrix * deformed).xyz;
    v_normal = mat3(u_modelMatrix) * a_normal;
}
```

`u_matrix` (la MVP completa) va direttamente alla posizione del vertice su schermo. `u_modelMatrix` è usata separatamente per trasformare posizioni e normali in spazio mondo, necessario per i calcoli di illuminazione Phong nel fragment shader dove le distanze e gli angoli devono essere in world space.

La normal transform usa solo la sottomatrice 3×3 di `u_modelMatrix` (`mat3(u_modelMatrix)`), perché le normali sono **vettori direzione** e non devono essere affette dalla componente di traslazione della matrice 4×4. Questa è la trasformazione corretta per normali quando il modello non ha scaling non-uniforme; in caso contrario si dovrebbe usare la trasposta dell'inversa.

---

## Parser OBJ/MTL

Implementato da zero in `src/core/utilities.js` (basato su [WebGL Fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-load-obj.html)).

### Formato OBJ

Un file OBJ è un testo con una keyword per riga:

| Keyword | Significato | Esempio |
|---|---|---|
| `v` | Vertice (posizione) | `v 1.23 -0.45 0.67` |
| `vn` | Normale del vertice | `vn 0.0 1.0 0.0` |
| `vt` | Coordinata UV texture | `vt 0.5 0.75` |
| `usemtl` | Applica un materiale | `usemtl Hypodermis` |
| `f` | Faccia (indici 1-based) | `f 1/1/1 2/2/2 3/3/3` |

Le facce usano il formato `posizione/uv/normale` con indici 1-based (non 0-based). Il parser triangola automaticamente poligoni con più di 3 vertici usando un fan dal primo vertice:

```javascript
// src/core/utilities.js
f(parts) {
    for (let i = 1; i < parts.length - 1; i++) {
        addVertex(parts[0]);   // vertice 0 (hub del fan)
        addVertex(parts[i]);   // vertice i
        addVertex(parts[i+1]); // vertice i+1
    }
}
```

### Formato MTL e colori per vertice

Il file MTL definisce i materiali riferenziati dall'OBJ. Il parser estrae solo la riga `Kd` (diffuse color) di ogni materiale:

```javascript
// src/core/utilities.js
} else if (parts[0] === 'Kd' && currentMaterial) {
    materials[currentMaterial].diffuse = [
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3]),
        1.0  // alpha = 1 (opaco)
    ];
}
```

Quando il parser OBJ incontra `usemtl NomeMateriale`, il colore diffuso di quel materiale viene assegnato a tutti i vertici successivi come attributo `a_color`. Nel modello del verme i materiali rilevanti sono `Hypodermis` (pelle rosa translucida) e `Generic_Transparency` (parti leggermente diverse). Il risultato è un array `Float32Array` di colori RGBA uno per ogni vertice, caricato in un VBO separato.

### Output del parser

```javascript
return {
    positions: new Float32Array(outPositions), // 3 float per vertice
    normals:   new Float32Array(outNormals),   // 3 float per vertice
    texCoords: new Float32Array(outTexCoords), // 2 float per vertice
    colors:    new Float32Array(outColors),    // 4 float per vertice (RGBA)
    vertexCount: outPositions.length / 3,
};
```

Tutti i dati sono in formato **non-indexed** (vertex array, non index buffer): ogni triangolo ha 3 vertici espliciti, anche se fisicamente lo stesso punto dello spazio è ripetuto. Questo semplifica il caricamento su GPU (nessun `gl.ELEMENT_ARRAY_BUFFER`) al costo di qualche duplicazione in memoria.

---

## Loop di Rendering

```javascript
// src/main.js
function render(timestamp) {
    const deltaTime = (timestamp - lastTimestamp) / 1000; // secondi
    lastTimestamp = timestamp;
    time += deltaTime;

    resizeCanvas(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);

    // 1. Calcola camera
    const { eye, lookTarget } = resolveCamera(camera, cameraMode, selectedWorm);

    // 2. Costruisce VP matrix
    const viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

    // 3. Ray casting per hover
    hoveredWorm = null;
    // ...test ray-sphere per ogni verme...

    // 4. Clear
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // 5. Aggiorna simulazione (fisica + connectome)
    for (const worm of worms) updateWorm(worm, deltaTime, params, foods);
    checkWormCollisions(worms);
    // ...pulizia vermi morti e cibo esaurito...

    // 6. Rendering (ordine importante per trasparenza)
    drawRoom(...)
    drawBadge(...)
    drawCabinet(...)
    drawPlane(...)
    for (worm) drawWorm(...)   // shadow pass + normal pass
    for (food) drawFood(...)   // trasparente, dopo oggetti opachi
    drawSpotlight(...)
    drawTank(...)              // trasparente, per ultimo

    requestAnimationFrame(render);
}
```

**Depth test** (`gl.DEPTH_TEST`) è abilitato globalmente all'avvio: ogni fragment scrive nel depth buffer e i fragment più lontani vengono scartati. Gli oggetti trasparenti (cibo, teca) disabilitano il depth write (`gl.depthMask(false)`) prima del draw e lo riabilitano dopo, per evitare di occludere oggetti dietro di sé.

`resizeCanvas` aggiorna le dimensioni del canvas in pixel fisici tenendo conto del `devicePixelRatio` (display retina/HiDPI), evitando il rendering sfocato su schermi ad alta densità.
