# Try Scan locally

Open `/dashboard/scan` while signed in. The route now supports local PNG/JPEG input and TrustMark decoding; it no longer displays Coming soon.

1. Expand **Create a local test copy**.
2. Choose **Use public sample**, then **Create marked test copy**.
3. Note the displayed test identifier. Choose **Save test PNG**, or capture the marked canvas.
4. Select that image under **Add a screenshot**, then choose **Analyze screenshot**.
5. Compare the recovered identifier with the test identifier. `UNKNOWN_MARK` means a compatible identifier was recovered but it did not match the loaded recipient records. Use **Find the recipient copy** to load an owned document’s encrypted copy records after unlocking your owner keys.

You can also select a local PDF (page 1 only), PNG, or JPEG as the original before creating a test copy. Existing unmarked shares cannot be retroactively traced. With experimental integration enabled, newly created shares carry encrypted copy records; see `experimental-integration.md`.

For alignment, select the clean original and screenshot, enable corresponding points, and select four matching points clockwise in both previews. **Use full-image corners** is only appropriate when both images contain the entire page. Crops need actual matching points and at least 50% observed area. Crop recovery has failed tuning cases and is not qualified.

A compatible desktop WebGPU configuration is required. Initialization and inference failures remain visible. **Cancel / clear images** releases local images and stops the worker. Evidence and decoded identifiers are not submitted for analysis.

## Developer reproduction

```sh
npm run fingerprint:assets
npm run dev
```

The asset preparation command verifies the pinned TrustMark models and copies the pinned PDF.js worker, standard fonts, character maps, and WASM assets. No inference service is deployed.

```sh
FINGERPRINT_VULKAN=1 npm run fingerprint:scan-ui
FINGERPRINT_VULKAN=1 npm run fingerprint:qualify
```

The Vulkan flag selects the diagnostic configuration used on this Linux machine; it is not a browser-wide compatibility claim. Qualification output is isolated in `.fingerprint-results/qualification/` so the normal Playwright output cleanup cannot delete a running experiment. The qualification command intentionally exits nonzero when required recovery cases fail.

Recipient lookup is experimental and requires newly fingerprinted copies. The current tool does not qualify phone photographs or establish who intentionally disclosed a document. Readability reviews and blind demonstrations still require people.

For later Vercel environment and deployment work, install the currently missing CLI with `npm i -g vercel`. Deployment and environment changes are outside this local test work.
