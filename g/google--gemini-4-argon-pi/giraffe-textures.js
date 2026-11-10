// giraffe-textures.js
// High-resolution procedural coat, fur-normal, roughness, eye, and foliage textures for Giraffa camelopardalis

(function (global) {
  'use strict';

  // Deterministic fast hash & value/gradient noise for organic Voronoi & FBM domain warping
  function hash2(x, y, seed) {
    let h = Math.imul(x ^ seed, 374761393) + Math.imul(y ^ (seed * 13), 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function hash2Vec(ix, iy, seed) {
    const h1 = hash2(ix, iy, seed);
    const h2 = hash2(ix + 193, iy + 389, seed + 71);
    return [h1, h2];
  }

  function smoothstep(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function valueNoise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const n00 = hash2(ix, iy, seed);
    const n10 = hash2(ix + 1, iy, seed);
    const n01 = hash2(ix, iy + 1, seed);
    const n11 = hash2(ix + 1, iy + 1, seed);
    return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy);
  }

  // Tileable in X (periodic with periodX) value noise so U=0 and U=1 wrap seamlessly!
  function valueNoisePeriodicX(x, y, periodX, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const px0 = ((ix % periodX) + periodX) % periodX;
    const px1 = (((ix + 1) % periodX) + periodX) % periodX;
    const n00 = hash2(px0, iy, seed);
    const n10 = hash2(px1, iy, seed);
    const n01 = hash2(px0, iy + 1, seed);
    const n11 = hash2(px1, iy + 1, seed);
    return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy);
  }

  function fbmPeriodicX(u, v, baseFreqX, baseFreqY, octaves, seed) {
    let sum = 0;
    let amp = 0.5;
    let freqX = baseFreqX;
    let freqY = baseFreqY;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * valueNoisePeriodicX(u * freqX, v * freqY, Math.round(freqX), seed + i * 31);
      norm += amp;
      amp *= 0.5;
      freqX *= 2;
      freqY *= 2;
    }
    return sum / norm;
  }

  // Voronoi F1 / F2 cellular distance with true distance-to-edge (Worley/Voronoi border distance)
  // Periodic in X with integer cell count cellsX so there is zero seam at u = 0 / u = 1
  function voronoiGiraffe(u, v, cellsX, cellsY, jitter, seed) {
    const x = u * cellsX;
    const y = v * cellsY;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;

    let minDist1 = 999;
    let minVecX = 0;
    let minVecY = 0;
    let bestCellId = 0;

    // Pass 1: find closest cell center
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = (((ix + dx) % cellsX) + cellsX) % cellsX;
        const cy = iy + dy;
        const [jx, jy] = hash2Vec(cx, cy, seed);
        const rx = dx + 0.5 + (jx - 0.5) * jitter - fx;
        const ry = dy + 0.5 + (jy - 0.5) * jitter - fy;
        const d = rx * rx + ry * ry;
        if (d < minDist1) {
          minDist1 = d;
          minVecX = rx;
          minVecY = ry;
          bestCellId = hash2(cx + 17, cy + 53, seed + 99);
        }
      }
    }

    // Pass 2: true perpendicular distance to closest Voronoi cell boundary (gives uniform channel width!)
    let minEdgeDist = 999;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const cx = (((ix + dx) % cellsX) + cellsX) % cellsX;
        const cy = iy + dy;
        const [jx, jy] = hash2Vec(cx, cy, seed);
        const rx = dx + 0.5 + (jx - 0.5) * jitter - fx;
        const ry = dy + 0.5 + (jy - 0.5) * jitter - fy;
        const diffX = rx - minVecX;
        const diffY = ry - minVecY;
        const diffLenSq = diffX * diffX + diffY * diffY;
        if (diffLenSq > 0.00001) {
          const diffLen = Math.sqrt(diffLenSq);
          const edgeDist = (0.5 * (minVecX + rx) * diffX + 0.5 * (minVecY + ry) * diffY) / diffLen;
          if (edgeDist < minEdgeDist) {
            minEdgeDist = edgeDist;
          }
        }
      }
    }

    return {
      edgeDist: minEdgeDist,
      centerDist: Math.sqrt(minDist1),
      cellId: bestCellId
    };
  }

  // Presets for the 3 iconic giraffe coat patterns
  const SUBSPECIES_PRESETS = {
    reticulated: {
      name: 'Reticulated (G. c. reticulata)',
      channelBase: [242, 224, 192],     // Creamy warm parchment network
      channelShadow: [215, 182, 138],   // Tawny-gold border transition
      patchOuter: [152, 68, 28],        // Rich russet-chestnut outer polygon
      patchCore: [92, 34, 14],          // Deep mahogany-umber core
      bellyColor: [246, 236, 218],      // Warm ivory underbelly
      stockingColor: [228, 202, 162],   // Tawny-cream lower legs
      channelWidth: 0.105,
      edgeSoftness: 0.045,
      jaggedAmp: 0.032,
      jitter: 0.82
    },
    rothschild: {
      name: "Rothschild's (G. c. rothschildi)",
      channelBase: [236, 212, 170],     // Warm buff-fawn channels
      channelShadow: [204, 166, 118],
      patchOuter: [138, 66, 30],        // Warm burnt sienna
      patchCore: [74, 30, 14],          // Dark chocolate center with faint pale fissures
      bellyColor: [244, 232, 210],
      stockingColor: [242, 228, 202],   // Iconic pale cream stockings below the knees
      channelWidth: 0.145,
      edgeSoftness: 0.065,
      jaggedAmp: 0.058,
      jitter: 0.88
    },
    masai: {
      name: 'Masai (G. c. tippelskirchi)',
      channelBase: [224, 194, 142],     // Warm tawny-ochre background
      channelShadow: [192, 152, 102],
      patchOuter: [116, 54, 24],        // Dark umber-brown star/vine leaf blotches
      patchCore: [58, 24, 12],          // Nearly black-brown center
      bellyColor: [236, 218, 186],
      stockingColor: [212, 182, 134],
      channelWidth: 0.185,
      edgeSoftness: 0.075,
      jaggedAmp: 0.095,                 // Deeply serrated oak-leaf / star edges
      jitter: 0.92
    }
  };

  // Sample coat RGB, roughness, and height at UV for either 'body' or 'limb'
  function evaluateCoatPoint(u, v, part, preset, seed) {
    // Symmetrize or keep natural organic wrap across u in [0, 1]
    // u = 0 & 1 is ventral midline, u = 0.5 is dorsal midline
    const distFromVentral = Math.abs(u - 0.5) * 2.0; // 0 at dorsal (u=0.5), 1 at ventral (u=0 or 1)
    const ventralProximity = 1.0 - Math.abs(u - 0.5) * 2.0; // 1 at dorsal, 0 at ventral

    // Multi-frequency domain warp for organic cellular shapes
    const warpX = (fbmPeriodicX(u, v, 8, 12, 3, seed + 11) - 0.5) * 0.06;
    const warpY = (fbmPeriodicX(u, v, 8, 12, 3, seed + 29) - 0.5) * 0.06;
    const jaggedNoise = (fbmPeriodicX(u, v, 24, 36, 3, seed + 53) - 0.5) * preset.jaggedAmp;
    const furGrain = fbmPeriodicX(u, v * 3.5, 96, 160, 2, seed + 101) - 0.5;

    let r = preset.channelBase[0];
    let g = preset.channelBase[1];
    let b = preset.channelBase[2];
    let rough = 0.78;
    let height = 0.5 + furGrain * 0.12;

    if (part === 'body') {
      // Body v regions:
      // 0.00..0.08: Rump / tail base
      // 0.08..0.42: Pelvis, flank, ribcage, shoulder hump
      // 0.42..0.80: Cervical neck (C7 -> C1)
      // 0.80..0.91: Head / cranium / cheeks / eye sockets
      // 0.91..1.00: Nasal bridge -> Muzzle / lips / nostrils

      // Blend between 3 Voronoi scales along the body so patches are large on torso/lower neck,
      // medium on upper neck/rump, and fine freckles on the head/cheeks!
      let cellA, cellB, blendFactor;
      if (v < 0.55) {
        // Torso & lower/mid neck: large bold polygons
        cellA = voronoiGiraffe(u + warpX, v + warpY, 12, 22, preset.jitter, seed + 1);
        cellB = voronoiGiraffe(u + warpX * 0.7, v + warpY * 0.7, 16, 32, preset.jitter, seed + 2);
        blendFactor = smoothstep(0.35, 0.55, v);
      } else if (v < 0.78) {
        // Upper neck
        cellA = voronoiGiraffe(u + warpX * 0.7, v + warpY * 0.7, 16, 32, preset.jitter, seed + 2);
        cellB = voronoiGiraffe(u + warpX * 0.4, v + warpY * 0.4, 24, 52, preset.jitter, seed + 3);
        blendFactor = smoothstep(0.62, 0.78, v);
      } else {
        // Cranium & cheeks: fine spots
        cellA = voronoiGiraffe(u + warpX * 0.4, v + warpY * 0.4, 24, 52, preset.jitter, seed + 3);
        cellB = voronoiGiraffe(u + warpX * 0.25, v + warpY * 0.25, 32, 72, preset.jitter, seed + 4);
        blendFactor = smoothstep(0.78, 0.88, v);
      }

      const edgeDist = lerp(cellA.edgeDist, cellB.edgeDist, blendFactor) + jaggedNoise;
      const centerDist = lerp(cellA.centerDist, cellB.centerDist, blendFactor);
      const cellId = lerp(cellA.cellId, cellB.cellId, blendFactor);

      // Ventral belly mask: confined strictly to the true underside of the abdomen/sternum (u near 0 or 1)
      const isTorsoVentral = (v > 0.09 && v < 0.34)
        ? smoothstep(0.76, 0.95, distFromVentral) * Math.sin(((v - 0.09) / 0.25) * Math.PI)
        : 0.0;
      // Throat ventral softening
      const isThroatVentral = (v >= 0.40 && v < 0.82) ? smoothstep(0.82, 0.98, distFromVentral) * 0.25 : 0.0;

      // Effective channel width widens near belly and upper head
      const headSpotFade = smoothstep(0.87, 0.95, v);
      const localChannelW = preset.channelWidth + isTorsoVentral * 0.18 + isThroatVentral * 0.08 + headSpotFade * 0.16;

      // Patch mask: 0 in cream channel, 1 inside dark patch
      let patchMask = smoothstep(localChannelW - preset.edgeSoftness * 0.5, localChannelW + preset.edgeSoftness * 0.5, edgeDist);
      patchMask *= (1.0 - isTorsoVentral * 0.85) * (1.0 - headSpotFade * 0.92);

      // Core darkening inside each polygon + per-cell rich tonal variation
      const coreFactor = smoothstep(localChannelW + 0.04, localChannelW + 0.24, edgeDist) * (0.65 + 0.35 * cellId);
      const patchR = lerp(preset.patchOuter[0], preset.patchCore[0], coreFactor);
      const patchG = lerp(preset.patchOuter[1], preset.patchCore[1], coreFactor);
      const patchB = lerp(preset.patchOuter[2], preset.patchCore[2], coreFactor);

      // Channel border subtle warm halo
      const halo = smoothstep(localChannelW - 0.06, localChannelW, edgeDist);
      const chanR = lerp(preset.channelBase[0], preset.channelShadow[0], halo * 0.55);
      const chanG = lerp(preset.channelBase[1], preset.channelShadow[1], halo * 0.55);
      const chanB = lerp(preset.channelBase[2], preset.channelShadow[2], halo * 0.55);

      r = lerp(chanR, patchR, patchMask);
      g = lerp(chanG, patchG, patchMask);
      b = lerp(chanB, patchB, patchMask);

      // Blend in warm ivory belly on torso ventral
      if (isTorsoVentral > 0) {
        r = lerp(r, preset.bellyColor[0], isTorsoVentral * 0.85);
        g = lerp(g, preset.bellyColor[1], isTorsoVentral * 0.85);
        b = lerp(b, preset.bellyColor[2], isTorsoVentral * 0.85);
      }

      // Dorsal nasal bridge & forehead rich cinnamon-rufous blaze (u near 0.5, v in 0.80..0.96)
      if (v > 0.78 && v < 0.97) {
        const dorsalBridge = smoothstep(0.36, 0.08, Math.abs(u - 0.5)) * smoothstep(0.79, 0.84, v) * (1.0 - smoothstep(0.93, 0.97, v));
        r = lerp(r, 158, dorsalBridge * 0.78);
        g = lerp(g, 92, dorsalBridge * 0.78);
        b = lerp(b, 44, dorsalBridge * 0.78);
      }

      // Warm tawny-tan facial cheeks & snout bridge (v in 0.85..0.96) so the snout is warm golden-fawn, not stark white
      if (v > 0.84 && v < 0.97) {
        const snoutWarmth = smoothstep(0.84, 0.90, v) * (1.0 - smoothstep(0.94, 0.97, v));
        r = lerp(r, 206, snoutWarmth * 0.55);
        g = lerp(g, 166, snoutWarmth * 0.55);
        b = lerp(b, 118, snoutWarmth * 0.55);
      }

      // Pale cream eye-ring highlight around the orbital region (v in 0.83..0.88, |u - 0.5| ~ 0.18..0.32)
      if (v > 0.82 && v < 0.89) {
        const eyeRingU = Math.exp(-Math.pow((Math.abs(u - 0.5) - 0.24) / 0.07, 2.0));
        const eyeRingV = Math.exp(-Math.pow((v - 0.855) / 0.022, 2.0));
        const eyeRing = eyeRingU * eyeRingV;
        r = lerp(r, 242, eyeRing * 0.65);
        g = lerp(g, 226, eyeRing * 0.65);
        b = lerp(b, 198, eyeRing * 0.65);
      }

      // Muzzle, prehensile upper lip & nostrils (v in 0.92..1.00): velvety warm taupe grading to dark slate-charcoal lip & nostrils
      if (v > 0.915) {
        const muzzleBlend = smoothstep(0.915, 0.96, v);
        const tipDark = smoothstep(0.955, 0.992, v);
        const muzR = lerp(182, 62, tipDark);
        const muzG = lerp(154, 54, tipDark);
        const muzB = lerp(126, 50, tipDark);
        r = lerp(r, muzR, muzzleBlend);
        g = lerp(g, muzG, muzzleBlend);
        b = lerp(b, muzB, muzzleBlend);
        rough = lerp(rough, 0.38, tipDark);
      }

      // Subtlefur fiber pigment modulation
      const fiberMod = furGrain * 18.0;
      r = Math.max(0, Math.min(255, r + fiberMod));
      g = Math.max(0, Math.min(255, g + fiberMod * 0.85));
      b = Math.max(0, Math.min(255, b + fiberMod * 0.7));

      // Patch hair is slightly thicker/taller than channel hair
      height = 0.5 + patchMask * 0.16 + furGrain * 0.15;
      rough = lerp(0.80, 0.68, patchMask) + furGrain * 0.05;

    } else if (part === 'limb') {
      // Limb v regions:
      // 0.00..0.28: Upper shoulder / thigh (large-to-medium patches matching body)
      // 0.28..0.52: Forearm / gaskin (medium-to-small spots)
      // 0.52..0.60: Carpus (knee) / Hock transition (spots breaking into speckles)
      // 0.60..0.90: Cannon bone, fetlock, pastern (creamy-tawny stockings)
      // 0.90..0.93: Coronary band (dark charcoal fur transition)
      // 0.93..1.00: Cloven Hoof (hard dark obsidian/slate keratin with vertical striations)

      const cellUpper = voronoiGiraffe(u + warpX, v + warpY, 8, 18, preset.jitter, seed + 201);
      const cellLower = voronoiGiraffe(u + warpX * 0.5, v + warpY * 0.5, 14, 34, preset.jitter, seed + 202);
      const scaleBlend = smoothstep(0.20, 0.48, v);

      const edgeDist = lerp(cellUpper.edgeDist, cellLower.edgeDist, scaleBlend) + jaggedNoise;
      const cellId = lerp(cellUpper.cellId, cellLower.cellId, scaleBlend);

      // Inner leg (u near 0 or 1) has lighter/smaller spots
      const innerLeg = smoothstep(0.65, 0.95, distFromVentral) * smoothstep(0.10, 0.45, v);
      // Spot fade below knee/hock (v = 0.50..0.68)
      const stockingFade = smoothstep(0.46, 0.66, v);

      const localChannelW = preset.channelWidth + innerLeg * 0.14 + stockingFade * 0.28;
      let patchMask = smoothstep(localChannelW - preset.edgeSoftness * 0.5, localChannelW + preset.edgeSoftness * 0.5, edgeDist);
      patchMask *= (1.0 - stockingFade * 0.96) * (1.0 - innerLeg * 0.75);

      const coreFactor = smoothstep(localChannelW + 0.03, localChannelW + 0.20, edgeDist) * (0.65 + 0.35 * cellId);
      const patchR = lerp(preset.patchOuter[0], preset.patchCore[0], coreFactor);
      const patchG = lerp(preset.patchOuter[1], preset.patchCore[1], coreFactor);
      const patchB = lerp(preset.patchOuter[2], preset.patchCore[2], coreFactor);

      const bgR = lerp(preset.channelBase[0], preset.stockingColor[0], stockingFade);
      const bgG = lerp(preset.channelBase[1], preset.stockingColor[1], stockingFade);
      const bgB = lerp(preset.channelBase[2], preset.stockingColor[2], stockingFade);

      r = lerp(bgR, patchR, patchMask);
      g = lerp(bgG, patchG, patchMask);
      b = lerp(bgB, patchB, patchMask);

      // Subtle tendon & joint shading along cannon bone
      if (v > 0.55 && v < 0.90) {
        const tendonGroove = Math.sin(u * Math.PI * 4.0) * 0.5 + 0.5;
        const shade = tendonGroove * 0.08 * smoothstep(0.55, 0.65, v) * (1.0 - smoothstep(0.84, 0.90, v));
        r *= (1.0 - shade);
        g *= (1.0 - shade);
        b *= (1.0 - shade);
      }

      const fiberMod = furGrain * 15.0;
      r = Math.max(0, Math.min(255, r + fiberMod));
      g = Math.max(0, Math.min(255, g + fiberMod * 0.85));
      b = Math.max(0, Math.min(255, b + fiberMod * 0.7));
      height = 0.5 + patchMask * 0.14 + furGrain * 0.12;
      rough = lerp(0.78, 0.68, patchMask);

      // Coronary band & Hoof keratin (v >= 0.90)
      if (v >= 0.895) {
        const hoofBlend = smoothstep(0.895, 0.925, v);
        const keratinStriation = (valueNoisePeriodicX(u * 64, v * 12, 64, seed + 333) - 0.5) * 18.0;
        const growthRings = Math.sin(v * 280.0) * 6.0;
        const hoofR = Math.max(18, Math.min(75, 42 + keratinStriation + growthRings));
        const hoofG = Math.max(16, Math.min(70, 38 + keratinStriation + growthRings));
        const hoofB = Math.max(15, Math.min(68, 36 + keratinStriation + growthRings));
        r = lerp(r, hoofR, hoofBlend);
        g = lerp(g, hoofG, hoofBlend);
        b = lerp(b, hoofB, hoofBlend);
        rough = lerp(rough, 0.34, hoofBlend);
        height = lerp(height, 0.5 + (keratinStriation + growthRings) * 0.008, hoofBlend);
      }
    }

    return { r, g, b, rough, height };
  }

  // Generate CanvasTexture triplet (map, normalMap, roughnessMap) for a given part ('body' or 'limb')
  function generatePartTextureSuite(width, height, part, subspeciesKey) {
    const preset = SUBSPECIES_PRESETS[subspeciesKey] || SUBSPECIES_PRESETS.reticulated;
    const seed = subspeciesKey === 'masai' ? 7719 : (subspeciesKey === 'rothschild' ? 4211 : 1337);

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = width;
    colorCanvas.height = height;
    const colorCtx = colorCanvas.getContext('2d');
    const colorImg = colorCtx.createImageData(width, height);
    const colorData = colorImg.data;

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = width;
    roughCanvas.height = height;
    const roughCtx = roughCanvas.getContext('2d');
    const roughImg = roughCtx.createImageData(width, height);
    const roughData = roughImg.data;

    const heightField = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
      // Canvas y=0 is top (v=1 in Three.js UV convention with flipY=true)
      const v = 1.0 - y / (height - 1);
      for (let x = 0; x < width; x++) {
        const u = x / width; // Periodic wrap
        const sample = evaluateCoatPoint(u, v, part, preset, seed);
        const idx = (y * width + x) * 4;
        colorData[idx] = sample.r;
        colorData[idx + 1] = sample.g;
        colorData[idx + 2] = sample.b;
        colorData[idx + 3] = 255;

        const rByte = Math.max(0, Math.min(255, Math.round(sample.rough * 255)));
        roughData[idx] = rByte;
        roughData[idx + 1] = rByte;
        roughData[idx + 2] = rByte;
        roughData[idx + 3] = 255;

        heightField[y * width + x] = sample.height;
      }
    }

    colorCtx.putImageData(colorImg, 0, 0);
    roughCtx.putImageData(roughImg, 0, 0);

    // Compute tangent-space normal map from heightField
    const normCanvas = document.createElement('canvas');
    normCanvas.width = width;
    normCanvas.height = height;
    const normCtx = normCanvas.getContext('2d');
    const normImg = normCtx.createImageData(width, height);
    const normData = normImg.data;
    const bumpScale = 3.2;

    for (let y = 0; y < height; y++) {
      const yUp = Math.max(0, y - 1);
      const yDn = Math.min(height - 1, y + 1);
      for (let x = 0; x < width; x++) {
        const xLt = (x - 1 + width) % width;
        const xRt = (x + 1) % width;
        const dx = (heightField[y * width + xRt] - heightField[y * width + xLt]) * bumpScale;
        const dy = (heightField[yDn * width + x] - heightField[yUp * width + x]) * bumpScale;
        const invLen = 1.0 / Math.sqrt(dx * dx + dy * dy + 1.0);
        const nx = -dx * invLen;
        const ny = dy * invLen;
        const nz = invLen;
        const idx = (y * width + x) * 4;
        normData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        normData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        normData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        normData[idx + 3] = 255;
      }
    }
    normCtx.putImageData(normImg, 0, 0);

    const map = new THREE.CanvasTexture(colorCanvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    map.needsUpdate = true;

    const normalMap = new THREE.CanvasTexture(normCanvas);
    normalMap.wrapS = THREE.RepeatWrapping;
    normalMap.wrapT = THREE.ClampToEdgeWrapping;
    normalMap.anisotropy = 4;
    normalMap.needsUpdate = true;

    const roughnessMap = new THREE.CanvasTexture(roughCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
    roughnessMap.anisotropy = 4;
    roughnessMap.needsUpdate = true;

    return { map, normalMap, roughnessMap };
  }

  // Generate realistic soulful dark amber-obsidian giraffe eye texture
  function createEyeTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Warm dark sclera rim
    ctx.fillStyle = '#3b281e';
    ctx.fillRect(0, 0, size, size);

    const cx = size * 0.5;
    const cy = size * 0.5;

    // Iris radial gradient (deep warm espresso-amber iris)
    const irisGrad = ctx.createRadialGradient(cx, cy, size * 0.12, cx, cy, size * 0.45);
    irisGrad.addColorStop(0.0, '#140904');
    irisGrad.addColorStop(0.45, '#3b1e0e');
    irisGrad.addColorStop(0.78, '#542b14');
    irisGrad.addColorStop(0.92, '#241107');
    irisGrad.addColorStop(1.0, '#180c06');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Radial iris stroma fibers
    ctx.strokeStyle = 'rgba(120, 68, 28, 0.22)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const r1 = size * (0.16 + 0.04 * Math.sin(i * 7));
      const r2 = size * (0.40 + 0.03 * Math.cos(i * 13));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      ctx.stroke();
    }

    // Horizontal-oval ungulate pupil (giraffes have wide dark horizontal-oval pupils)
    ctx.fillStyle = '#050303';
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.25, size * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle corneal sky reflection highlight baked as secondary glint
    const glint = ctx.createRadialGradient(cx - size * 0.12, cy - size * 0.12, 2, cx - size * 0.12, cy - size * 0.12, size * 0.09);
    glint.addColorStop(0, 'rgba(255, 250, 240, 0.85)');
    glint.addColorStop(0.5, 'rgba(255, 245, 220, 0.25)');
    glint.addColorStop(1, 'rgba(255, 245, 220, 0.0)');
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.arc(cx - size * 0.12, cy - size * 0.12, size * 0.09, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // Enhance MeshStandardMaterial with anisotropic velvet fur rim sheen & subtle warm subsurface scattering
  function applyFurVelvetShader(material) {
    material.onBeforeCompile = function (shader) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        // Velvet guard-hair rim scattering (peach-fuzz sheen at grazing view angles)
        vec3 viewDir = normalize(vViewPosition);
        float ndotv = clamp(dot(normal, viewDir), 0.0, 1.0);
        float velvetRim = pow(1.0 - ndotv, 2.8);
        vec3 warmSheen = vec3(1.0, 0.84, 0.62) * velvetRim * 0.19 * (0.4 + 0.6 * clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
        gl_FragColor.rgb += warmSheen * gl_FragColor.rgb;
        #include <dithering_fragment>
        `
      );
    };
    material.customProgramCacheKey = function () {
      return 'giraffe_fur_velvet_v1';
    };
    return material;
  }

  // Build complete material library for the giraffe
  function createGiraffeMaterials(subspeciesKey = 'reticulated') {
    const bodyTex = generatePartTextureSuite(1024, 1024, 'body', subspeciesKey);
    const limbTex = generatePartTextureSuite(512, 1024, 'limb', subspeciesKey);
    const eyeTex = createEyeTexture();

    const bodyMaterial = applyFurVelvetShader(new THREE.MeshStandardMaterial({
      map: bodyTex.map,
      normalMap: bodyTex.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: bodyTex.roughnessMap,
      roughness: 0.92,
      metalness: 0.02
    }));

    const limbMaterial = applyFurVelvetShader(new THREE.MeshStandardMaterial({
      map: limbTex.map,
      normalMap: limbTex.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughnessMap: limbTex.roughnessMap,
      roughness: 0.92,
      metalness: 0.02
    }));

    const maneMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c160b,
      roughness: 0.85,
      metalness: 0.02,
      side: THREE.DoubleSide
    });

    const tailHairMaterial = new THREE.MeshStandardMaterial({
      color: 0x16100d,
      roughness: 0.78,
      metalness: 0.05
    });

    const ossiconeTipMaterial = new THREE.MeshStandardMaterial({
      color: 0x221610,
      roughness: 0.82,
      metalness: 0.04
    });

    const eyeMaterial = new THREE.MeshPhysicalMaterial({
      map: eyeTex,
      roughness: 0.06,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 0.95
    });

    const eyelidMaterial = new THREE.MeshStandardMaterial({
      color: 0x261a14,
      roughness: 0.62,
      metalness: 0.02
    });

    const innerEarMaterial = new THREE.MeshStandardMaterial({
      color: 0xe6d4bc,
      roughness: 0.88,
      metalness: 0.0
    });

    const tongueMaterial = new THREE.MeshStandardMaterial({
      color: 0x362b38, // Characteristic dark purplish-slate prehensile giraffe tongue
      roughness: 0.35,
      metalness: 0.05
    });

    return {
      bodyMaterial,
      limbMaterial,
      maneMaterial,
      tailHairMaterial,
      ossiconeTipMaterial,
      eyeMaterial,
      eyelidMaterial,
      innerEarMaterial,
      tongueMaterial,
      updateSubspecies(newKey) {
        const newBody = generatePartTextureSuite(1024, 1024, 'body', newKey);
        const newLimb = generatePartTextureSuite(512, 1024, 'limb', newKey);
        bodyMaterial.map.dispose();
        bodyMaterial.normalMap.dispose();
        bodyMaterial.roughnessMap.dispose();
        bodyMaterial.map = newBody.map;
        bodyMaterial.normalMap = newBody.normalMap;
        bodyMaterial.roughnessMap = newBody.roughnessMap;
        bodyMaterial.needsUpdate = true;

        limbMaterial.map.dispose();
        limbMaterial.normalMap.dispose();
        limbMaterial.roughnessMap.dispose();
        limbMaterial.map = newLimb.map;
        limbMaterial.normalMap = newLimb.normalMap;
        limbMaterial.roughnessMap = newLimb.roughnessMap;
        limbMaterial.needsUpdate = true;
      }
    };
  }

  global.GiraffeTextures = {
    SUBSPECIES_PRESETS,
    createGiraffeMaterials
  };
})(window);
