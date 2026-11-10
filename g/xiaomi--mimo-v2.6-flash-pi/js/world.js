'use strict';
/* ============================================================
   world.js – savanna environment: sky, ground, acacias, rocks
   Props are recycled in a moving window so the giraffe can walk
   indefinitely in a straight line.
   ============================================================ */

function buildWorld() {
  const scene = new THREE.Scene();
  const FOG_COLOR = 0xd3dcd8;
  scene.fog = new THREE.Fog(FOG_COLOR, 65, 300);

  /* ---------------- sky dome ---------------- */
  const skyGeo = new THREE.SphereGeometry(700, 32, 20);
  const skyMat = new THREE.MeshBasicMaterial({
    map: makeSkyTexture(), side: THREE.BackSide,
    depthWrite: false, fog: false
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  /* ---------------- lights ---------------- */
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x8b7c4e, 0.52);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dc, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16;
  sc.near = 25; sc.far = 110;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xa8c6ea, 0.55);
  fill.position.set(-24, 16, -22);
  scene.add(fill);

  /* ---------------- ground ---------------- */
  const groundTex = canvasTexture(makeGroundTexture({ size: 1024, seed: 3 }), [70, 70]);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.97, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ---------------- props ---------------- */
  const rng = makeRng(20240);

  const barkMat = new THREE.MeshStandardMaterial({ color: 0x6a5844, roughness: 0.95 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x4c6b2f, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x587a36, roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x44602b, roughness: 0.95, flatShading: true })
  ];
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x8b8375, roughness: 1.0, flatShading: true
  });

  function makeAcacia() {
    const g = new THREE.Group();
    const h = 2.2 + rng() * 1.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.20, h, 7), barkMat);
    trunk.position.y = h / 2;
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    trunk.castShadow = true;
    g.add(trunk);

    /* spreading branches */
    const nb = 4 + ((rng() * 3) | 0);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + rng() * 0.7;
      const len = 0.9 + rng() * 1.1;
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.075, len, 5), barkMat);
      br.position.set(Math.cos(a) * len * 0.32, h + len * 0.30, Math.sin(a) * len * 0.32);
      br.rotation.z = Math.cos(a) * 0.95;
      br.rotation.x = -Math.sin(a) * 0.95;
      br.castShadow = true;
      g.add(br);
    }

    /* flat top canopy */
    const nb2 = 5 + ((rng() * 4) | 0);
    const cy = h + 0.75 + rng() * 0.5;
    for (let i = 0; i < nb2; i++) {
      const a = rng() * TAU;
      const r = rng() * 1.5;
      const w = 0.9 + rng() * 1.1;
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(w, 1), leafMats[(rng() * 3) | 0]);
      leaf.position.set(Math.cos(a) * r, cy + (rng() - 0.5) * 0.35, Math.sin(a) * r);
      leaf.scale.set(1, 0.30 + rng() * 0.12, 1);
      leaf.rotation.y = rng() * TAU;
      leaf.castShadow = true;
      g.add(leaf);
    }
    const s = 0.75 + rng() * 0.75;
    g.scale.setScalar(s);
    return g;
  }

  function makeRock() {
    const geo = new THREE.IcosahedronGeometry(0.5 + rng() * 0.7, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const f = 0.72 + rng() * 0.5;
      pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.7, pos.getZ(i) * f);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, rockMat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  const props = [];
  for (let i = 0; i < 26; i++) {
    const t = makeAcacia();
    const side = rng() > 0.5 ? 1 : -1;
    t.position.set(-190 + rng() * 380, 0, side * (9 + rng() * 40));
    scene.add(t);
    props.push(t);
  }
  for (let i = 0; i < 22; i++) {
    const r = makeRock();
    const side = rng() > 0.5 ? 1 : -1;
    r.position.set(-190 + rng() * 380, 0, side * (4.5 + rng() * 34));
    r.rotation.y = rng() * TAU;
    scene.add(r);
    props.push(r);
  }
  /* low shrubs close to the path */
  const shrubMat = new THREE.MeshStandardMaterial({
    color: 0x5d7236, roughness: 1, flatShading: true
  });
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.30 + rng() * 0.3, 0), shrubMat);
      b.position.set((rng() - 0.5) * 0.7, 0.18 + rng() * 0.2, (rng() - 0.5) * 0.7);
      b.scale.set(1, 0.7, 1);
      b.castShadow = true;
      s.add(b);
    }
    const side = rng() > 0.5 ? 1 : -1;
    s.position.set(-190 + rng() * 380, 0, side * (3.5 + rng() * 30));
    scene.add(s);
    props.push(s);
  }

  const SPAN = 380;

  function update(focusX) {
    for (const o of props) {
      while (o.position.x < focusX - 90) o.position.x += SPAN;
      while (o.position.x > focusX + 290) o.position.x -= SPAN;
    }
    /* shadow rig follows the animal */
    sun.position.set(focusX + 26, 40, 20);
    sun.target.position.set(focusX, 2.4, 0);
    sun.target.updateMatrixWorld();
    sky.position.x = focusX;
  }

  update(0);

  return { scene, sun, update, fogColor: FOG_COLOR };
}
