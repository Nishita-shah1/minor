"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collectDisclosedViewerContext, type DisclosedViewerContext } from "@/lib/activity/context-buckets";
import { isScreenshotShortcut } from "@/lib/activity/screenshot-shortcut";

export type ViewerObservation = {
  marked: boolean;
  visible: boolean;
  fullscreen: boolean;
  authorized: boolean;
  pageIndex: number;
};

type SessionEventType =
  | "HEARTBEAT"
  | "VISIBILITY_HIDDEN"
  | "VISIBILITY_VISIBLE"
  | "FULLSCREEN_ENTER"
  | "FULLSCREEN_EXIT"
  | "PAGE_CHANGED"
  | "SCREENSHOT_ATTEMPTED"
  | "PRINT_ATTEMPTED"
  | "COVERED"
  | "SESSION_CLOSED";

type QueuedEvent = {
  sequence: number;
  eventType: SessionEventType;
  marked: boolean;
  visible: boolean;
  fullscreen: boolean;
  authorized: boolean;
  pageIndex: number;
};

export function useViewingSession(shareId: string, documentId: string, enabled: boolean) {
  const [consented, setConsented] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const sequence = useRef(0);
  const queue = useRef<QueuedEvent[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observation = useRef<ViewerObservation>({
    marked: false,
    visible: true,
    fullscreen: false,
    authorized: false,
    pageIndex: 1,
  });
  const sessionRef = useRef<string | null>(null);
  const closed = useRef(false);
  const lastPrintAt = useRef(0);
  const lastScreenshotAt = useRef(0);

  const flush = useCallback(async () => {
    const id = sessionRef.current;
    if (!id || !queue.current.length || closed.current) return;
    const batch = queue.current.splice(0, 20);
    try {
      const response = await fetch(`/api/shares/${shareId}/sessions/${id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
      if (response.status === 409) {
        closed.current = true;
        sessionRef.current = null;
        setSessionId(null);
        setError("Viewing session expired. Reopen the protected view.");
      }
    } catch {
      queue.current.unshift(...batch);
    }
  }, [shareId]);

  const enqueue = useCallback((eventType: SessionEventType, patch?: Partial<ViewerObservation>) => {
    if (!sessionRef.current || closed.current) return;
    if (patch) observation.current = { ...observation.current, ...patch };
    const current = observation.current;
    sequence.current += 1;
    queue.current.push({
      sequence: sequence.current,
      eventType,
      marked: current.marked,
      visible: current.visible,
      fullscreen: current.fullscreen,
      authorized: current.authorized,
      pageIndex: current.pageIndex,
    });
    if (queue.current.length >= 10) void flush();
    else if (!flushTimer.current) {
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        void flush();
      }, 2000);
    }
  }, [flush]);

  const start = useCallback(async (webgpuOutcome: DisclosedViewerContext["webgpuOutcome"] = "unknown") => {
    setStarting(true);
    setError("");
    try {
      const context = collectDisclosedViewerContext(webgpuOutcome);
      const response = await fetch(`/api/shares/${shareId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, ...context }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not start viewing session.");
      closed.current = false;
      sequence.current = 0;
      queue.current = [];
      sessionRef.current = body.sessionId;
      setSessionId(body.sessionId);
      setConsented(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start viewing session.");
    } finally {
      setStarting(false);
    }
  }, [documentId, shareId]);

  const record = useCallback((eventType: SessionEventType, patch?: Partial<ViewerObservation>) => {
    enqueue(eventType, patch);
  }, [enqueue]);

  const updateObservation = useCallback((patch: Partial<ViewerObservation>) => {
    observation.current = { ...observation.current, ...patch };
  }, []);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const heartbeat = setInterval(() => {
      const current = observation.current;
      if (current.marked && current.visible && current.fullscreen && current.authorized) {
        enqueue("HEARTBEAT");
      }
    }, 15_000);
    const onPrint = () => {
      const now = Date.now();
      if (now - lastPrintAt.current < 1500) return;
      lastPrintAt.current = now;
      enqueue("PRINT_ATTEMPTED");
    };
    const onKey = (event: KeyboardEvent) => {
      if (!isScreenshotShortcut(event)) return;
      const now = Date.now();
      if (now - lastScreenshotAt.current < 1500) return;
      lastScreenshotAt.current = now;
      enqueue("SCREENSHOT_ATTEMPTED");
    };
    window.addEventListener("beforeprint", onPrint);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("beforeprint", onPrint);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
    };
  }, [enabled, sessionId, enqueue]);

  useEffect(() => () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    if (sessionRef.current && !closed.current) {
      sequence.current += 1;
      const current = observation.current;
      const payload = JSON.stringify({
        events: [{
          sequence: sequence.current,
          eventType: "SESSION_CLOSED",
          marked: current.marked,
          visible: current.visible,
          fullscreen: current.fullscreen,
          authorized: current.authorized,
          pageIndex: current.pageIndex,
        }],
      });
      try {
        void fetch(`/api/shares/${shareId}/sessions/${sessionRef.current}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      } catch {
        // Best-effort close on unmount.
      }
    }
  }, [shareId]);

  return {
    consented,
    sessionId,
    error,
    starting,
    start,
    record,
    updateObservation,
    flush,
  };
}
