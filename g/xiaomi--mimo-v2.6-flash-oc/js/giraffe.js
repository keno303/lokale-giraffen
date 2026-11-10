/* giraffe.js — procedural giraffe model */
'use strict';

const TEX = 2.0;                 /* metres per pattern tile */
const G = {};                    /* global giraffe handles */

/* ---------------- materials ---------------- */
function buildMaterials() {
  const bodyC = makeHideTexture(1024, {
    seed: 7, cells: 5, base: '#ede1c6',
    colors: ['#8e5a31', '#9a6535', '#83512c', '#a16b3a', '#8b5a33', '#7d4c29'],
    gapStroke: 9, contrast: 1, noise: 0.055
  });
  const legC = makeHideTexture(1024, {
    seed: 21, cells: 6, base: '#efe6d2',
    colors: ['#c9ab84', '#c2a279', '#b99a72', '#cfb28d', '#bd9f78'],
    gapStroke: 8, contrast: 0.35, noise: 0.045
  });
  G.hideTex = cnvTexture(bodyC, 1, 8);
  G.legTex = cnvTexture(legC, 1, 8);

  G.hideMat = new THREE.MeshStandardMaterial({
    map: G.hideTex, vertexColors: true, roughness: 0.84, metalness: 0.0
  });
  G.legMat = new THREE.MeshStandardMaterial({
    map: G.legTex, vertexColors: true, roughness: 0.86, metalness: 0.0
  });
  const plain = (hex, rough) => new THREE.MeshStandardMaterial({
    color: hex, roughness: rough === undefined ? 0.85 : rough, metalness: 0.0
  });
  G.skinMat = plain(0xb99a72, 0.9);          /* ears, ossicone shafts */
  G.skinDarkMat = plain(0x6d5138, 0.9);
  G.maneMat = new THREE.MeshStandardMaterial({ color: 0x4a382a, roughness: 0.95, side: THREE.DoubleSide });
  G.hoofMat = plain(0x38322b, 0.55);
  G.darkMat = plain(0x191209, 0.6);          /* nostrils, mouth, pupils */
  G.eyeMat = plain(0x2a1a0e, 0.1);
  G.catchMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  G.tuftMat = plain(0x1d1712, 0.95);
}

function shade(f) { return { r: f, g: f, b: f }; }

/* ---------------- torso ---------------- */
function buildTorso(parent) {
  const zs = -1.12, ze = 1.30, L = ze - zs;
  const frames = straightFrames(new THREE.Vector3(0, 0, zs), new THREE.Vector3(0, 0, ze), 72,
    new THREE.Vector3(1, 0, 0));
  const cyK = keyframes([[0, 1.95], [0.05, 1.93], [0.15, 1.94], [0.3, 1.96], [0.5, 2.0],
    [0.68, 2.05], [0.8, 2.07], [0.9, 2.03], [0.97, 1.99], [1, 1.97]]);
  const ryK = keyframes([[0, 0], [0.02, 0.16], [0.05, 0.28], [0.09, 0.39], [0.15, 0.46],
    [0.3, 0.47], [0.5, 0.5], [0.68, 0.55], [0.8, 0.61], [0.9, 0.57], [0.97, 0.4], [1, 0]]);
  const rxK = keyframes([[0, 0], [0.02, 0.13], [0.05, 0.26], [0.09, 0.37], [0.15, 0.42],
    [0.3, 0.41], [0.5, 0.4], [0.68, 0.43], [0.8, 0.47], [0.9, 0.45], [0.97, 0.32], [1, 0]]);
  const geo = buildTube(frames, (t) => ({ rx: rxK(t), ry: ryK(t), oy: cyK(t) }), 40,
    (t, f, a) => shade(0.90 + 0.12 * (0.5 - 0.5 * Math.sin(a))),
    circumTiles(0.44, TEX), L / TEX);
  const m = new THREE.Mesh(geo, G.hideMat);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);

  /* dorsal ridge from withers back (short mane continuation) */
  const pts = [], hK = keyframes([[0, 0.005], [0.45, 0.03], [0.75, 0.075], [1, 0.10]]);
  for (let i = 0; i <= 22; i++) {
    const tt = 0.42 + (i / 22) * 0.42;                  /* torso t */
    const z = zs + tt * L, cy = cyK(tt), ry = ryK(tt);
    pts.push({ z: z, y: cy + ry, h: hK(tt) });
  }
  addManeRibbon(parent, pts.map(p => new THREE.Vector3(0, p.y, p.z)),
    pts.map(p => new THREE.Vector3(0, 1, 0)), pts.map(p => p.h));
}

