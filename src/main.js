'use strict';

/**
 * 
 * @param {HTMLCanvasElement} canvas 
 */
function resizeCanvas(canvas) {
    const displayWidth  = Math.round(canvas.clientWidth  * window.devicePixelRatio);
    const displayHeight = Math.round(canvas.clientHeight * window.devicePixelRatio);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width  = displayWidth;
      canvas.height = displayHeight;
    }
}

async function main() {
    /** @type (HTMLCanvasElement|null) */
    const canvas = document.getElementById('gl-canvas');
    const gl = canvas.getContext('webgl');

    if (!gl) {
        alert('WebGL is not supported by this browser!');
        throw new Error('WebGL not available');
    } 
    console.log('WebGL correctly initialized');


    const objFileResponse = await fetch('resources/models/worm/worm-cuticle.obj');
    const objFileContent = await objFileResponse.text();
    console.log("Obj File Loaded, length:", objFileContent.length);

    const mtlFileResponse = await fetch('resources/models/worm/worm-cuticle.mtl');
    const mtlFileContent = await mtlFileResponse.text();
    console.log("Mtl File Loaded, length:", mtlFileContent.length);

    const csvFileResponse = await fetch('resources/data/herm_full_edgelist.csv');
    const csvFileContent = await csvFileResponse.text();
    console.log("Csv File Loaded, length:", csvFileContent.length);

    const mtlData = parseMTL(mtlFileContent);
    console.log("Materials Loaded From Mtl:", mtlData);

    const objData = parseOBJ(objFileContent, mtlData);
    console.log("Vertex Loaded From Obj:", objData.vertexCount);

    Connectome.init(csvFileContent);
    
    const wormGPU = initWorm(gl, objData);
    const worms = [];

    const food = initFood(gl);
    const foods = [];


    const plane = await initPlane(gl);
    const tank = initTank(gl);
    const cabinet = initCabinet(gl);
    const spotlight = initSpotlight(gl);


    gl.enable(gl.DEPTH_TEST); //control depth faces
    gl.clearColor(0.1, 0.1, 0.1, 1.0);

    const camera = createCamera();
    setupCameraControls(canvas, camera);

    const mouse = { x: 0, y: 0 };
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });

    let selectedWorm = null;
    canvas.addEventListener('click', () => {
        selectedWorm = hoveredWorm;
        rebuildSelectionGui();
    });


    const params = {
        light:   0.0,
        temp:    0.0,
    };

    //GUI
    const gui = new dat.GUI();
    gui.add(params, 'light',  0, 1).step(0.01).name('Light');
    gui.add(params, 'temp',   0, 1).step(0.01).name('Temperature');

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



    let selectionGui = null;
    function rebuildSelectionGui() {
        if (selectionGui) { selectionGui.destroy(); selectionGui = null; }
        if (!selectedWorm) return;

        selectionGui = new dat.GUI({ autoPlace: true });
        selectionGui.domElement.style.position = 'absolute';
        selectionGui.domElement.style.top  = '0px';
        selectionGui.domElement.style.left = '0px';

        const info = { amplitude: 0, direction: 0, speed: 0 };

        selectionGui._info = info;
        selectionGui._worm = selectedWorm;

        const groups = {
            'Forward Circuit': ['AVBL','AVBR','PVCL','PVCR'],
            'Backward Circuit': ['AVAL','AVAR','AVDL','AVDR','AVEL','AVER'],
            'Sensory — Light': ['ASEL','ASER','AWCL','AWCR'],
            'Sensory — Temp': ['AFDL','AFDR'],
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
    }



    let time = 0;
    let lastTimestamp = null;
    let hoveredWorm = null;

    function render(timestamp) {

        if (lastTimestamp === null) {
            lastTimestamp = timestamp; //init timestamp
        } 
        const deltaTime = (timestamp - lastTimestamp) / 1000; //convert to seconds
        lastTimestamp = timestamp;
        time += deltaTime;

        resizeCanvas(canvas);
        gl.viewport(0, 0, canvas.width, canvas.height);
        
        const eye = computeEye(camera);

        //PROJECTION MATRIX BUILDING
        const fov = Math.PI / 4; // 45 degrees
        const aspect = canvas.width / canvas.height;
        const near = 0.1; // frustum near cutting plane
        const far = 1000.0; // frustum far cutting plane
        const projectionMatrix = m4.perspective(fov, aspect, near, far);

        //VIEW MATRIX BUILDING
        const up = [0, 1, 0]; // upper direction
        const viewMatrix = m4.inverse(m4.lookAt(eye, camera.target, up)); // inverse matrix because we need the matrix of "the world" seen by the camera, not the camera

        //VP Matrix, unique that will be applied on different model matrices
        const viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

        //Ray tracing for worm
        hoveredWorm = null;
        const inverseVP = m4.inverse(viewProjectionMatrix);
        const ray = buildRay(mouse.x, mouse.y, canvas, inverseVP);
        let minDist = Infinity;
        for (const worm of worms) {
            const center = [worm.position[0], worm.position[1] + 1.0, worm.position[2]];
            if (raySphereIntersect(ray, center, 1.2)) {
                const dx = worm.position[0] - eye[0];
                const dz = worm.position[2] - eye[2];
                const dist = dx*dx + dz*dz;
                if (dist < minDist) { minDist = dist; hoveredWorm = worm; }
            }
        }
        canvas.style.cursor = hoveredWorm ? 'pointer' : 'default';


        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        for (const wormInstance of worms) {
            updateWorm(wormInstance, deltaTime, params, foods);
        }
        checkWormCollisions(worms);
        //delete food if reachs 0
        for (let i = foods.length - 1; i >= 0; i--) {
            if (foods[i].nutrients <= 0) foods.splice(i, 1);
        }
        for (let i = worms.length - 1; i >= 0; i--) {
            if (!worms[i].alive) {
                if (worms[i] === selectedWorm) { selectedWorm = null; rebuildSelectionGui(); }
                worms.splice(i, 1);
            }
        }


        
        for (const wormInstance of worms) {
            drawWorm(gl, wormGPU, wormInstance, { viewProjectionMatrix, eye, time }, wormInstance === hoveredWorm);
        }

        if (selectionGui && selectionGui._worm) {
            const c = selectionGui._worm.connectome;
            const info = selectionGui._info;
            for (const key of Object.keys(info)) {
                if (key !== 'amplitude' && key !== 'direction' && key !== 'speed')
                    info[key] = c.getNeuronActivity(key);
            }
            const wp = c.getWaveParams();
            info.amplitude = wp.amplitude;
            info.direction = wp.direction;
            info.speed     = Math.abs(selectionGui._worm.speed);
        }

        drawCabinet(gl, cabinet, { viewProjectionMatrix, eye, lightPosition: [2, 3, 4] });

        drawPlane(gl, plane, {
            viewProjectionMatrix,
            eye,
        });

        drawSpotlight(gl, spotlight, { viewProjectionMatrix });

        drawTank(gl, tank, {
            viewProjectionMatrix
        });
        for (const f of foods) {
            drawFood(gl, food, f, { viewProjectionMatrix, eye });
        }


        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

main();



