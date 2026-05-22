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
  type: 'track' | 'bitmap';
  data: any; // MediaStreamTrack or ImageBitmap
  latestFrame?: VideoFrame | ImageBitmap;
  reader?: ReadableStreamDefaultReader<VideoFrame>;
}

const sources = new Map<string, Source>();
let layersOrder: string[] = [];
let layersMetadata = new Map<string, LayerMetadata>();
let isLooping = false;

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
    } else {
      frame = source.data;
    }

    if (frame) {
      const filter = meta.filter || 'none';
      if (ctx.filter !== filter) {
        ctx.filter = filter;
      }
      ctx.drawImage(frame, meta.x, meta.y, meta.width, meta.height);
    }
  }

  requestAnimationFrame(renderLoop);
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
      ctx = canvas!.getContext('2d', { alpha: false, desynchronized: true })!;
      if (!isLooping) {
        isLooping = true;
        renderLoop();
      }
      break;

    case 'addTrack':
      // payload: { id, readable }
      if (sources.has(payload.id)) {
        const old = sources.get(payload.id);
        if (old?.reader) old.reader.cancel();
      }
      sources.set(payload.id, { type: 'track', data: payload.readable });
      processStream(payload.id, payload.readable);
      break;

    case 'addBitmap': {
      const { id, bitmap } = payload;
      const existing = sources.get(id);
      if (existing) {
        if (existing.type === 'bitmap') existing.data.close();
        if (existing.latestFrame) existing.latestFrame.close();
        if (existing.reader) existing.reader.cancel();
      }
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
      const id = payload.id;
      const source = sources.get(id);
      if (source) {
        if (source.type === 'bitmap') source.data.close();
        if (source.latestFrame) source.latestFrame.close();
        if (source.reader) source.reader.cancel();
        sources.delete(id);
      }
      layersMetadata.delete(id);
      layersOrder = layersOrder.filter((lid) => lid !== id);
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
