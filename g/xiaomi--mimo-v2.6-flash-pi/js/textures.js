'use strict';
/* ============================================================
   textures.js – every texture is drawn on a <canvas> at runtime
   so the page works from file:// with no assets & no build step
   ============================================================ */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function canvasTexture(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------
   reticulated giraffe coat – seamless jittered-grid patches
   ------------------------------------------------------------ */
function makeCoatTexture(opt) {
  opt = opt || {};
  const size = opt.size || 1024;
  const cols = opt.cols || 6;
  const rows = opt.rows || 6;
  const seed = opt.seed || 11;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');

  const lineCol = opt.line || '#efe4cd';
  g.fillStyle = lineCol;
  g.fillRect(0, 0, size, size);

  const cellW = size / cols, cellH = size / rows;
  const rnd = makeRng(seed);

  /* jittered grid points, wrapping at the borders */
  const P = [];
  for (let i = 0; i <= cols; i++) {
    P[i] = [];
    for (let j = 0; j <= rows; j++) {
      const jx = (hash2(i % cols, j % rows) - 0.5) * 0.62 * cellW;
      const jy = (hash2((i % cols) + 37.2, (j % rows) + 91.7) - 0.5) * 0.62 * cellH;
      /* i%cols / j%rows keep the jitter identical on opposite edges,
         so P[cols][j] === P[0][j] + size  →  the canvas tiles seamlessly */
      P[i][j] = [i * cellW + jx, j * cellH + jy];
    }
  }

  const inset = 0.048 * Math.min(cellW, cellH);
  const offs = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) offs.push([a * size, b * size]);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const q = [P[i][j], P[i + 1][j], P[i + 1][j + 1], P[i][j + 1]];
      let cx = 0, cy = 0;
      for (const p of q) { cx += p[0]; cy += p[1]; }
      cx /= 4; cy /= 4;
      /* pull the corners in so the cream lines appear between patches */
      const poly = q.map(p => {
        const dx = cx - p[0], dy = cy - p[1];
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(inset, d * 0.35) / d;
        return [p[0] + dx * k, p[1] + dy * k];
      });

      const hu = hash2(i * 3.7 + 5.1, j * 5.3 + 1.7);
      const hue = 22 + hu * 14;
      const sat = 46 + hash2(i + 11, j + 3) * 20;
      const lig = 40 + hash2(i * 2.3, j * 7.1) * 13;
      const colA = `hsl(${hue},${sat}%,${lig}%)`;
      const colB = `hsl(${hue - 3},${sat - 6}%,${lig - 9}%)`;

      const x0 = Math.min.apply(null, poly.map(p => p[0]));
      const x1 = Math.max.apply(null, poly.map(p => p[0]));
      const y0 = Math.min.apply(null, poly.map(p => p[1]));
      const y1 = Math.max.apply(null, poly.map(p => p[1]));
      const grd = g.createLinearGradient(x0, y0, x1, y1);
      grd.addColorStop(0, colA);
      grd.addColorStop(1, colB);

      for (const o of offs) {
        const ox = o[0], oy = o[1];
        g.beginPath();
        g.moveTo(poly[0][0] + ox, poly[0][1] + oy);
        for (let k = 1; k < 4; k++) g.lineTo(poly[k][0] + ox, poly[k][1] + oy);
        g.closePath();
        g.fillStyle = grd;
        g.fill();
        g.strokeStyle = 'rgba(70,40,18,0.18)';
        g.lineWidth = Math.max(1.5, inset * 0.30);
        g.stroke();
      }
    }
  }

  /* hair grain */
  g.globalAlpha = 0.10;
  g.lineWidth = 1;
  for (let k = 0; k < 5200; k++) {
    const x = rnd() * size, y = rnd() * size;
    const a = -0.55 + rnd() * 1.1;
    const len = 5 + rnd() * 9;
    g.strokeStyle = rnd() > 0.5 ? '#3a2410' : '#f7ecd8';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.globalAlpha = 1;

  return c;
}

