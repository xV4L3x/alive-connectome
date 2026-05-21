let selectionGui = null;
const params = { shadows: true };
const cameraState = { mode: 'Free Camera' };
const MODE_LABELS = ['Free Camera', 'Third Person', 'First Person'];

function updateThumbstickVisibility() {
    const base = document.getElementById('thumbstick-base');
    const active = selectedWorm && selectedWorm.overrideActive;
    base.style.display = active ? 'flex' : 'none';
}

let thumbstickActive = false;
let thumbstickOrigin = { x: 0, y: 0 };

function applyThumbstickInput(clientX, clientY) {
    const base = document.getElementById('thumbstick-base');
    const knob = document.getElementById('thumbstick-knob');
    const radius = base.offsetWidth / 2;

    let dx = clientX - thumbstickOrigin.x;
    let dy = clientY - thumbstickOrigin.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    if (dist > radius) {
        //radial normalization
        dx = dx / dist * radius;
        dy = dy / dist * radius;
    }

    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    if (selectedWorm && selectedWorm.overrideActive) {
        selectedWorm.overrideInput.x = dx / radius;
        selectedWorm.overrideInput.z = -dy / radius;
    }
}

document.getElementById('thumbstick-base').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    thumbstickActive = true;
    const rect = e.currentTarget.getBoundingClientRect();
    //center in the viewport
    thumbstickOrigin.x = rect.left + rect.width / 2;
    thumbstickOrigin.y = rect.top + rect.height / 2;
    applyThumbstickInput(e.clientX, e.clientY);
    if (selectedWorm && selectedWorm.overrideActive) {
        selectedWorm.overrideDir = selectedWorm.overrideInput.z >= 0 ? 1 : -1;
    }
});

document.addEventListener('pointermove', (e) => {
    if (!thumbstickActive) return;
    e.preventDefault();
    applyThumbstickInput(e.clientX, e.clientY);
});

document.addEventListener('pointerup', () => {
    if (!thumbstickActive) return;
    thumbstickActive = false;
    const knob = document.getElementById('thumbstick-knob');
    knob.style.transform = 'translate(-50%, -50%)';
    if (selectedWorm) {
        selectedWorm.overrideInput.x = 0;
        selectedWorm.overrideInput.z = 0;
    }
});

function updateCameraModeDisplay() {
    cameraState.mode = MODE_LABELS[cameraMode];
}

function rebuildSelectionGui() {
   if (!selectedWorm) {
        if (selectionGui) { selectionGui.destroy(); selectionGui = null; }
        cameraMode = 0;
        updateCameraModeDisplay();
        return;
    }
    if (selectionGui) { selectionGui.destroy(); selectionGui = null; }

    if (!selectedWorm) return;

    selectionGui = new dat.GUI({ autoPlace: true });
    selectionGui.domElement.style.position = 'absolute';
    selectionGui.domElement.style.top  = '0px';
    selectionGui.domElement.style.left = '0px';

    const info = { amplitude: 0, direction: 0, speed: 0, light: 0 };

    selectionGui._info = info;
    selectionGui._worm = selectedWorm;

    const groups = {
        'Forward Circuit': ['AVBL','AVBR','PVCL','PVCR'],
        'Backward Circuit': ['AVAL','AVAR','AVDL','AVDR','AVEL','AVER'],
        'Sensory — Light': ['ASEL','ASER','AWCL','AWCR'],
        'Sensory — Food': ['AWAL','AWAR','ADFL','ADFR'],
        'Touch — Head': ['ALML','ALMR','AVM'],
        'Touch — Tail': ['PLML','PLMR','PVM'],
        'Motors — Fwd': ['DB01','DB02','DB03','VB01','VB02','VB03'],
        'Motors — Bwd': ['DA01','DA02','DA03','VA01','VA02','VA03'],
    };

    for (const [label, keys] of Object.entries(groups)) {
        for (const k of keys) info[k] = 0;
        const f = selectionGui.addFolder(label);
        for (const k of keys) f.add(info, k, 0, 1).step(0.01).listen();
    }

    const motionFolder = selectionGui.addFolder('Motion');
    motionFolder.add(info, 'amplitude', 0,  1).step(0.01).listen();
    motionFolder.add(info, 'direction', -1, 1).step(1).listen();
    motionFolder.add(info, 'speed', 0,  2).step(0.01).listen();
    motionFolder.add(info, 'light', 0, 1).step(0.01).listen().name('Light');

    motionFolder.add(selectionGui._worm, 'hunger', 0, 1).step(0.01).listen().name('Hunger');
    motionFolder.open();

    selectionGui.add({
        copy: () => {
            const lines = Object.entries(info).map(([k, v]) => `${k}: ${v.toFixed(4)}`).join('\n');
            navigator.clipboard.writeText(lines);
        }
    }, 'copy').name('Copy State');

    selectionGui.add({
        deselect: () => { selectedWorm = null; rebuildSelectionGui(); }
    }, 'deselect').name('Deselect');

    selectionGui.add({
        kill: () => { selectedWorm.alive = false; selectedWorm = null; rebuildSelectionGui(); }
    }, 'kill').name('Kill Worm');

    selectionGui.add({
        changeView: () => { cameraMode = (cameraMode + 1) % 3; updateCameraModeDisplay(); }
    }, 'changeView').name('Change View');

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
}

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

function initHUD(worms, foods) {
    const gui = new dat.GUI();

    gui.add(params, 'shadows').name('Advanced Rendering');

    const lightsFolder = gui.addFolder('Lights');
    const lightIntensities = Lights.getIntensitiesRaw();
    lightsFolder.add({ l1: lightIntensities[0] }, 'l1', 0, 1).step(0.01).name('Front Left') .onChange(v => Lights.setIntensity(0, v));
    lightsFolder.add({ l2: lightIntensities[1] }, 'l2', 0, 1).step(0.01).name('Front Right').onChange(v => Lights.setIntensity(1, v));
    lightsFolder.add({ l3: lightIntensities[2] }, 'l3', 0, 1).step(0.01).name('Back Left')  .onChange(v => Lights.setIntensity(2, v));
    lightsFolder.add({ l4: lightIntensities[3] }, 'l4', 0, 1).step(0.01).name('Back Right') .onChange(v => Lights.setIntensity(3, v));
    lightsFolder.open();

    const actions = {
        spawn: function() {
            const margin = 1.0;
            const x = (Math.random() * 2 - 1) * (TANK_WIDTH  - margin);
            const z = (Math.random() * 2 - 1) * (TANK_DEPTH  - margin);
            const heading = Math.random() * Math.PI * 2;
            worms.push(createWormInstance([x, 0, z], heading));
            console.log('Worms alive:', worms.length);
        },
        spawnFood: function() {
            const margin = 0.5;
            const x = (Math.random() * 2 - 1) * (TANK_WIDTH  - margin);
            const z = (Math.random() * 2 - 1) * (TANK_DEPTH  - margin);
            const nutrients = 0.3 + Math.random() * 0.7;
            foods.push(createFoodInstance([x, 0.01, z], nutrients));
        }

    };
    gui.add(actions, 'spawn').name("Spawn");
    gui.add(actions, 'spawnFood').name("Spawn Food");

    gui.add(cameraState, 'mode').name('Camera').listen();
}
