/* textures.js — procedural coat and ground textures (seamless, no assets). */
(function (G) {
  'use strict';

  // Metres of model space covered by one coat-texture tile (patch size tuning).
  G.COAT_TILE = 1.05;

  // Value noise on a torus: seamless over [0,1)^2 with F integer cells.
  function torusNoiseTable(F, rand) {
    var t = [];
    for (var y = 0; y < F; y++) {
      var row = [];
      for (var x = 0; x < F; x++) row.push(rand());
      t.push(row);
    }
    return t;
  }
  function tNoise(tab, F, x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    var fx = x - ix, fy = y - iy;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var x0 = ((ix % F) + F) % F, y0 = ((iy % F) + F) % F;
    var x1 = (x0 + 1) % F, y1 = (y0 + 1) % F;
    var n00 = tab[y0][x0], n10 = tab[y0][x1], n01 = tab[y1][x0], n11 = tab[y1][x1];
    return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
  }

  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var a = s * Math.min(l, 1 - l);
    function f(n) {
      var k = (n + h * 12) % 12;
      return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
    }
    return [f(0), f(8), f(4)];
  }

  /*
   * Giraffe coat: warped Voronoi cells = dark patches, bright channels between.
   * Domain warp keeps the polygon edges organic; everything wraps seamlessly.
   */
  G.makeCoatCanvas = function (size) {
    size = size || 1024;
    var rand = G.rng(20261105);
    var SEEDS = 94, F_WARP = 4, F_DIRT = 10;
    var tabWx = torusNoiseTable(F_WARP, rand), tabWy = torusNoiseTable(F_WARP, rand);
    var tabDirt = torusNoiseTable(F_DIRT, rand);

    // seeds + per-patch colour
    var sx = [], sy = [], sr = [], sg = [], sb = [];
    for (var i = 0; i < SEEDS; i++) {
      sx.push(rand()); sy.push(rand());
      var l = 0.355 + (rand() - 0.5) * 0.14;
      if (rand() < 0.14) l *= 0.8;                       // some darker patches
      var rgb = hsl2rgb(27 + (rand() - 0.5) * 14, 0.55 + (rand() - 0.5) * 0.2, l);
      sr.push(rgb[0]); sg.push(rgb[1]); sb.push(rgb[2]);
    }
    // spatial buckets for nearest-cell lookup
    var B = 13, buckets = new Array(B * B);
    for (i = 0; i < B * B; i++) buckets[i] = [];
    for (i = 0; i < SEEDS; i++) {
      var bx = Math.min(B - 1, (sx[i] * B) | 0), by = Math.min(B - 1, (sy[i] * B) | 0);
      buckets[by * B + bx].push(i);
    }

    var cream = [0.845, 0.745, 0.545];
    var canvas = G.makeCanvas(size, size);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(size, size);
    var data = img.data;

    function wrapd(d) { if (d > 0.5) d -= 1; else if (d < -0.5) d += 1; return d; }

    for (var py = 0; py < size; py++) {
      var v = py / size;
      for (var px = 0; px < size; px++) {
        var u = px / size;
        // domain warp (keeps cell borders wiggly instead of straight)
        var wu = u + 0.045 * (tNoise(tabWx, F_WARP, u * F_WARP, v * F_WARP) - 0.5);
        var wv = v + 0.045 * (tNoise(tabWy, F_WARP, u * F_WARP, v * F_WARP) - 0.5);

        // nearest + second nearest seed distance (torus)
        var cx = Math.min(B - 1, (wu * B) | 0), cy = Math.min(B - 1, (wv * B) | 0);
        var d1 = 1e9, d2 = 1e9, id1 = 0;
        for (var oy = -1; oy <= 1; oy++) {
          for (var ox = -1; ox <= 1; ox++) {
            var cell = buckets[(((cy + oy) % B + B) % B) * B + ((cx + ox) % B + B) % B];
            for (var k = 0; k < cell.length; k++) {
              var s = cell[k];
              var dx = wrapd(wu - sx[s]), dy = wrapd(wv - sy[s]);
              var dd = dx * dx + dy * dy;
              if (dd < d1) { d2 = d1; d1 = dd; id1 = s; }
              else if (dd < d2) { d2 = dd; }
            }
          }
        }
        var edge = Math.sqrt(d2) - Math.sqrt(d1);
        edge += 0.006 * (tNoise(tabWx, F_WARP, u * 6 + 1.7, v * 6 + 3.1) - 0.5);

        var w = G.smoothstep((edge - 0.004) / 0.008);     // 1 = patch interior
        var dirt = 0.93 + 0.14 * tNoise(tabDirt, F_DIRT, u * F_DIRT, v * F_DIRT);
        var o = (py * size + px) * 4;
        data[o]     = 255 * dirt * (cream[0] * (1 - w) + sr[id1] * w);
        data[o + 1] = 255 * dirt * (cream[1] * (1 - w) + sg[id1] * w);
        data[o + 2] = 255 * dirt * (cream[2] * (1 - w) + sb[id1] * w);
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };

  /*
   * Dry savanna ground: sandy base + grain + blotches + grass tufts + pebbles.
   * All discrete marks are drawn toroidally, so the tile repeats seamlessly.
   */
  G.makeGroundCanvas = function (size) {
    size = size || 1024;
    var rand = G.rng(4242);
    var F1 = 6, F2 = 16;
    var tA = torusNoiseTable(F1, rand), tB = torusNoiseTable(F2, rand);

    var canvas = G.makeCanvas(size, size);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(size, size);
    var d = img.data;
    for (var py = 0; py < size; py++) {
      for (var px = 0; px < size; px++) {
        var u = px / size, v = py / size;
        var base = 0.80 + 0.16 * tNoise(tA, F1, u * F1, v * F1);
        base *= 0.94 + 0.12 * tNoise(tB, F2, u * F2, v * F2);
        base *= 0.96 + 0.08 * rand();                      // grain
        base *= 0.78;                                      // dry-season tone
        var o = (py * size + px) * 4;
        d[o]     = 255 * base * 0.805;
        d[o + 1] = 255 * base * 0.700;
        d[o + 2] = 255 * base * 0.505;
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    function torus(fn, x, y, m) {
      fn(x, y);
      if (x < m) fn(x + size, y); else if (x > size - m) fn(x - size, y);
      if (y < m) fn(x, y + size); else if (y > size - m) fn(x, y - size);
      if (x < m && y < m) fn(x + size, y + size);
      if (x > size - m && y < m) fn(x - size, y + size);
      if (x < m && y > size - m) fn(x + size, y - size);
      if (x > size - m && y > size - m) fn(x - size, y - size);
    }
    // dark soil blotches (soft, small, many — no crater-like discs)
    for (var i = 0; i < 40; i++) {
      var bx = rand() * size, by = rand() * size, br = size * (0.012 + rand() * 0.038);
      ctx.fillStyle = 'rgba(96,78,50,' + (0.04 + rand() * 0.07).toFixed(3) + ')';
      torus(function (x, y) {
        ctx.beginPath(); ctx.ellipse(x, y, br, br * (0.6 + rand() * 0.5), rand() * 3, 0, 7); ctx.fill();
      }, bx, by, br);
    }
    // dry grass tufts (little stroke fans)
    var tints = ['rgba(166,150,88,', 'rgba(142,138,74,', 'rgba(196,176,118,', 'rgba(120,116,66,'];
    for (i = 0; i < 850; i++) {
      var gx = rand() * size, gy = rand() * size, tint = tints[(rand() * 4) | 0];
      ctx.strokeStyle = tint + (0.25 + rand() * 0.35).toFixed(3) + ')';
      ctx.lineWidth = 1 + rand();
      var n = 3 + (rand() * 4) | 0, len = 4 + rand() * 9;
      torus(function (x, y) {
        for (var s = 0; s < n; s++) {
          var a = rand() * 6.283, r = len * (0.5 + rand() * 0.5);
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5 - 2,
                               x + Math.cos(a) * r, y + Math.sin(a) * r);
          ctx.stroke();
        }
      }, gx, gy, len + 2);
    }
    // pebbles
    for (i = 0; i < 220; i++) {
      var rx = rand() * size, ry = rand() * size, rr = 1.2 + rand() * 3.2;
      ctx.fillStyle = 'rgba(150,140,120,' + (0.3 + rand() * 0.3).toFixed(3) + ')';
      torus(function (x, y) {
        ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 0.7, rand() * 3, 0, 7); ctx.fill();
      }, rx, ry, rr + 2);
    }
    return canvas;
  };

  G.makeTextures = function (renderer) {
    var maxAniso = renderer.capabilities.getMaxAnisotropy();
    var coatTex = new THREE.CanvasTexture(G.makeCoatCanvas(1024));
    coatTex.wrapS = coatTex.wrapT = THREE.RepeatWrapping;
    coatTex.encoding = THREE.sRGBEncoding;
    coatTex.anisotropy = Math.min(8, maxAniso);

    var groundTex = new THREE.CanvasTexture(G.makeGroundCanvas(1024));
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.encoding = THREE.sRGBEncoding;
    groundTex.anisotropy = Math.min(8, maxAniso);

    return { coat: coatTex, ground: groundTex };
  };
})(window.G);
