'use strict';

const BADGE_X = 0;
const BADGE_Y = 7;
const BADGE_Z = 0;

const ROPE_ANCHOR_Y = 40; // top rope point

const BADGE_HALF_WIDTH = 1.20;
const BADGE_HALF_HEIGHT = 0.75;
const BADGE_HALFT_DEPTH = 0.02;
const BADGE_CORNER_RADIUS = 0.12;
const BADGE_CORNER_SEGMENTS = 6;

const ROPE_HALF_WIDTH = 0.015;

const badgeVertexShaderSource = `
    attribute vec3 a_position;
    attribute vec3 a_normal;
    attribute vec2 a_texcoord;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    varying vec3 v_normal;
    varying vec3 v_worldPos;
    varying vec2 v_texcoord;

    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_normal    = mat3(u_modelMatrix) * a_normal;
        v_worldPos  = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
        v_texcoord  = a_texcoord;
    }
`;

const badgeFragmentShaderSource = `
    precision mediump float;

    varying vec3 v_normal;
    varying vec3 v_worldPos;
    varying vec2 v_texcoord;

    uniform vec3      u_lightPositions[4];
    uniform float     u_lightIntensities[4];
    uniform vec3      u_viewPosition;
    uniform sampler2D u_texFront;
    uniform sampler2D u_texBack;
    uniform int       u_mode;

    void main() {
        // Sceglie il colore base in funzione della faccia che stiamo disegnando
        vec3 baseColor;
        if (u_mode == 0) {
            baseColor = texture2D(u_texFront, v_texcoord).rgb;
        } else if (u_mode == 1) {
            baseColor = texture2D(u_texBack, v_texcoord).rgb;
        } else {
            baseColor = vec3(0.92, 0.92, 0.92);   // bordo plastica bianca
        }

        vec3 normal  = normalize(v_normal);
        vec3 viewDir = normalize(u_viewPosition - v_worldPos);

        vec3 color = 0.15 * baseColor;   // ambient

        for (int i = 0; i < 4; i++) {
            vec3  lightDir = normalize(u_lightPositions[i] - v_worldPos);
            float dist     = length(u_lightPositions[i] - v_worldPos);
            float att      = 1.0 / (1.0 + 0.02 * dist + 0.003 * dist * dist);

            // Diffuse
            float diff  = max(dot(normal, lightDir), 0.0);
            color      += diff * baseColor * u_lightIntensities[i] * att;

            // Specular (leggero, è plastica non metallo)
            vec3  refl  = reflect(-lightDir, normal);
            float spec  = pow(max(dot(viewDir, refl), 0.0), 32.0);
            color      += 0.2 * spec * vec3(1.0) * u_lightIntensities[i] * att;
        }

        gl_FragColor = vec4(color, 1.0);
    }
`;

const ropeVertexShaderSource = `
    attribute vec3 a_position;
    attribute vec3 a_normal;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    varying vec3 v_normal;
    varying vec3 v_worldPos;

    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_normal    = mat3(u_modelMatrix) * a_normal;
        v_worldPos  = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
    }
`;

const ropeFragmentShaderSource = `
    precision mediump float;

    varying vec3 v_normal;
    varying vec3 v_worldPos;

    uniform vec3  u_lightPositions[4];
    uniform float u_lightIntensities[4];
    uniform vec3  u_viewPosition;

    void main() {
        vec3 ropeColor = vec3(0.28, 0.20, 0.13);   // marrone scuro, corda/filo

        vec3 normal = normalize(v_normal);
        vec3 color  = 0.2 * ropeColor;   // ambient

        for (int i = 0; i < 4; i++) {
            vec3  lightDir = normalize(u_lightPositions[i] - v_worldPos);
            float dist     = length(u_lightPositions[i] - v_worldPos);
            float att      = 1.0 / (1.0 + 0.02 * dist + 0.003 * dist * dist);

            float diff = max(dot(normal, lightDir), 0.0);
            color     += diff * ropeColor * u_lightIntensities[i] * att;
        }

        gl_FragColor = vec4(color, 1.0);
    }
`;


