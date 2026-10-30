# Vendored libraries

Everything the app runs is served from this folder; nothing is loaded from a CDN at run time.
The OCR and PDF libraries are public libraries and stay unencrypted in the published build.
They are **not** precached by the service worker: they are loaded the first time the user reads a
photo or a PDF (dynamic import), cached at run time in a separate bucket (`drip-libs-<hash>`, see
`vendor/libs.json` written by the build), and can be downloaded ahead from
Settings → "ऑफ़लाइन के लिए OCR डाउनलोड करें / Download OCR for offline use".

| Path | Library | Version | Licence | Source |
|---|---|---|---|---|
| `fflate.js` | fflate (gzip/zip) | unchanged from v1 | MIT (`fflate.LICENSE`) | npm `fflate` |
| `ocr/tesseract.esm.min.js`, `ocr/worker.min.js` | Tesseract.js | **7.0.0** | Apache-2.0 (`ocr/tesseract.js.LICENSE`) | npm `tesseract.js@7.0.0`, `dist/` |
| `ocr/core/tesseract-core-simd-lstm.wasm.js`, `ocr/core/tesseract-core-lstm.wasm.js` | Tesseract.js-core (Tesseract 5 compiled to WebAssembly, LSTM engine only; SIMD and non-SIMD builds, WebAssembly embedded in the file) | **7.0.0** | Apache-2.0 (`ocr/core/tesseract.js-core.LICENSE`) | npm `tesseract.js-core@7.0.0` |
| `ocr/lang/eng.traineddata.gz` | English model, **tessdata_fast** (`eng.traineddata`, 4,113,088 bytes, sha256 `7d4322bd2a77…170b2`), gzipped (`gzip -9 -n`) | tessdata_fast 4.x | Apache-2.0 (`ocr/lang/tessdata.LICENSE`) | PyPI `tessdata.fast-eng==1.0.0` (a packaging of tesseract-ocr/tessdata_fast) |
| `ocr/lang/hin.traineddata.gz` | Hindi model, LSTM-only integer model (`4.0.0_best_int`), gzipped | 4.0.0_best_int | Apache-2.0 (tessdata); package MIT | npm `@tesseract.js-data/hin@1.0.0` |
| `pdfjs/pdf.min.mjs`, `pdfjs/pdf.worker.min.mjs` | pdf.js (`pdfjs-dist`), **legacy** ES-module build (works on older Android WebView / Safari) | **6.4.299** | Apache-2.0 (`pdfjs/pdfjs.LICENSE`) | npm `pdfjs-dist@6.4.299`, `legacy/build/` |
| `pdfjs/wasm/jbig2.wasm`, `openjpeg.wasm`, `qcms_bg.wasm` | pdf.js image decoders (JBIG2, JPEG 2000) and colour management, used when drawing scanned pages | 6.4.299 | see `pdfjs/wasm/LICENSE_*` | npm `pdfjs-dist@6.4.299`, `wasm/` |

The Hindi "fast" model is not published on npm or PyPI, and GitHub downloads were not reachable when
these files were added, so Hindi uses the tesseract.js default (`best_int`, about the same size).
To swap in `hin.traineddata` from tesseract-ocr/tessdata_fast later: `gzip -9 -n -c hin.traineddata > ocr/lang/hin.traineddata.gz`.

## Sizes

| What | Files | On disk | Transfer (gzip) |
|---|---|---|---|
| OCR code | `tesseract.esm.min.js` + `worker.min.js` | 175 KB | 45 KB |
| OCR engine (one of the two is used: SIMD when the device supports it) | `core/*.wasm.js` | 3.9 MB each | 1.46 MB |
| English model | `lang/eng.traineddata.gz` | 1.98 MB | 1.98 MB |
| Hindi model (only with "हिंदी + English") | `lang/hin.traineddata.gz` | 1.39 MB | 1.39 MB |
| PDF reader | `pdfjs/*` (the `wasm/` decoders only when drawing pictures) | 2.3 MB | 0.55 MB (+0.16 MB) |

The **first OCR use downloads about 3.5 MB** (3,477,297 bytes: code + engine + English), plus 1.4 MB with Hindi.
The first PDF downloads about 0.55 MB. Later uses come from the cache, also offline.

## Options used

- Tesseract: `createWorker(['eng'] | ['eng', 'hin'], OEM.LSTM_ONLY, { workerPath, corePath, langPath, workerBlobURL: false, gzip: true, cacheMethod: 'none' })`,
  all paths pointing into this folder (`js/libs.js`). `corePath` names the SIMD or non-SIMD file directly
  (feature-detected in `js/libs.js`). The language data is kept by the service worker, not a second copy in IndexedDB.
- pdf.js: `isEvalSupported: false`, `useSystemFonts: true`, `wasmUrl: vendor/pdfjs/wasm/`; the worker is `pdf.worker.min.mjs`.

## Updating

Replace the files from the same npm packages (`npm pack <name>@<version>`), update this table, rebuild,
and run `npm test` (the parser tests use `pdfjs/pdf.min.mjs` in Node; the smoke test runs OCR in Chromium).
