'use strict';

function createCamera() {
    return {
        azimuth:   0.0,
        elevation: 0.3,
        distance:  30,
        target:    [0, 0, 0],
    };
}

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

function computeThirdPerson(worm) {
    //get pointing direction (unitary)
    const forward = [Math.sin(worm.heading), 0, Math.cos(worm.heading)];

    const eye = [
        worm.position[0] - forward[0] * 5.0,
        worm.position[1] + 3.0,
        worm.position[2] - forward[2] * 5.0 //move in depth by 5 
    ];

    //aim to worm but slightly higher
    const target = [
          worm.position[0],
          worm.position[1] + 1.0,
          worm.position[2],
    ];

    return { eye, target };
}

function computeFirstPerson(worm) {
    const forward = [Math.sin(worm.heading), 0, Math.cos(worm.heading)];

    const eye = [
        worm.position[0] + forward[0] * 1.5,
        worm.position[1] + 1.0,
        worm.position[2] + forward[2] * 1.5,
    ];

    const target = [
        eye[0] + forward[0] * 5.0,
        eye[1],
        eye[2] + forward[2] * 5.0,
    ];  

    return { eye, target };


}

function setupCameraControls(canvas, camera, getEnabled) {
    const draggingSensitivity = 0.005;

    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        if (!getEnabled()) return;

        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;

        camera.azimuth   -= dx * draggingSensitivity;
        camera.elevation += dy * draggingSensitivity;
        camera.elevation  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camera.elevation)); //[-90°,90°]

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    });

    canvas.addEventListener('wheel', (e) => {
        if (!getEnabled()) return;
        e.preventDefault();
        camera.distance += e.deltaY * 0.01;
        camera.distance  = Math.max(0.5, Math.min(50, camera.distance)); //[0.5,50]
    }, { passive: false });

    canvas.addEventListener('mouseup',    () => { isDragging = false; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; });
}
