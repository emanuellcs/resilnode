import { MLCEngineInterface } from "@mlc-ai/web-llm";

export interface VisionDetection {
  label: string;
  score: number;
  box?: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

/**
 * Bridges Vision Intelligence with LLM Reasoning and Mesh Communication.
 */
export class MultimodalRouter {
  private engine: MLCEngineInterface | null = null;

  setEngine(engine: MLCEngineInterface) {
    this.engine = engine;
  }

  clearEngine() {
    this.engine = null;
  }

  /**
   * Synthesizes a prompt from vision detections and a user command.
   * Escalation transport is owned by TriageOrchestrator so each request is
   * queued or transmitted exactly once.
   */
  async executeReasoning(
    detections: VisionDetection[],
    userPrompt: string,
    onStream: (chunk: string) => void,
  ) {
    if (!this.engine) throw new Error("LLM Engine not initialized in router.");

    const visualContext =
      detections.length > 0
        ? detections
            .map(
              (d) => `${d.label} (Confidence: ${Math.round(d.score * 100)}%)`,
            )
            .join(", ")
        : "No significant objects detected.";

    const systemPrompt = `[VISUAL CONTEXT RECEIVED]: ${visualContext}\n\nYou are ResilNode AI, an emergency responder assistant. Analyze the visual context and respond to the user's tactical query. Keep response direct, structural, and prioritized for life-saving operations.`;

    const fullPrompt = `Tactical Query: ${userPrompt}\n\nAssess the situation based on the visual context above.`;

    const asyncGen = await this.engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: fullPrompt },
      ],
      stream: true,
    });

    let fullResponse = "";
    for await (const chunk of asyncGen) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;
      onStream(fullResponse);
    }

    return fullResponse;
  }
}

export const multimodalRouter = new MultimodalRouter();