/* jagged mane ribbon along a polyline of surface points + directions + heights */
function addManeRibbon(parent, surfacePts, dirs, heights) {
  const n = surfacePts.length;
  const pos = new Float32Array(n * 2 * 3), nor = new Float32Array(n * 2 * 3),
    uv = new Float32Array(n * 2 * 2), idx = [];
  const d = new THREE.Vector3(), back = new THREE.Vector3(), tip = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = surfacePts[i], dir = dirs[i];
    back.copy(dir).multiplyScalar(0.82);
    /* sweep back along -Z-ish: use previous/next tangent if available */
    if (i < n - 1) back.add(new THREE.Vector3().subVectors(surfacePts[i], surfacePts[i + 1]).normalize().multiplyScalar(0.45));
    back.normalize();
    const h = heights[i] * (i % 2 ? 1 : 0.78);
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      if (k === 0) { pos[j * 3] = p.x; pos[j * 3 + 1] = p.y; pos[j * 3 + 2] = p.z; }
      else {
        tip.copy(p).addScaledVector(dir, h * 0.55).addScaledVector(back, h * 0.8);
        pos[j * 3] = tip.x; pos[j * 3 + 1] = tip.y; pos[j * 3 + 2] = tip.z;
      }
      nor[j * 3] = 0; nor[j * 3 + 1] = 1; nor[j * 3 + 2] = 0;
      uv[j * 2] = i * 0.4; uv[j * 2 + 1] = k;
    }
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, G.maneMat);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/* ---------------- neck (3 articulated segments) ---------------- */
const NECK_CTRL = [[0, 2.30, 0.86], [0, 2.72, 1.14], [0, 3.22, 1.37],
[0, 3.72, 1.55], [0, 4.18, 1.71], [0, 4.50, 1.88]];

function neckPoint(u) {
  if (!G._neckCurve) G._neckCurve = new THREE.CatmullRomCurve3(
    NECK_CTRL.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  return G._neckCurve.getPoint(clamp(u, 0, 1));
}

function neckFrames(u0, u1, rows) {
  const pts = [];
  for (let i = 0; i <= rows; i++) pts.push(neckPoint(lerp(u0, u1, i / rows)));
  return framesFromPoints(pts, new THREE.Vector3(1, 0, 0));
}

const neckRx = keyframes([[0, 0.30], [0.15, 0.27], [0.35, 0.24], [0.55, 0.21],
[0.75, 0.18], [0.9, 0.16], [1, 0.155]]);
const neckRy = keyframes([[0, 0.42], [0.15, 0.38], [0.35, 0.33], [0.55, 0.28],
[0.75, 0.23], [0.9, 0.19], [1, 0.175]]);

function buildNeck(parent) {
  const pivots = [0, 0.36, 0.66];
  const ends = [0.36, 0.66, 1.0];
  const starts = [-0.055, 0.305, 0.605];
  const groups = [];
  let parentG = parent;
  let parentPivot = new THREE.Vector3(0, 0, 0);
  for (let s = 0; s < 3; s++) {
    const pivot = neckPoint(pivots[s]);
    const gr = new THREE.Group();
    gr.position.copy(pivot).sub(parentPivot);
    parentG.add(gr);
    groups.push(gr);
    parentPivot.copy(pivot);
    const frames = neckFrames(starts[s], ends[s], 30);
    const geo = buildTube(frames, (t, f) => {
      const u = lerp(starts[s], ends[s], t);
      /* sleeve: starts just inside the parent, swells over the joint, fades out */
      const rise = smootherstep(starts[s], pivots[s], u);
      const fall = 1 - smootherstep(pivots[s], pivots[s] + 0.12, u);
      const bump = (-0.020 + 0.042 * rise) * fall;
      return { rx: neckRx(u) + bump, ry: neckRy(u) + bump, oy: -0.03 * (1 - smoothstep(0, 0.3, u)) };
    }, 28,
      (t, f, a) => shade(0.90 + 0.11 * (0.5 - 0.5 * Math.sin(a))),
      circumTiles(0.24, TEX),
      (ends[s] - starts[s]) * 2.45 / TEX);
    geo.translate(-pivot.x, -pivot.y, -pivot.z);
    const mesh = new THREE.Mesh(geo, G.hideMat);
    mesh.castShadow = mesh.receiveShadow = true;
    gr.add(mesh);

    /* mane along this segment */
    const sp = [], sd = [], sh = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const u = Math.max(pivots[s] + 0.01, starts[s] + 0.03) +
        (ends[s] - Math.max(pivots[s] + 0.01, starts[s] + 0.03)) * (i / steps);
      const fr = neckFrames(u, Math.min(1, u + 0.01), 1)[0];
      const hp = neckPoint(u);
      const dorsal = new THREE.Vector3().copy(fr.b).normalize();
      sp.push(new THREE.Vector3(hp.x, hp.y, hp.z)
        .addScaledVector(dorsal, neckRy(u) - 0.01).sub(pivot));
      sd.push(dorsal);
      sh.push(lerp(0.115, 0.06, u) * (u < 0.06 ? smoothstep(0.0, 0.06, u) : 1));
    }
    addManeRibbon(gr, sp, sd, sh);
    parentG = gr;
  }
  G.neckGroups = groups;
  G.headGroup = parentG;   /* head attaches to the last neck group */
  return groups;
}

