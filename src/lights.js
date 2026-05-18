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

    return {
        getPositionsFlat,
        getPositionsRaw,
        getIntensities,
        getIntensitiesRaw,
        setIntensity
    }

})();