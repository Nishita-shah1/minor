"""Compare original and derived Q graphs with CPU ORT; not browser qualification."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

parser = argparse.ArgumentParser()
parser.add_argument("--original", type=Path, required=True)
parser.add_argument("--derived", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
sessions = [ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            for path in [args.original, args.derived]]
rng = np.random.default_rng(20260925)
report = {"kind": "CPU-graph-equivalence-only", "qualified": False, "ort": ort.__version__, "numpy": np.__version__,
          "hashes": {label: hashlib.sha256(path.read_bytes()).hexdigest()
                     for label, path in [("original", args.original), ("derived", args.derived)]}, "cases": []}
for label, image in [("white", np.ones((1, 3, 256, 256), dtype=np.float32)),
                     ("black", -np.ones((1, 3, 256, 256), dtype=np.float32)),
                     ("seeded-rgb", rng.uniform(-1, 1, (1, 3, 256, 256)).astype(np.float32))]:
    # Packet validity is irrelevant to graph equivalence; compare identical 100-bit inputs.
    packet = rng.integers(0, 2, (1, 100)).astype(np.float32)
    values = [session.run(["image"], {"onnx::Concat_0": image, "onnx::Gemm_1": packet})[0] for session in sessions]
    error = np.abs(values[0] - values[1])
    report["cases"].append({"name": label, "mae": float(error.mean()), "max": float(error.max()),
                            "pass": bool(np.isfinite(error).all() and error.max() < 0.00002)})
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
raise SystemExit(0 if all(case["pass"] for case in report["cases"]) else 1)
