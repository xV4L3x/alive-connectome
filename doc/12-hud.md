# Pannello di Controllo e Motor Override

## Struttura HUD

Il pannello di controllo è implementato con la libreria `dat.GUI` in `src/hud.js`. Ci sono due pannelli distinti con comportamenti diversi:

- **Pannello globale** (`gui`) — sempre visibile, creato una sola volta in `initHUD`
- **Pannello di selezione** (`selectionGui`) — appare quando un verme è selezionato, distrutto e ricreato ogni volta che la selezione cambia

```javascript
// src/hud.js — initHUD
function initHUD(worms, foods) {
    const gui = new dat.GUI();

    gui.add(params, 'shadows').name('Advanced Rendering');

    const lightsFolder = gui.addFolder('Lights');
    lightsFolder.add({l1:...}, 'l1', 0, 1).onChange(v => Lights.setIntensity(0, v));
    // ... 4 slider, uno per ogni faretto

    gui.add(actions, 'spawn').name("Spawn");
    gui.add(actions, 'spawnFood').name("Spawn Food");
    gui.add(cameraState, 'mode').name('Camera').listen();
}
```

### Slider Intensità Luci

I 4 slider controllano le intensità dei faretti via `Lights.setIntensity(index, value)`. Il `.onChange` garantisce che la modifica sia applicata immediatamente al frame successivo senza necessità di polling.

### Spawn Verme e Cibo

```javascript
// src/hud.js
spawn: function() {
    const x = (Math.random() * 2 - 1) * (TANK_WIDTH  - 1);
    const z = (Math.random() * 2 - 1) * (TANK_DEPTH  - 1);
    const heading = Math.random() * Math.PI * 2;
    worms.push(createWormInstance([x, 0, z], heading));
},
spawnFood: function() {
    const nutrients = 0.3 + Math.random() * 0.7;
    foods.push(createFoodInstance([x, 0.01, z], nutrients));
}
```

Il verme viene creato in una posizione casuale all'interno della teca (con margine di 1 unità dalle pareti) e con heading casuale. Il cibo ha `nutrients` casuale tra 0.3 e 1.0 — la dimensione iniziale del disco è già variata.

---

## Pannello di Selezione Verme

Quando un verme viene selezionato (`canvas.addEventListener('click', ...)`), `rebuildSelectionGui()` distrugge il pannello precedente e crea un nuovo pannello ancorato in alto a sinistra:

```javascript
// src/hud.js — rebuildSelectionGui
selectionGui = new dat.GUI({ autoPlace: true });
selectionGui.domElement.style.position = 'absolute';
selectionGui.domElement.style.top  = '0px';
selectionGui.domElement.style.left = '0px';
```

### Monitor Neurale in Tempo Reale

Il pannello mostra l'attivazione corrente di 8 gruppi di neuroni, aggiornata ogni frame via `updateHUD`:

```javascript
// src/hud.js — rebuildSelectionGui
const groups = {
    'Forward Circuit':  ['AVBL','AVBR','PVCL','PVCR'],
    'Backward Circuit': ['AVAL','AVAR','AVDL','AVDR','AVEL','AVER'],
    'Sensory — Light':  ['ASEL','ASER','AWCL','AWCR'],
    'Sensory — Food':   ['AWAL','AWAR','ADFL','ADFR'],
    'Touch — Head':     ['ALML','ALMR','AVM'],
    'Touch — Tail':     ['PLML','PLMR','PVM'],
    'Motors — Fwd':     ['DB01','DB02','DB03','VB01','VB02','VB03'],
    'Motors — Bwd':     ['DA01','DA02','DA03','VA01','VA02','VA03'],
};

for (const [label, keys] of Object.entries(groups)) {
    for (const k of keys) info[k] = 0;
    const f = selectionGui.addFolder(label);
    for (const k of keys) f.add(info, k, 0, 1).step(0.01).listen();
}
```

Il `.listen()` di dat.GUI fa sì che i widget si aggiornino automaticamente quando il valore JavaScript cambia, senza dover chiamare manualmente `update()`. `updateHUD()` viene chiamato ogni frame per aggiornare i valori:

