/* ==========================================================================
   core.js — math, noise and small utilities shared by every module.
   Classic script (no ES modules) so index.html runs straight from file://.
   ========================================================================== */
window.GIR = window.GIR || {};

(function (GIR) {
  'use strict';

  var TAU = Math.PI * 2;
  GIR.TAU = TAU;
  GIR.DEG = Math.PI / 180;

  /* ---------------------------------------------------------------- math -- */
  GIR.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  GIR.lerp = function (a, b, t) { return a + (b - a) * t; };
  GIR.invLerp = function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); };
  GIR.frac = function (v) { return v - Math.floor(v); };
  /* positive modulo — used for gait phases */
  GIR.mod = function (v, m) { return ((v % m) + m) % m; };
  GIR.mod1 = function (v) { return GIR.mod(v, 1); };

  GIR.smoothstep = function (e0, e1, x) {
    var t = GIR.clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  };
  GIR.smootherstep = function (e0, e1, x) {
    var t = GIR.clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  /* 0..1..0 hump */
  GIR.hump = function (t) { t = GIR.clamp(t, 0, 1); return Math.sin(t * Math.PI); };
  GIR.hump2 = function (t) { t = GIR.clamp(t, 0, 1); return Math.sin(t * Math.PI) * Math.sin(t * Math.PI); };
  GIR.gauss = function (x, s) { var k = x / (s || 1); return Math.exp(-k * k); };

  /* Deterministic RNG so screenshots/CI runs are reproducible. */
  GIR.mulberry32 = function (seed) {
    var a = (seed || 1) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ------------------------------------------------------------- noise -- */
  GIR.hash2 = function (ix, iy, seed) {
    var h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };
  GIR.hashFloat = function (ix, iy, seed) { return GIR.hash2(ix, iy, seed) / 4294967296; };

  /* Value noise, periodic on a `period` x `period` lattice so canvas textures
     can be tiled without visible seams. */
  GIR.noise = function (x, y, period, seed) {
    var P = period || 0;
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var wrap = function (v) { return P ? ((v % P) + P) % P : v; };
    var x0 = wrap(xi), x1 = wrap(xi + 1), y0 = wrap(yi), y1 = wrap(yi + 1);
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = GIR.hashFloat(x0, y0, seed), b = GIR.hashFloat(x1, y0, seed);
    var c = GIR.hashFloat(x0, y1, seed), d = GIR.hashFloat(x1, y1, seed);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };

  /* Fractal brownian motion over the same periodic lattice. */
  GIR.fbm = function (x, y, octaves, period, seed, gain) {
    var sum = 0, amp = 1, norm = 0, fx = x, fy = y, fp = period, i;
    for (i = 0; i < octaves; i++) {
      sum += amp * GIR.noise(fx, fy, fp, seed + i * 7919);
      norm += amp;
      fx *= 2; fy *= 2;
      if (fp) fp *= 2;
      amp *= (gain === undefined ? 0.5 : gain);
    }
    return sum / (norm || 1);
  };

  /* Domain warp — breaks up the straight edges of procedural cells. */
  GIR.warp = function (x, y, amount, freq, period, seed) {
    var wx = x + amount * (GIR.fbm(x * freq, y * freq, 2, period ? period * freq : 0, seed + 31) - 0.5);
    var wy = y + amount * (GIR.fbm(x * freq, y * freq, 2, period ? period * freq : 0, seed + 57) - 0.5);
    return [wx, wy];
  };

  /* --------------------------------------------------------- canvas ---- */
  GIR.canvas2d = function (w, h, css) {
    var c;
    if (css === false) { c = document.createElement('canvas'); }
    else { c = document.createElement('canvas'); }
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    return { canvas: c, ctx: x, w: w, h: h };
  };

  /* Wrap-aware sprite stamp: draws a marker plus copies on the far edges so
     hand-drawn details survive texture tiling. */
  GIR.stampWrapped = function (ctx, w, h, cx, cy, draw) {
    var offs = [0, 0];
    var list = [[cx, cy]];
    if (cx < 0) list.push([cx + w, cy]);
    if (cx > w) list.push([cx - w, cy]);
    if (cy < 0) list.push([cx, cy + h]);
    if (cy > h) list.push([cx, cy - h]);
    if (cx < 0 && cy < 0) list.push([cx + w, cy + h]);
    if (cx > w && cy > h) list.push([cx - w, cy - h]);
    for (var i = 0; i < list.length; i++) { ctx.save(); ctx.translate(list[i][0], list[i][1]); draw(ctx); ctx.restore(); }
    return offs;
  };

  /* ------------------------------------------------------------ colour -- */
  GIR.mixRGB = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };
  GIR.css = function (c, a) {
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  };
  /* sRGB gamma for hand-painted canvas colours -> linear-ish look */
  GIR.gamma = function (c, g) {
    return [Math.pow(c[0] / 255, g) * 255, Math.pow(c[1] / 255, g) * 255, Math.pow(c[2] / 255, g) * 255];
  };

  /* ---------------------------------------------------------- stats ------ */
  GIR.Stats = {
    frames: 0, last: 0, fps: 0, accum: 0, count: 0, avgMs: 0,
    tick: function (dtMs) {
      this.count++; this.accum += dtMs;
      this.frames++;
      var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - this.last > 500) {
        this.fps = this.frames * 1000 / (now - this.last || 1);
        this.avgMs = this.accum / (this.count || 1);
        this.frames = 0; this.last = now; this.count = 0; this.accum = 0;
      }
    }
  };

  /* Small helper: human-readable number for the HUD. */
  GIR.fmt = function (v, digits) { return (Math.round(v * Math.pow(10, digits || 2)) / Math.pow(10, digits || 2)).toFixed(digits || 2); };

})(window.GIR);
