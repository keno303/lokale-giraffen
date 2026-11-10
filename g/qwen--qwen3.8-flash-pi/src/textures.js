/* giraffe-world / textures.js — everything drawn procedurally into canvases,
   so the page has zero external asset requests and still works from file:// . */
(function (root) {
  'use strict';
  var GW = root.GW, M = GW.math;

  /* ======================================================= giraffe coat ====
     Weighted / jittered Voronoi on a wrapping lattice: sharp cream network
     around irregular chestnut blotches, exactly what a reticulated giraffe
     looks like. Returns { color, bump } canvases.                        */
  function coatTile(o) {
    var size = o.size || 512;
    var cells = o.cells || 8;               /* blotches across the tile     */
    var cell = size / cells;
    var rnd = GW.Rand(o.seed || 7);
    var pal = o.palette;                     /* [[r,g,b], ...]               */

    var sx = [], sy = [], sw = [], sc = [];
    for (var gy = 0; gy < cells; gy++) {
      for (var gx = 0; gx < cells; gx++) {
        var i = gy * cells + gx;
        sx[i] = (gx + 0.18 + rnd() * 0.64) * cell;
        sy[i] = (gy + 0.18 + rnd() * 0.64) * cell;
        sw[i] = (o.minW + rnd() * (o.maxW - o.minW)) * cell;   /* grow/shrink */
        sc[i] = pal[(rnd() * pal.length) | 0];
      }
    }

    var cv = GW.canvas(size, size), ctx = cv.getContext('2d');
    var img = ctx.createImageData(size, size);
    var data = img.data;
    var bv = GW.canvas(size, size), bctx = bv.getContext('2d');
    var bimg = bctx.createImageData(size, size);
    var bdata = bimg.data;

    var line = o.line || [238, 226, 198];
    var back = o.back || [214, 194, 152];
    var sharp = o.sharp || 0.035;          /* boundary softness, in cells  */
    var thresh = o.thresh || 0.10;

    for (var y = 0; y < size; y++) {
      var cy = Math.floor(y / cell);
      for (var x = 0; x < size; x++) {
        var cx = Math.floor(x / cell);
        var d1 = 1e9, d2 = 1e9, best = null;
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var jx = (cx + ox + cells) % cells;
            var jy = (cy + oy + cells) % cells;
            var j = jy * cells + jx;
            /* wrapped pixel -> seed delta */
            var dx = sx[j] - x + ox * 0;
            var dy = sy[j] - y;
            if (dx > cell * 1.5) dx -= size; else if (dx < -cell * 1.5) dx += size;
            if (dy > cell * 1.5) dy -= size; else if (dy < -cell * 1.5) dy += size;
            var d = Math.sqrt(dx * dx + dy * dy) - sw[j];
            if (d < d1) { d2 = d1; best = j; d1 = d; }
            else if (d < d2) { d2 = d; }
          }
        }
        var n = GW.fbm(x / size, y / size, 16, 4, 3 + (best || 0) * 0);
        var edge = (d2 - d1) / cell + (n - 0.5) * sharp * 2.2;
        var t = M.smoothstep(thresh - sharp, thresh + sharp, edge);  /* 1 = blotch */

        var col;
        if (t > 0.5) {
          var base = sc[best || 0];
          var inner = M.clamp01(1 - d1 / (cell * 0.85));
          col = GW.mixRGB(base, o.patchDeep || [58, 34, 20], inner * 0.28 + (n - 0.5) * 0.16);
        } else {
          col = GW.mixRGB(line, back, M.clamp01((0.5 - t) * 2 * 0.85 + (n - 0.5) * 0.3));
        }
        /* faint speckle so large flat areas never look like plastic */
        var sp = (GW.hash2(x, y, size, 91) - 0.5) * 13;
        var k = (y * size + x) * 4;
        data[k] = M.clamp(col[0] + sp, 0, 255);
        data[k + 1] = M.clamp(col[1] + sp, 0, 255);
        data[k + 2] = M.clamp(col[2] + sp, 0, 255);
        data[k + 3] = 255;

        /* bump: blotches sit a hair above the pale network, hair whorls on top */
        var h = 128 + (t - 0.5) * 96 + (n - 0.5) * 40 + (GW.hash2(x, y, size, 17) - 0.5) * 18;
        bdata[k] = bdata[k + 1] = bdata[k + 2] = M.clamp(h, 0, 255);
        bdata[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    bctx.putImageData(bimg, 0, 0);

    /* soft vertical streaks: dirt / wear, keeps the tile from looking flat */
    ctx.globalAlpha = 0.10;
    for (var s = 0; s < 40; s++) {
      ctx.fillStyle = s % 2 ? '#6b4a24' : '#f2e6c8';
      ctx.fillRect(rnd() * size, 0, 1 + rnd() * 3, size);
    }
    ctx.globalAlpha = 1;
    return { color: cv, bump: bv };
  }

  var COAT = {
    /* big body blotches */
    body: function () {
      return coatTile({
        size: 640, cells: 6, seed: 12, minW: 0.06, maxW: 0.23, thresh: 0.098, sharp: 0.045,
        palette: [[150, 94, 47], [134, 81, 41], [164, 108, 56], [118, 70, 37], [143, 89, 45]],
        line: [224, 210, 182], back: [204, 184, 143], patchDeep: [66, 38, 20]
      });
    },
    /* neck + shoulders: slightly smaller, more elongated */
    neck: function () {
      return coatTile({
        size: 512, cells: 7, seed: 31, minW: 0.05, maxW: 0.20, thresh: 0.105, sharp: 0.04,
        palette: [[148, 92, 46], [132, 80, 40], [162, 106, 54], [118, 70, 36]],
        patchDeep: [60, 34, 18], line: [238, 226, 198], back: [212, 190, 146]
      });
    },
    /* upper legs: small rounded patches */
    leg: function () {
      return coatTile({
        size: 512, cells: 10, seed: 55, minW: 0.04, maxW: 0.16, thresh: 0.095, sharp: 0.03,
        palette: [[142, 88, 44], [126, 76, 38], [156, 100, 50]],
        patchDeep: [58, 32, 16], line: [234, 220, 192], back: [206, 184, 140]
      });
    },
    /* below the knee: pale "socks", barely-there shadow patches */
    socks: function () {
      return coatTile({
        size: 384, cells: 8, seed: 78, minW: 0.02, maxW: 0.13, thresh: 0.115, sharp: 0.02,
        palette: [[206, 186, 150], [196, 174, 136], [216, 198, 164]],
        patchDeep: [176, 150, 112], line: [244, 236, 216], back: [234, 222, 196]
      });
    },
    /* face + ears: fine, dense, warm-toned */
    face: function () {
      return coatTile({
        size: 384, cells: 11, seed: 91, minW: 0.03, maxW: 0.14, thresh: 0.10, sharp: 0.03,
        palette: [[158, 104, 56], [142, 92, 48], [176, 124, 72]],
        patchDeep: [70, 42, 22], line: [238, 224, 196], back: [212, 188, 144]
      });
    }
  };
  GW.Textures = GW.Textures || {};
  GW.Textures.coat = COAT;

  /* ---------------------------------------------------- plain hide / skin --
     soft mottled noise for muzzle, ears, hooves, hooves' keratin, etc.     */
  function mottle(o) {
    var size = o.size || 256, cv = GW.canvas(size, size), ctx = cv.getContext('2d');
    var img = ctx.createImageData(size, size), d = img.data;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var n = GW.fbm(x / size, y / size, o.period || 8, 4, o.seed || 1);
        var f = GW.fbm(x / size, y / size, (o.period || 8) * 4, 3, (o.seed || 1) + 5);
        var v = M.clamp01(n * 0.6 + f * 0.4);
        var col = GW.mixRGB(o.a, o.b, v);
        var k = (y * size + x) * 4;
        d[k] = M.clamp(col[0], 0, 255); d[k + 1] = M.clamp(col[1], 0, 255);
        d[k + 2] = M.clamp(col[2], 0, 255); d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }
  GW.Textures.skin = function () {
    return mottle({ size: 256, period: 8, seed: 4, a: [92, 62, 46], b: [146, 112, 86] });
  };
  GW.Textures.muzzle = function () {
    return mottle({ size: 256, period: 6, seed: 21, a: [112, 96, 88], b: [172, 150, 134] });
  };
  GW.Textures.hoof = function () {
    var cv = mottle({ size: 256, period: 4, seed: 8, a: [26, 22, 20], b: [78, 62, 48] });
    var ctx = cv.getContext('2d');
    ctx.globalAlpha = 0.20;
    for (var i = 0; i < 40; i++) {          /* growth rings / keratin fibres */
      ctx.strokeStyle = i % 2 ? '#000' : '#8a7458';
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(0, i * 6 + 4); ctx.lineTo(256, i * 6 + 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return cv;
  };
  GW.Textures.hair = function () {      /* dark tuft colour with strand streaks */
    var cv = mottle({ size: 128, period: 4, seed: 33, a: [22, 17, 14], b: [66, 50, 36] });
    var ctx = cv.getContext('2d');
    ctx.globalAlpha = 0.35;
    for (var i = 0; i < 120; i++) {
      ctx.strokeStyle = Math.random() > 0.5 ? '#0b0908' : '#6c5338';
      ctx.beginPath();
      var x = Math.random() * 128;
      ctx.moveTo(x, 0); ctx.lineTo(x + (Math.random() - 0.5) * 10, 128);
      ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return cv;
  };

  /* ------------------------------------------------------------- ground ====
     dry savanna: baked earth, dust, straw litter, sparse green.            */
  GW.Textures.ground = function () {
    var size = 512, cv = GW.canvas(size, size), ctx = cv.getContext('2d');
    var img = ctx.createImageData(size, size), d = img.data;
    var dark = [110, 88, 58], mid = [170, 142, 96], pale = [206, 184, 138];
    var green = [138, 140, 78], straw = [198, 172, 112];
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var big = GW.fbm(x / size, y / size, 4, 4, 2);        /* patches      */
        var fine = GW.fbm(x / size, y / size, 32, 4, 11);     /* grain        */
        var grit = GW.hash2(x, y, size, 5);
        var t = M.clamp01(big * 1.25 - 0.12);
        var col = t < 0.5 ? GW.mixRGB(dark, mid, t * 2) : GW.mixRGB(mid, pale, (t - 0.5) * 2);
        col = GW.mixRGB(col, fine > 0.62 ? straw : green, M.clamp01(fine - 0.45) * 0.5);
        var k = (y * size + x) * 4;
        var g = (grit - 0.5) * 26;
        d[k] = M.clamp(col[0] + g, 0, 255);
        d[k + 1] = M.clamp(col[1] + g, 0, 255);
        d[k + 2] = M.clamp(col[2] + g * 0.8, 0, 255);
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    /* a few pebbles and dung pellets for scale */
    for (var i = 0; i < 90; i++) {
      var px = Math.random() * size, py = Math.random() * size;
      ctx.fillStyle = 'rgba(120,104,84,0.55)';
      ctx.beginPath(); ctx.ellipse(px, py, 1 + Math.random() * 3, 0.8 + Math.random() * 2, Math.random(), 0, 6.3); ctx.fill();
    }
    return cv;
  };

  GW.Textures.groundBump = function () {
    var size = 512, cv = GW.canvas(size, size), ctx = cv.getContext('2d');
    var img = ctx.createImageData(size, size), d = img.data;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var n = GW.fbm(x / size, y / size, 8, 4, 7);
        var f = GW.fbm(x / size, y / size, 48, 3, 19);
        var v = M.clamp(n * 120 + f * 90 + GW.hash2(x, y, size, 3) * 40, 0, 255);
        var k = (y * size + x) * 4;
        d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };

  /* ----------------------------------------------------- grass tuft sprite =
     alpha-tested straw blades, one texture, many instanced quads.          */
  GW.Textures.grass = function (o) {
    o = o || {};
    var S = 128, cv = GW.canvas(S, S), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    var rnd = GW.Rand(o.seed || 3);
    var n = o.blades || 16;
    for (var i = 0; i < n; i++) {
      var bx = S * (0.12 + rnd() * 0.76);
      var bend = (rnd() - 0.5) * S * 0.5;
      var h = S * (0.45 + rnd() * 0.5);
      var w = 2 + rnd() * 3.2;
      var g = rnd();
      var col = g > 0.72 ? [150, 150, 74] : (g > 0.3 ? [190, 168, 104] : [172, 142, 86]);
      ctx.strokeStyle = 'rgb(' + col.join(',') + ')';
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx, S);
      ctx.quadraticCurveTo(bx + bend * 0.35, S - h * 0.6, bx + bend, S - h);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    return cv;
  };

  /* ----------------------------------------------------------- dust puff == */
  GW.Textures.dust = function () {
    var S = 64, cv = GW.canvas(S, S), ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(226,206,168,0.85)');
    g.addColorStop(0.45, 'rgba(214,192,152,0.35)');
    g.addColorStop(1, 'rgba(210,188,148,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return cv;
  };

  /* ------------------------------------------------------------- sky ======
     vertical gradient + sun glow; mapped on a big inverted sphere.         */
  GW.Textures.sky = function (o) {
    o = o || {};
    var W = 512, H = 256, cv = GW.canvas(W, H), ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0.00, o.top || '#2f6698');
    g.addColorStop(0.30, o.mid || '#79a8cd');
    g.addColorStop(0.58, o.low || '#c3d6de');
    g.addColorStop(0.74, o.horizon || '#e6d6b4');
    g.addColorStop(0.86, o.ground || '#d3bd94');
    g.addColorStop(1.00, o.under || '#b89a72');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    /* haze banding */
    ctx.globalAlpha = 0.10;
    for (var i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#c9b894';
      ctx.fillRect(0, H * (0.5 + i * 0.02), W, 1 + (i % 3));
    }
    ctx.globalAlpha = 1;
    var sg = ctx.createRadialGradient(W * 0.18, H * 0.72, 2, W * 0.18, H * 0.72, H * 0.5);
    sg.addColorStop(0, 'rgba(255,248,224,0.9)');
    sg.addColorStop(0.25, 'rgba(255,232,180,0.25)');
    sg.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    return cv;
  };

  GW.Textures.blob = function () {
    var S = 128, cv = GW.canvas(S, S), ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(40,28,16,0.95)');
    g.addColorStop(0.45, 'rgba(48,34,20,0.55)');
    g.addColorStop(0.78, 'rgba(60,44,26,0.18)');
    g.addColorStop(1, 'rgba(60,44,26,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    return cv;
  };

  /* acacia canopy: leafy alpha so the shade under a tree is dappled       */
  GW.Textures.leaf = function (o) {
    o = o || {};
    var S = 256, cv = GW.canvas(S, S), ctx = cv.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    var rnd = GW.Rand(o.seed || 13);
    ctx.fillStyle = '#fff';
    for (var i = 0; i < 900; i++) {
      var x = rnd() * S, y = rnd() * S, r = 1.6 + rnd() * 3.6;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3.14, 0, 6.3); ctx.fill();
    }
    /* keep the middle solid so the canopy never turns into swiss cheese */
    var g = ctx.createRadialGradient(S / 2, S / 2, S * 0.16, S / 2, S / 2, S * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'source-over';
    return cv;
  };
  GW.Textures.leafColour = function () {
    return mottle({ size: 256, period: 8, seed: 63, a: [78, 92, 44], b: [140, 152, 86] });
  };

  /* ------------------------------------------------------------- bark ==== */
  GW.Textures.bark = function () {
    var cv = mottle({ size: 128, period: 6, seed: 71, a: [104, 92, 76], b: [162, 146, 120] });
    var ctx = cv.getContext('2d');
    ctx.globalAlpha = 0.5;
    for (var i = 0; i < 70; i++) {
      ctx.strokeStyle = Math.random() > 0.4 ? '#3b2f24' : '#a89474';
      ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath();
      var x = Math.random() * 128;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 8, 40, x - 8, 90, x + 4, 128);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return cv;
  };
})(typeof window !== 'undefined' ? window : globalThis);
