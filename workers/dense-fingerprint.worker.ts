/// <reference lib="webworker" />
import { applyOffsets, denseOffsets } from "@/lib/fingerprint/dense/embed";
import { rankDense, type DenseCandidate, type DenseVerdict } from "@/lib/fingerprint/dense/rank";
import { applyOffsetsGpu } from "@/lib/fingerprint/dense/webgpu";
import type { Pixels, RuntimeInfo } from "@/lib/fingerprint/types";

type EmbedRequest = { operation: "embed"; id: string; pixels: Pixels; secret: Uint8Array; documentId: string; page: number };
type RankRequest = { operation: "rank"; id: string; pixels: Pixels; pages: number[]; candidates: DenseCandidate[] };
type DenseRequest = EmbedRequest | RankRequest;
type DenseResponse = { id: string; result: { kind: "pixels"; value: Pixels; runtime: RuntimeInfo } | { kind: "ranked"; value: DenseVerdict; runtime: RuntimeInfo } } | { id: string; error: string };

let busy = false;
self.onmessage = async ({ data: request }: MessageEvent<DenseRequest>) => {
  if (busy) { self.postMessage({ id: request.id, error: "DenseCrop engine is busy" } satisfies DenseResponse); return; }
  busy = true;
  try {
    if (request.operation === "embed") {
      const offset = await denseOffsets(request.pixels, request.secret, request.documentId, request.page);
      const gpu = await applyOffsetsGpu(request.pixels, offset);
      const cpu = applyOffsets(request.pixels, offset);
      const useGpu = !!gpu && gpu.data.length === cpu.data.length && gpu.data.every((value, index) => value === cpu.data[index]);
      const value = useGpu && gpu ? gpu : cpu;
      const runtime: RuntimeInfo = { provider: useGpu ? "webgpu" : "wasm", profile: "densecrop-v1", qualified: false };
      self.postMessage({ id: request.id, result: { kind: "pixels", value, runtime } } satisfies DenseResponse, [value.data.buffer]);
      return;
    }
    if (request.operation === "rank") {
      const value = await rankDense({ evidence: request.pixels, pages: request.pages, candidates: request.candidates });
      const runtime: RuntimeInfo = { provider: "wasm", profile: "densecrop-v1", qualified: false };
      self.postMessage({ id: request.id, result: { kind: "ranked", value, runtime } } satisfies DenseResponse);
      return;
    }
    const unreachable: never = request;
    throw new Error(`Unsupported DenseCrop operation: ${String(unreachable)}`);
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : "DenseCrop operation failed" } satisfies DenseResponse);
  } finally {
    if (request.operation === "embed") request.secret.fill(0);
    if (request.operation === "rank") request.candidates.forEach((candidate) => candidate.secret.fill(0));
    busy = false;
  }
};
