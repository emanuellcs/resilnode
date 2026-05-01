import type { AppConfig, ModelRecord } from "@mlc-ai/web-llm";

const GEMMA_4_E2B_REPO =
  "https://huggingface.co/welcoma/gemma-4-E2B-it-q4f16_1-MLC";

export const GEMMA_4_E2B_MODEL_ID = "gemma-4-E2B-it-q4f16_1-MLC";
export const GEMMA_4_E4B_MODEL_ID = "gemma-4-E4B-it";

export const gemma4E2BModelRecord: ModelRecord = {
  model: GEMMA_4_E2B_REPO,
  model_id: GEMMA_4_E2B_MODEL_ID,
  model_lib: `${GEMMA_4_E2B_REPO}/resolve/main/libs/gemma-4-E2B-it-q4f16_1-MLC-webgpu.wasm`,
  required_features: ["shader-f16"],
  low_resource_required: true,
  vram_required_MB: 3072,
};

export const webLLMAppConfig: AppConfig = {
  model_list: [gemma4E2BModelRecord],
};