/* ------------------------------------------------------------
   lower legs: the coat pattern fading out into plain cream
   (v = 0 at the top of the leg, v = 1 at the hoof.
    with flipY the canvas TOP is v = 1, so the fade is drawn there)
   ------------------------------------------------------------ */
function makeLegTexture(opt) {
  opt = opt || {};
  const size = opt.size || 512;
  const c = makeCoatTexture({
    size: size, cols: opt.cols || 4, rows: opt.rows || 7,
    seed: opt.seed || 4, line: opt.line || '#efe4cd'
  });
  const g = c.getContext('2d');

  /* fade to plain cream: full cream over the top 26 % of the leg
     (v=1 → canvas top = hoof end), ramping away by mid-forearm */
  const grd = g.createLinearGradient(0, 0, 0, size * 0.78);
  grd.addColorStop(0.00, 'rgba(240,232,214,1)');
  grd.addColorStop(0.32, 'rgba(240,232,214,1)');
  grd.addColorStop(1.00, 'rgba(240,232,214,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size * 0.78);

  /* a touch of warm shading deep on the upper leg */
  const g2 = g.createLinearGradient(0, size, 0, size * 0.62);
  g2.addColorStop(0, 'rgba(120,96,70,0.26)');
  g2.addColorStop(1, 'rgba(120,96,70,0)');
  g.fillStyle = g2;
  g.fillRect(0, size * 0.62, size, size * 0.38);

  return c;
}

/* ------------------------------------------------------------
   savanna ground
   ------------------------------------------------------------ */
function makeGroundTexture(opt) {
  opt = opt || {};
  const size = opt.size || 1024;
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const rnd = makeRng(opt.seed || 3);

  g.fillStyle = opt.base || '#8d8149';
  g.fillRect(0, 0, size, size);

  /* broad colour blotches (drawn 3×3 so they tile) */
  const offs = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) offs.push([a * size, b * size]);
  const blotch = ['#7d8a4a', '#9a8a52', '#6f7a42', '#a89460', '#867a44'];
  for (let k = 0; k < 34; k++) {
    const x = rnd() * size, y = rnd() * size, r = 60 + rnd() * 190;
    const col = blotch[(rnd() * blotch.length) | 0];
    for (const o of offs) {
      const grd = g.createRadialGradient(x + o[0], y + o[1], 0, x + o[0], y + o[1], r);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.5;
      g.fillStyle = grd;
      g.fillRect(x + o[0] - r, y + o[1] - r, r * 2, r * 2);
    }
  }
  g.globalAlpha = 1;

  /* grass blades */
  const cols = ['#7e8b46', '#958c4e', '#6b7440', '#a89a5c', '#8f9a52', '#b0a06a', '#767a3e'];
  for (let k = 0; k < 14000; k++) {
    const x = rnd() * size, y = rnd() * size;
    const a = -1.9 + rnd() * 1.4;
    const len = 4 + rnd() * 12;
    g.strokeStyle = cols[(rnd() * cols.length) | 0];
    g.globalAlpha = 0.35 + rnd() * 0.5;
    g.lineWidth = rnd() > 0.7 ? 2 : 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.globalAlpha = 1;

  /* small stones / bare soil */
  for (let k = 0; k < 380; k++) {
    const x = rnd() * size, y = rnd() * size, r = 1 + rnd() * 4;
    g.fillStyle = rnd() > 0.5 ? 'rgba(146,132,102,0.6)' : 'rgba(92,84,58,0.55)';
    g.beginPath();
    g.ellipse(x, y, r, r * (0.6 + rnd() * 0.6), rnd() * 3, 0, TAU);
    g.fill();
  }

  return c;
}

/* ------------------------------------------------------------
   vertical gradient used by the sky dome (canvas is simple &
   orientation-safe here: top of canvas = zenith)
   ------------------------------------------------------------ */
function makeSkyTexture() {
  const c = makeCanvas(8, 256);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, '#3f7fd0');
  grd.addColorStop(0.35, '#7fb2e8');
  grd.addColorStop(0.62, '#bcd8ee');
  grd.addColorStop(0.78, '#e6e2cf');
  grd.addColorStop(1.00, '#d8cfae');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}
