//Credit: https://webglfundamentals.org/webgl/lessons/webgl-load-obj.html
function parseOBJ(text) {
    const positions = [];
    const normals = [];

    const outPositions = [];
    const outNormals = [];

    function addVertex(vert) {
        const indices = vert.split('/');
        const posIdx = parseInt(indices[0]) - 1;
        outPositions.push(...positions[posIdx]);
        if (indices[2]) {
        const normIdx = parseInt(indices[2]) - 1;
        outNormals.push(...normals[normIdx]);
        }
    }

    const keywords = {
        v(parts)  { positions.push(parts.map(parseFloat)); },
        vn(parts) { normals.push(parts.map(parseFloat)); },
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
        vertexCount: outPositions.length / 3,
    };
}
