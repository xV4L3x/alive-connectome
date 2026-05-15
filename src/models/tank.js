'use strict';

const tankVertexShaderSource = `
    attribute vec3 a_position;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    varying vec3 v_worldPos;

    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_worldPos = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
    }
`;

const tankFragmentShaderSource = `
    precision mediump float;

    void main() {
        vec3 glassColor = vec3(0.8, 0.95, 1.0); //light cyan
        float alpha = 0.10;
        gl_FragColor = vec4(glassColor, alpha);
    }
`;

const TANK_WIDTH = 5; //from -TANK_WIDTH to TANK_WIDTH
const TANK_HEIGHT = 3; //from 0 to TANK_HEIGHT
const TANK_DEPTH = 5; //from -TANK_DEPTH to TANK_DEPTH

const planningVectors = {
    A: [-TANK_WIDTH, 0, TANK_DEPTH],
    B: [-TANK_WIDTH, TANK_HEIGHT, TANK_DEPTH],
    C: [TANK_WIDTH, TANK_HEIGHT, TANK_DEPTH],
    D: [TANK_WIDTH, 0, TANK_DEPTH],
    E: [-TANK_WIDTH, 0, -TANK_DEPTH],
    F: [-TANK_WIDTH, TANK_HEIGHT, -TANK_DEPTH],
    G: [TANK_WIDTH, TANK_HEIGHT, -TANK_DEPTH],
    H: [TANK_WIDTH, 0, -TANK_DEPTH],
}

const triangles = {
    ABD: planningVectors.A.concat(planningVectors.B, planningVectors.D),
    BCD: planningVectors.B.concat(planningVectors.C, planningVectors.D),

    HGE: planningVectors.H.concat(planningVectors.G, planningVectors.E),
    GFE: planningVectors.G.concat(planningVectors.F, planningVectors.E),

    EFA: planningVectors.E.concat(planningVectors.F, planningVectors.A),
    FBA: planningVectors.F.concat(planningVectors.B, planningVectors.A),

    DCH: planningVectors.D.concat(planningVectors.C, planningVectors.H),
    CGH: planningVectors.C.concat(planningVectors.G, planningVectors.H)
}

const faces = {
    front: triangles.ABD.concat(triangles.BCD),
    rear: triangles.HGE.concat(triangles.GFE),
    leftSide: triangles.EFA.concat(triangles.FBA),
    rightSide: triangles.DCH.concat(triangles.CGH),
}

const tankPositions = new Float32Array(
    faces.front.concat(
        faces.rear, 
        faces.leftSide, 
        faces.rightSide
    )
);

/**
 * 
 * @param {WebGLRenderingContext} gl 
 */
function initTank(gl) {
    const program = createShaderProgram(gl, tankVertexShaderSource, tankFragmentShaderSource);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, tankPositions, gl.STATIC_DRAW);

    return {
        program,
        positionBuffer,
        vertexCount: tankPositions.length / 3,
        locations: {
            matrix: gl.getUniformLocation(program, 'u_matrix'),
            modelMatrix: gl.getUniformLocation(program, 'u_modelMatrix'),
            position: gl.getAttribLocation(program, 'a_position')
        }
    }
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {*} tank 
 * @param {*} param2 
 */
function drawTank(gl, tank, { viewProjectionMatrix }) {
    gl.useProgram(tank.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, tank.positionBuffer);
    gl.enableVertexAttribArray(tank.locations.position);
    gl.vertexAttribPointer(tank.locations.position, 3, gl.FLOAT, false, 0, 0);

    const tankModelMatrix = m4.identity();
    const tankMvpMatrix = viewProjectionMatrix;

    gl.uniformMatrix4fv(tank.locations.matrix, false, tankMvpMatrix);
    gl.uniformMatrix4fv(tank.locations.modelMatrix, false, tankModelMatrix);

    gl.enable(gl.BLEND); //enable blend to mix colors
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); //alpha * new_color * (1 - alpha) * existing_color (alpha = visibility)
    gl.depthMask(false);

    gl.drawArrays(gl.TRIANGLES, 0, tank.vertexCount);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
}

