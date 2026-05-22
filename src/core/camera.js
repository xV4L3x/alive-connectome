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

    let lastPinchDist = null;
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            isDragging = true;
            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: false });
    
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!getEnabled()) return;

        if (e.touches.length === 1 && isDragging) {
            const dx = e.touches[0].clientX - lastMouseX;
            const dy = e.touches[0].clientY - lastMouseY;
            camera.azimuth   -= dx * draggingSensitivity;
            camera.elevation += dy * draggingSensitivity;
            camera.elevation  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camera.elevation));
            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (lastPinchDist !== null) {
                camera.distance -= (dist - lastPinchDist) * 0.05;
                camera.distance  = Math.max(0.5, Math.min(50, camera.distance));
            }
            lastPinchDist = dist;
        }
    }, { passive: false });
    
    canvas.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            isDragging = false;
            lastPinchDist = null;
        } else if (e.touches.length === 1) {
            // passaggio da pinch a singolo dito
            lastPinchDist = null;
            isDragging = true;
            lastMouseX = e.touches[0].clientX;
            lastMouseY = e.touches[0].clientY;
        }
    });

}

function resolveCamera(camera, cameraMode, selectedWorm) {
    if (cameraMode === 1 && selectedWorm) {
        const r = computeThirdPerson(selectedWorm);
        return { eye: r.eye, lookTarget: r.target };
    }
    if (cameraMode === 2 && selectedWorm) {
        const r = computeFirstPerson(selectedWorm);
        return { eye: r.eye, lookTarget: r.target };
    }
    const sinMin     = Math.max(-1, (-CABINET_HEIGHT + 0.5 - camera.target[1]) / camera.distance);
    const minElev    = Math.asin(sinMin);
    camera.elevation = Math.max(minElev, camera.elevation);
    const eye = computeEye(camera);
    return { eye, lookTarget: camera.target };

}

