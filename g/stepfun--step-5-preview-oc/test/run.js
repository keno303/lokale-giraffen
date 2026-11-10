/* Headless verification of the giraffe build + gait (no WebGL needed). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ---------- fake canvas so the texture code can run ---------- */
function fakeCtx(w, h) {
  const noop = () => { };
  const grad = { addColorStop: noop };
  return {
    canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    globalAlpha: 1, font: '10px sans-serif', textAlign: 'left',
    lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: '#000',
    globalCompositeOperation: 'source-over',
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, ellipse: noop, rect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop,
    fill: noop, stroke: noop, clip: noop,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop,
    setTransform: noop, transform: noop, resetTransform: noop,
    drawImage: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    getImageData: (x, y, gw, gh) => ({
      data: new Uint8ClampedArray(Math.max(4, gw * gh * 4)), width: gw, height: gh
    }),
    putImageData: noop
  };
}
function fakeCanvas(w, h) {
  const c = { width: w || 300, height: h || 150, style: {}, _ctx: null };
  c.getContext = () => (c._ctx = c._ctx || fakeCtx(c.width, c.height));
  c.toDataURL = () => 'data:image/png;base64,';
  return c;
}

const sandbox = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean,
  Uint8ClampedArray, Float32Array, Uint32Array, Int32Array, Error, isNaN,
  parseInt, parseFloat, setTimeout, clearTimeout,
  window: {
    addEventListener() {}, removeEventListener() {},
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1
  },
  document: { createElement: (tag) => (tag === 'canvas' ? fakeCanvas() : { style: {} }) },
  self: null, module: undefined
};
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function load(f) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}
load('vendor/three.min.js');
load('js/geometry.js');
load('js/textures.js');
load('js/giraffe.js');
load('js/environment.js');
load('js/controls.js');

const THREE = sandbox.THREE;
const GX = sandbox.GX, TEX = sandbox.TEX, GIRAFFE = sandbox.GIRAFFE;
const ENV = sandbox.ENV, CAM = sandbox.CAM;
if (!THREE || !GIRAFFE) throw new Error('modules failed to load');
if (!ENV || !CAM) throw new Error('environment/controls failed to load');

/* ---------- build ---------- */
const t0 = Date.now();
const tex = TEX.build({ quality: 'low' });
console.log('textures built in', Date.now() - t0, 'ms  keys:', tex ? Object.keys(tex).join(',') : 'NONE');

const g = GIRAFFE.build(tex, {});
const ctl = GIRAFFE.controller(g, { speed: 1.0 });
console.log('giraffe built. meshes:', g.root.children.length, 'legs:', g.legs.length,
  'geometries:', g.geometries.length);

/* ---------- environment ---------- */
const env = ENV.build(tex);
console.log('environment built. children:', env.scene.children.length,
  'props:', env.props.length, 'grass:', env.grass.count, 'rocks:', env.rocks.count);

/* ---------- simulate ---------- */
const DT = 1 / 60;
const FRAMES = 900;
let maxStanceFootY = -1e9, minStanceFootY = 1e9;
let maxSlide = 0, clampedFrames = 0, nan = 0;
let maxHoofBelowGround = 0;
const bbox = new THREE.Box3();
const stanceFoot = {};

function checkNaN(o, name) {
  o.traverse((c) => {
    if (!c.matrixWorld) return;
    const e = c.matrixWorld.elements;
    for (let i = 0; i < 16; i++) if (!isFinite(e[i])) { nan++; console.log('NaN in', name, c.name || c.type); }
  });
}

