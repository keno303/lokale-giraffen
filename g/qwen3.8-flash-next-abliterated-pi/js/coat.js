/* coat.js -- procedural canvas textures (no external image files, so file:// works) */
(function (G) {
  'use strict';

  // deterministic little PRNG so the coat looks the same on every reload
  G.rng = function (seed) {
    var s = (seed || 1) >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  function canvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function tex(c, repeat) {
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(repeat || 1, repeat || 1);
    t.anisotropy = 8;
    return t;
  }

  function blobPath(x, cx, cy, r, radii, wob, rot) {
    var n = radii.length, i, a, rr, px, py;
    x.beginPath();
    for (i = 0; i <= n; i++) {
      a = (i % n) / n * Math.PI * 2 + rot;
      rr = r * radii[i % n] * (1 + wob * Math.sin(a * 3.1 + rot * 2));
      px = cx + Math.cos(a) * rr;
      py = cy + Math.sin(a) * rr * 0.94;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.closePath();
  }

  /* ---- giraffe coat: reticulated patches on a cream ground ---- */
  G.coatCanvas = function (o) {
    o = o || {};
    var S = o.size || 1024, c = canvas(S), x = c.getContext('2d');
    var rnd = G.rng(o.seed || 11);
    var cells = o.cells || 8, cell = S / cells;
    var pal = o.palette || ['#8a5124', '#965c2a', '#7c4720', '#a06a30', '#8d5526', '#9c6330'];
    var i, j, k;

    x.fillStyle = o.base || '#e9d6ad';
    x.fillRect(0, 0, S, S);

    // jittered, periodic patch grid
    var grid = [];
    for (j = 0; j < cells; j++) {
      grid[j] = [];
      for (i = 0; i < cells; i++) {
        var rad = [], nb = 11 + ((rnd() * 4) | 0);
        for (k = 0; k < nb; k++) rad.push(0.80 + rnd() * 0.34);
        grid[j][i] = {
          x: (i + 0.5 + (rnd() - 0.5) * 0.75) * cell,
          y: (j + 0.5 + (rnd() - 0.5) * 0.75) * cell,
          r: cell * (o.patch || (0.50 + rnd() * 0.10)),
          col: pal[(rnd() * pal.length) | 0],
          rot: rnd() * 6.283,
          rad: rad,
          tint: 0.82 + rnd() * 0.36
        };
      }
    }

    function drawPatch(p, ox, oy) {
      var g = x.createRadialGradient(p.x + ox - p.r * 0.25, p.y + oy - p.r * 0.3, p.r * 0.1, p.x + ox, p.y + oy, p.r * 1.25);
      var t = p.tint;
      g.addColorStop(0, shade(p.col, 1.14 * t + 0.10));
      g.addColorStop(0.62, shade(p.col, t));
      g.addColorStop(1, shade(p.col, 0.82 * t));
      x.fillStyle = g;
      blobPath(x, p.x + ox, p.y + oy, p.r, p.rad, 0.05, p.rot);
      x.fill();
    }

    // draw every patch with the 3x3 wrap offsets so the texture tiles seamlessly
    var ox, oy, q;
    for (j = 0; j < cells; j++) {
      for (i = 0; i < cells; i++) {
        q = grid[j][i];
        for (oy = -1; oy <= 1; oy++) {
          for (ox = -1; ox <= 1; ox++) {
            drawPatch(q, ox * S, oy * S);
          }
        }
      }
    }

    // dark "crack" shading where patches meet
    x.globalAlpha = 0.16;
    x.strokeStyle = '#4a2c14';
    x.lineWidth = Math.max(2, S / 260);
    for (j = 0; j < cells; j++) {
      for (i = 0; i < cells; i++) {
        var q2 = grid[j][i];
        blobPath(x, q2.x, q2.y, q2.r * 1.04, q2.rad, 0.05, q2.rot);
        x.stroke();
      }
    }
    x.globalAlpha = 1;

    // speckle noise for hair grain
    var n2 = (S * S / 90) | 0;
    for (k = 0; k < n2; k++) {
      var v = rnd();
      x.fillStyle = 'rgba(' + (v > 0.5 ? '255,240,215,' : '70,42,20,') + (0.02 + rnd() * 0.07) + ')';
      x.fillRect(rnd() * S, rnd() * S, 1.6, 1.6);
    }
    return c;
  };

  function shade(hex, f) {
    var r = parseInt(hex.substr(1, 2), 16), g = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
    r = Math.max(0, Math.min(255, r * f)) | 0;
    g = Math.max(0, Math.min(255, g * f)) | 0;
    b = Math.max(0, Math.min(255, b * f)) | 0;
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  G.coatTexture = function (seed) {
    return tex(G.coatCanvas({ seed: seed || 11 }), 1);
  };

  /* pale coat of the lower legs / belly: cream with small faint spots */
  G.paleCanvas = function (o) {
    o = o || {};
    var S = 512, c = canvas(S), x = c.getContext('2d'), rnd = G.rng(o.seed || 5);
    x.fillStyle = '#efe0c0'; x.fillRect(0, 0, S, S);
    var i, k;
    for (i = 0; i < 90; i++) {
      var rad = [];
      for (k = 0; k < 9; k++) rad.push(0.75 + rnd() * 0.5);
      var r = 9 + rnd() * 17;
      x.fillStyle = 'rgba(150,102,55,' + (0.16 + rnd() * 0.36) + ')';
      blobPath(x, rnd() * S, rnd() * S, r, rad, 0.1, rnd() * 6.28);
      x.fill();
    }
    var n = 9000;
    for (i = 0; i < n; i++) {
      x.fillStyle = 'rgba(90,60,30,' + (rnd() * 0.05) + ')';
      x.fillRect(rnd() * S, rnd() * S, 1.5, 1.5);
    }
    return c;
  };

  /* savanna ground */
  G.groundCanvas = function (o) {
    o = o || {};
    var S = 512, c = canvas(S), x = c.getContext('2d'), rnd = G.rng(o.seed || 3), i, k;
    x.fillStyle = '#bda86e'; x.fillRect(0, 0, S, S);

    // broad dry-grass colour patches
    for (i = 0; i < 70; i++) {
      var r = 30 + rnd() * 110;
      var g = x.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, r);
      var cols = ['#c9b47a', '#ad9a5e', '#8f9050', '#d6c48c', '#9c8a52'];
      g.addColorStop(0, cols[(rnd() * cols.length) | 0]);
      g.addColorStop(1, 'rgba(190,170,110,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
    }
    // grass strokes
    x.lineCap = 'round';
    for (i = 0; i < 5200; i++) {
      var px = rnd() * S, py = rnd() * S, a = -1.57 + (rnd() - 0.5) * 1.5, L = 3 + rnd() * 9;
      var pal = ['#cbb679', '#bda669', '#a89a58', '#d8c795', '#94895a', '#c6a967'];
      x.strokeStyle = pal[(rnd() * pal.length) | 0];
      x.globalAlpha = 0.35 + rnd() * 0.5;
      x.lineWidth = 0.8 + rnd() * 1.1;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke();
    }
    x.globalAlpha = 1;
    // a few dark seeds / pebbles
    for (i = 0; i < 260; i++) {
      x.fillStyle = 'rgba(70,52,30,' + (0.1 + rnd() * 0.3) + ')';
      x.beginPath(); x.arc(rnd() * S, rnd() * S, 0.8 + rnd() * 2.2, 0, 6.283); x.fill();
    }
    return c;
  };

  /* grass tuft billboard (with alpha) */
  G.tuftCanvas = function (o) {
    o = o || {};
    var S = 128, c = canvas(S), x = c.getContext('2d'), rnd = G.rng(o.seed || 9);
    x.clearRect(0, 0, S, S);
    var i, n = 26;
    for (i = 0; i < n; i++) {
      var bx = 12 + rnd() * (S - 24), by = S - 4;
      var h = S * (0.35 + rnd() * 0.6);
      var lean = (rnd() - 0.5) * S * 0.5;
      var pal = ['#d3bf83', '#c0aa66', '#aaa05c', '#e0cfa0', '#9c9356'];
      x.strokeStyle = pal[(rnd() * pal.length) | 0];
      x.lineWidth = 2.6 + rnd() * 3.0;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(bx, by);
      x.quadraticCurveTo(bx + lean * 0.4, by - h * 0.6, bx + lean, by - h);
      x.stroke();
    }
    return c;
  };

  /* flat-topped acacia foliage (alpha card) */
  G.leafCanvas = function (o) {
    o = o || {};
    var S = 256, c = canvas(S), x = c.getContext('2d'), rnd = G.rng(o.seed || 21);
    x.clearRect(0, 0, S, S);
    var i, k;
    for (i = 0; i < 900; i++) {
      var a = rnd() * 6.283, r = Math.pow(rnd(), 0.55) * S * 0.46;
      var px = S / 2 + Math.cos(a) * r, py = S / 2 + Math.sin(a) * r * 0.62;
      var g = ['rgba(86,104,48,', 'rgba(110,126,60,', 'rgba(66,84,40,', 'rgba(140,150,78,', 'rgba(120,110,58,'];
      x.fillStyle = g[(rnd() * g.length) | 0] + (0.35 + rnd() * 0.55) + ')';
      x.beginPath();
      x.ellipse(px, py, 3 + rnd() * 9, 2 + rnd() * 5, rnd() * 3, 0, 6.283);
      x.fill();
    }
    return c;
  };

  G.texFrom = function (c, repeat) { return tex(c, repeat); };

})(window.G = window.G || {});
