/* giraffe-world / core.js — math, noise, seeded random, small helpers.
   Plain classic script so index.html opens straight from disk (file://). */
(function (root) {
  'use strict';

  var GW = root.GW || (root.GW = {});
  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ math */
  var M = GW.math = {
    TAU: TAU,
    DEG: Math.PI / 180,
    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
    clamp01: function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    invLerp: function (a, b, v) { return (v - a) / (b - a || 1e-9); },
    mix: function (a, b, t) { return a + (b - a) * t; },
    smoothstep: function (e0, e1, x) {
      var t = M.clamp01((x - e0) / (e1 - e0 || 1e-9));
      return t * t * (3 - 2 * t);
    },
    /* 0 -> 1 -> 0 over t in [0,1] */
    bump: function (t) { return 0.5 - 0.5 * Math.cos(TAU * M.clamp01(t)); },
    /* signed version of bump, period 1 */
    wave: function (t) { return Math.sin(TAU * t); },
    tri: function (t) { return 1 - 4 * Math.abs(((t + 0.25) % 1) - 0.5) * (1 - Math.abs(((t + 0.25) % 1) - 0.5)); },
    easeInOut: function (t) { return t * t * (3 - 2 * t); },
    easeOutBack: function (t, k) { k = k || 1.6; t -= 1; return t * t * ((k + 1) * t + k) + 1; },
    fract: function (t) { return t - Math.floor(t); },
    /* shortest-arc angle difference, wrapped into (-pi, pi] */
    angDelta: function (a, b) {
      var d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    },
    /* frame-rate independent exponential smoothing */
    damp: function (a, b, lambda, dt) { return M.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    /* wrap phase so that repeated calls never jump by more than one turn */
    wrapPhase: function (prev, target) {
      return prev + M.angDelta(prev % TAU, target % TAU);
    }
  };

  /* ----------------------------------------------------------- seeded rng */
  GW.Rand = function (seed) {
    var s = (seed >>> 0) || 0x2f6e2b1;
    return function () {           /* mulberry32 */
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* hash of two integers -> [0,1) ; period makes the noise tile seamlessly */
  function hash2(ix, iy, period, salt) {
    var h = (ix & (period - 1)) * 374761393 + (iy & (period - 1)) * 668265263 + (salt | 0) * 1442695041;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }
  GW.hash2 = hash2;

  /* value noise on a wrapping lattice, lattice size = period */
  function vnoise(x, y, period, salt) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy, period, salt);
    var b = hash2(ix + 1, iy, period, salt);
    var c = hash2(ix, iy + 1, period, salt);
    var d = hash2(ix + 1, iy + 1, period, salt);
    return M.mix(M.mix(a, b, u), M.mix(c, d, u), v);
  }
  GW.vnoise = vnoise;

  /* fractal brownian motion; period must be a power of two */
  function fbm(x, y, period, octaves, salt) {
    var sum = 0, amp = 0.5, p = period;
    for (var i = 0; i < octaves; i++) {
      sum += amp * vnoise(x * p, y * p, p, salt + i * 13);
      p *= 2; amp *= 0.5;
      x *= 1; /* keep coords, scaling handled by p */
    }
    return sum / (1 - Math.pow(0.5, octaves)) * 0.5 + 0.25;
  }
  GW.fbm = fbm;

  /* ------------------------------------------------------------ canvas 2d */
  GW.canvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  GW.rgb = function (r, g, b) { return [r, g, b]; };
  GW.hex = function (arr) {
    return '#' + arr.map(function (v) {
      return Math.round(M.clamp01(v / 255) * 255).toString(16).padStart(2, '0');
    }).join('');
  };
  GW.mixRGB = function (a, b, t) { return [M.mix(a[0], b[0], t), M.mix(a[1], b[1], t), M.mix(a[2], b[2], t)]; };

  /* --------------------------------------------------------------- timing */
  GW.Stopwatch = function (label) {
    var t0 = (root.performance || Date).now();
    return function () {
      var ms = ((root.performance || Date).now() - t0).toFixed(0);
      if (root.console && label) console.log('[init] ' + label + ': ' + ms + ' ms');
      return +ms;
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