/* ---------------- head ---------------- */
const HEAD_START = -0.11;                 /* geometry starts behind the neck-top joint */
const HEAD_LEN = 0.77;                    /* tip stays at +0.66 past the joint */
const HEAD_TILT = 35 * PI / 180;

function headAxisDir() {
  return new THREE.Vector3(0, -Math.sin(HEAD_TILT), Math.cos(HEAD_TILT));
}
/* point on the head axis at param t (0..1 of geometry), in body coords */
function headAxisPoint(t) {
  const base = neckPoint(1).addScaledVector(headAxisDir(), HEAD_START);
  return base.addScaledVector(headAxisDir(), t * HEAD_LEN);
}

const headRx = keyframes([[0, 0.145], [0.10, 0.154], [0.143, 0.172], [0.25, 0.146],
[0.40, 0.131], [0.55, 0.117], [0.70, 0.104], [0.83, 0.091], [0.93, 0.081], [0.975, 0.073], [1, 0.016]]);
const headRy = keyframes([[0, 0.165], [0.10, 0.174], [0.143, 0.194], [0.25, 0.166],
[0.40, 0.153], [0.55, 0.141], [0.70, 0.125], [0.83, 0.111], [0.93, 0.094], [0.975, 0.087], [1, 0.016]]);
const headOy = keyframes([[0, 0], [0.35, 0.005], [0.55, -0.008], [0.70, -0.02],
[0.82, -0.028], [0.93, -0.02], [1, 0]]);

