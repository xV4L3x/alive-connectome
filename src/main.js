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



    const plane = await initPlane(gl);
    const tank = initTank(gl);
    //const cabinet = initCabinet(gl);
    const spotlight = initSpotlight(gl);

    gl.enable(gl.DEPTH_TEST); //control depth faces
    gl.clearColor(0.1, 0.1, 0.1, 1.0);

    const camera = createCamera();
    setupCameraControls(canvas, camera);

    const params = {
        light:   0.0,
        temp:    0.0,
        hunger:  0.0,
    };


    //GUI
    const gui = new dat.GUI();
    gui.add(params, 'light',  0, 1).step(0.01).name('Light');
    gui.add(params, 'temp',   0, 1).step(0.01).name('Temperature');
    gui.add(params, 'hunger', 0, 1).step(0.01).name('Hunger');

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
        }
    };
    gui.add(actions, 'spawn').name("Spawn");

    const debugState = {
        // circuito avanti
        AVBL: 0, AVBR: 0, PVCL: 0, PVCR: 0,
        // circuito indietro
        AVAL: 0, AVAR: 0, AVDL: 0, AVDR: 0,
        // neuroni tocco testa
        ALML: 0, ALMR: 0, AVM: 0,
        // neuroni tocco coda
        PLML: 0, PLMR: 0, PVM: 0,

        ASEL: 0, ASER: 0,

        //motors
        DA01: 0, VB01: 0,
        // output
        amplitude: 0, freqTime: 0, direction: 0,
    };
    const debugFolder = gui.addFolder('Debug [Worm 0]');
    for (const key of Object.keys(debugState)) {
        debugFolder.add(debugState, key, 0, 1).step(0.01).listen();
    }
    const debugActions = {
      copy: function() {
          const lines = Object.entries(debugState)
              .map(([k, v]) => `${k}: ${v.toFixed(4)}`)
              .join('\n');
          navigator.clipboard.writeText(lines);
          console.log('Debug state copied:\n' + lines);
      }
    };
    debugFolder.add(debugActions, 'copy').name('Copy State');






    let time = 0;
    let lastTimestamp = null;

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

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        for (const wormInstance of worms) {
            updateWorm(wormInstance, deltaTime, params);
        }
        checkWormCollisions(worms);
        for (const wormInstance of worms) {
            drawWorm(gl, wormGPU, wormInstance, { viewProjectionMatrix, eye, time });
        }


        if (worms.length > 0) {
            const c = worms[0].connectome;
            for (const key of ['AVBL','AVBR','PVCL','PVCR','AVAL','AVAR','AVDL','AVDR',
                                'ALML','ALMR','AVM','PLML','PLMR','PVM', 'ASEL', 'ASER', 'DA01','VB01']) {
                debugState[key] = c.getNeuronActivity(key);
            }
            const wp = worms[0].connectome.getWaveParams();
            debugState.amplitude  = wp.amplitude;
            debugState.freqTime   = wp.freqTime;
            debugState.direction  = wp.direction;
        }


        //drawCabinet(gl, cabinet, { viewProjectionMatrix, eye, lightPosition: [2, 3, 4] });

        drawPlane(gl, plane, {
            viewProjectionMatrix,
            eye,
        });

        drawSpotlight(gl, spotlight, { viewProjectionMatrix });

        drawTank(gl, tank, {
            viewProjectionMatrix
        })


        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

main();



