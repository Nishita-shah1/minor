"use client";

import { Camera, CameraOff } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CameraSecurityStatus } from "@/lib/camera/security-machine";

export function CameraPreview({ stream, status, className = "" }: { stream: MediaStream | null; status: CameraSecurityStatus; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className={`relative w-28 overflow-hidden rounded-2xl border-[3px] border-black bg-black text-white shadow-md print:hidden sm:w-36 ${className}`} aria-label="Your live camera preview">
    <div className="aspect-square w-full">
      {stream ? <video ref={ref} muted playsInline autoPlay className="size-full scale-x-[-1] object-cover" />
        : <div className="flex size-full items-center justify-center"><CameraOff className="size-8" /></div>}
    </div>
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/75 px-2 py-1 text-[10px] font-bold leading-tight"><Camera className="size-3 shrink-0" /> Your camera · local</div>
    <span className={`absolute right-2 top-2 size-3 rounded-full border border-black ${status === "verified" ? "bg-green-400" : status === "verifying" ? "bg-yellow-300" : "bg-red-400"}`} aria-label={`Camera ${status}`} />
  </div>;
}
