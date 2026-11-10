/* ------------------------------------------------------------------
 * textures.js — every texture is generated at runtime on a <canvas>,
 * so the page needs no network access and no image files.
 * ------------------------------------------------------------------ */
var Textures = (function () {
  'use strict';

  const rand = Geom.makeRand(20260911);

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function ctx2d(c) { return c.getContext('2d'); }

  /* ---- deterministic value noise ---------------------------------- */
  const P = new Uint8Array(512);
  (function () {
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  })();
  function hash2(x, y) {
    return P[(P[x & 255] + (y & 255)) & 511] / 255;
  }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, oct, lac, gain) {
    lac = lac || 2; gain = gain || 0.5;
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * vnoise(x * f, y * f); n += a; a *= gain; f *= lac;
    }
    return s / n;
  }

  /* ---- palettes --------------------------------------------------- */
  const PALETTES = {
    masai: {
      name: 'Masai',
      base: '#e6d3a3', base2: '#d8c391', patch: '#8a5a24', patch2: '#6f4318',
      rim: '#4a2a0e', leg: '#e9dcb4', hoof: '#241a12', mane: '#7a4c1e'
    },
    reticulated: {
      name: 'Reticulated',
      base: '#c8862f', base2: '#b8762a', patch: '#f0e0b4', patch2: '#e2cf9a',
      rim: '#8a5a18', leg: '#e9dcb4', hoof: '#241a12', mane: '#a9702a'
    },
    southern: {
      name: 'Southern',
      base: '#efdfae', base2: '#e3d09c', patch: '#9c6a2c', patch2: '#7d4f1c',
      rim: '#54300f', leg: '#f0e6c4', hoof: '#241a12', mane: '#8a5722'
    },
    rothschild: {
      name: "Rothschild's",
      base: '#e9d9a8', base2: '#ddc998', patch: '#a3712f', patch2: '#83561f',
      rim: '#573512', leg: '#eee2bc', hoof: '#241a12', mane: '#96601f'
    }
  };

  function shade(hex, amt) {
    const c = new THREE.Color(hex);
    const hsl = {}; c.getHSL(hsl);
    c.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s * (1 + amt * 0.4))), Math.max(0, Math.min(1, hsl.l * (1 + amt))));
    return '#' + c.getHexString();
  }

  /* ---- giraffe coat ------------------------------------------------ */
  function giraffeCoat(key, style) {
    const pal = PALETTES[key] || PALETTES.masai;
    const W = 1024, H = 512;
    const c = canvas(W, H), g = ctx2d(c);
    g.fillStyle = pal.base; g.fillRect(0, 0, W, H);

    // soft tonal variation in the "skin"
    for (let i = 0; i < 26; i++) {
      const x = rand() * W, y = rand() * H, r = 60 + rand() * 190;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, (i % 2 ? pal.base2 : shade(pal.base, 0.07)) + '');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.5; g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;

    const drawPatch = (cx, cy, R, col, rimCol, jag) => {
      const n = 7 + ((rand() * 4) | 0);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.5;
        // oak-leaf style: alternate long/short radii
        const lobe = (i % 2 === 0 ? 1.0 : 0.62) * (0.78 + rand() * 0.42);
        const rr = R * lobe;
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9]);
      }
      for (const ox of [-W, 0, W]) {
        g.beginPath();
        g.moveTo(pts[0][0] + ox, pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1], p1 = pts[i];
          const mx = (p0[0] + p1[0]) / 2 + (rand() - 0.5) * jag, my = (p0[1] + p1[1]) / 2 + (rand() - 0.5) * jag;
          g.quadraticCurveTo(mx + ox, my, p1[0] + ox, p1[1]);
        }
        const p0 = pts[pts.length - 1], p1 = pts[0];
        const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
        g.quadraticCurveTo(mx + ox, my, p1[0] + ox, p1[1]);
        g.closePath();
        const grd = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        grd.addColorStop(0, col);
        grd.addColorStop(1, pal.patch2);
        g.fillStyle = grd; g.fill();
        g.lineWidth = 4.5; g.strokeStyle = rimCol; g.globalAlpha = 0.75; g.stroke();
        g.globalAlpha = 1;
      }
    };

    if (style === 'net') {
      // reticulated: brown ground, cream polygonal net
      g.fillStyle = pal.base; g.fillRect(0, 0, W, H);
      g.fillStyle = pal.patch2; g.fillRect(0, 0, W, H);
      const cols = 7, rows = 4;
      const cw = W / cols, ch = H / rows;
      const pts = [];
      for (let j = -1; j <= rows; j++) for (let i = -1; i <= cols; i++) {
        pts.push([(i + 0.5 + (rand() - 0.5) * 0.55) * cw, (j + 0.5 + (rand() - 0.5) * 0.55) * ch]);
      }
      g.strokeStyle = pal.base; g.lineWidth = 17; g.lineJoin = 'round'; g.lineCap = 'round';
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const a = pts[(j + 1) * (cols + 2) + (i + 1)], b = pts[(j + 2) * (cols + 2) + (i + 1)],
          cc = pts[(j + 1) * (cols + 2) + (i + 2)];
        for (const ox of [-W, 0, W]) {
          g.beginPath();
          g.moveTo(a[0] + ox, a[1]); g.lineTo(b[0] + ox, b[1]); g.lineTo(cc[0] + ox, cc[1]);
          g.stroke();
        }
      }
      g.globalAlpha = 0.5; g.strokeStyle = shade(pal.patch2, -0.2); g.lineWidth = 3;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const a = pts[(j + 1) * (cols + 2) + (i + 1)], b = pts[(j + 2) * (cols + 2) + (i + 1)],
          cc = pts[(j + 1) * (cols + 2) + (i + 2)];
        for (const ox of [-W, 0, W]) {
          g.beginPath();
          g.moveTo(a[0] + ox, a[1]); g.lineTo(b[0] + ox, b[1]); g.lineTo(cc[0] + ox, cc[1]);
          g.stroke();
        }
      }
      g.globalAlpha = 1;
    } else {
      const cols = 4, rows = 2;
      const cw = W / cols, ch = H / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const cx = (i + 0.5) * cw + (rand() - 0.5) * cw * 0.5;
        const cy = (j + 0.5) * ch + (rand() - 0.5) * ch * 0.5;
        drawPatch(cx, cy, cw * (0.46 + rand() * 0.12), pal.patch, pal.rim, 16);
        if (rand() < 0.75) {
          drawPatch(cx + (rand() - 0.5) * cw * 0.7, cy + (rand() - 0.5) * ch * 0.8,
            cw * (0.17 + rand() * 0.12), pal.patch, pal.rim, 12);
        }
      }
    }

    // grain / fur speckle
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const n = fbm(x * 0.09, y * 0.09, 4) - 0.5;
        const n2 = (hash2(x, y) - 0.5) * 0.05;
        const f = 1 + n * 0.14 + n2;
        d[k] = Math.max(0, Math.min(255, d[k] * f));
        d[k + 1] = Math.max(0, Math.min(255, d[k + 1] * f));
        d[k + 2] = Math.max(0, Math.min(255, d[k + 2] * f));
      }
    }
    g.putImageData(img, 0, 0);

    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /* ---- coat normal map (subtle hide / fur grain) ------------------- */
  function coatNormal() {
    const W = 512, H = 256;
    const c = canvas(W, H), g = ctx2d(c);
    const img = g.createImageData(W, H), d = img.data;
    const h = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      h[y * W + x] = fbm(x * 0.35, y * 0.35, 4) * 0.7 + fbm(x * 1.4, y * 1.4, 3) * 0.3;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dx = (h[y * W + ((x + 1) % W)] - h[y * W + ((x + W - 1) % W)]) * 2.2;
      const dy = (h[((y + 1) % H) * W + x] - h[((y + H - 1) % H) * W + x]) * 2.2;
      const len = Math.hypot(-dx, -dy, 1);
      d[i] = (-dx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ---- leg skin: cream with a darker upper "sock" ------------------ */
  function legSkin(pal) {
    const W = 256, H = 256;
    const c = canvas(W, H), g = ctx2d(c);
    g.fillStyle = pal.leg; g.fillRect(0, 0, W, H);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const n = fbm(x * 0.05, y * 0.05, 5);
        const t = y / H;                       // 0 = top of the leg
        const sock = Math.max(0, 1 - t * 3.2); // darker band near the top
        const f = 0.90 + n * 0.20 - sock * 0.10;
        d[k] *= f; d[k + 1] *= f; d[k + 2] *= f;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---- hoof -------------------------------------------------------- */
  function hoofTexture(pal) {
    const W = 128, H = 256;
    const c = canvas(W, H), g = ctx2d(c);
    g.fillStyle = pal.hoof; g.fillRect(0, 0, W, H);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const grain = fbm(x * 0.14, y * 0.02, 3) * 0.5 + fbm(x * 0.5, y * 0.09, 2) * 0.5;
        const band = (y / H > 0.86) ? 0.30 : 0;    // coronet band
        const f = 0.55 + grain * 0.75 + band;
        d[k] *= f; d[k + 1] *= f; d[k + 2] *= f;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---- savanna ground ---------------------------------------------- */
  function ground() {
    const W = 512, H = 512;
    const c = canvas(W, H), g = ctx2d(c);
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4;
        const big = fbm(x * 0.012, y * 0.012, 4);
        const mid = fbm(x * 0.06 + 11, y * 0.06 + 7, 4);
        const fine = fbm(x * 0.5, y * 0.5, 3);
        // dry grass base with patches of bare earth
        const earth = Math.max(0, mid - 0.56) * 2.4;
        let r = 150 + big * 40, gg = 143 + big * 36, b = 92 + big * 30;
        r = r * (1 - earth) + 132 * earth;
        gg = gg * (1 - earth) + 108 * earth;
        b = b * (1 - earth) + 74 * earth;
        const f = 0.86 + fine * 0.28;
        d[k] = r * f; d[k + 1] = gg * f; d[k + 2] = b * f; d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // grass streaks
    g.globalAlpha = 0.20;
    for (let i = 0; i < 900; i++) {
      const x = rand() * W, y = rand() * H;
      g.strokeStyle = rand() < 0.5 ? '#8e8a4a' : '#b6ab6a';
      g.lineWidth = 0.6 + rand() * 1.2;
      g.beginPath(); g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 7, y - 2 - rand() * 9); g.stroke();
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /* ---- grass blade tuft (alpha) ------------------------------------ */
  function grassBlade() {
    const W = 128, H = 128;
    const c = canvas(W, H), g = ctx2d(c);
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) {
      const x0 = 30 + rand() * 68, h = 55 + rand() * 62;
      const bend = (rand() - 0.5) * 46;
      const col = rand() < 0.45 ? '#8f8b46' : (rand() < 0.5 ? '#a89a55' : '#6f7335');
      g.strokeStyle = col; g.lineWidth = 3 + rand() * 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, H);
      g.quadraticCurveTo(x0 + bend * 0.4, H - h * 0.55, x0 + bend, H - h);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ---- acacia bark / leaves ---------------------------------------- */
  function bark() {
    const W = 256, H = 256;
    const c = canvas(W, H), g = ctx2d(c);
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      const v = fbm(x * 0.06, y * 0.9, 4) * 0.6 + fbm(x * 0.3, y * 0.25, 3) * 0.4;
      const f = 0.55 + v * 0.8;
      d[k] = 108 * f; d[k + 1] = 88 * f; d[k + 2] = 66 * f; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function leaf() {
    const W = 128, H = 128;
    const c = canvas(W, H), g = ctx2d(c);
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      const v = fbm(x * 0.09, y * 0.09, 4);
      const f = 0.62 + v * 0.7;
      d[k] = 92 * f; d[k + 1] = 112 * f; d[k + 2] = 58 * f; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /** Soft round sprite used for dust puffs / clouds. */
  function puff() {
    const S = 128;
    const c = canvas(S, S), g = ctx2d(c);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.42)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  return {
    PALETTES, giraffeCoat, coatNormal, legSkin, hoofTexture,
    ground, grassBlade, bark, leaf, puff
  };
})();
