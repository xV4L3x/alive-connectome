'use strict';

const vertexShaderSource = `
    attribute vec4 a_position;
    attribute vec4 a_color;

    uniform mat4 u_matrix;

    varying vec4 v_color; //color to send to fragment

    void main() {
        gl_Position = u_matrix * a_position; //multiply all vertex before sending to screen
        v_color = a_color;
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    varying vec4 v_color;

    void main() {
        gl_FragColor = v_color;
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

    const program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

    const matrixLocation = gl.getUniformLocation(program, 'u_matrix'); //get Model View Projection matrix address

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
    resizeCanvas(canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);

    //TEXTURE APPLICATION
    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, objData.colors, gl.STATIC_DRAW);

    const colorLocation = gl.getAttribLocation(program, 'a_color');
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);


    //PROJECTION MATRIX BUILDING
    const fov = Math.PI / 4; // 45 degrees
    const aspect = canvas.width / canvas.height;
    const near = 0.1; // frustum near cutting plane
    const far = 1000.0; // frustum far cutting plane
    const projectionMatrix = m4.perspective(fov, aspect, near, far);

    //VIEW MATRIX BUILDING
    const eye = [0, 0, 5]; // camera position
    const target = [0, 0, 0]; // looking at point
    const up = [0, 1, 0]; // upper direction
    const viewMatrix = m4.inverse(m4.lookAt(eye, target, up)); // inverse matrix because we need the matrix of "the world" seen by the camera, not the camera

    //MODEL MATRIX BUILDING
    const scalingFactor = 0.5;
    const modelMatrix = m4.scaling(scalingFactor, scalingFactor, scalingFactor); //scale model on the 3 axis

    //MVP MATRIX BUILDING
    const mvpMatrix = m4.multiply(projectionMatrix, m4.multiply(viewMatrix, modelMatrix));
    gl.uniformMatrix4fv(matrixLocation, false, mvpMatrix); // write to GPU



    gl.enable(gl.DEPTH_TEST); //control depth faces
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, objData.vertexCount);
}

main();



