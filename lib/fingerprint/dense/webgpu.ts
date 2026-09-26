import type { Pixels } from "../types";

const shader = `
@group(0) @binding(0) var<storage, read> src: array<u32>;
@group(0) @binding(1) var<storage, read> offset: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;

fn channel(pixel: u32, shift: u32) -> f32 { return f32((pixel >> shift) & 0xffu); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= arrayLength(&offset)) { return; }
  let pixel = src[index];
  let delta = offset[index];
  let red = u32(clamp(round(channel(pixel, 0u) + delta), 0.0, 255.0));
  let green = u32(clamp(round(channel(pixel, 8u) + delta), 0.0, 255.0));
  let blue = u32(clamp(round(channel(pixel, 16u) + delta), 0.0, 255.0));
  let alpha = (pixel >> 24u) & 0xffu;
  dst[index] = red | (green << 8u) | (blue << 16u) | (alpha << 24u);
}
`;

export async function applyOffsetsGpu(pixels: Pixels, offset: Float32Array): Promise<Pixels | null> {
  const gpu = globalThis.navigator?.gpu;
  if (!gpu) return null;
  const adapter = await gpu.requestAdapter().catch(() => null);
  if (!adapter) return null;
  const device = await adapter.requestDevice().catch(() => null);
  if (!device) return null;
  try {
    const count = offset.length;
    const shaderModule = device.createShaderModule({ code: shader });
    const pipeline = device.createComputePipeline({ layout: "auto", compute: { module: shaderModule, entryPoint: "main" } });
    const bytes = Uint8Array.from(pixels.data);
    const source = new Uint32Array(bytes.buffer);
    const offsetCopy = Float32Array.from(offset);
    const src = device.createBuffer({ size: source.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const offsets = device.createBuffer({ size: offset.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const dst = device.createBuffer({ size: source.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const read = device.createBuffer({ size: source.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    device.queue.writeBuffer(src, 0, source);
    device.queue.writeBuffer(offsets, 0, offsetCopy);
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: src } },
      { binding: 1, resource: { buffer: offsets } },
      { binding: 2, resource: { buffer: dst } },
    ] });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(count / 64));
    pass.end();
    encoder.copyBufferToBuffer(dst, 0, read, 0, source.byteLength);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const packed = new Uint32Array(read.getMappedRange()).slice();
    read.unmap();
    const data = new Uint8ClampedArray(packed.buffer);
    return { width: pixels.width, height: pixels.height, data };
  } catch {
    return null;
  } finally {
    device.destroy();
  }
}
