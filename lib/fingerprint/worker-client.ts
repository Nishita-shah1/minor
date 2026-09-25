import type { FingerprintEngine, Pixels } from "./types";
import type { WorkerOperation, WorkerResponse, WorkerResult } from "./worker-protocol";

export class BrowserFingerprintEngine implements FingerprintEngine {
  private worker?: Worker;
  private pending?: { id: string; resolve: (value: WorkerResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  constructor(private readonly onFailure: (message: string) => void = () => {}) {}

  private send(operation: WorkerOperation): Promise<WorkerResult> {
    if (this.pending) return Promise.reject(new Error("Fingerprint engine is busy"));
    if (!this.worker) {
      this.worker = new Worker(new URL("../../workers/fingerprint.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if ("error" in data && data.id === null) { this.cancel(data.error); this.onFailure(data.error); return; }
        if (this.pending?.id !== data.id) return;
        const pending = this.pending;
        clearTimeout(pending.timer);
        this.pending = undefined;
        if ("error" in data) pending.reject(new Error(data.error));
        else pending.resolve(data.result);
      };
      this.worker.onerror = () => { this.cancel("Fingerprint worker failed"); this.onFailure("Fingerprint worker failed"); };
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject, timer: setTimeout(() => this.cancel("Fingerprint operation timed out"), 180_000) };
      try {
        this.worker!.postMessage({ ...operation, id }); // Caller retains the clean source.
      } catch (error) {
        this.cancel(error instanceof Error ? error.message : "Worker message failed");
      }
    });
  }
  async initialize(mode: "encode" | "decode") {
    const result = await this.send({ operation: "initialize", mode });
    if (result.kind !== "runtime") throw new Error("Unexpected engine response");
    return result.value;
  }
  async encode(pixels: Pixels, identifier: Uint8Array, strength: number) {
    const result = await this.send({ operation: "encode", pixels, identifier, strength });
    if (result.kind !== "pixels") throw new Error("Unexpected engine response");
    return result.value;
  }
  async decode(pixels: Pixels) {
    const result = await this.send({ operation: "decode", pixels });
    if (result.kind !== "decoded") throw new Error("Unexpected engine response");
    return result.value;
  }
  cancel(reason = "Fingerprint operation cancelled") {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error(reason)); this.pending = undefined; }
    this.worker?.terminate();
    this.worker = undefined;
  }
  async dispose() {
    if (this.worker && !this.pending) {
      try { await this.send({ operation: "dispose" }); } finally { this.cancel(); }
    } else this.cancel();
  }
}