function buildPerimeter(halfW, halfH, cornerRadius, numCornerSegs) {
    const points = [];

    const cx = halfW - cornerRadius;
    const cy = halfH - cornerRadius;

    const cornerDefs = [
        { ox: cx, oy: cy, startAngle: 0}, //top-right
        { ox: -cx, oy: cy, startAngle: Math.PI / 2}, //top-left
        { ox: -cx, oy: -cy, startAngle: Math.PI}, //bottom-left
        { ox: cx, oy: -cy, startAngle: 3 * Math.PI / 2} //bottom-right
    ];

    for (const {ox, oy, startAngle} of cornerDefs) {
        for (let i = 0; i <= numCornerSegs; i++) {
            const angle = startAngle + (i / numCornerSegs) * (Math.PI / 2);
            points.push({
                x: ox + cornerRadius * Math.cos(angle),
                y: oy + cornerRadius * Math.sin(angle),
            });
        }
    }

    return points;
}

function generateBadgeGeometry() {
    const perim = buildPerimeter(BADGE_HALF_WIDTH, BADGE_HALF_HEIGHT, BADGE_CORNER_RADIUS, BADGE_CORNER_SEGMENTS);
    const n = perim.length;

    const positions = [];
    const normals = [];
    const uvs = [];

    // FRONT FACE
    for (let i = 0; i < n; i++) {
        const current = perim[i];
        const next = perim[(i + 1) % n];

        positions.push(0, 0, BADGE_HALFT_DEPTH,    current.x, current.y, BADGE_HALFT_DEPTH,    next.x, next.y, BADGE_HALFT_DEPTH);
        normals.push(0, 0, 1,    0, 0, 1,    0, 0, 1);
        uvs.push(
            0.5, 0.5, //center
            (current.x + BADGE_HALF_WIDTH) / (2 * BADGE_HALF_WIDTH), (current.y + BADGE_HALF_HEIGHT) / (2 * BADGE_HALF_HEIGHT), // ex: top-left (-halfW + halfW) / (2halfW) = 0
            (next.x + BADGE_HALF_WIDTH) / (2 * BADGE_HALF_WIDTH), (next.y + BADGE_HALF_HEIGHT) / (2 * BADGE_HALF_HEIGHT)
        );
    }

    const frontVertexCount = n * 3;

    //REAR FACE
    for (let i = 0; i < n; i++) {
        const current = perim[i];
        const next = perim[(i+1) % n];

        positions.push(0, 0, -BADGE_HALFT_DEPTH,    next.x, next.y, -BADGE_HALFT_DEPTH,    current.x, current.y, -BADGE_HALFT_DEPTH);
        normals.push(0, 0, -1,    0, 0, -1,    0, 0, -1);
        uvs.push(
            0.5, 0.5, //center
            1.0 - (next.x + BADGE_HALF_WIDTH) / (2 * BADGE_HALF_WIDTH), (next.y + BADGE_HALF_HEIGHT) / (2 * BADGE_HALF_HEIGHT), //top-left (x - halfW) / 2halfW = 1
            1.0 - (current.x + BADGE_HALF_WIDTH) / (2 * BADGE_HALF_WIDTH), (current.y + BADGE_HALF_HEIGHT) / (2 * BADGE_HALF_HEIGHT)
        );
    }

    const rearVertexCount = n * 3;


    //SIDE
    for (let i = 0; i < n; i++) {
        const curr = perim[i];
        const next = perim[(i + 1) % n];

        const ex  = next.x - curr.x;
        const ey  = next.y - curr.y;
        const len = Math.sqrt(ex * ex + ey * ey);
        const nx  = ey / len;
        const ny  = -ex / len;

        positions.push(curr.x, curr.y,  BADGE_HALFT_DEPTH,   curr.x, curr.y, -BADGE_HALFT_DEPTH,   next.x, next.y, -BADGE_HALFT_DEPTH);
        normals.push  (nx, ny, 0,    nx, ny, 0,    nx, ny, 0);
        uvs.push(
            0, 0,  
            0, 0,  
            0, 0
        );

        positions.push(curr.x, curr.y,  BADGE_HALFT_DEPTH,   next.x, next.y, -BADGE_HALFT_DEPTH,   next.x, next.y,  BADGE_HALFT_DEPTH);
        normals.push  (nx, ny, 0,    nx, ny, 0,    nx, ny, 0);
        uvs.push(
            0, 0,
            0, 0,
            0, 0
        );
    }
    const sideVertexCount = n * 6;


    return {
        positions: new Float32Array(positions),
        normals:   new Float32Array(normals),
        uvs:       new Float32Array(uvs),
        frontVertexCount,
        rearVertexCount,
        sideVertexCount,
    };
}


