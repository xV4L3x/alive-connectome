'use strict';

const wormVertexShaderSource = `
    attribute vec4 a_position;
    attribute vec4 a_diffuse;
    attribute vec3 a_specular;
    attribute float a_shininess;
    attribute vec3 a_normal;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    uniform float u_amplitude; //wave amplitude
    uniform float u_freqTime; //wave frequency (sign implies direction)
    uniform float u_freqSpace; //worm movement wave frequency
    uniform float u_time; //time from start
    uniform float u_bodyMin; //body positions to normalize movement over body
    uniform float u_bodyMax;

    varying vec4 v_diffuse; //color to send to fragment
    varying vec3 v_normal;
    varying vec3 v_worldPos; //direction from surface to camera (specular effect)
    varying vec3 v_specular;
    varying float v_shininess;

    void main() {
        float s = (a_position.z - u_bodyMin) / (u_bodyMax - u_bodyMin); //normalize the y  in [0,1] 0=head, 1=tail
        float wave = u_amplitude * sin(u_freqSpace * s + u_freqTime * u_time);
        vec4 deformed = vec4(a_position.x + wave, a_position.y, a_position.z, 1.0);

        gl_Position = u_matrix * deformed; //multiply all vertex before sending to screen
        v_diffuse = a_diffuse;
        v_normal = mat3(u_modelMatrix) * a_normal; //take only 3x3 matrix to not include translations
        v_worldPos = (u_modelMatrix * deformed).xyz; //xyz only takes first 3 coordinates
        v_specular = a_specular;
        v_shininess = a_shininess;
    }
`;

const wormFragmentShaderSource = `
    precision mediump float;
    
    varying vec4 v_diffuse;
    varying vec3 v_normal;
    varying vec3 v_worldPos;
    varying vec3 v_specular;
    varying float v_shininess;

    uniform vec3 u_lightPositions[4]; //4 lights, one each angle
    uniform float u_lightIntensities[4];
    uniform vec3 u_viewPosition; //camera position
    uniform float u_advanced;

    uniform float u_isOutline;
    uniform float u_isShadow;
    uniform float u_shadowAlpha;

    void main() {

        float Ka = 0.4;

        if (u_isShadow > 0.5) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, u_shadowAlpha);
            return;
        }

        if (u_isOutline > 0.5) {
            gl_FragColor = vec4(1.0, 0.5, 0.0, 0.65);
            return;
        }

        vec3 normal = normalize(v_normal); //normalize because it might not be unitary after interpolation
        vec3 viewDir = normalize(u_viewPosition - v_worldPos); //surface towards camera

        vec3 result = Ka * v_diffuse.rgb; // ambient

        for (int i = 0; i < 4; i++) {
            vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos); //surface towards light direction
            vec3 reflectDir = reflect(-lightDir, normal);

            float diff = max(dot(normal, lightDir), 0.0); //how much surface is towards the light (avoid negative, in shadow)
            vec3 diffuse = diff * v_diffuse.rgb * u_lightIntensities[i]; // diffuse

            float spec = pow(max(dot(viewDir, reflectDir), 0.0), v_shininess);
            vec3 specular = spec * v_specular * u_lightIntensities[i] * u_advanced; // specular
            result += diffuse + specular;
        }
    
        gl_FragColor = vec4(result, 1.0);
    }
`;

const MAX_SPEED = 3.0; //units per second
const FRICTION = 2.0; //how fast worm adapts to speed
const TURN_SPEED = 0.5;
const WORM_SCALE = 0.3;

//hitboxes for worm-worm e worm-wall
const WORM_WORM_RADIUS = 0.5;
const WORM_WALL_RADIUS = 0.8;

const PIROUETTE_MIN = 3.0; // min second between rotation
const PIROUETTE_MAX = 8.0; // max seconds between rotation
const TOUCH_STRENGTH = 4.0;
const TOUCH_DURATION = 1.5;
const REVERSAL_DURATION = 1.2;
const OMEGA_TURN_SPEED = 2.5;   // randians turn
const OMEGA_DURATION   = 1.2;   // turn duration

const HUNGER_RATE = 0.01; //how slow hunger grows
const FOOD_TURN_STRENGTH = 3.5;

const EAT_RADIUS   = 0.8;  // minimum distance to eat
const EAT_RATE     = 0.10; // hunger decrease step per second
const CONSUME_RATE = 0.2; // nutrients dropping ratio
const HUNGER_FORWARD_STRENGTH = 3.0;

