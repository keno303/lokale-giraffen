/* =========================================================================
   util.js — small math / noise / canvas helpers used by the giraffe demo.
   Plain classic script (no modules) so index.html works from file://
   ========================================================================= */
(function (global) {
  'use strict';

  const U = {};

  U.TAU = Math.PI * 2;

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.smoothstep = function (t) { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.smootherstep = function (t) { t = U.clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
  U.mix = function (a, b, t) { return a + (b - a) * t; };
  U.easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  /* deterministic PRNG ------------------------------------------------- */
  U.mulberry32 = function (a) {
    a = a >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* integer hash -> [0,1) ---------------------------------------------- */
  U.hash2 = function (x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
  U.hash1 = function (x, seed) {
    let h = (x * 374761393 + seed * 2246822519) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };

  /* value noise -------------------------------------------------------- */
  U.valueNoise = function (x, y, seed, per) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const wx = per ? ((xi % per) + per) % per : xi;
    const wy = per ? ((yi % per) + per) % per : yi;
    const a = U.hash2(wx, wy, seed);
    const b = U.hash2(wx + 1, wy, seed);
    const c = U.hash2(wx, wy + 1, seed);
    const d = U.hash2(wx + 1, wy + 1, seed);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };

  U.fbm = function (x, y, octaves, seed, lacunarity, gain) {
    lacunarity = lacunarity || 2.0; gain = gain || 0.5;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * U.valueNoise(x * freq, y * freq, seed + i * 131);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  };

  /* seamless fbm over the unit square (u,v in [0,1)) */
  U.fbmTile = function (u, v, octaves, seed, baseFreq) {
    baseFreq = baseFreq || 4;
    let amp = 1, freq = baseFreq, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * U.valueNoise(u * freq, v * freq, seed + i * 131, freq);
      norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };

  /* tileable cellular (Worley) noise ----------------------------------
     returns { d1, d2, id, cx, cy }  distances measured in cell units.
     Wraps on a cellsX x cellsY torus so the resulting texture tiles.     */
  U.cellular = function (u, v, cellsX, cellsY, jitter, seed) {
    const gx = Math.floor(u * cellsX), gy = Math.floor(v * cellsY);
    let d1 = 1e9, d2 = 1e9, id = 0, bx = 0, by = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cxg = gx + ox, cyg = gy + oy;
        const wx = ((cxg % cellsX) + cellsX) % cellsX;
        const wy = ((cyg % cellsY) + cellsY) % cellsY;
        const jx = (U.hash2(wx, wy, seed) - 0.5) * jitter;
        const jy = (U.hash2(wx, wy, seed + 7771) - 0.5) * jitter;
        const px = cxg + 0.5 + jx, py = cyg + 0.5 + jy;
        const dx = px - u * cellsX, dy = py - v * cellsY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; id = wy * cellsX + wx; bx = px; by = py; }
        else if (d < d2) { d2 = d; }
      }
    }
    return { d1: d1, d2: d2, id: id, cx: bx, cy: by };
  };

  /* canvas helpers ------------------------------------------------------ */
  U.canvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  /* build a normal map texture from a height field (Sobel) -------------- */
  U.heightToNormal = function (height, w, h, strength) {
    const cv = U.canvas(w, h);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    const at = function (x, y) {
      x = ((x % w) + w) % w; y = ((y % h) + h) % h;
      return height[y * w + x];
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
        const l = at(x - 1, y), r = at(x + 1, y);
        const bl = at(x - 1, y + 1), b = at(x, y + 1), br = at(x + 1, y + 1);
        const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
        const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
        let nx = -dx * strength, ny = -dy * strength, nz = 1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len; ny /= len; nz /= len;
        const i = (y * w + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };

  U.rgba = function (r, g, b) {
    return [U.clamp(r, 0, 255) | 0, U.clamp(g, 0, 255) | 0, U.clamp(b, 0, 255) | 0];
  };
  U.mixRGB = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  /* three r147 treats material colours as linear, so hex values that were
     picked in sRGB space have to be converted explicitly. */
  U.srgb = function (hex) {
    const c = new THREE.Color(hex);
    c.convertSRGBToLinear();
    return c;
  };

  global.U = U;
})(window);
