"use client";

import { useEffect, useState } from "react";

interface TelemetryProps {
  vramUsage: string;
  ttft: number; // ms
  tps: number;
  queueCount: number;
  meshStatus: string;
}

export function TelemetryOverlay({
  vramUsage,
  ttft,
  tps,
  queueCount,
  meshStatus,
}: TelemetryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed bottom-14 right-6 z-40 font-mono text-[9px] pointer-events-none">
      <div
        className={`bg-zinc-950/90 border border-zinc-800 p-3 shadow-2xl transition-all duration-300 pointer-events-auto ${isExpanded ? "w-56" : "w-24"}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex justify-between items-center border-b border-zinc-900 pb-1 mb-2">
          <span className="text-zinc-500 font-black uppercase tracking-tighter">
            Telemetry HUD
          </span>
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-zinc-600">VRAM:</span>
            <span className="text-emerald-400 font-bold">
              {vramUsage || "0.00 GB"}
            </span>
          </div>

          {isExpanded && (
            <>
              <div className="flex justify-between border-t border-zinc-900 pt-1">
                <span className="text-zinc-600 uppercase">TTFT:</span>
                <span className="text-zinc-300">
                  {ttft > 0 ? `${ttft}ms` : "---"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600 uppercase">Speed:</span>
                <span className="text-zinc-300">
                  {tps > 0 ? `${tps.toFixed(1)} t/s` : "---"}
                </span>
              </div>
              <div className="flex justify-between border-t border-zinc-900 pt-1">
                <span className="text-zinc-600 uppercase">Mesh:</span>
                <span
                  className={
                    meshStatus === "CONNECTED"
                      ? "text-emerald-500 font-bold"
                      : "text-zinc-500 font-bold"
                  }
                >
                  {meshStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-600 uppercase">Queue:</span>
                <span className="text-zinc-300">{queueCount} Pkts</span>
              </div>
              <div className="text-[7px] text-zinc-700 uppercase mt-2 italic text-center border-t border-zinc-900 pt-1">
                zero-server-ai-runtime::active
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