const LIGHT_FLEE_STRENGTH = 2;

const DIRECTION_DEADBAND = 0.15;
const OVERRIDE_TURN_RATE = 3.5;
const SHADOW_HEIGHT = 0.1;
const WAVE_AMPLITUDE_MULTIPLIER = 2.0;
const WAVE_FREQUENCY_MULTIPLIER = 2.0;

function buildShadowMatrix(lx, ly, lz) {
    return new Float32Array([
        ly,   0,    0,    0, // multiply for V.x
        -lx,   0,  -lz,  -1, // multiply for V.y
        0,   0,   ly,    0, // multuply for v.z
        0,   0,    0,   ly // multiply for 1
    ]);
}

function initWorm(gl, objData) {
    const programInfo = webglUtils.createProgramInfo(gl, [wormVertexShaderSource, wormFragmentShaderSource]);

    //POSITION BUFFER FILLING
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.positions, gl.STATIC_DRAW);

    //DIFFUSE COLOR BUFFER
    const diffuseBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, diffuseBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.diffuse, gl.STATIC_DRAW);

    //SPECULAR COLOR BUFFER
    const specularBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, specularBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.specular, gl.STATIC_DRAW);

    //SHININESS BUFFER
    const shininessBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shininessBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.shininess, gl.STATIC_DRAW);


    //NORMALS VECTORS
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.normals, gl.STATIC_DRAW);

    //calculate body boundaries (dynamic in case of change of size)
    let bodyMin = Infinity;
    let bodyMax = -Infinity;
    let yMin = Infinity;
    for (let i = 0; i < objData.positions.length; i += 3) {
        const y = objData.positions[i + 1]; // Y è l'indice 1
        const z = objData.positions[i + 2]; // Z è l'indice 2
        if (y < yMin) yMin = y;
        if (z < bodyMin) bodyMin = z;
        if (z > bodyMax) bodyMax = z;
    }

    return {
        programInfo,
        positionBuffer,
        diffuseBuffer,
        specularBuffer,
        shininessBuffer,
        normalBuffer,
        vertexCount: objData.vertexCount,
        bodyMin,
        bodyMax,
        yMin,
    }
}

function createWormInstance(position = [0,0,0], heading = 0) {
    return {
        position: [...position], //copy to avoid aliasing
        heading,
        targetHeading: heading,
        touchTimer:     0, // seconds of touch effect
        touchDirection: 0,   // +1 push forward (tail touch). -1 push backwards (head touch)
        speed: 0,
        hunger: 0,
        directionSmooth: 1,
        freqTimeSmooth: 0,
        omegaTimer: 0,
        reversalTimer: 0,
        pirouetteTimer: Math.random() * PIROUETTE_MAX,  // random initial offset
        connectome: Connectome.createInstance(),
        alive: true,
        overrideActive: false,
        overrideInput: { x: 0, z: 0 },
        overrideDir: 1
    }
}

