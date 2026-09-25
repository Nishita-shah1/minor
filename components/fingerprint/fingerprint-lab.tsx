"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserFingerprintEngine } from "@/lib/fingerprint/worker-client";
import { identifierHex } from "@/lib/fingerprint/identity";
import { renderLocalFile, syntheticPage } from "@/lib/fingerprint/lab/render";
import type { Pixels } from "@/lib/fingerprint/types";

const button = "rounded-full border-2 border-black bg-primary px-5 py-2 font-bold shadow-md disabled:opacity-40";

export function FingerprintLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<Pixels | null>(null);
  const engine = useRef<BrowserFingerprintEngine | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [marked, setMarked] = useState(false);
  const [identifier, setIdentifier] = useState("0123456789");
  const [strength, setStrength] = useState(1);
  const [status, setStatus] = useState("Load a non-confidential fixture or create the public sample.");

  useEffect(() => {
    const epoch = generation;
    const localEngine = new BrowserFingerprintEngine((message) => {
      epoch.current++;
      if (canvas.current) canvas.current.width = canvas.current.height = 0;
      setMarked(false); setBusy(false); setStatus(message);
    });
    engine.current = localEngine;
    return () => { epoch.current++; localEngine.cancel(); source.current = null; };
  }, []);

  function clearOutput() {
    if (canvas.current) canvas.current.width = canvas.current.height = 0;
    setMarked(false);
  }

  async function run(action: (current: () => boolean) => Promise<void>) {
    const operation = ++generation.current;
    setBusy(true);
    try { await action(() => generation.current === operation); }
    catch (error) {
      if (generation.current === operation) { clearOutput(); setStatus(error instanceof Error ? error.message : "Experiment failed"); }
    } finally { if (generation.current === operation) setBusy(false); }
  }

  function loadSample() {
    clearOutput(); source.current = syntheticPage(); setLoaded(true);
    setStatus("Public fixture loaded privately. Encode to display marked pixels.");
  }

  async function encode() {
    clearOutput();
    await run(async (current) => {
      if (!source.current || !engine.current) throw new Error("Load a fixture first");
      if (!/^[a-f0-9]{10}$/i.test(identifier)) throw new Error("Enter exactly ten hexadecimal characters");
      setStatus("Checking WebGPU and encoding locally…");
      const token = Uint8Array.from(identifier.match(/../g)!, (x) => parseInt(x, 16));
      const start = performance.now();
      const pixels = await engine.current.encode(source.current, token, strength);
      if (!current() || !canvas.current) return;
      canvas.current.width = pixels.width; canvas.current.height = pixels.height;
      const context = canvas.current.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable");
      context.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
      setMarked(true);
      setStatus(`Encoded on WebGPU in ${(performance.now() - start).toFixed(0)} ms. Recovery has not yet been checked.`);
    });
  }

  async function decode(pixels: Pixels, current: () => boolean) {
    if (!engine.current) throw new Error("Engine unavailable");
    setStatus("Decoding image pixels locally…");
    const start = performance.now();
    const result = await engine.current.decode(pixels); // No expected identifier is sent to the decoder.
    if (!current()) return;
    setStatus(result.status === "VALID_IDENTIFIER"
      ? `Recovered identifier: ${identifierHex(result.identifier)} · corrected bits: ${result.correctedBits} · ${(performance.now() - start).toFixed(0)} ms. This is a lab identifier, not recipient attribution.`
      : "NO_RELIABLE_MARK — no valid identifier recovered. No recipient can be named.");
  }

  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <header className="rounded-xl border-[3px] border-black bg-card p-6 shadow-lg">
      <p className="font-bold">DEVELOPMENT LAB · UNQUALIFIED PROFILE</p>
      <h1 className="mt-2 font-head text-3xl">TrustMark screenshot experiment</h1>
      <p className="mt-3">Local PDF/image pixels → low-visibility fingerprint → local recovery. This is ticket 1, not the protected sharing feature. No screenshot or photo recovery claim has passed qualification.</p>
      <p className="mt-2 text-sm">Use public fixtures only. Models are downloaded from this app; document and evidence pixels stay in your browser. PDF input currently renders page 1.</p>
    </header>
    <section className="space-y-4 rounded-xl border-[3px] border-black bg-card p-6 shadow-md">
      <div className="flex flex-wrap gap-3">
        <button className={button} disabled={busy} onClick={loadSample}>Load public sample</button>
        <label className="rounded-lg border-2 border-black p-3">Original PDF or image
          <input aria-label="Original fixture" className="ml-3 max-w-full" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = "";
            if (!file) return;
            clearOutput(); source.current = null; setLoaded(false);
            void run(async (current) => { const pixels = await renderLocalFile(file); if (current()) { source.current = pixels; setLoaded(true); setStatus("Fixture loaded privately. Encode to display marked pixels."); } });
          }} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label>Lab identifier (40 bits)<input className="ml-2 rounded-lg border-2 border-black px-3 py-2 font-mono" aria-label="Lab identifier" maxLength={10} value={identifier} disabled={busy} onChange={(e) => { setIdentifier(e.target.value); clearOutput(); }} /></label>
        <label>Strength<select className="ml-2 rounded-lg border-2 border-black p-2" value={strength} disabled={busy} onChange={(e) => { setStrength(Number(e.target.value)); clearOutput(); }}>{[0.8, 1, 1.25, 1.5].map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <button className={button} disabled={busy || !loaded} onClick={() => void encode()}>Encode fixture</button>
        <button className={button} disabled={busy || !marked} onClick={() => void run(async (current) => {
          const node = canvas.current, context = node?.getContext("2d");
          if (!node || !context) throw new Error("No marked canvas");
          await decode(context.getImageData(0, 0, node.width, node.height), current);
        })}>Decode marked canvas</button>
        <button className={button} onClick={() => { generation.current++; engine.current?.cancel(); source.current = null; clearOutput(); setBusy(false); setLoaded(false); setStatus("Reset: worker terminated and page buffers released."); }}>Cancel / reset</button>
      </div>
      <label className="block rounded-lg border-2 border-black p-3">Independent screenshot or unmarked image
        <input aria-label="Evidence image" className="ml-3 max-w-full" type="file" accept="image/png,image/jpeg" disabled={busy} onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (file) void run(async (current) => { const pixels = await renderLocalFile(file); if (current()) await decode(pixels, current); });
        }} />
      </label>
      <p role="status" className="break-words rounded-lg border-2 border-black bg-background p-4 font-mono text-sm">{status}</p>
    </section>
    <section aria-label="Marked output" className="overflow-auto rounded-xl border-[3px] border-black bg-card p-4 shadow-md">
      {!marked && <p className="p-12 text-center">Covered — no completed marked output.</p>}
      <canvas ref={canvas} aria-label="Completed marked fixture" className={marked ? "mx-auto max-w-full" : "hidden"} />
    </section>
  </main>;
}
