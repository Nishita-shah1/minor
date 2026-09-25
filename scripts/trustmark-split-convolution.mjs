// Build-time graph rewrite for the hash-pinned Q encoder only. No new learned weights.
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
// The parser ships with our exactly pinned ONNX Runtime dependency.
const { onnx } = require(path.join(path.dirname(require.resolve("onnxruntime-web")), "../lib/onnxjs/ort-schema/protobuf/onnx.js"));

export function splitFirstConvolution(bytes) {
  const model = onnx.ModelProto.decode(bytes);
  const graph = model.graph;
  const matches = graph.node.filter((node) => node.name === "/pre/conv/Conv");
  if (matches.length !== 1) throw new Error("Expected exactly one Q input convolution");
  const original = matches[0];
  const weight = graph.initializer.find((tensor) => tensor.name === original.input[1]);
  if (original.opType !== "Conv" || original.input.length !== 3 || original.output.length !== 1 ||
      !weight || weight.dataType !== 10 || weight.dims.map(Number).join() !== "32,6,3,3" || weight.rawData.length !== 3456) {
    throw new Error("Unexpected Q input convolution weights");
  }
  const prefix = "echoleaks_split3_v1";
  const halves = [0, 1].map((half) => {
    const rawData = Buffer.alloc(32 * 3 * 3 * 3 * 2);
    for (let output = 0; output < 32; output++) {
      const start = (output * 6 + half * 3) * 3 * 3 * 2;
      Buffer.from(weight.rawData.subarray(start, start + 54)).copy(rawData, output * 54);
    }
    const name = `${prefix}_weight_${half}`;
    graph.initializer.push(onnx.TensorProto.create({ name, dataType: 10, dims: [32, 3, 3, 3], rawData }));
    return onnx.NodeProto.create({ name: `${prefix}_conv_${half}`, opType: "Conv",
      input: [`${prefix}_input_${half}`, name, ...(half === 0 ? [original.input[2]] : [])],
      output: [`${prefix}_output_${half}`], attribute: original.attribute });
  });
  const replacement = [
    onnx.NodeProto.create({ name: `${prefix}_split`, opType: "Split", input: [original.input[0]],
      output: [`${prefix}_input_0`, `${prefix}_input_1`],
      attribute: [onnx.AttributeProto.create({ name: "axis", type: 2, i: 1 })] }),
    ...halves,
    onnx.NodeProto.create({ name: `${prefix}_sum`, opType: "Add",
      input: [`${prefix}_output_0`, `${prefix}_output_1`], output: original.output }),
  ];
  graph.node.splice(graph.node.indexOf(original), 1, ...replacement);
  // Preserve all original tensors, including the now-unused weight, for source provenance.
  return Buffer.from(onnx.ModelProto.encode(model).finish());
}