function updateWorm(wormInstance, deltaTime, stimuli, foods) {
    wormInstance.hunger = Math.min(1, wormInstance.hunger + HUNGER_RATE * deltaTime);
    if (wormInstance.hunger >= 1.0) wormInstance.alive = false;

    // Eat food if nearby, regardless of hunger or override mode
    if (foods.length > 0) {
        let nearestFood = null;
        let nearestDist = Infinity;
        for (const f of foods) {
            const dx = f.position[0] - wormInstance.position[0];
            const dz = f.position[2] - wormInstance.position[2];
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < nearestDist) { nearestDist = dist; nearestFood = f; }
        }
        if (nearestDist < EAT_RADIUS) {
            wormInstance.hunger = Math.max(0, wormInstance.hunger - EAT_RATE * deltaTime);
            nearestFood.nutrients = Math.max(0, nearestFood.nutrients - CONSUME_RATE * deltaTime);
        }
    }


    //override controls
    if (wormInstance.overrideActive) {
        const ix = wormInstance.overrideInput.x;
        const iz = wormInstance.overrideInput.z;
        const magnitude = Math.sqrt(ix*ix + iz*iz);

        if (magnitude > 0.01) {
            const steerDir = wormInstance.overrideDir < 0 ? 1 : -1;
            const steerScale = 1.0 - Math.abs(ix / magnitude) * 0.4;
            wormInstance.heading += steerDir * ix * steerScale * OVERRIDE_TURN_RATE * deltaTime;
            wormInstance.speed = magnitude * MAX_SPEED * wormInstance.overrideDir;
        } else {
            wormInstance.speed = 0;
        }

        wormInstance.position[0] += Math.sin(wormInstance.heading) * wormInstance.speed * deltaTime;
        wormInstance.position[2] += Math.cos(wormInstance.heading) * wormInstance.speed * deltaTime;
        checkWallCollision(wormInstance, wormInstance.speed >= 0 ? 1 : -1);
        return;
    }

    const localLight = Lights.computeAt(wormInstance.position);
    wormInstance.connectome.updateStimuli({ light: localLight, hunger: wormInstance.hunger });
    wormInstance.connectome.step(deltaTime);

    const { amplitude, freqTime } = wormInstance.connectome.getWaveParams();
    wormInstance.freqTimeSmooth += (freqTime * WAVE_FREQUENCY_MULTIPLIER - wormInstance.freqTimeSmooth) * 3.0 * deltaTime;

    const c = wormInstance.connectome;
    const forwardDrive  = (c.getNeuronActivity('AVBL') + c.getNeuronActivity('AVBR') +
                           c.getNeuronActivity('PVCL') + c.getNeuronActivity('PVCR')) / 4;
    const backwardDrive = (c.getNeuronActivity('AVAL') + c.getNeuronActivity('AVAR') +
                           c.getNeuronActivity('AVDL') + c.getNeuronActivity('AVDR')) / 4;

    let touchForward = 0, touchBackward = 0;
    if (wormInstance.touchTimer > 0) {
        wormInstance.touchTimer -= deltaTime;
        const intensity = (wormInstance.touchTimer / TOUCH_DURATION) * TOUCH_STRENGTH;
        if (wormInstance.touchDirection > 0) touchForward  = intensity;
        else                                  touchBackward = intensity;
    }

    const hungerDrive = wormInstance.hunger > 0.5 ? (wormInstance.hunger - 0.5) * 2 : 0;
    const driveDiff = (forwardDrive + touchForward + hungerDrive * HUNGER_FORWARD_STRENGTH) - (backwardDrive + touchBackward);
    const rawDirection = driveDiff >= -DIRECTION_DEADBAND ? 1 : -1;
    wormInstance.directionSmooth += (rawDirection - wormInstance.directionSmooth) * 5.0 * deltaTime;
    const direction = Math.sign(wormInstance.directionSmooth);


    const targetSpeed = amplitude * MAX_SPEED * direction;
    wormInstance.speed += (targetSpeed - wormInstance.speed) * FRICTION * deltaTime;

    // pirouette and heading 
    if (wormInstance.reversalTimer > 0) {
        wormInstance.reversalTimer -= deltaTime;
        if (wormInstance.reversalTimer <= 0) {
            const sign = Math.random() < 0.5 ? 1 : -1;
            const angle = Math.PI * 0.5 + Math.random() * Math.PI * 0.5;
            wormInstance.targetHeading = wormInstance.heading + sign * angle;
            wormInstance.omegaTimer = OMEGA_DURATION;
        }
    } else {
        wormInstance.pirouetteTimer -= deltaTime;
        if (wormInstance.pirouetteTimer <= 0) {
            wormInstance.targetHeading  = wormInstance.heading + (Math.random() - 0.5) * Math.PI;
            wormInstance.pirouetteTimer = PIROUETTE_MIN + Math.random() * (PIROUETTE_MAX - PIROUETTE_MIN);
        }
    }

    let diff = wormInstance.targetHeading - wormInstance.heading;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (wormInstance.omegaTimer > 0) wormInstance.omegaTimer -= deltaTime;
    const turnSpeed = wormInstance.omegaTimer > 0 ? OMEGA_TURN_SPEED : TURN_SPEED;
    wormInstance.heading += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * deltaTime);


    if (wormInstance.omegaTimer <= 0 && wormInstance.reversalTimer <= 0) {
        if (wormInstance.hunger > 0.5 && foods.length > 0) {
            let nearestFood = null;
            let nearestDist = Infinity;

            for (const f of foods) {
                const dx = f.position[0] - wormInstance.position[0];
                const dz = f.position[2] - wormInstance.position[2];
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < nearestDist) { nearestDist = dist; nearestFood = f; }
            }

            const dx = nearestFood.position[0] - wormInstance.position[0];
            const dz = nearestFood.position[2] - wormInstance.position[2];
            const angleToFood = Math.atan2(dx, dz);

            let foodDiff = angleToFood - wormInstance.heading;
            while (foodDiff >  Math.PI) foodDiff -= 2 * Math.PI;
            while (foodDiff < -Math.PI) foodDiff += 2 * Math.PI;

            const bias = (wormInstance.hunger - 0.5) * 2; // 0 a hunger=0.5, 1 a hunger=1.0
            wormInstance.heading += foodDiff * bias * FOOD_TURN_STRENGTH * deltaTime;
        } 

        if (localLight > 0.05) {
            const lightDir = Lights.computeDirectionAt(wormInstance.position);
            const fleeMult = direction > 0 ? -1 : 1;
            const fleeAngle = Math.atan2(fleeMult * lightDir[0], fleeMult * lightDir[2]);
            let lightDiff = fleeAngle - wormInstance.heading;
            while (lightDiff >  Math.PI) lightDiff -= 2 * Math.PI;
            while (lightDiff < -Math.PI) lightDiff += 2 * Math.PI;
            const lightFleeScale = 1.0 - Math.max(0, (wormInstance.hunger - 0.5) * 2);
            wormInstance.heading += lightDiff * localLight * LIGHT_FLEE_STRENGTH * lightFleeScale * deltaTime;
        }

    }


    wormInstance.position[0] += Math.sin(wormInstance.heading) * wormInstance.speed * deltaTime;
    wormInstance.position[2] += Math.cos(wormInstance.heading) * wormInstance.speed * deltaTime;

    checkWallCollision(wormInstance, direction);
}


