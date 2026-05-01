import { GEMMA_4_E2B_MODEL_ID, GEMMA_4_E4B_MODEL_ID } from "./model-catalog";

export type DeviceTier = "TIER_1_EDGE" | "TIER_4_COMMAND";

export interface HardwareProbeResult {
  tier: DeviceTier;
  adapterInfo: GPUAdapterInfo | null;
  maxBufferSize: number;
  maxStorageBufferBindingSize: number;
  gpuSupported: boolean;
  error?: string;
}

export interface ModelSelection {
  requestedModelId: string;
  modelId: string;
  fallbackReason?: string;
}

interface GPUAdapterWithInfo extends GPUAdapter {
  requestAdapterInfo?: () => Promise<GPUAdapterInfo>;
}

export const HIGH_TIER_STORAGE_BUFFER_BYTES = 1024 * 1024 * 1024;

export function classifyDeviceTier(
  maxStorageBufferBindingSize: number,
): DeviceTier {
  return maxStorageBufferBindingSize >= HIGH_TIER_STORAGE_BUFFER_BYTES
    ? "TIER_4_COMMAND"
    : "TIER_1_EDGE";
}

export function selectModelForTier(tier: DeviceTier): ModelSelection {
  if (tier === "TIER_4_COMMAND") {
    return {
      requestedModelId: GEMMA_4_E4B_MODEL_ID,
      modelId: GEMMA_4_E2B_MODEL_ID,
      fallbackReason:
        "Gemma 4 E4B is the high-tier target, but no verified MLC/WebLLM artifact is available. Falling back to validated Gemma 4 E2B.",
    };
  }

  return {
    requestedModelId: GEMMA_4_E2B_MODEL_ID,
    modelId: GEMMA_4_E2B_MODEL_ID,
  };
}

/**
 * Probes the host device for WebGPU capabilities and requests massive buffer limits.
 * Deterministically classifies hardware for Gemma 4 deployment.
 */
export async function probeHardware(): Promise<HardwareProbeResult> {
  if (!navigator.gpu) {
    return {
      tier: "TIER_1_EDGE",
      adapterInfo: null,
      maxBufferSize: 0,
      maxStorageBufferBindingSize: 0,
      gpuSupported: false,
      error: "WebGPU not supported in this environment.",
    };
  }

  try {
    const adapter =
      (await navigator.gpu.requestAdapter()) as GPUAdapterWithInfo | null;
    if (!adapter) {
      throw new Error("No appropriate GPU adapter found.");
    }

    // Attempt to request maximal buffer limits to bypass browser defaults
    const requiredLimits: Record<string, number> = {};

    // Attempting to push limits for high-tier hardware
    // Standard limits are 256MB/128MB. We probe for what the hardware CAN do.
    const limitsToProbe: (keyof GPUSupportedLimits)[] = [
      "maxBufferSize",
      "maxStorageBufferBindingSize",
      "maxComputeWorkgroupStorageSize",
    ];

    for (const limit of limitsToProbe) {
      const val = adapter.limits[limit];
      if (val !== undefined) {
        requiredLimits[limit] = val as number;
      }
    }

    const device = await adapter.requestDevice({
      requiredLimits,
    });

    const info = adapter.info || (await adapter.requestAdapterInfo?.()) || null;

    const maxBufferSize = device.limits.maxBufferSize;
    const maxStorageBufferBindingSize =
      device.limits.maxStorageBufferBindingSize;

    return {
      tier: classifyDeviceTier(maxStorageBufferBindingSize),
      adapterInfo: info,
      maxBufferSize,
      maxStorageBufferBindingSize,
      gpuSupported: true,
    };
  } catch (error) {
    return {
      tier: "TIER_1_EDGE",
      adapterInfo: null,
      maxBufferSize: 0,
      maxStorageBufferBindingSize: 0,
      gpuSupported: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown hardware probing error.",
    };
  }
}
