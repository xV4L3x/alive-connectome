'use strict';

const cabinetVertexShaderSource = `
    attribute vec3 a_position;
    attribute vec3 a_normal;

    uniform mat4 u_matrix;
    uniform mat4 u_modelMatrix;

    varying vec3 v_normal;
    varying vec3 v_worldPos;

    void main() {
        gl_Position = u_matrix * vec4(a_position, 1.0);
        v_normal   = mat3(u_modelMatrix) * a_normal;
        v_worldPos = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
    }
`;

const cabinetFragmentShaderSource = `
    precision mediump float;

    varying vec3 v_normal;
    varying vec3 v_worldPos;

    uniform vec3 u_lightPositions[4];
    uniform float u_lightIntensities[4];
    uniform vec3 u_viewPosition;

    void main() {
        vec3 steelColor = vec3(0.6, 0.65, 0.7);  // grigio freddo metallico

        vec3 normal  = normalize(v_normal);
        vec3 viewDir = normalize(u_viewPosition  - v_worldPos);

        //ambient
        float ambientStrength = 0.4;
        vec3 ambient = ambientStrength * steelColor;

        float specularStrength = 0.8;

        for (int i = 0; i < 4; i++) {
            vec3 lightDir = normalize(u_lightPositions[i] - v_worldPos);

            //diffuse
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * steelColor * u_lightIntensities[i]; 
            
            //specular
            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
            vec3 specular = specularStrength * spec * vec3(1.0) * u_lightIntensities[i];
        
            ambient += diffuse + specular;
        }

        gl_FragColor = vec4(ambient, 1.0);
    }
`;

const CABINET_WIDTH = PLANE_EXTENSION + 4; // a bit larger than the tank
const CABINET_DEPTH = PLANE_EXTENSION + 4; // a bit deeper than the tank
const CABINET_HEIGHT = 10; // from 0 to h

const cabinetCorners = {
    // top (Y = 0)
    A: [-CABINET_WIDTH, 0, CABINET_DEPTH],
    B: [ CABINET_WIDTH, 0, CABINET_DEPTH],
    C: [ CABINET_WIDTH, 0, -CABINET_DEPTH],
    D: [-CABINET_WIDTH, 0, -CABINET_DEPTH],
    // bottom (Y = -CABINET_HEIGHT)
    E: [-CABINET_WIDTH, -CABINET_HEIGHT, CABINET_DEPTH],
    F: [ CABINET_WIDTH, -CABINET_HEIGHT, CABINET_DEPTH],
    G: [ CABINET_WIDTH, -CABINET_HEIGHT, -CABINET_DEPTH],
    H: [-CABINET_WIDTH, -CABINET_HEIGHT, -CABINET_DEPTH],
};

const cabinetTriangles = {
    // Faccia frontale (Z = +D)
    AEF: cabinetCorners.A.concat(cabinetCorners.E, cabinetCorners.F),
    AFB: cabinetCorners.A.concat(cabinetCorners.F, cabinetCorners.B),
    // Faccia posteriore (Z = -D)
    CHG: cabinetCorners.C.concat(cabinetCorners.H, cabinetCorners.G),
    DCH: cabinetCorners.D.concat(cabinetCorners.C, cabinetCorners.H),
    // Faccia sinistra (X = -W)
    DAE: cabinetCorners.D.concat(cabinetCorners.A, cabinetCorners.E),
    DEH: cabinetCorners.D.concat(cabinetCorners.E, cabinetCorners.H),
    // Faccia destra (X = +W)
    BCG: cabinetCorners.B.concat(cabinetCorners.C, cabinetCorners.G),
    BGF: cabinetCorners.B.concat(cabinetCorners.G, cabinetCorners.F),
    // Faccia top (Y = 0)
    DAB: cabinetCorners.D.concat(cabinetCorners.A, cabinetCorners.B),
    DCB: cabinetCorners.D.concat(cabinetCorners.C, cabinetCorners.B),
    // Faccia bottom (Y = -H)
    EFG: cabinetCorners.E.concat(cabinetCorners.F, cabinetCorners.G),
    EGH: cabinetCorners.E.concat(cabinetCorners.G, cabinetCorners.H),
}

