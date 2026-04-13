import { multimodalRouter, VisionDetection } from './multimodal-router';
import { WebRTCMesh } from './webrtc-mesh';
import { ragRouter } from './rag-router';
import { DeviceTier } from './hardware-probe';
import { syncQueue } from './sync-queue';

export interface TriageResult {
  response: string;
  detections: VisionDetection[];
  escalated: boolean;
}

/**
 * Master Controller: Synthesizes Vision, LLM, RAG, and Mesh into a single triage operation.
 */
export class TriageOrchestrator {
  private tier: DeviceTier = 'TIER_1_EDGE';
  private visionWorker: Worker | null = null;
  private mesh: WebRTCMesh | null = null;

  setTier(tier: DeviceTier) {
    this.tier = tier;
  }

  setVisionWorker(worker: Worker) {
    this.visionWorker = worker;
  }

  setMesh(mesh: WebRTCMesh) {
    this.mesh = mesh;
  }

  /**
   * Main entry point for disaster triage.
   */
  async executeTriage(
    imageBlob: Blob | null,
    audioTranscript: string,
    onStream: (chunk: string) => void
  ): Promise<TriageResult> {
    let detections: VisionDetection[] = [];
    let escalated = false;

    // 1. Process Vision if frame exists
    if (imageBlob && this.visionWorker) {
      detections = await this.getVisionDetections(imageBlob);
    }

    // 2. Logic: Should we escalate?
    // If we are EDGE tier and have complex query or low vision confidence, escalate.
    const isComplex = audioTranscript.toLowerCase().includes('structural') || audioTranscript.toLowerCase().includes('calculate');
    
    if (this.tier === 'TIER_1_EDGE' && isComplex) {
      escalated = true;
      const payload = {
        type: 'ESCALATION_QUERY' as const,
        data: { detections, userPrompt: audioTranscript },
        timestamp: Date.now()
      };

      if (this.mesh && !this.mesh.isDisconnected()) {
        this.mesh.sendMessage(payload);
        onStream('[MESH] Transmitting situational data to COMMAND NODE via local mesh...');
      } else {
        await syncQueue.enqueuePayload(payload);
        onStream('[OFFLINE] Network fragmented. Escalation queued for sync...');
      }
    }

    // 3. Process Locally (either as fallback or because we ARE command)
    let response = '';
    if (this.tier === 'TIER_4_COMMAND') {
      // Command nodes use RAG
      response = await ragRouter.executeRAGQuery(
        `Visual Context: ${detections.map(d => d.label).join(', ')}. Query: ${audioTranscript}`,
        onStream
      );
    } else {
      // Edge nodes use direct multimodal routing
      response = await multimodalRouter.executeReasoning(detections, audioTranscript, onStream);
    }

    return { response, detections, escalated };
  }

  private getVisionDetections(blob: Blob): Promise<VisionDetection[]> {
    return new Promise((resolve, reject) => {
      if (!this.visionWorker) return resolve([]);
      
      const handler = (event: MessageEvent) => {
        const { type, payload, message } = event.data;
        if (type === 'RESULT') {
          this.visionWorker?.removeEventListener('message', handler);
          resolve(payload);
        } else if (type === 'ERROR') {
          this.visionWorker?.removeEventListener('message', handler);
          reject(new Error(message));
        }
      };

      this.visionWorker.addEventListener('message', handler);
      this.visionWorker.postMessage({ type: 'PROCESS_IMAGE', payload: blob });
    });
  }
}

export const triageOrchestrator = new TriageOrchestrator();
