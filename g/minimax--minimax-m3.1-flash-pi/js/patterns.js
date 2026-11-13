/* patterns.js — procedural canvas textures (giraffe coat, ground, sky helpers) */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function canvas2d(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return { c, x: c.getContext('2d') };
  }

  function tex(canvas, repeatX, repeatY, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX === undefined ? 1 : repeatX, repeatY === undefined ? 1 : repeatY);
    t.anisotropy = 8;
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  /* ------------------------------------------------------------------ *
   *  Giraffe coat: irregular brown patches on a warm tan base.       *
   *  Patterns tile seamlessly (patches are drawn with wrap-around).   *
   * ------------------------------------------------------------------ */
  function coatTexture(opts) {
    const o = Object.assign({
      size: 1024,
      count: 150,
      minR: 26,
      maxR: 62,
      base: '#e9cb95',
      seed: 7,
      edge: 'rgba(70,38,16,0.55)',
      outline: 4,
    }, opts || {});
    const { c, x } = canvas2d(o.size, o.size);
    const rnd = mulberry32(o.seed);

    // base coat with subtle mottling
    x.fillStyle = o.base;
    x.fillRect(0, 0, o.size, o.size);
    for (let i = 0; i < 900; i++) {
      const r = 6 + rnd() * 40;
      x.globalAlpha = 0.05 + rnd() * 0.06;
      x.fillStyle = rnd() > 0.5 ? '#d8b57c' : '#f3dcb0';
      x.beginPath();
      x.ellipse(rnd() * o.size, rnd() * o.size, r, r * (0.5 + rnd()), rnd() * 3.14, 0, 6.283);
      x.fill();
    }
    x.globalAlpha = 1;

    // helper: an irregular, softly angular patch
    function patch(cx, cy, r) {
      const n = 6 + Math.floor(rnd() * 4);
      const rot = rnd() * 6.283;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * 6.283;
        const rr = r * (0.84 + rnd() * 0.32);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.93]);
      }
      // smooth the polygon through the midpoints of its edges
      x.beginPath();
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let m = mid(pts[n - 1], pts[0]);
      x.moveTo(m[0], m[1]);
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const m2 = mid(p, pts[(i + 1) % n]);
        x.quadraticCurveTo(p[0], p[1], m2[0], m2[1]);
        m = m2;
      }
      x.closePath();
      const l = 0.80 + rnd() * 0.40;
      const rr = Math.floor(124 * l), gg = Math.floor(70 * l), bb = Math.floor(33 * l);
      x.fillStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')';
      x.fill();
      x.lineWidth = o.outline;
      x.lineJoin = 'round';
      x.strokeStyle = o.edge;
      x.stroke();
    }

    // patches (drawn with wrap-around copies so the tile is seamless)
    for (let i = 0; i < o.count; i++) {
      const cx = rnd() * o.size;
      const cy = rnd() * o.size;
      const r = o.minR + rnd() * (o.maxR - o.minR);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const px = cx + dx * o.size, py = cy + dy * o.size;
          if (px < -o.maxR * 1.5 || px > o.size + o.maxR * 1.5) continue;
          if (py < -o.maxR * 1.5 || py > o.size + o.maxR * 1.5) continue;
          patch(px, py, r);
        }
      }
    }

    // fine skin noise
    const img = x.getImageData(0, 0, o.size, o.size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 13;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  /* small-scale skin/fur bump (greyscale) */
  function furBumpTexture(size, seed) {
    const { c, x } = canvas2d(size, size);
    const rnd = mulberry32(seed || 3);
    x.fillStyle = '#808080';
    x.fillRect(0, 0, size, size);
    for (let i = 0; i < size * 6; i++) {
      const px = rnd() * size, py = rnd() * size;
      const l = rnd();
      x.strokeStyle = l > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)';
      x.lineWidth = 0.8 + rnd() * 1.6;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (rnd() - 0.5) * 9, py + (rnd() - 0.5) * 9);
      x.stroke();
    }
    return c;
  }

  /* ------------------------------------------------------------------ *
   *  Savanna ground: dry earth + sun-bleached grass, tileable         *
   * ------------------------------------------------------------------ */
  function groundTexture(size) {
    size = size || 1024;
    const { c, x } = canvas2d(size, size);
    const rnd = mulberry32(21);
    x.fillStyle = '#9c8a5e';
    x.fillRect(0, 0, size, size);

    // broad tonal patches
    for (let i = 0; i < 260; i++) {
      const r = 30 + rnd() * 190;
      x.globalAlpha = 0.10 + rnd() * 0.18;
      const t = rnd();
      x.fillStyle = t < 0.4 ? '#8a7444' : (t < 0.75 ? '#b3a06f' : '#c4b184');
      x.beginPath();
      x.ellipse(rnd() * size, rnd() * size, r, r * (0.4 + rnd() * 0.9), rnd() * 3.14, 0, 6.283);
      x.fill();
    }
    // dry grass strokes
    x.globalAlpha = 0.5;
    for (let i = 0; i < 5200; i++) {
      const px = rnd() * size, py = rnd() * size;
      const len = 3 + rnd() * 12;
      const a = rnd() * 6.283;
      x.strokeStyle = rnd() > 0.5 ? '#a89a63' : '#7d6b41';
      x.lineWidth = 0.7 + rnd() * 1.1;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      x.stroke();
    }
    // pebbles / dirt specks
    x.globalAlpha = 0.45;
    for (let i = 0; i < 900; i++) {
      x.fillStyle = rnd() > 0.6 ? '#6f5c37' : '#c0ad83';
      const r = 0.6 + rnd() * 2.4;
      x.beginPath();
      x.arc(rnd() * size, rnd() * size, r, 0, 6.283);
      x.fill();
    }
    x.globalAlpha = 1;
    return c;
  }

  /* soft radial sprite used for dust */
  function puffTexture(size) {
    size = size || 128;
    const { c, x } = canvas2d(size, size);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    // break the perfect circle a little
    const rnd = mulberry32(5);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      x.globalAlpha = 0.10 + rnd() * 0.18;
      x.beginPath();
      x.arc(rnd() * size, rnd() * size, size * (0.06 + rnd() * 0.14), 0, 6.283);
      x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    return c;
  }

  global.Patterns = {
    mulberry32,
    canvas2d,
    tex,
    coatTexture,
    furBumpTexture,
    groundTexture,
    puffTexture,
  };
})(window);
