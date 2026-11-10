/* util.js — config, math helpers, procedural canvas textures */
'use strict';

const PI = Math.PI, TAU = PI * 2;

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function smootherstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
function fract(x) { return x - Math.floor(x); }

/* deterministic PRNG */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Catmull-Rom interpolation over keyframes [{t,v}] or [[t,v]] (monotone t) */
function keyframes(keys) {
  const K = keys.map(k => Array.isArray(k) ? { t: k[0], v: k[1] } : k);
  keys = K;
  return function (x) {
    const n = keys.length;
    if (x <= keys[0].t) return keys[0].v;
    if (x >= keys[n - 1].t) return keys[n - 1].v;
    let i = 0;
    while (i < n - 2 && keys[i + 1].t < x) i++;
    const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(n - 1, i + 2)];
    const u = (x - p1.t) / (p2.t - p1.t);
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1.v) + (-p0.v + p2.v) * u +
      (2 * p0.v - 5 * p1.v + 4 * p2.v - p3.v) * u2 +
      (-p0.v + 3 * p1.v - 3 * p2.v + p3.v) * u3);
  };
}

/* cubic Hermite with explicit end tangents (dz/dw) — used for the swing foot path */
function hermite(z0, z1, m0, m1, w) {
  const w2 = w * w, w3 = w2 * w;
  return (2 * w3 - 3 * w2 + 1) * z0 + (w3 - 2 * w2 + w) * m0 +
    (-2 * w3 + 3 * w2) * z1 + (w3 - w2) * m1;
}

/* ---------- canvas helpers ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h || w;
  return c;
}
function cnvTexture(canvas, repeat, aniso) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.repeat.set(repeat, repeat);
  t.anisotropy = aniso || 8;
  return t;
}

/* ---------- giraffe hide: reticulated patches ---------- */
function makeHideTexture(size, opts) {
  opts = opts || {};
  const base = opts.base || '#ece0c4';
  const cols = opts.colors || ['#8f5a30', '#9c6435', '#834f2b', '#a26c3a', '#8a5730'];
  const cells = opts.cells || 6;
  const gapStroke = opts.gapStroke === undefined ? 6 : opts.gapStroke;
  const contrast = opts.contrast === undefined ? 1 : opts.contrast;
  const rnd = mulberry32(opts.seed || 7);
  const c = makeCanvas(size), g = c.getContext('2d');

  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const cs = size / cells;

  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const cx = (i + 0.5 + (rnd() - 0.5) * 0.35) * cs;
      const cy = (j + 0.5 + (rnd() - 0.5) * 0.35) * cs;
      const n = 5 + Math.floor(rnd() * 4);
      const rad = cs * (0.36 + rnd() * 0.14);
      const pts = [];
      const a0 = rnd() * TAU;
      for (let k = 0; k < n; k++) {
        const a = a0 + k / n * TAU + (rnd() - 0.5) * (TAU / n) * 0.55;
        const rr = rad * (0.72 + rnd() * 0.5);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92]);
      }
      const col = cols[Math.floor(rnd() * cols.length)];
      g.fillStyle = col;
      const path = new Path2D();
      for (let wrapX = -1; wrapX <= 1; wrapX++)
        for (let wrapY = -1; wrapY <= 1; wrapY++) {
          path.moveTo(pts[0][0] + wrapX * size, pts[0][1] + wrapY * size);
          for (let k = 1; k < n; k++) path.lineTo(pts[k][0] + wrapX * size, pts[k][1] + wrapY * size);
          path.closePath();
        }
      g.fill(path);
      if (gapStroke > 0) {
        g.strokeStyle = base; g.lineWidth = gapStroke; g.lineJoin = 'round';
        g.stroke(path);
      }
      /* per-patch shading: soft darker edge on one side */
      if (contrast > 0) {
        const grad = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.15,
          cx, cy, rad * 1.2);
        grad.addColorStop(0, 'rgba(255,255,255,' + (0.10 * contrast) + ')');
        grad.addColorStop(1, 'rgba(0,0,0,' + (0.10 * contrast) + ')');
        g.fillStyle = grad;
        g.fill(path);
      }
    }
  }
  /* fine speckle noise */
  const noise = opts.noise === undefined ? 0.05 : opts.noise;
  if (noise > 0) {
    const img = g.getImageData(0, 0, size, size), d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      const k = (rnd() - 0.5) * 255 * noise;
      d[p] = clamp(d[p] + k, 0, 255);
      d[p + 1] = clamp(d[p + 1] + k, 0, 255);
      d[p + 2] = clamp(d[p + 2] + k, 0, 255);
    }
    g.putImageData(img, 0, 0);
  }
  return c;
}