function buildHead(parent) {
  const pivot = neckPoint(1);
  const gr = new THREE.Group();
  gr.position.copy(pivot).sub(neckPoint(0.66));
  parent.add(gr);
  const ax = headAxisDir();
  const start = pivot.clone().addScaledVector(ax, HEAD_START);
  const end = pivot.clone().addScaledVector(ax, HEAD_START + HEAD_LEN);
  const frames = straightFrames(start, end, 34, new THREE.Vector3(1, 0, 0));
  const geo = buildTube(frames, (t) => ({ rx: headRx(t), ry: headRy(t), oy: headOy(t) }), 32,
    (t, f, a) => {
      const sa = Math.sin(a);
      let v = (1 - 0.42 * smoothstep(0.62, 0.94, t)) * (0.93 + 0.09 * (0.5 - 0.5 * sa));
      v *= 1 + 0.10 * smoothstep(0.30, 0.38, t) * (1 - smoothstep(0.44, 0.52, t)) * Math.max(sa, 0);
      return shade(v);
    }, circumTiles(0.13, TEX), HEAD_LEN / TEX);
  geo.translate(-pivot.x, -pivot.y, -pivot.z);
  const mesh = new THREE.Mesh(geo, G.hideMat);
  mesh.castShadow = mesh.receiveShadow = true;
  gr.add(mesh);

  const roof = new THREE.Vector3(0, Math.cos(HEAD_TILT), Math.sin(HEAD_TILT));   /* +b */
  const tAxis = ax;
  const sideV = new THREE.Vector3(1, 0, 0);

  /* --- eyes --- */
  G.eyes = []; G.lids = [];
  for (const sgn of [1, -1]) {
    const tEye = 0.30;
    const d = sideV.clone().multiplyScalar(sgn).addScaledVector(roof, 0.30).normalize();
    const rxT = headRx(tEye), ryT = headRy(tEye);
    const s = 1 / Math.sqrt(Math.pow(d.dot(sideV) / rxT, 2) + Math.pow(d.dot(roof) / ryT, 2));
    const p = headAxisPoint(tEye).addScaledVector(d, s - 0.016).sub(pivot);
    const eg = new THREE.Group();
    eg.position.copy(p);
    eg.rotation.y = sgn * PI / 2;   /* local +Z = outward */
    gr.add(eg);
    const ball = new THREE.Mesh(tintedSphere(0.048, 20, 16), G.eyeMat);
    ball.castShadow = false; ball.receiveShadow = true;
    ball.position.z = 0.008;
    eg.add(ball);
    const cl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), G.catchMat);
    cl.position.set(-0.008, 0.022, 0.050);
    eg.add(cl);
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.054, 18, 12, 0, TAU, 0, PI * 0.58), G.skinMat);
    lid.position.z = 0.006;
    eg.add(lid);
    G.eyes.push(eg); G.lids.push(lid);
  }

  /* --- ears --- */
  G.ears = [];
  for (const sgn of [1, -1]) {
    const tE = 0.20;
    const base = headAxisPoint(tE)
      .addScaledVector(sideV, sgn * headRx(tE) * 0.92)
      .addScaledVector(roof, 0.030)
      .sub(pivot);
    const fr = straightFrames(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.25, 0), 14,
      new THREE.Vector3(0, 0, 1));
    const eg = new THREE.Group();
    eg.position.copy(base);
    gr.add(eg);
    const geoE = buildTube(fr, (t) => ({
      rx: 0.011 * (1 - smoothstep(0.55, 1, t)) + 0.0035,
      ry: (0.052 + 0.028 * Math.sin(t * PI)) * (1 - smootherstep(0.72, 1, t)) + 0.004,
      oy: 0.02 * Math.sin(t * PI * 0.9)
    }), 16, (t, f, a) => shade(Math.cos(a) < 0 ? 1.18 : 0.92), 1, 0.25 / TEX);
    const em = new THREE.Mesh(geoE, G.skinMat);
    em.geometry.setAttribute('color', geoE.attributes.color);
    em.material = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, color: 0xbb9c74
    });
    em.castShadow = true;
    eg.add(em);
    /* orient: local +Y (geometry axis) -> out/back/up */
    const dir = new THREE.Vector3(sgn * 0.62, 0.52, -0.59).normalize();
    eg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    G.ears.push(eg);
    if (!G.earBase) G.earBase = [];
    G.earBase.push(eg.quaternion.clone());
  }

  /* --- ossicones --- */
  for (const sgn of [1, -1]) {
    const tO = 0.115;
    const base = headAxisPoint(tO)
      .addScaledVector(sideV, sgn * 0.062)
      .addScaledVector(roof, headRy(tO) - 0.012)
      .sub(pivot);
    const dir = roof.clone().addScaledVector(sideV, sgn * 0.24).addScaledVector(tAxis, 0.18).normalize();
    const fr = straightFrames(new THREE.Vector3(0, 0, 0),
      dir.clone().multiplyScalar(0.20), 8, new THREE.Vector3(1, 0, 0));
    const og = new THREE.Group(); og.position.copy(base); gr.add(og);
    const gO = buildTube(fr, (t) => ({ rx: 0.031 - 0.008 * t, ry: 0.031 - 0.008 * t }), 10,
      null, 1, 0.20 / TEX);
    const om = new THREE.Mesh(gO, G.skinMat); om.castShadow = true; og.add(om);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.036, 12, 10), G.skinDarkMat);
    knob.position.copy(dir.clone().multiplyScalar(0.20));
    knob.castShadow = true;
    og.add(knob);
  }

  /* --- nostrils --- */
  for (const sgn of [1, -1]) {
    const tN = 0.84;
    const d = sideV.clone().multiplyScalar(sgn * 0.66).addScaledVector(roof, 0.50).normalize();
    const rxT = headRx(tN), ryT = headRy(tN);
    const s = 1 / Math.sqrt(Math.pow(d.dot(sideV) / rxT, 2) + Math.pow(d.dot(roof) / ryT, 2));
    const p = headAxisPoint(tN).addScaledVector(d, s + 0.002).sub(pivot);
    const out = d.clone();
    const gN = new THREE.SphereGeometry(1, 10, 8);
    gN.scale(0.030, 0.017, 0.011);
    const nm = new THREE.Mesh(gN, G.darkMat);
    nm.position.copy(p);
    nm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
    nm.position.addScaledVector(out, 0.004);
    gr.add(nm);
  }

  /* --- mouth lines --- */
  for (const sgn of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = lerp(0.66, 0.965, i / 6);
      pts.push(headAxisPoint(t)
        .addScaledVector(sideV, sgn * headRx(t) * 0.92)
        .addScaledVector(roof, -headRy(t) * (0.30 + 0.22 * i / 6)));
    }
    const fr = framesFromPoints(pts, new THREE.Vector3(0, 1, 0));
    const gM = buildTube(fr, () => ({ rx: 0.0065, ry: 0.0065 }), 6, null, 1, 0.4 / TEX);
    gM.translate(-pivot.x, -pivot.y, -pivot.z);
    const mm = new THREE.Mesh(gM, G.darkMat);
    gr.add(mm);
  }

  /* --- eyelid rim (lash line) --- */
  for (const lid of G.lids) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.10, 6, 22), G.tuftMat);
    rim.rotation.x = PI / 2;
    rim.scale.set(0.053, 0.053, 0.053);
    rim.position.set(0, -0.014, 0.004);
    lid.add(rim);
  }

  /* --- forelock --- */
  for (let i = 0; i < 5; i++) {
    const t = 0.075 + (i % 2) * 0.02;
    const p = headAxisPoint(t)
      .addScaledVector(sideV, (i - 2) * 0.030)
      .addScaledVector(roof, headRy(t) * 0.98)
      .sub(pivot);
    const dir = roof.clone().multiplyScalar(0.9).addScaledVector(tAxis, 0.55)
      .addScaledVector(sideV, (i - 2) * 0.25).normalize();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.10, 6), G.maneMat);
    cone.position.copy(p).addScaledVector(dir, 0.04);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.castShadow = true;
    gr.add(cone);
  }

  G.head = gr;
  return gr;
}

