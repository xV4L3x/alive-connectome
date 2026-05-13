'use strict';

const vertexShaderSource = `
    attribute vec4 a_position;

    void main() {
        gl_Position = a_position;
    }
`;

const fragmentShaderSource = `
    precision mediump float;

    void main() {
        gl_FragColor = vec4(1.0, 0.5, 0.0, 1.0);
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

/** @type (HTMLCanvasElement|null) */
const canvas = document.getElementById('gl-canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    alert('WebGL is not supported by this browser!');
    throw new Error('WebGL not available');
} 

console.log('WebGL correctly initialized');

const program = createShaderProgram(gl, vertexShaderSource, fragmentShaderSource);

// triangle vertices
const vertices = new Float32Array([
    0.0, 0.5, // top-center
    -0.5, -0.5, // bottom-left
    0.5, -0.5 // bottom-right
]);

const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

const positionLocation = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0 , 0); // 2 numbers per vertex

gl.useProgram(program);
gl.clearColor(0.1, 0.1, 0.1, 1.0); //background color
gl.clear(gl.COLOR_BUFFER_BIT); //clear screen

resizeCanvas(canvas); //fullscreen resolution
gl.viewport(0, 0, canvas.width, canvas.height); 

gl.drawArrays(gl.TRIANGLES, 0, 3)