/* ---------- savanna ground ---------- */
function makeGroundTexture(size) {
  const rnd = mulberry32(1337);
  const c = makeCanvas(size), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#a99a64'); grad.addColorStop(0.5, '#9e9160'); grad.addColorStop(1, '#a4976a');
  g.fillStyle = grad; g.fillRect(0, 0, size, size);

  const palette = ['#b6a76e', '#8f925c', '#968b58', '#a8925f', '#8a8552', '#b0a274', '#9c8e5a'];
  for (let i = 0; i < 420; i++) {
    const x = rnd() * size, y = rnd() * size, r = 8 + rnd() * 55;
    g.globalAlpha = 0.10 + rnd() * 0.22;
    g.fillStyle = palette[Math.floor(rnd() * palette.length)];
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, rr = r * (0.6 + rnd() * 0.7);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      k ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.fill();
  }
  /* dirt patches */
  for (let i = 0; i < 60; i++) {
    g.globalAlpha = 0.12 + rnd() * 0.18;
    g.fillStyle = rnd() < 0.5 ? '#8d7a56' : '#b3a179';
    g.beginPath(); g.ellipse(rnd() * size, rnd() * size, 12 + rnd() * 40, 10 + rnd() * 30,
      rnd() * TAU, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  /* grass blades speckle */
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * size, y = rnd() * size;
    g.fillStyle = rnd() < 0.5 ? 'rgba(120,120,70,0.35)' : 'rgba(190,180,130,0.30)';
    g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 3);
  }
  /* tiny dark shadow dots */
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = 'rgba(60,55,35,0.20)';
    g.fillRect(rnd() * size, rnd() * size, 1.5, 1.5);
  }
  return c;
}

/* ---------- equirectangular sky ---------- */
function makeSkyTexture(w, h) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.00, '#2f6db8');
  grad.addColorStop(0.30, '#5b93cf');
  grad.addColorStop(0.46, '#9dc0dd');
  grad.addColorStop(0.52, '#d9d3b8');   /* horizon haze */
  grad.addColorStop(0.56, '#e8d9b4');
  grad.addColorStop(0.62, '#cfc3a0');
  grad.addColorStop(1.00, '#b8ad8c');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);

  /* sun glow (azimuth ~ 0.62 of width, elevation ~0.34) */
  const sx = w * 0.66, sy = h * 0.30;
  let rg = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.42);
  rg.addColorStop(0, 'rgba(255,246,214,0.95)');
  rg.addColorStop(0.10, 'rgba(255,238,190,0.55)');
  rg.addColorStop(0.45, 'rgba(255,230,180,0.16)');
  rg.addColorStop(1, 'rgba(255,225,170,0)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fffdf2';
  g.beginPath(); g.arc(sx, sy, h * 0.021, 0, TAU); g.fill();

  /* soft cloud bands */
  const rnd = mulberry32(4242);
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * w, cy = h * (0.14 + rnd() * 0.30);
    const cw = 60 + rnd() * 260, ch = 8 + rnd() * 22;
    const cg = g.createRadialGradient(cx, cy, 0, cx, cy, cw);
    cg.addColorStop(0, 'rgba(255,255,255,' + (0.10 + rnd() * 0.22) + ')');
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cg;
    g.save(); g.translate(cx, cy); g.scale(1, ch / cw);
    g.beginPath(); g.arc(0, 0, cw, 0, TAU); g.fill(); g.restore();
  }
  return c;
}