function generateRopeGeometry() {
    const ropeBottom = BADGE_Y + BADGE_HALF_HEIGHT;   // tocca la sommità del badge
    const ropeTop = ROPE_ANCHOR_Y;             // punto di ancoraggio in alto

    const positions = [];
    const normals = [];

    const faces = [
        { nx:  0, nz:  1, corners: [[-ROPE_HALF_WIDTH, ropeBottom,  ROPE_HALF_WIDTH], [ ROPE_HALF_WIDTH, ropeBottom,  ROPE_HALF_WIDTH], [ ROPE_HALF_WIDTH, ropeTop,  ROPE_HALF_WIDTH], [-ROPE_HALF_WIDTH, ropeTop,  ROPE_HALF_WIDTH]] },
        { nx:  0, nz: -1, corners: [[ ROPE_HALF_WIDTH, ropeBottom, -ROPE_HALF_WIDTH], [-ROPE_HALF_WIDTH, ropeBottom, -ROPE_HALF_WIDTH], [-ROPE_HALF_WIDTH, ropeTop, -ROPE_HALF_WIDTH], [ ROPE_HALF_WIDTH, ropeTop, -ROPE_HALF_WIDTH]] },
        { nx: -1, nz:  0, corners: [[-ROPE_HALF_WIDTH, ropeBottom, -ROPE_HALF_WIDTH], [-ROPE_HALF_WIDTH, ropeBottom,  ROPE_HALF_WIDTH], [-ROPE_HALF_WIDTH, ropeTop,  ROPE_HALF_WIDTH], [-ROPE_HALF_WIDTH, ropeTop, -ROPE_HALF_WIDTH]] },
        { nx:  1, nz:  0, corners: [[ ROPE_HALF_WIDTH, ropeBottom,  ROPE_HALF_WIDTH], [ ROPE_HALF_WIDTH, ropeBottom, -ROPE_HALF_WIDTH], [ ROPE_HALF_WIDTH, ropeTop, -ROPE_HALF_WIDTH], [ ROPE_HALF_WIDTH, ropeTop,  ROPE_HALF_WIDTH]] },
    ];

    for (const { nx, nz, corners: v } of faces) {
        positions.push(...v[0], ...v[1], ...v[2]);
        normals.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz);

        positions.push(...v[0], ...v[2], ...v[3]);
        normals.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz);
    }

    return {
        positions:   new Float32Array(positions),
        normals:     new Float32Array(normals),
        vertexCount: positions.length / 3,
    };
}


