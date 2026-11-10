/* ---------------------------------------------------------------------------
 * textures.js — every texture in the scene is generated procedurally on a 2D
 * canvas at load time: the giraffe coat (seamless Voronoi patch work), skin
 * micro-normal, ground, dry grass cards, acacia foliage, bark, mane hairs.
 * ------------------------------------------------------------------------- */
(function () {
  const T = (window.T = {});

  // per-cell deterministic hash (periodic => seamless tiles)
  function chash(i, j, k) {
    const n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }

  /* =====================================================================
   * GIRAFFE COAT
   * opts: {size, cells, patch, patch2, channel, edge, dark, warp}
   * returns {map, normalMap, roughnessMap, maskCanvas}
   * =================================================================== */
  T.coat = function (opts) {
    opts = opts || {};
    const S = opts.size || 1024;
    const N = opts.cells || 6;              // seeds per row/col of the tile
    const cell = S / N;
    const patchCol = opts.patch || [152, 96, 48];
    const patchCol2 = opts.patch2 || [120, 66, 33];
    const chan = opts.channel || [240, 222, 186];
    const warpAmp = opts.warp !== undefined ? opts.warp : 0.42;
    const edgeW = opts.edge !== undefined ? opts.edge : 0.16;

    const color = U.canvas(S, S), height = U.canvas(S, S), rough = U.canvas(S, S);
    const ci = color.getContext('2d').createImageData(S, S);
    const hi = height.getContext('2d').createImageData(S, S);
    const ri = rough.getContext('2d').createImageData(S, S);
    const Cd = ci.data, Hd = hi.data, Rd = ri.data;

    const inv = 1 / cell;
    for (let y = 0; y < S; y++) {
      const fy = y * inv, gy = Math.floor(fy);
      for (let x = 0; x < S; x++) {
        const fx = x * inv, gx = Math.floor(fx);
        // warp coordinates so the patch borders are wiggly & organic
        const w = U.fbmt(x / S, y / S, 5.5, 5.5, 4);
        const wx = fx + (w - 0.5) * warpAmp * 2;
        const wy = fy + (U.fbmt(x / S + 0.31, y / S + 0.77, 5.5, 5.5, 4) - 0.5) * warpAmp * 2;
        const cgx = Math.floor(wx), cgy = Math.floor(wy);
        let d1 = 1e9, d2 = 1e9, id1 = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const iu = ((cgx + ox) % N + N) % N, iv = ((cgy + oy) % N + N) % N;
            const sx = (cgx + ox) + chash(iu, iv, 1) * 0.86 + 0.07;
            const sy = (cgy + oy) + chash(iu, iv, 2) * 0.86 + 0.07;
            const dx = sx - wx, dy = sy - wy;
            const d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; id1 = iu * 31 + iv; }
            else if (d < d2) { d2 = d; }
          }
        }
        d1 = Math.sqrt(d1); d2 = Math.sqrt(d2);
        const band = d2 - d1;                        // 0 at border
        let m = U.smoothstep(U.clamp((band - edgeW * 0.35) / (edgeW * 0.9), 0, 1));
        // stretch: split some cells into smaller patches (like real giraffes)
        const subdiv = chash(id1 % 31, Math.floor(id1 / 31), 5) > 0.72 ? 0.55 : 1;
        m = m * m * (3 - 2 * m);

        // per-patch colour variation
        const pv = chash(id1 % 31, Math.floor(id1 / 31), 9);
        const scale = U.fbm2(x * 0.006, y * 0.006, 3);
        let cc = U.mixRGB(patchCol2, patchCol, U.clamp(pv * 0.8 + scale * 0.5, 0, 1));
        const ch = [chan[0] * (0.93 + scale * 0.12), chan[1] * (0.93 + scale * 0.12), chan[2] * (0.9 + scale * 0.15)];
        let r = U.lerp(ch[0], cc[0], m), g = U.lerp(ch[1], cc[1], m), b = U.lerp(ch[2], cc[2], m);
        // dark rim right inside the patch border
        const rim = (1 - Math.abs(m - 0.85) / 0.2) > 0 ? U.clamp(1 - m / 0.9, 0, 1) : 0;
        const rimK = U.clamp(1 - Math.abs(m - 0.75) / 0.3, 0, 1) * 0.22;
        r = U.lerp(r, 62, rimK); g = U.lerp(g, 38, rimK); b = U.lerp(b, 22, rimK);

        // hair grain: fine directional streaks + speckle
        const grain = U.noise2(x * 0.9, y * 0.28) * 0.5 + U.noise2(x * 2.1, y * 0.6 + 40) * 0.28;
        const gk = (grain - 0.39) * 26;
        r += gk; g += gk * 0.92; b += gk * 0.8;
        // subtle large mottling
        const mott = (U.fbm2(x * 0.0025, y * 0.0025, 3) - 0.5) * 18;
        r += mott; g += mott; b += mott;

        const p = (y * S + x) * 4;
        Cd[p] = U.clamp(r, 0, 255); Cd[p + 1] = U.clamp(g, 0, 255); Cd[p + 2] = U.clamp(b, 0, 255); Cd[p + 3] = 255;

        // height: channels sit lower, patches slightly raised, grain on top
        let h = 0.35 + m * 0.4 + grain * 0.22 + (1 - m) * 0.05;
        Hd[p] = Hd[p + 1] = Hd[p + 2] = U.clamp(h * 255, 0, 255); Hd[p + 3] = 255;

        // roughness: patches slightly glossier than the pale channels
        const ro = 0.86 - m * 0.12 + (U.noise2(x * 1.3, y * 1.3) - 0.5) * 0.06;
        Rd[p] = Rd[p + 1] = Rd[p + 2] = U.clamp(ro * 255, 0, 255); Rd[p + 3] = 255;
      }
    }
    color.getContext('2d').putImageData(ci, 0, 0);
    height.getContext('2d').putImageData(hi, 0, 0);
    rough.getContext('2d').putImageData(ri, 0, 0);

    const map = new THREE.CanvasTexture(color);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 8;
    const normalMap = T.normalFromHeight(height, opts.normalStrength || 1.4);
    const roughnessMap = new THREE.CanvasTexture(rough);
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.anisotropy = 4;
    return { map, normalMap, roughnessMap, colorCanvas: color, heightCanvas: height };
  };

  /* Sobel height -> tangent-space normal map canvas texture */
  T.normalFromHeight = function (heightCanvas, strength) {
    const S = heightCanvas.width;
    const src = heightCanvas.getContext('2d').getImageData(0, 0, S, S).data;
    const out = U.canvas(S, S);
    const oi = out.getContext('2d').createImageData(S, S);
    const d = oi.data;
    const at = (x, y) => src[(((y % S) + S) % S) * S * 4 + (((x % S) + S) % S) * 4] / 255;
    const k = (strength || 1) * 3.2;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
        const l = at(x - 1, y), r = at(x + 1, y);
        const bl = at(x - 1, y + 1), bm = at(x, y + 1), br = at(x + 1, y + 1);
        const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
        const dy = (bl + 2 * bm + br) - (tl + 2 * t + tr);
        let nx = -dx * k, ny = -dy * k, nz = 1;
        const len = Math.hypot(nx, ny, nz);
        const p = (y * S + x) * 4;
        d[p] = (nx / len * 0.5 + 0.5) * 255;
        d[p + 1] = (ny / len * 0.5 + 0.5) * 255;
        d[p + 2] = (nz / len * 0.5 + 0.5) * 255;
        d[p + 3] = 255;
      }
    }
    out.getContext('2d').putImageData(oi, 0, 0);
    const tex = new THREE.CanvasTexture(out);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  };

  /* =====================================================================
   * GROUND — dry savanna soil with dust, pebbles, dried grass strokes
   * =================================================================== */
  T.ground = function (size) {
    const S = size || 1024;
    const c = U.canvas(S, S);
    const ctx = c.getContext('2d');
    const id = ctx.createImageData(S, S);
    const d = id.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const base = U.fbmt(u, v, 4, 4, 5);
        const fine = U.fbmt(u + 0.13, v + 0.41, 18, 18, 4);
        const crack = Math.abs(U.fbmt(u + 0.7, v + 0.2, 7, 7, 3) - 0.5);
        let r = U.lerp(176, 206, base), g = U.lerp(143, 171, base), b = U.lerp(96, 121, base);
        // ochre patches
        const ochre = U.clamp((U.fbmt(u + 0.55, v + 0.85, 2.4, 2.4, 3) - 0.45) * 3, 0, 1);
        r = U.lerp(r, 190, ochre * 0.5); g = U.lerp(g, 140, ochre * 0.5); b = U.lerp(b, 88, ochre * 0.5);
        // dry grass flecks
        const fleck = U.clamp((fine - 0.58) * 5, 0, 1);
        r = U.lerp(r, 214, fleck * 0.5); g = U.lerp(g, 196, fleck * 0.5); b = U.lerp(b, 140, fleck * 0.5);
        // pebbles
        const pb = U.clamp((U.noise2(x * 0.35, y * 0.35) - 0.78) * 6, 0, 1);
        r = U.lerp(r, 150, pb); g = U.lerp(g, 146, pb); b = U.lerp(b, 140, pb);
        // desiccation cracks
        const ck = U.clamp((0.018 - crack) * 90, 0, 1) * 0.6;
        r = U.lerp(r, 118, ck); g = U.lerp(g, 96, ck); b = U.lerp(b, 70, ck);
        const p = (y * S + x) * 4;
        const sp = (U.rnd() - 0.5) * 8;
        d[p] = U.clamp(r + sp, 0, 255); d[p + 1] = U.clamp(g + sp, 0, 255); d[p + 2] = U.clamp(b + sp, 0, 255); d[p + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);
    // a few bigger stones / dung specks drawn as blobs
    for (let i = 0; i < 60; i++) {
      const x = U.rnd() * S, y = U.rnd() * S, rr = 2 + U.rnd() * 6;
      ctx.fillStyle = `rgba(${110 + U.rnd() * 40 | 0},${88 + U.rnd() * 30 | 0},${60 + U.rnd() * 25 | 0},0.5)`;
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * (0.6 + U.rnd() * 0.5), U.rnd() * 3, 0, 7); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const nrm = T.normalFromHeight(c, 1.1);
    return { map: tex, normalMap: nrm };
  };

  /* =====================================================================
   * DRY GRASS TUFT CARD (alpha) — used for the scattered savanna grass
   * =================================================================== */
  T.grassCard = function (opts) {
    opts = opts || {};
    const S = 256, c = U.canvas(S, S), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    ctx.lineCap = 'round';
    const blades = opts.blades || 46;
    for (let i = 0; i < blades; i++) {
      const x0 = U.range(20, S - 20);
      const h = U.range(0.45, 1) * (S * 0.82);
      const y0 = S - U.range(2, 18);
      const bend = U.range(-1, 1) * S * 0.22;
      const w = U.range(1.6, 4.2);
      const g = U.rnd();
      const col = g < 0.55
        ? [206 + U.rnd() * 40, 186 + U.rnd() * 34, 118 + U.rnd() * 40]           // dry straw
        : (g < 0.8 ? [150 + U.rnd() * 40, 160 + U.rnd() * 30, 78 + U.rnd() * 30] // green shoot
                   : [120 + U.rnd() * 30, 112 + U.rnd() * 20, 70 + U.rnd() * 20]);
      ctx.strokeStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${U.range(0.75, 1)})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + bend * 0.35, y0 - h * 0.6, x0 + bend, y0 - h);
      ctx.stroke();
      // thin highlight
      ctx.lineWidth = Math.max(0.6, w * 0.35);
      ctx.strokeStyle = `rgba(255,245,210,0.16)`;
      ctx.beginPath();
      ctx.moveTo(x0 - w * 0.2, y0);
      ctx.quadraticCurveTo(x0 + bend * 0.35, y0 - h * 0.6, x0 + bend, y0 - h);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  /* =====================================================================
   * ACACIA FOLIAGE CARD — flat canopy clusters
   * =================================================================== */
  T.foliageCard = function () {
    const S = 256, c = U.canvas(S, S), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const a = U.rnd() * Math.PI * 2, r = Math.pow(U.rnd(), 0.55) * S * 0.46;
      const x = S / 2 + Math.cos(a) * r * 1.25;
      const y = S / 2 + Math.sin(a) * r * 0.75;
      if (x < 2 || x > S - 2 || y < 2 || y > S - 2) continue;
      const s = U.range(2.4, 6.5);
      const g = U.rnd();
      const col = g < 0.5 ? [70 + U.rnd() * 40, 104 + U.rnd() * 46, 46 + U.rnd() * 26]
                          : [110 + U.rnd() * 50, 134 + U.rnd() * 40, 60 + U.rnd() * 30];
      ctx.fillStyle = `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${U.range(0.8, 1)})`;
      ctx.save(); ctx.translate(x, y); ctx.rotate(U.rnd() * 3);
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    // a few twigs
    ctx.strokeStyle = 'rgba(70,56,40,0.85)';
    for (let i = 0; i < 14; i++) {
      ctx.lineWidth = U.range(0.7, 2.0);
      const x = U.range(10, S - 10), y = U.range(10, S - 10), a = U.rnd() * 6.3, l = U.range(15, 60);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  /* =====================================================================
   * BARK — grey, vertically fissured
   * =================================================================== */
  T.bark = function (size) {
    const S = size || 256, c = U.canvas(S, S), ctx = c.getContext('2d');
    const id = ctx.createImageData(S, S), d = id.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const stripe = U.fbmt(x / S * 1.0, y / S * 0.12, 30, 3, 4);
        const grain = U.fbmt(x / S, y / S, 26, 26, 3);
        let v = 0.42 + stripe * 0.5 + grain * 0.2;
        v *= 0.8 + 0.4 * U.noise2(x * 0.05, y * 0.6);
        const r = U.clamp((110 * v + 22), 0, 255), g = U.clamp((100 * v + 20), 0, 255), b = U.clamp((86 * v + 16), 0, 255);
        const p = (y * S + x) * 4;
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return { map: tex, normalMap: T.normalFromHeight(c, 1.6) };
  };

  /* =====================================================================
   * MANE HAIR STRIP — short erect hairs, alpha, painted along neck top
   * =================================================================== */
  T.maneCard = function () {
    const W = 128, H = 64, c = U.canvas(W, H), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < 130; i++) {
      const x = U.range(2, W - 2);
      const h = U.range(0.5, 1) * H * 0.9;
      const lean = U.range(-0.25, 0.25) * W;
      ctx.strokeStyle = `rgba(${70 + U.rnd() * 60 | 0},${40 + U.rnd() * 32 | 0},${22 + U.rnd() * 20 | 0},${U.range(0.55, 1)})`;
      ctx.lineWidth = U.range(0.8, 2.2);
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.quadraticCurveTo(x + lean * 0.4, H - h * 0.55, x + lean, H - h);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  /* =====================================================================
   * TAIL TUFT — dark hair card bundle (used as crossed cards)
   * =================================================================== */
  T.tailCard = function () {
    const W = 128, H = 256, c = U.canvas(W, H), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < 260; i++) {
      const x0 = U.range(W * 0.32, W * 0.68);
      const y0 = 0;
      const x1 = U.range(W * 0.1, W * 0.9);
      const y1 = U.range(H * 0.55, H);
      ctx.strokeStyle = `rgba(${48 + U.rnd() * 40 | 0},${30 + U.rnd() * 24 | 0},${20 + U.rnd() * 16 | 0},${U.range(0.5, 1)})`;
      ctx.lineWidth = U.range(0.9, 2.4);
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(U.lerp(x0, x1, 0.5) + U.range(-8, 8), U.lerp(y0, y1, 0.5), x1, y1);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  /* =====================================================================
   * EYE — spherical eye with dark iris, big pupil, glossy ring
   * =================================================================== */
  T.eye = function () {
    const S = 128, c = U.canvas(S, S), ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#2a1a10'); g.addColorStop(0.5, '#170d07'); g.addColorStop(1, '#0b0705');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    // iris sheen
    ctx.globalAlpha = 0.5;
    const rg = ctx.createRadialGradient(S * 0.42, S * 0.38, 2, S * 0.42, S * 0.38, S * 0.5);
    rg.addColorStop(0, '#6b4a2a'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  /* =====================================================================
   * SKY — equirect gradient with sun glow; regenerable for time-of-day
   * =================================================================== */
  T.skyCanvas = function (params) {
    const p = Object.assign({
      w: 1024, h: 512,
      zenith: [58, 118, 180], horizon: [206, 214, 205], ground: [118, 106, 86],
      sunDir: [0.4, 0.35, -0.85], sunColor: [255, 246, 220], sunSize: 0.035,
      haze: 0.5, cloud: 0.55
    }, params || {});
    const W = p.w, H = p.h, c = U.canvas(W, H), ctx = c.getContext('2d');
    const id = ctx.createImageData(W, H), d = id.data;
    const sd = new THREE.Vector3(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      const el = (0.5 - v) * Math.PI;               // +pi/2 at top
      const up = Math.sin(el), ar = Math.abs(Math.cos(el));
      for (let x = 0; x < W; x++) {
        const az = (x / W) * Math.PI * 2 - Math.PI;
        const dir = new THREE.Vector3(Math.sin(az) * ar, up, -Math.cos(az) * ar);
        let col;
        if (up > 0) {
          const t = Math.pow(up, 0.55);
          col = U.mixRGB(p.horizon, p.zenith, t);
          // warm band right above horizon
          const band = Math.exp(-Math.pow((1 - t) * 2.6, 2)) * p.haze;
          col = U.mixRGB(col, [246, 208, 160], U.clamp(band * 0.75, 0, 0.85));
        } else {
          col = U.mixRGB(p.horizon, p.ground, U.clamp(-up * 2.2, 0, 1));
        }
        // sun + glow
        const dot = dir.dot(sd);
        if (dot > 0) {
          const glow = Math.pow(U.clamp(dot, 0, 1), 1 / (p.sunSize * 2.2)) * 0.9;
          col = U.mixRGB(col, p.sunColor, U.clamp(glow, 0, 0.95));
          if (dot > 0.99985) col = [255, 255, 245];
        }
        // clouds: banded fbm only in the upper hemisphere
        if (p.cloud > 0 && up > 0.02) {
          const cu = x / W, cv = 0.5 - up * 0.9;
          let n = U.fbmt(cu, cv, 7, 3, 5);
          const fade = U.clamp((up - 0.02) * 6, 0, 1) * U.clamp(1 - (up - 0.05) * 0.85, 0, 1);
          n = U.clamp((n - (0.52 - p.cloud * 0.12)) * 4.2, 0, 1) * fade;
          const lit = U.clamp(0.55 + dot * 0.6, 0, 1);
          const cc = [U.lerp(150, 255, lit), U.lerp(150, 250, lit), U.lerp(160, 240, lit)];
          col = U.mixRGB(col, cc, n * 0.85);
        }
        const i = (y * W + x) * 4;
        d[i] = U.clamp(col[0], 0, 255); d[i + 1] = U.clamp(col[1], 0, 255); d[i + 2] = U.clamp(col[2], 0, 255); d[i + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);
    return c;
  };
})();
