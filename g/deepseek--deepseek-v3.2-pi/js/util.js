/* ---------------------------------------------------------------------------
 * util.js — small math / noise / canvas helpers used across the project.
 * Classic script (no modules) so index.html works straight from file://
 * ------------------------------------------------------------------------- */
(function () {
  const U = (window.U = {});

  // ---- deterministic PRNG (mulberry32) ----------------------------------
  let seedState = 1337;
  U.seed = function (s) { seedState = s >>> 0; };
  U.rnd = function () {
    let t = (seedState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  U.range = (a, b) => a + U.rnd() * (b - a);
  U.pick = arr => arr[Math.floor(U.rnd() * arr.length) % arr.length];

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = t => t * t * (3 - 2 * t);
  U.fract = x => x - Math.floor(x);
  // shortest-path easing helper for cyclic values
  U.wrap01 = x => x - Math.floor(x);
  U.damp = (cur, tgt, lambda, dt) => U.lerp(cur, tgt, 1 - Math.exp(-lambda * dt));

  // ---- 2D / 3D value noise + fbm ---------------------------------------
  const TABLE = new Float32Array(512);
  (function fill() {
    let s = 0x2f6e2b1;
    const r = () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    for (let i = 0; i < 512; i++) TABLE[i] = r();
  })();
  const hash2 = (x, y) => TABLE[(TABLE[x & 255] * 511 + y * 31337) & 511 | 0] !== undefined
    ? TABLE[((x & 255) * 7 + (y & 255) * 13) & 511] : 0;

  function vnoise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const g = (a, b) => TABLE[((a & 255) * 31 + (b & 255) * 17) & 511];
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  }
  U.noise2 = vnoise2;

  U.fbm2 = function (x, y, oct, gain) {
    oct = oct || 4; gain = gain || 0.5;
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * vnoise2(x * f, y * f);
      norm += amp; amp *= gain; f *= 2.07;
    }
    return sum / norm;
  };

  // seamless (tileable) fbm on a torus: sample noise of a circle in 2 extra dims
  U.fbmt = function (u, v, freqU, freqV, oct) {
    // u,v in [0,1); tileable in both directions
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const r1 = freqU / (Math.PI * 2), r2 = freqV / (Math.PI * 2);
    const px = Math.cos(a) * r1, py = Math.sin(a) * r1;
    const pz = Math.cos(b) * r2, pw = Math.sin(b) * r2;
    let amp = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < (oct || 4); i++) {
      const n1 = vnoise2(px * f + pz * f * 0.77, py * f + pw * f * 0.77);
      const n2 = vnoise2(pz * f * 1.31 - py * f * 0.53, px * f * 1.31 + pw * f * 0.53);
      sum += amp * (n1 * 0.6 + n2 * 0.4);
      norm += amp; amp *= 0.52; f *= 2.03;
    }
    return sum / norm;
  };

  U.srgbToLinear = function (c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

  // ---- canvas ------------------------------------------------------------
  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  U.gradBand = function (ctx, stops) {
    // convenience: build a linear gradient vertically in a 0..1 box
    const g = ctx.createLinearGradient(0, 0, 0, 1);
    stops.forEach(s => g.addColorStop(s[0], s[1]));
    return g;
  };

  // ---- colour helpers ---------------------------------------------------
  U.shade = function (hex, k) {
    const r = ((hex >> 16) & 255), g = ((hex >> 8) & 255), b = hex & 255;
    const f = v => U.clamp(Math.round(v * k), 0, 255);
    return (f(r) << 16) | (f(g) << 8) | f(b);
  };
  U.rgbStr = (r, g, b, a) => (a === undefined ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`);
  U.mixRGB = (c1, c2, t) => [U.lerp(c1[0], c2[0], t), U.lerp(c1[1], c2[1], t), U.lerp(c1[2], c2[2], t)];

  U.now = () => performance.now();
})();
