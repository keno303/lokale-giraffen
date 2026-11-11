// Giraffe anatomy: skeleton, SDF body description, skinned mesh and coat material.
// Units are metres. +X is forward, +Y up, +Z is the animal's right side.
(function () {
  'use strict';
  const GIR = (window.GIR = window.GIR || {});

  // ---- joint positions in the rest (standing) pose, right side -------------
  const J = {
    root: [-0.80, 2.40, 0], spine1: [-0.35, 2.52, 0], spine2: [0.15, 2.62, 0],
    neck0: [0.55, 2.74, 0], head: [1.66, 4.50, 0], jaw: [1.75, 4.42, 0],
    ear: [1.645, 4.555, 0.105],
    scap: [0.38, 2.92, 0.15], hum: [0.70, 2.32, 0.21], rad: [0.44, 1.88, 0.21],
    mc: [0.50, 1.03, 0.19], ffoot: [0.47, 0.24, 0.19], ftoe: [0.635, 0, 0.19],
    fem: [-0.80, 2.32, 0.19], tib: [-0.55, 1.86, 0.23], mt: [-1.02, 1.08, 0.20],
    hfoot: [-0.93, 0.24, 0.20], htoe: [-0.765, 0, 0.20],
  };
  const NECK_N = 6;
  const TAIL = [[-1.07, 2.40, 0], [-1.165, 2.19, 0], [-1.205, 1.96, 0], [-1.22, 1.73, 0], [-1.225, 1.50, 0], [-1.225, 1.27, 0], [-1.225, 1.02, 0], [-1.225, 0.74, 0]];

  function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  const mz = p => [p[0], p[1], -p[2]];

  function neckPoint(i) {
    const t = i / NECK_N;
    const p = lerp3(J.neck0, J.head, t);
    // very slight forward bow in the lower third
    p[0] += 0.035 * Math.sin(Math.PI * t) * (1 - t);
    return p;
  }

  function boneDefs() {
    const defs = [];
    const add = (name, parent, pos) => defs.push({ name, parent, pos });
    add('root', null, J.root);
    add('spine1', 'root', J.spine1);
    add('spine2', 'spine1', J.spine2);
    for (let i = 0; i < NECK_N; i++) add('neck' + (i + 1), i === 0 ? 'spine2' : 'neck' + i, neckPoint(i));
    add('head', 'neck' + NECK_N, J.head);
    add('jaw', 'head', J.jaw);
    add('earR', 'head', J.ear);
    add('earL', 'head', mz(J.ear));
    for (let i = 0; i < TAIL.length - 1; i++) add('tail' + (i + 1), i === 0 ? 'root' : 'tail' + i, TAIL[i]);
    for (const s of ['R', 'L']) {
      const f = s === 'R' ? (p => p) : mz;
      add('scap' + s, 'spine2', f(J.scap));
      add('hum' + s, 'scap' + s, f(J.hum));
      add('rad' + s, 'hum' + s, f(J.rad));
      add('mc' + s, 'rad' + s, f(J.mc));
      add('ffoot' + s, 'mc' + s, f(J.ffoot));
      add('fem' + s, 'root', f(J.fem));
      add('tib' + s, 'fem' + s, f(J.tib));
      add('mt' + s, 'tib' + s, f(J.mt));
      add('hfoot' + s, 'mt' + s, f(J.hfoot));
    }
    return defs;
  }

  // ---- body volume -----------------------------------------------------------
  function describe(m) {
    const M = { mirror: true };
    const o = (bone, extra) => Object.assign({ bone }, extra || {});

    // trunk
    m.rc([0.42, 2.48, 0], [-0.22, 2.44, 0], 0.60, 0.52, o('spine2', { s: [1, 1, 0.62], k: 0.10 }));
    m.rc([-0.22, 2.44, 0], [-0.72, 2.42, 0], 0.52, 0.40, o('spine1', { s: [1, 1, 0.63], k: 0.10 }));
    m.rc([-0.68, 2.42, 0], [-0.98, 2.34, 0], 0.375, 0.235, o('root', { s: [1, 1, 0.72], k: 0.10 }));
    m.rc([0.42, 2.88, 0], [-0.15, 2.76, 0], 0.25, 0.18, o('spine2', { s: [1, 1, 0.5], k: 0.10 }));  // withers
    m.rc([0.52, 2.36, 0], [0.74, 2.47, 0], 0.42, 0.275, o('spine2', { s: [1, 1, 0.64], k: 0.10 })); // brisket

    // shoulder + fore limb
    m.rc([0.40, 2.84, 0.18], [0.68, 2.34, 0.245], 0.18, 0.21, o('scapR', Object.assign({ s: [1, 1, 0.66], k: 0.08 }, M)));
    m.rc([0.68, 2.31, 0.24], [0.47, 1.93, 0.22], 0.20, 0.138, o('humR', Object.assign({ s: [1, 1, 0.66], k: 0.08 }, M)));
    m.rc([0.445, 1.88, 0.21], [0.50, 1.08, 0.19], 0.112, 0.056, o('radR', Object.assign({ k: 0.05 }, M)));
    m.rc([0.395, 1.87, 0.21], [0.455, 1.42, 0.2], 0.10, 0.055, o('radR', Object.assign({ k: 0.05, s: [1, 1, 0.8] }, M)));
    m.ell([0.51, 1.03, 0.19], [0.08, 0.096, 0.072], o('mcR', Object.assign({ k: 0.035 }, M)));
    m.rc([0.50, 0.98, 0.19], [0.47, 0.29, 0.19], 0.05, 0.046, o('mcR', Object.assign({ k: 0.03, s: [1.14, 1, 0.92] }, M)));
    m.ell([0.464, 0.245, 0.19], [0.068, 0.074, 0.06], o('ffootR', Object.assign({ k: 0.03 }, M)));
    m.rc([0.475, 0.22, 0.19], [0.52, 0.11, 0.19], 0.05, 0.064, o('ffootR', Object.assign({ k: 0.03 }, M)));
    m.rc([0.513, 0.07, 0.19], [0.59, 0.036, 0.19], 0.094, 0.062, o('ffootR', Object.assign({ k: 0.012, mat: 'hoof' }, M)));
    m.rc([0.66, 0.02, 0.19], [0.60, 0.13, 0.19], 0.014, 0.012, o('ffootR', Object.assign({ k: 0.008, sub: true }, M)));  // cloven hoof

    // hind quarter + hind limb
    m.rc([-0.80, 2.34, 0.17], [-0.575, 1.90, 0.215], 0.31, 0.165, o('femR', Object.assign({ s: [1, 1, 0.56], k: 0.09 }, M)));
    m.rc([-0.97, 2.22, 0.13], [-0.80, 1.74, 0.20], 0.195, 0.10, o('femR', Object.assign({ s: [1, 1, 0.6], k: 0.09 }, M)));
    m.rc([-0.60, 1.84, 0.225], [-0.99, 1.15, 0.20], 0.138, 0.06, o('tibR', Object.assign({ s: [1, 1, 0.75], k: 0.06 }, M)));
    m.rc([-1.085, 1.19, 0.20], [-0.90, 1.52, 0.212], 0.03, 0.055, o('tibR', Object.assign({ s: [1, 1, 0.7], k: 0.05 }, M))); // achilles
    m.ell([-1.02, 1.08, 0.20], [0.076, 0.094, 0.064], o('mtR', Object.assign({ k: 0.035 }, M)));
    m.rc([-1.04, 1.09, 0.20], [-1.09, 1.195, 0.20], 0.05, 0.037, o('mtR', Object.assign({ k: 0.03 }, M)));  // calcaneus
    m.rc([-1.01, 1.03, 0.20], [-0.935, 0.29, 0.20], 0.053, 0.047, o('mtR', Object.assign({ k: 0.03, s: [1.14, 1, 0.92] }, M)));
    m.ell([-0.934, 0.245, 0.20], [0.068, 0.074, 0.06], o('hfootR', Object.assign({ k: 0.03 }, M)));
    m.rc([-0.925, 0.22, 0.20], [-0.885, 0.11, 0.20], 0.05, 0.062, o('hfootR', Object.assign({ k: 0.03 }, M)));
    m.rc([-0.89, 0.066, 0.20], [-0.815, 0.035, 0.20], 0.09, 0.06, o('hfootR', Object.assign({ k: 0.012, mat: 'hoof' }, M)));
    m.rc([-0.745, 0.02, 0.20], [-0.805, 0.13, 0.20], 0.014, 0.012, o('hfootR', Object.assign({ k: 0.008, sub: true }, M)));

    // neck
    const nr = [0.40, 0.305, 0.24, 0.198, 0.17, 0.15, 0.136];
    const nzs = [0.60, 0.62, 0.66, 0.70, 0.74, 0.78, 0.82];
    const N = []; for (let i = 0; i <= NECK_N; i++) N.push(neckPoint(i));
    for (let i = 0; i < NECK_N; i++) {
      m.rc(N[i], N[i + 1], nr[i], nr[i + 1], o('neck' + (i + 1), { s: [1, 1, 0.5 * (nzs[i] + nzs[i + 1])], k: i === 0 ? 0.12 : 0.05 }));
    }
    // mane: thin ridge along the dorsal line
    const nd = [J.head[0] - J.neck0[0], J.head[1] - J.neck0[1]];
    const nl = Math.hypot(nd[0], nd[1]);
    const nn = [-nd[1] / nl, nd[0] / nl];
    const maneAt = t => {
      const f = t * NECK_N, i = Math.min(NECK_N - 1, Math.floor(f)), u = f - i;
      const p = lerp3(N[i], N[i + 1], u), r = nr[i] + (nr[i + 1] - nr[i]) * u - 0.014;
      return [p[0] + nn[0] * r, p[1] + nn[1] * r, 0];
    };
    const MS = 14;
    for (let i = 0; i < MS; i++) {
      const ta = 0.2 + 0.8 * i / MS, tb = 0.2 + 0.8 * (i + 1) / MS;
      const ha = 0.03 + 0.03 * smooth(0.2, 0.42, ta), hb = 0.03 + 0.03 * smooth(0.2, 0.42, tb);
      m.rc(maneAt(ta), maneAt(tb), ha, hb, o('neck' + Math.min(NECK_N, 1 + Math.floor((ta + tb) / 2 * NECK_N)), { s: [1, 1, 0.34], k: 0.014, mat: 'mane' }));
    }

    // head
    m.rc([1.69, 4.50, 0], [1.895, 4.445, 0], 0.133, 0.117, o('head', { s: [1, 1, 0.9], k: 0.04 }));
    m.rc([1.895, 4.445, 0], [2.235, 4.335, 0], 0.112, 0.074, o('head', { s: [1, 1, 0.86], k: 0.04 }));
    m.ell([2.28, 4.32, 0], [0.073, 0.06, 0.064], o('head', { k: 0.03, mat: 'muzzle' }));
    m.ell([1.94, 4.545, 0], [0.10, 0.05, 0.065], o('head', { k: 0.04 }));                 // median lump
    m.rc([1.75, 4.38, 0], [2.225, 4.27, 0], 0.084, 0.045, o('jaw', { s: [1, 1, 0.78], k: 0.016 }));
    m.ell([1.80, 4.41, 0.08], [0.095, 0.088, 0.044], o('head', Object.assign({ k: 0.04 }, M)));       // cheek
    m.ell([1.86, 4.528, 0.088], [0.075, 0.036, 0.05], o('head', Object.assign({ k: 0.03 }, M)));      // brow
    m.rc([1.735, 4.60, 0.064], [1.668, 4.775, 0.082], 0.04, 0.034, o('head', Object.assign({ k: 0.03, mat: 'ossi' }, M)));  // ossicone
    m.ell([1.662, 4.794, 0.083], [0.042, 0.04, 0.042], o('head', Object.assign({ k: 0.012, mat: 'horn' }, M)));
    // ears: leaf shaped, cupped towards the front
    m.ell([1.60, 4.61, 0.225], [0.026, 0.064, 0.135], o('earR', Object.assign({ k: 0.012, mat: 'ear', z: [-0.36, 0.40, 0.84], x: [1, -0.35, 0.15], sig: 0.02 }, M)));
    m.ell([1.626, 4.60, 0.238], [0.02, 0.04, 0.10], o('earR', Object.assign({ k: 0.012, sub: true, z: [-0.36, 0.40, 0.84], x: [1, -0.35, 0.15] }, M)));
    // nostrils
    m.ell([2.325, 4.352, 0.036], [0.03, 0.013, 0.016], o('head', Object.assign({ k: 0.01, sub: true, z: [0.3, 0, 1] }, M)));

    // tail
    const tr = [0.058, 0.04, 0.03, 0.024, 0.021, 0.036, 0.044, 0.010];
    for (let i = 0; i < TAIL.length - 1; i++) {
      m.rc(TAIL[i], TAIL[i + 1], tr[i], tr[i + 1], o('tail' + (i + 1), { k: i === 0 ? 0.06 : 0.02, mat: i >= 4 ? 'tuft' : 'skin', sig: 0.03 }));
    }
  }

  // ---- coat material -----------------------------------------------------------
  const MAT_COLORS = { mane: 0x6a4424, tuft: 0x17120e, horn: 0x1c1410, hoof: 0x2e2823, muzzle: 0x54433a, ear: 0xcdb48a, face: 0xa98258, ossi: 0x9a7248 };

  function makeMaterial(seedTex) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.84, metalness: 0,
      sheen: 0.18, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffdfb0),
    });
    const uniforms = {
      uCream: { value: new THREE.Color(0xdcc594) },
      uCreamPale: { value: new THREE.Color(0xeadcba) },
      uPatch: { value: new THREE.Color(0x96572a) },
      uPatchDark: { value: new THREE.Color(0x5f3216) },
      uSeeds: { value: seedTex },
    };
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 aSeedA; attribute vec3 aSeedB; attribute float aSp; attribute vec4 aMask; attribute vec3 aCol;
flat varying vec3 vSeedA; flat varying vec3 vSeedB;
varying float vSp; varying vec3 vPat; varying vec4 vMask; varying vec3 vCol;`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPat = position; vSp = aSp; vSeedA = aSeedA; vSeedB = aSeedB; vMask = aMask; vCol = aCol;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uCream, uCreamPale, uPatch, uPatchDark;
uniform sampler2D uSeeds;
flat varying vec3 vSeedA; flat varying vec3 vSeedB;
varying float vSp; varying vec3 vPat; varying vec4 vMask; varying vec3 vCol;
float gHash31(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float gNoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(gHash31(i), gHash31(i+vec3(1,0,0)), f.x), mix(gHash31(i+vec3(0,1,0)), gHash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(gHash31(i+vec3(0,0,1)), gHash31(i+vec3(1,0,1)), f.x), mix(gHash31(i+vec3(0,1,1)), gHash31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
// Voronoi cells around seed points that were scattered over the skin at build time.
// returns (distance to nearest cell border, random id of cell, distance to cell centre), in units of the local spacing
vec3 gCells(vec3 p, float sp){
  float ids[6];
  ids[0] = vSeedA.x; ids[1] = vSeedA.y; ids[2] = vSeedA.z; ids[3] = vSeedB.x; ids[4] = vSeedB.y; ids[5] = vSeedB.z;
  vec4 s[6]; float d[6];
  float md = 1e9; int mi = 0;
  for (int i = 0; i < 6; i++) {
    int id = int(ids[i] + 0.5);
    s[i] = texelFetch(uSeeds, ivec2(id % 1024, id / 1024), 0);
    vec3 r = s[i].xyz - p; d[i] = dot(r, r);
    if (d[i] < md) { md = d[i]; mi = i; }
  }
  float ed = 1e9;
  for (int i = 0; i < 6; i++) {
    if (i == mi) continue;
    float l = distance(s[i].xyz, s[mi].xyz);
    if (l > 1e-4) ed = min(ed, (d[i] - md) / (2.0 * l));
  }
  return vec3(ed / sp, s[mi].w, sqrt(md) / sp);
}`)
        .replace('#include <color_fragment>', `
{
  vec3 wq = vPat * 9.0;
  vec3 q = vPat + vSp * 0.13 * (vec3(gNoise(wq), gNoise(wq + 17.1), gNoise(wq + 31.7)) - 0.5);
  vec3 vr = gCells(q, vSp);
  float fine = gNoise(vPat * vec3(260.0, 110.0, 260.0));
  float fine2 = gNoise(vPat * 23.0);
  float e = vr.x + (fine - 0.5) * 0.04 + (fine2 - 0.5) * 0.035;
  float t0 = 0.062 + (1.0 - vMask.x) * 0.2;
  float spot = smoothstep(t0, t0 + 0.07, e);
  float core = smoothstep(0.1, 0.5, vr.x);
  vec3 pcol = mix(uPatch, uPatchDark, core * 0.8);
  pcol *= 0.8 + 0.4 * vr.y;
  vec3 base = mix(uCream, uCreamPale, vMask.z);
  vec3 col = mix(base, pcol, spot * smoothstep(0.0, 0.5, vMask.x) * (0.35 + 0.65 * vMask.x));
  col = mix(col, vCol, vMask.y);
  col *= 0.91 + 0.18 * fine;
  col *= 0.95 + 0.10 * fine2;
  col *= vMask.w;
  diffuseColor.rgb = col;
  ` + (/dbgmask/.test(location.search) ? 'diffuseColor.rgb = vec3(vMask.x, vMask.y, vMask.z);' : '') + `
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor - 0.3 * step(0.5, vMask.y) * step(vPat.y, 0.2), 0.3, 1.0);`);
    };
    return mat;
  }

  // Poisson-disk scatter of patch centres over the skin. The spacing shrinks on limbs, upper neck and head,
  // just like the patches of a real giraffe.
  function patchSpacing(x, y, z) {
    let s = 0.215;
    if (y < 1.9) s = 0.215 - 0.125 * smooth(1.9, 0.55, y);
    if (y > 2.9) s = 0.215 - 0.075 * smooth(2.9, 4.3, y);
    if (y > 4.1 && x > 1.6) s = Math.min(s, 0.14 - 0.082 * smooth(1.66, 1.8, x));
    if (x < -1.02 && y < 2.3) s = Math.min(s, 0.08);
    return s;
  }
  function scatterSeeds(P, n) {
    let sd = 12345;
    const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const C = 0.22, grid = new Map(), seeds = [];
    const key = (i, j, k) => (i + 64) * 65536 + (j + 64) * 256 + (k + 64);
    for (let o = 0; o < n; o++) {
      const v = order[o], x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const r = patchSpacing(x, y, z) * (0.74 + 0.6 * rnd());
      const ci = Math.floor(x / C), cj = Math.floor(y / C), ck = Math.floor(z / C);
      let ok = true;
      for (let i = ci - 1; i <= ci + 1 && ok; i++) for (let j = cj - 1; j <= cj + 1 && ok; j++) for (let k = ck - 1; k <= ck + 1 && ok; k++) {
        const cell = grid.get(key(i, j, k));
        if (!cell) continue;
        for (const s of cell) {
          const q = seeds[s], m = 0.5 * (r + q[3]);
          if ((q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2 < m * m) { ok = false; break; }
        }
      }
      if (!ok) continue;
      const kk = key(ci, cj, ck);
      if (!grid.has(kk)) grid.set(kk, []);
      grid.get(kk).push(seeds.length);
      seeds.push([x, y, z, r, rnd()]);
    }
    return { seeds, grid, C, key };
  }

  // ---- build ------------------------------------------------------------------
  GIR.buildGiraffe = function (opts) {
    opts = opts || {};
    const h = opts.h || 0.0115;
    const t0 = performance.now();
    const model = new GIR.SdfModel();
    describe(model);
    model.prepare({ min: [-1.42, -2.5 * h, -0.5], max: [2.45, 4.92, 0.5] }, h);
    const geo = model.mesh();
    const t1 = performance.now();

    const defs = boneDefs();
    const boneIdx = {}; defs.forEach((d, i) => (boneIdx[d.name] = i));
    const n = geo.count;
    const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
    const aMask = new Float32Array(n * 4), aCol = new Float32Array(n * 3);
    const aSeedA = new Float32Array(n * 3), aSeedB = new Float32Array(n * 3), aSp = new Float32Array(n);
    const cols = {}; for (const k in MAT_COLORS) cols[k] = new THREE.Color(MAT_COLORS[k]);
    const P = geo.position, Nn = geo.normal;
    const neckSlope = (J.head[0] - J.neck0[0]) / (J.head[1] - J.neck0[1]);

    for (let v = 0; v < n; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const nx = Nn[v * 3], ny = Nn[v * 3 + 1], nz = Nn[v * 3 + 2];
      const bw = {}, mw = {}, bd = {};
      model.influences(x, y, z, bw, mw, bd);
      // top 4 bones
      const arr = Object.keys(bw).map(k => [boneIdx[k], bw[k]]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      let tot = 0; for (const a of arr) tot += a[1];
      for (let i = 0; i < 4; i++) {
        skinIndex[v * 4 + i] = i < arr.length ? arr[i][0] : 0;
        skinWeight[v * 4 + i] = i < arr.length ? arr[i][1] / tot : 0;
      }

      // material mix
      let mt = 0, cr = 0, cg = 0, cb = 0, ov = 0;
      for (const k in mw) mt += mw[k];
      for (const k in mw) {
        if (k === 'skin') continue;
        const w = mw[k] / mt; ov += w;
        cr += cols[k].r * w; cg += cols[k].g * w; cb += cols[k].b * w;
      }
      if (ov > 0) { cr /= ov; cg /= ov; cb /= ov; }
      let spot = 1, pale = 0;
      // legs: patches shrink and fade towards the hooves
      spot *= 0.3 + 0.7 * smooth(0.5, 1.3, y);
      pale = Math.max(pale, 0.6 * (1 - smooth(0.3, 1.2, y)));
      // belly + inner limbs
      if (y > 1.2 && y < 2.7 && x < 1.0) {
        const under = smooth(0.25, 0.85, -ny) * (1 - smooth(2.05, 2.3, y));
        const inner = y < 2.0 ? smooth(0.3, 0.8, -nz * Math.sign(z)) * smooth(1.2, 1.5, y) : 0;
        const pl = Math.max(under, inner * 0.8);
        pale = Math.max(pale, pl);
        spot *= 1 - 0.8 * pl;
      }
      // head: plain face, dark muzzle
      if (y > 4.1 && x > 1.6) {
        const u = (x - J.head[0]) * 0.95 - (y - J.head[1]) * 0.31; // distance along the head axis
        const top = smooth(0.3, 0.75, ny) * smooth(0.08, 0.22, u);   // forehead and nasal ridge are plain
        const face = Math.max(smooth(0.30, 0.50, u), top);
        spot *= 1 - face;
        const faceAmt = 0.72 * Math.max(face, 0.35 * smooth(0.12, 0.3, u)) * (1 - ov);
        const dk = smooth(0.38, 0.62, u);
        const fr = cols.face.r * (1 - dk) + cols.muzzle.r * dk, fg = cols.face.g * (1 - dk) + cols.muzzle.g * dk, fb = cols.face.b * (1 - dk) + cols.muzzle.b * dk;
        const tot2 = ov + faceAmt;
        if (tot2 > 0) { cr = (cr * ov + fr * faceAmt) / tot2; cg = (cg * ov + fg * faceAmt) / tot2; cb = (cb * ov + fb * faceAmt) / tot2; }
        ov = tot2;
        if (mw.ear) {
          const ew = Math.min(1, mw.ear / mt * 1.5);
          spot *= 1 - ew;
          // inside of the ear is darker
          const inner = smooth(0.15, 0.7, nx * 0.9 - ny * 0.3) * ew;
          cr = cr * (1 - inner) + 0.16 * inner; cg = cg * (1 - inner) + 0.11 * inner; cb = cb * (1 - inner) + 0.085 * inner;
        }
        // mouth line where the lower jaw meets the muzzle
        if (bd.jaw !== undefined && bd.head !== undefined && u > 0.2) {
          const lip = (1 - smooth(0.0025, 0.011, Math.abs(bd.jaw - bd.head))) * smooth(0.2, 0.3, u) * 0.85;
          cr = (cr * ov + 0.05 * lip) / (ov + lip + 1e-6); cg = (cg * ov + 0.035 * lip) / (ov + lip + 1e-6); cb = (cb * ov + 0.03 * lip) / (ov + lip + 1e-6);
          ov = Math.min(1, ov + lip);
        }
      }
      // ambient occlusion from the distance field
      let ao = 1;
      for (const r of [0.035, 0.09, 0.22]) {
        const d = model.dist(x + nx * r, Math.max(0.001, y + ny * r), z + nz * r);
        ao *= 1 - 0.38 * Math.max(0, Math.min(1, 1 - d / r));
      }
      aMask[v * 4] = spot; aMask[v * 4 + 1] = Math.min(1, ov); aMask[v * 4 + 2] = pale; aMask[v * 4 + 3] = 0.25 + 0.75 * ao;
      aCol[v * 3] = cr; aCol[v * 3 + 1] = cg; aCol[v * 3 + 2] = cb;

      aSp[v] = patchSpacing(x, y, z);
    }

    // patch centres + the six nearest ones for every vertex
    const sc = scatterSeeds(P, n);
    const SW = 1024, SH = Math.ceil(sc.seeds.length / SW);
    const seedData = new Float32Array(SW * SH * 4);
    sc.seeds.forEach((q, i) => { seedData[i * 4] = q[0]; seedData[i * 4 + 1] = q[1]; seedData[i * 4 + 2] = q[2]; seedData[i * 4 + 3] = q[4]; });
    const seedTex = new THREE.DataTexture(seedData, SW, SH, THREE.RGBAFormat, THREE.FloatType);
    seedTex.minFilter = seedTex.magFilter = THREE.NearestFilter; seedTex.generateMipmaps = false; seedTex.needsUpdate = true;
    const best = new Int32Array(6), bestD = new Float64Array(6);
    for (let v = 0; v < n; v++) {
      const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      const ci = Math.floor(x / sc.C), cj = Math.floor(y / sc.C), ck = Math.floor(z / sc.C);
      best.fill(-1); bestD.fill(1e9);
      for (let i = ci - 2; i <= ci + 2; i++) for (let j = cj - 2; j <= cj + 2; j++) for (let k = ck - 2; k <= ck + 2; k++) {
        const cell = sc.grid.get(sc.key(i, j, k));
        if (!cell) continue;
        for (const si of cell) {
          const q = sc.seeds[si];
          const d = (q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2;
          if (d >= bestD[5]) continue;
          let m = 5;
          while (m > 0 && bestD[m - 1] > d) { bestD[m] = bestD[m - 1]; best[m] = best[m - 1]; m--; }
          bestD[m] = d; best[m] = si;
        }
      }
      for (let m = 0; m < 6; m++) {
        const id = best[m] >= 0 ? best[m] : best[0];
        if (m < 3) aSeedA[v * 3 + m] = id; else aSeedB[v * 3 + m - 3] = id;
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    g.setAttribute('aSeedA', new THREE.BufferAttribute(aSeedA, 3));
    g.setAttribute('aSeedB', new THREE.BufferAttribute(aSeedB, 3));
    g.setAttribute('aSp', new THREE.BufferAttribute(aSp, 1));
    g.setAttribute('aMask', new THREE.BufferAttribute(aMask, 4));
    g.setAttribute('aCol', new THREE.BufferAttribute(aCol, 3));
    g.setIndex(new THREE.BufferAttribute(geo.index, 1));

    // skeleton
    const bones = {}, rest = {}, list = [];
    for (const d of defs) {
      const b = new THREE.Bone(); b.name = d.name;
      rest[d.name] = d.pos.slice();
      if (d.parent) { const pp = rest[d.parent]; b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2]); bones[d.parent].add(b); }
      else b.position.set(d.pos[0], d.pos[1], d.pos[2]);
      bones[d.name] = b; list.push(b);
    }
    const material = makeMaterial(seedTex);
    const mesh = new THREE.SkinnedMesh(g, material);
    mesh.add(bones.root);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(list));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;

    // eyes: glossy dark globes with dark-rimmed lids that can blink
    const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0605, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04 });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x6d4e36, roughness: 0.85 });
    const lashMat = new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.7, side: THREE.DoubleSide });
    const ER = 0.04;
    const eyeGeo = new THREE.SphereGeometry(ER, 24, 16);
    const lidGeo = new THREE.SphereGeometry(ER * 1.1, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const lashGeo = new THREE.SphereGeometry(ER * 1.2, 24, 3, 0, Math.PI * 2, Math.PI * 0.5 - 0.2, 0.2);
    const lids = [];
    for (const sgn of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(1.874 - J.head[0], 4.49 - J.head[1], sgn * 0.09);
      eye.rotation.z = -0.28; // align with the slope of the face
      const ball = new THREE.Mesh(eyeGeo, eyeMat);
      const upper = new THREE.Mesh(lidGeo, lidMat), lower = new THREE.Mesh(lidGeo, lidMat);
      upper.add(new THREE.Mesh(lashGeo, lashMat));
      lower.rotation.x = Math.PI + sgn * 0.42;
      eye.add(ball, upper, lower);
      bones.head.add(eye);
      lids.push({ upper, sgn });
    }
    const setBlink = c => { for (const l of lids) l.upper.rotation.x = l.sgn * (-0.42 + 0.9 * c); };
    setBlink(0);

    const group = new THREE.Group();
    group.add(mesh);
    const t2 = performance.now();
    console.log('giraffe: ' + sc.seeds.length + ' patches, ' + n + ' verts, ' + geo.index.length / 3 + ' tris, mesh ' + (t1 - t0).toFixed(0) + 'ms, attrs ' + (t2 - t1).toFixed(0) + 'ms');
    return { group, mesh, bones, rest, J, NECK_N, TAIL_N: TAIL.length - 1, material, lids, setBlink };
  };
})();
