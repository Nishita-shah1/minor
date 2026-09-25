"use client";
import { useEffect, useRef } from "react";
import type { Pixels } from "@/lib/fingerprint/types";
import type { Point } from "@/lib/fingerprint/lab/alignment";

export function PixelPreview({ pixels, label, points = [], onPoint, disabled = false }: {
  pixels: Pixels; label: string; points?: readonly Point[]; onPoint?: (point: Point) => void; disabled?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    node.width = pixels.width; node.height = pixels.height;
    node.getContext("2d")?.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
    return () => { node.width = node.height = 0; };
  }, [pixels]);
  return <figure className="min-w-0 space-y-2">
    <figcaption className="text-sm font-bold">{label} · {pixels.width} × {pixels.height}</figcaption>
    <div className="relative overflow-hidden rounded-xl border-2 border-black bg-white">
      <canvas ref={canvas} aria-label={label} className="block h-auto w-full" />
      {onPoint && <button type="button" aria-label={`Select point on ${label}`} disabled={disabled || points.length === 4}
        className="absolute inset-0 h-full w-full cursor-crosshair rounded-xl focus-visible:outline-4 focus-visible:outline-primary disabled:cursor-default"
        onClick={event => { const box = event.currentTarget.getBoundingClientRect(); onPoint({ x: (event.clientX - box.left) / box.width * pixels.width, y: (event.clientY - box.top) / box.height * pixels.height }); }} />}
      {points.map((point, i) => <span key={i} aria-hidden="true" className="pointer-events-none absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-black bg-primary text-xs font-bold text-black" style={{ left: `${point.x / pixels.width * 100}%`, top: `${point.y / pixels.height * 100}%` }}>{i + 1}</span>)}
    </div>
  </figure>;
}
