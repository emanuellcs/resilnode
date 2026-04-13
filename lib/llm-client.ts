import {
  CreateServiceWorkerMLCEngine,
  InitProgressReport,
  MLCEngineInterface,
} from "@mlc-ai/web-llm";
import { DeviceTier } from "./hardware-probe";

/**
 * Initializes the WebLLM engine within a Service Worker.
 * Targets specific Gemma 4 variants based on the hardware tier.
 */
export async function initializeLLM(
  tier: DeviceTier,
  progressCallback: (report: InitProgressReport) => void,
): Promise<MLCEngineInterface> {
  const modelId =
    tier === "TIER_4_COMMAND"
      ? "gemma-4-26b-moe-q4f16_1-MLC"
      : "gemma-4-e2b-q4f16_1-MLC";

  // Note: These model IDs are conceptual for the hackathon context.
  // We assume the service worker is already registered and controlling the page.
  const engine = await CreateServiceWorkerMLCEngine(modelId, {
    initProgressCallback: progressCallback,
  });

  return engine;
}
