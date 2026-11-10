'use strict';
/* ============================================================
   main.js – renderer, camera, interaction, main loop
   ============================================================ */
(function () {

  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: true, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /* ---------------- scene ---------------- */
  const world = buildWorld();
  const scene = world.scene;
  const giraffe = buildGiraffe();
  scene.add(giraffe.root);
  const walker = new Walker(giraffe);

  /* ---------------- camera + orbit ---------------- */
  const camera = new THREE.PerspectiveCamera(
    42, window.innerWidth / window.innerHeight, 0.1, 1500);

  const PRESETS = {
    hero: { az: 1.02, el: 0.135, dist: 13.5, ty: 2.65 },
    side: { az: Math.PI / 2, el: 0.06, dist: 14.5, ty: 2.6 },
    head: { az: 1.25, el: 0.30, dist: 5.6, ty: 4.55 },
    wide: { az: 2.35, el: 0.34, dist: 26, ty: 3.0 }
  };
  const view = { az: 1.02, el: 0.135, dist: 13.5, ty: 2.65, ox: 0 };
  const want = Object.assign({}, view);

  const target = V(0, 2.65, 0);
  let autoOrbit = true;
  let idle = 0;

  function applyPreset(name) {
    const p = PRESETS[name];
    if (!p) return;
    want.az = p.az; want.el = p.el; want.dist = p.dist; want.ty = p.ty;
    idle = 0;
  }

  /* ---------------- input ---------------- */
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    idle = 0;
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    want.az -= dx * 0.006;
    want.el = clamp(want.el + dy * 0.005, -0.12, 1.30);
    idle = 0;
  });
  const endDrag = e => { dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    want.dist = clamp(want.dist * (1 + Math.sign(e.deltaY) * 0.09), 4.5, 60);
    idle = 0;
  }, { passive: false });

  const speedSteps = [0.0, 0.9, 1.45, 2.6];
  let speedIdx = 2;

  window.addEventListener('keydown', e => {
    switch (e.key) {
      case ' ': walker.paused = !walker.paused; e.preventDefault(); break;
      case '1': applyPreset('hero'); break;
      case '2': applyPreset('side'); break;
      case '3': applyPreset('head'); break;
      case '4': applyPreset('wide'); break;
      case 'g': case 'G':
        walker.setGait(walker.gaitName === 'pace' ? 'walk' : 'pace');
        break;
      case 'a': case 'A': autoOrbit = !autoOrbit; break;
      case 's': case 'S':
        speedIdx = (speedIdx + 1) % speedSteps.length;
        walker.speed = speedSteps[speedIdx];
        break;
      case 'r': case 'R':
        walker.speed = speedSteps[speedIdx = 2];
        applyPreset('hero'); break;
    }
    updateInfo();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  /* ---------------- HUD ---------------- */
  const elGait = document.getElementById('hud-gait');
  const elSpeed = document.getElementById('hud-speed');
  const elFps = document.getElementById('hud-fps');
  function updateInfo() {
    elGait.textContent = walker.gaitName === 'pace'
      ? 'pace (both legs of one side together)' : 'lateral-sequence walk';
    elSpeed.textContent = walker.speed.toFixed(2) + ' m/s';
  }
  updateInfo();

  /* ---------------- loop ---------------- */
  const clock = new THREE.Clock();
  let fpsT = 0, fpsN = 0;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);

    walker.update(dt);
    world.update(walker.model.root.position.x);

    /* camera easing */
    if (autoOrbit && idle > 4 && !dragging) want.az += dt * 0.035;
    idle += dt;
    const k = 1 - Math.exp(-6 * dt);
    view.az += angleNorm(want.az - view.az) * k;
    view.el += (want.el - view.el) * k;
    view.dist += (want.dist - view.dist) * k;
    view.ty += (want.ty - view.ty) * k;

    const f = walker.focus;
    target.x += (f.x + view.ox - target.x) * (1 - Math.exp(-8 * dt));
    target.y += (f.y + (view.ty - 2.55) - target.y) * (1 - Math.exp(-6 * dt));
    target.z += (f.z - target.z) * (1 - Math.exp(-8 * dt));

    const ce = Math.cos(view.el);
    camera.position.set(
      target.x + Math.cos(view.az) * ce * view.dist,
      target.y + Math.sin(view.el) * view.dist,
      target.z + Math.sin(view.az) * ce * view.dist
    );
    if (camera.position.y < 0.4) camera.position.y = 0.4;
    camera.lookAt(target);

    renderer.render(scene, camera);

    fpsT += dt; fpsN++;
    if (fpsT > 0.5) {
      elFps.textContent = Math.round(fpsN / fpsT) + ' fps';
      fpsT = 0; fpsN = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* debug handle for automated screenshots */
  window.__giraffe = { walker, camera, renderer, scene, applyPreset, view, want };
})();
