// textures.js — procedural canvas textures for the giraffe scene.
// Everything is generated at runtime, so index.html works straight from
// the file system (file://) with no server and no external image files.
(function () {
  'use strict';

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Draw one irregular, rounded patch (giraffe coat patches are rounded
  // polygons, roughly 0.25-0.4 m across on a 1 m texture tile).
  function patch(ctx, x, y, r, fill, line) {
    var n = 10, pts = [], i, ang, rad;
    for (i = 0; i < n; i++) {
      ang = (i / n) * Math.PI * 2 + rand(-0.14, 0.14);
      rad = r * rand(0.72, 1.18);
      pts.push([x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * 0.94]);
    }
    ctx.beginPath();
    var mx = (pts[n - 1][0] + pts[0][0]) / 2, my = (pts[n - 1][1] + pts[0][1]) / 2;
    ctx.moveTo(mx, my);
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n];
      ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (line) {
      ctx.strokeStyle = line;
      ctx.lineWidth = r * 0.16;
      ctx.stroke();
    }
  }

  // Giraffe coat: cream background with irregular brown network patches.
  // One tile covers ~1 m of hide. Wraps horizontally (drawn twice at the
  // edges) so it looks continuous on cylinders.
  function spotCanvas(size) {
    var c = canvas(size, size), ctx = c.getContext('2d');
    var palette = ['#8a5a2b', '#7c4e23', '#96632f', '#6f4520', '#8f6636', '#835427'];
    ctx.fillStyle = '#e6cf9d';
    ctx.fillRect(0, 0, size, size);
    var cells = 5, cell = size / cells, i, j, x, y, r;
    for (j = 0; j < cells; j++) {
      for (i = 0; i < cells; i++) {
        x = (i + 0.5) * cell + rand(-0.22, 0.22) * cell + (j % 2 ? cell * 0.5 : 0);
        y = (j + 0.5) * cell + rand(-0.22, 0.22) * cell;
        if (x > size + cell) continue;
        r = cell * rand(0.34, 0.44);
        var col = palette[(Math.random() * palette.length) | 0];
        if (x < r + 4) patch(ctx, x + size, y, r, col, null);
        if (x > size - r - 4) patch(ctx, x - size, y, r, col, null);
        patch(ctx, x, y, r, col, null);
      }
    }
    // A few small filler patches between the big ones.
    for (i = 0; i < 10; i++) {
      x = rand(0, size); y = rand(0, size); r = cell * rand(0.10, 0.18);
      patch(ctx, x, y, r, palette[(Math.random() * palette.length) | 0], null);
    }
    // Subtle grain so the hide is not perfectly flat colour.
    for (i = 0; i < 2600; i++) {
      ctx.fillStyle = Math.random() < 0.5
        ? 'rgba(70,45,20,0.05)' : 'rgba(255,246,220,0.06)';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    return c;
  }

  // Dry savanna ground. One tile covers ~4 m. Wraps in both directions.
  function groundCanvas(size) {
    var c = canvas(size, size), ctx = c.getContext('2d'), i, x, y;
    ctx.fillStyle = '#ad9768';
    ctx.fillRect(0, 0, size, size);
    for (i = 0; i < 46; i++) { // soft mottling
      x = rand(0, size); y = rand(0, size);
      var r = rand(size * 0.04, size * 0.12);
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(120,98,58,0.10)' : 'rgba(222,205,160,0.10)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (i = 0; i < 3200; i++) { // speckle
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(80,62,34,0.10)' : 'rgba(240,228,190,0.12)';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    for (i = 0; i < 260; i++) { // dry grass strokes
      x = rand(0, size); y = rand(0, size);
      var l = rand(4, 12), a = rand(-1.2, 1.2);
      ctx.strokeStyle = Math.random() < 0.7 ? 'rgba(122,116,64,0.55)' : 'rgba(160,140,80,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y - Math.abs(Math.sin(a)) * l);
      ctx.stroke();
    }
    return c;
  }

  // Dirt track the giraffe walks along. Tile covers ~1 m along the track.
  function trackCanvas(size) {
    var c = canvas(size, size), ctx = c.getContext('2d'), i;
    ctx.fillStyle = '#b6a077';
    ctx.fillRect(0, 0, size, size);
    for (i = 0; i < 3000; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(96,76,44,0.09)' : 'rgba(238,226,196,0.11)';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    for (i = 0; i < 22; i++) { // faint wheel ruts / pebbles
      ctx.fillStyle = 'rgba(90,72,42,0.25)';
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, rand(1.5, 4), 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  }

  // Vertical gradient used as scene background (sky).
  function skyCanvas() {
    var c = canvas(8, 256), ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.0, '#6f9cc0');
    g.addColorStop(0.45, '#b9cfd8');
    g.addColorStop(0.75, '#e5dcbd');
    g.addColorStop(1.0, '#efe4c6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    return c;
  }

  window.Textures = {
    spot: spotCanvas,
    ground: groundCanvas,
    track: trackCanvas,
    sky: skyCanvas
  };
})();
