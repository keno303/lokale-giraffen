/* world.js — sky, ground, lights, savanna props */
'use strict';

const WORLD = { props: [], hillProps: [], v: GAIT.v, tile: 15 };

function tintedTube(pts, r0, r1, rgb, radial, pow) {
  const fr = framesFromPoints(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])),
    new THREE.Vector3(1, 0, 0));
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1],
      pts[i][2] - pts[i - 1][2]);
  }
  const g = buildTube(fr, (t) => {
    const r = lerp(r0, r1, Math.pow(t, pow || 1));
    return { rx: r, ry: r };
  }, radial || 8, (t) => ({ r: rgb[0], g: rgb[1], b: rgb[2] }), 1, Math.max(len, 0.1) / 1.2);
  return g;
}

function blob(radius, squash, rgb, seg) {
  const g = new THREE.SphereGeometry(radius, seg || 10, seg ? Math.max(6, seg - 3) : 7);
  g.scale(1, squash, 1);
  return tintGeo(g, rgb[0], rgb[1], rgb[2]);
}

function makeAcacia(rnd) {
  const geos = [];
  const H = 2.1 + rnd() * 1.0;
  const lean = (rnd() - 0.5) * 0.5;
  const trunk = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    trunk.push([lean * t * t, H * t, lean * 0.4 * t * t]);
  }
  geos.push(tintedTube(trunk, 0.15, 0.07, [0.33, 0.27, 0.22], 8));
  const top = [lean, H, lean * 0.4];
  const nBr = 4 + Math.floor(rnd() * 2);
  for (let b = 0; b < nBr; b++) {
    const a = b / nBr * TAU + rnd() * 0.6;
    const L = 1.1 + rnd() * 0.9;
    const end = [top[0] + Math.cos(a) * L, H + 0.55 + rnd() * 0.5, top[2] + Math.sin(a) * L];
    geos.push(tintedTube([top,
    [lerp(top[0], end[0], 0.5), lerp(top[1], end[1], 0.72), lerp(top[2], end[2], 0.5)],
      end], 0.055, 0.028, [0.33, 0.27, 0.22], 6));
    /* twig fan */
    geos.push(tintedTube([end, [end[0] + Math.cos(a) * 0.4, end[1] + 0.28, end[2] + Math.sin(a) * 0.4]],
      0.025, 0.012, [0.33, 0.27, 0.22], 5));
  }
  const nC = 3;
  for (let c = 0; c < nC; c++) {
    const a = c / nC * TAU + rnd();
    const rr = 1.5 + rnd() * 1.1;
    const cx = top[0] + Math.cos(a) * (0.5 + rnd() * 0.7);
    const cz = top[2] + Math.sin(a) * (0.5 + rnd() * 0.7);
    const cy = H + 0.85 + rnd() * 0.45;
    const shade = 0.85 + rnd() * 0.35;
    geos.push(blob(rr, 0.24, [0.26 * shade, 0.33 * shade, 0.15 * shade], 12));
    const last = geos[geos.length - 1];
    last.translate(cx, cy, cz);
  }
  return mergeGeos(geos);
}

function makeBush(rnd) {
  const geos = [];
  const n = 6 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + rnd() * 0.8;
    const L = 0.45 + rnd() * 0.55;
    const tilt = 0.25 + rnd() * 0.5;
    const tip = [Math.cos(a) * L * tilt * 2.2, L, Math.sin(a) * L * tilt * 2.2];
    const g = tintedTube([[0, 0, 0], [tip[0] * 0.5, L * 0.55, tip[2] * 0.5], tip],
      0.035, 0.006, [0.55 + rnd() * 0.15, 0.50 + rnd() * 0.14, 0.26 + rnd() * 0.1], 5);
    geos.push(g);
  }
  return mergeGeos(geos);
}

function makeTussock(rnd) {
  const geos = [];
  const n = 7 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, L = 0.30 + rnd() * 0.4;
    const out = 0.10 + rnd() * 0.25;
    const tip = [Math.cos(a) * out, L, Math.sin(a) * out];
    geos.push(tintedTube([[0, 0, 0], [tip[0] * 0.4, L * 0.6, tip[2] * 0.4], tip],
      0.026, 0.004, [0.48 + rnd() * 0.15, 0.45 + rnd() * 0.14, 0.24 + rnd() * 0.1], 4));
  }
  return mergeGeos(geos);
}

function makeRock(rnd) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const seed = rnd() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.75 + 0.5 * (Math.sin(x * 5.1 + seed) * Math.cos(y * 4.3 + seed) * 0.5 + 0.5);
    p.setXYZ(i, x * k, y * k * 0.62, z * k);
  }
  g.computeVertexNormals();
  const s = 0.35 + rnd() * 0.75;
  g.scale(s, s, s);
  const c = 0.44 + rnd() * 0.14;
  return tintGeo(g, c, c * 0.94, c * 0.82);
}

