'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  isProcessing: boolean;
}

export default function CameraCapture({ onCapture, isProcessing }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // Target the rear camera
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      setIsActive(true);
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Camera access denied or unavailable.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsActive(false);
  }, [stream]);

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) onCapture(blob);
        }, 'image/jpeg', 0.85);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  return (
    <div className="relative group border border-zinc-800 bg-black aspect-video overflow-hidden rounded-sm">
      {!isActive ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
          <button
            onClick={startCamera}
            className="px-6 py-2 bg-zinc-100 hover:bg-white text-zinc-950 font-bold uppercase text-xs tracking-widest transition-all"
          >
            Activate Optical Intake
          </button>
          {error && <p className="text-[10px] text-red-500 uppercase px-4 text-center">{error}</p>}
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover grayscale brightness-75 contrast-125 hover:grayscale-0 transition-all duration-500"
          />
          <canvas ref={canvasRef} className="hidden" />
          
          <div className="absolute top-2 left-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
            <span className="text-[8px] text-zinc-400 font-black uppercase tracking-[0.2em]">Live Feed // ENV_FRONT</span>
          </div>

          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={captureFrame}
              disabled={isProcessing}
              className="px-8 py-3 bg-white text-zinc-950 font-black uppercase text-[10px] tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)] disabled:opacity-50"
            >
              Capture Context
            </button>
            <button
              onClick={stopCamera}
              className="px-4 py-3 bg-zinc-900/80 text-zinc-300 font-bold uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-all border border-zinc-700"
            >
              Disable
            </button>
          </div>
        </>
      )}
      
      {/* Decorative corners */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-zinc-500/30 pointer-events-none" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-zinc-500/30 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-zinc-500/30 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-zinc-500/30 pointer-events-none" />
    </div>
  );
}
