/* Headless smoke test: builds the whole giraffe with a stubbed canvas DOM,
   runs the gait for a few seconds and checks for NaNs, hoof penetration and
   hoof slide.  Run: node test/dryrun.js                                */
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

/* ---------------- minimal canvas 2d stub ---------------- */
class Ctx2D {
  constructor(cv) { this.canvas = cv; }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData() { } getImageData(x, y, w, h) { return this.createImageData(w, h); }
  fillRect() { } clearRect() { } strokeRect() { } beginPath() { } closePath() { } moveTo() { }
  lineTo() { } quadraticCurveTo() { } bezierCurveTo() { } arc() { } ellipse() { } fill() { } stroke() { }
  save() { } restore() { } translate() { } rotate() { } scale() { } setTransform() { }
  createLinearGradient() { return { addColorStop() { } }; }
  createRadialGradient() { return { addColorStop() { } }; }
}
class Canvas {
  constructor() { this.width = 1; this.height = 1; }
  getContext() { return new Ctx2D(this); }
  toDataURL() { return 'data:,'; }
}
global.document = {
  createElement(tag) { return tag === 'canvas' ? new Canvas() : { style: {}, appendChild() { }, addEventListener() { } }; },
  createElementNS() { return new Canvas(); },
  body: { appendChild() { }, style: {} },
  getElementById() { return null; },
  addEventListener() { }, querySelector() { return null; }
};
global.window = global;
try {
  Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'node', maxTouchPoints: 0 }, configurable: true
  });
} catch (e) { }
if (!global.performance) global.performance = { now: () => Date.now() };

/* ---------------- load the page scripts in order ---------------- */
global.THREE = require(path.join(__dirname, '..', 'lib', 'three.min.js'));
for (const f of ['core.js', 'textures.js', 'geometry.js', 'giraffe.js', 'gait.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8'), { filename: f });
}
const GW = global.GW;

const t0 = Date.now();
const mats = GW.Giraffe.makeMaterials(null);
const rig = GW.Giraffe.build(mats);
let tris = 0, meshes = 0, instances = 0;
rig.root.updateMatrixWorld(true);
rig.root.traverse(o => {
  if (o.isMesh) {
    meshes++;
    const g = o.geometry;
    const n = g.index ? g.index.count : g.attributes.position.count;
    tris += n / 3 * (o.isInstancedMesh ? o.count : 1);
    if (o.isInstancedMesh) instances += o.count;
  }
});
console.log('build', Date.now() - t0, 'ms | joints', rig.joints.length,
  '| meshes', meshes, '| triangles', Math.round(tris), '| hair instances', instances);

