// ---------------------------------------------------------------------------
// 00_util.js  --  math / noise / misc helpers
// ---------------------------------------------------------------------------
window.G = window.G || {};
(function (G) {
  'use strict';

  G.TAU = Math.PI * 2;
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.inv = (a, b, v) => (v - a) / (b - a);
  G.smooth = (a, b, v) => { const t = G.clamp((v - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
  G.fract = (v) => v - Math.floor(v);
  G.mix = (a, b, t) => a + (b - a) * t;
  // gaussian bump, 1 at c, ~0 at c +- w
  G.bump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
  // signed distance-ish band
  G.band = (x, c, w) => G.clamp(1 - Math.abs(x - c) / w, 0, 1);

  // deterministic PRNG (mulberry32)
  G.rand = (a, b) => a + Math.random() * (b - a);

  G.rng = function (seed) {
    let a = (seed >>> 0) || 1;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  };

  // ---- 2D value noise (tileable in x with period px) ----------------------
  function hash2(x, y, seed) {
    let h = x * 374761393 + y * 668265263 + seed * 1442695040888963407;
    h = (h ^ (h >> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  G.noise2 = function (x, y, seed) {
    seed = seed || 0;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  G.fbm = function (x, y, oct, seed) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * G.noise2(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
    return s / n;
  };

  // ---- centripetal Catmull-Rom through 3D points -------------------------
  G.curve = function (pts, closed) {
    const P = pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])));
    if (closed) P.unshift(P[P.length - 2]), P.push(P[1]);
    else { P.unshift(P[0]); P.push(P[P.length - 1]); }
    const n = P.length;
    return {
      // t in [0,1] over the whole (middle) span
      at: function (t, out) {
        out = out || new THREE.Vector3();
        const segs = n - 3;
        const s = G.clamp(t, 0, 1) * segs;
        let i = Math.min(Math.floor(s), segs - 1);
        const k = s - i;
        const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
        // uniform catmull-rom is fine for our hand-placed control points
        const k2 = k * k, k3 = k2 * k;
        out.set(
          0.5 * ((2 * p1.x) + (-p0.x + p2.x) * k + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * k2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * k3),
          0.5 * ((2 * p1.y) + (-p0.y + p2.y) * k + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * k2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * k3),
          0.5 * ((2 * p1.z) + (-p0.z + p2.z) * k + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * k2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * k3)
        );
        return out;
      },
      pts: P
    };
  };

  // ---- canvas helpers ----------------------------------------------------
  G.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  G.tex = function (canvas, opts) {
    opts = opts || {};
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = opts.wrapS || THREE.ClampToEdgeWrapping;
    t.wrapT = opts.wrapT || THREE.ClampToEdgeWrapping;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.flipY = opts.flipY !== undefined ? opts.flipY : true;
    if (opts.srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = opts.aniso || 8;
    t.needsUpdate = true;
    return t;
  };

  // superellipse profile weight: p=2 -> circle, higher -> flatter sides
  G.se = function (c, p) { return Math.sign(c) * Math.pow(Math.abs(c), 2 / p); };

  // ellipse circumference (Ramanujan #2)
  G.ellipCirc = function (a, b) {
    const h = Math.pow((a - b) / (a + b + 1e-9), 2);
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  };

  G.deg = (d) => (d * Math.PI) / 180;
})(window.G);
