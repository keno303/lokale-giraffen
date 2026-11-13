// Procedural giraffe texture atlas (canvas-based, no external assets).
// One master "skin" pattern is painted once and region-cropped into the atlas
// so patches flow continuously across body, neck and head.
// Atlas layout (UV space):
//   top-left quadrant     : body/neck/head skin
//   top-right quadrant    : leg skin (paler, smaller patches)
//   bottom-left quadrant  : mane hair
//   bottom-right quadrant : solid zones (ossicone, hoof, muzzle, eye, ...)

const ATLAS = {
  BODY: { u0: 0.0, v0: 0.5, u1: 1.0, v1: 1.0 },
  LEG: { u0: 0.0, v0: 0.0, u1: 0.5, v1: 0.5 },
  MANE: { u0: 0.5, v0: 0.0, u1: 1.0, v1: 0.5 },
  OSSICONE: { u0: 0.52, v0: 0.30, u1: 0.68, v1: 0.46 },
  HOOF: { u0: 0.72, v0: 0.30, u1: 0.88, v1: 0.46 },
  MUZZLE: { u0: 0.52, v0: 0.06, u1: 0.68, v1: 0.22 },
  EYE: { u0: 0.72, v0: 0.06, u1: 0.88, v1: 0.22 },
  EYELIGHT: { u0: 0.92, v0: 0.06, u1: 1.0, v1: 0.14 },
  NOSTRIL: { u0: 0.92, v0: 0.30, u1: 1.0, v1: 0.38 },
  HORNKNOB: { u0: 0.92, v0: 0.42, u1: 1.0, v1: 0.50 },
};

// Gentle painting of the neutral (line) color along the seam edges of a patch
// region so that opposite u-edges match in color.
function paintSeamBlend(ctx, x0, y0, w, h, lineColor, frac) {
  const px = Math.max(2, Math.round(w * frac));
  const gradL = ctx.createLinearGradient(x0, 0, x0 + px, 0);
  gradL.addColorStop(0, `rgba(${lineColor[0]},${lineColor[1]},${lineColor[2]},1)`);
  gradL.addColorStop(1, `rgba(${lineColor[0]},${lineColor[1]},${lineColor[2]},0)`);
  ctx.fillStyle = gradL;
  ctx.fillRect(x0, y0, px, h);
  const gradR = ctx.createLinearGradient(x0 + w, 0, x0 + w - px, 0);
  gradR.addColorStop(0, `rgba(${lineColor[0]},${lineColor[1]},${lineColor[2]},1)`);
  gradR.addColorStop(1, `rgba(${lineColor[0]},${lineColor[1]},${lineColor[2]},0)`);
  ctx.fillStyle = gradR;
  ctx.fillRect(x0 + w - px, y0, px, h);
}

// Reticulated giraffe pattern: dark polygonal patches separated by light
// cream lines (Voronoi borders of seeded points), with soft edges and
// organic irregularity from domain-warped coordinates.
function paintReticulated(ctx, x0, y0, w, h, opts) {
  const { seedCount, spotColor, lineColor, seed, edgeSoft, warp } = opts;
  const rnd = mulberry32(seed);
  const cw = Math.max(1, Math.round(Math.sqrt(seedCount * w / h)));
  const ch = Math.max(1, Math.round(seedCount / cw));
  const cellW = w / cw, cellH = h / ch;
  const seeds = new Array(cw * ch);
  for (let gy = 0; gy < ch; gy++) {
    for (let gx = 0; gx < cw; gx++) {
      // jittered grid -> roughly uniform patch size, organic placement
      seeds[gy * cw + gx] = {
        x: x0 + (gx + 0.18 + rnd() * 0.64) * cellW,
        y: y0 + (gy + 0.18 + rnd() * 0.64) * cellH,
        w: 0.8 + rnd() * 0.45,
      };
    }
  }
  const img = ctx.getImageData(x0, y0, w, h);
  const d = img.data;
  for (let py = 0; py < h; py++) {
    const sy = y0 + py;
    const gyBase = Math.floor(py / cellH);
    for (let px = 0; px < w; px++) {
      const sx = x0 + px;
      // domain warp for organic wobble of the borders
      const wx = warp * (Math.sin(sx * 0.055 + sy * 0.031) + 0.5 * Math.sin(sy * 0.097 + 1.7));
      const wy = warp * (Math.cos(sy * 0.049 + sx * 0.027 + 2.3) + 0.5 * Math.sin(sx * 0.083 + 4.1));
      const qx = sx + wx, qy = sy + wy;
      const gxBase = Math.floor(px / cellW);
      let best = 1e18, best2 = 1e18;
      // visit each nearby cell exactly once (clamping indices, no duplicates)
      const gy0 = Math.max(0, gyBase - 1), gy1 = Math.min(ch - 1, gyBase + 1);
      const gx0 = Math.max(0, gxBase - 1), gx1 = Math.min(cw - 1, gxBase + 1);
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const cell = seeds[gy * cw + gx];
          const dx = cell.x - qx, dy = cell.y - qy;
          const dist = Math.sqrt(dx * dx + dy * dy) / cell.w;
          if (dist < best) { best2 = best; best = dist; }
          else if (dist < best2) best2 = dist;
        }
      }
      const border = best2 - best; // ~0 on a Voronoi edge
      const mix = Math.min(1, Math.max(0, border / edgeSoft));
      const idx = (py * w + px) * 4;
      // per-patch tone variation from the nearest seed's position
      const tone = 0.92 + 0.13 * ((Math.sin(best * 97.13 + sx * 0.021) * 43758.5453) % 1 + 1) / 2;
      d[idx] = lineColor[0] + (spotColor[0] * tone - lineColor[0]) * mix;
      d[idx + 1] = lineColor[1] + (spotColor[1] * tone - lineColor[1]) * mix;
      d[idx + 2] = lineColor[2] + (spotColor[2] * tone - lineColor[2]) * mix;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, x0, y0);
}

