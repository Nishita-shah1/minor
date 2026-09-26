import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtime = JSON.parse(await readFile(path.join(root, "node_modules/onnxruntime-web/package.json"), "utf8"));
if (runtime.version !== "1.30.0") throw new Error("Camera runtime version must remain pinned to 1.30.0.");
const target = path.join(root, "public/camera-assets/runtime");
await mkdir(target, { recursive: true });
for (const suffix of ["asyncify", "jspi", "jsep"]) {
  for (const extension of ["mjs", "wasm"]) {
    const name = `ort-wasm-simd-threaded.${suffix}.${extension}`;
    await copyFile(path.join(root, "node_modules/onnxruntime-web/dist", name), path.join(target, name));
  }
}