const cabinetFaces = {
    front: cabinetTriangles.AEF.concat(cabinetTriangles.AFB),
    rear: cabinetTriangles.CHG.concat(cabinetTriangles.DCH),
    left: cabinetTriangles.DAE.concat(cabinetTriangles.DEH),
    right: cabinetTriangles.BCG.concat(cabinetTriangles.BGF),
    top: cabinetTriangles.DAB.concat(cabinetTriangles.DCB),
    bottom: cabinetTriangles.EFG.concat(cabinetTriangles.EGH),
}

const cabinetPositions = new Float32Array(
    cabinetFaces.front.concat(cabinetFaces.rear, cabinetFaces.left, cabinetFaces.right, cabinetFaces.top, cabinetFaces.bottom)
);

const cabinetNormals = new Float32Array([
    // Front  (0, 0, 1)
    0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
    // Rear   (0, 0, -1)
    0, 0,-1,   0, 0,-1,   0, 0,-1,   0, 0,-1,   0, 0,-1,   0, 0,-1,
    // Left   (-1, 0, 0)
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
    // Right  (1, 0, 0)
    1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,
    // Top    (0, 1, 0)
    0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
    // Bottom (0, -1, 0)
    0,-1, 0,   0,-1, 0,   0,-1, 0,   0,-1, 0,   0,-1, 0,   0,-1, 0,
]);


function initCabinet(gl) {
    const program = createShaderProgram(gl, cabinetVertexShaderSource, cabinetFragmentShaderSource);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cabinetPositions, gl.STATIC_DRAW);

    const normalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, cabinetNormals, gl.STATIC_DRAW);

    return {
        program,
        positionBuffer,
        normalBuffer,
        vertexCount: cabinetPositions.length / 3,
        locations: {
            matrix: gl.getUniformLocation(program, 'u_matrix'),
            modelMatrix: gl.getUniformLocation(program, 'u_modelMatrix'),
            lightPositions: gl.getUniformLocation(program, 'u_lightPositions'),
            lightIntensities: gl.getUniformLocation(program, 'u_lightIntensities'),
            viewPosition: gl.getUniformLocation(program, 'u_viewPosition'),
            position: gl.getAttribLocation(program, 'a_position'),
            normal: gl.getAttribLocation(program, 'a_normal'),
        }
    };
}


function drawCabinet(gl, cabinet, { viewProjectionMatrix, eye }) {
    gl.useProgram(cabinet.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, cabinet.positionBuffer);
    gl.enableVertexAttribArray(cabinet.locations.position);
    gl.vertexAttribPointer(cabinet.locations.position, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cabinet.normalBuffer);
    gl.enableVertexAttribArray(cabinet.locations.normal);
    gl.vertexAttribPointer(cabinet.locations.normal, 3, gl.FLOAT, false, 0, 0);

    const cabinetModelMatrix = m4.translation(0, -0.01, 0);
    const cabinetMvpMatrix = m4.multiply(viewProjectionMatrix, cabinetModelMatrix);

    gl.uniformMatrix4fv(cabinet.locations.matrix, false, cabinetMvpMatrix);
    gl.uniformMatrix4fv(cabinet.locations.modelMatrix, false, cabinetModelMatrix);
    gl.uniform3fv(cabinet.locations.lightPositions, Lights.getPositionsFlat());
    gl.uniform1fv(cabinet.locations.lightIntensities, Lights.getIntensities());
    gl.uniform3fv(cabinet.locations.viewPosition,  eye);

    gl.drawArrays(gl.TRIANGLES, 0, cabinet.vertexCount);
}





