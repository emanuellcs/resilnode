import {
  CreateServiceWorkerMLCEngine,
  InitProgressReport,
  MLCEngineInterface,
} from "@mlc-ai/web-llm";
import { DeviceTier, selectModelForTier } from "./hardware-probe";
import { webLLMAppConfig } from "./model-catalog";

export interface LLMInitialization {
  engine: MLCEngineInterface;
  modelId: string;
  requestedModelId: string;
  fallbackReason?: string;
}

/**
 * Initializes the WebLLM engine within a Service Worker.
 * Targets specific Gemma 4 variants based on the hardware tier.
 */
export async function initializeLLM(
  tier: DeviceTier,
  progressCallback: (report: InitProgressReport) => void,
): Promise<LLMInitialization> {
  const selection = selectModelForTier(tier);

  const engine = await CreateServiceWorkerMLCEngine(
    selection.modelId,
    {
      appConfig: webLLMAppConfig,
      initProgressCallback: progressCallback,
    },
    undefined,
    5000,
  );

  return {
    engine,
    modelId: selection.modelId,
    requestedModelId: selection.requestedModelId,
    fallbackReason: selection.fallbackReason,
  };
}