/* ---------------- run the gait ---------------- */
const NAMES = ['LF', 'RF', 'LH', 'RH'];
function run(gait, speed, seconds, radius) {
  const state = GW.Gait.create(rig, { gait: gait, speed: speed, radius: radius || 0 });
  GW.Gait.setGait(state, gait);
  const s0 = { radius: radius || 0 };
  const dt = 1 / 60, N = Math.round(seconds / dt);
  const tmp = new THREE.Vector3(), prev = {}, per = {};
  let nan = 0, slide = 0, nanSeen = 0, frames = 0;
  NAMES.forEach(n => per[n] = { minSole: 9, plantMin: 9, plantMax: -9, yMin: 9, yMax: -9 });
  for (let i = 0; i < N; i++) {
    GW.Gait.step(state, dt);
    rig.root.updateMatrixWorld(true);
    if (i < 20) continue;                     /* ignore the settle-in frames */
    frames++;
    for (const n of NAMES) {
      const L = rig.legs[n];
      GW.Gait.hoofWorld(state, L, tmp);
      if (!isFinite(tmp.x + tmp.y + tmp.z)) nan++;
      const p = per[n];
      p.minSole = Math.min(p.minSole, tmp.y);
      if (L.contact) {
        p.plantMin = Math.min(p.plantMin, tmp.y);
        p.plantMax = Math.max(p.plantMax, tmp.y);
        if (prev[n] && prev[n].contact) {
          const sp = Math.hypot(tmp.x - prev[n].x, tmp.z - prev[n].z) / dt;
          if (sp > slide) { slide = sp; per[n].worstAt = tmp.y; }
          per[n].slide = Math.max(per[n].slide || 0, sp);
          if (L.clamped) per[n].clamp = (per[n].clamp || 0) + 1;
        }
      }
      prev[n] = { x: tmp.x, y: tmp.y, z: tmp.z, contact: L.contact };
      /* sanity: fetlock must stay above the ground */
      L.ankle.getWorldPosition(tmp);
      p.yMin = Math.min(p.yMin, tmp.y); p.yMax = Math.max(p.yMax, tmp.y);
    }
    rig.root.traverse(o => {
      const q = o.position, r = o.rotation, s = o.scale;
      if (!isFinite(q.x + q.y + q.z + r.x + r.y + r.z + s.x + s.y + s.z)) {
        nan++;
        if (nanSeen++ < 4) console.log('NaN:', o.name || o.type, 'in', o.parent && o.parent.name);
      }
    });
  }
  const sum = GW.Gait.summary(state);
  console.log('\n== ' + gait + ' @ ' + speed + ' m/s' + (s0.radius ? ' on an r=' + s0.radius + 'm circle' : ' straight') + ' ==  frames', frames,
    '| A=' + state.A.toFixed(3), 'f=' + state.freq.toFixed(3), 'stride=' + state.stride.toFixed(2));
  console.log('   NaN', nan, '| max planted hoof slide', slide.toFixed(3), 'm/s');
  for (const n of NAMES) {
    const p = per[n];
    console.log('   ' + n + ' sole min ' + p.minSole.toFixed(4) +
      ' | planted ' + p.plantMin.toFixed(4) + '..' + p.plantMax.toFixed(4) +
      ' | fetlock y ' + p.yMin.toFixed(3) + '..' + p.yMax.toFixed(3) +
      ' | slide ' + (p.slide || 0).toFixed(3) + ' | clamped frames ' + (p.clamp || 0) +
      ' | sole y at worst ' + (p.worstAt === undefined ? '-' : p.worstAt.toFixed(4)));
  }
  return { nan, slide, per };
}

let worst = { nan: 0, slide: 0 }; let worstStraight = 0;
let s0IsStraight = false;
for (const [g, v, rad] of [['idle', 0], ['walk', 0.6], ['walk', 1.25], ['walk', 2.0],
                           ['trot', 4.2], ['rack', 7.5], ['walk', 1.25, 26], ['rack', 7.5, 26]]) {
  s0IsStraight = !rad;
  const r = run(g, v, 6, rad);
  worst.nan += r.nan; worst.slide = Math.max(worst.slide, r.slide);
  if (!s0IsStraight) worstStraight = Math.max(worstStraight, r.slide);
}

