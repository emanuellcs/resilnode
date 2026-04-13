import { pipeline, env } from '@huggingface/transformers';

// Configuration for browser-native execution
env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor: any = null;

/**
 * Initialize the embedding model.
 */
async function init() {
  if (extractor) return;
  try {
    // Xenova/all-MiniLM-L6-v2 is standard, lightweight, and fast for edge embeddings.
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'wasm',
    });
    self.postMessage({ type: 'STATUS', message: 'Embedding Engine Online (MiniLM-L6-v2)' });
  } catch (error) {
    self.postMessage({ type: 'ERROR', message: `Embedding Init Failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'INIT') {
    await init();
    return;
  }

  if (type === 'GENERATE_EMBEDDING' && extractor) {
    try {
      // payload is the text string
      const result = await extractor(payload, { pooling: 'mean', normalize: true });
      // result.data is the Float32Array embedding
      self.postMessage({ type: 'RESULT', payload: Array.from(result.data), text: payload });
    } catch (error) {
      self.postMessage({ type: 'ERROR', message: `Embedding Generation Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  }
};
