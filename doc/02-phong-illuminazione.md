# Modello di Illuminazione Phong

## Teoria

Il modello di illuminazione Phong calcola il colore di ogni fragment come somma di tre contributi indipendenti:

$$I = I_a + I_d + I_s$$

- $I_a$ — **Ambient**: luce ambientale costante, simula la luce diffusa indirettamente nell'ambiente
- $I_d$ — **Diffuse**: luce che dipende dall'angolo tra la normale della superficie e la direzione verso la sorgente (legge di Lambert)
- $I_s$ — **Specular**: riflesso lucido, dipende dall'angolo tra il raggio riflesso e la direzione verso la camera

Nella scena le 4 luci sono tutte **puntuali** (point lights), non direzionali. Il contributo diffuse e specular viene accumulato in un loop su ciascuna delle 4 sorgenti.

---

## Implementazione nel Fragment Shader del Verme

Il fragment shader del verme (`src/models/worm.js`) è il più completo ed è il riferimento principale per tutti gli altri:

```glsl
// src/models/worm.js — fragment shader
precision mediump float;

varying vec4 v_color;
varying vec3 v_normal;
varying vec3 v_worldPos;

uniform vec3  u_lightPositions[4];
uniform float u_lightIntensities[4];
uniform vec3  u_viewPosition;
uniform float u_advanced;
```

Le `varying` sono interpolate automaticamente dalla GPU tra i vertici del triangolo: `v_color` è il colore del materiale OBJ, `v_normal` è la normale in world space, `v_worldPos` è la posizione del fragment in world space.

### Vettori necessari

Prima del loop si calcolano i vettori che non dipendono dalla luce:

```glsl
vec3 normal  = normalize(v_normal);
vec3 viewDir = normalize(u_viewPosition - v_worldPos);
```

- `normalize(v_normal)`: le normali interpolate tra vertici possono non essere più unitarie — la normalizzazione le riporta a lunghezza 1, necessaria per i calcoli con il prodotto scalare
- `viewDir`: vettore unitario dal fragment verso la camera, usato per il termine speculare

### Termine Ambient

$$I_a = k_a \cdot c_{object}$$

```glsl
float ambientStrength = 0.4;
vec3 ambient = ambientStrength * v_color.rgb;
```

Il valore 0.4 per il verme è volutamente alto: il verme è il soggetto principale della scena e deve rimanere visibile anche in zone d'ombra. Il termine ambient viene **accumulato** nel vettore `ambient` usato poi per sommare diffuse e specular.

### Termine Diffuse (Legge di Lambert)

Per ogni sorgente luminosa $i$ con posizione $\mathbf{L}_i$ e intensità $I_i$:

$$\mathbf{l}_i = \frac{\mathbf{L}_i - \mathbf{p}_{frag}}{\|\mathbf{L}_i - \mathbf{p}_{frag}\|}$$

$$I_{d,i} = \max(\mathbf{n} \cdot \mathbf{l}_i,\ 0) \cdot c_{object} \cdot I_i$$

```glsl
for (int i = 0; i < 4; i++) {
    vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos);

    float diff   = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * v_color.rgb * u_lightIntensities[i];
```

Il `max(..., 0.0)` elimina i valori negativi: quando la superficie è rivolta nella direzione opposta alla luce ($\mathbf{n} \cdot \mathbf{l} < 0$), non riceve luce diffusa — i fragment "in ombra" sulla geometria stessa ricevono solo l'ambient.

### Termine Specular (Phong Reflection)

Il riflesso speculare usa il vettore $\mathbf{r}$ ottenuto riflettendo il vettore opposto alla luce ($-\mathbf{l}$) rispetto alla normale:

$$\mathbf{r} = \text{reflect}(-\mathbf{l},\ \mathbf{n}) = 2(\mathbf{n} \cdot \mathbf{l})\mathbf{n} - \mathbf{l}$$

