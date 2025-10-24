"use strict";
class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super(...arguments);
        this.initialized = false;
    }
    // parámetros accesibles desde el main thread (opcional)
    static get parameterDescriptors() {
        return [];
    }
    process(inputs, outputs, parameters) {
        // ⚡ enviar mensaje de arranque la primera vez que llegue audio
        if (!this.initialized) {
            this.port.postMessage({ event: 'worker-started' });
            this.initialized = true;
        }
        else {
            this.port.postMessage({ event: 'pre-worker-started' });
        }
        const input = inputs[0];
        if (!input || input.length === 0)
            return true;
        const channelData = input[0]; // canal 0
        let sum = 0;
        for (let i = 0; i < channelData.length; i++)
            sum += channelData[i] ** 2;
        const rms = Math.sqrt(sum / channelData.length);
        // enviar RMS al hilo principal
        this.port.postMessage({ rms });
        // seguimos procesando
        return true;
    }
}
registerProcessor('audio-processor', AudioProcessor);
