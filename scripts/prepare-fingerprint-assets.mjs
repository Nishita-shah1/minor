import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { splitFirstConvolution } from "./trustmark-split-convolution.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "lib/fingerprint/trustmark/manifest.json"), "utf8"));
const runtime = JSON.parse(await readFile(path.join(root, "node_modules/onnxruntime-web/package.json"), "utf8"));
if (runtime.version !== manifest.onnxRuntimeVersion) throw new Error("ONNX Runtime version does not match the profile");
const modelDir = path.join(root, "public/fingerprint-assets", manifest.profileId);
await mkdir(modelDir, { recursive: true });
for (const model of Object.values(manifest.models)) {
  const target = path.join(modelDir, model.file);
  const valid = (bytes) => bytes.length === model.bytes && createHash("sha256").update(bytes).digest("hex") === model.sha256;
  let existing;
  try { existing = await readFile(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing && valid(existing)) { console.log(`Verified ${model.file}`); continue; }
  const source = model.source ?? model;
  const response = await fetch(new URL(source.file, manifest.modelBaseUrl), { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);
  const original = Buffer.from(await response.arrayBuffer());
  if (original.length !== source.bytes || createHash("sha256").update(original).digest("hex") !== source.sha256) throw new Error("Upstream model checksum mismatch");
  if (model.derivation && model.derivation !== "split-first-convolution-3-plus-3-v1") throw new Error("Unknown model derivation");
  const bytes = model.derivation ? splitFirstConvolution(original) : original;
  if (!valid(bytes)) throw new Error(`Checksum mismatch for ${model.file}; refusing unpinned model`);
  const temporary = `${target}.${process.pid}.tmp`;
  try { await writeFile(temporary, bytes); await rename(temporary, target); }
  finally { await rm(temporary, { force: true }); }
  console.log(`Prepared ${model.file}`);
}
const runtimeDir = path.join(root, "public/fingerprint-assets", `ort-${runtime.version}`);
await mkdir(runtimeDir, { recursive: true });
for (const file of ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm",
  "ort-wasm-simd-threaded.jspi.mjs", "ort-wasm-simd-threaded.jspi.wasm",
  "ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
  await copyFile(path.join(root, "node_modules/onnxruntime-web/dist", file), path.join(runtimeDir, file));
}
await copyFile(path.join(root, "licenses/trustmark/LICENSE"), path.join(modelDir, "LICENSE"));
await copyFile(path.join(root, "licenses/onnxruntime/LICENSE"), path.join(runtimeDir, "LICENSE"));
console.log("Experimental assets ready; this does not qualify the profile.");
