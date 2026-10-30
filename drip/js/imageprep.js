// Photo preparation on the device: decode with the EXIF orientation applied, scale down, and make a
// greyscale, contrast-stretched copy for OCR plus a colour JPEG copy to keep in My documents.

export const OCR_MAX_SIDE = 2000;
export const KEEP_MAX_SIDE = 1600;
export const THUMB_SIDE = 320;

async function decode(blob) {
  if ('createImageBitmap' in globalThis) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* try without options */ }
    try { return await createImageBitmap(blob); } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Scale for OCR. Photos: long side at most about 2000 px. Small text (a phone screenshot, a small photo)
 * is enlarged — Tesseract reads 12 px text badly — so the short side becomes about 1800 px (at most 2.5×);
 * tall screenshots may then be up to 4200 px long.
 */
export function ocrScale(w, h) {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const maxLong = long / short >= 1.8 ? 4200 : OCR_MAX_SIDE;
  let s = Math.min(1, maxLong / long);
  if (short * s < 1000) s = Math.min(2.5, 1800 / short, maxLong / long);
  return s;
}

function canvasOf(src, maxSide, scale = null) {
  const w0 = src.width || src.naturalWidth;
  const h0 = src.height || src.naturalHeight;
  const s = scale ?? Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * s));
  c.height = Math.max(1, Math.round(h0 * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Greyscale and stretch the contrast (1st–99th percentile to 0–255), in place. */
export function greyStretch(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0;
    d[i] = y;
    hist[y]++;
  }
  const n = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < n * 0.01;) lo++;
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < n * 0.01;) hi--;
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function toBlob(canvas, type = 'image/jpeg', quality = 0.82) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** {ocr: canvas (grey), keep: Blob (JPEG ≤1600 px), thumb: data URL, width, height} */
export async function preparePhoto(blob) {
  const src = await decode(blob);
  try {
    const ocr = greyStretch(canvasOf(src, OCR_MAX_SIDE, ocrScale(src.width || src.naturalWidth, src.height || src.naturalHeight)));
    const keepC = canvasOf(src, KEEP_MAX_SIDE);
    const keep = await toBlob(keepC);
    const thumb = canvasOf(keepC, THUMB_SIDE).toDataURL('image/jpeg', 0.7);
    return { ocr, keep, thumb, width: keepC.width, height: keepC.height };
  } finally {
    src.close?.();
  }
}

/** A thumbnail data URL of a stored JPEG blob. */
export async function thumbOf(blob) {
  const src = await decode(blob);
  try { return canvasOf(src, THUMB_SIDE).toDataURL('image/jpeg', 0.7); } finally { src.close?.(); }
}