/* ---------------- tail ---------------- */
function buildTail(parent) {
  const t1 = new THREE.Group();
  t1.position.set(0, 2.30, -0.95);
  parent.add(t1);
  const mk = (pts, r0, r1, mat) => {
    const fr = framesFromPoints(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])),
      new THREE.Vector3(1, 0, 0));
    const len = pts.length > 1 ? new THREE.Vector3(
      pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1],
      pts[pts.length - 1][2] - pts[0][2]).length() : 0.4;
    const g = buildTube(fr, (t) => ({ rx: lerp(r0, r1, t), ry: lerp(r0, r1, t) }), 10,
      (t, f, a) => shade(0.92 + 0.08 * (0.5 - 0.5 * Math.sin(a))), 1, len / TEX);
    const m = new THREE.Mesh(g, mat); m.castShadow = true;
    return m;
  };
  t1.add(mk([[0, 0, 0], [0, -0.18, -0.03], [0, -0.36, -0.07]], 0.055, 0.038, G.hideMat));
  const t2 = new THREE.Group(); t2.position.set(0, -0.36, -0.07); t1.add(t2);
  t2.add(mk([[0, 0, 0], [0, -0.20, -0.02], [0, -0.40, -0.045]], 0.038, 0.030, G.hideMat));
  const t3 = new THREE.Group(); t3.position.set(0, -0.40, -0.045); t2.add(t3);
  const rnd = mulberry32(99);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU, r = 0.012 + rnd() * 0.008;
    const dir = new THREE.Vector3(Math.cos(a) * 0.28, -1, Math.sin(a) * 0.28)
      .add(new THREE.Vector3((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3)).normalize();
    const len = 0.26 + rnd() * 0.12;
    const fr = framesFromPoints([new THREE.Vector3(0, 0, 0),
      dir.clone().multiplyScalar(len * 0.5), dir.clone().multiplyScalar(len)],
      new THREE.Vector3(1, 0, 0));
    const g = buildTube(fr, (t) => ({ rx: r * (1 - t * 0.85), ry: r * (1 - t * 0.85) }), 6,
      null, 1, len / TEX);
    const m = new THREE.Mesh(g, G.tuftMat); m.castShadow = true;
    t3.add(m);
  }
  G.tail = [t1, t2, t3];
}

