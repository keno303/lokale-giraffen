/**
 * Giraffe 3D - Procedural Texture Synthesis
 * Generates all photorealistic textures completely in-memory using HTML5 Canvas.
 * Zero external image dependencies - 100% offline and file:// friendly.
 */

const GiraffeTextures = (function() {
  'use strict';

  // Permutation table for Perlin / Simplex noise
  function createNoise() {
    const p = new Uint8Array(512);
    for (let i = 0; i < 256; i++) p[i] = i;
    let seed = 98765;
    for (let i = 255; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 256; i++) p[256 + i] = p[i];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(t, a, b) { return a + t * (b - a); }
    function grad(hash, x, y) {
      const h = hash & 3;
      const u = h < 2 ? x : y;
      const v = h < 2 ? y : x;
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    return function(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = fade(x);
      const v = fade(y);
      const a = p[X] + Y;
      const b = p[X + 1] + Y;
      return lerp(v, lerp(u, grad(p[a], x, y), grad(p[b], x - 1, y)),
                     lerp(u, grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1)));
    };
  }

  const noise = createNoise();

  /**
   * Generates a reticulated / Masai giraffe coat texture and bump map using Voronoi cells
   */
  function createGiraffeCoat(width, height, cellSize, options = {}) {
    const isLeg = !!options.isLeg;
    const isHead = !!options.isHead;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const bCanvas = document.createElement('canvas');
    bCanvas.width = width;
    bCanvas.height = height;
    const bCtx = bCanvas.getContext('2d');
    const bImg = bCtx.createImageData(width, height);
    const bData = bImg.data;

    const gridW = Math.ceil(width / cellSize) + 2;
    const gridH = Math.ceil(height / cellSize) + 2;
    const points = [];

    let seed = options.seed || 54321;
    function rnd() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    for (let gy = -1; gy < gridH; gy++) {
      for (let gx = -1; gx < gridW; gx++) {
        // Jittered seed coordinates
        const px = (gx + 0.15 + rnd() * 0.70) * cellSize;
        const py = (gy + 0.15 + rnd() * 0.70) * cellSize;
        // Warm tone variation: deeper chestnut vs rich tawny umber
        const tone = 0.85 + rnd() * 0.32;
        const redTint = (rnd() - 0.5) * 16;
        points.push({ gx, gy, px, py, tone, redTint });
      }
    }

    function getPoint(gx, gy) {
      const ix = (gy + 1) * (gridW + 1) + (gx + 1);
      return points[ix] || { px: gx * cellSize, py: gy * cellSize, tone: 1, redTint: 0 };
    }

    for (let y = 0; y < height; y++) {
      const vNorm = y / height;
      for (let x = 0; x < width; x++) {
        // Organic edge warping with 2 octaves of noise
        const nScale = isHead ? 0.08 : 0.038;
        const warpX = noise(x * nScale, y * nScale) * 14 + noise(x * nScale * 2.5, y * nScale * 2.5) * 5;
        const warpY = noise(x * nScale + 50, y * nScale + 50) * 14 + noise(x * nScale * 2.5 + 50, y * nScale * 2.5 + 50) * 5;

        const qx = x + warpX;
        const qy = y + warpY;

        const cgx = Math.floor(qx / cellSize);
        const cgy = Math.floor(qy / cellSize);

        let d1 = 999999, d2 = 999999;
        let bestP = null;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const p = getPoint(cgx + dx, cgy + dy);
            const dist = Math.hypot(qx - p.px, qy - p.py);
            if (dist < d1) {
              d2 = d1;
              d1 = dist;
              bestP = p;
            } else if (dist < d2) {
              d2 = dist;
            }
          }
        }

        const edge = d2 - d1;
        const lineWidth = options.lineWidth || (isLeg ? 5.0 : 6.0);
        const idx = (y * width + x) * 4;

        // Fine fur grain
        const fur = (noise(x * 0.35, y * 0.7) * 0.5 + 0.5) * 12 - 6;

        // Legs: only fade into solid buff socks at the very bottom fetlock (vNorm > 0.88)
        let fadeToSock = 0;
        if (isLeg && vNorm > 0.88) {
          fadeToSock = Math.min(1.0, (vNorm - 0.88) / 0.10);
        }

        if (edge < lineWidth || fadeToSock > 0.9) {
          // Cream / Ivory Buff reticulation lines
          const cr = 238 + fur * 0.35;
          const cg = 224 + fur * 0.35;
          const cb = 198 + fur * 0.35;

          data[idx]     = Math.min(255, Math.max(0, cr));
          data[idx + 1] = Math.min(255, Math.max(0, cg));
          data[idx + 2] = Math.min(255, Math.max(0, cb));
          data[idx + 3] = 255;

          // Seams are recessed grooves in bump map
          bData[idx]     = 100;
          bData[idx + 1] = 100;
          bData[idx + 2] = 100;
          bData[idx + 3] = 255;
        } else {
          // Inside rich brown patch
          const blend = Math.min(1.0, (edge - lineWidth) / 2.2);
          const tone = bestP ? bestP.tone : 1.0;
          const redTint = bestP ? bestP.redTint : 0;

          // Subtle radial shading inside patch: darker rich burnt umber towards perimeter
          const rDist = d1 / (cellSize * 0.65);
          const centerGlow = Math.max(0, 1.0 - rDist * 0.65) * 18;

          // Rich dark chestnut / burnt umber: r: 128, g: 58, b: 20
          let r = (128 * tone + centerGlow + redTint + fur);
          let g = (58 * tone + centerGlow * 0.5 + redTint * 0.4 + fur * 0.5);
          let b = (20 * tone + fur * 0.3);

          if (fadeToSock > 0) {
            const cr = 238, cg = 224, cb = 198;
            r = r * (1 - fadeToSock) + cr * fadeToSock;
            g = g * (1 - fadeToSock) + cg * fadeToSock;
            b = b * (1 - fadeToSock) + cb * fadeToSock;
          } else if (blend < 1.0) {
            const cr = 238, cg = 224, cb = 198;
            r = cr * (1 - blend) + r * blend;
            g = cg * (1 - blend) + g * blend;
            b = cb * (1 - blend) + b * blend;
          }

          data[idx]     = Math.min(255, Math.max(0, r));
          data[idx + 1] = Math.min(255, Math.max(0, g));
          data[idx + 2] = Math.min(255, Math.max(0, b));
          data[idx + 3] = 255;

          // Raised patch with fur bump
          const bumpVal = Math.min(255, Math.max(0, 190 + fur * 2.5));
          bData[idx]     = bumpVal;
          bData[idx + 1] = bumpVal;
          bData[idx + 2] = bumpVal;
          bData[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;

    const bumpMap = new THREE.CanvasTexture(bCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;

    return { map, bumpMap };
  }

  /**
   * Muzzle & lips texture (velvety dark taupe/brown with nostrils)
   */
  function createMuzzleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#5f5043');
    grad.addColorStop(0.4, '#3e332b');
    grad.addColorStop(0.8, '#261f1a');
    grad.addColorStop(1.0, '#4a3b34');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(85, 72, 60, 0.4)' : 'rgba(20, 16, 12, 0.4)';
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // Nostrils
    ctx.fillStyle = 'rgba(14, 11, 8, 0.9)';
    ctx.beginPath();
    ctx.ellipse(170, 320, 45, 24, -0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(342, 320, 45, 24, 0.35, 0, Math.PI * 2);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Hoof keratin texture (dark slate horn with growth ridges)
   */
  function createHoofTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#181412';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 600; i++) {
      const x = Math.random() * 256;
      ctx.fillStyle = Math.random() > 0.4 ? 'rgba(45, 38, 32, 0.3)' : 'rgba(8, 6, 5, 0.4)';
      ctx.fillRect(x, 0, 1 + Math.random() * 2, 256);
    }

    for (let y = 15; y < 256; y += 30 + Math.random() * 20) {
      ctx.fillStyle = 'rgba(65, 55, 45, 0.18)';
      ctx.fillRect(0, y, 256, 4);
    }

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Eye texture (large mammalian eye with deep brown iris and pupil)
   */
  function createEyeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#221a14';
    ctx.fillRect(0, 0, 256, 256);

    const irisGrad = ctx.createRadialGradient(128, 128, 10, 128, 128, 110);
    irisGrad.addColorStop(0.0, '#361e0f');
    irisGrad.addColorStop(0.6, '#201007');
    irisGrad.addColorStop(0.9, '#100703');
    irisGrad.addColorStop(1.0, '#060302');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(80, 48, 24, 0.3)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 60; i++) {
      const ang = (i / 60) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(128 + Math.cos(ang) * 35, 128 + Math.sin(ang) * 35);
      ctx.lineTo(128 + Math.cos(ang) * 105, 128 + Math.sin(ang) * 105);
      ctx.stroke();
    }

    ctx.fillStyle = '#040201';
    ctx.beginPath();
    ctx.arc(128, 128, 42, 0, Math.PI * 2);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Savanna terrain texture (golden savanna earth, dried grasses, stones)
   */
  function createSavannaTerrain() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
    grad.addColorStop(0.0, '#9c8159');
    grad.addColorStop(0.5, '#ad9164');
    grad.addColorStop(1.0, '#8e734e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 1024);

    const imgData = ctx.getImageData(0, 0, 1024, 1024);
    const data = imgData.data;

    for (let y = 0; y < 1024; y++) {
      for (let x = 0; x < 1024; x++) {
        const n1 = noise(x * 0.008, y * 0.008) * 22;
        const n2 = noise(x * 0.04, y * 0.04) * 12;
        const n3 = noise(x * 0.2, y * 0.2) * 6;
        const val = n1 + n2 + n3;

        const idx = (y * 1024 + x) * 4;
        data[idx]     = Math.min(255, Math.max(0, data[idx] + val));
        data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + val * 0.85));
        data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + val * 0.65));
      }
    }
    ctx.putImageData(imgData, 0, 0);

    ctx.strokeStyle = 'rgba(195, 175, 115, 0.45)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3500; i++) {
      const gx = Math.random() * 1024;
      const gy = Math.random() * 1024;
      const len = 6 + Math.random() * 10;
      const ang = Math.random() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + Math.cos(ang) * len, gy + Math.sin(ang) * len);
      ctx.stroke();
    }

    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(12, 12);

    return map;
  }

  /**
   * Acacia tree bark texture
   */
  function createAcaciaBark() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#3a2b1f';
    ctx.fillRect(0, 0, 256, 512);

    for (let i = 0; i < 800; i++) {
      const x = Math.random() * 256;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(75, 58, 42, 0.35)' : 'rgba(18, 12, 8, 0.45)';
      ctx.fillRect(x, 0, 2 + Math.random() * 3, 512);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    return map;
  }

  /**
   * Acacia umbrella canopy foliage texture with delicate clusters
   */
  function createAcaciaCanopy() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 512);

    for (let i = 0; i < 350; i++) {
      const rad = Math.sqrt(Math.random()) * 230;
      const ang = Math.random() * Math.PI * 2;
      const x = 256 + Math.cos(ang) * rad;
      const y = 256 + Math.sin(ang) * rad;
      const sz = 16 + Math.random() * 24;

      const alpha = 0.55 * (1.0 - (rad / 240) * 0.45);
      const g = 65 + Math.floor(Math.random() * 40);
      const r = 45 + Math.floor(Math.random() * 25);
      ctx.fillStyle = `rgba(${r}, ${g}, 32, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, sz, 0, Math.PI * 2);
      ctx.fill();
    }

    return new THREE.CanvasTexture(canvas);
  }

  function initAll() {
    const coatBody = createGiraffeCoat(1024, 1024, 110, { seed: 101, isBody: true, lineWidth: 7.0 });
    const coatNeck = createGiraffeCoat(1024, 1024, 95,  { seed: 202, isNeck: true, lineWidth: 6.5 });
    const coatLegs = createGiraffeCoat(512, 1024, 75,   { seed: 303, isLeg: true,  lineWidth: 5.5 });
    const coatHead = createGiraffeCoat(512, 512, 45,    { seed: 404, isHead: true, lineWidth: 4.0 });

    const muzzleTex = createMuzzleTexture();
    const hoofTex   = createHoofTexture();
    const eyeTex    = createEyeTexture();
    const groundTex = createSavannaTerrain();
    const barkTex   = createAcaciaBark();
    const canopyTex = createAcaciaCanopy();

    return {
      body: coatBody,
      neck: coatNeck,
      legs: coatLegs,
      head: coatHead,
      muzzle: muzzleTex,
      hoof: hoofTex,
      eye: eyeTex,
      ground: groundTex,
      bark: barkTex,
      canopy: canopyTex
    };
  }

  return {
    initAll
  };
})();