for (let f = 0; f < FRAMES; f++) {
  const S = ctl.update(DT);
  if (f % 7 === 3) ctl.S.targetSpeed = 0.4 + (f % 5) * 0.45;

  // per-leg stance checks
  for (const leg of g.legs) {
    const w = leg.footWorld;
    if (!isFinite(w.x) || !isFinite(w.y) || !isFinite(w.z)) nan++;
    if (leg.clamped) clampedFrames++;
    if (leg.stance) {
      maxStanceFootY = Math.max(maxStanceFootY, w.y);
      minStanceFootY = Math.min(minStanceFootY, w.y);
      if (stanceFoot[leg.key] === undefined) stanceFoot[leg.key] = w.x;
      else {
        // the giraffe is stationary and the world scrolls, so a planted foot
        // must move backwards at exactly the current ground speed
        const expected = stanceFoot[leg.key] - ctl.S.speed * DT;
        maxSlide = Math.max(maxSlide, Math.abs(w.x - expected));
      }
      stanceFoot[leg.key] = w.x;
    } else {
      delete stanceFoot[leg.key];
    }
  }
  if (f % 60 === 0) checkNaN(g.root, 'root');
  env.update(DT, S.distance, S.speed);
  if (f > FRAMES - 121) {
    g.root.updateMatrixWorld(true);
    bbox.expandByObject(g.root);
  }
}

/* ---------- controls smoke test ---------- */
const cam = new THREE.PerspectiveCamera(46, 1.6, 0.1, 900);
const fakeDom = {
  addEventListener() {}, removeEventListener() {},
  setPointerCapture() {}, releasePointerCapture() {},
  style: {}
};
const orbit = new CAM.Orbit(cam, fakeDom, { target: new THREE.Vector3(0, 2, 0), distance: 12 });
orbit.update(0.016);
orbit.setDistance(7); orbit.setAngles(1.0, 1.1); orbit.reset(); orbit.update(0.016);
if (!isFinite(cam.position.x) || !isFinite(cam.position.y) || !isFinite(cam.position.z)) {
  console.log('FAIL: orbit camera produced NaN');
  process.exit(1);
}
console.log('orbit camera ok at', cam.position.toArray().map(v => +v.toFixed(2)).join(', '));

/* ---------- report ---------- */
const size = bbox.getSize(new THREE.Vector3());
console.log('\n--- RESULTS ---');
console.log('bbox min', JSON.stringify(bbox.min.toArray().map(v => +v.toFixed(3))));
console.log('bbox max', JSON.stringify(bbox.max.toArray().map(v => +v.toFixed(3))));
console.log('size  ', size.toArray().map(v => +v.toFixed(3)).join(' x '));
console.log('NaN occurrences      :', nan);
console.log('IK clamp frames      :', clampedFrames);
console.log('stance foot y range  :', minStanceFootY.toFixed(4), '..', maxStanceFootY.toFixed(4));
console.log('max stance foot drift:', maxSlide.toExponential(3), '(vs ground speed)');
console.log('phase/distance       :', ctl.S.phase.toFixed(3), ctl.S.distance.toFixed(2));

/* ---------- assertions ---------- */
const fail = [];
if (nan) fail.push('NaN detected');
if (clampedFrames) fail.push('IK clamped ' + clampedFrames + ' frames');
if (maxStanceFootY > 0.02) fail.push('stance foot lifted off ground: ' + maxStanceFootY);
if (minStanceFootY < -0.02) fail.push('stance foot sank through ground: ' + minStanceFootY);
if (maxSlide > 2e-4) fail.push('stance foot did not track the ground: ' + maxSlide);
if (size.y < 3.8 || size.y > 5.6) fail.push('implausible height: ' + size.y);
if (size.x < 4.0 || size.x > 6.2) fail.push('implausible nose-to-tail length: ' + size.x);
if (size.z < 0.6 || size.z > 1.9) fail.push('implausible width: ' + size.z);
if (bbox.min.y < -0.03) fail.push('model penetrates ground: ' + bbox.min.y);

console.log('\n' + (fail.length ? 'FAIL:\n - ' + fail.join('\n - ') : 'ALL CHECKS PASSED'));
process.exit(fail.length ? 1 : 0);
