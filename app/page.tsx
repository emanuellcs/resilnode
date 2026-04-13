"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { probeHardware, type HardwareProbeResult } from "@/lib/hardware-probe";
import { initializeLLM } from "@/lib/llm-client";
import {
  multimodalRouter,
  type VisionDetection,
} from "@/lib/multimodal-router";
import { WebRTCMesh, type MeshStatus } from "@/lib/webrtc-mesh";
import { syncQueue } from "@/lib/sync-queue";
import { vectorStore } from "@/lib/vector-db";
import { ragRouter, type RAGLog } from "@/lib/rag-router";
import { chunkText, CRISIS_DATASETS } from "@/lib/document-parser";
import { triageOrchestrator } from "@/lib/triage-orchestrator";
import type { InitProgressReport, MLCEngineInterface } from "@mlc-ai/web-llm";
import CameraCapture from "@/components/vision/camera-capture";
import QRHandshake from "@/components/network/qr-handshake";
import { TelemetryOverlay } from "@/components/telemetry-overlay";

export default function CommandCenter() {
  // Phase 1: Hardware Probe State
  const [probeResult, setProbeResult] = useState<HardwareProbeResult | null>(
    null,
  );
  const [isProbing, setIsProbing] = useState(true);

  // Phase 2: AI Engine State
  const [loadingProgress, setLoadingProgress] =
    useState<InitProgressReport | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engine, setEngine] = useState<MLCEngineInterface | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);
  const [heartbeatStatus, setHeartbeatStatus] = useState<"IDLE" | "PROTECTED">(
    "IDLE",
  );

  // Phase 3: Vision State
  const visionWorker = useRef<Worker | null>(null);
  const [visionDetections, setVisionDetections] = useState<VisionDetection[]>(
    [],
  );
  const [isVisionReady, setIsVisionReady] = useState(false);
  const [isProcessingVision, setIsProcessingVision] = useState(false);
  const [visionStatus, setVisionStatus] = useState("OFFLINE");
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);

  // Phase 4: Mesh Networking State
  const [meshStatus, setMeshStatus] = useState<MeshStatus>("DISCONNECTED");
  const [queueCount, setQueueCount] = useState(0);
  const [showHandshake, setShowHandshake] = useState(false);
  const [localSDP, setLocalSDP] = useState<string | null>(null);

  const mesh = useMemo(
    () =>
      new WebRTCMesh(
        (status) => setMeshStatus(status),
        (message: unknown) => {
          const msg = message as { type: string; data: unknown };
          if (msg.type === "ESCALATION_QUERY" && engineReady) {
            setOutput(
              `[MESH_INBOUND] Escalation request received. Processing via 26B MoE RAG pipeline...`,
            );
          }
        },
      ),
    [engineReady],
  );

  // Phase 5: RAG & Vector State
  const embeddingWorker = useRef<Worker | null>(null);
  const [dbDocCount, setDbDocCount] = useState(0);
  const [ragLogs, setRagLogs] = useState<RAGLog[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [embeddingStatus, setEmbeddingStatus] = useState("OFFLINE");

  // Phase 6: Synthesis & Telemetry
  const [ttft, setTtft] = useState(0);
  const [tps, setTps] = useState(0);
  const [vramEst, setVramEst] = useState("0.00 GB");

  // Terminal State
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    // Phase 1: Probe
    async function runProbe() {
      const result = await probeHardware();
      setProbeResult(result);
      setIsProbing(false);
      triageOrchestrator.setTier(result.tier);
    }
    runProbe();

    // Phase 3: Initialize Vision Worker
    visionWorker.current = new Worker(
      new URL("@/workers/vision.worker.ts", import.meta.url),
      { type: "module" },
    );
    visionWorker.current.onmessage = (event) => {
      const { type, payload, message } = event.data;
      if (type === "STATUS") {
        setVisionStatus(message);
        setIsVisionReady(true);
      } else if (type === "RESULT") {
        setVisionDetections(payload);
        setIsProcessingVision(false);
      } else if (type === "ERROR") {
        setVisionStatus(`ERROR: ${message}`);
        setIsProcessingVision(false);
      }
    };
    visionWorker.current.postMessage({ type: "INIT" });
    triageOrchestrator.setVisionWorker(visionWorker.current);

    // Phase 5: Initialize Embedding Worker
    embeddingWorker.current = new Worker(
      new URL("@/workers/embedding.worker.ts", import.meta.url),
      { type: "module" },
    );
    embeddingWorker.current.onmessage = (event) => {
      const { type, message } = event.data;
      if (type === "STATUS") setEmbeddingStatus(message);
    };
    embeddingWorker.current.postMessage({ type: "INIT" });
    ragRouter.setEmbeddingWorker(embeddingWorker.current);
    ragRouter.setLogCallback((log) =>
      setRagLogs((prev) => [log, ...prev].slice(0, 5)),
    );

    const updateDbCount = async () => {
      const count = await vectorStore.getDocumentCount();
      setDbDocCount(count);
    };
    updateDbCount();

    // Phase 4: Mesh
    triageOrchestrator.setMesh(mesh);
    const syncInterval = setInterval(async () => {
      const count = await syncQueue.getQueueCount();
      setQueueCount(count);
    }, 2000);

    // Phase 2: Heartbeat
    const heartbeatInterval = setInterval(() => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "HEARTBEAT",
          timestamp: Date.now(),
        });
      }
    }, 5000);

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === "HEARTBEAT_ACK") {
        setHeartbeatStatus("PROTECTED");
        setTimeout(() => setHeartbeatStatus("IDLE"), 2000);
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSWMessage);
    }

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(syncInterval);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSWMessage);
      }
      visionWorker.current?.terminate();
      embeddingWorker.current?.terminate();
    };
  }, [mesh]);

  const handleHydrate = async () => {
    if (!probeResult) return;
    setIsHydrating(true);
    try {
      const llmEngine = await initializeLLM(probeResult.tier, (report) => {
        setLoadingProgress(report);
        if (report.text.includes("Loading weights")) {
          // Mock VRAM estimation based on progress
          const est =
            (probeResult.tier === "TIER_4_COMMAND" ? 14.5 : 1.8) *
            (report.progress || 0.1);
          setVramEst(`${est.toFixed(2)} GB`);
        }
      });
      setEngine(llmEngine);
      multimodalRouter.setEngine(llmEngine);
      ragRouter.setEngine(llmEngine);
      setEngineReady(true);
    } catch (error) {
      console.error("Hydration Error:", error);
      setOutput(`[FATAL] Hydration failed.`);
    } finally {
      setIsHydrating(false);
    }
  };

  const handleCapture = (blob: Blob) => {
    setLastBlob(blob);
    setIsProcessingVision(true);
    visionWorker.current?.postMessage({ type: "PROCESS_IMAGE", payload: blob });
  };

  const handleTriageInitiation = async () => {
    if (!engineReady || isGenerating) return;
    setIsGenerating(true);
    setOutput("");
    setRagLogs([]);
    const startTime = Date.now();
    let firstTokenTime = 0;
    let tokenCount = 0;

    try {
      await triageOrchestrator.executeTriage(lastBlob, prompt, (chunk) => {
        if (!firstTokenTime) {
          firstTokenTime = Date.now();
          setTtft(firstTokenTime - startTime);
        }
        tokenCount++;
        setOutput(chunk);

        // Dynamic TPS calculation
        const elapsed = (Date.now() - firstTokenTime) / 1000;
        if (elapsed > 0) setTps(tokenCount / elapsed);
      });
    } catch (error) {
      console.error("Triage Error:", error);
      setOutput(`[CRITICAL FAILURE] Autonomous loop interrupted.`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col p-6 font-mono min-h-screen relative overflow-x-hidden bg-zinc-950 text-zinc-100">
      <TelemetryOverlay
        vramUsage={vramEst}
        ttft={ttft}
        tps={tps}
        queueCount={queueCount}
        meshStatus={meshStatus}
      />

      {/* Handshake Modal */}
      {showHandshake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/95 backdrop-blur-sm">
          <div className="w-full max-w-4xl">
            <QRHandshake
              isCommandNode={probeResult?.tier === "TIER_4_COMMAND"}
              localSDP={localSDP}
              onOfferGenerated={async () => {
                const offer = await mesh.generateOffer();
                setLocalSDP(offer);
              }}
              onOfferScanned={async (offer) => {
                const answer = await mesh.acceptOfferAndGenerateAnswer(offer);
                setLocalSDP(answer);
              }}
              onAnswerScanned={async (answer) => {
                await mesh.finalizeHandshake(answer);
                setShowHandshake(false);
              }}
              onAnswerGenerated={() => {}}
            />
          </div>
        </div>
      )}

      <header className="mb-8 border-b border-zinc-800 pb-4 flex justify-between items-start">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tighter uppercase inline-flex items-center gap-3">
            <span className="bg-white text-zinc-950 px-2">ResilNode</span>
            <span className="text-zinc-500">v1.0.0-PROTOTYPE</span>
          </h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.3em]">
            Zero-Connectivity AI Command Center // Sector 7G
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-zinc-600 uppercase font-black">
                Mesh Protocol
              </span>
              <span
                className={`text-[10px] font-bold ${meshStatus === "CONNECTED" ? "text-emerald-500" : "text-zinc-700"}`}
              >
                {meshStatus}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-zinc-600 uppercase font-black">
                Vision Link
              </span>
              <span className="text-[10px] text-zinc-400 font-bold">
                {isVisionReady ? "ACTIVE" : "OFFLINE"}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowHandshake(true)}
            className="px-3 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-500 text-zinc-500 hover:text-zinc-100 text-[9px] font-black uppercase transition-all"
          >
            Optical Sync
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
        {/* Left: Input & Data */}
        <div className="space-y-6 lg:col-span-1">
          <section className="bg-zinc-900/30 border border-zinc-800 p-5 rounded-sm relative group">
            <h2 className="text-[10px] uppercase text-zinc-500 font-black mb-4 flex justify-between">
              <span>Sensory Intake</span>
              <span className="text-zinc-700">0x0F44</span>
            </h2>
            <CameraCapture
              onCapture={handleCapture}
              isProcessing={isProcessingVision}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {visionDetections.map((d, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-emerald-950/30 text-emerald-500 border border-emerald-900/50 text-[9px] uppercase font-black"
                >
                  {d.label}
                </span>
              ))}
            </div>
          </section>

          <section className="bg-zinc-900/30 border border-zinc-800 p-5 rounded-sm">
            <h2 className="text-[10px] uppercase text-zinc-500 font-black mb-4">
              Offline Datasets
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-zinc-600">Local Vector Shards:</span>
                <span className="text-zinc-300 font-bold">{dbDocCount}</span>
              </div>
              <button
                onClick={async () => {
                  setIsIndexing(true);
                  for (const dataset of CRISIS_DATASETS) {
                    const chunks = chunkText(dataset.content);
                    for (const chunk of chunks) {
                      await ragRouter["getQueryEmbedding"](chunk).then((emb) =>
                        vectorStore.addDocument(chunk, emb),
                      );
                    }
                  }
                  setDbDocCount(await vectorStore.getDocumentCount());
                  setIsIndexing(false);
                }}
                disabled={isIndexing}
                className="w-full py-2 border border-dashed border-zinc-700 hover:border-zinc-400 text-zinc-600 hover:text-zinc-200 text-[10px] font-bold uppercase transition-all"
              >
                {isIndexing ? "Indexing..." : "Inject Emergency Manuals"}
              </button>
            </div>
          </section>

          <div className="mt-auto">
            {!engineReady ? (
              <button
                onClick={handleHydrate}
                disabled={isHydrating}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-black uppercase text-xs tracking-[0.2em] shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
              >
                {isHydrating ? "Allocating VRAM..." : "Engage AI Runtime"}
              </button>
            ) : (
              <div className="p-4 border-2 border-emerald-500/20 bg-emerald-500/5 text-center">
                <span className="text-emerald-500 font-black uppercase text-xs tracking-widest animate-pulse">
                  Neural Grid Online
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Terminal */}
        <section
          className={`lg:col-span-2 flex flex-col border border-zinc-800 bg-zinc-950 shadow-2xl relative transition-opacity ${!engineReady && "opacity-40 pointer-events-none"}`}
        >
          <div className="absolute top-0 right-0 p-2 text-[8px] text-zinc-800 uppercase font-black">
            Runtime: {probeResult?.tier} {"//"} {vramEst}
          </div>

          <div className="bg-zinc-900/50 border-b border-zinc-800 p-3 flex items-center justify-between">
            <div className="flex gap-2 items-center">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">
                Tactical Reasoning Output
              </span>
            </div>
            <div className="text-[9px] text-zinc-600">
              LAT: 34.0522 N | LON: 118.2437 W
            </div>
          </div>

          <div className="flex-1 p-8 overflow-y-auto font-mono text-sm leading-relaxed text-zinc-300 scrollbar-thin scrollbar-thumb-zinc-800">
            {output ? (
              <div className="whitespace-pre-wrap selection:bg-emerald-500/30">
                {output}
              </div>
            ) : (
              <div className="space-y-4 opacity-30 select-none">
                <p className="text-zinc-500 text-xs">
                  AWAITING TRIAGE INITIATION...
                </p>
                <div className="h-px bg-zinc-900" />
                <div className="grid grid-cols-2 gap-4">
                  <div className="h-2 bg-zinc-900 w-full" />
                  <div className="h-2 bg-zinc-900 w-3/4" />
                  <div className="h-2 bg-zinc-900 w-1/2" />
                  <div className="h-2 bg-zinc-900 w-full" />
                </div>
              </div>
            )}
            {isGenerating && (
              <span className="inline-block w-2 h-4 bg-emerald-500 ml-1 animate-pulse align-middle" />
            )}
          </div>

          <div className="p-6 bg-zinc-900/30 border-t border-zinc-800">
            <div className="flex flex-col gap-4">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Enter responder command or situation summary..."
                className="w-full bg-zinc-950 border border-zinc-800 p-4 text-sm focus:outline-none focus:border-zinc-500 text-zinc-100 resize-none h-24 font-mono placeholder:text-zinc-800"
              />
              <button
                onClick={handleTriageInitiation}
                disabled={
                  isGenerating || !engineReady || (!prompt.trim() && !lastBlob)
                }
                className="w-full py-4 bg-white text-zinc-950 font-black uppercase text-sm tracking-[0.4em] hover:bg-zinc-200 transition-all active:scale-[0.99] disabled:opacity-20"
              >
                Initiate Triage
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer className="mt-6 flex justify-between text-[9px] text-zinc-700 uppercase tracking-[0.2em] border-t border-zinc-900 pt-4 font-black">
        <div>
          ResilNode :: Zero-Signal Mesh Collective {"//"} Phase 06 Finish
        </div>
        <div className="flex gap-6">
          <span>Memory Guard: Active</span>
          <span>Heartbeat: {heartbeatStatus}</span>
          <span>
            UTC: {new Date().toISOString().split("T")[1].split(".")[0]}
          </span>
        </div>
      </footer>
    </main>
  );
}
