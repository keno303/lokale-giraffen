/* ------------------------------------------------------------------
 * environment.js — savanna: sky dome, sun, ground, acacias, grass,
 * rocks, dust.  All procedural, all local.
 * ------------------------------------------------------------------ */
var Environment = (function () {
  'use strict';

  const V = THREE.Vector3;

  function build(opts) {
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd8d2bc, 60, 340);

    /* ---- sky dome with a gradient + sun ---- */
    const skyGeo = new THREE.SphereGeometry(600, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x2f6fb0) },
        mid: { value: new THREE.Color(0x9fc4e0) },
        bot: { value: new THREE.Color(0xe8e2c8) },
        sun: { value: new THREE.Vector3(0.42, 0.62, 0.66).normalize() }
      },
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        }`,
      fragmentShader: `
        uniform vec3 top, mid, bot, sun;
        varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y*0.5+0.5, 0.0, 1.0);
          vec3 col = mix(bot, mid, smoothstep(0.42, 0.62, h));
          col = mix(col, top, smoothstep(0.58, 0.95, h));
          float d = max(dot(normalize(vDir), normalize(sun)), 0.0);
          col += vec3(1.0,0.93,0.78) * pow(d, 220.0) * 1.4;         // sun disc
          col += vec3(1.0,0.86,0.62) * pow(d, 7.0) * 0.30;          // glow
          // gentle banding break-up
          col += (fract(sin(dot(vDir.xy, vec2(12.99,78.23)))*43758.55)-0.5)*0.006;
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    /* ---- lights ---- */
    const sunDir = new V(0.42, 0.62, 0.66).normalize();
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.5);
    sun.position.copy(sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 14;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
    sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);

    const hemi = new THREE.HemisphereLight(0xbcd6f0, 0x9a8a5e, 0.85);
    scene.add(hemi);
    const bounce = new THREE.DirectionalLight(0xd8c9a0, 0.35);
    bounce.position.set(-0.4, 0.25, -0.5);
    scene.add(bounce);

    /* everything below the sky lives in one group (handy for debug shots) */
    const world = new THREE.Group();
    scene.add(world);

    /* ---- ground ---- */
    const groundTex = Textures.ground();
    groundTex.repeat.set(90, 90);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700, 1, 1),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1.0, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    world.add(ground);

    /* ---- acacia trees ---- */
    const barkTex = Textures.bark();
    barkTex.repeat.set(2, 5);
    const leafTex = Textures.leaf();
    const barkMat = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b5638, roughness: 0.9 });

    const trees = new THREE.Group();
    world.add(trees);
    const rand = Geom.makeRand(7);

    function acacia(scale) {
      const g = new THREE.Group();
      const h = 4.2 + rand() * 2.6;
      // trunk: slightly leaning, forking near the top
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * scale, 0.30 * scale, h, 9, 3), barkMat);
      trunk.position.y = h / 2;
      trunk.castShadow = true; trunk.receiveShadow = true;
      g.add(trunk);
      const forks = 2 + ((rand() * 2) | 0);
      for (let i = 0; i < forks; i++) {
        const a = (i / forks) * Math.PI * 2 + rand();
        const l = h * (0.34 + rand() * 0.22);
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.11 * scale, l, 7), barkMat);
        br.position.y = h - l * 0.35;
        br.rotation.z = Math.cos(a) * 0.55;
        br.rotation.x = -Math.sin(a) * 0.55;
        br.castShadow = true;
        g.add(br);
        // flat-topped canopy
        const cy = h + Math.cos(a) * 0.0 + l * 0.22;
        const n = 3 + ((rand() * 3) | 0);
        for (let k = 0; k < n; k++) {
          const r = (0.85 + rand() * 0.75) * scale;
          const c = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafMat);
          c.position.set(Math.cos(a) * 1.1 + (rand() - 0.5) * 1.5,
            cy + (rand() - 0.3) * 0.5,
            Math.sin(a) * 1.1 + (rand() - 0.5) * 1.5);
          c.scale.y = 0.42;
          c.castShadow = true;
          g.add(c);
        }
      }
      return g;
    }

    // keep a clearing around the walking path
    for (let i = 0; i < 46; i++) {
      const a = rand() * Math.PI * 2;
      const r = 26 + rand() * 120;
      const t = acacia(0.8 + rand() * 0.9);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      t.rotation.y = rand() * 6.28;
      trees.add(t);
    }

    /* ---- distant hills ---- */
    const hills = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const r = 240 + rand() * 60;
      const h = 16 + rand() * 26;
      const w = 130 + rand() * 90;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 10),
        new THREE.MeshBasicMaterial({ color: 0x8fa8a0, fog: true }));
      m.scale.set(w, h, w * 0.7);
      m.position.set(Math.cos(a) * r, -h * 0.72, Math.sin(a) * r);
      hills.add(m);
    }
    world.add(hills);

    /* ---- grass tufts (instanced) ---- */
    const tuftGeo = Geom.grassTuft(0.5, 0.42, 3);
    const tuftTex = Textures.grassBlade();
    const tuftMat = new THREE.MeshStandardMaterial({
      map: tuftTex, alphaTest: 0.42, transparent: false,
      roughness: 1.0, side: THREE.DoubleSide, color: 0xb8b47e
    });
    const TUFT_N = 1400;
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, TUFT_N);
    tufts.receiveShadow = true;
    tufts.castShadow = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V(), p = new V();
    const sc = new V();
    for (let i = 0; i < TUFT_N; i++) {
      const a = rand() * Math.PI * 2;
      const r = 4 + Math.pow(rand(), 0.6) * 90;
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      q.setFromAxisAngle(new V(0, 1, 0), rand() * 6.28);
      const k = 0.5 + rand() * 0.9;
      sc.set(k, k * (0.7 + rand() * 0.7), k);
      m4.compose(p, q, sc);
      tufts.setMatrixAt(i, m4);
    }
    tufts.instanceMatrix.needsUpdate = true;
    world.add(tufts);

    /* ---- rocks ---- */
    const rocks = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8577, roughness: 0.95 });
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = 10 + rand() * 80;
      const sz = 0.25 + rand() * 1.1;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(sz, 0), rockMat);
      m.position.set(Math.cos(a) * r, sz * 0.35, Math.sin(a) * r);
      m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      m.scale.set(1, 0.55 + rand() * 0.4, 1);
      m.castShadow = true; m.receiveShadow = true;
      rocks.add(m);
    }
    world.add(rocks);

    /* ---- dust puffs kicked up by hooves ---- */
    const puffTex = Textures.puff();
    const dust = [];
    const dustGeo = new THREE.PlaneGeometry(0.5, 0.5);
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({
        map: puffTex, transparent: true, opacity: 0, depthWrite: false, color: 0xcbbf9a
      }));
      m.visible = false;
      world.add(m);
      dust.push({ mesh: m, life: 0, max: 1, vel: new V(), spin: 0 });
    }

    /* ---- clouds ---- */
    const clouds = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2, r = 130 + rand() * 180;
      const g = new THREE.Group();
      const n = 3 + ((rand() * 4) | 0);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({
          map: puffTex, transparent: true, opacity: 0.55 + rand() * 0.25,
          depthWrite: false, color: 0xffffff, fog: false
        }));
        m.scale.setScalar(18 + rand() * 26);
        m.position.set((rand() - 0.5) * 30, (rand() - 0.5) * 7, (rand() - 0.5) * 22);
        m.rotation.z = rand() * 3;
        g.add(m);
      }
      g.position.set(Math.cos(a) * r, 55 + rand() * 45, Math.sin(a) * r);
      clouds.add(g);
    }
    world.add(clouds);

    function spawnDust(pos, strength) {
      for (const d of dust) {
        if (d.life <= 0) {
          d.life = d.max = 0.7 + Math.random() * 0.5;
          d.mesh.visible = true;
          d.mesh.position.copy(pos);
          d.mesh.position.y += 0.05;
          d.vel.set((Math.random() - 0.5) * 0.7, 0.35 + Math.random() * 0.5,
            (Math.random() - 0.5) * 0.7).multiplyScalar(strength);
          d.spin = (Math.random() - 0.5) * 3;
          d.mesh.scale.setScalar(0.35 + Math.random() * 0.3);
          return;
        }
      }
    }

    function update(dt, t) {
      for (const d of dust) {
        if (d.life > 0) {
          d.life -= dt;
          if (d.life <= 0) { d.mesh.visible = false; continue; }
          const k = d.life / d.max;
          d.mesh.position.addScaledVector(d.vel, dt);
          d.vel.y -= dt * 0.25;
          d.mesh.rotation.z += d.spin * dt;
          d.mesh.scale.setScalar((0.35 + (1 - k) * 0.9) * 1.2);
          d.mesh.material.opacity = 0.42 * k;
          d.mesh.lookAt(0, 40, 0);
        }
      }
      clouds.rotation.y += dt * 0.0035;
    }

    return { scene, world, sun, sunTarget: sun.target, ground, trees, tufts, dust, update, spawnDust, skyMat };
  }

  return { build };
})();
