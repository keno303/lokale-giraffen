/* Small math / noise helpers shared by the whole project. */
window.G = window.G || {};

(function (G) {
  'use strict';

  G.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  G.lerp = function (a, b, t) { return a + (b - a) * t; };
  G.mix = G.lerp;
  G.smoothstep = function (a, b, x) {
    var t = G.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  G.smootherstep = function (a, b, x) {
    var t = G.clamp((x - a) / (b - a), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  G.pulse = function (t) { // 0..1..0 over t in 0..1, smooth ends
    t = G.clamp(t, 0, 1);
    return Math.sin(Math.PI * t);
  };
  G.TAU = Math.PI * 2;

  /* deterministic PRNG (mulberry32) */
  G.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function hash2(x, y) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  G.hash2 = hash2;

  /* smooth value noise */
  G.noise2 = function (x, y) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi), b = hash2(xi + 1, yi);
    var c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };

  /* tileable value noise: period given in grid cells */
  G.pnoise2 = function (x, y, period) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    var x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    var a = hash2(x0, y0), b = hash2(x1, y0);
    var c = hash2(x0, y1), d = hash2(x1, y1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };

  G.fbm2 = function (x, y, oct, lac, gain) {
    oct = oct || 4; lac = lac || 2.0; gain = gain || 0.5;
    var amp = 0.5, f = 1, sum = 0, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * G.noise2(x * f, y * f);
      norm += amp;
      amp *= gain; f *= lac;
    }
    return sum / norm;
  };

  G.fbmP = function (x, y, oct, period) {
    oct = oct || 4;
    var amp = 0.5, f = 1, sum = 0, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * G.pnoise2(x * f, y * f, period * f);
      norm += amp;
      amp *= 0.5; f *= 2;
    }
    return sum / norm;
  };

  /* Cheap 1D smooth noise, used for organic idle motion. */
  G.noise1 = function (x) {
    var xi = Math.floor(x), xf = x - xi;
    var u = xf * xf * (3 - 2 * xf);
    var a = hash2(xi, 77), b = hash2(xi + 1, 77);
    return a + (b - a) * u;
  };

  G.v3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };

  G.sRGB = function (hex) {
    return new THREE.Color(hex);
  };

  /* Colours are authored in sRGB; r128 shaders expect linear. */
  G.col = function (hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  };

  G.UP = new THREE.Vector3(0, 1, 0);
  G.FWD = new THREE.Vector3(0, 0, 1);

  /* Build an orthonormal basis column-major-ish for a mesh whose local +Y
     should point along dir, keeping local +X close to sideHint. */
  G.basisQuat = function (dir, sideHint, outQ) {
    var up = dir.clone().normalize();
    var side = sideHint.clone();
    side.sub(up.clone().multiplyScalar(side.dot(up)));
    if (side.lengthSq() < 1e-8) {
      side.set(1, 0, 0);
      side.sub(up.clone().multiplyScalar(side.dot(up)));
      if (side.lengthSq() < 1e-8) side.set(0, 0, 1), side.sub(up.clone().multiplyScalar(side.dot(up)));
    }
    side.normalize();
    var fwd = new THREE.Vector3().crossVectors(side, up).normalize();
    var m = new THREE.Matrix4().makeBasis(side, up, fwd);
    return (outQ || new THREE.Quaternion()).setFromRotationMatrix(m);
  };

  /* Look-at style basis for objects whose local +Z is forward and +Y is up. */
  G.forwardBasisQuat = function (fwd, upHint, outQ) {
    var z = fwd.clone().normalize();
    var x = new THREE.Vector3().crossVectors(upHint, z);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0).cross(z);
    x.normalize();
    var y = new THREE.Vector3().crossVectors(z, x).normalize();
    var m = new THREE.Matrix4().makeBasis(x, y, z);
    return (outQ || new THREE.Quaternion()).setFromRotationMatrix(m);
  };

})(window.G);
