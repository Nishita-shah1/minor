"use client";

import { useEffect, useState } from "react";

type CameraEvent = { eventType: string; createdAt: string; sessionId: string | null; durationMs: number | null };

export function CameraEventHistory({ shareId, active }: { shareId: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<CameraEvent[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open || !active) return;
    const controller = new AbortController();
    fetch(`/api/shares/${shareId}/events`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Could not load events."); return body.events as CameraEvent[]; })
      .then(setEvents).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [shareId, open, active]);
  return <div className="mt-2"><button type="button" onClick={() => { setOpen(value => !value); setMessage(""); }} className="rounded-full border-2 border-black bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm">{open ? "Hide" : "View"} camera events</button>{open && <div className="mt-2 rounded-xl border-2 border-black bg-background p-3 text-xs"><p className="font-bold">Reported by recipient browser · last 30 days</p><p className="mt-1 text-muted-foreground">These reports do not prove who used the browser.</p>{message && <p role="alert" className="mt-2 text-destructive">{message}</p>}{!message && !events.length && <p className="mt-2">No camera events reported.</p>}<ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">{events.map((event, index) => <li key={`${event.sessionId}-${event.createdAt}-${index}`} className="rounded-lg border border-black bg-card px-2 py-1">{event.eventType.replaceAll("_", " ")} · {new Date(event.createdAt).toLocaleString()}{event.durationMs != null ? ` · ${Math.round(event.durationMs / 1000)}s` : ""}</li>)}</ul></div>}</div>;
}
