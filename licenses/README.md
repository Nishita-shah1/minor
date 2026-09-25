# Fingerprint experiment provenance

- `trustmark/LICENSE`: Adobe TrustMark MIT license from upstream revision `2ecb73ad28d1a3f66ac9dc19e1b667711f14314f`. The pinned Q model artifact URLs, byte lengths and SHA-256 hashes are in `lib/fingerprint/trustmark/manifest.json`.
- `onnxruntime/LICENSE`: MIT license from `https://raw.githubusercontent.com/microsoft/onnxruntime/v1.30.0/LICENSE`. ONNX Runtime Web is pinned to 1.30.0 in the package lock.
- BCH golden-vector provenance, upstream Python source hash, bit layout and reference verification details are in `lib/fingerprint/trustmark/fixtures/bch-super.json`. The TypeScript BCH implementation is an independent algebraic implementation.

The experimental v2 encoder is a derived ONNX graph: `scripts/trustmark-split-convolution.mjs` splits the first convolution into two channel groups and sums them with one bias. Learned weights are unchanged. Both original and derived hashes are pinned; the original license is retained.

The asset preparation script includes the corresponding license alongside downloaded models and copied runtime assets. No production profile is qualified.
