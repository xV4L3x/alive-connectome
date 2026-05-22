# Sistema Camera

## Camera Orbitale in Coordinate Sferiche

La camera predefinita orbita attorno a un punto target usando **coordinate sferiche**. Lo stato è:

```javascript
// src/core/camera.js — createCamera
{
    azimuth:   0.0,   // φ — angolo orizzontale (piano XZ)
    elevation: 0.3,   // θ — angolo verticale
    distance:  30,    // r — distanza dal target
    target:    [0, 0, 0],
}
```

### Conversione a Coordinate Cartesiane

```javascript
// src/core/camera.js — computeEye
function computeEye(camera) {
    const x = camera.distance * Math.cos(camera.elevation) * Math.sin(camera.azimuth);
    const y = camera.distance * Math.sin(camera.elevation);
    const z = camera.distance * Math.cos(camera.elevation) * Math.cos(camera.azimuth);
    return [
        camera.target[0] + x,
        camera.target[1] + y,
        camera.target[2] + z,
    ];
}
```

$$x = r \cdot \cos\theta \cdot \sin\phi$$
$$y = r \cdot \sin\theta$$
$$z = r \cdot \cos\theta \cdot \cos\phi$$

La posizione dell'occhio è poi spostata del vettore target (per orbitare attorno al target, non all'origine).

### Controlli Mouse

```javascript
// src/core/camera.js — setupCameraControls
canvas.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    if (!getEnabled()) return;           // disabilitato in modalità 1a/3a persona

    camera.azimuth   -= dx * 0.005;     // drag orizzontale → azimuth
    camera.elevation += dy * 0.005;     // drag verticale   → elevation
    camera.elevation  = Math.max(-Math.PI / 2 + 0.01,
                         Math.min( Math.PI / 2 - 0.01, camera.elevation));
});

canvas.addEventListener('wheel', (e) => {
    if (!getEnabled()) return;
    camera.distance += e.deltaY * 0.01;
    camera.distance  = Math.max(0.5, Math.min(50, camera.distance));
}, { passive: false });
```

L'elevation è vincolata a $(-\pi/2 + 0.01,\ \pi/2 - 0.01)$ per evitare le **singolarità ai poli**: a $\theta = \pm\pi/2$ la camera guarda esattamente verso l'alto o il basso, e il vettore "up" $(0,1,0)$ diventa parallelo alla direzione di vista. In questo caso `lookAt` non riesce a determinare l'orientamento orizzontale della camera.

### Vincolo Piano Pavimento

La camera non può scendere sotto il pavimento della stanza (Y = $-\text{CABINET\_HEIGHT}$). Il vincolo viene imposto in `resolveCamera` calcolando l'elevation minima dinamicamente:

```javascript
// src/core/camera.js — resolveCamera
const sinMin  = Math.max(-1, (-CABINET_HEIGHT + 0.5 - camera.target[1]) / camera.distance);
const minElev = Math.asin(sinMin);
camera.elevation = Math.max(minElev, camera.elevation);
```

Dalla formula $y_{eye} = t_y + r \cdot \sin\theta \geq -H_{cabinet} + \varepsilon$, si ricava:

$$\theta_{min} = \arcsin\!\left(\text{clamp}\!\left(\frac{-H_{cabinet} + \varepsilon - t_y}{r},\ -1,\ 1\right)\right)$$

Il `clamp` in $[-1, 1]$ è necessario perché `arcsin` è definita solo in quell'intervallo: senza di esso, se la camera fosse molto vicina al target, il rapporto potrebbe uscire dal dominio valido. Clampare $\theta$ invece della posizione Y preserva la distanza $r$ intatta.

---

## Tre Modalità Camera

La modalità è controllata dalla variabile globale `cameraMode` (0, 1, 2):

```javascript
// src/core/camera.js — resolveCamera
function resolveCamera(camera, cameraMode, selectedWorm) {
    if (cameraMode === 1 && selectedWorm) {
        const r = computeThirdPerson(selectedWorm);
        return { eye: r.eye, lookTarget: r.target };
    }
    if (cameraMode === 2 && selectedWorm) {
        const r = computeFirstPerson(selectedWorm);
        return { eye: r.eye, lookTarget: r.target };
    }
    // modalità 0: free camera orbitale
    // ...vincolo pavimento...
    return { eye: computeEye(camera), lookTarget: camera.target };
}
```

| Valore | Modalità | Descrizione |
|---|---|---|
| `0` | Free Camera | Vista orbitale predefinita, controlli mouse abilitati |
| `1` | Third Person | Camera dietro e sopra il verme selezionato |
| `2` | First Person | Camera agli occhi del verme, guarda nella direzione di marcia |

### Third Person

```javascript
// src/core/camera.js — computeThirdPerson
function computeThirdPerson(worm) {
    const forward = [Math.sin(worm.heading), 0, Math.cos(worm.heading)];

    const eye = [
        worm.position[0] - forward[0] * 5.0,   // 5 unità dietro
        worm.position[1] + 3.0,                  // 3 unità sopra
        worm.position[2] - forward[2] * 5.0,
    ];

    const target = [
        worm.position[0],
        worm.position[1] + 1.0,    // punta al centro del verme, leggermente sopra
        worm.position[2],
    ];
    return { eye, target };
}
```

Il vettore `forward = [sin(heading), 0, cos(heading)]` è la direzione di marcia del verme. La camera si posiziona sottraendo $5 \cdot \text{forward}$ (arretra) e sommando $(0, 3, 0)$ (sale). Il target è il centro del verme leggermente sollevato per evitare di puntare al pavimento.

### First Person

```javascript
// src/core/camera.js — computeFirstPerson
function computeFirstPerson(worm) {
    const forward = [Math.sin(worm.heading), 0, Math.cos(worm.heading)];

    const eye = [
        worm.position[0] + forward[0] * 1.5,   // 1.5 unità avanti
        worm.position[1] + 1.0,                  // altezza testa
        worm.position[2] + forward[2] * 1.5,
    ];

    const target = [
        eye[0] + forward[0] * 5.0,    // 5 unità avanti dall'occhio
        eye[1],                         // stessa altezza
        eye[2] + forward[2] * 5.0,
    ];
    return { eye, target };
}
```

L'occhio è posizionato davanti al verme invece che dietro (`+forward` invece di `-forward`), ad altezza testa. Il punto di mira è 5 unità più avanti nella stessa direzione, alla stessa altezza.

### Disabilitazione dei Controlli

```javascript
// src/main.js
setupCameraControls(canvas, camera, () => cameraMode === 0);
```

`setupCameraControls` riceve la funzione `getEnabled` che viene interrogata a ogni evento mouse. I listener di `mousemove` e `wheel` eseguono un early return se `getEnabled()` ritorna `false`. I listener rimangono attivi ma inattivi nelle modalità 1 e 2.

### Ciclo delle Modalità

Il bottone "Change View" nel pannello di selezione cicla tra le tre modalità:

```javascript
// src/hud.js
selectionGui.add({
    changeView: () => { cameraMode = (cameraMode + 1) % 3; updateCameraModeDisplay(); }
}, 'changeView').name('Change View');
```

Quando il verme viene deselezionato o ucciso, `rebuildSelectionGui()` reimposta `cameraMode = 0`.
