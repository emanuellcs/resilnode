'use client';

import { useEffect, useState } from 'react';
import { probeHardware, type HardwareProbeResult } from '@/lib/hardware-probe';

export default function CommandCenter() {
  const [probeResult, setProbeResult] = useState<HardwareProbeResult | null>(null);
  const [isProbing, setIsProbing] = useState(true);

  useEffect(() => {
    async function runProbe() {
      const result = await probeHardware();
      setProbeResult(result);
      setIsProbing(false);
    }
    runProbe();

    // 5000ms Heartbeat Protocol to prevent VRAM eviction
    const heartbeatInterval = setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'HEARTBEAT', timestamp: Date.now() });
      }
    }, 5000);

    return () => clearInterval(heartbeatInterval);
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <main className="flex-1 flex flex-col p-6 font-mono">
      <header className="mb-8 border-b border-zinc-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter uppercase text-zinc-100">
            ResilNode <span className="text-zinc-500">v1.0.0</span>
          </h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">
            Zero-Connectivity AI Command Center
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full animate-pulse ${isProbing ? 'bg-yellow-500' : 'bg-green-500'}`} />
          <span className="text-xs uppercase text-zinc-400">
            {isProbing ? 'Probing Hardware...' : 'System Ready'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Hardware Diagnostic Card */}
        <section className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
          <h2 className="text-xs uppercase text-zinc-500 font-bold mb-4 border-b border-zinc-800 pb-2">
            Hardware Diagnostic
          </h2>
          
          {isProbing ? (
            <div className="space-y-2 animate-pulse">
              <div className="h-4 bg-zinc-800 rounded w-3/4" />
              <div className="h-4 bg-zinc-800 rounded w-1/2" />
              <div className="h-4 bg-zinc-800 rounded w-2/3" />
            </div>
          ) : probeResult ? (
            <div className="space-y-4 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">ASSIGNED TIER:</span>
                <span className={`px-2 py-0.5 font-bold ${
                  probeResult.tier === 'TIER_4_COMMAND' ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                }`}>
                  {probeResult.tier}
                </span>
              </div>
              
              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <div className="flex justify-between">
                  <span className="text-zinc-500 uppercase">GPU Device:</span>
                  <span className="text-zinc-300 truncate max-w-[150px]">
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

              {probeResult.error && (
                <div className="bg-red-950/50 text-red-400 p-2 mt-2 border border-red-900 uppercase text-[10px]">
                  ERROR: {probeResult.error}
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* Model Configuration Card */}
        <section className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
          <h2 className="text-xs uppercase text-zinc-500 font-bold mb-4 border-b border-zinc-800 pb-2">
            Model Assignment
          </h2>
          
          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 uppercase">Gemma Release:</span>
              <span className="text-zinc-300 font-bold">Gemma 4</span>
            </div>
            
            <div className="p-3 bg-zinc-800/30 border border-zinc-700/50">
              <p className="text-zinc-400 uppercase leading-relaxed">
                {probeResult?.tier === 'TIER_4_COMMAND' 
                  ? 'Optimized for 26B MoE Execution via q4f16_1 WebGPU runtime.'
                  : 'Optimized for E2B WASM fallback / Low-Tier WebGPU runtime.'
                }
              </p>
            </div>
          </div>
        </section>

        {/* Network Status Card */}
        <section className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
          <h2 className="text-xs uppercase text-zinc-500 font-bold mb-4 border-b border-zinc-800 pb-2">
            Connectivity Status
          </h2>
          
          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 uppercase">Mesh Protocol:</span>
              <span className="text-red-900 bg-red-950/20 px-2 py-0.5 font-bold">OFFLINE</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 uppercase">Peer Discovery:</span>
              <span className="text-zinc-600 italic">INACTIVE</span>
            </div>
            <div className="mt-4 p-2 border border-dashed border-zinc-700 text-center">
              <span className="text-zinc-600 animate-pulse">Scanning for local beacons...</span>
            </div>
          </div>
        </section>
      </div>

      <footer className="mt-auto pt-8 flex justify-between text-[10px] text-zinc-600 uppercase tracking-widest">
        <div>ResilNode Hardware Orchestrator // Phase 1.0.0-Initialize</div>
        <div>System Local Time: {new Date().toLocaleTimeString()}</div>
      </footer>
    </main>
  );
}
