# TrustMark strength

Primary sources: Adobe TrustMark FAQ and `python/CONFIG.md` in `adobe/trustmark`.

- `WM_STRENGTH` defaults to 1.0. Raising it, for example to 1.5, makes the residual easier to survive and more likely to show ripple. Lowering it toward 0.8 is quieter and still aimed at screenshots and light recompression. Decode does not take the encode strength as an input.
- EchoLeaks allows 0.8, 1, 1.25, and 1.5, then clamps the normalized residual to ±0.2 before scaling by 127.5. A headed sweep after this DenseCrop build kept 1.5: strength 1.0 lost full-page JPEG 85 and half-size JPEG, and 1.25 still lost half-size JPEG. 1.5 recovered the exact test id on the full screenshot, PNG, resizes, JPEG 85, and half-size JPEG. The protected viewer encodes at 1.5 for that reason.
- An image wider than 2:1 is center-cropped before the 256×256 residual is scaled. A very wide screenshot is presented the same way. Adobe's shortest-side guidance is about 150 px. A sliver of a large page can miss that operating region even after the crop.
- This note is not a qualification. JPEG, phone photos, and format-wide crops are still open.
