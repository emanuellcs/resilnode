import { pipeline, env } from "@huggingface/transformers";

// Configuration for browser-native execution
env.allowLocalModels = false;
env.useBrowserCache = true;

type FeatureExtractor = (
  input: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }>;

let extractor: FeatureExtractor | null = null;
let initPromise: Promise<void> | null = null;

interface WorkerRequest {
  type: "INIT" | "GENERATE_EMBEDDING";
  payload?: string;
  requestId?: string;
}

function postError(message: string, requestId?: string) {
  self.postMessage({
    type: "ERROR",
    message,
    requestId,
  });
}

/**
 * Initialize the embedding model.
 */
async function init(): Promise<void> {
  if (extractor) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      extractor = (await pipeline(
        "feature-extraction",
        "Xenova/all-MiniLM-L6-v2",
        {
          device: "wasm",
        },
      )) as unknown as FeatureExtractor;
      self.postMessage({
        type: "STATUS",
        message: "Embedding Engine Online (MiniLM-L6-v2)",
      });
    } catch (error) {
      extractor = null;
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

self.onmessage = async (event) => {
  const { type, payload, requestId } = event.data as WorkerRequest;

  if (type === "INIT") {
    try {
      await init();
    } catch (error) {
      postError(
        `Embedding Init Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        requestId,
      );
    }
    return;
  }

  if (type === "GENERATE_EMBEDDING") {
    if (!payload) {
      postError("Embedding Generation Error: missing text payload.", requestId);
      return;
    }

    try {
      await init();
      if (!extractor) throw new Error("Embedding pipeline unavailable.");
      const result = await extractor(payload, {
        pooling: "mean",
        normalize: true,
      });
      self.postMessage({
        type: "RESULT",
        payload: Array.from(result.data),
        text: payload,
        requestId,
      });
    } catch (error) {
      postError(
        `Embedding Generation Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        requestId,
      );
    }
    return;
  }

  postError(`Unknown Embedding Worker message: ${type}`, requestId);
};
