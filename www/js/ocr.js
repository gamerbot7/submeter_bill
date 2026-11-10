/* ocr.js — fully offline meter-reading OCR using Tesseract.js (files are bundled in www/vendor by CI).
   The result is only ever a SUGGESTION: the user must confirm or correct it. */
const OCR = (() => {
  let worker = null, progressCb = null;
  const base = () => new URL('vendor/tesseract/', location.href).href.replace(/\/$/, '');

  async function init() {
    if (worker) return worker;
    if (typeof Tesseract === 'undefined') throw new Error('OCR engine files missing');
    const b = base();
    worker = await Tesseract.createWorker('eng', 1, {
      workerPath: b + '/worker.min.js',
      corePath: b + '/core',
      langPath: b + '/lang',
      gzip: true,
      workerBlobURL: false,
      cacheMethod: 'none',
      logger: m => progressCb && progressCb(m)
    });
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789.',
      tessedit_pageseg_mode: String(Tesseract.PSM.SPARSE_TEXT)
    });
    return worker;
  }

  // grayscale + contrast stretch (+ optional inversion for light-on-dark displays)
  async function prep(dataUrl, invert) {
    const img = await loadImg(dataUrl);
    const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, c.width, c.height);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = g; if (g < min) min = g; if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < d.length; i += 4) {
      let v = (d[i] - min) * 255 / range;
      if (invert) v = 255 - v;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  async function read(dataUrl, opt = {}) {
    const prev = Number(opt.prev) || 0, digits = opt.digits || 5;
    progressCb = m => { if (opt.onProgress && m && m.status) opt.onProgress(m); };
    const w = await init();
    const found = new Map();
    for (const inv of [false, true]) {
      const c = await prep(dataUrl, inv);
      const { data } = await w.recognize(c);
      const conf = data.confidence || 0;
      (data.text.match(/\d+(?:\.\d+)?/g) || []).forEach(t => {
        const dg = t.replace('.', '').length;
        if (dg < 3 || dg > 9) return;
        const v = parseFloat(t), val = String(v);
        let s = conf / 2 + Math.min(dg, digits + 1) * 4;
        if (dg === digits || dg === digits + 1) s += 15;
        if (v >= prev && v - prev < 3000) s += 25;   // plausible next reading
        const o = found.get(val);
        found.set(val, { value: val, score: (o ? o.score : 0) + s, conf: Math.round(conf) });
      });
    }
    return { list: [...found.values()].sort((a, b) => b.score - a.score).slice(0, 5) };
  }
  return { read };
})();
