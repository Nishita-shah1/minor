import type { DecodeResult, Pixels, RuntimeInfo } from "./types";
export type WorkerOperation =
  | { operation: "initialize"; mode: "encode" | "decode" }
  | { operation: "encode"; pixels: Pixels; identifier: Uint8Array; strength: number }
  | { operation: "decode"; pixels: Pixels }
  | { operation: "dispose" };
export type WorkerRequest = WorkerOperation & { id: string };
export type WorkerResult =
  | { kind: "runtime"; value: RuntimeInfo }
  | { kind: "pixels"; value: Pixels }
  | { kind: "decoded"; value: DecodeResult }
  | { kind: "disposed" };
export type WorkerResponse = { id: string; result: WorkerResult } | { id: string | null; error: string };
