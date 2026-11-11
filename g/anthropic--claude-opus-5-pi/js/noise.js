/* Tiny deterministic value/simplex-ish noise helpers (no deps). */
(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 2D value noise with smooth interpolation
  function ValueNoise2D(seed) {
    var rnd = mulberry32(seed || 1337);
    var P = new Uint8Array(512);
    var perm = new Uint8Array(256);
    var i;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) {
      var j = (rnd() * (i + 1)) | 0;
      var t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (i = 0; i < 512; i++) P[i] = perm[i & 255];
    var G = new Float32Array(256);
    for (i = 0; i < 256; i++) G[i] = rnd() * 2 - 1;

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function val(ix, iy) { return G[P[(P[ix & 255] + (iy & 255)) & 255]]; }

    this.noise = function (x, y) {
      var ix = Math.floor(x), iy = Math.floor(y);
      var fx = x - ix, fy = y - iy;
      var u = fade(fx), v = fade(fy);
      var a = val(ix, iy), b = val(ix + 1, iy);
      var c = val(ix, iy + 1), d = val(ix + 1, iy + 1);
      var top = a + (b - a) * u;
      var bot = c + (d - c) * u;
      return top + (bot - top) * v;
    };

    this.fbm = function (x, y, oct, lac, gain) {
      oct = oct || 4; lac = lac || 2.0; gain = gain === undefined ? 0.5 : gain;
      var amp = 1, freq = 1, sum = 0, norm = 0;
      for (var k = 0; k < oct; k++) {
        sum += amp * this.noise(x * freq, y * freq);
        norm += amp;
        amp *= gain; freq *= lac;
      }
      return sum / norm;
    };
  }

  global.Noise = { mulberry32: mulberry32, ValueNoise2D: ValueNoise2D };
})(window);
