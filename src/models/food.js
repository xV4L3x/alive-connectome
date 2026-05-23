'use strict';

const foodVertexShaderSource = `
    attribute vec3 a_position;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    varying vec3 v_worldPos;

    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_worldPos = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
    }
`;

const foodFragmentShaderSource = `
    precision mediump float;

    uniform vec3 u_color;
    uniform float u_alpha;
    uniform vec3 u_lightPositions[4];
    uniform float u_lightIntensities[4];
    uniform vec3 u_viewPosition;

    varying vec3 v_worldPos;

    void main() {
        vec3 normal = vec3(0.0, 1.0, 0.0);
        vec3 viewDir = normalize(u_viewPosition - v_worldPos);

        vec3 ambient = 0.3 * u_color;

        for (int i = 0; i < 4; i++) {
            vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos);

            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * u_color * u_lightIntensities[i];

            vec3  reflectDir = reflect(-lightDir, normal);
            float spec       = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
            vec3  specular   = 0.1 * spec * vec3(1.0) * u_lightIntensities[i];

            ambient += diffuse + specular;
        }

        gl_FragColor = vec4(ambient, u_alpha);
    }
`;

const FOOD_SIDES = 20;
const FOOD_RADIUS = 0.4;

function generateDiscPositions() {
    const positions = [];

    for (let i = 0; i < FOOD_SIDES; i++) {
        const angle1 = (i / FOOD_SIDES) * 2 * Math.PI;
        const angle2 = ((i + 1) / FOOD_SIDES) * 2 * Math.PI;

        positions.push(0,0,0);
        positions.push(FOOD_RADIUS * Math.cos(angle1), 0, FOOD_RADIUS * Math.sin(angle1));
        positions.push(FOOD_RADIUS * Math.cos(angle2), 0, FOOD_RADIUS * Math.sin(angle2));
    }

    return new Float32Array(positions);
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 */
function initFood(gl) {
    const programInfo = webglUtils.createProgramInfo(gl, [foodVertexShaderSource, foodFragmentShaderSource]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, generateDiscPositions(), gl.STATIC_DRAW);

    return {
        programInfo,
        positionBuffer,
        vertexCount: FOOD_SIDES * 3,
    }
}

function createFoodInstance(position = [0, 0, 0], nutrients = 1.0) {
    return {
        position: [...position],
        nutrients,
    };
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {*} food 
 * @param {*} foodInstance 
 */
function drawFood(gl, food, foodInstance, { viewProjectionMatrix, eye }) {
    gl.useProgram(food.programInfo.program);

    webglUtils.setAttributes(food.programInfo.attribSetters, {
        a_position: { buffer: food.positionBuffer, numComponents: 3 },
    });

    const [px, py, pz] = foodInstance.position;
    const modelMatrix = m4.multiply(
        m4.translation(px, py, pz),
        m4.scaling(foodInstance.nutrients, 1, foodInstance.nutrients)
    );

    const mvpMatrix = m4.multiply(viewProjectionMatrix, modelMatrix);

    webglUtils.setUniforms(food.programInfo, {
        u_matrix:           mvpMatrix,
        u_modelMatrix:      modelMatrix,
        u_color:            [0.8, 0.3, 0.2],
        u_alpha:            0.65,
        u_lightPositions:   Lights.getPositionsFlat(),
        u_lightIntensities: Lights.getIntensities(),
        u_viewPosition:     eye,
    });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    gl.drawArrays(gl.TRIANGLES, 0, food.vertexCount);

    gl.depthMask(true);
    gl.disable(gl.BLEND);

}