function checkWallCollision(wormInstance, direction) {
    const pos = wormInstance.position;
    let hit = false;

    //X checks
    if (pos[0] < -TANK_WIDTH + WORM_WALL_RADIUS) {
        pos[0] = -TANK_WIDTH + WORM_WALL_RADIUS;
        hit = true;
    } else if (pos[0] > TANK_WIDTH - WORM_WALL_RADIUS) {
        pos[0] = TANK_WIDTH - WORM_WALL_RADIUS;
        hit = true;
    }

    //Z checks
    if (pos[2] < -TANK_DEPTH + WORM_WALL_RADIUS) {
        pos[2] = -TANK_DEPTH + WORM_WALL_RADIUS;
        hit = true;
    } else if (pos[2] > TANK_DEPTH - WORM_WALL_RADIUS) {
        pos[2] = TANK_DEPTH - WORM_WALL_RADIUS;
        hit = true;
    }

    if (hit) {
        wormInstance.touchTimer = TOUCH_DURATION;
        wormInstance.touchDirection = direction > 0 ? -1 : 1;

        if (direction > 0) {
            wormInstance.directionSmooth = -1;
            wormInstance.speed = -MAX_SPEED;
            wormInstance.targetHeading = wormInstance.heading; // va dritto indietro
            wormInstance.reversalTimer = REVERSAL_DURATION;    // omega rimandato
        } else {
            wormInstance.speed = MAX_SPEED;
        }


    }

}