L'intensità speculare dipende dall'allineamento di $\mathbf{r}$ con $\mathbf{v}$ (direzione verso la camera), elevato a una potenza $\alpha$ (shininess):

$$I_{s,i} = k_s \cdot \max(\mathbf{r} \cdot \mathbf{v},\ 0)^\alpha \cdot I_i$$

```glsl
    vec3  reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec3  specular = specularStrength * spec * vec3(1.0, 1.0, 1.0)
                     * u_lightIntensities[i] * u_advanced;

    ambient += diffuse + specular;
}
gl_FragColor = vec4(ambient, 1.0);
```

Il colore speculare è bianco `vec3(1.0, 1.0, 1.0)` indipendentemente dal colore dell'oggetto, simulando il riflesso diretto della luce su una superficie lucida. La shininess $\alpha = 32$ produce un riflesso di media dimensione.

`u_advanced` è un flag booleano (0.0 o 1.0) controllato dal toggle "Advanced Rendering" nella GUI: quando disattivato, il termine speculare viene azzerato globalmente moltiplicando per 0.0, senza bisogno di un branch nel codice shader.

---

## Differenze tra gli Shader degli Oggetti

Non tutti gli oggetti usano lo stesso shader. Ecco le principali variazioni:

### Piano del terreno (`src/models/plane.js`)

Stessa struttura del verme, ma con le seguenti differenze:

- `ambientStrength = 0.05` — il terreno è illuminato principalmente dai faretti, la componente ambientale è quasi nulla
- `specularStrength = 0.005` — il terreno organico non è lucido
- Il colore base viene letto da una texture (`texture2D(u_texture, v_texCoord).rgb`) invece di un attributo per vertice

```glsl
// src/models/plane.js — fragment shader
vec3 color = texture2D(u_texture, v_texCoord).rgb;
// ...identico al verme ma con ambientStrength=0.05 e specularStrength=0.005
```

### Stanza laboratorio (`src/models/room.js`)

La stanza aggiunge l'**attenuazione quadratica** per simulare la caduta di intensità con la distanza, necessaria perché le pareti sono molto più lontane dai faretti rispetto al terreno della teca:

$$a(d) = \frac{1}{1 + k_L \cdot d + k_Q \cdot d^2}$$

con $k_L = 0.02$ e $k_Q = 0.003$.

```glsl
// src/models/room.js — fragment shader
float dist        = length(u_lightPositions[i] - v_worldPos);
float attenuation = 1.0 / (1.0 + 0.02 * dist + 0.003 * dist * dist);

vec3 diffuse  = diff  * color * u_lightIntensities[i] * attenuation;
vec3 specular = spec  * vec3(1.0) * specularStrength * u_lightIntensities[i] * attenuation;
```

Il termine quadratico domina a grandi distanze: a $d = 30$ contribuisce $k_Q \cdot 900 = 2.7$ contro $k_L \cdot 30 = 0.6$ del termine lineare. Questo produce la caduta rapida caratteristica di un laboratorio in penombra illuminato solo da spot locali.

I valori rappresentativi:

| Distanza | $a(d)$ | Zona |
|---|---|---|
| 0 | 1.00 | Sotto il faretto |
| 10 | ~0.67 | Vicino alla teca |
| 20 | ~0.38 | Metà stanza |
| 40 | ~0.15 | Parete |

Il piano del terreno e i vermi non usano attenuazione — sono già abbastanza vicini ai faretti, e l'attenuazione ridurrebbe troppo la loro luminosità.

### Bancone metallico (`src/models/cabinet.js`)

Il cabinet usa due texture (`u_texture` per il colore, `u_metalness` per la mappa di metalness) e aggiunge il **Fresnel**:

