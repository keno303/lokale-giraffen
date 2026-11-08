'use strict';
/* Savanna scenery: sky, ground, acacia trees, bushes, rocks, light rig. */
const SCENERY = (() => {

  function groundTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const rnd = U.rng(9137);
    g.fillStyle = '#a3955f';
    g.fillRect(0, 0, 512, 512);
    // large blotches of dry grass / dirt
    const cols = ['#9c8f5b', '#8e8452', '#b0a06a', '#7d7748', '#a89a63', '#948c56'];
    for (let i = 0; i < 900; i++) {
      g.globalAlpha = 0.07 + rnd() * 0.20;
      g.fillStyle = cols[(rnd() * cols.length) | 0];
      const r = 4 + rnd() * 24;
      g.beginPath();
      g.ellipse(rnd() * 512, rnd() * 512, r, r * (0.4 + rnd() * 0.9), rnd() * 6.3, 0, 6.3);
      g.fill();
    }
    // bare dirt patches
    g.globalAlpha = 1;
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = 0.08 + rnd() * 0.14;
      g.fillStyle = '#8a7750';
      const r = 14 + rnd() * 44;
      g.beginPath();
      g.ellipse(rnd() * 512, rnd() * 512, r, r * 0.6, rnd() * 6.3, 0, 6.3);
      g.fill();
    }
    // speckle
    const img = g.getImageData(0, 0, 512, 512);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rnd() - 0.5) * 34;
      d[i] = U.clamp(d[i] + n, 0, 255);
      d[i + 1] = U.clamp(d[i + 1] + n, 0, 255);
      d[i + 2] = U.clamp(d[i + 2] + n * 0.8, 0, 255);
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(85, 85);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function skyDome() {
    const geo = new THREE.SphereGeometry(420, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3f7fc4) },
        mid: { value: new THREE.Color(0x9dc0dd) },
        bot: { value: new THREE.Color(0xe6d8b6) },
        sun: { value: new THREE.Vector3(0.55, 0.62, 0.35).normalize() }
      },
      vertexShader: `
        varying vec3 vP;
        void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vP; uniform vec3 top, mid, bot, sun;
        void main(){
          float h = clamp(vP.y*1.15, -0.2, 1.0);
          vec3 c = mix(bot, mid, smoothstep(-0.05, 0.30, h));
          c = mix(c, top, smoothstep(0.25, 0.9, h));
          float s = max(dot(normalize(vP), normalize(sun)), 0.0);
          c += vec3(1.0,0.92,0.72) * pow(s, 24.0) * 0.55;
          c += vec3(1.0,0.85,0.6) * pow(s, 6.0) * 0.12;
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    return new THREE.Mesh(geo, mat);
  }

  /* flat-topped acacia */
  function acacia(rng, variant) {
    const grp = new THREE.Group();
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x5b4a37, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: variant ? 0x4a5c2c : 0x556a30, roughness: 1.0, flatShading: true });

    const h = 4.2 + rng() * 2.4;
    const lean = (rng() - 0.5) * 1.1;
    const top = new THREE.Vector3(lean, h, (rng() - 0.5) * 0.5);
    // trunk: tapered lathe with a slight lean
    const rings = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      rings.push({ y: h * t, r: U.lerp(0.34, 0.13, Math.pow(t, 0.75)) });
    }
    const trunk = GEO.lathe(rings, 9);
    trunk.translate(top.x * 0.15, 0, top.z * 0.15);
    const tm = new THREE.Mesh(trunk, barkMat);
    tm.castShadow = true; tm.receiveShadow = true;
    tm.userData.collider = true;
    grp.add(tm);
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push(new THREE.Vector3(top.x * t, h * t, top.z * t));
    }
    // branches
    const nB = 5 + ((rng() * 3) | 0);
    for (let i = 0; i < nB; i++) {
      const a = (i / nB) * U.TAU + rng() * 0.7;
      const len = 1.5 + rng() * 1.4;
      const dir = new THREE.Vector3(Math.cos(a) * len, 1.4 + rng() * 1.1, Math.sin(a) * len);
      const bpts = [top.clone()];
      for (let k = 1; k <= 3; k++) {
        const t = k / 3;
        bpts.push(new THREE.Vector3(
          top.x + dir.x * t, top.y + dir.y * t * (1.1 - 0.35 * t), top.z + dir.z * t));
      }
      const bg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bpts), 6, 0.09, 5, false);
      const bm = new THREE.Mesh(bg, barkMat);
      bm.castShadow = true;
      grp.add(bm);
    }

    // umbrella canopy: flattened blobs
    const canopyY = h + 1.5;
    const nC = 5 + ((rng() * 3) | 0);
    const spread = 2.4 + rng() * 1.6;
    for (let i = 0; i < nC; i++) {
      const a = (i / nC) * U.TAU;
      const rr = i === 0 ? 0 : spread * (0.45 + rng() * 0.55);
      const g = GEO.ellipsoid(
        (1.1 + rng() * 0.9), 0.42 + rng() * 0.22, (1.1 + rng() * 0.9), 10, 7);
      const m = new THREE.Mesh(g, leafMat);
      m.position.set(top.x + Math.cos(a) * rr, canopyY + (rng() - 0.5) * 0.5, top.z + Math.sin(a) * rr);
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
    }
    return grp;
  }

  function rock(rng) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = 0.7 + rng() * 0.6;
      p.setXYZ(i, p.getX(i) * s, p.getY(i) * (0.55 + rng() * 0.4), p.getZ(i) * s);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0x8b8171, roughness: 0.95, flatShading: true
    }));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function grassTuft() {
    // three crossed blades
    const verts = [], idx = [];
    let vi = 0;
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI;
      const dx = Math.cos(a) * 0.055, dz = Math.sin(a) * 0.055;
      verts.push(-dx, 0, -dz, dx, 0, dz, dx * 0.25, 0.34, dz * 0.25);
      idx.push(vi, vi + 1, vi + 2);
      vi += 3;
      verts.push(-dx, 0, -dz, dx * 0.25, 0.34, dz * 0.25, -dx * 0.25, 0.30, -dz * 0.25);
      idx.push(vi, vi + 1, vi + 2);
      vi += 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function build(scene, opts) {
    opts = opts || {};
    const rng = U.rng(20261108);
    const pathR = opts.pathR || 26;

    const sky = skyDome();
    scene.add(sky);

    const gTex = groundTexture();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700, 1, 1),
      new THREE.MeshStandardMaterial({ map: gTex, roughness: 1.0, metalness: 0, color: 0xffffff })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // distant hills
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x77815a, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = rng() * U.TAU;
      const r = 190 + rng() * 170;
      const g = GEO.ellipsoid(60 + rng() * 90, 14 + rng() * 26, 60 + rng() * 90, 16, 8);
      const m = new THREE.Mesh(g, hillMat);
      m.position.set(Math.cos(a) * r, -4, Math.sin(a) * r);
      scene.add(m);
    }

    // acacia trees (kept clear of the walking circle)
    const trees = new THREE.Group();
    const colliders = [];
    const nTrees = 30;
    for (let i = 0; i < nTrees; i++) {
      let a, r, tries = 0;
      do {
        a = rng() * U.TAU;
        r = 40 + Math.pow(rng(), 0.7) * 55;
        tries++;
      } while (Math.abs(r - pathR) < 9 && tries < 40);
      const t = acacia(rng, i % 2);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      t.rotation.y = rng() * U.TAU;
      const s = 0.8 + rng() * 0.7;
      t.scale.setScalar(s);
      t.traverse(o => { if (o.isMesh) colliders.push(o); });
      trees.add(t);
    }
    scene.add(trees);

    // rocks
    for (let i = 0; i < 26; i++) {
      const a = rng() * U.TAU;
      const r = 6 + Math.pow(rng(), 0.5) * 75;
      const m = rock(rng);
      const s = 0.25 + rng() * 0.9;
      m.scale.set(s, s * (0.6 + rng() * 0.5), s);
      m.position.set(Math.cos(a) * r, 0.0, Math.sin(a) * r);
      m.rotation.y = rng() * U.TAU;
      scene.add(m);
      if (s > 0.45) colliders.push(m);
    }

    // grass tufts (instanced), thinning out with distance
    const tuftGeo = grassTuft();
    const tuftMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, side: THREE.DoubleSide
    });
    const N = 2600;
    const inst = new THREE.InstancedMesh(tuftGeo, tuftMat, N);
    inst.castShadow = false;
    inst.receiveShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    let placed = 0;
    for (let i = 0; i < N; i++) {
      const a = rng() * U.TAU;
      const r = Math.pow(rng(), 0.55) * 55;
      pos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      e.set(0, rng() * U.TAU, 0);
      q.setFromEuler(e);
      const s = 0.5 + rng() * 1.0;
      sc.set(s, s * (0.7 + rng() * 0.9), s);
      m4.compose(pos, q, sc);
      inst.setMatrixAt(placed, m4);
      col.setHSL(0.135 + rng() * 0.055, 0.38 + rng() * 0.24, 0.26 + rng() * 0.14);
      inst.setColorAt(placed, col);
      placed++;
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst);

    /* ---- light rig ---- */
    const hemi = new THREE.HemisphereLight(0xa9c8e8, 0x9c8b5c, 0.55);
    scene.add(hemi);

    const sunDir = new THREE.Vector3(0.55, 0.62, 0.35).normalize();
    const sun = new THREE.DirectionalLight(0xfff3de, 3.35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    const ext = 11;
    sun.shadow.camera.left = -ext; sun.shadow.camera.right = ext;
    sun.shadow.camera.top = ext; sun.shadow.camera.bottom = -ext;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    scene.add(sun.target);

    const fill = new THREE.DirectionalLight(0xd9e4f2, 0.32);
    fill.position.set(-14, 10, -18);
    scene.add(fill);

    return {
      sky, ground, trees, sun, hemi, fill,
      sunDir, colliders,
      /* keep the shadow frustum around the animal */
      updateLight(target) {
        sun.position.copy(target).addScaledVector(sunDir, 34);
        sun.target.position.copy(target);
        sun.target.updateMatrixWorld();
      }
    };
  }

  return { build };
})();
