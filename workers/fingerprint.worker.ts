/// <reference lib="webworker" />
import { TrustMarkEngine } from "@/lib/fingerprint/trustmark/engine";
import type { WorkerRequest, WorkerResponse, WorkerResult } from "@/lib/fingerprint/worker-protocol";

const engine = new TrustMarkEngine(() => {
  self.postMessage({ id: null, error: "GPU device lost; marked output is unavailable" } satisfies WorkerResponse);
});
let busy = false;
self.onmessage = async ({ data: request }: MessageEvent<WorkerRequest>) => {
  if (busy) { self.postMessage({ id: request.id, error: "Fingerprint engine is busy" } satisfies WorkerResponse); return; }
  busy = true;
  try {
    let result: WorkerResult;
    switch (request.operation) {
      case "initialize": result = { kind: "runtime", value: await engine.initialize(request.mode) }; break;
      case "encode": result = { kind: "pixels", value: await engine.encode(request.pixels, request.identifier, request.strength) }; break;
      case "decode": result = { kind: "decoded", value: await engine.decode(request.pixels) }; break;
      case "dispose": await engine.dispose(); result = { kind: "disposed" }; break;
    }
    self.postMessage({ id: request.id, result } satisfies WorkerResponse,
      result.kind === "pixels" ? [result.value.data.buffer] : []);
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : "Fingerprint operation failed" } satisfies WorkerResponse);
  } finally { busy = false; }
};
