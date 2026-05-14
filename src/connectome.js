function parseConnectomeCsv(text) {
    const synapses = [];
    const lines = text.split('\n');

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;

        const parts = line.split(',');
        const source = parts[0].trim();
        const target = parts[1].trim();
        const weight = parseInt(parts[2].trim());

        synapses.push({ source, target, weight });
    }
    
    return synapses;
}
