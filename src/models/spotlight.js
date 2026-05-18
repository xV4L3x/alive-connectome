'use strict';

const spotlightVertexShaderSource = `
    attribute vec3 a_position;

    uniform mat4 u_matrix;

    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
    }
`;

const spotlightFragmentShaderSource = `
    precision mediump float;

    void main() {
        gl_FragColor = vec4(0.9, 0.9, 0.9, 1.0);
    }
`;

const CYLINDER_SIDES = 12;
const CYLINDER_RADIUS = 0.15;
const CYLINDER_HEIGHT = 0.25;

function generateCylinderPositions() {
    const positions = [];

    for (let i = 0; i < CYLINDER_SIDES; i++) {
        const angle1 = (i / CYLINDER_SIDES) * 2 * Math.PI; //first angle of size 2π/sides
        const angle2 = ((i + 1) / CYLINDER_SIDES) * 2 * Math.PI; //sencond angle for the triangle point

        const x1 = CYLINDER_RADIUS * Math.cos(angle1); //x component for first angle
        const z1 = CYLINDER_RADIUS * Math.sin(angle1); //z (depth) component for first angle

        const x2 = CYLINDER_RADIUS * Math.cos(angle2); //x component for second angle
        const z2 = CYLINDER_RADIUS * Math.sin(angle2); //z (depth) component for second angle

        //lateral side, 2 triangles per face
        positions.push(x1, 0, z1);
        positions.push(x1, -CYLINDER_HEIGHT, z1);
        positions.push(x2, 0, z2);

        positions.push(x2, 0, z2);
        positions.push(x1, -CYLINDER_HEIGHT, z1);
        positions.push(x2, -CYLINDER_HEIGHT, z2);

        //triangle for top disc
        positions.push(0,0,0);
        positions.push(x2, 0, z2);
        positions.push(x1, 0, z1);
    }

    return new Float32Array(positions);
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 */
function initSpotlight(gl) {
    const program = createShaderProgram(gl, spotlightVertexShaderSource, spotlightFragmentShaderSource);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, generateCylinderPositions(), gl.STATIC_DRAW);

    return {
        program,
        positionBuffer,
        vertexCount: CYLINDER_SIDES * 3 * 3, //3 triangles per side
        locations: {
            matrix: gl.getUniformLocation(program, 'u_matrix'),
            position: gl.getAttribLocation(program, 'a_position')
        }
    }
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {*} spotlight 
 * @param {*} param2 
 */
function drawSpotlight(gl, spotlight, { viewProjectionMatrix }) {
    gl.useProgram(spotlight.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, spotlight.positionBuffer);
    gl.enableVertexAttribArray(spotlight.locations.position);
    gl.vertexAttribPointer(spotlight.locations.position, 3, gl.FLOAT, false, 0, 0);

    for (const [px, py, pz] of Lights.getPositionsRaw()) {
        const horizontalDistance = Math.sqrt(px*px + pz*pz); //distance between light and the center
        const yaw = Math.atan2(-px, -pz); //angle of the inverse vector of the tank corner
        const pitch = Math.atan2(horizontalDistance, py);

        const modelMatrix = m4.multiply(
            m4.translation(px, py, pz),
            m4.multiply(
                m4.yRotation(yaw),
                m4.xRotation(-pitch)
            )
        );

        const mvpMatrix = m4.multiply(viewProjectionMatrix, modelMatrix);
        gl.uniformMatrix4fv(spotlight.locations.matrix, false, mvpMatrix);
        gl.drawArrays(gl.TRIANGLES, 0, spotlight.vertexCount);
    }
}