/* ---------------- legs ---------------- */
/* fake contact shadow where the limb enters the body */
function aoTop(t) {
  return 1 - 0.17 * Math.exp(-Math.pow((t - 0.20) / 0.16, 2));
}

function buildLeg(parent, sgn, fore) {
  const L1 = fore ? 0.80 : 0.78;
  const L2 = fore ? 0.75 : 0.76;
  const LD = fore ? 1.02 : 0.88;
  const pivot = fore ? new THREE.Vector3(sgn * 0.34, 2.42, 0.70)
    : new THREE.Vector3(sgn * 0.30, 2.20, -0.85);

  const up = new THREE.Group(); up.position.copy(pivot); parent.add(up);
  const lo = new THREE.Group(); lo.position.set(0, -L1, 0); up.add(lo);
  const di = new THREE.Group(); di.position.set(0, -L2, 0); lo.add(di);

  const legTube = (rows, len, keys, mat, tint) => {
    const fr = straightFrames(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -len, 0),
      rows, new THREE.Vector3(1, 0, 0));
    const k = keyframes(keys);
    const g = buildTube(fr, (t) => ({ rx: k(t), ry: k(t) }), 18,
      (t) => shade(tint(t)),
      circumTiles(keys[Math.floor(keys.length / 2)][1], TEX), len / TEX);
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
    return m;
  };

  if (fore) {
    up.add(legTube(20, L1, [[0, 0.020], [0.08, 0.115], [0.24, 0.176], [0.5, 0.168],
      [0.78, 0.135], [1, 0.112]], G.hideMat, t => (0.95 + 0.10 * t) * aoTop(t)));
    lo.add(legTube(18, L2, [[0, 0.115], [0.2, 0.115], [0.5, 0.10], [0.8, 0.085], [1, 0.075]],
      G.hideMat, t => 1.0 + 0.06 * t));
    di.add(legTube(20, LD, [[0, 0.078], [0.06, 0.09], [0.16, 0.075], [0.6, 0.062],
      [0.8, 0.058], [0.88, 0.066], [1, 0.056]], G.legMat, t => 1.04 + 0.10 * t));
  } else {
    up.add(legTube(20, L1, [[0, 0.020], [0.10, 0.135], [0.26, 0.248], [0.5, 0.235],
      [0.75, 0.18], [1, 0.13]],
    G.hideMat, t => (0.95 + 0.10 * t) * aoTop(t)));
    lo.add(legTube(18, L2, [[0, 0.135], [0.15, 0.14], [0.45, 0.115], [0.8, 0.088], [1, 0.078]],
      G.hideMat, t => 1.0 + 0.06 * t));
    di.add(legTube(20, LD, [[0, 0.085], [0.05, 0.097], [0.15, 0.076], [0.6, 0.062],
      [0.8, 0.058], [0.88, 0.066], [1, 0.056]], G.legMat, t => 1.04 + 0.10 * t));
  }

  /* hoof */
  const hoofGrp = new THREE.Group();
  hoofGrp.position.set(0, -LD + 0.15, 0);
  di.add(hoofGrp);
  const fr = straightFrames(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.15, 0), 10,
    new THREE.Vector3(1, 0, 0));
  const hk = keyframes([[0, 0.064], [0.25, 0.067], [0.7, 0.076], [1, 0.078]]);
  const hg = buildTube(fr, (t) => ({ rx: hk(t), ry: hk(t) * 1.06 }), 16, null, 1, 0.15 / TEX);
  const hm = new THREE.Mesh(hg, G.hoofMat);
  hm.castShadow = hm.receiveShadow = true;
  hoofGrp.add(hm);

  return {
    group: up, up: up, lo: lo, di: di, hoof: hoofGrp,
    pivot: pivot, L1: L1, L2: L2, LD: LD,
    bend: new THREE.Vector3(0, 0, fore ? -1 : 1),   /* elbow back / stifle forward */
    sgn: sgn, fore: fore
  };
}

/* ---------------- assemble ---------------- */
function buildGiraffe() {
  buildMaterials();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  G.root = root; G.body = body;

  buildTorso(body);
  buildNeck(body);
  buildHead(G.headGroup);
  buildTail(body);

  G.legs = [
    buildLeg(body, 1, false), buildLeg(body, -1, false),   /* LH, RH */
    buildLeg(body, 1, true), buildLeg(body, -1, true)      /* LF, RF */
  ];
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}
