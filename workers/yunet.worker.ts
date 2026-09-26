/// <reference lib="webworker" />
import * as ort from "onnxruntime-web/webgpu";
import { countYuNetFaces, webcamTensor, type YuNetOutputs } from "@/lib/camera/yunet-detector";

const MODEL_URL = "/camera-assets/face_detection_yunet_2026may.onnx";
const MODEL_SHA256 = "ebafce4e3c118d6554634be5c27ab333b4c047a9a8c3faf1d7cf93101c22f0f0";
let model: Uint8Array | null = null;
let session: ort.InferenceSession | null = null;
let provider: "webgpu" | "wasm" | null = null;

type Request = { id: string; operation: "init" } | { id: string; operation: "detect"; frame: Uint8ClampedArray };

async function start() {
  if (session) return provider;
  const response = await fetch(MODEL_URL, { cache: "force-cache" });
  if (!response.ok) throw new Error("Local face model is unavailable.");
  model = new Uint8Array(await response.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", model.buffer as ArrayBuffer);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== MODEL_SHA256) throw new Error("Local face model checksum mismatch.");
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = "/camera-assets/runtime/";
  try {
    session = await ort.InferenceSession.create(model, { executionProviders: ["webgpu"] });
    provider = "webgpu";
  } catch {
    session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    provider = "wasm";
  }
  return provider;
}

async function detect(frame: Uint8ClampedArray) {
  await start();
  const { data, obscured } = webcamTensor(frame);
  if (obscured) return { count: 0, obscured, provider };
  const input = new ort.Tensor("float32", data, [1, 3, 320, 320]);
  let result: ort.InferenceSession.ReturnType;
  try { result = await session!.run({ input }); }
  catch (error) {
    if (provider !== "webgpu" || !model) throw error;
    try { await session?.release(); } catch { /* A failed WebGPU session must not block the CPU fallback. */ }
    session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    provider = "wasm";
    result = await session.run({ input });
  }
  return { count: countYuNetFaces(result as YuNetOutputs), obscured: false, provider };
}

self.onmessage = async ({ data }: MessageEvent<Request>) => {
  try {
    const result = data.operation === "init" ? { provider: await start() } : await detect(data.frame);
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : "Camera face check failed." });
  }
};
