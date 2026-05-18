'use strict';

const wormVertexShaderSource = `
    attribute vec4 a_position;
    attribute vec4 a_color;
    attribute vec3 a_normal;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    uniform float u_amplitude; //wave amplitude
    uniform float u_freqTime; //wave frequency (sign implies direction)
    uniform float u_freqSpace; //worm movement wave frequency
    uniform float u_time; //time from start
    uniform float u_bodyMin; //body positions to normalize movement over body
    uniform float u_bodyMax;

    varying vec4 v_color; //color to send to fragment
    varying vec3 v_normal;
    varying vec3 v_worldPos; //direction from surface to camera (specular effect)

    void main() {

        float s = (a_position.z - u_bodyMin) / (u_bodyMax - u_bodyMin); //normalize the y  in [0,1] 0=head, 1=tail
        float wave = u_amplitude * sin(u_freqSpace * s + u_freqTime * u_time);
        vec4 deformed = vec4(a_position.x + wave, a_position.y, a_position.z, 1.0);

        gl_Position = u_matrix * deformed; //multiply all vertex before sending to screen
        v_color = a_color;
        v_normal = mat3(u_modelMatrix) * a_normal; //take only 3x3 matrix to not include translations
        v_worldPos = (u_modelMatrix * deformed).xyz; //xyz only takes first 3 coordinates
    }
`;

const wormFragmentShaderSource = `
    precision mediump float;
    
    varying vec4 v_color;
    varying vec3 v_normal;
    varying vec3 v_worldPos;

    uniform vec3 u_lightPositions[4]; //4 lights, one each angle
    uniform float u_lightIntensities[4];
    uniform vec3 u_viewPosition; //camera position


    void main() {
        vec3 normal = normalize(v_normal); //normalize because it might not be unitary after interpolation
        vec3 viewDir = normalize(u_viewPosition - v_worldPos); //surface towards camera

        //ambient
        float ambientStrength = 0.4;
        vec3 ambient = ambientStrength * v_color.rgb;

        float specularStrength = 0.2;

        for (int i = 0; i < 4; i++) {
            vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos); //surface towards light direction

            //diffuse
            float diff = max(dot(normal, lightDir), 0.0); //how much surface is towards the light (avoid negative, in shadow)
            vec3 diffuse = diff * v_color.rgb * u_lightIntensities[i];

            //specular
            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0); //reflected ray (higher the ray, lower the reflection) (avoid negative)
            vec3 specular = specularStrength * spec * vec3(1.0, 1.0, 1.0) * u_lightIntensities[i]; //white reflection (1,1,1) if aligned to camera

            ambient += diffuse + specular;
        }
    
        gl_FragColor = vec4(ambient, 1.0);
    }
`;

function initWorm(gl, objData) {
    const program = createShaderProgram(gl, wormVertexShaderSource, wormFragmentShaderSource);

    //POSITION BUFFER FILLING
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.positions, gl.STATIC_DRAW);

    //TEXTURE APPLICATION
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.colors, gl.STATIC_DRAW);

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
        program,
        positionBuffer,
        colorBuffer,
        normalBuffer,
        vertexCount: objData.vertexCount,
        bodyMin,
        bodyMax,
        yMin,
        locations: {
            matrix: gl.getUniformLocation(program, 'u_matrix'),
            modelMatrix: gl.getUniformLocation(program, 'u_modelMatrix'),
            amplitude: gl.getUniformLocation(program, 'u_amplitude'),
            freqTime: gl.getUniformLocation(program, 'u_freqTime'),
            freqSpace: gl.getUniformLocation(program, 'u_freqSpace'),
            time: gl.getUniformLocation(program, 'u_time'),
            bodyMin: gl.getUniformLocation(program, 'u_bodyMin'),
            bodyMax: gl.getUniformLocation(program, 'u_bodyMax'),
            lightPositions: gl.getUniformLocation(program, 'u_lightPositions'),
            lightIntensities: gl.getUniformLocation(program, 'u_lightIntensities'),
            viewPosition: gl.getUniformLocation(program, 'u_viewPosition'),
            position: gl.getAttribLocation(program, 'a_position'),
            color: gl.getAttribLocation(program, 'a_color'),
            normal: gl.getAttribLocation(program, 'a_normal'),
        }
    }
}

function createWormInstance(position = [0,0,0], heading = 0) {
    return {
        position: [...position], //copy to avoid aliasing
        heading,
        speed: 0,
        connectome: Connectome.createInstance(),
        alive: true
    }
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {*} worm 
 * @param {*} param2 
 */
function drawWorm(gl, worm, wormInstance, { viewProjectionMatrix, eye, time }) {
    gl.useProgram(worm.program);

    //STRUCTURE:
    //bind needed array
    //acrtivate and link position
    //instruction on how to read

    gl.bindBuffer(gl.ARRAY_BUFFER, worm.positionBuffer);
    gl.enableVertexAttribArray(worm.locations.position);
    gl.vertexAttribPointer(worm.locations.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, worm.colorBuffer);
    gl.enableVertexAttribArray(worm.locations.color);
    gl.vertexAttribPointer(worm.locations.color, 4, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, worm.normalBuffer);
    gl.enableVertexAttribArray(worm.locations.normal);
    gl.vertexAttribPointer(worm.locations.normal, 3, gl.FLOAT, false, 0, 0);

    //MODEL MATRIX BUILDING
    const scalingFactor = 0.5;
    const [px, py, pz] = wormInstance.position;
    const { amplitude, freqTime } = wormInstance.connectome.getWaveParams();

    const wormModelMatrix = m4.multiply(
        m4.translation(px, -worm.yMin * scalingFactor + py, pz), // translate vertically to not overflow the plane
        m4.multiply(
            m4.yRotation(wormInstance.heading),
            m4.scaling(scalingFactor, scalingFactor, scalingFactor) // scale model on the 3 axis
        )
    ); 
    //MVP MATRIX BUILDING
    const wormMvpMatrix = m4.multiply(viewProjectionMatrix, wormModelMatrix);
  
    //Write values
    gl.uniformMatrix4fv(worm.locations.matrix,      false, wormMvpMatrix);
    gl.uniformMatrix4fv(worm.locations.modelMatrix, false, wormModelMatrix);
    gl.uniform3fv(worm.locations.lightPositions, Lights.getPositionsFlat());
    gl.uniform1fv(worm.locations.lightIntensities, Lights.getIntensities());
    gl.uniform3fv(worm.locations.viewPosition,  eye);
    gl.uniform1f(worm.locations.amplitude, amplitude * 0.5);
    gl.uniform1f(worm.locations.freqTime,   freqTime);
    gl.uniform1f(worm.locations.freqSpace,  6.28);
    gl.uniform1f(worm.locations.time,       time);
    gl.uniform1f(worm.locations.bodyMin,    worm.bodyMin);
    gl.uniform1f(worm.locations.bodyMax,    worm.bodyMax);

    gl.drawArrays(gl.TRIANGLES, 0, worm.vertexCount);
}