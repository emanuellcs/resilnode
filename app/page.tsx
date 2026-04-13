'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { probeHardware, type HardwareProbeResult } from '@/lib/hardware-probe';
import { initializeLLM } from '@/lib/llm-client';
import { multimodalRouter, type VisionDetection } from '@/lib/multimodal-router';
import { WebRTCMesh, type MeshStatus } from '@/lib/webrtc-mesh';
import { syncQueue } from '@/lib/sync-queue';
import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm';
import CameraCapture from '@/components/vision/camera-capture';
import QRHandshake from '@/components/network/qr-handshake';

export default function CommandCenter() {
  // Phase 1: Hardware Probe State
  const [probeResult, setProbeResult] = useState<HardwareProbeResult | null>(null);
  const [isProbing, setIsProbing] = useState(true);

  // Phase 2: AI Engine State
  const [loadingProgress, setLoadingProgress] = useState<InitProgressReport | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [engine, setEngine] = useState<MLCEngineInterface | null>(null);
  const [isHydrating, setIsHydrating] = useState(false);
  const [heartbeatStatus, setHeartbeatStatus] = useState<'IDLE' | 'PROTECTED'>('IDLE');

  // Phase 3: Vision State
  const visionWorker = useRef<Worker | null>(null);
  const [visionDetections, setVisionDetections] = useState<VisionDetection[]>([]);
  const [isVisionReady, setIsVisionReady] = useState(false);
  const [isProcessingVision, setIsProcessingVision] = useState(false);
  const [visionStatus, setVisionStatus] = useState('OFFLINE');

  // Phase 4: Mesh Networking State
  const [meshStatus, setMeshStatus] = useState<MeshStatus>('DISCONNECTED');
  const [queueCount, setQueueCount] = useState(0);
  const [showHandshake, setShowHandshake] = useState(false);
  const [localSDP, setLocalSDP] = useState<string | null>(null);

  const mesh = useMemo(() => new WebRTCMesh(
    (status) => setMeshStatus(status),
    (message: unknown) => {
      // Handle incoming messages from mesh peers
      const msg = message as any;
      if (msg.type === 'ESCALATION_QUERY' && engineReady) {
        setOutput(`[MESH_RECEIVE] Escalation Query: ${msg.data.userPrompt}. Analyzing...`);
      }
    }
  ), [engineReady]);

  // Terminal State
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    // Phase 1: Probe
    async function runProbe() {
      const result = await probeHardware();
      setProbeResult(result);
      setIsProbing(false);
    }
    runProbe();

    // Phase 3: Initialize Vision Worker
    visionWorker.current = new Worker(new URL('@/workers/vision.worker.ts', import.meta.url), { type: 'module' });
    visionWorker.current.onmessage = (event) => {
      const { type, payload, message } = event.data;
      if (type === 'STATUS') {
        setVisionStatus(message);
        setIsVisionReady(true);
      } else if (type === 'RESULT') {
        setVisionDetections(payload);
        setIsProcessingVision(false);
      } else if (type === 'ERROR') {
        console.error('Vision Worker Error:', message);
        setVisionStatus(`ERROR: ${message}`);
        setIsProcessingVision(false);
      }
    };
    visionWorker.current.postMessage({ type: 'INIT' });

    // Phase 4: Sync Queue Update
    const syncInterval = setInterval(async () => {
      const count = await syncQueue.getQueueCount();
      setQueueCount(count);
    }, 2000);

    // Phase 2: Heartbeat
    const heartbeatInterval = setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'HEARTBEAT', timestamp: Date.now() });
      }
    }, 5000);

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'HEARTBEAT_ACK') {
        setHeartbeatStatus('PROTECTED');
        setTimeout(() => setHeartbeatStatus('IDLE'), 2000);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(syncInterval);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
      visionWorker.current?.terminate();
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleHydrate = async () => {
    if (!probeResult) return;
    setIsHydrating(true);
    try {
      const llmEngine = await initializeLLM(probeResult.tier, (report) => {
        setLoadingProgress(report);
      });
      setEngine(llmEngine);
      multimodalRouter.setEngine(llmEngine);
      multimodalRouter.setMesh(mesh);
      setEngineReady(true);
    } catch (error) {
      console.error("Hydration Error:", error);
      setOutput(`[FATAL] Hydration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsHydrating(false);
    }
  };

  const handleCapture = (blob: Blob) => {
    if (!visionWorker.current || !isVisionReady) return;
    setIsProcessingVision(true);
    visionWorker.current.postMessage({ type: 'PROCESS_IMAGE', payload: blob });
  };

  const handleExecute = async () => {
    if (!engineReady || isGenerating) return;
    setIsGenerating(true);
    setOutput('');

    try {
      // Multimodal reasoning logic is handled in the router
      await multimodalRouter.executeReasoning(
        visionDetections,
        prompt,
        (chunk) => setOutput(chunk)
      );
    } catch (error) {
      console.error("Execution Error:", error);
      setOutput(`[TERMINAL ERROR] ${error instanceof Error ? error.message : 'Execution failed'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col p-6 font-mono min-h-screen relative overflow-x-hidden">
      {/* Handshake Modal Overlay */}
      {showHandshake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/95 backdrop-blur-sm">
          <div className="w-full max-w-4xl">
            <QRHandshake 
              isCommandNode={probeResult?.tier === 'TIER_4_COMMAND'}
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

      <header className="mb-8 border-b border-zinc-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase text-zinc-100">
            ResilNode <span className="text-zinc-500">v1.0.0</span>
          </h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">
            Zero-Connectivity AI Command Center
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] uppercase">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isProbing ? 'bg-yellow-500' : 'bg-green-500'}`} />
            <span className="text-zinc-400">{isProbing ? 'Probing Hardware...' : 'System Ready'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${heartbeatStatus === 'PROTECTED' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-zinc-800'}`} />
            <span className="text-zinc-500">VRAM Guard: {heartbeatStatus}</span>
          </div>
          <div className="flex items-center gap-2">
             <span className="text-zinc-600">Mesh Network:</span>
             <span className={meshStatus === 'CONNECTED' ? 'text-emerald-400 font-bold' : meshStatus === 'CONNECTING' ? 'text-yellow-500 animate-pulse' : 'text-zinc-700'}>
                {meshStatus === 'CONNECTED' ? 'CONNECTED' : meshStatus === 'CONNECTING' ? 'SYNCING...' : `OFFLINE (Queue: ${queueCount})`}
             </span>
          </div>
          <button 
            onClick={() => setShowHandshake(true)}
            className="mt-1 px-2 py-0.5 border border-zinc-700 hover:border-zinc-400 text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            Handshake Node
          </button>
          <div className="hidden">{visionStatus} {engine ? 'LLM_ACTIVE' : ''}</div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
        {/* Left Column: Sensory Intake */}
        <div className="space-y-6 flex flex-col">
          <section className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
            <h2 className="text-xs uppercase text-zinc-500 font-bold mb-4 border-b border-zinc-800 pb-2">
              Optical Context Intake
            </h2>
            <CameraCapture onCapture={handleCapture} isProcessing={isProcessingVision} />
            
            <div className="mt-4 p-4 bg-zinc-950 border border-zinc-800 min-h-[80px]">
               <div className="text-[9px] uppercase text-zinc-600 mb-2 tracking-widest">Extracted Visual Features</div>
               <div className="flex flex-wrap gap-2">
                  {isProcessingVision ? (
                    <span className="text-[10px] text-zinc-500 animate-pulse uppercase tracking-tighter">Analyzing sensory payload...</span>
                  ) : visionDetections.length > 0 ? (
                    visionDetections.map((d, i) => (
                      <span key={i} className="px-2 py-1 bg-zinc-900 text-zinc-300 border border-zinc-700 text-[10px] uppercase font-bold">
                        {d.label} <span className="text-zinc-500">{Math.round(d.score * 100)}%</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-zinc-700 uppercase italic">No active visual context.</span>
                  )}
               </div>
            </div>
          </section>

          <section className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
            <h2 className="text-xs uppercase text-zinc-500 font-bold mb-4 border-b border-zinc-800 pb-2">
              Hardware & Model Status
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {/* Probe Data */}
              <div className="space-y-2 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500 uppercase">Tier:</span>
                  <span className={`font-bold ${probeResult?.tier === 'TIER_4_COMMAND' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {probeResult?.tier || 'UNKNOWN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 uppercase">VRAM:</span>
                  <span className="text-zinc-300">{probeResult ? formatBytes(probeResult.maxStorageBufferBindingSize) : '---'}</span>
                </div>
              </div>
              {/* Orchestration Button */}
              <div>
                {!engineReady && !isHydrating ? (
                   <button 
                     onClick={handleHydrate}
                     className="w-full h-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold uppercase text-[10px] tracking-widest transition-colors border border-zinc-600"
                   >
                     Hydrate LLM
                   </button>
                ) : isHydrating ? (
                  <div className="text-center">
                    <div className="text-[10px] text-emerald-400 font-black animate-pulse uppercase">Allocating...</div>
                    <div className="text-[8px] text-zinc-500 uppercase mt-1">{loadingProgress?.progress ? Math.round(loadingProgress.progress * 100) : 0}%</div>
                  </div>
                ) : (
                  <div className="text-center py-2 bg-emerald-950/20 border border-emerald-900/50">
                    <span className="text-emerald-500 font-black uppercase text-[10px]">Engine Online</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Reasoning Dashboard */}
        <section className={`flex flex-col border border-zinc-800 bg-zinc-950 transition-opacity duration-500 ${engineReady ? 'opacity-100' : 'opacity-20 pointer-events-none'}`}>
          <div className="bg-zinc-900/80 border-b border-zinc-800 p-2 flex justify-between items-center">
             <h2 className="text-[10px] uppercase text-zinc-400 font-bold tracking-widest">
               Tactical Terminal <span className="text-zinc-700">| multimodal:reasoning</span>
             </h2>
             <div className="flex gap-1">
                <div className="w-2 h-2 bg-zinc-800 rounded-full" />
                <div className="w-2 h-2 bg-zinc-800 rounded-full" />
                <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`} />
             </div>
          </div>
          
          <div className="flex-1 p-6 overflow-y-auto text-sm text-zinc-300 font-mono relative scrollbar-thin scrollbar-thumb-zinc-800">
             {output ? (
               <div className="whitespace-pre-wrap leading-relaxed selection:bg-emerald-500/30">{output}</div>
             ) : (
               <div className="text-zinc-800 select-none uppercase text-[11px] space-y-1">
                 <div>[READY] Awaiting situational query...</div>
                 <div>[INFO] Vision integration detected. Images will enrich prompts.</div>
                 {visionDetections.length > 0 && (
                    <div className="text-zinc-600 mt-4 border-l-2 border-zinc-800 pl-3">
                       ACTIVE VISUAL PAYLOAD: {visionDetections.length} objects localized.
                    </div>
                 )}
               </div>
             )}
             {isGenerating && (
               <div className="inline-block w-2 h-4 bg-emerald-500 ml-1 animate-pulse align-middle" />
             )}
          </div>

          <div className="p-4 bg-zinc-900/50 border-t border-zinc-800">
             <div className="flex gap-3">
                <textarea 
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleExecute();
                    }
                  }}
                  placeholder="Ask about the visual context or type command..."
                  className="flex-1 bg-zinc-950 border border-zinc-800 p-3 text-sm focus:outline-none focus:border-zinc-500 text-zinc-100 resize-none h-20 font-mono placeholder:text-zinc-800"
                />
                <button 
                  onClick={handleExecute}
                  disabled={isGenerating || (!prompt.trim() && visionDetections.length === 0) || !engineReady}
                  className="px-6 bg-zinc-100 hover:bg-white text-zinc-950 font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-20 flex items-center justify-center active:scale-95"
                >
                  Analyze
                </button>
             </div>
          </div>
        </section>
      </div>

      <footer className="mt-6 flex justify-between text-[9px] text-zinc-700 uppercase tracking-widest border-t border-zinc-900 pt-2">
        <div>ResilNode Sensory Pipeline // PHASE_04_MESH</div>
        <div className="flex gap-4">
           <span>Memory: Stable</span>
           <span>UTC: {new Date().toISOString().split('T')[1].split('.')[0]}</span>
        </div>
      </footer>
    </main>
  );
}
