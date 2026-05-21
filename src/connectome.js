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

const Connectome = ( () => {
    const THRESHOLD = 0.1; //reached this value a neuron "spikes" (activate)
    const DECAY = 0.9; //gradually decay neuron activation over transfer
    const WEIGHT_SCALE = 0.02; //normalize weights to meet spike requirements

    const INHIBITORY_NEURONS = new Set([
        'DD01','DD02','DD03','DD04','DD05','DD06',
        'VD01','VD02','VD03','VD04','VD05','VD06','VD07',
        'VD08','VD09','VD10','VD11','VD12','VD13'
    ]); //neurons that subtract power instead of increasing it. TODO: da controllare che non sembrano tutti

    let sharedAdjacencyMap = {};
    let sharedNeuronNames  = [];

    function init(csvText) {
        const synapses = parseConnectomeCsv(csvText);
        const adjacencyMap = {};
        const neuronNames = new Set(); //avoid duplicates

        for(const s of synapses) {
            neuronNames.add(s.source);
            neuronNames.add(s.target);

            if (!adjacencyMap[s.source]) adjacencyMap[s.source] = [];
            const sign = INHIBITORY_NEURONS.has(s.source) ? -1 : 1;
            adjacencyMap[s.source].push({ target: s.target, weight: sign * s.weight });
        }

        sharedAdjacencyMap = adjacencyMap;
        sharedNeuronNames  = Array.from(neuronNames); // Set → Array

        console.log("Connectome initialized. Neurons:", Object.keys(neuronNames).length);
    }

    function createInstance() {
        const neurons = {}

        for (const name of sharedNeuronNames) {
            neurons[name] = { activation: 0, spiked: false }; //init all neurons to powered off
        }

        let stimuli = { light: 0, hunger: 0 };

        function step(deltaTime) {
            for (const name in neurons) neurons[name].spiked = false;

            const forwardNeurons = ['AVBL','AVBR','PVCL','PVCR'];
            const backwardNeurons = ['AVAL','AVAR','AVDL','AVDR'];
            const foodNeurons = ['AWAL','AWAR','ADFL','ADFR'];

            for (const n of forwardNeurons)  if (neurons[n]) neurons[n].activation = 0.5;
            for (const n of backwardNeurons) if (neurons[n]) neurons[n].activation = 0.0;

            if (stimuli.light > 0.01) {
                for (const n of backwardNeurons)
                    if (neurons[n]) neurons[n].activation += stimuli.light * 1.5;
            }

            for (const n of foodNeurons) if (neurons[n]) neurons[n].activation = stimuli.hunger;


            const input = {};
            for (const name in neurons) input[name] = 0;

            for (const name in neurons) {
                const neuron = neurons[name];
                if (neuron.activation <= THRESHOLD) continue;
                neuron.spiked = true;
                const conns = sharedAdjacencyMap[name];
                if (!conns) continue;
                for (const conn of conns) {
                    if (neurons[conn.target] !== undefined)
                        input[conn.target] += neuron.activation * conn.weight * WEIGHT_SCALE;
                }
            }

            const TAU = 0.1;
            const stimulusNeurons = new Set([...forwardNeurons, ...backwardNeurons, ...foodNeurons]);
            for (const name in neurons) {
                if (stimulusNeurons.has(name)) continue;
                neurons[name].activation += (deltaTime / TAU) * (-neurons[name].activation + input[name]);
            }

            for (const name in neurons) {
                const a = neurons[name].activation;
                neurons[name].activation = a < 0 ? 0 : a > 1 ? 1 : a;
            }
        }

        function updateStimuli(state) {
            stimuli = state;
        }

        function getWaveParams() {
            const avg = (names) => {
                let sum = 0;
                let count = 0;
                for (const name of names) {
                    if (neurons[name]) {
                        sum += neurons[name].activation;
                        count++;
                    }
                }
                return count > 0 ? sum / count : 0;
            }

            const forwardDrive  = avg(['AVBL','AVBR','PVCL','PVCR']);
            const backwardDrive = avg(['AVAL','AVAR','AVDL','AVDR','AVEL','AVER']);
            const motorActivity = avg([
                'DB01','DB02','DB03','DB04','DB05','DB06','DB07',
                'VB01','VB02','VB03','VB04','VB05','VB06','VB07','VB08','VB09','VB10','VB11',
                'DA01','DA02','DA03','DA04','DA05','DA06','DA07','DA08','DA09',
                'VA01','VA02','VA03','VA04','VA05','VA06','VA07','VA08','VA09','VA10','VA11','VA12'
            ]); 

            const direction = forwardDrive >= backwardDrive ? 1 : -1;
            const amplitude = motorActivity;
            const freqTime = direction * (0.5 + motorActivity * 2);

            return {direction, amplitude, freqTime};
        }

        function activateNeurons(names) {
            for (const name of names) {
                if (neurons[name]) neurons[name].activation = 1.0;
            }
        }


        function getNeuronActivity(name) {
            return neurons[name] ? neurons[name].activation : 0;
        }

        return { step, updateStimuli, getWaveParams, activateNeurons, getNeuronActivity }
    }

    return { init, createInstance };
})();
