# Sistema Texture

## Caricamento e Upload su GPU

Tutte le texture vengono caricate in modo asincrono tramite Promise. Il pattern standard usato in tutti i moduli del progetto:

```javascript
// es. src/models/plane.js — initPlane
const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = 'resources/textures/Ground033_1K-JPG_Color.jpg';
});

const texture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, texture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
gl.generateMipmap(gl.TEXTURE_2D);
```

Le chiamate WebGL:
- `gl.createTexture()` — alloca un oggetto texture sulla GPU
- `gl.bindTexture(gl.TEXTURE_2D, texture)` — lo imposta come texture attiva
- `gl.texImage2D(...)` — copia i pixel dell'immagine dalla CPU alla GPU
- `gl.generateMipmap(gl.TEXTURE_2D)` — genera automaticamente le versioni ridotte (mipmap)

---

## Mipmap e Filtri

Le mipmap sono versioni pre-ridotte della texture a risoluzioni dimezzate successive (512×512, 256×256, 128×128...). La GPU sceglie automaticamente quale livello usare in base alla dimensione del texel proiettato sullo schermo, evitando l'**aliasing** (moiré) su superfici viste a distanza.

```javascript
// Filtro per texture lontane (usa mipmap)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
// Filtro per texture vicine (interpolazione bilineare)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
```

`LINEAR_MIPMAP_LINEAR` (trilinear filtering): interpola bilineare *all'interno* del livello mipmap più vicino, poi interpola tra due livelli mipmap adiacenti — la qualità più alta disponibile in WebGL senza estensioni.

`LINEAR` per il mag filter: interpola tra i 4 texel più vicini quando la texture è ingrandita, producendo un aspetto morbido invece di blocchetti pixelati.

---

## Texture Repeat e Tiling

Le superfici grandi (terreno, pareti) usano UV che vanno oltre [0,1] per fare tiling:

```javascript
// Piano terreno — src/models/plane.js
const planeUVs = new Float32Array([
    0, 0,    0, 1,    1, 0,
    0, 1,    1, 1,    1, 0,
]);
// UV nel range [0,1] → la texture copre tutto il piano una sola volta
```

```javascript
// Stanza — src/models/room.js
const TILE_REPEAT  = 2;
const WALL_REPEAT_H = 8;
const WALL_REPEAT_V = 3;

const roomFloorUVs = new Float32Array([
    0,           0,
    0,           TILE_REPEAT,   // U=2 → la texture si ripete 2 volte
    TILE_REPEAT, 0,
    // ...
]);
```

Le UV fuori da [0,1] funzionano grazie al wrapping mode:

```javascript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
```

`gl.REPEAT` fa sì che la texture si ripeta (tiling) quando le UV escono dal range unitario. Senza questo flag la GPU userebbe `gl.CLAMP_TO_EDGE` e lo sforamento produrrebbe un artefatto di bordo.

---

## Texture nel Fragment Shader

La texture viene letta con `texture2D`:

```glsl
// src/models/plane.js — fragment shader
uniform sampler2D u_texture;
// ...
vec3 color = texture2D(u_texture, v_texCoord).rgb;
```

`sampler2D` è il tipo GLSL per le texture 2D. L'istruzione `texture2D(sampler, uv)` campiona la texture nella posizione UV interpolata dal vertex shader, restituendo un `vec4(r,g,b,a)`. Il `.rgb` estrae solo i tre canali colore.

L'associazione tra l'uniform `sampler2D` e l'unità texture viene fatta in JavaScript:

```javascript
// src/models/plane.js — drawPlane
gl.activeTexture(gl.TEXTURE0);     // seleziona unità 0
gl.bindTexture(gl.TEXTURE_2D, plane.texture);
gl.uniform1i(plane.locations.textureLoc, 0);   // dice allo shader di usare unità 0
```

---

## Texture Multiple per Oggetto — Cabinet

Il cabinet usa due texture distinte in due unità diverse:

```javascript
// src/models/cabinet.js — drawCabinet
gl.activeTexture(gl.TEXTURE0);                         // unità 0
gl.bindTexture(gl.TEXTURE_2D, cabinet.texture);         // color map
gl.uniform1i(cabinet.locations.texture, 0);

gl.activeTexture(gl.TEXTURE1);                         // unità 1
gl.bindTexture(gl.TEXTURE_2D, cabinet.metalnessTexture); // metalness map
gl.uniform1i(cabinet.locations.metalness, 1);
```

Nel fragment shader si leggono entrambe:

```glsl
// src/models/cabinet.js — fragment shader
uniform sampler2D u_texture;    // color
uniform sampler2D u_metalness;  // metalness

vec3 steelColor = texture2D(u_texture,  v_texcoord).rgb;
float metalness = texture2D(u_metalness, v_texcoord).r;  // solo canale rosso
```

La **metalness map** è una texture in grayscale: il canale rosso (`.r`) vale 0 nelle zone non metalliche (es. plastica nera) e 1 nelle zone metalliche (acciaio lucido). Viene usata per interpolare i parametri Phong tra le due modalità materiale (vedi [02-phong-illuminazione.md](02-phong-illuminazione.md)).

---

## Texture del Badge — `UNPACK_FLIP_Y_WEBGL`

Il badge usa un'impostazione speciale:

```javascript
// src/models/badge.js — initBadge
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frontImage);
```

`UNPACK_FLIP_Y_WEBGL` capovolge l'immagine verticalmente durante l'upload. Questa opzione è necessaria perché WebGL ha il sistema di coordinate UV con Y=0 in basso, mentre le immagini PNG/JPG hanno il pixel (0,0) in alto a sinistra. Senza questo flip, le texture del badge sarebbero capovolte.

Il badge usa `gl.RGBA` (non `gl.RGB`) perché la PNG del badge potrebbe avere un canale alpha per la trasparenza.

Il wrapping è `CLAMP_TO_EDGE` invece di `REPEAT`:

```javascript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
```

`CLAMP_TO_EDGE` fa sì che UV fuori da [0,1] usino il colore del bordo invece di ripetere la texture — appropriato per un'immagine fotografica che non deve fare tiling.

---

## Elenco Texture Usate

| Oggetto | File | Formato | Wrapping | Uso |
|---|---|---|---|---|
| Terreno teca | `Ground033_1K-JPG_Color.jpg` | RGB | REPEAT | Colore diffuse |
| Pavimento stanza | `Tiles133D_1K-JPG_Color.jpg` | RGB | REPEAT, tiling ×2 | Piastrelle |
| Pareti/soffitto | `Concrete034_1K-JPG_Color.jpg` | RGB | REPEAT, tiling ×8 | Cemento |
| Bancone — colore | `Metal053B_1K-JPG_Color.jpg` | RGB | (default) | Acciaio |
| Bancone — metalness | `Metal053B_1K-JPG_Metalness.jpg` | RGB (grayscale) | (default) | Metalness mask |
| Badge — fronte | `badge-front.png` | RGBA | CLAMP_TO_EDGE | Foto autore |
| Badge — retro | `badge-rear.png` | RGBA | CLAMP_TO_EDGE | Testo badge |
