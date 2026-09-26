type WorkerReply = { id: string; result?: { provider?: "webgpu" | "wasm"; count?: number; obscured?: boolean }; error?: string };

export class BrowserYuNetDetector {
  private worker = new Worker(new URL("../../workers/yunet.worker.ts", import.meta.url), { type: "module" });
  private pending = new Map<string, { resolve: (value: NonNullable<WorkerReply["result"]>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor() {
    this.worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(data.id);
      if (data.error) entry.reject(new Error(data.error));
      else if (data.result) entry.resolve(data.result);
      else entry.reject(new Error("Camera detector returned no result."));
    };
    this.worker.onerror = () => this.failAll(new Error("Camera detector stopped."));
  }

  initialize() { return this.request({ operation: "init" }, 20000); }
  detect(frame: Uint8ClampedArray) { return this.request({ operation: "detect", frame }, 10000); }

  private request(payload: { operation: "init" } | { operation: "detect"; frame: Uint8ClampedArray }, timeout: number) {
    const id = crypto.randomUUID();
    return new Promise<NonNullable<WorkerReply["result"]>>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Camera detector timed out.")); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, ...payload }, payload.operation === "detect" ? [payload.frame.buffer] : []);
    });
  }

  private failAll(error: Error) {
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    this.pending.clear();
  }

  dispose() { this.failAll(new Error("Camera detector closed.")); this.worker.terminate(); }
}
