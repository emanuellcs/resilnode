import { MLCEngineInterface } from "@mlc-ai/web-llm";
import { vectorStore } from "./vector-db";

export interface RAGLog {
  timestamp: number;
  message: string;
  type: "INFO" | "SUCCESS" | "ERROR";
}

/**
 * Orchestrates the Agentic RAG pipeline.
 * Intercepts queries, retrieves local context, and augments the inference cycle.
 */
export class RAGRouter {
  private engine: MLCEngineInterface | null = null;
  private embeddingWorker: Worker | null = null;
  private logCallback: (log: RAGLog) => void = () => {};

  setEngine(engine: MLCEngineInterface) {
    this.engine = engine;
  }

  setEmbeddingWorker(worker: Worker) {
    this.embeddingWorker = worker;
  }

  setLogCallback(callback: (log: RAGLog) => void) {
    this.logCallback = callback;
  }

  private log(message: string, type: "INFO" | "SUCCESS" | "ERROR" = "INFO") {
    this.logCallback({ timestamp: Date.now(), message, type });
  }

  /**
   * Main entry point for RAG queries.
   */
  async executeRAGQuery(
    query: string,
    onStream: (chunk: string) => void,
  ): Promise<string> {
    if (!this.engine || !this.embeddingWorker) {
      throw new Error("RAG Router not fully initialized.");
    }

    this.log("🔍 Vectorizing situational query...");

    // 1. Get Query Embedding from Worker
    const queryEmbedding = await this.getQueryEmbedding(query);
    this.log("✅ Embedding generated locally.", "SUCCESS");

    // 2. Search Local Vector Store
    this.log("📂 Searching offline document store...");
    const contextChunks = await vectorStore.similaritySearch(queryEmbedding, 3);

    if (contextChunks.length === 0) {
      this.log("⚠️ No relevant documents found in local cache.", "INFO");
    } else {
      this.log(
        `🎯 Retrieved ${contextChunks.length} relevant context blocks.`,
        "SUCCESS",
      );
    }

    // 3. Synthesize Augmented Prompt
    const contextText = contextChunks.map((c) => c.text).join("\n\n---\n\n");
    const systemPrompt = `
      [OFFLINE CONTEXT RETRIEVED]:
      ${contextText || "No specific document context available."}

      You are ResilNode AI. Use the provided context to answer the query accurately. 
      If the context contains structural blueprints or protocols, prioritize those details.
      If the context does not contain relevant information, rely on your internal knowledge but state clearly that no specific document context was found.
    `;

    this.log("🧠 Generating RAG-augmented response...");

    // 4. Trigger WebLLM Inference
    const asyncGen = await this.engine.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Tactical Query: ${query}` },
      ],
      stream: true,
    });

    let fullResponse = "";
    for await (const chunk of asyncGen) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;
      onStream(fullResponse);
    }

    this.log("🏁 Inference cycle complete.", "SUCCESS");
    return fullResponse;
  }

  /**
   * Helper to wrap Web Worker message in a Promise.
   */
  private getQueryEmbedding(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const { type, payload, message } = event.data;
        if (type === "RESULT") {
          this.embeddingWorker?.removeEventListener("message", handler);
          resolve(payload);
        } else if (type === "ERROR") {
          this.embeddingWorker?.removeEventListener("message", handler);
          reject(new Error(message));
        }
      };

      this.embeddingWorker?.addEventListener("message", handler);
      this.embeddingWorker?.postMessage({
        type: "GENERATE_EMBEDDING",
        payload: text,
      });
    });
  }
}

export const ragRouter = new RAGRouter();
