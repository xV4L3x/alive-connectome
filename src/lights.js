'use strict'

const Lights = (() => {

    const positions = [
        [-TANK_WIDTH, TANK_HEIGHT, TANK_DEPTH], //front-left
        [TANK_WIDTH, TANK_HEIGHT, TANK_DEPTH], //front-right
        [-TANK_WIDTH, TANK_HEIGHT, -TANK_DEPTH], //back-left
        [TANK_WIDTH, TANK_HEIGHT, -TANK_DEPTH] //back-right
    ];

    const intensities = [0.0, 0.0, 0.0, 1.0];

    function getPositionsFlat() {
        return new Float32Array(positions.flat());
    }

    function getPositionsRaw() {
        return positions;
    }

    function getIntensities() {
        return new Float32Array(intensities);
    }

    function getIntensitiesRaw() {
        return intensities;
    }

    function setIntensity(index, value) {
        intensities[index] = value;
    }

    function computeAt(position) {
        const [px, py, pz] = position;
        let total = 0;
        for (let i = 0; i < 4; i++) {
            const [lx, ly, lz] = positions[i];
            const dx = px - lx;
            const dy = py - ly;
            const dz = pz - lz;
            const dist2 = dx*dx + dy*dy + dz*dz;
            total += intensities[i] / (1 + 0.005 * dist2);
        }
        return Math.min(1, total);
    }

    return {
        getPositionsFlat,
        getPositionsRaw,
        getIntensities,
        getIntensitiesRaw,
        setIntensity,
        computeAt
    }

})();