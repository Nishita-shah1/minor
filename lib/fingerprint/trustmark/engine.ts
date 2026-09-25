/// <reference types="@webgpu/types" />
import * as ort from "onnxruntime-web/webgpu";
import type { DecodeResult, FingerprintEngine, Pixels, RuntimeInfo } from "../types";
import manifest from "./manifest.json";
import { decodePacket, encodePacket } from "./bch";
import { applyResidual, modelInput } from "./pixels";

export class TrustMarkEngine implements FingerprintEngine {
  private encoder?: ort.InferenceSession;
  private decoder?: ort.InferenceSession;
  private device?: GPUDevice;
  private lost = false;
  private disposed = false;

  constructor(private readonly onDeviceLost: () => void) {}

  async initialize(mode: "encode" | "decode"): Promise<RuntimeInfo> {
    if (this.disposed || this.lost) throw new Error("Fingerprint engine unavailable; reopen the lab");
    if (!this.device) {
      if (!globalThis.isSecureContext || !navigator.gpu) throw new Error("WebGPU requires a supported desktop browser and a secure context");
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter is available");
      if (!adapter.features.has("shader-f16")) throw new Error("This experimental model requires WebGPU shader-f16");
      this.device = await adapter.requestDevice({ requiredFeatures: ["shader-f16"], requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      } });
      void this.device.lost.then(() => {
        this.lost = true;
        if (!this.disposed) this.onDeviceLost();
      });
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = `/fingerprint-assets/ort-${manifest.onnxRuntimeVersion}/`;
      ort.env.webgpu.device = this.device;
    }
    if (mode === "encode" && !this.encoder) this.encoder = await this.loadModel("encoder");
    if (mode === "decode" && !this.decoder) this.decoder = await this.loadModel("decoder");
    if (this.lost) throw new Error("GPU device was lost during initialization");
    return { provider: "webgpu", profile: manifest.profileId, qualified: false };
  }

  private async loadModel(kind: "encoder" | "decoder") {
    const model = manifest.models[kind];
    const response = await fetch(`/fingerprint-assets/${manifest.profileId}/${model.file}`);
    if (!response.ok) throw new Error("Model assets unavailable. Run npm run fingerprint:assets first.");
    const bytes = await response.arrayBuffer();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) => x.toString(16).padStart(2, "0")).join("");
    if (bytes.byteLength !== model.bytes || digest !== model.sha256) throw new Error("Model integrity verification failed");
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" });
    const inputs = kind === "encoder" ? ["onnx::Concat_0", "onnx::Gemm_1"] : ["image"];
    const output = kind === "encoder" ? "image" : "output";
    if (inputs.some((name) => !session.inputNames.includes(name)) || !session.outputNames.includes(output)) {
      await session.release();
      throw new Error("Unexpected TrustMark model interface");
    }
    return session;
  }

  async encode(pixels: Pixels, identifier: Uint8Array, strength: number): Promise<Pixels> {
    const input = modelInput(pixels);
    const packet = encodePacket(identifier);
    if (![0.8, 1, 1.25, 1.5].includes(strength)) throw new Error("Unsupported experiment strength");
    await this.initialize("encode");
    const image = new ort.Tensor("float32", input, [1, 3, 256, 256]);
    const bits = new ort.Tensor("float32", Float32Array.from(packet), [1, 100]);
    let result: ort.InferenceSession.ReturnType | undefined;
    try {
      result = await this.encoder!.run({ "onnx::Concat_0": image, "onnx::Gemm_1": bits });
      if (this.lost || this.disposed) throw new Error("GPU unavailable");
      if (result.image.type !== "float32") throw new Error("Unexpected encoder output type");
      return applyResidual(pixels, input, result.image.data as Float32Array, strength);
    } finally {
      image.dispose(); bits.dispose();
      if (result) Object.values(result).forEach((tensor) => tensor.dispose());
    }
  }

  async decode(pixels: Pixels): Promise<DecodeResult> {
    const input = modelInput(pixels);
    await this.initialize("decode");
    const image = new ort.Tensor("float32", input, [1, 3, 256, 256]);
    let result: ort.InferenceSession.ReturnType | undefined;
    try {
      result = await this.decoder!.run({ image });
      if (this.lost || this.disposed) throw new Error("GPU unavailable");
      if (result.output.type !== "float32") throw new Error("Unexpected decoder output type");
      const logits = result.output.data as Float32Array;
      if (logits.length !== 100 || logits.some((x) => !Number.isFinite(x))) throw new Error("Invalid decoder output");
      const decoded = decodePacket(Uint8Array.from(logits, (x) => x >= 0 ? 1 : 0));
      return decoded ? { status: "VALID_IDENTIFIER", ...decoded } : { status: "NO_RELIABLE_MARK" };
    } finally {
      image.dispose();
      if (result) Object.values(result).forEach((tensor) => tensor.dispose());
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    try { await Promise.allSettled([this.encoder?.release(), this.decoder?.release()]); }
    finally { this.encoder = undefined; this.decoder = undefined; this.device?.destroy(); }
  }
}
