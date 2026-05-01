import { pipeline, env } from "@huggingface/transformers";

// Configure environment for browser-based WASM execution
env.allowLocalModels = false;
env.useBrowserCache = true;

type VisionPipeline = (input: Blob) => Promise<unknown>;

let visionPipeline: VisionPipeline | null = null;
let initPromise: Promise<void> | null = null;

interface WorkerRequest {
  type: "INIT" | "PROCESS_IMAGE";
  payload?: Blob;
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
 * Initialize the vision model.
 * We use a lightweight, edge-optimized model for rapid response.
 */
async function initPipeline(): Promise<void> {
  if (visionPipeline) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      visionPipeline = (await pipeline(
        "object-detection",
        "Xenova/detr-resnet-50",
        {
          device: "wasm",
        },
      )) as unknown as VisionPipeline;

      self.postMessage({
        type: "STATUS",
        message: "Vision Engine Online (DETR-ResNet-50)",
      });
    } catch (error) {
      visionPipeline = null;
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
      await initPipeline();
    } catch (error) {
      postError(
        `Vision Init Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        requestId,
      );
    }
    return;
  }

  if (type === "PROCESS_IMAGE") {
    if (!payload) {
      postError("Vision Processing Error: missing image payload.", requestId);
      return;
    }

    try {
      await initPipeline();
      if (!visionPipeline) throw new Error("Vision pipeline unavailable.");
      const result = await visionPipeline(payload);
      self.postMessage({ type: "RESULT", payload: result, requestId });
    } catch (error) {
      postError(
        `Vision Processing Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        requestId,
      );
    }
    return;
  }

  postError(`Unknown Vision Worker message: ${type}`, requestId);
};
