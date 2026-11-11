/* Procedural textures: the reticulated giraffe coat, plus savanna ground,
   bark and grass. Everything is painted into 2D canvases at load time, so the
   page stays dependency free. */
(function (global) {
  'use strict';

  const U = global.GU;

  /* ---------------------------------------------------------------------
     Reticulated coat: a toroidally tileable Voronoi diagram. Chestnut
     polygons separated by narrow cream "reticulations".
     --------------------------------------------------------------------- */
  function buildCoat(size, cells, seed) {
    const rnd = U.makeRandom(seed);
    const cell = size / cells;

    // Jittered grid of Voronoi sites (reticulated patches are famously even
    // in size, so the jitter stays below half a cell).
    const sites = [];
    for (let gy = 0; gy < cells; gy++) {
      for (let gx = 0; gx < cells; gx++) {
        sites.push({
          x: (gx + 0.5 + (rnd() - 0.5) * 0.82) * cell,
          y: (gy + 0.5 + (rnd() - 0.5) * 0.82) * cell,
          gx: gx, gy: gy,
          // Per patch colour spread: some patches are nearly black-brown,
          // others are a light tawny.
          tone: rnd(),
          hue: rnd(),
          grain: rnd() * 64
        });
      }
    }
    const siteAt = (gx, gy) => sites[((gy % cells) + cells) % cells * cells +
      (((gx % cells) + cells) % cells)];

    const mapC = U.canvas(size), bumpC = U.canvas(size), roughC = U.canvas(size);
    const mapI = mapC.getContext('2d').createImageData(size, size);
    const bumpI = bumpC.getContext('2d').createImageData(size, size);
    const roughI = roughC.getContext('2d').createImageData(size, size);
    const mp = mapI.data, bp = bumpI.data, rp = roughI.data;

    const warpPeriod = 8;
    const warpScale = warpPeriod / size;
    const warpAmp = cell * 0.30;
    const edgeW = cell * 0.112;          // width of the cream reticulation

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Organic, wobbly patch borders via domain warping.
        const wx = U.tileFbm(x * warpScale, y * warpScale, warpPeriod, 3, seed + 3) - 0.5;
        const wy = U.tileFbm(x * warpScale + 11.7, y * warpScale + 5.3, warpPeriod, 3, seed + 9) - 0.5;
        const px = x + wx * 2 * warpAmp;
        const py = y + wy * 2 * warpAmp;

        const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
        let d1 = 1e9, d2 = 1e9, best = sites[0];
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const s = siteAt(cx + ox, cy + oy);
            // Unwrap the site into the neighbourhood of this pixel.
            let sx = s.x + Math.floor((cx + ox) / cells) * size;
            let sy = s.y + Math.floor((cy + oy) / cells) * size;
            const dx = px - sx, dy = py - sy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < d1) { d2 = d1; d1 = d; best = s; }
            else if (d < d2) { d2 = d; }
          }
        }

        // 0 inside a patch, 1 on the cream line between patches.
        const gap = U.smoothstep(1 - (d2 - d1) / edgeW);

        // Fine skin grain and a slight mottle inside each patch.
        const grain = U.tileFbm(x * (32 / size) + best.grain, y * (32 / size), 32, 3, seed + 21);
        const mottle = U.tileFbm(x * (6 / size), y * (6 / size), 6, 4, seed + 44);

        // Patch colour: dark chocolate through to tawny orange-brown.
        const t = U.clamp(best.tone * 0.75 + mottle * 0.45 - 0.05, 0, 1);
        let pr = U.lerp(104, 186, t) + (best.hue - 0.5) * 16;
        let pg = U.lerp(62, 123, t) + (best.hue - 0.5) * 9;
        let pb = U.lerp(34, 68, t);
        // Patch edges darken slightly before meeting the cream line.
        const rim = U.smoothstep(1 - (d2 - d1) / (edgeW * 3.2));
        const dk = 1 - rim * 0.16;
        pr *= dk; pg *= dk; pb *= dk;
        // Grain.
        const gmul = 0.90 + grain * 0.22;
        pr *= gmul; pg *= gmul; pb *= gmul;

        // Cream reticulation, warm off-white with its own grain.
        const cmul = 0.93 + grain * 0.16;
        const cr = 233 * cmul, cg = 216 * cmul, cb = 182 * cmul;

        const r = U.lerp(pr, cr, gap);
        const g = U.lerp(pg, cg, gap);
        const b = U.lerp(pb, cb, gap);

        const i = (y * size + x) * 4;
        mp[i] = r; mp[i + 1] = g; mp[i + 2] = b; mp[i + 3] = 255;

        // Bump: hide-like grain, with the reticulation sitting a touch lower.
        const h = 128 + (grain - 0.5) * 120 - gap * 46 + (mottle - 0.5) * 22;
        bp[i] = bp[i + 1] = bp[i + 2] = U.clamp(h, 0, 255); bp[i + 3] = 255;

        // Roughness: pale hair scatters more light, dark patches are oilier.
        const ro = U.lerp(0.80, 0.94, gap) + (grain - 0.5) * 0.10;
        const rv = U.clamp(ro, 0, 1) * 255;
        rp[i] = rp[i + 1] = rp[i + 2] = rv; rp[i + 3] = 255;
      }
    }

    mapC.getContext('2d').putImageData(mapI, 0, 0);
    bumpC.getContext('2d').putImageData(bumpI, 0, 0);
    roughC.getContext('2d').putImageData(roughI, 0, 0);

    const map = U.textureFromCanvas(mapC, 1, 16);
    map.colorSpace = THREE.SRGBColorSpace;
    return {
      map: map,
      bumpMap: U.textureFromCanvas(bumpC, 1, 16),
      roughnessMap: U.textureFromCanvas(roughC, 1, 16)
    };
  }

  /* --------------------------------------------------------------------- */
  function buildGround(size, seed) {
    const c = U.canvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = 16 / size;
        const n = U.tileFbm(x * s, y * s, 16, 5, seed);
        const n2 = U.tileFbm(x * (64 / size), y * (64 / size), 64, 3, seed + 7);
        const patchy = U.tileFbm(x * (4 / size), y * (4 / size), 4, 3, seed + 31);
        // Dry straw yellow with scuffed earth showing through.
        const dirt = U.smoothstep((patchy - 0.46) * 4);
        let r = U.lerp(150, 126, dirt), g = U.lerp(136, 98, dirt), b = U.lerp(86, 66, dirt);
        const v = 0.78 + n * 0.34 + (n2 - 0.5) * 0.20;
        const i = (y * size + x) * 4;
        d[i] = U.clamp(r * v, 0, 255);
        d[i + 1] = U.clamp(g * v, 0, 255);
        d[i + 2] = U.clamp(b * v * (0.96 + n2 * 0.1), 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = U.textureFromCanvas(c, 48, 16);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildBark(size, seed) {
    const c = U.canvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fissure = U.tileFbm(x * (6 / size), y * (26 / size), 6, 4, seed);
        const fine = U.tileFbm(x * (40 / size), y * (40 / size), 40, 3, seed + 5);
        const v = 0.55 + fissure * 0.7 + (fine - 0.5) * 0.25;
        const i = (y * size + x) * 4;
        d[i] = U.clamp(118 * v, 0, 255);
        d[i + 1] = U.clamp(102 * v, 0, 255);
        d[i + 2] = U.clamp(82 * v, 0, 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const t = U.textureFromCanvas(c, 1, 8);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* Soft tuft of grass blades on transparent background (alpha tested). */
  function buildGrassTuft(size, seed) {
    const c = U.canvas(size);
    const ctx = c.getContext('2d');
    const rnd = U.makeRandom(seed);
    ctx.clearRect(0, 0, size, size);
    const blades = 44;
    for (let i = 0; i < blades; i++) {
      const x0 = size * (0.14 + rnd() * 0.72);
      const h = size * (0.30 + rnd() * 0.66);
      const bend = (rnd() - 0.5) * size * 0.60;
      const w = size * (0.008 + rnd() * 0.013);
      const shade = 0.80 + rnd() * 0.30;
      const g = ctx.createLinearGradient(0, size, 0, size - h);
      g.addColorStop(0, `rgba(${(112 * shade) | 0},${(108 * shade) | 0},${(58 * shade) | 0},1)`);
      g.addColorStop(0.55, `rgba(${(166 * shade) | 0},${(156 * shade) | 0},${(94 * shade) | 0},1)`);
      g.addColorStop(1, `rgba(${(196 * shade) | 0},${(184 * shade) | 0},${(122 * shade) | 0},1)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = w * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, size);
      ctx.quadraticCurveTo(x0 + bend * 0.35, size - h * 0.62, x0 + bend, size - h);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /* Clumped acacia foliage, used as cross billboards in the canopy. */
  function buildLeafCluster(size, seed) {
    const c = U.canvas(size);
    const ctx = c.getContext('2d');
    const rnd = U.makeRandom(seed);
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 300; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.pow(rnd(), 0.6) * size * 0.46;
      const x = size / 2 + Math.cos(a) * r;
      const y = size / 2 + Math.sin(a) * r * 0.55;
      const s = size * (0.012 + rnd() * 0.022);
      const sh = 0.5 + rnd() * 0.5;
      ctx.fillStyle = `rgba(${(64 * sh) | 0},${(92 * sh) | 0},${(46 * sh) | 0},${0.75 + rnd() * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 2.2, s, a, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  global.Coat = {
    buildCoat: buildCoat,
    buildGround: buildGround,
    buildBark: buildBark,
    buildGrassTuft: buildGrassTuft,
    buildLeafCluster: buildLeafCluster
  };
})(window);
