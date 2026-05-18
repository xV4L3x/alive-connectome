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

Un pannello `dat.GUI` espone tre slider in tempo reale. I valori vengono passati a `Connectome.updateStimuli()` ogni frame prima di `step()`.

| Slider | Range | Neuroni target |
|---|---|---|
| Luce | [0, 1] | AVBL, AVBR, PVCL, PVCR (forward) / AVAL, AVAR, AVDL, AVDR (backward) |
| Temperatura | [0, 1] | AFDL, AFDR |
| Fame | [0, 1] | AWAL, AWAR, ADFL, ADFR |

**Perché i neuroni di comando e non quelli sensoriali:**
L'iniezione diretta sui neuroni sensoriali (AWC, ASE) non produce effetti visibili: il segnale si attenua su più hop prima di raggiungere i motoneuroni, mentre il circuito motorio si auto-sostiene tramite loop di feedback. I neuroni di comando (AVB per il forward, AVA per il backward) pilotano direttamente i motoneuroni e producono una risposta immediata.

**Calcolo ponderato della direzione:**
La direzione del movimento non è determinata da un singolo stimolo, ma dalla combinazione dell'attività neurale degli interneuroni di comando con un eventuale bias da collisione:

$$\text{forwardDrive} = \frac{1}{4}(\text{AVBL} + \text{AVBR} + \text{PVCL} + \text{PVCR}) + \text{touchForward}$$
$$\text{backwardDrive} = \frac{1}{4}(\text{AVAL} + \text{AVAR} + \text{AVDL} + \text{AVDR}) + \text{touchBackward}$$
$$\text{direction} = \begin{cases} +1 & \text{se forwardDrive} \geq \text{backwardDrive} \\ -1 & \text{altrimenti} \end{cases}$$

Il bias da collisione (`touchForward` / `touchBackward`) è un impulso esterno al connectome, attivato dal rilevamento di una collisione e descritto nella sezione Movimento del Verme.

Il comportamento osservabile:

$$\text{luce} \geq 0.5 \Rightarrow \text{AVB}\ \text{attivi} \Rightarrow \text{forwardDrive alto} \Rightarrow \text{verme avanza}$$
$$\text{luce} < 0.5 \Rightarrow \text{AVA}\ \text{attivi} \Rightarrow \text{backwardDrive alto} \Rightarrow \text{verme arretra}$$

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

## References
- Worm 3D model: [VirtualWorm](http://www.openworm.org/animatedworm.html) — WormBase / Caltech, MIT License
- Connectome dataset: [OpenWorm / CElegansNeuroML](https://github.com/openworm/CElegansNeuroML) — MIT License