function checkWormCollisions(worms) {
    for (let i = 0; i < worms.length; i++) {
        for (let j = i + 1; j < worms.length; j++) {
            const a = worms[i];
            const b = worms[j];

            const dx = a.position[0] - b.position[0];
            const dz = a.position[2] - b.position[2];
            const d = Math.sqrt(dx*dx + dz*dz);
            const minD = WORM_WORM_RADIUS * 2;

            if (d >= minD || d === 0) continue;

            const overlap = minD - d;

            //separation direction (normalization)
            const sdx = dx / d;
            const sdz = dz / d;

            //physical separation
            a.position[0] += sdx * overlap * 0.5;
            a.position[2] += sdz * overlap * 0.5;
            b.position[0] -= sdx * overlap * 0.5;
            b.position[2] -= sdz * overlap * 0.5;


            // touch head or tail events based on direction
            const dirA = a.speed >= 0 ? 1 : -1;
            const dirB = b.speed >= 0 ? 1 : -1;

            a.touchTimer     = TOUCH_DURATION;
            a.touchDirection = dirA > 0 ? -1 : 1;
            b.touchTimer     = TOUCH_DURATION;
            b.touchDirection = dirB > 0 ? -1 : 1;

            // head collision → reversal + omega (come per il muro)
            if (dirA > 0 && a.reversalTimer <= 0) {
                a.directionSmooth = -1;
                a.speed           = -MAX_SPEED;
                a.targetHeading   = a.heading;
                a.reversalTimer   = REVERSAL_DURATION;
            }
            if (dirB > 0 && b.reversalTimer <= 0) {
                b.directionSmooth = -1;
                b.speed           = -MAX_SPEED;
                b.targetHeading   = b.heading;
                b.reversalTimer   = REVERSAL_DURATION;
            }

        }
    }
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {*} worm 
 * @param {*} param2 
 */
function drawWorm(gl, worm, wormInstance, { viewProjectionMatrix, eye, time }, highlighted = false) {
    gl.useProgram(worm.programInfo.program);

    webglUtils.setAttributes(worm.programInfo, {
        a_position: { buffer: worm.positionBuffer, numComponents: 3},
        a_diffuse: { buffer: worm.diffuseBuffer, numComponents: 4 },
        a_normal: { buffer: worm.normalBuffer, numComponents: 3},
        a_specular: { buffer: worm.specularBuffer,  numComponents: 3 },
        a_shininess: { buffer: worm.shininessBuffer, numComponents: 1 },
    });

    //MODEL MATRIX BUILDING
    const [px, py, pz] = wormInstance.position;
    const { amplitude } = wormInstance.connectome.getWaveParams();

    const wormModelMatrix = m4.multiply(
        m4.translation(px, -worm.yMin * WORM_SCALE + py, pz), // translate vertically to not overflow the plane
        m4.multiply(
            m4.yRotation(wormInstance.heading),
            m4.scaling(WORM_SCALE, WORM_SCALE, WORM_SCALE) // scale model on the 3 axis
        )
    );

    webglUtils.setUniforms(worm.programInfo, {
        u_amplitude: amplitude * WAVE_AMPLITUDE_MULTIPLIER,
        u_freqTime:  wormInstance.freqTimeSmooth,
        u_freqSpace: 6.28,
        u_time:      time,
        u_bodyMin:   worm.bodyMin,
        u_bodyMax:   worm.bodyMax,
    });
    
    if (params.shadows) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1, -1);
        webglUtils.setUniforms(worm.programInfo, { u_isShadow: 1.0 });

        for (let i = 0; i < 4; i++) {
            const intensity = Lights.getIntensitiesRaw()[i];
            if (intensity < 0.01) continue;  // light turned off

            const [lx, ly, lz] = Lights.getPositionsRaw()[i];
            const shadowMatrix = buildShadowMatrix(lx, ly, lz);
            const flatScale = m4.scaling(1, 0, 1);

            // VP × ShadowMatrix × Model
            const [px, py, pz] = wormInstance.position;

            const shadowModelMatrix = m4.multiply(
                m4.translation(px, SHADOW_HEIGHT, pz),
                m4.multiply(
                    m4.yRotation(wormInstance.heading),
                    m4.scaling(WORM_SCALE, 0, WORM_SCALE)
                )
            );

            const shadowMVP = m4.multiply(
                viewProjectionMatrix,
                m4.multiply(shadowMatrix, shadowModelMatrix)
            );

            webglUtils.setUniforms(worm.programInfo, {
                u_matrix:      shadowMVP,
                u_shadowAlpha: 0.15 * intensity,
            });

            gl.drawArrays(gl.TRIANGLES, 0, worm.vertexCount);
        }

        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.disable(gl.BLEND);
        webglUtils.setUniforms(worm.programInfo, { u_isShadow: 0.0 });
    }
    //MVP MATRIX BUILDING
    const wormMvpMatrix = m4.multiply(viewProjectionMatrix, wormModelMatrix);
  
    //Write values
    webglUtils.setUniforms(worm.programInfo, {
        u_matrix:           wormMvpMatrix,
        u_modelMatrix:      wormModelMatrix,
        u_lightPositions:   Lights.getPositionsFlat(),
        u_lightIntensities: Lights.getIntensities(),
        u_viewPosition:     eye,
        u_isOutline:        highlighted ? 1.0 : 0.0,
        u_advanced:         params.shadows ? 1.0 : 0.0,
    });


    if (highlighted) gl.enable(gl.BLEND), gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, worm.vertexCount);
    if (highlighted) gl.disable(gl.BLEND);
}