```glsl
// src/models/cabinet.js — fragment shader

// Legge metalness dal canale rosso della mappa
float metalness = texture2D(u_metalness, v_texcoord).r;

// Ambient dipende dalla metalness: metallo più brillante
float ambientStrength = mix(0.08, 0.25, metalness);

// Diffuse ridotta sulle zone metalliche (i metalli riflettono quasi tutto)
vec3 diffuse = diff * steelColor * (1.0 - metalness * 0.8) * u_lightIntensities[i] * attenuation;

// Shininess variabile: da 64 (plastica) a 256 (metallo lucido)
float shininess = mix(64.0, 256.0, metalness);
// Colore speculare interpola tra bianco e il colore del metallo stesso
vec3 specularColor = mix(vec3(1.0), steelColor, metalness);
vec3 specular = specularStrength * spec * specularColor * u_lightIntensities[i] * attenuation * u_advanced;
```

Il termine **Fresnel** approssima l'effetto per cui le superfici metalliche diventano più riflettenti a angoli radenti (basso $\cos\theta = \mathbf{v} \cdot \mathbf{n}$):

$$F \approx (1 - \cos\theta)^4$$

```glsl
float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
ambient += fresnel * steelColor * metalness * 0.5 * u_advanced;
```

Il Fresnel si attiva solo sulle zone metalliche (`* metalness`) ed è scalato dal flag `u_advanced`.

### Cibo (`src/models/food.js`)

Il cibo è un disco piatto orizzontale, quindi la sua normale è sempre $(0, 1, 0)$ — hardcoded nel fragment shader, senza bisogno di un buffer di normali:

```glsl
// src/models/food.js — fragment shader
vec3 normal = vec3(0.0, 1.0, 0.0);
```

Questo funziona perché il disco non viene mai ruotato: è sempre parallelo al piano XZ.

### Badge (`src/models/badge.js`)

Il badge ha tre modalità di disegno distinte selezionate dalla uniform `u_mode`:

```glsl
// src/models/badge.js — fragment shader
if (u_mode == 0) {
    baseColor = texture2D(u_texFront, v_texcoord).rgb;  // fronte: foto
} else if (u_mode == 1) {
    baseColor = texture2D(u_texBack,  v_texcoord).rgb;  // retro: testo
} else {
    baseColor = vec3(0.92, 0.92, 0.92);                 // bordi: plastica bianca
}
```

Tre draw call separate con diversi valori di `u_mode` disegnano fronte, retro e bordi laterali del badge con la stessa geometria e lo stesso shader.

---

## Trasformazione delle Normali

Le normali nel buffer OBJ sono in spazio modello. Per illuminare correttamente in world space, devono essere trasformate. Il vertex shader usa:

```glsl
v_normal = mat3(u_modelMatrix) * a_normal;
```

`mat3(u_modelMatrix)` estrae la sottomatrice 3×3 superiore sinistra della model matrix 4×4, eliminando la colonna e la riga di traslazione. Questo è corretto quando la model matrix contiene solo rotazioni e scaling uniforme (come nel caso dei vermi e di tutti gli oggetti nella scena), perché la direzione di una normale non deve cambiare con la traslazione dell'oggetto.

---

## Recap Parametri Phong per Oggetto

| Oggetto | `ambientStrength` | `specularStrength` | Shininess | Attenuazione | Note |
|---|---|---|---|---|---|
| Verme | 0.40 | 0.20 | 32 | No | Speculare bianco |
| Piano terreno | 0.05 | 0.005 | 8 | No | Texture ground |
| Stanza | 0.03 | 0.30 | 32 | Sì ($k_L=0.02$, $k_Q=0.003$) | Texture concrete/tiles |
| Cabinet | 0.08–0.25 | 0.80 | 64–256 | Sì | Metalness map + Fresnel |
| Cibo | 0.30 | 0.10 | 16 | No | Normale hardcoded (0,1,0) |
| Badge | 0.15 | 0.20 | 32 | Sì | Tre mode (foto/retro/bordi) |
| Faretto | — | — | — | — | Emissivo, colore costante |
| Teca | — | — | — | — | Colore costante ciano con alpha |
