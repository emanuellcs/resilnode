import {
  pipeline,
  env,
  type ObjectDetectionPipeline,
  type ImageClassificationPipeline,
} from "@huggingface/transformers";

// Configure environment for browser-based WASM execution
env.allowLocalModels = false;
env.useBrowserCache = true;

let visionPipeline:
  | ObjectDetectionPipeline
  | ImageClassificationPipeline
  | null = null;

/**
 * Initialize the vision model.
 * We use a lightweight, edge-optimized model for rapid response.
 */
async function initPipeline() {
  if (visionPipeline) return;

  try {
    // Attempting to use a very fast mobile-optimized model
    // MobileNetV4 or a small DETR variant is ideal for real-time edge use
    visionPipeline = await pipeline(
      "object-detection",
      "Xenova/detr-resnet-50",
      {
        device: "wasm", // Fallback to WASM for maximum compatibility, WebGPU is available in some runtimes
      },
    );

    self.postMessage({
      type: "STATUS",
      message: "Vision Engine Online (DETR-ResNet-50)",
    });
  } catch (error) {
    self.postMessage({
      type: "ERROR",
      message: `Vision Init Failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });
  }
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === "INIT") {
    await initPipeline();
    return;
  }

  if (type === "PROCESS_IMAGE" && visionPipeline) {
    try {
      // payload is an ImageBitmap or Blob
      const result = await (visionPipeline as any)(payload);
      self.postMessage({ type: "RESULT", payload: result });
    } catch (error) {
      self.postMessage({
        type: "ERROR",
        message: `Vision Processing Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }
};
