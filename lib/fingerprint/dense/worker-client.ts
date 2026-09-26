import type { Pixels, RuntimeInfo } from "../types";
import type { DenseCandidate, DenseVerdict } from "./rank";

type DenseResult = { kind: "pixels"; value: Pixels; runtime: RuntimeInfo } | { kind: "ranked"; value: DenseVerdict; runtime: RuntimeInfo };
type DenseResponse = { id: string; result: DenseResult } | { id: string; error: string };

export class DenseCropEngine {
  private worker?: Worker;
  private pending?: { id: string; resolve: (value: DenseResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  constructor(private readonly onFailure: (message: string) => void = () => {}) {}

  private send(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<DenseResult> {
    if (this.pending) return Promise.reject(new Error("DenseCrop engine is busy"));
    if (!this.worker) {
      this.worker = new Worker(new URL("../../../workers/dense-fingerprint.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }: MessageEvent<DenseResponse>) => {
        if (this.pending?.id !== data.id) return;
        const pending = this.pending;
        clearTimeout(pending.timer);
        this.pending = undefined;
        if ("error" in data) pending.reject(new Error(data.error));
        else pending.resolve(data.result);
      };
      this.worker.onerror = () => { this.cancel("DenseCrop worker failed"); this.onFailure("DenseCrop worker failed"); };
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject, timer: setTimeout(() => this.cancel("DenseCrop operation timed out"), 180_000) };
      try { this.worker!.postMessage({ ...message, id }, transfer); }
      catch (error) { this.cancel(error instanceof Error ? error.message : "DenseCrop message failed"); }
    });
  }

  async embed(pixels: Pixels, secret: Uint8Array, documentId: string, page: number) {
    const copy = new Uint8ClampedArray(pixels.data);
    const result = await this.send({ operation: "embed", pixels: { width: pixels.width, height: pixels.height, data: copy }, secret: secret.slice(), documentId, page }, [copy.buffer]);
    if (result.kind !== "pixels") throw new Error("Unexpected DenseCrop response");
    return result;
  }

  async rank(pixels: Pixels, pages: readonly number[], candidates: readonly DenseCandidate[]) {
    const copy = new Uint8ClampedArray(pixels.data);
    const result = await this.send({
      operation: "rank",
      pixels: { width: pixels.width, height: pixels.height, data: copy },
      pages: [...pages],
      candidates: candidates.map((candidate) => ({ ...candidate, secret: candidate.secret.slice() })),
    }, [copy.buffer]);
    if (result.kind !== "ranked") throw new Error("Unexpected DenseCrop response");
    return result;
  }

  cancel(reason = "DenseCrop operation cancelled") {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error(reason)); this.pending = undefined; }
    this.worker?.terminate();
    this.worker = undefined;
  }
}
