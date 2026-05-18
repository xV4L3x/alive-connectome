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
    
    const worm = initWorm(gl, objData);
    const plane = await initPlane(gl);
    const tank = initTank(gl);
    //const cabinet = initCabinet(gl);

    gl.enable(gl.DEPTH_TEST); //control depth faces
    gl.clearColor(0.1, 0.1, 0.1, 1.0);

    const camera = createCamera();
    setupCameraControls(canvas, camera);

    const params = {
        light:   0.0,
        temp:    0.0,
        hunger:  0.0,
    };

    const gui = new dat.GUI();
    gui.add(params, 'light',  0, 1).step(0.01).name('Light');
    gui.add(params, 'temp',   0, 1).step(0.01).name('Temperature');
    gui.add(params, 'hunger', 0, 1).step(0.01).name('Hunger');


    let time = 0;
    let lastTimestamp = null;

    function render(timestamp) {

        if (lastTimestamp === null) {
            lastTimestamp = timestamp; //init timestamp
        } 
        const deltaTime = (timestamp - lastTimestamp) / 1000; //convert to seconds
        lastTimestamp = timestamp;
        time += deltaTime;

        Connectome.updateStimuli(params);
        Connectome.step(deltaTime);
        const {amplitude, freqTime} = Connectome.getWaveParams();

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

        drawWorm(gl, worm, {
            viewProjectionMatrix,
            eye,
            lightPosition: [2, 3, 4],
            time,
            amplitude,
            freqTime,
        });

        //drawCabinet(gl, cabinet, { viewProjectionMatrix, eye, lightPosition: [2, 3, 4] });

        drawPlane(gl, plane, {
            viewProjectionMatrix,
            eye,
            lightPosition: [2, 3, 4],
        });

        drawTank(gl, tank, {
            viewProjectionMatrix
        })


        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

main();



