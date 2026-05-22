// Declaraciones necesarias para que TypeScript compile sin errores
declare const registerProcessor: (name: string, processorCtor: any) => void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: any);
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}

class AudioProcessor extends AudioWorkletProcessor {
  private initialized = false;
  private lastUpdate = 0;

  // parámetros accesibles desde el main thread (opcional)
  static get parameterDescriptors() {
    return [];
  }

  override process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    // ⚡ enviar mensaje de arranque la primera vez que llegue audio
    if (!this.initialized) {
      this.port.postMessage({ event: 'worker-started' });
      this.initialized = true;
    }

    const input = inputs[0];
    if (!input || input.length === 0) {
      // No hay datos de audio, indicar que no seguimos procesando
      return false;
    }

    const channelData = input[0]; // canal 0
    let sum = 0;
    for (const sample of channelData) {
      sum += sample ** 2;
    }
    const rms = Math.sqrt(sum / channelData.length);

    const now = Date.now();
    if (now - this.lastUpdate > 30) {
      // Solo 30 veces por segundo
      this.port.postMessage({ rms });
      this.lastUpdate = now;
    }

    // seguimos procesando mientras haya datos
    return channelData.length > 0;
  }
}

registerProcessor('audio-processor', AudioProcessor);
