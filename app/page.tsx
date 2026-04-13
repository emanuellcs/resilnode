'use client';

import { useEffect, useState } from 'react';
import { probeHardware, type HardwareProbeResult } from '@/lib/hardware-probe';
import { initializeLLM } from '@/lib/llm-client';
import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm';

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

  // Terminal State
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    async function runProbe() {
      const result = await probeHardware();
      setProbeResult(result);
      setIsProbing(false);
    }
    runProbe();

    // 5000ms Heartbeat Protocol to keep VRAM from being evicted
    const heartbeatInterval = setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'HEARTBEAT', timestamp: Date.now() });
      }
    }, 5000);

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'HEARTBEAT_ACK') {
        setHeartbeatStatus('PROTECTED');
        // Reset status after a delay to show it's still pulsing
        setTimeout(() => setHeartbeatStatus('IDLE'), 2000);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    return () => {
      clearInterval(heartbeatInterval);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
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
      setEngineReady(true);
    } catch (error) {
      console.error("Hydration Error:", error);
      setOutput(`[FATAL] Hydration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsHydrating(false);
    }
  };

  const handleGenerate = async () => {
    if (!engine || !prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setOutput('');
    
    try {
      const asyncGen = await engine.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      });

      let currentOutput = '';
      for await (const chunk of asyncGen) {
        const content = chunk.choices[0]?.delta?.content || "";
        currentOutput += content;
        setOutput(currentOutput);
      }
    } catch (error) {
      console.error("Inference Error:", error);
      setOutput(`[TERMINAL ERROR] Inference cycle interrupted. ${error instanceof Error ? error.message : ''}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col p-6 font-mono min-h-screen">
      <header className="mb-8 border-b border-zinc-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase text-zinc-100">
            ResilNode <span className="text-zinc-500">v1.0.0</span>
          </h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">
            Zero-Connectivity AI Command Center
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${isProbing ? 'bg-yellow-500' : 'bg-green-500'}`} />
            <span className="text-[10px] uppercase text-zinc-400">
              {isProbing ? 'Probing Hardware...' : 'System Ready'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${heartbeatStatus === 'PROTECTED' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-zinc-800'}`} />
            <span className="text-[10px] uppercase text-zinc-500 tracking-tighter">
              VRAM Guard: {heartbeatStatus}
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <section className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
          <h2 className="text-xs uppercase text-zinc-500 font-bold mb-4 border-b border-zinc-800 pb-2">
            Hardware Diagnostic
          </h2>
          {isProbing ? (
             <div className="text-zinc-500 text-[10px] animate-pulse">Initializing GPU Adapter...</div>
          ) : probeResult ? (
             <div className="space-y-4 text-[10px]">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500 uppercase">Assigned Tier:</span>
                <span className={`px-2 py-0.5 font-bold ${
                  probeResult.tier === 'TIER_4_COMMAND' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                }`}>
                  {probeResult.tier}
                </span>
              </div>
              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <div className="flex justify-between">
                  <span className="text-zinc-500 uppercase">GPU Device:</span>
                  <span className="text-zinc-300 truncate max-w-[180px]">
                    {probeResult.adapterInfo?.vendor || 'Unknown Vendor'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 uppercase">Max Buffer:</span>
                  <span className="text-zinc-300">{formatBytes(probeResult.maxBufferSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 uppercase">Storage Binding:</span>
                  <span className="text-zinc-300">{formatBytes(probeResult.maxStorageBufferBindingSize)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm flex flex-col min-h-[160px]">
           <h2 className="text-xs uppercase text-zinc-500 font-bold mb-4 border-b border-zinc-800 pb-2">
            Model Orchestration
          </h2>
          
          {!engineReady && !isHydrating && (
            <div className="flex-1 flex flex-col justify-center space-y-2">
              <p className="text-[10px] text-zinc-500 mb-2">
                {probeResult?.tier === 'TIER_4_COMMAND' 
                  ? 'Ready to allocate 26B MoE q4f16_1.' 
                  : 'Ready to allocate E2B q4f16_1.'}
              </p>
              <button 
                onClick={handleHydrate}
                disabled={isProbing || !probeResult}
                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold uppercase text-[10px] tracking-widest transition-colors border border-zinc-600 disabled:opacity-50"
              >
                Hydrate Inference Engine
              </button>
            </div>
          )}

          {isHydrating && (
            <div className="flex-1 flex flex-col justify-center space-y-3">
               <div className="text-[10px] text-zinc-400 uppercase tracking-widest flex justify-between">
                  <span>VRAM Allocation...</span>
                  <span className="font-bold text-emerald-400">
                    {loadingProgress ? Math.round((loadingProgress.progress || 0) * 100) : 0}%
                  </span>
               </div>
               <div className="w-full bg-zinc-950 h-1.5 border border-zinc-800">
                  <div 
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${loadingProgress ? (loadingProgress.progress || 0) * 100 : 0}%` }}
                  />
               </div>
               <div className="bg-zinc-950 p-2 text-[9px] text-zinc-500 font-mono h-12 overflow-hidden border border-zinc-800 break-all leading-tight">
                  {loadingProgress?.text || "Synchronizing with Service Worker..."}
               </div>
            </div>
          )}

          {engineReady && (
            <div className="flex-1 flex flex-col justify-center text-center space-y-1">
               <div className="text-emerald-400 font-bold uppercase tracking-widest text-xs">
                 Engine Online
               </div>
               <div className="text-[9px] text-zinc-500 uppercase tracking-tight">
                 SharedArrayBuffer: Active | WebGPU context: Locked
               </div>
            </div>
          )}
        </section>
      </div>

      <section className={`flex-1 flex flex-col border border-zinc-800 bg-zinc-950 transition-opacity duration-500 ${engineReady ? 'opacity-100' : 'opacity-20 pointer-events-none grayscale'}`}>
         <div className="bg-zinc-900/80 border-b border-zinc-800 p-2 flex justify-between items-center">
            <h2 className="text-[10px] uppercase text-zinc-400 font-bold tracking-widest">
              Secure Tactical Terminal <span className="text-zinc-700">| localhost:inference</span>
            </h2>
            <div className="flex gap-1">
               <div className="w-2 h-2 bg-zinc-800 rounded-full" />
               <div className="w-2 h-2 bg-zinc-800 rounded-full" />
               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </div>
         </div>
         
         <div className="flex-1 p-6 overflow-y-auto text-sm text-zinc-300 font-mono relative scrollbar-thin scrollbar-thumb-zinc-800">
            {output ? (
              <div className="whitespace-pre-wrap leading-relaxed">{output}</div>
            ) : (
              <div className="text-zinc-800 select-none">
                [SYSTEM] Awaiting tactical query...
                <br />
                [SYSTEM] All inference is local and zero-connectivity.
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
                     handleGenerate();
                   }
                 }}
                 placeholder="Type your command..."
                 className="flex-1 bg-zinc-950 border border-zinc-800 p-3 text-sm focus:outline-none focus:border-zinc-500 text-zinc-100 resize-none h-14 scrollbar-none font-mono placeholder:text-zinc-800"
               />
               <button 
                 onClick={handleGenerate}
                 disabled={isGenerating || !prompt.trim() || !engineReady}
                 className="px-8 bg-zinc-100 hover:bg-white text-zinc-950 font-black uppercase text-[10px] tracking-[0.2em] transition-all disabled:opacity-20 flex items-center justify-center border-b-2 border-zinc-400 active:border-b-0 active:translate-y-[1px]"
               >
                 Execute
               </button>
            </div>
         </div>
      </section>

      <footer className="mt-6 flex justify-between text-[9px] text-zinc-700 uppercase tracking-widest border-t border-zinc-900 pt-2">
        <div>ORCHESTRATOR-L2 // RECOVERY_MODE_ENABLED</div>
        <div className="flex gap-4">
           <span>Lat: 0.0000 | Long: 0.0000</span>
           <span>UTC: {new Date().toISOString().split('T')[1].split('.')[0]}</span>
        </div>
      </footer>
    </main>
  );
}
