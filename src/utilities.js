//Credit: https://webglfundamentals.org/webgl/lessons/webgl-load-obj.html
function parseOBJ(text, materials) {
    const positions = [];
    const normals = [];
    const texCoords = []; //load UV coordinates

    const outPositions = [];
    const outNormals = [];
    const outTexCoords = [];
    const outColors = [];

    function addVertex(vert) {
        const indices = vert.split('/');
        const posIdx = parseInt(indices[0]) - 1;
        outPositions.push(...positions[posIdx]);
        

        const color = (materials && materials[currentMaterial])
            ? materials[currentMaterial].diffuse
            : [0.8, 0.8, 0.8, 1.0];
        outColors.push(...color);

        
        if (indices[2]) {
            const normIdx = parseInt(indices[2]) - 1;
            outNormals.push(...normals[normIdx]);
        }

        if (indices[1]) {
            const uvIdx = parseInt(indices[1]) - 1;
            outTexCoords.push(...texCoords[uvIdx]);
        }     
    }

    let currentMaterial = null;

    const keywords = {
        v(parts)  { positions.push(parts.map(parseFloat)); },
        vn(parts) { normals.push(parts.map(parseFloat)); },
        vt(parts) { texCoords.push(parts.map(parseFloat)); },
        usemtl(parts) { currentMaterial = parts[0]; },
        f(parts)  {
        for (let i = 1; i < parts.length - 1; i++) {
            addVertex(parts[0]);
            addVertex(parts[i]);
            addVertex(parts[i + 1]);
        }
        },
    };

    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
        const line = lines[lineNo].trim();
        if (line === '' || line.startsWith('#')) continue;
        const m = keywordRE.exec(line);
        if (!m) continue;
        const [, keyword, unparsedArgs] = m;
        const parts = line.split(/\s+/).slice(1);
        const handler = keywords[keyword];
        if (!handler) continue;
        handler(parts, unparsedArgs);
    }

    return {
        positions: new Float32Array(outPositions),
        normals:   new Float32Array(outNormals),
        texCoords: new Float32Array(outTexCoords),
        colors: new Float32Array(outColors),
        vertexCount: outPositions.length / 3,
    };
}

function parseMTL(text) {
    const materials = {};
    let currentMaterial = null;

    for (const line of text.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'newmtl') {
            currentMaterial = parts[1];
            materials[currentMaterial] = {};
        } else if (parts[0] === 'Kd' && currentMaterial) {
            materials[currentMaterial].diffuse = [
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3]),
                1.0
            ];
        }
    }
    return materials;
}

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

