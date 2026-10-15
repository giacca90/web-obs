let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;

interface LayerMetadata {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  filter: string;
  visible: boolean;
}

interface Source {
  type: 'track' | 'bitmap' | 'frame'; // <-- Añadido 'frame' para Firefox
  data: any;
  latestFrame?: VideoFrame | ImageBitmap;
  reader?: ReadableStreamDefaultReader<VideoFrame>;
}

const sources = new Map<string, Source>();
let layersOrder: string[] = [];
let layersMetadata = new Map<string, LayerMetadata>();
let isLooping = false;

let targetFPS = 30;

function renderLoop() {
  if (!ctx || !canvas) {
    isLooping = false;
    return;
  }

  // Limpiar canvas con fondo blanco
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const id of layersOrder) {
    const meta = layersMetadata.get(id);
    if (!meta?.visible) continue;

    const source = sources.get(id);
    if (!source) continue;

    let frame = null;
    if (source.type === 'track') {
      frame = source.latestFrame;
    } else if (source.type === 'frame') {
      // Para Firefox: el frame viene directamente en data o latestFrame
      frame = source.data;
    } else {
      frame = source.data;
    }

    if (frame) {
      const filter = meta.filter || 'none';
      if (ctx.filter !== filter) {
        ctx.filter = filter;
      }
      try {
        ctx.drawImage(frame, meta.x, meta.y, meta.width, meta.height);
      } catch (e) {
        // Por seguridad si un frame se cierra o expira a mitad de ciclo
      }
    }
  }

  setTimeout(() => {
    requestAnimationFrame(renderLoop);
  }, 1000 / targetFPS);
}

async function processStream(id: string, readable: ReadableStream<VideoFrame>) {
  try {
    const reader = readable.getReader();
    const source = sources.get(id);
    if (source) source.reader = reader;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const currentSource = sources.get(id);
      if (currentSource?.data !== readable) {
        value.close();
        break;
      }

      if (currentSource.latestFrame) {
        currentSource.latestFrame.close();
      }
      currentSource.latestFrame = value;
    }
  } catch (e) {
    console.error(`Error processing stream for ${id}:`, e);
  }
}

globalThis.self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'init':
      canvas = payload.canvas;
      if (payload.fps) targetFPS = payload.fps;
      ctx = canvas!.getContext('2d', { alpha: false, desynchronized: true })!;
      if (!isLooping) {
        isLooping = true;
        renderLoop();
      }
      break;

    case 'addTrack':
      if (sources.has(payload.id)) {
        cleanupSource(payload.id);
      }
      sources.set(payload.id, { type: 'track', data: payload.readable });
      processStream(payload.id, payload.readable);
      break;

    // --- NUEVO CASO PARA FIREFOX (Recibir VideoFrame unitario) ---
    case 'addFrame': {
      const { id, frame } = payload;
      const existing = sources.get(id);

      if (existing) {
        // Si ya era de tipo frame, cerramos el frame anterior para liberar memoria de GPU
        if (existing.type === 'frame' && existing.data?.close) {
          existing.data.close();
        } else {
          cleanupSource(id);
        }
      }

      sources.set(id, { type: 'frame', data: frame });
      break;
    }

    case 'addBitmap': {
      const { id, bitmap } = payload;
      if (sources.has(id)) cleanupSource(id);
      sources.set(id, { type: 'bitmap', data: bitmap });
      break;
    }

    case 'updateLayers':
      layersOrder = payload.layers.map((l: any) => l.id);
      layersMetadata.clear();
      for (const l of payload.layers) {
        layersMetadata.set(l.id, l);
      }
      break;

    case 'removeSource': {
      cleanupSource(payload.id);
      sources.delete(payload.id);
      layersMetadata.delete(payload.id);
      layersOrder = layersOrder.filter((lid) => lid !== payload.id);
      break;
    }

    case 'resize':
      if (canvas) {
        canvas.width = payload.width;
        canvas.height = payload.height;
      }
      break;
  }
};

// Función auxiliar para limpiar recursos y evitar fugas de memoria
function cleanupSource(id: string) {
  const source = sources.get(id);
  if (!source) return;

  if (source.type === 'bitmap' && source.data?.close) {
    source.data.close();
  }
  if (source.type === 'frame' && source.data?.close) {
    source.data.close();
  }
  if (source.latestFrame?.close) {
    source.latestFrame.close();
  }
  if (source.reader) {
    source.reader.cancel();
  }
}
