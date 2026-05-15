'use strict';

const vertexShaderSource = `
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

const fragmentShaderSource = `
    precision mediump float;
    
    varying vec4 v_color;
    varying vec3 v_normal;
    varying vec3 v_worldPos;

    uniform vec3 u_lightPosition;
    uniform vec3 u_viewPosition;


    void main() {
        vec3 normal = normalize(v_normal);
        vec3 lightDir = normalize(u_lightPosition - v_worldPos); //surface towards light
        vec3 viewDir = normalize(u_viewPosition - v_worldPos); //surface towards camera

        //ambient
        float ambientStrength = 0.4;
        vec3 ambient = ambientStrength * v_color.rgb;

        //diffuse
        float diff = max(dot(normal, lightDir), 0.0); //when surface is towards the light (avoid negative)
        vec3 diffuse = diff * v_color.rgb;

        //specular
        float specularStrength = 0.2;
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0); //reflected ray (higher the ray, lower the reflection) (avoid negative)
        vec3 specular = specularStrength * spec * vec3(1.0, 1.0, 1.0); //white reflection (1,1,1) rgb
    
        gl_FragColor = vec4(ambient + diffuse + specular, 1.0);
    }
`;

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {string} vertexSource 
 * @param {string} fragmentSource 
 */
function createShaderProgram(gl, vertexSource, fragmentSource) {
    // create and compile vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error('Vertex Shader Error: ', gl.getShaderInfoLog(vertexShader));
        return null;
    }
    console.log("Vertex Shader Successfully Compiled");

    //create and compile fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error('Fragment Shader Error: ', gl.getShaderInfoLog(fragmentShader));
        return null;
    }
    console.log("Fragment Shader Successfully Compiled");

    //create program and link shaders
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Link Program Error: ", gl.getProgramInfoLog(program));
        return null;
    }
    console.log("Program Created Successfully")

    return program;
}

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

    Connectome.init(csvFileContent);
    Connectome.updateStimuli({ light: 0.8, temp: 0, hunger: 0 });
    
    const program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

    const matrixLocation = gl.getUniformLocation(program, 'u_matrix'); //get Model View Projection matrix address

    const amplitudeLocation = gl.getUniformLocation(program, 'u_amplitude');
    const freqTimeLocation = gl.getUniformLocation(program, 'u_freqTime');
    const freqSpaceLocation = gl.getUniformLocation(program, 'u_freqSpace');
    const timeLocation = gl.getUniformLocation(program, 'u_time');
    const bodyMinLocation = gl.getUniformLocation(program, 'u_bodyMin');
    const bodyMaxLocation = gl.getUniformLocation(program, 'u_bodyMax');

    const mtlData = parseMTL(mtlFileContent);
    console.log("Materials Loaded From Mtl:", mtlData);

    const objData = parseOBJ(objFileContent, mtlData);
    console.log("Vertex Loaded From Obj:", objData.vertexCount);

    //POSITION BUFFER FILLING
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.positions, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0); // 3 numbers per vertex

    gl.useProgram(program);

    //TEXTURE APPLICATION
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.colors, gl.STATIC_DRAW);

    const colorLocation = gl.getAttribLocation(program, 'a_color');
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

    //NORMALS VECTORS
    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.normals, gl.STATIC_DRAW);

    const normalLocation = gl.getAttribLocation(program, 'a_normal');
    gl.enableVertexAttribArray(normalLocation);
    gl.vertexAttribPointer(normalLocation, 3, gl.FLOAT, false, 0, 0);


    //load wave values to GPU
    let bodyMin = Infinity, bodyMax = -Infinity;
    for (let i = 2; i < objData.positions.length; i += 3) {
        const z = objData.positions[i];
        if (z < bodyMin) bodyMin = z;
        if (z > bodyMax) bodyMax = z;
    }//calculate body boundaries (dynamic in case of change of size)

    const camera = createCamera();
    setupCameraControls(canvas, camera);

    let time = 0;
    let lastTimestamp = null;

    function render(timestamp) {

        if (lastTimestamp === null) {
            lastTimestamp = timestamp; //init timestamp
        } 
        const deltaTime = (timestamp - lastTimestamp) / 1000; //convert to seconds
        lastTimestamp = timestamp;
        time += deltaTime;

        Connectome.step(deltaTime);
        const {amplitude, freqTime} = Connectome.getWaveParams();

        gl.uniform1f(amplitudeLocation, amplitude * 0.5);
        gl.uniform1f(freqTimeLocation, freqTime);
        gl.uniform1f(freqSpaceLocation, 6.28); //body wave static for now (2π)
        gl.uniform1f(timeLocation, time);
        gl.uniform1f(bodyMinLocation, bodyMin); //TODO: fix with real body extension values
        gl.uniform1f(bodyMaxLocation, bodyMax); //TODO: fix with real body extension values


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

        //MODEL MATRIX BUILDING
        const scalingFactor = 0.5;
        const modelMatrix = m4.scaling(scalingFactor, scalingFactor, scalingFactor); //scale model on the 3 axis

        //MVP MATRIX BUILDING
        const mvpMatrix = m4.multiply(projectionMatrix, m4.multiply(viewMatrix, modelMatrix));
        gl.uniformMatrix4fv(matrixLocation, false, mvpMatrix); // write to GPU

        //MODEL MATRIX (ONLY FOR PHONG)
        const modelMatrixLocation = gl.getUniformLocation(program, 'u_modelMatrix');
        gl.uniformMatrix4fv(modelMatrixLocation, false, modelMatrix);

        //LIGHT POSITION
        const lightPositionLocation = gl.getUniformLocation(program, 'u_lightPosition');
        const lightPosition = [2,3,4];
        gl.uniform3fv(lightPositionLocation, lightPosition);

        //CAMERA POSITION
        const viewPositionLocation = gl.getUniformLocation(program, 'u_viewPosition');
        gl.uniform3fv(viewPositionLocation, eye);

        gl.enable(gl.DEPTH_TEST); //control depth faces
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.drawArrays(gl.TRIANGLES, 0, objData.vertexCount);

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
}

main();



