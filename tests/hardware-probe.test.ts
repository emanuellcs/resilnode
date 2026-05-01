import { describe, expect, it } from "vitest";
import {
  classifyDeviceTier,
  HIGH_TIER_STORAGE_BUFFER_BYTES,
  selectModelForTier,
} from "../lib/hardware-probe";
import {
  GEMMA_4_E2B_MODEL_ID,
  GEMMA_4_E4B_MODEL_ID,
} from "../lib/model-catalog";

describe("hardware tier and model routing", () => {
  it("assigns edge tier below the high-tier storage buffer threshold", () => {
    expect(classifyDeviceTier(HIGH_TIER_STORAGE_BUFFER_BYTES - 1)).toBe(
      "TIER_1_EDGE",
    );
  });

  it("assigns command tier at the high-tier storage buffer threshold", () => {
    expect(classifyDeviceTier(HIGH_TIER_STORAGE_BUFFER_BYTES)).toBe(
      "TIER_4_COMMAND",
    );
  });

  it("routes edge devices to the verified Gemma 4 E2B WebLLM artifact", () => {
    expect(selectModelForTier("TIER_1_EDGE")).toEqual({
      requestedModelId: GEMMA_4_E2B_MODEL_ID,
      modelId: GEMMA_4_E2B_MODEL_ID,
    });
  });

  it("records E4B as the command target but falls back to verified E2B", () => {
    const selection = selectModelForTier("TIER_4_COMMAND");

    expect(selection.requestedModelId).toBe(GEMMA_4_E4B_MODEL_ID);
    expect(selection.modelId).toBe(GEMMA_4_E2B_MODEL_ID);
    expect(selection.fallbackReason).toContain("no verified MLC/WebLLM");
  });
});
