# Alive Connectome — Documentazione Tecnica

Progetto d'esame per il corso di **Computer Graphics**, Magistrale in Informatica, Università di Bologna.

---

## Descrizione del Progetto

Un ecosistema virtuale abitato da esemplari del nematode *C. elegans*, il cui comportamento locomotorio è interamente guidato da una simulazione della rete sinaptica reale del verme, tratta dal dataset [OpenWorm](https://openworm.org). La scena rappresenta una teca da laboratorio illuminata da faretti, posta su un bancone metallico in una stanza buia. I vermi si muovono autonomamente reagendo a luce, fame e collisioni. L'utente può spawnare vermi e cibo, modificare l'intensità dei faretti, selezionare singoli vermi per osservarne l'attività neurale in tempo reale, e prenderne il controllo manuale.

---

## Architettura del Codice

```
alive-connectome/
├── index.html                  # Entry point HTML, carica script nell'ordine corretto
├── src/
│   ├── main.js                 # Loop di rendering principale, orchestrazione
│   ├── connectome.js           # Motore di simulazione neurale
│   ├── hud.js                  # Pannello dat.GUI + thumbstick
│   ├── core/
│   │   ├── camera.js           # Camera orbitale e modalità 1a/3a persona
│   │   ├── lights.js           # Sistema multi-luce (4 faretti)
│   │   └── utilities.js        # Parser OBJ/MTL, shader compiler, ray casting, resize
│   └── models/
│       ├── worm.js             # Shader verme, fisica del movimento, ombre
│       ├── food.js             # Shader e geometria disco cibo
│       ├── plane.js            # Terreno della teca con texture
│       ├── tank.js             # Teca di vetro trasparente
│       ├── cabinet.js          # Bancone metallico (texture + metalness)
│       ├── spotlight.js        # Faretti cilindrici procedurali
│       ├── room.js             # Stanza laboratorio (pavimento + pareti)
│       └── badge.js            # Badge con foto + corda
└── resources/
    ├── models/worm/            # worm-cuticle.obj + .mtl (VirtualWorm, MIT)
    ├── data/herm_full_edgelist.csv  # Connectome C. elegans (OpenWorm, MIT)
    ├── textures/               # JPG/PNG per terreno, pareti, metallo, badge
    └── lib/                    # m4.js, webgl-utils.js, dat.gui.js, gl-matrix.js
```

### Ordine di caricamento degli script

L'ordine in `index.html` è vincolante perché tutti i file usano variabili globali definiti in altri file senza moduli ES:

1. `utilities.js` — funzioni base usate da tutti gli altri
2. `camera.js`
3. `connectome.js`
4. `plane.js` → `cabinet.js` → `tank.js` (ordine per le costanti: `PLANE_EXTENSION` usata da `cabinet.js`, `CABINET_HEIGHT` usata da `room.js`)
5. `lights.js` (dipende da `TANK_WIDTH/HEIGHT/DEPTH` definite in `tank.js`)
6. `spotlight.js`, `worm.js`, `food.js`, `room.js`, `badge.js`
7. `hud.js` (usa `selectedWorm` e funzioni degli altri file)
8. `main.js`

---

## Indice della Documentazione

| File | Contenuto |
|---|---|
| [01-webgl-pipeline.md](01-webgl-pipeline.md) | Setup WebGL, compilazione shader, pipeline MVP, parser OBJ/MTL |
| [02-phong-illuminazione.md](02-phong-illuminazione.md) | Modello Phong: ambient, diffuse, specular — teoria e implementazione GLSL |
| [03-shader-avanzati.md](03-shader-avanzati.md) | Ombre planari, vetro trasparente, metalness cabinet, badge multi-texture |
| [04-connectome.md](04-connectome.md) | Simulazione neurale del *C. elegans*: leaky integrator, stimoli, output locomotorio |
| [05-movimento-verme.md](05-movimento-verme.md) | Fisica del movimento, pirouette, omega turn, chemotassi, fotofobia |
| [06-camera.md](06-camera.md) | Camera orbitale con coordinate sferiche, modalità free/third/first person |
| [07-collisioni.md](07-collisioni.md) | Collisioni verme-muro e verme-verme: separazione fisica e risposta comportamentale |
| [08-cibo-fame.md](08-cibo-fame.md) | Oggetti cibo (disco procedurale), sistema fame progressiva, morte per inedia |
| [09-ray-casting.md](09-ray-casting.md) | Selezione verme con mouse: unprojection, ray-sphere intersection |
| [10-geometria-procedurale.md](10-geometria-procedurale.md) | Generazione runtime di teca, faretto, cibo, badge arrotondato |
| [11-texture.md](11-texture.md) | Caricamento texture, UV mapping, mipmap, metalness map |
| [12-hud.md](12-hud.md) | Pannello dat.GUI, monitor neurale in tempo reale, thumbstick, motor override |
| [13-sistema-luci.md](13-sistema-luci.md) | Sistema multi-luce: attenuazione, `computeAt` per il connectome, `computeDirectionAt` per la fotofobia |

---

## Vincoli del Professore Soddisfatti

| Requisito | Implementazione |
|---|---|
| Geometria 3D prospettica | Matrice di proiezione prospettica `m4.perspective` + pipeline MVP su tutti gli oggetti |
| Oggetto principale OBJ | `worm-cuticle.obj` (VirtualWorm, ~16k vertici), parser scritto da zero |
| Oggetto animato | Verme deformato ogni frame da onda sinusoidale nel vertex shader, guidato dal connectome |
| Input tastiera + mouse | Camera drag/scroll, selezione click, thumbstick touch per mobile |
| Illuminazione (≥ 1 luce) | 4 faretti agli angoli della teca, ciclo Phong per ogni luce |
| Texture su ≥ 2 oggetti | Terreno (ground), pareti (concrete), bancone (metal+metalness), badge (foto) |
| Foto dell'autore come texture | `badge-front.png` sul badge che pende nella scena |
| Pannello di controllo 2D | `dat.GUI` con slider intensità luci, spawn, monitor neurale per-verme |
| Advanced rendering | Ombre planari (`planar shadow projection`) + trasparenza teca (`alpha blending`) |
| Fruibile da mobile | Pointer Events API sul thumbstick, `touch-action: none` |

---

## Librerie Esterne Usate

Tutte fornite dal professore, nessuna dipendenza esterna aggiuntiva:

- `m4.js` — matematica matriciale 4×4 (trasformazioni, proiezione, lookAt, inverse)
- `webgl-utils.js` — utility WebGL generali
- `gl-matrix.js` — algebra lineare
- `dat.gui.js` — pannello di controllo GUI

---

## Crediti Asset

- **Modello verme**: [VirtualWorm](http://www.openworm.org/animatedworm.html) — WormBase / Caltech, licenza MIT
- **Dataset connectome**: [OpenWorm / CElegansNeuroML](https://github.com/openworm/CElegansNeuroML) — licenza MIT
- **Texture**: CC0 da [ambientcg.com](https://ambientcg.com)