/* silhouette / proportion report */
rig.root.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(rig.body);
const size = box.getSize(new THREE.Vector3());
console.log('\nbody bbox  W%.2f  H%.2f  L%.2f'.replace(/(\w)\.2f/g, '$1') ,
  size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
const headTop = new THREE.Vector3(); rig.head.getWorldPosition(headTop);
console.log('head joint world y', headTop.y.toFixed(2), 'root pos', rig.root.position.toArray().map(v => v.toFixed(1)));

console.log('\nTOTAL NaN', worst.nan, '| worst slide', worst.slide.toFixed(3));

/* ---- footfall audit: touchdown order + double-support fraction ---- */
(function audit() {
  const st = GW.Gait.create(rig, { gait: 'walk', speed: 1.25, radius: 0 });
  GW.Gait.setGait(st, 'walk');
  const order = [];
  let frames = 0, twoPlus = 0, onePlus = 0, all4 = 0;
  st.onStep = (n) => order.push(n + '@' + st.phase.toFixed(2));
  for (let i = 0; i < 60 * 12; i++) {
    GW.Gait.step(st, 1 / 60);
    if (i > 60) {
      frames++;
      const down = NAMES.filter(n => rig.legs[n].contact).length;
      if (down >= 2) twoPlus++;
      if (down >= 1) onePlus++;
      if (down === 4) all4++;
    }
  }
  console.log('\nfootfall order (first cycle):', order.slice(0, 4).join('  '));
  console.log('supported: ' + (100 * onePlus / frames).toFixed(1) + '% frames >=1 foot down, ' +
    (100 * twoPlus / frames).toFixed(1) + '% >=2, ' + (100 * all4 / frames).toFixed(1) + '% all four');
  if (onePlus < frames) console.error('FAIL: airborne during a walk');
})();

/* --- silhouette in actor space (root at origin, facing +X) --- */
rig.root.position.set(0, 0, 0); rig.root.rotation.y = 0;
rig.root.updateMatrixWorld(true);
const bb = new THREE.Box3().setFromObject(rig.body);
const sz = bb.getSize(new THREE.Vector3());
console.log('silhouette  len(x) %.2f  height(y) %.2f  width(z) %.2f', sz.x, sz.y, sz.z);
console.log('  x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f', bb.min.x, bb.max.x, bb.min.y, bb.max.y, bb.min.z, bb.max.z);
const rows = [];
rig.body.traverse(o => {
  if (o.isMesh && !o.isInstancedMesh) {
    o.geometry.computeBoundingBox();
    const b = new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    if (b.max.z > 0.60 || b.min.z < -0.60 || b.max.y > 5.6 || b.min.y < -0.05)
      rows.push([((o.parent && o.parent.name) || '?') + '#' + o.id,
        b.min.z.toFixed(2), b.max.z.toFixed(2), b.min.y.toFixed(2), b.max.y.toFixed(2),
        b.min.x.toFixed(2), b.max.x.toFixed(2)].join('  '));
  }
});
console.log('outliers (parent | zmin zmax | ymin ymax | xmin xmax):');
rows.slice(0, 24).forEach(r => console.log('  ' + r));

/* local (authored) bbox of a few key parts + joint rotations */
[['neck seg', rig.neck[0].children.find(o => o.isMesh)],
 ['head skull', rig.head.children.find(o => o.isMesh)],
 ['LF hip', rig.legs.LF.hip.children.find(o => o.isMesh)]].forEach(([nm, m]) => {
  if (!m) { console.log(nm, 'missing'); return; }
  m.geometry.computeBoundingBox();
  const b = m.geometry.boundingBox;
  console.log(nm, 'local bbox z', b.min.z.toFixed(2), '..', b.max.z.toFixed(2),
    '| y', b.min.y.toFixed(2), '..', b.max.y.toFixed(2), '| x', b.min.x.toFixed(2), '..', b.max.x.toFixed(2));
});
console.log('neck eulers', rig.neck.map(j => [j.rotation.x, j.rotation.y, j.rotation.z].map(v => (+v).toFixed(3)).join(',')).join(' | '));
console.log('head euler', [rig.head.rotation.x, rig.head.rotation.y, rig.head.rotation.z].map(v => (+v).toFixed(3)).join(','));
console.log('body euler', [rig.body.rotation.x, rig.body.rotation.y, rig.body.rotation.z].map(v => (+v).toFixed(3)).join(','));

/* --- where does the planted sole drift? --- */
(function trace() {
  const st = GW.Gait.create(rig, { gait: 'walk', speed: 1.25, radius: 0 });
  GW.Gait.setGait(st, 'walk');
  const tmp = new THREE.Vector3();
  let prev = null, rows = [];
  for (let i = 0; i < 60 * 4; i++) {
    GW.Gait.step(st, 1 / 60);
    rig.root.updateMatrixWorld(true);
    const L = rig.legs.LF;
    GW.Gait.hoofWorld(st, L, tmp);
    if (L.contact && prev) {
      rows.push([L.phase.toFixed(3), tmp.x.toFixed(4), tmp.z.toFixed(4),
        (tmp.x - prev.x).toFixed(4), (tmp.z - prev.z).toFixed(4), !!L.clamped].join(' '));
    }
    prev = { x: tmp.x, z: tmp.z };
  }
  console.log('\nLF stance trace: phase x z dx dz clamped');
  console.log(rows.slice(0, 26).join('\n'));
  const cl = rows.filter(r => r.endsWith('true')).length;
  console.log('clamped frames:', cl, 'of', rows.length);
})();

console.log('worst straight-line slide', worstStraight.toFixed(3), 'm/s');
console.log(worst.nan > 0 ? 'FAIL: NaNs' : (worstStraight > 0.15 ? 'WARN: slide' : 'dry run OK'));