function fillZone(ctx, zone, color, textureSize) {
  const x = zone.u0 * textureSize;
  const y = (1 - zone.v1) * textureSize;
  const w = (zone.u1 - zone.u0) * textureSize;
  const h = (zone.v1 - zone.v0) * textureSize;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildGiraffeTexture() {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');

  // master skin pattern, painted to an offscreen canvas then cropped
  const master = document.createElement('canvas');
  master.width = 768; master.height = 768;
  const mctx = master.getContext('2d');
  paintReticulated(mctx, 0, 0, 768, 768, {
    seedCount: 150, spotColor: [150, 92, 38], lineColor: [233, 214, 170],
    seed: 1337, edgeSoft: 3.2, warp: 5.0,
  });

  // body skin: full master (top-left quadrant)
  ctx.drawImage(master, 0, 0, 768, 768, 0, 0, S / 2, S / 2);
  // neck/head skin: 60% zoomed crop (top-right quadrant)
  ctx.drawImage(master, 150, 150, 460, 460, S / 2, 0, S / 2, S / 2);
  paintSeamBlend(ctx, S / 2, 0, S / 2, S / 2, [233, 214, 170], 0.05);
  // leg skin (bottom-left quadrant): paler, zoomed way in so patches are small
  paintReticulated(ctx, 0, S / 2, S / 2, S / 2, {
    seedCount: 48, spotColor: [166, 110, 55], lineColor: [222, 198, 152],
    seed: 909, edgeSoft: 2.2, warp: 1.6,
  });
  paintSeamBlend(ctx, 0, S / 2, S / 2, S / 2, [222, 198, 152], 0.05);

  // ---- mane (bottom-right quadrant region 0.5..1 u, 0..0.5 v) ---------
  {
    const x0 = S / 2, y0 = S / 2, w = S / 2, h = S / 2;
    const img = ctx.getImageData(x0, y0, w, h);
    const d = img.data;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const n = Math.sin(px * 0.55 + Math.sin(py * 0.09) * 5.0) * 0.5 + 0.5;
        const streak = n * 0.6 + 0.2;
        const idx = (py * w + px) * 4;
        d[idx] = 74 * streak + 16;
        d[idx + 1] = 46 * streak + 11;
        d[idx + 2] = 28 * streak + 8;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, x0, y0);
    // fine hair strands aligned along the tuft direction (u axis)
    const rnd2 = mulberry32(555);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 260; i++) {
      const sy = y0 + rnd2() * h;
      const sx = x0 + rnd2() * w;
      const len = 30 + rnd2() * 120;
      const shade = 30 + rnd2() * 90;
      ctx.strokeStyle = `rgba(${shade + 30},${shade * 0.62 | 0},${shade * 0.38 | 0},0.35)`;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + len, sy + (rnd2() - 0.5) * 6);
      ctx.stroke();
    }
  }

  // solid zones (all inside the bottom-right quadrant)
  fillZone(ctx, ATLAS.OSSICONE, '#8a5a26', S);
  fillZone(ctx, ATLAS.HORNKNOB, '#3e2712', S);
  fillZone(ctx, ATLAS.HOOF, '#2e2119', S);
  fillZone(ctx, ATLAS.MUZZLE, '#b98d5e', S);
  fillZone(ctx, ATLAS.NOSTRIL, '#241a12', S);
  fillZone(ctx, ATLAS.EYE, '#171008', S);
  fillZone(ctx, ATLAS.EYELIGHT, '#f2ead6', S);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Value-noise ground texture.
function buildGroundTexture() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const rnd = mulberry32(777);
  const N = 64;
  const grid = new Float32Array((N + 1) * (N + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const sample = (x, y) => {
    const gx = Math.floor(x * N) % N, gy = Math.floor(y * N) % N;
    const fx = x * N - Math.floor(x * N), fy = y * N - Math.floor(y * N);
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const i00 = grid[gy * (N + 1) + gx], i10 = grid[gy * (N + 1) + gx + 1];
    const i01 = grid[(gy + 1) * (N + 1) + gx], i11 = grid[(gy + 1) * (N + 1) + gx + 1];
    return (i00 * (1 - sx) + i10 * sx) * (1 - sy) + (i01 * (1 - sx) + i11 * sx) * sy;
  };
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const u = px / S, v = py / S;
      const n = 0.55 * sample(u, v) + 0.28 * sample(u * 2 % 1, v * 2 % 1) + 0.17 * sample(u * 4 % 1, v * 4 % 1);
      const n2 = sample(u * 8 % 1, v * 8 % 1);
      const base = 132 + n * 70 + n2 * 22;
      const idx = (py * S + px) * 4;
      // dry savanna grass: warm olive-gold
      d[idx] = base * 0.72;
      d[idx + 1] = base * 0.66;
      d[idx + 2] = base * 0.36;
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = 8;
  return tex;
}
