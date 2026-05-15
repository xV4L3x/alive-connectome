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

Ogni frame esegue 5 fasi in sequenza:

1. **Reset spike** — `spiked = false` su tutti i neuroni
2. **Stimoli sensoriali** — `activation` dei neuroni sensori sovrascritta direttamente dal valore degli slider ambiente
3. **Propagazione** — per ogni neurone con `activation > θ` (soglia), accumula sui target: $a_{target} \mathrel{+}= a_{source} \cdot w \cdot s$
4. **Decadimento** — $a \leftarrow a \cdot D$ (neuroni non stimolati si spengono gradualmente)
5. **Clamp** — $a \leftarrow \text{clamp}(a,\ 0,\ 1)$

Parametri: soglia $\theta = 0.3$, decadimento $D = 0.9$, scala pesi $s = 0.002$.

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
| `u_amplitude` | `amplitude * 0.15` | Ampiezza visiva scalata |
| `u_freqTime` | `freqTime` | Velocità temporale onda (segno = direzione) |
| `u_freqSpace` | `6.28` (costante) | Frequenza spaziale (~1 onda sul corpo) |
| `u_time` | tempo cumulativo in secondi | Variabile temporale per il seno |
| `u_bodyMin`, `u_bodyMax` | range Z del modello | Estensione del corpo per normalizzare `s` |


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

## References
- Worm 3D model: [VirtualWorm](http://www.openworm.org/animatedworm.html) — WormBase / Caltech, MIT License
- Connectome dataset: [OpenWorm / CElegansNeuroML](https://github.com/openworm/CElegansNeuroML) — MIT License
