"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraSecurityMachine, type CameraSecurityStatus, type CameraTransition } from "@/lib/camera/security-machine";
import { BrowserYuNetDetector } from "@/lib/camera/worker-client";

type CameraSession = {
  id: string;
  stream: MediaStream;
  video: HTMLVideoElement;
  detector: BrowserYuNetDetector;
  timer: ReturnType<typeof setInterval>;
  frameCallback?: number;
  lastFrameAt: number;
  lastCheckAt: number;
  lastFrameCount: number;
  busy: boolean;
  watchdogTripped: boolean;
  muted: boolean;
  ended: boolean;
};

export function useCameraSecurity(shareId: string, onLock: () => void, onVerified: () => void) {
  const [status, setStatus] = useState<CameraSecurityStatus>("verifying");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<"webgpu" | "wasm" | null>(null);
  const [starting, setStarting] = useState(false);
  const machine = useRef(new CameraSecurityMachine());
  const session = useRef<CameraSession | null>(null);
  const statusRef = useRef<CameraSecurityStatus>("verifying");
  const lockRef = useRef(onLock);
  const verifiedRef = useRef(onVerified);
  const startingRef = useRef(false);
  const epochRef = useRef(0);
  useEffect(() => { lockRef.current = onLock; verifiedRef.current = onVerified; }, [onLock, onVerified]);

  const emit = useCallback((transition: CameraTransition, id: string) => {
    statusRef.current = transition.status;
    setStatus(transition.status);
    if (transition.events.some(event => event.type === "VIEWER_LOCKED")) lockRef.current();
    if (transition.status === "verified" && transition.events.some(event => event.type === "FACE_VERIFIED")) verifiedRef.current();
    for (const event of transition.events) {
      void fetch(`/api/shares/${shareId}/events`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: event.type, sessionId: id, durationMs: event.durationMs }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [shareId]);

  const stop = useCallback(() => {
    epochRef.current++;
    startingRef.current = false;
    setStarting(false);
    const active = session.current;
    session.current = null;
    if (active) {
      clearInterval(active.timer);
      if (active.frameCallback !== undefined) active.video.cancelVideoFrameCallback?.(active.frameCallback);
      active.detector.dispose();
      active.stream.getTracks().forEach(track => track.stop());
      active.video.pause(); active.video.srcObject = null;
    }
    setStream(null);
    machine.current = new CameraSecurityMachine();
    statusRef.current = "verifying";
    setStatus("verifying");
  }, []);

  const start = useCallback(async () => {
    if (session.current || startingRef.current) return;
    startingRef.current = true; setStarting(true);
    const epoch = epochRef.current;
    setError(""); setProvider(null);
    machine.current = new CameraSecurityMachine();
    statusRef.current = "verifying"; setStatus("verifying");
    let acquired: MediaStream | null = null;
    let detector: BrowserYuNetDetector | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw new Error("Camera access requires a secure browser connection.");
      acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (epoch !== epochRef.current) throw new Error("Camera start was cancelled.");
      const track = acquired.getVideoTracks()[0];
      if (!track || track.readyState !== "live") throw new Error("Camera is unavailable.");
      detector = new BrowserYuNetDetector();
      const info = await detector.initialize();
      if (epoch !== epochRef.current) throw new Error("Camera start was cancelled.");
      if (track.readyState !== "live") throw new Error("Camera disconnected before verification.");
      const video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.autoplay = true; video.srcObject = acquired;
      await video.play();
      if (epoch !== epochRef.current) throw new Error("Camera start was cancelled.");
      const supportsFrameCallback = typeof video.requestVideoFrameCallback === "function";
      if (!supportsFrameCallback && typeof video.getVideoPlaybackQuality !== "function")
        throw new Error("This browser cannot confirm that camera frames are advancing.");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Camera frame processing is unavailable.");
      const active: CameraSession = {
        id: crypto.randomUUID(), stream: acquired, video, detector,
        timer: undefined as unknown as ReturnType<typeof setInterval>, lastFrameAt: performance.now(), lastCheckAt: performance.now(), lastFrameCount: -1,
        busy: false, watchdogTripped: false, muted: track.muted, ended: false,
      };
      session.current = active;
      setStream(acquired); setProvider(info.provider ?? null);
      track.addEventListener("ended", () => {
        if (session.current !== active) return;
        active.ended = true;
        emit(machine.current.observe({ now: performance.now(), faceCount: 0, trackEnded: true }), active.id);
      });
      track.addEventListener("mute", () => { active.muted = true; });
      track.addEventListener("unmute", () => { active.muted = false; active.lastFrameAt = performance.now(); });
      if (supportsFrameCallback) {
        const observeFrame = () => {
          if (session.current !== active) return;
          active.lastFrameAt = performance.now();
          active.frameCallback = video.requestVideoFrameCallback(observeFrame);
        };
        active.frameCallback = video.requestVideoFrameCallback(observeFrame);
      }
      active.timer = setInterval(async () => {
        if (session.current !== active) return;
        const now = performance.now();
        if (active.busy) {
          const maxCheckGap = statusRef.current === "verifying" ? 10000 : 1500;
          if (!active.watchdogTripped && now - active.lastCheckAt >= maxCheckGap) {
            active.watchdogTripped = true;
            setError("Camera checks stopped responding. Wait for a fresh verification or restart the camera.");
            emit(machine.current.lock(), active.id);
          }
          return;
        }
        if (active.ended || track.readyState !== "live") {
          emit(machine.current.observe({ now, faceCount: 0, trackEnded: true }), active.id); return;
        }
        if (!supportsFrameCallback) {
          const frames = video.getVideoPlaybackQuality().totalVideoFrames;
          if (frames !== active.lastFrameCount) { active.lastFrameCount = frames; active.lastFrameAt = now; }
        }
        if (active.muted) {
          emit(machine.current.observe({ now, faceCount: 0, muted: true }), active.id); return;
        }
        if (now - active.lastFrameAt >= 1500) {
          emit(machine.current.observe({ now, faceCount: 0, stalled: true }), active.id); return;
        }
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        active.busy = true;
        try {
          context.drawImage(video, 0, 0, 320, 320);
          const frame = context.getImageData(0, 0, 320, 320).data;
          const result = await detector!.detect(frame);
          if (session.current !== active) return;
          active.lastCheckAt = performance.now(); active.watchdogTripped = false; setError("");
          if (result.provider) setProvider(result.provider);
          emit(machine.current.observe({ now: performance.now(), faceCount: result.count ?? 0, obscured: result.obscured }), active.id);
        } catch (cause) {
          if (session.current !== active) return;
          setError(cause instanceof Error ? cause.message : "Face detection failed.");
          emit(machine.current.lock(), active.id);
        } finally { active.busy = false; }
      }, 250);
    } catch (cause) {
      if (session.current?.stream === acquired) {
        clearInterval(session.current.timer);
        if (session.current.frameCallback !== undefined) session.current.video.cancelVideoFrameCallback?.(session.current.frameCallback);
        session.current = null;
        setStream(null);
      }
      acquired?.getTracks().forEach(track => track.stop());
      detector?.dispose();
      if (epoch === epochRef.current) setError(cause instanceof Error ? cause.message : "Camera could not be started.");
    } finally { if (epoch === epochRef.current) { startingRef.current = false; setStarting(false); } }
  }, [emit]);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    const onVisibility = () => {
      const active = session.current;
      if (document.hidden && active) emit(machine.current.lock(), active.id);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [emit]);

  return { status, stream, error, provider, starting, start, stop, isVerified: () => statusRef.current === "verified" };
}
