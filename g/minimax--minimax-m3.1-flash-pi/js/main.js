/* main.js — scene assembly, lighting, camera behaviour and the render loop */
(function () {
  'use strict';

  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;

  /* ---------------------------------------------------------------- */
  /*  renderer / scene                                                  */
  /* ---------------------------------------------------------------- */
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd9cdae, 70, 340);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.3, 2000);

  /* ---------------------------------------------------------------- */
  /*  lighting                                                         */
  /* ---------------------------------------------------------------- */
  const sunDir = new V3(-0.30, 0.74, 0.60).normalize();
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 72;
  const S = 11;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xa9c8e8, 0x90764c, 1.25);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xbcd2ea, 0.40);
  fill.position.set(6, 4, -8);
  scene.add(fill);

  /* ---------------------------------------------------------------- */
  /*  world                                                            */
  /* ---------------------------------------------------------------- */
  scene.add(Environment.createSky(sunDir));
scene.add(Environment.createClouds(14));
  scene.add(Environment.createGround());
  const PATH_R = 36;
  scene.add(Environment.createTrail(PATH_R));
  scene.add(Environment.createGrass(9000, 72, PATH_R));
  scene.add(Environment.createTrees(22, 46, 165));
  scene.add(Environment.createRocks(26, 105));
  scene.add(Environment.createBushes(40, 125));
  const dust = Environment.createDust(320);
  scene.add(dust.points);

  /* ---------------------------------------------------------------- */
  /*  the giraffe                                                      */
  /* ---------------------------------------------------------------- */
  const giraffe = Giraffe.build({
    onFootStrike: (id, p) => {
      const w = giraffe.root.localToWorld(p.clone());
      dust.spawn(w.x, 0.05, w.z, 1.0);
    },
  });
  scene.add(giraffe.root);

  /* a couple of herd members further out, walking their own lines */
  const herd = [
    { animal: Giraffe.build({ seed: 77 }), radius: 53, phase: 1.05, speed: 0.95, t: 0 },
    { animal: Giraffe.build({ seed: 133 }), radius: 59, phase: 2.15, speed: 1.12, t: 0 },
  ];
  for (const h of herd) {
    scene.add(h.animal.root);
    h.animal.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    h.shadow = Environment.createContactShadow();
    scene.add(h.shadow);
  }

  /* ---------------------------------------------------------------- */
  /*  camera behaviour                                                 */
  /* ---------------------------------------------------------------- */
  const cam = {
    mode: 'follow',
    yaw: 2.35,          // relative to the giraffe's heading
    pitch: 0.14,
    dist: 13.5,
    yawUser: 0,
    pitchUser: 0,
    distUser: 0,
    pos: new V3(0, 4, 18),
    target: new V3(0, 2.6, 0),
    smoothPos: new V3(0, 4, 18),
    smoothTarget: new V3(0, 2.6, 0),
  };

  const MODES = {
    follow: { yaw: 2.35, pitch: 0.13, dist: 14.5, drift: 0 },
    side: { yaw: Math.PI / 2, pitch: 0.045, dist: 15.0, drift: 0 },
    front: { yaw: 0.0, pitch: 0.09, dist: 12.0, drift: 0 },
    wide: { yaw: 2.2, pitch: 0.10, dist: 28.0, drift: 0 },
    cinema: { yaw: 2.2, pitch: 0.12, dist: 16.0, drift: 0.055 },
  };

  function setMode(mode) {
    if (!MODES[mode]) return;
    cam.mode = mode;
    cam.yaw = MODES[mode].yaw;
    cam.pitch = MODES[mode].pitch;
    cam.dist = MODES[mode].dist;
    cam.yawUser = 0; cam.pitchUser = 0; cam.distUser = 0;
    document.querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  /* pointer interaction */
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    cam.yawUser -= (e.clientX - lastX) * 0.005;
    cam.pitchUser += (e.clientY - lastY) * 0.004;
    cam.pitchUser = Math.max(-0.5, Math.min(0.95, cam.pitchUser));
    lastX = e.clientX; lastY = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.distUser += e.deltaY * 0.012;
    cam.distUser = Math.max(-8, Math.min(30, cam.distUser));
  }, { passive: false });

  /* ---------------------------------------------------------------- */
  /*  walk                                                             */
  /* ---------------------------------------------------------------- */
  let walkTime = 0;
  let paused = false;
  let speed = 1.05;

  const speedInput = document.getElementById('speed');
  const speedLabel = document.getElementById('speed-val');
  speedInput.value = speed;
  speedLabel.textContent = speed.toFixed(2) + ' m/s';
  speedInput.addEventListener('input', () => {
    speed = parseFloat(speedInput.value);
    speedLabel.textContent = speed.toFixed(2) + ' m/s';
  });

  const playBtn = document.getElementById('play');
  function setPaused(p) {
    paused = p;
    playBtn.textContent = paused ? '▶  Walk' : '❚❚  Pause';
    playBtn.classList.toggle('active', paused);
  }
  playBtn.addEventListener('click', () => setPaused(!paused));

  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });
  setMode('follow');

  const ui = document.getElementById('ui');
  document.getElementById('ui-toggle').addEventListener('click', () => ui.classList.toggle('hidden'));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
    if (e.key === '1') setMode('follow');
    if (e.key === '2') setMode('side');
    if (e.key === '3') setMode('front');
    if (e.key === '4') setMode('wide');
    if (e.key === '5') setMode('cinema');
    if (e.key === 'h' || e.key === 'H') ui.classList.toggle('hidden');
  });

  /* ---------------------------------------------------------------- */
  /*  resize                                                           */
  /* ---------------------------------------------------------------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    dust.setScale(h * 0.9);
  }
  window.addEventListener('resize', resize);
  resize();

  /* ---------------------------------------------------------------- */
  /*  loop                                                             */
  /* ---------------------------------------------------------------- */
  const clock = new THREE.Clock();
  const heading = new V3();
  const desired = new V3();
  const tmp = new V3();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());

    if (!paused) walkTime += dt;
    giraffe.setSpeed(speed);
    giraffe.update(dt, walkTime);

    // circular patrol path
    const phi = (walkTime * speed) / PATH_R;
    const px = Math.sin(phi) * PATH_R;
    const pz = Math.cos(phi) * PATH_R;
    giraffe.root.position.set(px, 0, pz);
    giraffe.root.rotation.y = phi;
    giraffe.root.updateMatrixWorld(true);

    // herd members
    for (const h of herd) {
      h.t += dt;
      const p = h.phase + (h.t * h.speed) / h.radius;
      h.animal.root.position.set(Math.sin(p) * h.radius, 0, Math.cos(p) * h.radius);
      h.animal.root.rotation.y = p;
      h.animal.setSpeed(h.speed);
      h.animal.update(dt, h.t);
      h.animal.root.updateMatrixWorld(true);
      h.shadow.position.set(h.animal.root.position.x, 0.02, h.animal.root.position.z);
      h.shadow.rotation.z = -p;
    }

    // camera
    const m = MODES[cam.mode];
    if (m.drift) cam.yaw += m.drift * dt;
    const yaw = cam.yaw + cam.yawUser - phi;
    const pitch = Math.max(-0.35, Math.min(1.25, cam.pitch + cam.pitchUser));
    const dist = Math.max(3.5, cam.dist + cam.distUser);

    // look at the animal's barrel, not at its feet
    tmp.set(0.25, 2.25, 0);
    giraffe.body.localToWorld(tmp);
    cam.target.copy(tmp);

    desired.set(
      Math.cos(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.sin(yaw) * Math.cos(pitch),
    ).multiplyScalar(dist).add(cam.target);

    const k = 1 - Math.exp(-3.2 * dt);
    if (!cam.inited) { cam.inited = true; cam.smoothPos.copy(desired); cam.smoothTarget.copy(cam.target); }
    cam.smoothPos.lerp(desired, k);
    cam.smoothTarget.lerp(cam.target, 1 - Math.exp(-6.0 * dt));
    if (cam.override) {
      camera.position.copy(cam.override.pos);
      camera.lookAt(cam.override.target);
    } else {
      camera.position.copy(cam.smoothPos);
      camera.lookAt(cam.smoothTarget);
    }

    // keep the shadow frustum on the animal
    sun.target.position.set(tmp.x, 1.6, tmp.z);
    sun.position.set(tmp.x + sunDir.x * 45, sunDir.y * 45 + 1.6, tmp.z + sunDir.z * 45);
    sun.target.updateMatrixWorld();

    dust.update(dt);
    renderer.render(scene, camera);
  }

  document.getElementById('loading').classList.add('gone');
  frame();

  // expose for debugging / screenshots
  window.__giraffe = {
    scene, camera, renderer, giraffe, dust, cam, setMode,
    setWalk: (t) => { walkTime = t; },
    setPaused,
    hideUI: () => ui.classList.add('hidden'),
    lookAt: (target, dist, height) => {
      const t = new V3(target.x, target.y, target.z);
      cam.override = {
        pos: new V3(t.x + dist * 0.6, t.y + (height || 0.25), t.z + dist * 0.8),
        target: t,
      };
    },
    clearLook: () => { cam.override = null; },
  };
})();
