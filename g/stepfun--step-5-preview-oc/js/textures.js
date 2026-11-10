/* ------------------------------------------------------------------
 * textures.js -- every texture is generated procedurally on a canvas.
 * No network requests, no external image files: this is what lets the
 * whole demo run by double-clicking index.html (file://).
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var api = factory(root.THREE, root.GX);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TEX = api;
})(typeof self !== 'undefined' ? self : globalThis, function (THREE, GX) {
  'use strict';

  /* ---------------- canvas plumbing ---------------- */

  function hasCanvas() {
    try {
      if (typeof document === 'undefined' || !document.createElement) return false;
      var c = document.createElement('canvas');
      return !!(c.getContext && c.getContext('2d'));
    } catch (e) { return false; }
  }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* ---------------- deterministic RNG ---------------- */

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------------- colour helpers ---------------- */

  function hsl(h, s, l, a) {
    return 'hsla(' + (h * 360).toFixed(1) + ',' + (s * 100).toFixed(1) + '%,' +
      (l * 100).toFixed(1) + ',' + (a === undefined ? 1 : a) + ')';
  }

  function shade(hex, amt) {
    var c = new THREE.Color(hex);
    var hslv = {};
    c.getHSL(hslv);
    c.setHSL(hslv.h, GX.clamp(hslv.s + amt * 0.25, 0, 1), GX.clamp(hslv.l + amt, 0, 1));
    return '#' + c.getHexString();
  }

  /* ---------------- noise / grain ---------------- */

  function grain(ctx, w, h, rand, amount, scale) {
    scale = scale || 1;
    var id = ctx.getImageData(0, 0, w, h);
    var d = id.data;
    for (var i = 0; i < d.length; i += 4) {
      var n = (rand() - 0.5) * amount * scale;
      d[i] = GX.clamp(d[i] + n, 0, 255);
      d[i + 1] = GX.clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = GX.clamp(d[i + 2] + n, 0, 255);
    }
    ctx.putImageData(id, 0, 0);
  }

  function speckle(ctx, w, h, rand, count, rmin, rmax, color) {
    for (var i = 0; i < count; i++) {
      var x = rand() * w, y = rand() * h;
      var r = rmin + rand() * (rmax - rmin);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.05 + rand() * 0.14;
      ctx.ellipse(x, y, r, r * (0.5 + rand()), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- voronoi cells (for the coat patches) ---------------- */

  function clipHalfPlane(poly, nx, ny, off) {
    // keep points where nx*x + ny*y <= off
    var out = [];
    var n = poly.length;
    for (var i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n];
      var da = nx * a[0] + ny * a[1] - off;
      var db = nx * b[0] + ny * b[1] - off;
      if (da <= 0) out.push(a);
      if ((da <= 0 && db > 0) || (da > 0 && db <= 0)) {
        var t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  function voronoiCell(pts, i, w, h) {
    var c = pts[i];
    var poly = [[-w, -h], [2 * w, -h], [2 * w, 2 * h], [-w, 2 * h]];
    for (var j = 0; j < pts.length; j++) {
      if (j === i) continue;
      var o = pts[j];
      var mx = (c[0] + o[0]) * 0.5, my = (c[1] + o[1]) * 0.5;
      var nx = c[0] - o[0], ny = c[1] - o[1];
      var len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      poly = clipHalfPlane(poly, nx, ny, nx * mx + ny * my);
      if (poly.length < 3) break;
    }
    return poly;
  }

  function jitterPoly(poly, rand, amp) {
    return poly.map(function (p, i) {
      var j = (i === 0 ? poly[poly.length - 1] : poly[i - 1]);
      var k = poly[(i + 1) % poly.length];
      var cx = (j[0] + k[0]) * 0.5, cy = (j[1] + k[1]) * 0.5;
      var t = 0.35 + rand() * 0.5;
      return [p[0] + (cx - p[0]) * t + (rand() - 0.5) * amp,
      p[1] + (cy - p[1]) * t + (rand() - 0.5) * amp];
    });
  }

  function tracePath(ctx, poly) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
  }

  /* ==================================================================
   * GIRAFFE COAT -- Masai-style: rich chestnut blotches separated by a
   * cream network, with per-blotch tonal variation.
   * ================================================================== */
  function coatTexture(size, opts) {
    opts = opts || {};
    var w = size || 1024, h = Math.round(w * 1.0);
    var rand = rng(opts.seed || 20260909);
    var c = canvas(w, h), ctx = c.getContext('2d');

    // 1. Cream "network" base.
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#e8d3ad');
    g.addColorStop(0.5, '#dfc69c');
    g.addColorStop(1, '#e6d0a8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 2. Jittered grid of seeds -> Voronoi blotches.
    var cols = opts.cols || 9, rows = opts.rows || 9;
    var pts = [];
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var px = (x + 0.5 + (rand() - 0.5) * 0.55) * (w / cols);
        var py = (y + 0.5 + (rand() - 0.5) * 0.55) * (h / rows);
        pts.push([px, py]);
      }
    }
    // A few extra seeds to break the grid up.
    for (var e = 0; e < cols * rows * 0.35; e++) {
      pts.push([rand() * w, rand() * h]);
    }

    var palette = [
      [0.07, 0.55, 0.34], [0.06, 0.58, 0.30], [0.08, 0.50, 0.38],
      [0.055, 0.60, 0.27], [0.075, 0.52, 0.41]
    ];

    for (var i = 0; i < pts.length; i++) {
      var cell = voronoiCell(pts, i, w, h);
      if (cell.length < 3) continue;
      cell = jitterPoly(cell, rand, w * 0.012);
      // Inset slightly so the cream network reads as a gap.
      var cx = 0, cy = 0;
      cell.forEach(function (p) { cx += p[0]; cy += p[1]; });
      cx /= cell.length; cy /= cell.length;
      var inset = cell.map(function (p) {
        var dx = p[0] - cx, dy = p[1] - cy;
        var d = Math.hypot(dx, dy) || 1;
        var k = 0.90 + rand() * 0.06;
        return [cx + dx * k, cy + dy * k];
      });
      var pal = palette[(rand() * palette.length) | 0];
      var hue = pal[0] + (rand() - 0.5) * 0.012;
      var sat = pal[1] + (rand() - 0.5) * 0.08;
      var lum = pal[2] + (rand() - 0.5) * 0.09;

      ctx.save();
      tracePath(ctx, inset);
      ctx.fillStyle = hsl(hue, sat, lum);
      ctx.fill();
      // Soft darker rim.
      ctx.lineWidth = Math.max(1.5, w * 0.0035);
      ctx.strokeStyle = hsl(hue, sat * 0.9, lum * 0.72, 0.55);
      ctx.stroke();
      // Inner highlight so the blotches catch light.
      ctx.clip();
      var rg = ctx.createRadialGradient(cx - w * 0.02, cy - h * 0.03, 1, cx, cy, w * 0.06);
      rg.addColorStop(0, 'rgba(255,235,200,0.20)');
      rg.addColorStop(1, 'rgba(255,235,200,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 3. Cream hair-line cracks between blotches.
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(245,232,205,0.85)';
    ctx.lineWidth = Math.max(1, w * 0.0022);
    for (var s = 0; s < pts.length; s++) {
      for (var t2 = s + 1; t2 < pts.length; t2++) {
        var dx = pts[s][0] - pts[t2][0], dy = pts[s][1] - pts[t2][1];
        var d2 = Math.hypot(dx, dy);
        if (d2 < w * 0.13 || d2 > w * 0.30) continue;
        ctx.beginPath();
        ctx.moveTo(pts[s][0], pts[s][1]);
        ctx.quadraticCurveTo(
          (pts[s][0] + pts[t2][0]) / 2 + (rand() - 0.5) * w * 0.03,
          (pts[s][1] + pts[t2][1]) / 2 + (rand() - 0.5) * h * 0.03,
          pts[t2][0], pts[t2][1]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // 4. Fine hair grain.
    grain(ctx, w, h, rand, 16, 1);
    speckle(ctx, w, h, rand, Math.round(w * 0.5), 1, 3.2, '#3a2410');

    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  /* ==================================================================
   * LOWER LEG -- pale "stocking": cream with sparse faded blotches.
   * ================================================================== */
  function legTexture(size) {
    var w = size || 512, h = Math.round(w * 1.6);
    var rand = rng(4242);
    var c = canvas(w, h), ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#c9a878');
    g.addColorStop(0.35, '#e2cba4');
    g.addColorStop(1, '#eed9b6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < 26; i++) {
      var x = rand() * w, y = rand() * h;
      var r = 6 + rand() * 26;
      ctx.beginPath();
      ctx.fillStyle = hsl(0.07, 0.45, 0.30 + rand() * 0.14, 0.30 + rand() * 0.25);
      ctx.ellipse(x, y, r, r * (1.2 + rand() * 1.6), rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    grain(ctx, w, h, rand, 12, 1);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /* ---------------- muzzle / hooves / horn ---------------- */

  function muzzleTexture(size) {
    var w = size || 256, h = 128;
    var rand = rng(77);
    var c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2724';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + (40 + rand() * 40 | 0) + ',' + (36 + rand() * 30 | 0) + ',' + (32 + rand() * 26 | 0) + ',0.5)';
      ctx.ellipse(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 2, 0, 0, 6.3);
      ctx.fill();
    }
    grain(ctx, w, h, rand, 14, 1);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function hoofTexture() {
    var w = 128, h = 128;
    var rand = rng(918);
    var c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#241f1c';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 260; i++) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + (30 + rand() * 26 | 0) + ',' + (26 + rand() * 22 | 0) + ',' + (22 + rand() * 18 | 0) + ',0.55)';
      ctx.ellipse(rand() * w, rand() * h, 1 + rand() * 5, 1 + rand() * 4, rand() * 3, 0, 6.3);
      ctx.fill();
    }
    grain(ctx, w, h, rand, 18, 1);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function eyeTexture() {
    var w = 128, h = 128;
    var rand = rng(313);
    var c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#120d0a';
    ctx.fillRect(0, 0, w, h);
    var g = ctx.createRadialGradient(w * 0.42, h * 0.38, 2, w * 0.5, h * 0.5, w * 0.52);
    g.addColorStop(0, '#6b4a2a');
    g.addColorStop(0.45, '#2a1c12');
    g.addColorStop(1, '#0d0908');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.48, 0, 6.3); ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(w * 0.36, h * 0.34, w * 0.055, 0, 6.3); ctx.fill();
    // iris ring
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.42, 0, 6.3); ctx.stroke();
    grain(ctx, w, h, rand, 10, 1);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ---------------- savanna ground ---------------- */

  function groundTexture(size) {
    var w = size || 1024, h = w;
    var rand = rng(6060);
    var c = canvas(w, h), ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#9d8253');
    g.addColorStop(0.5, '#a68a5c');
    g.addColorStop(1, '#8e7548');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // broad tonal patches (dry grass / bare earth)
    for (var i = 0; i < 60; i++) {
      var x = rand() * w, y = rand() * h;
      var r = w * (0.05 + rand() * 0.22);
      var rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      var tone = rand();
      var col = tone < 0.45 ? '150,128,80' : (tone < 0.8 ? '122,104,64' : '176,152,104');
      rg.addColorStop(0, 'rgba(' + col + ',' + (0.16 + rand() * 0.22).toFixed(2) + ')');
      rg.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = rg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // grass speckle
    for (var s = 0; s < w * 5; s++) {
      var gx = rand() * w, gy = rand() * h;
      ctx.strokeStyle = 'rgba(' + (96 + rand() * 60 | 0) + ',' + (104 + rand() * 50 | 0) + ',' +
        (48 + rand() * 40 | 0) + ',' + (0.10 + rand() * 0.28).toFixed(2) + ')';
      ctx.lineWidth = 0.8 + rand() * 1.4;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (rand() - 0.5) * 5, gy - 2 - rand() * 7);
      ctx.stroke();
    }
    // pebbles
    for (var p = 0; p < 240; p++) {
      var px = rand() * w, py = rand() * h, pr = 1 + rand() * 3.5;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(' + (90 + rand() * 70 | 0) + ',' + (84 + rand() * 60 | 0) + ',' +
        (70 + rand() * 50 | 0) + ',' + (0.2 + rand() * 0.4).toFixed(2) + ')';
      ctx.ellipse(px, py, pr, pr * (0.6 + rand() * 0.6), rand() * 3, 0, 6.3);
      ctx.fill();
    }
    grain(ctx, w, h, rand, 14, 1);

    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  /* ---------------- grass tuft alpha card ---------------- */

  function grassTexture(size) {
    var w = size || 256, h = w;
    var rand = rng(1717);
    var c = canvas(w, h), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    var blades = 34;
    for (var i = 0; i < blades; i++) {
      var bx = w * (0.2 + rand() * 0.6);
      var bh = h * (0.35 + rand() * 0.55);
      var lean = (rand() - 0.5) * w * 0.34;
      var bw = (2 + rand() * 4) * (w / 256);
      var grd = ctx.createLinearGradient(0, h, 0, h - bh);
      var tone = rand();
      var r = tone < 0.5 ? 108 : 138, gg = tone < 0.5 ? 116 : 124, b = tone < 0.5 ? 52 : 62;
      grd.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',1)');
      grd.addColorStop(1, 'rgba(' + (r + 40) + ',' + (gg + 40) + ',' + (b + 30) + ',0.15)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(bx - bw, h);
      ctx.quadraticCurveTo(bx - bw * 0.4 + lean * 0.3, h - bh * 0.6, bx + lean, h - bh);
      ctx.quadraticCurveTo(bx + bw * 0.6 + lean * 0.3, h - bh * 0.55, bx + bw, h);
      ctx.closePath();
      ctx.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ---------------- sky (equirectangular) ---------------- */

  function skyTexture(size) {
    var w = size || 1024, h = w / 2;
    var rand = rng(8080);
    var c = canvas(w, h), ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#2f6ea8');
    g.addColorStop(0.28, '#6ea6cf');
    g.addColorStop(0.52, '#a9c8dd');
    g.addColorStop(0.74, '#d8dcd6');
    g.addColorStop(1.00, '#e6ddcd');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // sun glow (u=0.75 chosen to match the light direction in environment.js)
    var sx = w * 0.78, sy = h * 0.30;
    var rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, w * 0.30);
    rg.addColorStop(0, 'rgba(255,250,225,0.95)');
    rg.addColorStop(0.12, 'rgba(255,244,205,0.55)');
    rg.addColorStop(0.45, 'rgba(250,235,200,0.16)');
    rg.addColorStop(1, 'rgba(250,235,200,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // soft clouds
    for (var i = 0; i < 26; i++) {
      var cx = rand() * w, cy = h * (0.16 + rand() * 0.42);
      var cw = w * (0.05 + rand() * 0.16), ch = h * (0.012 + rand() * 0.035);
      ctx.save();
      ctx.globalAlpha = 0.10 + rand() * 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, ch, 0, 0, 6.3);
      ctx.fill();
      for (var k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(cx + (rand() - 0.5) * cw, cy + (rand() - 0.5) * ch * 0.6,
          cw * (0.25 + rand() * 0.5), ch * (0.4 + rand() * 0.7), 0, 0, 6.3);
        ctx.fill();
      }
      ctx.restore();
    }
    grain(ctx, w, h, rand, 6, 0.6);

    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  /* ---------------- dust puff sprite ---------------- */

  function dustTexture(size) {
    var w = size || 128, h = w;
    var rand = rng(5150);
    var c = canvas(w, h), ctx = c.getContext('2d');
    var rg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    rg.addColorStop(0, 'rgba(214,196,166,0.85)');
    rg.addColorStop(0.45, 'rgba(198,180,150,0.42)');
    rg.addColorStop(1, 'rgba(190,172,142,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(206,188,156,' + (0.05 + rand() * 0.12).toFixed(2) + ')';
      ctx.ellipse(rand() * w, rand() * h, 4 + rand() * 20, 4 + rand() * 16, 0, 0, 6.3);
      ctx.fill();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ---------------- acacia bark + canopy ---------------- */

  function barkTexture() {
    var w = 256, h = 256;
    var rand = rng(2200);
    var c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#4a3b2c';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 220; i++) {
      var x = rand() * w;
      ctx.strokeStyle = 'rgba(' + (20 + rand() * 70 | 0) + ',' + (14 + rand() * 50 | 0) + ',' +
        (10 + rand() * 36 | 0) + ',' + (0.15 + rand() * 0.4).toFixed(2) + ')';
      ctx.lineWidth = 0.6 + rand() * 3.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 18, h * 0.33,
        x + (rand() - 0.5) * 18, h * 0.66, x + (rand() - 0.5) * 10, h);
      ctx.stroke();
    }
    grain(ctx, w, h, rand, 16, 1);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function canopyTexture() {
    var w = 256, h = 256;
    var rand = rng(3300);
    var c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#5c6b39';
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) {
      ctx.beginPath();
      var t = rand();
      ctx.fillStyle = 'rgba(' + (60 + t * 70 | 0) + ',' + (78 + t * 62 | 0) + ',' +
        (34 + t * 44 | 0) + ',' + (0.25 + rand() * 0.5).toFixed(2) + ')';
      ctx.ellipse(rand() * w, rand() * h, 3 + rand() * 16, 2 + rand() * 11, rand() * 3, 0, 6.3);
      ctx.fill();
    }
    grain(ctx, w, h, rand, 14, 1);
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /* ---------------- fine fur / hair bump ---------------- */

  function furTexture(size) {
    var w = size || 512, h = w;
    var rand = rng(1313);
    var c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, w, h);
    // short directional hair strokes
    for (var i = 0; i < w * 26; i++) {
      var x = rand() * w, y = rand() * h;
      var len = 3 + rand() * 9;
      var a = -Math.PI * 0.42 + (rand() - 0.5) * 0.5;
      var v = rand() < 0.5 ? 0 : 255;
      ctx.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.05 + rand() * 0.16).toFixed(3) + ')';
      ctx.lineWidth = 0.7 + rand() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    grain(ctx, w, h, rand, 26, 0.7);
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /* ---------------- build everything (or nothing, in Node) ---------------- */

  function build(opts) {
    opts = opts || {};
    if (!hasCanvas()) return null;
    var q = opts.quality === 'low' ? 0.5 : 1;
    var S = Math.round((opts.coatSize || 1024) * q);
    return {
      coat: coatTexture(S, { seed: opts.seed }),
      leg: legTexture(Math.round(512 * q)),
      muzzle: muzzleTexture(Math.round(256 * q)),
      hoof: hoofTexture(),
      eye: eyeTexture(),
      ground: groundTexture(Math.round(1024 * q)),
      grass: grassTexture(Math.round(256 * q)),
      sky: skyTexture(Math.round(1024 * q)),
      dust: dustTexture(Math.round(128 * q)),
      fur: furTexture(Math.round(512 * q)),
      bark: barkTexture(),
      canopy: canopyTexture()
    };
  }

  return {
    hasCanvas: hasCanvas, build: build, rng: rng,
    coatTexture: coatTexture, legTexture: legTexture,
    furTexture: furTexture,
    muzzleTexture: muzzleTexture, hoofTexture: hoofTexture,
    eyeTexture: eyeTexture, groundTexture: groundTexture,
    grassTexture: grassTexture, skyTexture: skyTexture,
    dustTexture: dustTexture, barkTexture: barkTexture, canopyTexture: canopyTexture
  };
});
