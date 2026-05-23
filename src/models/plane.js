'use strict';

const planeVertexShaderSource = `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    attribute vec2 a_texCoord;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    varying vec3 v_normal;
    varying vec3 v_worldPos;
    varying vec2 v_texCoord;

    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_normal = mat3(u_modelMatrix) * a_normal;
        v_worldPos = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
        v_texCoord = a_texCoord;
    }
`;

const planeFragmentShaderSource = `
    precision mediump float;

    varying vec3 v_normal;
    varying vec3 v_worldPos;
    varying vec2 v_texCoord;

    uniform sampler2D u_texture;
    uniform vec3 u_lightPositions[4];
    uniform float u_lightIntensities[4];
    uniform vec3 u_viewPosition;
    uniform float u_advanced;

    void main() {

        //GROUND MATERIAL CONFIGURATION
        float Ka = 0.1;
        float Kd = 0.8;
        float Ks = 0.02;
        float shininess = 8.0;
        vec3 specularColor = vec3(0.04, 0.04, 0.04);

        vec3 color = texture2D(u_texture, v_texCoord).rgb;
        vec3 normal = normalize(v_normal);
        vec3 viewDir = normalize(u_viewPosition - v_worldPos);

        vec3 result = Ka * color;

        for (int i = 0; i < 4; i++) { 
            vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos);
            vec3 reflectDir = reflect(-lightDir, normal);

            float dist = length(u_lightPositions[i] - v_worldPos);
            float att = 1.0 / (1.0 + 0.02 * dist + 0.003 * dist * dist);

            //diffuse light
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = Kd * diff * color * u_lightIntensities[i] * att;

            //specular light
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 8.0);
            vec3 specular = Ks * spec * specularColor * u_lightIntensities[i] * att * u_advanced;

            result += diffuse + specular;
        }

        gl_FragColor = vec4(result, 1.0);
    }
`;

const PLANE_EXTENSION = 8;

//XYZ: x -> side, y -> vertical, z -> depth
const planePositions = new Float32Array([
    -PLANE_EXTENSION, 0, -PLANE_EXTENSION,    -PLANE_EXTENSION, 0,  PLANE_EXTENSION,    PLANE_EXTENSION, 0, -PLANE_EXTENSION,
    -PLANE_EXTENSION, 0,  PLANE_EXTENSION,     PLANE_EXTENSION, 0,  PLANE_EXTENSION,    PLANE_EXTENSION, 0, -PLANE_EXTENSION,
]);

const planeNormals = new Float32Array([
    0, 1, 0,    0, 1, 0,    0, 1, 0,
    0, 1, 0,    0, 1, 0,    0, 1, 0,
]);

const planeUVs = new Float32Array([
    0, 0,    0, 1,    1, 0,
    0, 1,    1, 1,    1, 0,
]);

/**
 * 
 * @param {WebGLRenderingContext} gl 
 */
async function initPlane(gl) {
    const programInfo = webglUtils.createProgramInfo(gl, [planeVertexShaderSource, planeFragmentShaderSource]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, planePositions, gl.STATIC_DRAW);

    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, planeNormals, gl.STATIC_DRAW);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, planeUVs, gl.STATIC_DRAW);

    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = 'resources/textures/Ground033_1K-JPG_Color.jpg';
    });

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);

    //REPEAT IF OVERFLOW
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    //LINEAR INTEROPOLATION WITH DISTANCE
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    //MAG FILTER WHEN CLOSE
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);


    return {
        programInfo,
        positionBuffer,
        normalBuffer,
        uvBuffer,
        texture,
        vertexCount: 6,
    };
}

function drawPlane(gl, plane, { viewProjectionMatrix, eye, lightPosition }) {
    gl.useProgram(plane.programInfo.program);

    webglUtils.setAttributes(plane.programInfo, {
        a_position: { buffer: plane.positionBuffer, numComponents: 3 },
        a_normal:   { buffer: plane.normalBuffer,   numComponents: 3 },
        a_texCoord: { buffer: plane.uvBuffer,       numComponents: 2 },
    });

    const planeModelMatrix = m4.identity();
    const planeMvpMatrix = viewProjectionMatrix;

    webglUtils.setUniforms(plane.programInfo, {
        u_matrix:           planeMvpMatrix,
        u_modelMatrix:      planeModelMatrix,
        u_texture:          plane.texture,
        u_lightPositions:   Lights.getPositionsFlat(),
        u_lightIntensities: Lights.getIntensities(),
        u_viewPosition:     eye,
        u_advanced:         params.shadows ? 1.0 : 0.0,
    });

    gl.drawArrays(gl.TRIANGLES, 0, plane.vertexCount);
}
