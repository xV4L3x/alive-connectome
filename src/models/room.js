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

            float dist = length(u_lightPositions[i] - v_worldPos);
            float attenuation = 1.0 / (1.0 + 0.02 * dist + 0.003 * dist * dist);

            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * color * u_lightIntensities[i] * attenuation;

            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
            vec3 specular = specularStrength * spec * vec3(1.0) * u_lightIntensities[i] * attenuation;

            ambient += diffuse + specular;
        }

        gl_FragColor = vec4(ambient, 1.0);
    }
`;

const ROOM_SIZE = 50; //half size
const ROOM_HEIGHT = 60;
const TILE_REPEAT = 2;
const WALL_REPEAT_H = 8;
const WALL_REPEAT_V = 3;

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


const roomWallPositions = new Float32Array([
    //back wall (z = -roomsize)
    -ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, -ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,
    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, -ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, -ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,

    //left wall (x = -roomsize)
    -ROOM_SIZE, -CABINET_HEIGHT, ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,
    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT,-ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT,             -ROOM_SIZE,

    //right wall (x = roomsize)
    ROOM_SIZE, -CABINET_HEIGHT, -ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT,-ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT, ROOM_SIZE,
    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT,-ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT, ROOM_SIZE,

    //ceiling (y = -cabinetheight + roomheight)
    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, -ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, -ROOM_SIZE,
    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, -ROOM_SIZE,

    //front wall (z = roomside)
    ROOM_SIZE, -CABINET_HEIGHT, ROOM_SIZE,    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT, ROOM_SIZE,
    ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT + ROOM_HEIGHT, ROOM_SIZE,    -ROOM_SIZE, -CABINET_HEIGHT, ROOM_SIZE,
]);

const roomWallNormals = new Float32Array([
    // back wall
    0, 0, 1,    0, 0, 1,    0, 0, 1,
    0, 0, 1,    0, 0, 1,    0, 0, 1,
    // left wall
    1, 0, 0,    1, 0, 0,    1, 0, 0,
    1, 0, 0,    1, 0, 0,    1, 0, 0,
    // right wall
    -1, 0, 0,   -1, 0, 0,   -1, 0, 0,
    -1, 0, 0,   -1, 0, 0,   -1, 0, 0,
    // ceiling
    0,-1, 0,    0,-1, 0,    0,-1, 0,
    0,-1, 0,    0,-1, 0,    0,-1, 0,
    //front wall
    0, 0,-1,    0, 0,-1,    0, 0,-1,
    0, 0,-1,    0, 0,-1,    0, 0,-1,
]);

const roomWallUVs = new Float32Array([
    // back wall
    0, 0,
    0, WALL_REPEAT_V,
    WALL_REPEAT_H, 0,
    0, WALL_REPEAT_V,
    WALL_REPEAT_H, WALL_REPEAT_V,
    WALL_REPEAT_H, 0,
    // left wall
    0, 0,
    0, WALL_REPEAT_V,
    WALL_REPEAT_H, 0,
    0, WALL_REPEAT_V,
    WALL_REPEAT_H, WALL_REPEAT_V,
    WALL_REPEAT_H, 0,
    // right wall
    0, 0,
    0, WALL_REPEAT_V,
    WALL_REPEAT_H, 0,
    0, WALL_REPEAT_V,
    WALL_REPEAT_H, WALL_REPEAT_V,
    WALL_REPEAT_H, 0,
    // ceiling
    0, 0,
    0, WALL_REPEAT_H,
    WALL_REPEAT_H, 0,
    0, WALL_REPEAT_H,
    WALL_REPEAT_H, WALL_REPEAT_H,
    WALL_REPEAT_H, 0,
    //front wall
    0, 0,
    0, WALL_REPEAT_V,
    WALL_REPEAT_H, 0,
    0, WALL_REPEAT_V,
    WALL_REPEAT_H, WALL_REPEAT_V,
    WALL_REPEAT_H, 0,

]);


/**
 * 
 * @param {WebGLRenderingContext} gl 
 */
async function initRoom(gl) {
    const programInfo = webglUtils.createProgramInfo(gl, [roomVertexShaderSource, roomFragmentShaderSource]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomFloorPositions, gl.STATIC_DRAW);

    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomFloorNormals, gl.STATIC_DRAW);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomFloorUVs, gl.STATIC_DRAW);

    const wallPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, wallPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomWallPositions, gl.STATIC_DRAW);

    const wallNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, wallNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomWallNormals, gl.STATIC_DRAW);

    const wallUvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, wallUvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, roomWallUVs, gl.STATIC_DRAW);


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

    const wallImage = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = 'resources/textures/Concrete034_1K-JPG_Color.jpg';
    });

    const wallTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, wallTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, wallImage);
    gl.generateMipmap(gl.TEXTURE_2D);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return {
        programInfo,
        positionBuffer,
        normalBuffer,
        uvBuffer,
        texture,
        floorVertexCount: 6,
        wallPositionBuffer,
        wallNormalBuffer,
        wallUvBuffer,
        wallTexture,
        wallVertexCount: 5 * 6,
    };
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {*} room 
 * @param {*} param2 
 */
function drawRoom(gl, room, { viewProjectionMatrix, eye }) {
    gl.useProgram(room.programInfo.program);

    const modelMatrix = m4.identity();
    const mvpMatrix   = m4.multiply(viewProjectionMatrix, modelMatrix);

    webglUtils.setAttributes(room.programInfo.attribSetters, {
        a_position: { buffer: room.positionBuffer, numComponents: 3 },
        a_normal:   { buffer: room.normalBuffer,   numComponents: 3 },
        a_texCoord: { buffer: room.uvBuffer,       numComponents: 2 },
    });
    webglUtils.setUniforms(room.programInfo, {
        u_matrix:           mvpMatrix,
        u_modelMatrix:      modelMatrix,
        u_texture:          room.texture,
        u_lightPositions:   Lights.getPositionsFlat(),
        u_lightIntensities: Lights.getIntensities(),
        u_viewPosition:     eye,
    });
    gl.drawArrays(gl.TRIANGLES, 0, room.floorVertexCount);

    //DRAW WALLS
    webglUtils.setAttributes(room.programInfo.attribSetters, {
        a_position: { buffer: room.wallPositionBuffer, numComponents: 3 },
        a_normal:   { buffer: room.wallNormalBuffer,   numComponents: 3 },
        a_texCoord: { buffer: room.wallUvBuffer,       numComponents: 2 },
    });
    webglUtils.setUniforms(room.programInfo, { u_texture: room.wallTexture });
    gl.drawArrays(gl.TRIANGLES, 0, room.wallVertexCount);
}

