/* coat.js - procedural textures: giraffe coat (tileable Worley patches),
 * savanna ground, grass tufts, dust puff.  All canvases - no external files,
 * so the page keeps working straight off the file system.
 */
(function (G) {
  'use strict';

  /* ---------- deterministic noise ---------- */
  function h2(i, j, s) {
    let n = (i | 0) * 374761393 + (j | 0) * 668265263 + (s | 0) * 144665;
    n = (n ^ (n >> 13)) * 1274126177; n = n ^ (n >> 16);
    return (n >>> 0) / 4294967295;
  }
  function vnoise(x, y, per, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const w = (t) => t * t * (3 - 2 * t);
    const u = w(xf), v = w(yf);
    const m = (a) => ((a % per) + per) % per;
    const a = h2(m(xi), m(yi), s), b = h2(m(xi + 1), m(yi), s),
      c = h2(m(xi), m(yi + 1), s), d = h2(m(xi + 1), m(yi + 1), s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, per, s, oct) {
    let a = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { a += amp * vnoise(x * f, y * f, per * f, s + i * 7); n += amp; amp *= 0.5; f *= 2; }
    return a / n;
  }

  /* tileable jittered-cell (Worley) field: returns f1, f2 and cell id */
  function worleyField(N, seed) {
    const pts = new Float64Array(N * N * 2), ids = new Int32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      pts[k * 2] = (i + 0.15 + 0.7 * h2(i, j, seed)) / N;
      pts[k * 2 + 1] = (j + 0.15 + 0.7 * h2(i, j, seed + 91)) / N;
      ids[k] = (h2(i, j, seed + 5) * 100000) | 0;
    }
    return { N: N, pts: pts, ids: ids, seed: seed };
  }
  function worleyAt(w, u, v) {
    const N = w.N, S = 1 / N;
    const gx = Math.floor(u * N), gy = Math.floor(v * N);
    let f1 = 9, f2 = 9, id = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      let cx = gx + di, cy = gy + dj;
      let ox = 0, oy = 0;
      if (cx < 0) { cx += N; ox = -1; } else if (cx >= N) { cx -= N; ox = 1; }
      if (cy < 0) { cy += N; oy = -1; } else if (cy >= N) { cy -= N; oy = 1; }
      const k = (cy * N + cx) * 2;
      let dx = w.pts[k] + ox - u, dy = w.pts[k + 1] + oy - v;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; id = w.ids[cy * N + cx]; }
      else if (d < f2) f2 = d;
    }
    f1 = Math.sqrt(f1); f2 = Math.sqrt(f2);
    return { f1: f1, edge: f2 - f1, id: id };
  }

  function newCanvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }
  function tex(canvas, rep) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep || 1, rep || 1);
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ------------------------------------------------------------------
   * Giraffe coat.  Reticulated/Masai hybrid: liver-coloured polygonal
   * patches separated by pale cream channels, with fur mottling.
   * ------------------------------------------------------------------ */
  function makeCoat(size) {
    size = size || 1024;
    const W = worleyField(12, 7);
    const cv = newCanvas(size), ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const bc = newCanvas(size), bctx = bc.getContext('2d');
    const bimg = bctx.createImageData(size, size);
    const cream = [238, 226, 194], patchA = [176, 114, 60], patchB = [142, 88, 46], line = [98, 68, 42];
    for (let y = 0; y < size; y++) {
      const v = (y + 0.5) / size;
      for (let x = 0; x < size; x++) {
        const u = (x + 0.5) / size;
        const w = worleyAt(W, u, v);
        /* jagged, organic borders */
        const jag = (fbm(u * 26, v * 26, 26, 3, 3) - 0.5) * 0.030 + (fbm(u * 70, v * 70, 70, 11, 2) - 0.5) * 0.010;
        const e = w.edge + jag;
        const bw = 0.024;
        const inPatch = Math.min(1, Math.max(0, (e - bw) / 0.026));
        const inLine = 1 - Math.min(1, Math.max(0, e / bw));
        /* per-patch colour variation */
        const hv = h2(w.id & 1023, (w.id >> 10) & 1023, 21);
        const hv2 = h2(w.id & 1023, (w.id >> 10) & 1023, 44);
        let pr = patchA[0] + (patchB[0] - patchA[0]) * hv,
          pg = patchA[1] + (patchB[1] - patchA[1]) * hv,
          pb = patchA[2] + (patchB[2] - patchA[2]) * hv;
        const shade = 0.96 + 0.18 * hv2;
        pr *= shade; pg *= shade; pb *= shade;
        /* cream channels, slightly mottled and wider than the dark core */
        const grain = 0.90 + 0.16 * fbm(u * 90, v * 90, 90, 61, 2);
        let r = cream[0] * (0.96 + 0.07 * hv2), g = cream[1] * (0.96 + 0.06 * hv2), b = cream[2] * (0.95 + 0.06 * hv2);
        r = r * (1 - inPatch) + pr * inPatch;
        g = g * (1 - inPatch) + pg * inPatch;
        b = b * (1 - inPatch) + pb * inPatch;
        /* dark core of the channel */
        const dl = inLine * 0.62;
        r = r * (1 - dl) + line[0] * dl; g = g * (1 - dl) + line[1] * dl; b = b * (1 - dl) + line[2] * dl;
        /* fur: fine streaks along the hair direction */
        const fur = 0.94 + 0.12 * vnoise(u * 260, v * 60, 260, 77);
        r *= fur * grain; g *= fur * grain; b *= fur * grain;
        const i = (y * size + x) * 4;
        img.data[i] = Math.min(255, r); img.data[i + 1] = Math.min(255, g); img.data[i + 2] = Math.min(255, b); img.data[i + 3] = 255;
        /* bump: channels are grooves, patches slightly raised */
        const bh = 120 + 105 * inPatch - 60 * inLine + 26 * (fur - 1) * 6;
        bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = Math.max(0, Math.min(255, bh));
        bimg.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0); bctx.putImageData(bimg, 0, 0);
    return { map: tex(cv, 1), bump: tex(bc, 1) };
  }

  /* ------------------------------------------------------------------ */
  function makeGround(size) {
    size = size || 512;
    const cv = newCanvas(size), ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const sand = [176, 148, 104], dark = [124, 101, 70], straw = [206, 184, 130], dry = [150, 130, 82];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const n1 = fbm(u * 5, v * 5, 5, 3, 4);
      const n2 = fbm(u * 17, v * 17, 17, 17, 3);
      const n3 = fbm(u * 48, v * 48, 48, 29, 2);
      let t = Math.min(1, Math.max(0, (n1 - 0.42) * 3.2));
      let r = sand[0] + (dark[0] - sand[0]) * t, g = sand[1] + (dark[1] - sand[1]) * t, b = sand[2] + (dark[2] - sand[2]) * t;
      const gt = Math.max(0, (n2 - 0.55)) * 1.7;
      r = r + (straw[0] - r) * gt * 0.5; g = g + (straw[1] - g) * gt * 0.5; b = b + (straw[2] - b) * gt * 0.5;
      const m = 0.86 + 0.3 * n3;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, r * m); img.data[i + 1] = Math.min(255, g * m * (0.98 + 0.04 * n2)); img.data[i + 2] = Math.min(255, b * m); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    /* dry grass strokes and pebbles, drawn wrapped so the tile stays seamless */
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    ctx.lineCap = 'round';
    for (let i = 0; i < 1500; i++) {
      const x = rnd() * size, y = rnd() * size, a = rnd() * Math.PI * 2, len = 3 + rnd() * 9;
      const c = rnd();
      ctx.strokeStyle = 'rgba(' + (170 + c * 55 | 0) + ',' + (155 + c * 50 | 0) + ',' + (100 + c * 40 | 0) + ',' + (0.20 + 0.35 * rnd()).toFixed(2) + ')';
      ctx.lineWidth = 0.8 + rnd() * 1.1;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const ox = dx * size, oy = dy * size;
        if (Math.abs(x + ox - size / 2) > size * 0.55 || Math.abs(y + oy - size / 2) > size * 0.55) {
          if (Math.abs(ox) + Math.abs(oy) > 0 && (x + ox < -20 || x + ox > size + 20 || y + oy < -20 || y + oy > size + 20)) continue;
        }
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        ctx.stroke();
      }
    }
    for (let i = 0; i < 260; i++) {
      const x = rnd() * size, y = rnd() * size, r = 0.6 + rnd() * 1.9;
      ctx.fillStyle = 'rgba(' + (120 + rnd() * 60 | 0) + ',' + (108 + rnd() * 50 | 0) + ',' + (88 + rnd() * 40 | 0) + ',0.5)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    return tex(cv, 1);
  }

  /* soft radial sprite used for hoof dust */
  function makeDust() {
    const n = 64, cv = newCanvas(n), ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, 'rgba(214,192,156,0.75)');
    g.addColorStop(0.45, 'rgba(206,184,148,0.30)');
    g.addColorStop(1, 'rgba(200,178,140,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /* alpha blade sprite for grass tufts */
  function makeBlade() {
    const n = 128, cv = newCanvas(n), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, n, n);
    let seed = 777;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 22; i++) {
      const x0 = 12 + rnd() * (n - 24), h = n * (0.35 + rnd() * 0.6), bend = (rnd() - 0.5) * 34;
      const c = 120 + rnd() * 90;
      ctx.strokeStyle = 'rgba(' + (c + 50 | 0) + ',' + (c + 42 | 0) + ',' + (c - 20 | 0) + ',' + (0.75 + 0.25 * rnd()).toFixed(2) + ')';
      ctx.lineWidth = 1.2 + rnd() * 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, n);
      ctx.quadraticCurveTo(x0 + bend * 0.4, n - h * 0.55, x0 + bend, n - h);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  G.textures = { makeCoat: makeCoat, makeGround: makeGround, makeDust: makeDust, makeBlade: makeBlade };
})(window.G = window.G || {});
