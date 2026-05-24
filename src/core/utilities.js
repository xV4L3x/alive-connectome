//Credit: https://webglfundamentals.org/webgl/lessons/webgl-load-obj.html
function parseOBJ(text, materials) {
    const positions = [];
    const normals = [];
    const texCoords = []; //load UV coordinates

    const outPositions = [];
    const outNormals = [];
    const outTexCoords = [];
    const outDiffuse = [];
    const outSpecular = [];
    const outShininess = [];

    function addVertex(vert) {
        const indices = vert.split('/');
        const posIdx = parseInt(indices[0]) - 1;
        outPositions.push(...positions[posIdx]);
        
        const mat = (materials && materials[currentMaterial]) ? materials[currentMaterial] : {};
        const color = mat.diffuse ?? [0.8, 0.8, 0.8, 1.0];
        const specular = mat.specular ?? [0.0, 0.0, 0.0];
        const shininess = mat.shininess ?? 1.0;
        outDiffuse.push(...color);
        outSpecular.push(...specular);
        outShininess.push(shininess);

        
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
        diffuse: new Float32Array(outDiffuse),
        specular: new Float32Array(outSpecular),
        shininess: new Float32Array(outShininess),
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
        } else if (parts[0] === 'Ka' && currentMaterial) {
            materials[currentMaterial].ambient = [
                parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])
            ];
        } else if (parts[0] === 'Kd' && currentMaterial) {
            materials[currentMaterial].diffuse = [
                parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]), 1.0
            ];
        } else if (parts[0] === 'Ks' && currentMaterial) {
            materials[currentMaterial].specular = [
                parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])
            ];
        } else if (parts[0] === 'Ns' && currentMaterial) {
            materials[currentMaterial].shininess = parseFloat(parts[1]);
        }
    }
    return materials;
}



function buildRay(mouseX, mouseY, canvas, inverseVP) {
    //convert to ndc coordinates [-1,1]
    const ndcX = (mouseX / canvas.clientWidth) * 2 - 1;
    const ndcY = -(mouseY / canvas.clientHeight) * 2 + 1; //invert Y the values of the canvas grow towards bottom

    //inverse transofrmation of world -> NDC. (UN)PROJECTION
    function unproject(z) {
        const v = [ndcX, ndcY, z, 1.0];
        const x = inverseVP[0]*v[0] + inverseVP[4]*v[1] + inverseVP[8] *v[2] + inverseVP[12]*v[3];
        const y = inverseVP[1]*v[0] + inverseVP[5]*v[1] + inverseVP[9] *v[2] + inverseVP[13]*v[3];
        const z2= inverseVP[2]*v[0] + inverseVP[6]*v[1] + inverseVP[10]*v[2] + inverseVP[14]*v[3];
        const w = inverseVP[3]*v[0] + inverseVP[7]*v[1] + inverseVP[11]*v[2] + inverseVP[15]*v[3];
        return [x/w, y/w, z2/w];
    }

    //borders of the ray
    const near = unproject(-1);
    const far  = unproject( 1);

    //calculate ray direction
    const dx = far[0]-near[0];
    const dy = far[1]-near[1];
    const dz = far[2]-near[2];
    //normalize
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    return { origin: near, dir: [dx/len, dy/len, dz/len] };
}

function raySphereIntersect(ray, center, radius) {
    //vector from shpere center to ray origin
    const ox = ray.origin[0] - center[0];
    const oy = ray.origin[1] - center[1];
    const oz = ray.origin[2] - center[2];
    const b = ox*ray.dir[0] + oy*ray.dir[1] + oz*ray.dir[2];
    const c = ox*ox + oy*oy + oz*oz - radius*radius;
    return (b*b - c) >= 0;
} 