```javascript
// src/hud.js — updateHUD
function updateHUD() {
    if (selectionGui && selectionGui._worm) {
        const c = selectionGui._worm.connectome;
        const info = selectionGui._info;
        for (const key of Object.keys(info)) {
            if (key !== 'amplitude' && key !== 'direction' && key !== 'speed' && key !== 'light')
                info[key] = c.getNeuronActivity(key);
        }
        const wp = c.getWaveParams();
        info.amplitude = wp.amplitude;
        info.direction = wp.direction;
        info.speed = Math.abs(selectionGui._worm.speed);
        info.light = Lights.computeAt(selectionGui._worm.position);
    }
}
```

---

## Motor Override e Thumbstick

Il bottone "Motor Override" abilita il controllo manuale del verme selezionato. Il connectome viene completamente bypassato durante l'override.

### Attivazione

```javascript
// src/hud.js — rebuildSelectionGui
selectionGui.add({
    toggleOverride: () => {
        selectedWorm.overrideActive = !selectedWorm.overrideActive;
        if (!selectedWorm.overrideActive) {
            selectedWorm.overrideInput.x = 0;
            selectedWorm.overrideInput.z = 0;
        }
        updateThumbstickVisibility();
    }
}, 'toggleOverride').name('Motor Override');
```

Quando `overrideActive = true`, il thumbstick HTML diventa visibile (`display: flex`) e la funzione `updateWorm` salta l'intero blocco connectome, applicando direttamente l'input del joystick.

### Clamping Radiale del Thumbstick

```javascript
// src/hud.js — applyThumbstickInput
let dx = clientX - thumbstickOrigin.x;
let dy = clientY - thumbstickOrigin.y;
const dist = Math.sqrt(dx*dx + dy*dy);

if (dist > radius) {
    dx = dx / dist * radius;   // limita al raggio
    dy = dy / dist * radius;
}

selectedWorm.overrideInput.x =  dx / radius;   // [-1, 1]
selectedWorm.overrideInput.z = -dy / radius;   // [-1, 1], Y→Z invertito
```

Il vettore $(dx, dy)$ viene normalizzato e riscalato al raggio se supera il bordo del base, producendo un'input circolare. Il segno negativo su `dy` converte le coordinate DOM (Y crescente verso il basso) in coordinate di movimento (Z positivo = avanti).

### Direzione Committata (`overrideDir`)

Al `pointerdown`, la direzione viene fissata in base alla posizione iniziale del joystick:

```javascript
// src/hud.js — pointerdown handler
selectedWorm.overrideDir = selectedWorm.overrideInput.z >= 0 ? 1 : -1;
```

Questo evita che ruotare il thumbstick dalla metà superiore a quella inferiore inverta la direzione di marcia a metà gesture. `overrideDir` non viene mai aggiornato durante il drag.

### Fisica dell'Override

```javascript
// src/models/worm.js — updateWorm (override path)
if (wormInstance.overrideActive) {
    const ix = wormInstance.overrideInput.x;
    const iz = wormInstance.overrideInput.z;
    const magnitude = Math.sqrt(ix*ix + iz*iz);

    if (magnitude > 0.01) {
        const steerDir  = wormInstance.overrideDir < 0 ? 1 : -1;
        const steerScale = 1.0 - Math.abs(ix / magnitude) * 0.4;
        wormInstance.heading += steerDir * ix * steerScale * OVERRIDE_TURN_RATE * deltaTime;
        wormInstance.speed    = magnitude * MAX_SPEED * wormInstance.overrideDir;
    } else {
        wormInstance.speed = 0;
    }
    // aggiorna posizione e controlla muri...
    return;  // salta tutto il resto (connectome, pirouette, chemotassi...)
}
```

**`steerDir`** — compensa la direzione: "destra su schermo = sterza a destra" deve funzionare sia in avanti che in indietro. Quando si va indietro (`overrideDir < 0`), lo stesso incremento di heading porta in direzione opposta su schermo — invertire `steerDir` corregge questo.

