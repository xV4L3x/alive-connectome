'use strict';

const roomVertexShaderSource = `
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

const roomFragmentShaderSource = `
    precision mediump float;

    varying vec3 v_normal;
    varying vec3 v_worldPos;
    varying vec2 v_texCoord;

    uniform sampler2D u_texture;
    uniform vec3 u_lightPositions[4];
    uniform float u_lightIntensities[4];
    uniform vec3 u_viewPosition;

    void main() {
        vec3 color = texture2D(u_texture, v_texCoord).rgb;

        vec3 normal = normalize(v_normal);
        vec3 viewDir = normalize(u_viewPosition - v_worldPos);

        float ambientStrength = 0.03;
        vec3 ambient = ambientStrength * color;

        float specularStrength = 0.3;

        for (int i = 0; i < 4; i++) {
            vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos);

            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * color * u_lightIntensities[i];

            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
            vec3 specular = specularStrength * spec * vec3(1.0) * u_lightIntensities[i];

            ambient += diffuse + specular;
        }

        gl_FragColor = vec4(ambient, 1.0);
    }
`;

const ROOM_SIZE = 40; //half size
const TILE_REPEAT = 2;

const roomFloorPositions = new Float32Array([
    -ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT,  ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,
    -ROOM_SIZE, -CABINET_HEIGHT,  ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT,  ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,
]);
const roomFloorNormals = new Float32Array([
    0, 1, 0,    0, 1, 0,    0, 1, 0,
    0, 1, 0,    0, 1, 0,    0, 1, 0,
]);
const roomFloorUVs = new Float32Array([
    0,           0,
    0,           TILE_REPEAT,
    TILE_REPEAT, 0,
    0,           TILE_REPEAT,
    TILE_REPEAT, TILE_REPEAT,
    TILE_REPEAT, 0,
]);

/**
 * 
 * @param {WebGLRenderingContext} gl 
 */
async function initRoom(gl) {
    const program = createShaderProgram(gl, roomVertexShaderSource, roomFragmentShaderSource);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomFloorPositions, gl.STATIC_DRAW);

    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomFloorNormals, gl.STATIC_DRAW);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomFloorUVs, gl.STATIC_DRAW);

    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = 'resources/textures/Tiles133D_1K-JPG_Color.jpg';
    });

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return {
        program,
        positionBuffer,
        normalBuffer,
        uvBuffer,
        texture,
        floorVertexCount: 6,
        locations: {
            matrix:           gl.getUniformLocation(program, 'u_matrix'),
            modelMatrix:      gl.getUniformLocation(program, 'u_modelMatrix'),
            lightPositions:   gl.getUniformLocation(program, 'u_lightPositions'),
            lightIntensities: gl.getUniformLocation(program, 'u_lightIntensities'),
            viewPosition:     gl.getUniformLocation(program, 'u_viewPosition'),
            textureLoc:       gl.getUniformLocation(program, 'u_texture'),
            position:         gl.getAttribLocation(program, 'a_position'),
            normal:           gl.getAttribLocation(program, 'a_normal'),
            texCoord:         gl.getAttribLocation(program, 'a_texCoord'),
        }
    };
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {*} room 
 * @param {*} param2 
 */
function drawRoom(gl, room, { viewProjectionMatrix, eye }) {
    gl.useProgram(room.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, room.positionBuffer);
    gl.enableVertexAttribArray(room.locations.position);
    gl.vertexAttribPointer(room.locations.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, room.normalBuffer);
    gl.enableVertexAttribArray(room.locations.normal);
    gl.vertexAttribPointer(room.locations.normal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, room.uvBuffer);
    gl.enableVertexAttribArray(room.locations.texCoord);
    gl.vertexAttribPointer(room.locations.texCoord, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, room.texture);
    gl.uniform1i(room.locations.textureLoc, 0);

    const modelMatrix = m4.identity();
    const mvpMatrix   = m4.multiply(viewProjectionMatrix, modelMatrix);

    gl.uniformMatrix4fv(room.locations.matrix, false, mvpMatrix);
    gl.uniformMatrix4fv(room.locations.modelMatrix, false, modelMatrix);
    gl.uniform3fv(room.locations.lightPositions, Lights.getPositionsFlat());
    gl.uniform1fv(room.locations.lightIntensities, Lights.getIntensities());
    gl.uniform3fv(room.locations.viewPosition, eye);

    gl.drawArrays(gl.TRIANGLES, 0, room.floorVertexCount);
}

