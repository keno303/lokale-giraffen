/* ==========================================================================
   coat.js — procedural textures, painted with canvas 2D / per-pixel JS.
   No image files, so index.html works from file:// with zero setup.

   The skin is a warped, offset-weighted Voronoi ("power diagram"): that is
   the standard trick for the reticulated giraffe's polygonal liver-coloured
   patches separated by thin cream channels.  Everything is seamless on a
   metric tile, so the same texture can wrap a barrel and a cannon bone and
   the patches stay ~0.27 m wide everywhere.
   ========================================================================== */
(function (GIR) {
  'use strict';
  var S = {};
  GIR.Skin = S;

  var TILE = 3.0;                 /* metres of surface per texture repeat */
  S.TILE = TILE;
  S.registry = [];

  function tex(canvas, srgb, repeat) {
    var t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = srgb === false ? THREE.LinearEncoding : THREE.sRGBEncoding;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.needsUpdate = true;
    S.registry.push(t);
    return t;
  }
  S.setAnisotropy = function (a) {
    for (var i = 0; i < S.registry.length; i++) { S.registry[i].anisotropy = a; S.registry[i].needsUpdate = true; }
  };

  /* --------------------------------------------------------- giraffe skin - */
  /* Palette for a wild reticulated bull (Giraffa camelopardalis reticulata). */
  var CREAM = [227, 210, 173];
  var CREAM_DK = [205, 183, 145];
  var PATCH = [125, 62, 34];
  var PATCH_DK = [88, 43, 26];
  var PATCH_LT = [152, 84, 48];

  S.coat = function (size, opts) {
    opts = opts || {};
    size = size || 1024;
    var cells = opts.cells || 11;             /* grid resolution of the cells */
    var seed = opts.seed === undefined ? 4711 : opts.seed;
    var chan = (opts.channel || 0.055) / TILE * size;   /* channel width in px */
    var warpAmt = (opts.warp || 0.55) * size / cells;
    var rng = GIR.mulberry32(seed);

    /* seeds on a periodic lattice: index (gx,gy) -> position + radius + tone */
    var gx, gy, sd = [];
    for (gy = 0; gy < cells; gy++) {
      for (gx = 0; gx < cells; gx++) {
        var r = rng();
        sd.push({
          gx: gx, gy: gy,
          x: (gx + 0.14 + rng() * 0.72),
          y: (gy + 0.14 + rng() * 0.72),
          rad: (0.30 + 0.22 * r + 0.10 * rng()),
          tone: rng(),
          grain: rng()
        });
      }
    }
    function cellAt(ix, iy) {
      var a = ((ix % cells) + cells) % cells, b = ((iy % cells) + cells) % cells;
      return sd[b * cells + a];
    }

    var c = GIR.canvas2d(size, size), ctx = c.ctx;
    var img = ctx.createImageData(size, size);
    var d = img.data;
    var bc = GIR.canvas2d(size, size), bctx = bc.ctx;
    var bimg = bctx.createImageData(size, size);
    var bd = bimg.data;

    var inv = 1 / size * cells;               /* px -> lattice units */
    var P = cells;                            /* lattice period (== grid) */

    for (var py = 0; py < size; py++) {
      var fy = py * inv;
      for (var px = 0; px < size; px++) {
        var fx = px * inv;
        /* periodic domain warp -> irregular, organic polygons */
        var wx = GIR.fbm(fx * 1.6, fy * 1.6, 2, P * 1.6, seed + 11) - 0.5;
        var wy = GIR.fbm(fx * 1.6, fy * 1.6, 2, P * 1.6, seed + 23) - 0.5;
        var ux = fx + wx * (warpAmt / size) * cells * 0.9;
        var uy = fy + wy * (warpAmt / size) * cells * 0.9;

        var bx = Math.floor(ux), by = Math.floor(uy);
        var best = null, second = null, d1 = 1e9, d2 = 1e9, rr, cc;
        for (rr = -2; rr <= 2; rr++) {
          for (cc = -2; cc <= 2; cc++) {
            var s = cellAt(bx + cc, by + rr);
            /* unwrapped seed position for this lattice copy */
            var sx = s.x + (bx + cc - s.gx);
            var sy = s.y + (by + rr - s.gy);
            var dx = ux - sx, dy = uy - sy;
            var dist = Math.sqrt(dx * dx + dy * dy) - s.rad;
            if (dist < d1) { d2 = d1; second = best; best = s; d1 = dist; }
            else if (dist < d2) { d2 = dist; second = best === null ? null : s; }
          }
        }
        var edge = d2 - d1;                    /* distance to the channel (lattice units) */
        var edgePx = edge * size / cells;
        var inChan = 1 - GIR.smoothstep(chan * 0.42, chan, edgePx);

        /* per-pixel noise + large scale mottling */
        var n = GIR.noise(px * 0.13, py * 0.13, 0, 77) * 0.5 + GIR.noise(px * 0.9, py * 0.9, 0, 13) * 0.5;
        var mot = GIR.fbm(fx * 0.55, fy * 0.55, 3, P * 0.5, seed + 5);

        var col;
        var chanCol = GIR.mixRGB(CREAM, CREAM_DK, 0.30 + 0.55 * n);
        if (inChan > 0.98) {
          col = chanCol;
        } else {
          var t0 = best ? best.tone : 0.5;
          var body = GIR.mixRGB(PATCH, PATCH_LT, t0 * 0.7 + 0.3 * mot);
          /* darker rim just inside the patch edge, worn lighter centre */
          var rim = 1 - GIR.smoothstep(chan, chan * 3.4, edgePx);
          body = GIR.mixRGB(body, PATCH_DK, rim * 0.5);
          body = GIR.mixRGB(body, PATCH_LT, GIR.smoothstep(-chan * 0.2, -chan * 2.0, d1) * 0.25);
          body = GIR.mixRGB(body, PATCH_DK, 0.30 * n);
          col = GIR.mixRGB(body, chanCol, inChan);
        }

        /* occasional tiny satellite spots inside the channels */
        var spec = GIR.noise(px * 0.34, py * 0.34, 0, 991);
        if (inChan > 0.65 && spec > 0.86) col = GIR.mixRGB(col, PATCH_DK, 0.5);

        var g = (n - 0.5) * 10;
        var i4 = (py * size + px) * 4;
        d[i4] = GIR.clamp(col[0] + g, 0, 255);
        d[i4 + 1] = GIR.clamp(col[1] + g, 0, 255);
        d[i4 + 2] = GIR.clamp(col[2] + g, 0, 255);
        d[i4 + 3] = 255;

        /* relief: channels are creases, patches dome slightly */
        var rel = 150 + (inChan > 0.5 ? -70 : 25 * GIR.smoothstep(0, chan * 2.2, edgePx) - 40 * (1 - GIR.smoothstep(0, chan * 0.5, edgePx)));
        rel += (n - 0.5) * 22;
        bd[i4] = bd[i4 + 1] = bd[i4 + 2] = GIR.clamp(rel, 0, 255);
        bd[i4 + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    bctx.putImageData(bimg, 0, 0);
    return { map: tex(c.canvas, true), bump: tex(bc.canvas, false) };
  };

  /* -------------------------------------------------------------- ground -- */
  /* Dry savanna floor: baked straw, pale trampled dirt, dung specks, twigs. */
  S.ground = function (size, opts) {
    opts = opts || {};
    size = size || 1024;
    var seed = opts.seed || 1234;
    var mPerTile = opts.metres || 6;
    var c = GIR.canvas2d(size, size), ctx = c.ctx;

    /* mottling via a coarse value-noise field drawn as soft blobs */
    var g = ctx.createImageData(size, size), dd = g.data;
    var i, px, py;
    for (py = 0; py < size; py++) {
      for (px = 0; px < size; px++) {
        var fx = px / size * 8, fy = py / size * 8;
        var n1 = GIR.fbm(fx, fy, 4, 8, seed);
        var n2 = GIR.fbm(fx * 2.7 + 10, fy * 2.7, 3, 8 * 2.7, seed + 3);
        var dirt = GIR.smoothstep(0.46, 0.62, n1 * 0.7 + n2 * 0.3);
        var straw = GIR.mixRGB([168, 143, 88], [126, 110, 62], n2);
        var pale = [196, 173, 132];
        var col = GIR.mixRGB(straw, pale, dirt * 0.8);
        var gr = (GIR.noise(px * 1.7, py * 1.7, 0, seed + 55) - 0.5) * 22;
        var o = (py * size + px) * 4;
        dd[o] = GIR.clamp(col[0] + gr, 0, 255);
        dd[o + 1] = GIR.clamp(col[1] + gr, 0, 255);
        dd[o + 2] = GIR.clamp(col[2] + gr * 0.8, 0, 255);
        dd[o + 3] = 255;
      }
    }
    ctx.putImageData(g, 0, 0);

    /* grass strokes + pebbles, drawn wrap-aware so the tile is seamless */
    var rng = GIR.mulberry32(seed + 9);
    var strokes = Math.floor(size * 2.6);
    ctx.lineCap = 'round';
    for (i = 0; i < strokes; i++) {
      var x = rng() * size, y = rng() * size, len = 3 + rng() * 12, ang = -Math.PI / 2 + (rng() - 0.5) * 2.2;
      var tone = GIR.mixRGB([190, 172, 96], [104, 96, 54], rng());
      GIR.stampWrapped(ctx, size, size, x, y, function (cc) {
        cc.strokeStyle = GIR.css(tone, 0.30 + rng() * 0.35);
        cc.lineWidth = 0.8 + rng() * 1.6;
        cc.beginPath();
        cc.moveTo(0, 0);
        cc.quadraticCurveTo(len * 0.4, -len * 0.5, Math.cos(ang) * len, Math.sin(ang) * len);
        cc.stroke();
      });
    }
    var pebbles = Math.floor(size * 0.35);
    for (i = 0; i < pebbles; i++) {
      var px2 = rng() * size, py2 = rng() * size, rr = 1 + rng() * 3.2;
      GIR.stampWrapped(ctx, size, size, px2, py2, function (cc) {
        cc.fillStyle = GIR.css(GIR.mixRGB([110, 96, 76], [60, 46, 34], rng()), 0.5 + rng() * 0.35);
        cc.beginPath(); cc.ellipse(0, 0, rr, rr * (0.6 + rng() * 0.5), rng() * 3.1, 0, 6.29); cc.fill();
      });
    }
    var dung = Math.floor(size * 0.05);
    for (i = 0; i < dung; i++) {
      var dx = rng() * size, dy = rng() * size, dr = 2 + rng() * 5;
      GIR.stampWrapped(ctx, size, size, dx, dy, function (cc) {
        cc.fillStyle = GIR.css([56, 40, 26], 0.55);
        cc.beginPath(); cc.arc(0, 0, dr, 0, 6.29); cc.fill();
      });
    }
    return tex(c.canvas, true, [1, 1]);
  };

  /* ------------------------------------------------------------ grass tuft */
  S.grassTuft = function (size) {
    size = size || 256;
    var c = GIR.canvas2d(size, size), ctx = c.ctx;
    ctx.clearRect(0, 0, size, size);
    var rng = GIR.mulberry32(8823);
    var base = size * 0.98;
    for (var i = 0; i < 46; i++) {
      var x = size * (0.08 + rng() * 0.84);
      var h = size * (0.25 + rng() * 0.72);
      var lean = (rng() - 0.5) * size * 0.35;
      var w = size * (0.006 + rng() * 0.012);
      var col = GIR.mixRGB([176, 156, 86], [122, 110, 58], rng());
      ctx.strokeStyle = GIR.css(col, 0.92);
      ctx.lineWidth = w * 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x + lean * 0.3, base - h * 0.6, x + lean, base - h);
      ctx.stroke();
      ctx.strokeStyle = GIR.css(GIR.mixRGB(col, [228, 214, 150], 0.5), 0.5);
      ctx.lineWidth = w * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.quadraticCurveTo(x + lean * 0.3, base - h * 0.6, x + lean, base - h);
      ctx.stroke();
    }
    var t = tex(c.canvas, true);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };

  /* ------------------------------------------------------------------ fur -- */
  /* mane / tail switch / ossicone tufts: streaked dark hair */
  S.fur = function (size, opts) {
    opts = opts || {};
    size = size || 256;
    var c = GIR.canvas2d(size, size), ctx = c.ctx;
    var base = opts.base || [78, 44, 26];
    var hi = opts.hi || [156, 96, 52];
    var g = ctx.createImageData(size, size), dd = g.data;
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var streak = GIR.fbm(px / size * 26, py / size * 1.4, 3, 26, 313);
        var tip = GIR.smoothstep(0.2, 1.0, py / size);
        var col = GIR.mixRGB(base, hi, streak * 0.8);
        col = GIR.mixRGB(col, [18, 14, 10], tip * (opts.darkTip || 0.15));
        var o = (py * size + px) * 4;
        dd[o] = col[0]; dd[o + 1] = col[1]; dd[o + 2] = col[2]; dd[o + 3] = 255;
      }
    }
    ctx.putImageData(g, 0, 0);
    return tex(c.canvas, true);
  };

  /* -------------------------------------------------------------- rock/bark */
  S.bark = function (size) {
    size = size || 256;
    var c = GIR.canvas2d(size, size), ctx = c.ctx;
    var g = ctx.createImageData(size, size), dd = g.data;
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var v = GIR.fbm(px / size * 5, py / size * 28, 4, 5, 611);
        var crack = GIR.smoothstep(0.42, 0.30, v);
        var col = GIR.mixRGB([104, 88, 70], [52, 42, 34], crack * 0.8 + (1 - v) * 0.3);
        var o = (py * size + px) * 4;
        dd[o] = col[0]; dd[o + 1] = col[1]; dd[o + 2] = col[2]; dd[o + 3] = 255;
      }
    }
    ctx.putImageData(g, 0, 0);
    return tex(c.canvas, true);
  };

  S.canopy = function (size) {
    size = size || 256;
    var c = GIR.canvas2d(size, size), ctx = c.ctx;
    var g = ctx.createImageData(size, size), dd = g.data;
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var v = GIR.fbm(px / size * 9, py / size * 9, 4, 9, 733);
        var v2 = GIR.noise(px * 0.6, py * 0.6, 0, 21);
        var col = GIR.mixRGB([58, 74, 40], [104, 118, 62], v * 0.7 + v2 * 0.3);
        var o = (py * size + px) * 4;
        dd[o] = col[0]; dd[o + 1] = col[1]; dd[o + 2] = col[2]; dd[o + 3] = 255;
      }
    }
    ctx.putImageData(g, 0, 0);
    return tex(c.canvas, true);
  };

})(window.GIR);