**`steerScale = 1 - |ix/magnitude| * 0.4`** — riduce la rotazione quando il thumbstick è in posizione diagonale:
- thumbstick puramente laterale: $|ix/magnitude| = 1$ → steerScale = 0.6 (rotazione attenuata del 40%)
- thumbstick puramente verticale: $|ix/magnitude| = 0$ → steerScale = 1.0 (rotazione piena)

Questo riduce la tendenza del verme a girare su se stesso in posizione diagonale.

**`OVERRIDE_TURN_RATE = 3.5` rad/s** — velocità di rotazione durante l'override, più alta di `TURN_SPEED = 0.5` per dare maggiore reattività al controllo manuale.

### Controllo da Tastiera

Oltre al thumbstick touch, il motor override risponde ai tasti **WASD** e **frecce direzionali**. L'implementazione usa un `Set` di tasti premuti per gestire combinazioni simultanee:

```javascript
// src/hud.js
const keysDown = new Set();

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return; // non interferisce con i campi dat.GUI
    keysDown.add(e.code);
    applyKeyboardOverrideInput();
});

document.addEventListener('keyup', (e) => {
    keysDown.delete(e.code);
    applyKeyboardOverrideInput();
    const anyDir = keysDown.has('KeyW') || keysDown.has('KeyS') || ...;
    if (!anyDir) {
        selectedWorm.overrideInput.x = 0;
        selectedWorm.overrideInput.z = 0;
    }
});
```

`applyKeyboardOverrideInput` mappa i tasti premuti su `overrideInput.{x, z}` binari (−1, 0, +1), producendo lo stesso effetto del thumbstick portato al bordo:

```javascript
// src/hud.js — applyKeyboardOverrideInput
function applyKeyboardOverrideInput() {
    if (!selectedWorm || !selectedWorm.overrideActive) return;

    let x = 0, z = 0;
    if (keysDown.has('KeyW') || keysDown.has('ArrowUp'))    z =  1;
    if (keysDown.has('KeyS') || keysDown.has('ArrowDown'))  z = -1;
    if (keysDown.has('KeyA') || keysDown.has('ArrowLeft'))  x = -1;
    if (keysDown.has('KeyD') || keysDown.has('ArrowRight')) x =  1;

    selectedWorm.overrideInput.x = x;
    selectedWorm.overrideInput.z = z;
    if (z !== 0) selectedWorm.overrideDir = z > 0 ? 1 : -1;
}
```

Due accorgimenti:
- La guardia `e.target.tagName === 'INPUT'` evita che premere un tasto mentre il cursore è in un campo di testo di dat.GUI (per modificare un valore numerico) attivi il controllo del verme.
- `overrideDir` viene aggiornato solo quando `z ≠ 0` — premere solo i tasti laterali non cambia la direzione di marcia, il verme ruota nella direzione corrente senza invertire.

### Gestione Touch con Pointer Events

Il thumbstick usa la **Pointer Events API** invece dei Mouse Events per gestire mouse e touch con lo stesso codice:

```javascript
// src/hud.js
document.getElementById('thumbstick-base').addEventListener('pointerdown', (e) => {
    thumbstickActive = true;
    // calcola centro del base...
    applyThumbstickInput(e.clientX, e.clientY);
});

document.addEventListener('pointermove', (e) => {
    if (!thumbstickActive) return;
    applyThumbstickInput(e.clientX, e.clientY);
});

document.addEventListener('pointerup', () => {
    thumbstickActive = false;
    // riporta il knob al centro, azzera input
});
```

I listener `pointermove` e `pointerup` sono sul `document` (non sull'elemento base): questo garantisce la ricezione degli eventi anche quando il dito/mouse esce dall'elemento durante il drag.

L'elemento thumbstick ha `touch-action: none` nel CSS per disabilitare lo scroll/zoom nativo del browser durante il trascinamento. Il knob ha `pointer-events: none` per far passare tutti gli eventi al base sottostante senza intercettarli.
