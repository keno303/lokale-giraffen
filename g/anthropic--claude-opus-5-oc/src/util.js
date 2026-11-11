/* Small math / geometry helpers shared by the rest of the app. */
(function (global) {
  'use strict';

  const U = {};

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smoothstep = (t) => {
    t = U.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  U.smootherstep = (t) => {
    t = U.clamp(t, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  U.invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  U.frac = (x) => x - Math.floor(x);
  U.TAU = Math.PI * 2;

  /* Deterministic pseudo random so the giraffe looks the same every reload. */
  U.makeRandom = function (seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  /* --- value noise (tileable), used for skin grain, ground and bark --- */
  function hash2(ix, iy, seed) {
    let h = ix * 374761393 + iy * 668265263 + seed * 1274126177;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  U.tileNoise2 = function (x, y, period, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = U.smoothstep(xf), v = U.smoothstep(yf);
    const wrap = (n) => ((n % period) + period) % period;
    const x0 = wrap(xi), x1 = wrap(xi + 1), y0 = wrap(yi), y1 = wrap(yi + 1);
    const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
    const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };

  U.tileFbm = function (x, y, period, octaves, seed) {
    let sum = 0, amp = 0.5, norm = 0, p = period, f = 1;
    for (let i = 0; i < octaves; i++) {
      sum += amp * U.tileNoise2(x * f, y * f, p * f, seed + i * 17);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };

  /* Catmull-Rom through an array of numbers, clamped at the ends. */
  U.splineArray = function (arr, t) {
    const n = arr.length - 1;
    const x = U.clamp(t, 0, 1) * n;
    const i = Math.min(Math.floor(x), n - 1);
    const f = x - i;
    const p0 = arr[Math.max(i - 1, 0)];
    const p1 = arr[i];
    const p2 = arr[i + 1];
    const p3 = arr[Math.min(i + 2, n)];
    const f2 = f * f, f3 = f2 * f;
    return 0.5 * ((2 * p1) + (-p0 + p2) * f +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  };

  /* Canvas helper -------------------------------------------------------- */
  U.canvas = function (size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };

  U.textureFromCanvas = function (canvas, repeat, anisotropy) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat, repeat);
    t.anisotropy = anisotropy || 8;
    return t;
  };

  global.GU = U;
})(window);
