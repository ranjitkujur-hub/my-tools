// Module worker: parses Word, PowerPoint, Excel and text files off the main thread.
import { parseOffice } from './core/files/index.js';

self.onmessage = (e) => {
  const { id, kind, bytes } = e.data || {};
  try {
    const r = parseOffice(kind, new Uint8Array(bytes));
    self.postMessage({ id, ok: true, r });
  } catch (err) {
    self.postMessage({ id, ok: false, code: typeof err?.code === 'string' ? err.code : 'corrupt', message: err?.message || String(err) });
  }
};
