// ---------------------------------------------------------------------------
// 50_main.js -- renderer, world assembly, camera, UI, animation loop
// ---------------------------------------------------------------------------
(function (G) {
  'use strict';
  const srgb = (h) => new THREE.Color(h).convertSRGBToLinear();

  const app = G.app = {};
  let renderer, scene, camera, rig, sky, sun, hemi, ground, grass, sunHelper;
  const trees = [], rocks = [];
  let coat = null, coatSeed = 1337;

  const state = {
    walk: 1, speedSet: 1.25, follow: true, playing: true,
    camPreset: 'side', sunEl: 26, sunAz: 118, shadows: true, quality: 1
  };
  const A = { speed: 1.25, walk: 1, turn: 0, neckPitch: 0, neckYaw: 0, headPitch: 0, lookAt: null };
  const beh = { mode: 'walk', tMode: 3, turn: 0, turnT: 0, heading: 0 };

  // camera rig
  const cam = { azim: Math.PI * 0.5, offset: Math.PI * 0.5, elev: 0.16, dist: 13.5, target: new THREE.Vector3(), tTarget: new THREE.Vector3(), shake: 0 };
  const PRESET = {
    side: { elev: 0.115, dist: 16.0, off: Math.PI * 0.5, ty: 2.80, tz: 0.3 },
    low: { elev: 0.035, dist: 9.5, off: Math.PI * 0.55, ty: 2.2, tz: 0.2 },
    full: { elev: 0.10, dist: 17.5, off: Math.PI * 0.72, ty: 2.6, tz: 0 },
    head: { elev: 0.10, dist: 4.2, off: Math.PI * 0.35, ty: 4.9, tz: 1.9, head: true },
    portrait: { elev: 0.055, dist: 6.0, off: Math.PI * 0.42, ty: 3.3, tz: 1.0 },
    top: { elev: 0.55, dist: 16, off: Math.PI * 0.5, ty: 2.2, tz: 0 }
  };

  // ---------------------------------------------------------------------
  app.init = function () {
    const canvas = document.getElementById('c');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xcfc7ae, 70, 340);
    camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.25, 2600);
    camera.position.set(12, 3, -6);

    sky = G.Sky();
    scene.add(sky);

    sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 1.6;
    scene.add(sun); scene.add(sun.target);
    hemi = new THREE.HemisphereLight(0xbcd4f0, 0x6b5a3c, 0.75);
    scene.add(hemi);

    // ground
    const gtex = G.groundTexture();
    ground = new THREE.Mesh(
      new THREE.CircleGeometry(700, 48),
      new THREE.MeshStandardMaterial({ map: gtex, bumpMap: gtex, bumpScale: 0.35, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // grass
    grass = G.makeGrass(2600, 85, G.grassTuftTexture());
    scene.add(grass);

    // trees + rocks, recycled ahead of the animal
    const bark = G.barkTexture();
    for (let i = 0; i < 16; i++) {
      const t = G.makeAcacia(bark, 100 + i * 7);
      placeAround(t, i * 41 + 13, 55, 190);
      trees.push(t); scene.add(t);
    }
    for (let i = 0; i < 14; i++) {
      const r = G.makeRock(500 + i * 13);
      const s = 0.3 + (i % 4) * 0.35;
      r.scale.setScalar(s);
      placeAround(r, i * 29 + 5, 18, 150);
      rocks.push(r); scene.add(r);
    }

    // giraffe
    buildGiraffe(coatSeed);

    ui();
    setTime(state.sunEl);
    applyPreset(state.camPreset, true);
    window.addEventListener('resize', onResize);
    onResize();
    controls(canvas);
    app.ready = true;
    last = performance.now();
    requestAnimationFrame(loop);
  };

  function buildGiraffe(seed) {
    if (rig) { scene.remove(rig.root); }
    coat = G.makeCoatAtlas({ seed: seed });
    rig = G.buildGiraffe(coat.texture, { seed: seed });
    scene.add(rig.root);
    app.rig = rig;
  }

  function placeAround(obj, seed, rmin, rmax) {
    const r = G.rng(seed);
    const a = r() * G.TAU, rad = rmin + r() * (rmax - rmin);
    obj.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    obj.rotation.y = r() * 6.28;
    obj.userData.seed = seed;
  }
  const _v1 = new THREE.Vector3();
  function recycle(list, minBehind, near, far) {
    const h = new THREE.Vector3(Math.sin(rig.heading), 0, Math.cos(rig.heading));
    for (const o of list) {
      _v1.copy(o.position).sub(rig.root.position);
      const along = _v1.dot(h);
      if (along < -minBehind) {
        const r = Math.random();
        const d = near + r * (far - near);
        const lat = (Math.random() - 0.5) * 2 * (0.35 * d + 22);
        o.position.copy(rig.root.position).addScaledVector(h, d);
        o.position.x += h.z * lat; o.position.z += -h.x * lat;
        o.rotation.y = Math.random() * 6.28;
      }
    }
  }

  // ---------------------------------------------------------------------
  function setTime(elDeg) {
    state.sunEl = elDeg;
    const el = G.deg(elDeg), az = G.deg(state.sunAz);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    sun.position.copy(dir).multiplyScalar(60);
    const warm = G.clamp(1 - elDeg / 40, 0, 1);
    sun.color.copy(new THREE.Color().lerpColors(srgb(0xfff3df), srgb(0xffb066), warm * 0.85));
    sun.intensity = G.mix(3.1, 1.9, warm);
    hemi.intensity = G.mix(0.8, 0.5, warm);
    hemi.color.copy(new THREE.Color().lerpColors(srgb(0xbcd4f0), srgb(0xf0c39a), warm));
    const hor = new THREE.Color().lerpColors(srgb(0xd3d8cd), srgb(0xe8b184), warm);
    const top = new THREE.Color().lerpColors(srgb(0x3f7fc4), srgb(0x6f8fb8), warm * 0.7);
    // the sky is unlit, so its colours are boosted to survive tone mapping;
    // the fog is boosted by the same amount to keep the horizon seamless
    sky.material.uniforms.uHor.value.copy(hor).multiplyScalar(2.15);
    sky.material.uniforms.uTop.value.copy(top).multiplyScalar(2.35);
    sky.material.uniforms.uHaze.value.copy(hor).lerp(srgb(0xd9cdae), 0.4).multiplyScalar(2.05);
    sky.material.uniforms.uSun.value.copy(dir);
    sky.material.uniforms.uSunI.value = G.mix(1.6, 0.8, warm);
    scene.fog.color.copy(hor).multiplyScalar(2.02);
    renderer.toneMappingExposure = G.mix(1.02, 1.16, warm);
    ground.material.color.setRGB(1, 1, 1);
  }

  // ---------------------------------------------------------------------
  function applyPreset(name, snap) {
    state.camPreset = name;
    const p = PRESET[name];
    cam.elev = p.elev; cam.dist = p.dist;
    cam.offset = p.off;
    cam.azim = (rig ? rig.heading : 0) + p.off;
    if (snap) { cam.target.set(0, p.ty, 0); }
    cam.p = p;
    document.querySelectorAll('#ui .cam button').forEach((b) => b.classList.toggle('on', b.dataset.cam === name));
  }

  function controls(canvas) {
    let down = false, px = 0, py = 0, moved = 0;
    const dn = (e) => { down = true; moved = 0; px = e.clientX; py = e.clientY; };
    const mv = (e) => {
      if (!down) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      cam.azim -= dx * 0.005;
      cam.elev = G.clamp(cam.elev + dy * 0.003, 0.012, 1.2);
      cam.offset = cam.azim - rig.heading;
    };
    const up = () => { down = false; };
    canvas.addEventListener('pointerdown', dn);
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.dist = G.clamp(cam.dist * Math.pow(1.0013, e.deltaY), 2.2, 60);
    }, { passive: false });
    canvas.addEventListener('dblclick', () => { state.follow = !state.follow; sync(); });
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  // ---------------------------------------------------------------------
  function ui() {
    const $ = (id) => document.getElementById(id);
    $('speedV').textContent = state.speedSet.toFixed(2) + ' m/s';
    $('sunV').textContent = Math.round(state.sunEl) + '\u00b0';
    $('sunAzV').textContent = state.sunAz + '\u00b0';
    $('walkBtn').onclick = () => { state.walk = state.walk > 0.5 ? 0 : 1; sync(); };
    $('speed').oninput = (e) => { state.speedSet = +e.target.value; $('speedV').textContent = state.speedSet.toFixed(2) + ' m/s'; };
    $('sun').oninput = (e) => { setTime(+e.target.value); $('sunV').textContent = Math.round(state.sunEl) + '\u00b0'; };
    $('sunAz').oninput = (e) => { state.sunAz = +e.target.value; $('sunAzV').textContent = state.sunAz + '\u00b0'; setTime(state.sunEl); };
    $('follow').onclick = () => { state.follow = !state.follow; sync(); };
    $('coatBtn').onclick = () => { coatSeed = (coatSeed * 7919 + 13) % 100000; buildGiraffe(coatSeed); };
    $('shadowBtn').onclick = () => {
      state.shadows = !state.shadows;
      renderer.shadowMap.enabled = state.shadows;
      scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => x.needsUpdate = true); } });
      sync();
    };
    $('pauseBtn').onclick = () => { state.playing = !state.playing; sync(); };
    document.querySelectorAll('#ui .cam button').forEach((b) => { b.onclick = () => applyPreset(b.dataset.cam, true); });
    sync();
  }
  function sync() {
    const $ = (id) => document.getElementById(id);
    $('walkBtn').textContent = state.walk > 0.5 ? 'Stand' : 'Walk';
    $('follow').classList.toggle('on', state.follow);
    $('shadowBtn').classList.toggle('on', state.shadows);
    $('pauseBtn').textContent = state.playing ? 'Pause' : 'Play';
  }

  // ---------------------------------------------------------------------
  function behaviour(dt) {
    beh.tMode -= dt;
    if (beh.tMode <= 0) {
      const r = Math.random();
      if (r < 0.55) { beh.mode = 'walk'; beh.tMode = G.rand(6, 14); }
      else if (r < 0.78) { beh.mode = 'pause'; beh.tMode = G.rand(2.5, 5); }
      else { beh.mode = 'turn'; beh.tMode = G.rand(4, 7); beh.turn = (Math.random() < 0.5 ? -1 : 1) * G.rand(0.10, 0.20); }
    }
    const d = Math.hypot(rig.root.position.x, rig.root.position.z);
    let wantTurn = beh.mode === 'turn' ? beh.turn : 0;
    if (d > 70) {
      const need = Math.atan2(-rig.root.position.x, -rig.root.position.z);
      let e = need - rig.heading;
      while (e > Math.PI) e -= G.TAU; while (e < -Math.PI) e += G.TAU;
      wantTurn = G.clamp(e * 0.8, -0.25, 0.25);
      beh.mode = 'walk';
    }
    A.turn += (wantTurn - A.turn) * Math.min(1, dt * 1.6);
    const spd = (beh.mode === 'pause' ? 0 : state.speedSet);
    A.speed += (spd - A.speed) * Math.min(1, dt * 1.2);
    A.walk += ((state.walk > 0.5 && spd > 0.05 ? 1 : 0) - A.walk) * Math.min(1, dt * 1.1);
  }

  // ---------------------------------------------------------------------
  let last = 0, fps = 60, acc = 0, frames = 0;
  function step(dt) {
    behaviour(dt);
    rig.update(dt, A);
    // world follows the animal
    const p = rig.root.position;
    ground.position.set(p.x, 0, p.z);
    const tile = 1400 / 26;
    ground.material.map.offset.set(-p.x / tile, -p.z / tile);
    ground.material.bumpMap.offset.set(-p.x / tile, -p.z / tile);
    grass.position.set(Math.round(p.x / 5) * 5, 0, Math.round(p.z / 5) * 5);
    grass.userData.time.value += dt;
    recycle(trees, 130, 70, 210);
    recycle(rocks, 110, 25, 120);
    // shadow frustum rides along
    sun.target.position.set(p.x, 1.8, p.z);
    sun.position.set(p.x, 1.8, p.z).add(sun.userData.dir || (sun.userData.dir = sun.position.clone().normalize().multiplyScalar(60)));
    sun.target.updateMatrixWorld();
  }

  function render() {
    const p = PRESET[state.camPreset];
    const head = rig.head.getWorldPosition(new THREE.Vector3());
    if (state.follow) {
      cam.azim += (rig.heading + cam.offset - cam.azim) * 0.08;
      const anchor = p.preset === 'head' ? head : rig.root.position;
      cam.tTarget.set(rig.root.position.x, p.ty, rig.root.position.z).lerp(head, p.head ? 0.55 : 0.0);
      if (p.head) cam.tTarget.set(head.x, head.y - 0.1, head.z);
      cam.target.lerp(cam.tTarget, 0.08);
    } else {
      cam.target.lerp(cam.tTarget, 0.05);
    }
    const cd = cam.dist, ce = Math.cos(cam.elev), se = Math.sin(cam.elev);
    camera.position.set(
      cam.target.x + Math.sin(cam.azim) * cd * ce,
      cam.target.y + cd * se,
      cam.target.z + Math.cos(cam.azim) * cd * ce
    );
    camera.lookAt(cam.target);
    renderer.render(scene, camera);
  }
  app.render = render;

  function loop(now) {
    const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000));
    last = now;
    if (state.playing) { step(dt); acc += dt; }
    frames++; acc += 0;
    fps = fps * 0.92 + (1 / dt) * 0.08;
    render();
    const el = document.getElementById('fps');
    if (el && frames % 15 === 0) el.textContent = Math.round(fps) + ' fps';
    requestAnimationFrame(loop);
  }

  // ---- test hooks -----------------------------------------------------
  window.__test = {
    get ready() { return !!app.ready; },
    info: () => ({
      tris: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      prog: renderer.info.programs.length,
      h: rig ? +(rig.head.getWorldPosition(new THREE.Vector3()).y).toFixed(2) : 0,
      phase: rig ? +rig.phase.toFixed(2) : 0,
      walk: +A.walk.toFixed(2), speed: +A.speed.toFixed(2)
    }),
    run: async (secs) => {
      const n = Math.round(secs * 60);
      state.playing = false;
      for (let i = 0; i < n; i++) { step(1 / 60); if (i % 4 === 3) render(); }
      render();
    },
    snap: () => render(),
    set: (o) => { Object.assign(state, o); if (o.cam) applyPreset(o.cam, true); },
    cam: (name, dist, azim) => {
      applyPreset(name || 'side', true);
      if (dist) cam.dist = dist;
      if (azim !== undefined) { cam.azim = azim; cam.offset = azim - rig.heading; }
      if (azim !== undefined) state.follow = false;
      render();
    },
    phase: (p) => { rig.phase = p; step(0.0001); render(); },
    freeze: () => { state.playing = false; }
  };
})(window.G);