function buildSky() {
  const tex = new THREE.CanvasTexture(makeSkyTexture(2048, 1024));
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildLights(scene) {
  const sun = new THREE.DirectionalLight(0xfff0d2, 3.1);
  sun.position.set(20, 17, 13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = -11; c.right = 11; c.top = 13; c.bottom = -6; c.near = 4; c.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 2.2, 0);
  scene.add(sun); scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x9a885c, 0.72);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.38);
  fill.position.set(-16, 10, -12);
  scene.add(fill);
  return sun;
}

function buildGround(scene) {
  WORLD.groundTex = cnvTexture(makeGroundTexture(1024), 1, 8);
  const tileCount = Math.round(500 / WORLD.tile);
  WORLD.groundTex.repeat.set(tileCount, tileCount);
  const mat = new THREE.MeshStandardMaterial({
    map: WORLD.groundTex, roughness: 1.0, metalness: 0,
    bumpMap: WORLD.groundTex, bumpScale: 0.35
  });
  const g = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), mat);
  g.rotation.x = -PI / 2;
  g.receiveShadow = true;
  scene.add(g);
}

function buildProps(scene) {
  const rnd = mulberry32(20260);
  const propMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0
  });
  WORLD.propMat = propMat;
  const place = (geo, x, z, ry, sc, window) => {
    const m = new THREE.Mesh(geo, propMat);
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    if (sc !== 1) m.scale.setScalar(sc);
    m.castShadow = m.receiveShadow = true;
    m.userData = { z0: z, win: window };
    scene.add(m);
    (window > 60 ? WORLD.hillProps : WORLD.props).push(m);
    return m;
  };

  /* acacia trees */
  const treeG = [makeAcacia(rnd), makeAcacia(rnd), makeAcacia(rnd)];
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (6 + rnd() * 24);
    const z = -28 + rnd() * 56;
    place(treeG[i % 3], x, z, rnd() * TAU, 0.85 + rnd() * 0.5, 56);
  }
  /* bushes */
  const bushG = [makeBush(rnd), makeBush(rnd)];
  for (let i = 0; i < 12; i++) {
    const x = (rnd() - 0.5) * 62;
    if (Math.abs(x) < 3.5) continue;
    place(bushG[i % 2], x, -28 + rnd() * 56, rnd() * TAU, 0.8 + rnd() * 0.8, 56);
  }
  /* dry tussocks */
  const tusG = [makeTussock(rnd), makeTussock(rnd)];
  for (let i = 0; i < 16; i++) {
    const x = (rnd() - 0.5) * 50;
    if (Math.abs(x) < 2.0) continue;
    place(tusG[i % 2], x, -28 + rnd() * 56, rnd() * TAU, 0.6 + rnd() * 0.7, 56);
  }
  /* rocks */
  const rockG = [makeRock(rnd), makeRock(rnd), makeRock(rnd)];
  for (let i = 0; i < 9; i++) {
    const x = (rnd() - 0.5) * 55;
    if (Math.abs(x) < 2.5) continue;
    place(rockG[i % 3], x, -28 + rnd() * 56, rnd() * TAU, 0.7 + rnd() * 0.9, 56);
  }
  /* distant hills */
  const hillG = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.ConeGeometry(72 + i * 26, 11 + i * 4, 26);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      pos.setX(k, pos.getX(k) * (1 + 0.22 * Math.sin(k * 2.7 + i)));
      pos.setZ(k, pos.getZ(k) * (1 + 0.20 * Math.cos(k * 3.1 + i * 2)));
    }
    g.computeVertexNormals();
    hillG.push(tintGeo(g, 0.50, 0.51, 0.42));
  }
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 ? 1 : -1) * (130 + rnd() * 90);
    const h = place(hillG[i % 3], x, -200 + rnd() * 400, rnd() * TAU, 1 + rnd() * 0.6, 400);
    h.castShadow = false;
    h.position.y = -3;
  }
}

/* scroll the world backwards so the giraffe appears to walk forward */
function updateWorld(t) {
  const d = WORLD.v * t;
  /* props move toward -Z; texture content moves opposite to offset, so subtract */
  if (WORLD.groundTex) WORLD.groundTex.offset.y = -d / WORLD.tile;
  for (const m of WORLD.props) {
    const w = m.userData.win;
    let z = m.userData.z0 - d;
    z = ((z + w / 2) % w + w) % w - w / 2;
    m.position.z = z;
  }
  for (const m of WORLD.hillProps) {
    const w = m.userData.win;
    let z = m.userData.z0 - d;
    z = ((z + w / 2) % w + w) % w - w / 2;
    m.position.z = z;
  }
}

function buildWorld(scene) {
  scene.background = buildSky();
  scene.fog = new THREE.FogExp2(0xd2c8a8, 0.0050);
  buildGround(scene);
  buildLights(scene);
  buildProps(scene);
}
