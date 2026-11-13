/* =========================================================================
   textures.js — everything is generated procedurally on a 2D canvas.
   No external image assets, no network access needed.
   ========================================================================= */
(function (global) {
  'use strict';

  const U = global.U;
  const T = {};

  const CREAM = [206, 188, 148];
  const BROWNS = [
    [78, 50, 27],   // deep chestnut
    [104, 66, 33],  // mid brown
    [128, 86, 43],  // lighter tan brown
    [90, 57, 30],   // warm brown
    [117, 76, 38]
  ];

  /* ---------------------------------------------------------------------
     The giraffe coat: cellular "jigsaw" patches of brown separated by
     cream seams.  Tiles seamlessly in both directions.
     --------------------------------------------------------------------- */
  T.makeCoat = function (opts) {
    opts = opts || {};
    const size = opts.size || 1024;
    const cells = opts.cells || 9;
    const jitter = opts.jitter !== undefined ? opts.jitter : 0.95;
    const seed = opts.seed || 1;
    const edgeW = opts.edgeW !== undefined ? opts.edgeW : 0.115;   // seam width (cell units)
    const fur = opts.fur !== undefined ? opts.fur : 1;

    const cv = U.canvas(size, size);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const px = img.data;

    const height = new Float32Array(size * size);
    const rough = new Float32Array(size * size);

    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * inv, v = y * inv;
        const c = U.cellular(u, v, cells, cells, jitter, seed);
        const seam = c.d2 - c.d1;

        // wobbly seam threshold -> ragged, organic patch borders
        const wob = U.fbmTile(u, v, 3, seed + 31, 24) * 0.9 + 0.30 +
          U.fbmTile(u, v, 2, seed + 313, 96) * 0.45;
        const th = edgeW * wob;
        const patchT = U.smoothstep((seam - th * 0.5) / (th * 1.7));

        // per patch colour
        const hv = U.hash1(c.id, seed + 5);
        let base;
        if (hv < 0.42) base = BROWNS[0];
        else if (hv < 0.68) base = BROWNS[1];
        else if (hv < 0.86) base = BROWNS[2];
        else if (hv < 0.95) base = BROWNS[3];
        else base = BROWNS[4];

        // gentle radial shading inside the patch (domed look)
        const radial = U.clamp(c.d1 / 0.75, 0, 1);
        const shade = 1.05 - 0.12 * radial * radial;

        // fine fur / skin noise
        const f1 = U.fbmTile(u, v, 3, seed + 91, 160) - 0.5;
        const f2 = U.fbmTile(u, v, 2, seed + 411, 380) - 0.5;
        const fn = f1 * 0.85 + f2 * 0.55;

        let col;
        if (patchT > 0.5) {
          col = U.mixRGB(CREAM, [base[0] * shade, base[1] * shade, base[2] * shade], patchT);
        } else {
          // the seam itself is bare cream skin, slightly darker in its centre
          const seamDark = 0.92 - 0.10 * U.smoothstep(1 - patchT * 2);
          col = [CREAM[0] * seamDark, CREAM[1] * seamDark, CREAM[2] * seamDark];
        }
        const bright = 1 + fn * 0.10 * fur * (0.4 + 0.6 * patchT);
        const i = (y * size + x) * 4;
        px[i] = U.clamp(col[0] * bright, 0, 255);
        px[i + 1] = U.clamp(col[1] * bright, 0, 255);
        px[i + 2] = U.clamp(col[2] * bright, 0, 255);
        px[i + 3] = 255;

        // height: patches are slightly raised, seams recessed; plus fur grain
        let h = Math.sqrt(patchT);
        h += fn * 0.13 * fur;
        height[y * size + x] = h;

        // roughness: bare skin in the seams is a touch glossier than fur
        rough[y * size + x] = U.clamp(0.86 - 0.22 * (1 - patchT) + fn * 0.06, 0.25, 1);
      }
    }
    ctx.putImageData(img, 0, 0);

    const nrmCv = U.heightToNormal(height, size, size, 2.6);

    const rghCv = U.canvas(size, size);
    const rctx = rghCv.getContext('2d');
    const rimg = rctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const r = rough[i] * 255;
      rimg.data[i * 4] = r; rimg.data[i * 4 + 1] = r; rimg.data[i * 4 + 2] = r; rimg.data[i * 4 + 3] = 255;
    }
    rctx.putImageData(rimg, 0, 0);

    return { canvas: cv, normalCanvas: nrmCv, roughCanvas: rghCv };
  };

  /* ---------------------------------------------------------------------
     Head: same patch language up top, fading to plain tan muzzle.
     v = 0 at the poll (top of the skull) -> v = 1 at the nose.
     --------------------------------------------------------------------- */
  T.makeHead = function (opts) {
    opts = opts || {};
    const size = opts.size || 768;
    const cells = opts.cells || 11;
    const seed = opts.seed || 77;

    const cv = U.canvas(size, size);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const px = img.data;
    const height = new Float32Array(size * size);

    const tan = [140, 101, 62];
    const tanLight = [163, 124, 83];
    const nose = [72, 54, 42];

    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * inv;
        // canvas rows run top->bottom while texture v runs bottom->top
        const v = 1 - y * inv;
        const c = U.cellular(u, v, cells, cells, 0.9, seed);
        const seam = c.d2 - c.d1;
        const wob = U.fbmTile(u, v, 3, seed + 12, 30) * 0.8 + 0.4;
        const th = 0.10 * wob;
        const patchT = U.smoothstep((seam - th * 0.5) / (th * 2.0));

        // how much pattern survives at this point of the face
        const pattern = U.clamp(1.0 - U.smoothstep((v - 0.42) / 0.52), 0, 1);
        const base = BROWNS[1];
        const radial = U.clamp(c.d1 / 0.7, 0, 1);
        const shade = 1.05 - 0.18 * radial * radial;
        const patchCol = [base[0] * shade, base[1] * shade, base[2] * shade];

        const skin = U.mixRGB(tan, tanLight, U.smoothstep((v - 0.45) / 0.5));
        const skinCol = U.mixRGB(skin, nose, U.smoothstep((v - 0.88) / 0.14));

        let col = U.mixRGB(skinCol, patchCol, patchT * pattern);
        // pale rings around the nostrils / muzzle edge
        const f1 = U.fbmTile(u, v, 3, seed + 300, 180) - 0.5;
        const f2 = U.fbmTile(u, v, 2, seed + 500, 60) - 0.5;
        const bright = 1 + (f1 * 0.8 + f2 * 0.4) * 0.09;
        const i = (y * size + x) * 4;
        px[i] = U.clamp(col[0] * bright, 0, 255);
        px[i + 1] = U.clamp(col[1] * bright, 0, 255);
        px[i + 2] = U.clamp(col[2] * bright, 0, 255);
        px[i + 3] = 255;

        height[y * size + x] = Math.sqrt(patchT * pattern) + f1 * 0.12;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: cv, normalCanvas: U.heightToNormal(height, size, size, 2.4) };
  };

  /* ---------------------------------------------------------------------
     Ground: dry savannah soil with pebbles and dry grass flecks.
     --------------------------------------------------------------------- */
  T.makeGround = function (opts) {
    opts = opts || {};
    const size = opts.size || 1024;
    const seed = opts.seed || 313;
    const cv = U.canvas(size, size);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    const px = img.data;
    const height = new Float32Array(size * size);

    const inv = 1 / size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x * inv, v = y * inv;
        const big = U.fbmTile(u, v, 4, seed, 5);
        const mid = U.fbmTile(u, v, 3, seed + 17, 28);
        const fine = U.fbmTile(u, v, 2, seed + 71, 150);
        let t = big * 0.55 + mid * 0.3 + fine * 0.15;

        let r = 168, g = 143, b = 106;
        const dry = [190, 162, 112];
        const dark = [104, 85, 60];
        const grass = [154, 143, 84];
        let col = U.mixRGB(dark, dry, U.smoothstep((t - 0.26) / 0.48));
        // patches of dry grass
        const gpatch = U.fbmTile(u, v, 2, seed + 404, 7);
        col = U.mixRGB(col, grass, U.smoothstep((gpatch - 0.52) / 0.22) * 0.75);

        // scattered pebbles
        const p = U.cellular(u, v, 42, 42, 0.95, seed + 900);
        if (p.d1 < 0.20 && U.hash1(p.id, seed + 901) > 0.55) {
          const k = U.clamp((0.20 - p.d1) / 0.20, 0, 1);
          const pebble = U.mixRGB([124, 114, 100], [166, 158, 144], U.hash1(p.id, seed + 55));
          col = U.mixRGB(col, pebble, k * 0.85);
        }
        const bright = 0.80 + 0.34 * fine;
        const i = (y * size + x) * 4;
        px[i] = U.clamp(col[0] * bright, 0, 255);
        px[i + 1] = U.clamp(col[1] * bright, 0, 255);
        px[i + 2] = U.clamp(col[2] * bright, 0, 255);
        px[i + 3] = 255;
        height[y * size + x] = t * 0.6 + fine * 0.4;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: cv, normalCanvas: U.heightToNormal(height, size, size, 1.1) };
  };

  /* ---------------------------------------------------------------------
     Equirectangular sky used to build the environment map (PMREM).
     --------------------------------------------------------------------- */
  T.makeSky = function (opts) {
    opts = opts || {};
    const w = 1024, h = 512;
    const cv = U.canvas(w, h);
    const ctx = cv.getContext('2d');

    // vertical gradient: zenith -> horizon -> ground
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#1f5da6');
    g.addColorStop(0.26, '#4b8ccd');
    g.addColorStop(0.42, '#8fb9de');
    g.addColorStop(0.49, '#c9dcea');
    g.addColorStop(0.505, '#d9d3bd');
    g.addColorStop(0.55, '#b09b78');
    g.addColorStop(0.78, '#87724f');
    g.addColorStop(1.00, '#584a36');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // sun
    const sx = w * 0.68, sy = h * 0.22;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 130);
    sg.addColorStop(0, 'rgba(255,252,235,1)');
    sg.addColorStop(0.10, 'rgba(255,244,205,0.95)');
    sg.addColorStop(0.35, 'rgba(255,232,180,0.28)');
    sg.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 140, sy - 140, 280, 280);

    // soft cloud banding
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 40; i++) {
      const cy = h * (0.06 + Math.random() * 0.34);
      const cw = 60 + Math.random() * 190;
      const cx = Math.random() * w;
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw);
      cg.addColorStop(0, 'rgba(255,255,255,0.9)');
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, cw * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return cv;
  };

  /* ---------------------------------------------------------------------
     A single grass blade sprite (alpha) for the ground tufts.
     --------------------------------------------------------------------- */
  T.makeGrassBlade = function (size) {
    size = size || 64;
    const cv = U.canvas(size, size);
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const rnd = U.mulberry32(9);
    for (let i = 0; i < 7; i++) {
      const x0 = size * (0.15 + 0.7 * rnd());
      const w = size * (0.035 + 0.04 * rnd());
      const lean = (rnd() - 0.5) * size * 0.5;
      const h = size * (0.55 + 0.45 * rnd());
      const grd = ctx.createLinearGradient(0, size, 0, size - h);
      grd.addColorStop(0, '#5d6b2c');
      grd.addColorStop(0.6, '#8d8f3c');
      grd.addColorStop(1, '#c8b45a');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(x0 - w, size);
      ctx.quadraticCurveTo(x0 - w * 0.4 + lean * 0.5, size - h * 0.6, x0 + lean, size - h);
      ctx.quadraticCurveTo(x0 + w * 0.4 + lean * 0.5, size - h * 0.6, x0 + w, size);
      ctx.closePath();
      ctx.fill();
    }
    return cv;
  };

  global.Tex = T;
})(window);
