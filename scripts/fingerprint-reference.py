"""Local, non-confidential interoperability probe using unmodified Adobe Python.

Install the pinned upstream source in an isolated Python environment first; see
round-trip-debugging.md. This script does not implement its own encode/decode.
"""
import argparse
import hashlib
import importlib.metadata
import inspect
import json
from pathlib import Path

import torch
from PIL import Image
from trustmark import TrustMark

parser = argparse.ArgumentParser()
parser.add_argument("--original", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--evidence", action="append", default=[], type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
torch.set_num_threads(4)
source_hash = hashlib.sha256(Path(inspect.getfile(TrustMark)).read_bytes()).hexdigest()
if source_hash != "1016f4f6f842743b2d5710c52ef38441ec3dd6b4658aae5bc05e27b17406c288":
    raise RuntimeError("Install the specified Adobe source revision before running this probe")
identifier = "0123456789"
bits = f"{int(identifier, 16):040b}"
engine = TrustMark(use_ECC=True, model_type="Q", encoding_type=TrustMark.Encoding.BCH_SUPER,
                   device="cpu", loadRemover=False)
with Image.open(args.original) as source:
    marked = engine.encode(source.convert("RGB"), bits, MODE="binary", WM_STRENGTH=1.0)
upstream = args.output / "upstream.png"
marked.save(upstream)
report = {
    "kind": "public-fixture-interoperability-only", "qualified": False,
    "identifier": identifier, "sourceSha256": source_hash,
    "packages": {name: importlib.metadata.version(name) for name in ["torch", "torchvision", "trustmark", "Pillow"]},
    "models": {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
               for path in sorted((Path(inspect.getfile(TrustMark)).parent / "models").glob("*Q.*"))},
    "cases": [],
}
for path in [upstream, *args.evidence]:
    with Image.open(path) as image:
        payload, detected, schema = engine.decode(image.convert("RGB"), MODE="binary")
    report["cases"].append({"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                            "detected": bool(detected), "schema": int(schema), "bits": payload,
                            "correct": bool(detected and payload == bits and schema == 0)})
(args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
raise SystemExit(0 if all(case["correct"] for case in report["cases"]) else 1)
