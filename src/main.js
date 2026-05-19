'use strict';

let selectedWorm = null;
let cameraMode = 0;

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
    const room = await initRoom(gl);
    const spotlight = initSpotlight(gl);


    gl.enable(gl.DEPTH_TEST); //control depth faces
    gl.clearColor(0.1, 0.1, 0.1, 1.0);

    const camera = createCamera();
    setupCameraControls(canvas, camera, () => cameraMode === 0);

    const mouse = { x: 0, y: 0 };
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });

    canvas.addEventListener('click', () => {
        selectedWorm = hoveredWorm;
        rebuildSelectionGui();
    });
    
    initHUD(worms, foods);

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
        
        const { eye, lookTarget } = resolveCamera(camera, cameraMode, selectedWorm);

        //PROJECTION MATRIX BUILDING
        const fov = Math.PI / 4; // 45 degrees
        const aspect = canvas.width / canvas.height;
        const near = 0.1; // frustum near cutting plane
        const far = 1000.0; // frustum far cutting plane
        const projectionMatrix = m4.perspective(fov, aspect, near, far);

        //VIEW MATRIX BUILDING
        const up = [0, 1, 0]; // upper direction
        const viewMatrix = m4.inverse(m4.lookAt(eye, lookTarget, up)); // inverse matrix because we need the matrix of "the world" seen by the camera, not the camera

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
        for (let i = foods.length - 1; i >= 0; i--) {
            if (foods[i].nutrients <= 0) foods.splice(i, 1); //delete food if reachs 0
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

        updateHUD();

        drawRoom(gl, room, { viewProjectionMatrix, eye });
        drawCabinet(gl, cabinet, { viewProjectionMatrix, eye });
        drawPlane(gl, plane, { viewProjectionMatrix, eye,});
        drawSpotlight(gl, spotlight, { viewProjectionMatrix });
        drawTank(gl, tank, { viewProjectionMatrix });

        for (const f of foods) {
            drawFood(gl, food, f, { viewProjectionMatrix, eye });
        }


        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

main();



