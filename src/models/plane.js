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
    uniform vec3 u_lightPosition;
    uniform vec3 u_viewPosition;

    void main() {
        vec3 color = texture2D(u_texture, v_texCoord).rgb;

        vec3 normal = normalize(v_normal);
        vec3 lightDir = normalize(u_lightPosition - v_worldPos);
        vec3 viewDir = normalize(u_viewPosition - v_worldPos);

        float ambientStrength = 0.4;
        vec3 ambient = ambientStrength * color;

        float diff = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diff * color;

        float specularStrength = 0.1;
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
        vec3 specular = specularStrength * spec * vec3(1.0);

        gl_FragColor = vec4(ambient + diffuse + specular, 1.0);
    }
`;

const PLANE_EXTENSION = 5;

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
    const program = createShaderProgram(gl, planeVertexShaderSource, planeFragmentShaderSource);

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
        program,
        positionBuffer,
        normalBuffer,
        uvBuffer,
        texture,
        vertexCount: 6,
        locations: {
            matrix: gl.getUniformLocation(program, 'u_matrix'),
            modelMatrix: gl.getUniformLocation(program, 'u_modelMatrix'),
            lightPosition: gl.getUniformLocation(program, 'u_lightPosition'),
            viewPosition: gl.getUniformLocation(program, 'u_viewPosition'),
            textureLoc: gl.getUniformLocation(program, 'u_texture'),
            position: gl.getAttribLocation(program, 'a_position'),
            normal: gl.getAttribLocation(program, 'a_normal'),
            texCoord: gl.getAttribLocation(program, 'a_texCoord'),
        },
    };
}

function drawPlane(gl, plane, { viewProjectionMatrix, eye, lightPosition }) {
    gl.useProgram(plane.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, plane.positionBuffer);
    gl.enableVertexAttribArray(plane.locations.position);
    gl.vertexAttribPointer(plane.locations.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, plane.normalBuffer);
    gl.enableVertexAttribArray(plane.locations.normal);
    gl.vertexAttribPointer(plane.locations.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, plane.uvBuffer);
    gl.enableVertexAttribArray(plane.locations.texCoord);
    gl.vertexAttribPointer(plane.locations.texCoord, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, plane.texture);
    gl.uniform1i(plane.locations.textureLoc, 0);

    const planeModelMatrix = m4.identity();
    const planeMvpMatrix = viewProjectionMatrix;

    gl.uniformMatrix4fv(plane.locations.matrix,      false, planeMvpMatrix);
    gl.uniformMatrix4fv(plane.locations.modelMatrix, false, planeModelMatrix);
    gl.uniform3fv(plane.locations.lightPosition, lightPosition);
    gl.uniform3fv(plane.locations.viewPosition,  eye);

    gl.drawArrays(gl.TRIANGLES, 0, plane.vertexCount);
}
