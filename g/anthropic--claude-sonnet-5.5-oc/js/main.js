/* App: renderer, path following, camera rig, UI */
(function () {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const qs = new URLSearchParams(location.search);
  const num = (k, d) => (qs.has(k) ? parseFloat(qs.get(k)) : d);

  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: qs.has('t') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const world = new World(renderer);
  const scene = world.scene;
  const giraffe = new Giraffe();
  scene.add(giraffe.root);

  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 2500);
  scene.add(camera);

  /* ---------------------------------------------------------- walking path */
  let pathA = num('a', 0.4);
  const P = a => { const r = world.pathRadius(a); return V(r * Math.cos(a), 0, r * Math.sin(a)); };
  function placeGiraffe(advanceDist) {
    const e = 1e-3;
    const p0 = P(pathA), p1 = P(pathA + e);
    const speedPerA = p0.distanceTo(p1) / e;
    pathA += advanceDist / speedPerA;
    const p = P(pathA), q = P(pathA + 0.01);
    const dir = q.sub(p);
    giraffe.root.position.set(p.x, groundHeight(p.x, p.z), p.z);
    giraffe.root.rotation.y = Math.atan2(dir.x, dir.z);
    giraffe.root.updateMatrixWorld(true);
  }
  placeGiraffe(0);

  /* --------------------------------------------------------------- dust */
  const dustTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const dust = [];
  for (let i = 0; i < 48; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTex, color: 0xc9ac7c, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false; s.userData = { life: 0, max: 1, v: V(0, 0, 0) };
    scene.add(s); dust.push(s);
  }
  let dustI = 0;
  function puff(pos) {
    for (let k = 0; k < 3; k++) {
      const s = dust[dustI++ % dust.length];
      s.position.copy(pos).add(V((Math.random() - 0.5) * 0.15, 0.03, (Math.random() - 0.5) * 0.15));
      s.userData.life = 0; s.userData.max = 1.0 + Math.random() * 0.8;
      s.userData.v.set((Math.random() - 0.5) * 0.25, 0.1 + Math.random() * 0.12, (Math.random() - 0.5) * 0.25);
      s.userData.s0 = 0.18 + Math.random() * 0.12;
      s.visible = true;
    }
  }
  function updateDust(dt) {
    for (const s of dust) {
      if (!s.visible) continue;
      const u = s.userData; u.life += dt;
      const t = u.life / u.max;
      if (t >= 1) { s.visible = false; continue; }
      s.position.addScaledVector(u.v, dt);
      const sz = u.s0 + t * 0.9;
      s.scale.set(sz, sz, 1);
      s.material.opacity = 0.22 * Math.pow(1 - t, 1.5) * Math.min(1, t * 8);
    }
  }

  /* --------------------------------------------------------------- camera */
  const cam = {
    az: THREE.MathUtils.degToRad(num('az', 70)), el: THREE.MathUtils.degToRad(num('el', 7)), dist: num('dist', 13.5), ty: num('ty', 2.7), tz: 0.3,
    tAz: 0, tEl: 0, tDist: 0, tTy: 0, tTz: 0,
    follow: qs.get('follow') !== '0', drift: !qs.has('t') && qs.get('drift') !== '0', lastInput: -100,
    target: V(0, 2.7, 0),
  };
  cam.tAz = cam.az; cam.tEl = cam.el; cam.tDist = cam.dist; cam.tTy = cam.ty; cam.tTz = cam.tz;

  const presets = {
    side: { az: 80, el: 6, dist: 13.5, ty: 2.7, tz: 0.4 },
    threeq: { az: 38, el: 9, dist: 12.5, ty: 2.9, tz: 0.6 },
    front: { az: 12, el: 5, dist: 12, ty: 3.2, tz: 0.8 },
    rear: { az: 172, el: 8, dist: 13, ty: 2.9, tz: 0.2 },
    head: { az: 62, el: 4, dist: 3.8, ty: 4.65, tz: 2.0 },
    wide: { az: 48, el: 14, dist: 30, ty: 2.4, tz: 0.0 },
    legs: { az: 90, el: 1, dist: 6.5, ty: 1.2, tz: 0.0 },
  };
  function setPreset(name) {
    const p = presets[name]; if (!p) return;
    cam.tAz = THREE.MathUtils.degToRad(p.az); cam.tEl = THREE.MathUtils.degToRad(p.el); cam.tDist = p.dist; cam.tTy = p.ty; cam.tTz = p.tz;
    cam.lastInput = performance.now() / 1000;
    if (qs.has('t')) { cam.az = cam.tAz; cam.el = cam.tEl; cam.dist = cam.tDist; cam.ty = cam.tTy; cam.tz = cam.tTz; }
  }
  if (qs.has('view')) setPreset(qs.get('view'));

  // pointer controls (orbit / zoom)
  let dragging = false, lx = 0, ly = 0;
  const pointers = new Map();
  let pinchD = 0;
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    dragging = true; lx = e.clientX; ly = e.clientY;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    cam.lastInput = performance.now() / 1000;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      cam.tDist = THREE.MathUtils.clamp(cam.tDist * pinchD / d, 2.5, 70); pinchD = d; return;
    }
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    cam.tAz -= dx * 0.006; cam.tEl = THREE.MathUtils.clamp(cam.tEl + dy * 0.004, -0.02, 1.35);
  });
  const up = e => { pointers.delete(e.pointerId); if (!pointers.size) dragging = false; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); cam.lastInput = performance.now() / 1000;
    cam.tDist = THREE.MathUtils.clamp(cam.tDist * Math.exp(e.deltaY * 0.0012), 2.5, 70);
  }, { passive: false });

  /* ------------------------------------------------------------------- UI */
  const state = { speed: num('speed', 1), paused: false };
  const $ = id => document.getElementById(id);
  if (qs.get('ui') === '0') $('ui').style.display = 'none';
  $('speed').value = state.speed;
  $('speedv').textContent = state.speed.toFixed(1) + '×';
  $('speed').addEventListener('input', e => { state.speed = parseFloat(e.target.value); $('speedv').textContent = state.speed.toFixed(1) + '×'; });
  $('pause').addEventListener('click', togglePause);
  function togglePause() { state.paused = !state.paused; $('pause').textContent = state.paused ? 'Play' : 'Pause'; }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.view)));
  $('follow').checked = cam.follow; $('drift').checked = cam.drift;
  $('follow').addEventListener('change', e => {
    // keep the current visual angle when switching mode
    const h = giraffe.root.rotation.y;
    cam.follow = e.target.checked;
    const delta = cam.follow ? -h : h;
    cam.az += delta; cam.tAz += delta;
  });
  $('drift').addEventListener('change', e => { cam.drift = e.target.checked; });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    const map = { Digit1: 'side', Digit2: 'threeq', Digit3: 'front', Digit4: 'rear', Digit5: 'head', Digit6: 'wide', Digit7: 'legs' };
    if (map[e.code]) setPreset(map[e.code]);
    if (e.code === 'KeyH') { const u = $('ui'); u.style.display = u.style.display === 'none' ? '' : 'none'; }
  });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  /* ----------------------------------------------------------------- loop */
  const tmp = V(0, 0, 0), tgtGoal = V(0, 0, 0);
  let simTime = 0;
  function step(dt) {
    if (!state.paused) {
      giraffe.update(dt, state.speed);
      placeGiraffe(giraffe.velocity * dt);
      giraffe.root.updateMatrixWorld(true);
      for (const leg of giraffe.landed) {
        giraffe.root.localToWorld(tmp.set(leg.def.x, 0.02, leg.z0 + giraffe.halfStride + 0.05));
        puff(tmp.clone());
      }
      simTime += dt;
    }
    updateDust(dt);
  }
  let firstCam = true;
  function updateCamera(dt, now) {
    if (cam.drift && now - cam.lastInput > 6) {
      cam.tAz += Math.sin(now * 0.05) * 0.0016 * (dt * 60);
      cam.tEl += (Math.sin(now * 0.037) * 0.0002) * (dt * 60);
    }
    const k = 1 - Math.exp(-dt * 6);
    cam.az += (cam.tAz - cam.az) * k; cam.el += (cam.tEl - cam.el) * k;
    cam.dist += (cam.tDist - cam.dist) * k; cam.ty += (cam.tTy - cam.ty) * k; cam.tz += (cam.tTz - cam.tz) * k;

    const h = giraffe.root.rotation.y;
    // focus point: a spot on the giraffe's body line
    tgtGoal.set(0, cam.ty, cam.tz).applyMatrix4(giraffe.root.matrixWorld);
    tgtGoal.y = cam.ty + giraffe.root.position.y;
    const kt = (qs.has('t') || firstCam) ? 1 : 1 - Math.exp(-dt * 7);
    firstCam = false;
    cam.target.lerp(tgtGoal, kt);
    const azW = cam.follow ? cam.az + h : cam.az;
    const ce = Math.cos(cam.el);
    camera.position.set(
      cam.target.x + Math.sin(azW) * ce * cam.dist,
      cam.target.y + Math.sin(cam.el) * cam.dist,
      cam.target.z + Math.cos(azW) * ce * cam.dist);
    camera.position.y = Math.max(camera.position.y, 0.35);
    camera.lookAt(cam.target);
    camera.fov = cam.dist < 6 ? 30 : 35;
    camera.updateProjectionMatrix();
  }

  const fixedT = qs.has('t') ? parseFloat(qs.get('t')) : null;
  if (fixedT !== null) {
    const n = Math.round(fixedT * 60);
    for (let i = 0; i < n; i++) step(1 / 60);
    updateCamera(1 / 60, 0);
    world.update(simTime, giraffe.root.position);
  }

  let last = performance.now();
  function frame(nowMs) {
    requestAnimationFrame(frame);
    const now = nowMs / 1000;
    let dt = Math.max(0, Math.min(0.05, (nowMs - last) / 1000)); last = nowMs;
    if (fixedT === null) step(dt);
    updateCamera(dt, now);
    world.update(now, giraffe.root.position);
    renderer.render(scene, camera);
    if (fixedT !== null) document.title = 'ready';
  }
  requestAnimationFrame(frame);

  window.__advance = sec => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) step(1 / 60); };
  window.__giraffe = { giraffe, world, camera, renderer, cam, state };
  const ld = document.getElementById('loading'); if (ld) ld.remove();
})();
