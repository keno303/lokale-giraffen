// ---------------------------------------------------------------------------
// 15_coat.js -- procedural reticulated-giraffe coat atlas.
// The atlas is a *parameterisation of the animal*, not a per-part UV map:
//   U = metres travelled along the spine path (tail tip -> nose), 0..ATLAS_LEN
//   V = metres travelled around the body from the dorsal midline, 0..ATLAS_AROUND
// Every lofted part samples this one texture, so the patchwork stays the right
// physical size and continues across the seams between parts.
// Channels:  R = patch mask (0 cream channel, 1 patch)
//            G = per-patch colour jitter
//            B = low-frequency mottling
// ---------------------------------------------------------------------------
window.G = window.G || {};
(function (G) {
  'use strict';

  G.makeCoatAtlas = function (opts) {
    opts = opts || {};
    const W = opts.w || 2048, H = opts.h || 1024;
    const ML = G.ATLAS_LEN, MA = G.ATLAS_AROUND;
    const sx = W / ML, sy = H / MA;          // px per metre
    const r = G.rng(opts.seed || 1337);

    // --- seeds on a jittered lattice (approx. Poisson) ---------------------
    const cell = 0.168;                       // metres
    const nx = Math.round(ML / cell), ny = Math.round(MA / cell);
    const seeds = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const px = (i + 0.5 + r.range(-0.42, 0.42)) * cell;
        const py = (j + 0.5 + r.range(-0.42, 0.42)) * cell;
        seeds.push(px, py, r());
      }
    }
    const NS = seeds.length / 3;
    // bucket grid over seeds
    const BS = 0.34, bnx = Math.ceil((ML + BS * 2) / BS), bny = Math.ceil((MA + BS * 2) / BS);
    const buckets = new Array(bnx * bny);
    for (let i = 0; i < bnx * bny; i++) buckets[i] = [];
    for (let s = 0; s < NS; s++) {
      const bx = Math.floor((seeds[s * 3] + BS) / BS), by = Math.floor((seeds[s * 3 + 1] + BS) / BS);
      const k = by * bnx + bx;
      if (buckets[k]) buckets[k].push(s);
    }

    // --- low frequency mottle, computed small then sampled ----------------
    const MW = 192, MH = 96, mot = new Float32Array(MW * MH);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++)
      mot[y * MW + x] = G.fbm((x / MW) * 9.0, (y / MH) * 7.0, 3, 71);

    const img = new Uint8ClampedArray(W * H * 4);
    const dx = 1 / sx, dy = 1 / sy;
    for (let py = 0; py < H; py++) {
      const my = py * dy;
      const by = Math.floor((my + BS) / BS);
      for (let px = 0; px < W; px++) {
        const mx = px * dx;
        const bx = Math.floor((mx + BS) / BS);
        let d1 = 1e9, d2 = 1e9, js = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const gy = by + oy; if (gy < 0 || gy >= bny) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const gx = bx + ox; if (gx < 0 || gx >= bnx) continue;
            const B = buckets[gy * bnx + gx];
            for (let b = 0; b < B.length; b++) {
              const s = B[b];
              const ex = seeds[s * 3] - mx, ey = seeds[s * 3 + 1] - my;
              const d = ex * ex + ey * ey;
              if (d < d1) { d2 = d1; d1 = d; js = s; }
              else if (d < d2) d2 = d;
            }
          }
        }
        d1 = Math.sqrt(d1); d2 = Math.sqrt(d2);
        // cream channel width: narrower on the back, wider down the flanks
        const around = Math.min(my, MA - my);
        const bw = 0.0075 + 0.0135 * G.smooth(0.3, 1.9, around) + 0.005 * G.noise2(mx * 3.1, my * 3.1, 5);
        const edge = (d2 - d1);
        let mask = G.smooth(bw * 0.42, bw * 1.15, edge);
        // break the patch edges up a little so they are not perfect Voronoi
        mask *= 0.86 + 0.28 * G.noise2(mx * 14.0, my * 14.0, 21);
        // rosette splitting: a couple of long patches get a spur
        const split = G.noise2(mx * 2.2 + 3.3, my * 2.2, 44);
        if (split > 0.66) mask *= G.smooth(bw * 1.6, bw * 4.0, edge * (1 - (split - 0.66) * 1.8));

        const mi = Math.floor((my / MA) * MH) * MW + Math.floor((mx / ML) * MW);
        const mo = mot[Math.min(MH - 1, Math.max(0, Math.floor((my / MA) * MH))) * MW + Math.min(MW - 1, Math.max(0, Math.floor((mx / ML) * MW)))];
        const jitter = seeds[js * 3 + 2];
        const o = (py * W + px) * 4;
        img[o] = Math.round(G.clamp(mask, 0, 1) * 255);
        img[o + 1] = Math.round(jitter * 255);
        img[o + 2] = Math.round(mo * 255);
        img[o + 3] = 255;
      }
    }
    const cv = G.canvas(W, H);
    cv.getContext('2d').putImageData(new ImageData(img, W, H), 0, 0);
    const tex = G.tex(cv, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, flipY: false, aniso: 8 });
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return { texture: tex, canvas: cv };
  };
})(window.G);
