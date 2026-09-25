export type Pixels = { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> };
export type DecodeResult =
  | { status: "VALID_IDENTIFIER"; identifier: Uint8Array<ArrayBuffer>; correctedBits: number }
  | { status: "NO_RELIABLE_MARK" };
export type RuntimeInfo = { provider: "webgpu" | "wasm"; profile: string; qualified: false };
export interface FingerprintEngine {
  initialize(mode: "encode" | "decode"): Promise<RuntimeInfo>;
  encode(pixels: Pixels, identifier: Uint8Array, strength: number): Promise<Pixels>;
  decode(pixels: Pixels): Promise<DecodeResult>;
  dispose(): Promise<void>;
}
