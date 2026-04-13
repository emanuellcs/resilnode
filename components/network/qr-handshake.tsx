"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Html5QrcodeScanner } from "html5-qrcode";

interface QRHandshakeProps {
  onOfferGenerated: (offer: string) => void;
  onAnswerGenerated: (answer: string) => void;
  onAnswerScanned: (answer: string) => void;
  onOfferScanned: (offer: string) => void;
  isCommandNode: boolean;
  localSDP?: string | null;
}

export default function QRHandshake({
  onOfferGenerated,
  onAnswerScanned,
  onOfferScanned,
  isCommandNode,
  localSDP,
}: QRHandshakeProps) {
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  const stopScanning = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch((e) => console.error(e));
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  useEffect(() => {
    if (isScanning) {
      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false,
      );

      scannerRef.current.render(
        (decodedText) => {
          if (isCommandNode) {
            onAnswerScanned(decodedText);
          } else {
            onOfferScanned(decodedText);
          }
          stopScanning();
        },
        (_error) => {
          // Silent warning
        },
      );
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch((e) => console.error(e));
      }
    };
  }, [
    isScanning,
    isCommandNode,
    onAnswerScanned,
    onOfferScanned,
    stopScanning,
  ]);

  const generateOffer = async () => {
    onOfferGenerated("");
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-sm space-y-6">
      <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">
          Optical Handshake Protocol //{" "}
          {isCommandNode ? "COMMAND" : "RESPONDER"}
        </h3>
        <button
          onClick={() => stopScanning()}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 uppercase font-bold"
        >
          Cancel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="flex flex-col items-center space-y-4">
          <span className="text-[10px] uppercase text-zinc-500 font-bold">
            {isCommandNode ? "1. Broadcast Offer" : "2. Broadcast Answer"}
          </span>

          <div className="p-4 bg-white rounded-lg shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            {localSDP ? (
              <QRCodeSVG
                value={localSDP}
                size={256}
                level="L"
                includeMargin={true}
              />
            ) : (
              <div className="w-[256px] h-[256px] flex items-center justify-center border-2 border-dashed border-zinc-700 text-zinc-600 text-[10px] text-center px-8 uppercase">
                Awaiting SDP Generation...
              </div>
            )}
          </div>

          <button
            onClick={() => (isCommandNode ? generateOffer() : null)}
            disabled={!isCommandNode || !!localSDP}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-100 text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            Generate {isCommandNode ? "Offer" : "Answer"}
          </button>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <span className="text-[10px] uppercase text-zinc-500 font-bold">
            {isCommandNode ? "2. Scan Answer" : "1. Scan Offer"}
          </span>

          <div
            id="qr-reader"
            className={`w-full aspect-square border-2 border-zinc-800 bg-black relative overflow-hidden ${!isScanning && "flex items-center justify-center"}`}
          >
            {!isScanning && (
              <button
                onClick={() => setIsScanning(true)}
                className="px-6 py-2 border border-zinc-600 text-zinc-400 hover:text-zinc-100 hover:border-zinc-400 text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                Activate Scanner
              </button>
            )}
            {isScanning && (
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-scan z-10" />
            )}
          </div>

          <p className="text-[9px] text-zinc-600 uppercase text-center leading-relaxed max-w-[200px]">
            Align peer device QR code within the frame for optical
            synchronization.
          </p>
        </div>
      </div>
    </div>
  );
}
