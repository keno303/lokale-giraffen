/* util.js — small shared helpers under the global G namespace. */
window.G = window.G || {};
(function (G) {
  'use strict';

  G.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  G.lerp = function (a, b, t) { return a + (b - a) * t; };
  G.smoothstep = function (t) { t = G.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  // even smoother C2 continuity, used for foot protraction
  G.smoothstep2 = function (t) { t = G.clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
  G.fract = function (v) { return v - Math.floor(v); };

  // Mulberry32 seeded PRNG so the scenery looks identical on every run.
  G.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  G.makeCanvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  // r128 treats Color values as linear: convert authored sRGB hex first,
  // otherwise materials look washed-out and too bright.
  G.col = function (hex) { return new THREE.Color(hex).convertSRGBToLinear(); };
})(window.G);