async function initBadge(gl) {
    const badgeProgramInfo = webglUtils.createProgramInfo(gl, [badgeVertexShaderSource, badgeFragmentShaderSource]);
    const ropeProgramInfo  = webglUtils.createProgramInfo(gl, [ropeVertexShaderSource,  ropeFragmentShaderSource]);

    const badgeGeo = generateBadgeGeometry();
    const ropeGeo  = generateRopeGeometry();

    // Buffer badge (posizioni + normali + UV in un unico buffer ciascuno)
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, badgeGeo.positions, gl.STATIC_DRAW);

    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, badgeGeo.normals, gl.STATIC_DRAW);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, badgeGeo.uvs, gl.STATIC_DRAW);

    // Buffer corda
    const ropePosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ropePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ropeGeo.positions, gl.STATIC_DRAW);

    const ropeNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ropeNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ropeGeo.normals, gl.STATIC_DRAW);

    // Texture fronte
    const frontImage = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = reject;
        img.src = 'resources/textures/badge-front.png';
    });
    const texFront = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texFront);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frontImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Texture retro
    const rearImage = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = reject;
        img.src = 'resources/textures/badge-rear.png';
    });
    const texBack = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texBack);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, rearImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return {
        badgeProgramInfo, posBuffer, normalBuffer, uvBuffer,
        texFront, texBack,
        frontCount: badgeGeo.frontVertexCount,
        backCount:  badgeGeo.rearVertexCount,
        sideCount:  badgeGeo.sideVertexCount,
        ropeProgramInfo, ropePosBuffer, ropeNormalBuffer,
        ropeVertexCount: ropeGeo.vertexCount,
    };
}


function drawBadge(gl, badge, { viewProjectionMatrix, eye }) {

    // ── BADGE ──────────────────────────────────────────────────────
    gl.useProgram(badge.badgeProgramInfo.program);

    webglUtils.setAttributes(badge.badgeProgramInfo, {
        a_position: { buffer: badge.posBuffer,    numComponents: 3 },
        a_normal:   { buffer: badge.normalBuffer, numComponents: 3 },
        a_texcoord: { buffer: badge.uvBuffer,     numComponents: 2 },
    });

    const badgeModel = m4.translation(BADGE_X, BADGE_Y, BADGE_Z);
    const badgeMVP   = m4.multiply(viewProjectionMatrix, badgeModel);

    webglUtils.setUniforms(badge.badgeProgramInfo, {
        u_matrix:           badgeMVP,
        u_modelMatrix:      badgeModel,
        u_texFront:         badge.texFront,
        u_texBack:          badge.texBack,
        u_lightPositions:   Lights.getPositionsFlat(),
        u_lightIntensities: Lights.getIntensities(),
        u_viewPosition:     eye,
    });

    // Draw call 1: faccia frontale (mode 0 → u_texFront)
    webglUtils.setUniforms(badge.badgeProgramInfo, { u_mode: 0 });
    gl.drawArrays(gl.TRIANGLES, 0, badge.frontCount);

    // Draw call 2: faccia posteriore (mode 1 → u_texBack)
    webglUtils.setUniforms(badge.badgeProgramInfo, { u_mode: 1 });
    gl.drawArrays(gl.TRIANGLES, badge.frontCount, badge.backCount);

    // Draw call 3: bordi laterali (mode 2 → colore solido)
    webglUtils.setUniforms(badge.badgeProgramInfo, { u_mode: 2 });
    gl.drawArrays(gl.TRIANGLES, badge.frontCount + badge.backCount, badge.sideCount);


    // ── CORDA ──────────────────────────────────────────────────────
    gl.useProgram(badge.ropeProgramInfo.program);

    webglUtils.setAttributes(badge.ropeProgramInfo, {
        a_position: { buffer: badge.ropePosBuffer,    numComponents: 3 },
        a_normal:   { buffer: badge.ropeNormalBuffer, numComponents: 3 },
    });

    const ropeModel = m4.translation(BADGE_X, 0, BADGE_Z);
    const ropeMVP   = m4.multiply(viewProjectionMatrix, ropeModel);

    webglUtils.setUniforms(badge.ropeProgramInfo, {
        u_matrix:           ropeMVP,
        u_modelMatrix:      ropeModel,
        u_lightPositions:   Lights.getPositionsFlat(),
        u_lightIntensities: Lights.getIntensities(),
        u_viewPosition:     eye,
    });

    gl.drawArrays(gl.TRIANGLES, 0, badge.ropeVertexCount);
}


