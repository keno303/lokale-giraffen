(function () {
  'use strict';
  const GIR = window.GIR;
  const Q = new URLSearchParams(location.search);
  const dbg = { t: Q.has('t') ? parseFloat(Q.get('t')) : null, cam: Q.get('cam'), rest: Q.has('rest'), env: Q.get('env') !== '0' };

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: Q.has('t') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 3000);
  camera.position.set(6.6, 2.3, 8.6);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0.4, 2.55, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.5;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.497;

  const env = GIR.buildEnvironment ? GIR.buildEnvironment(scene, renderer, { simple: !dbg.env }) : null;

  function start() {
    const gir = GIR.buildGiraffe();
    scene.add(gir.group);
    const gait = GIR.createGait ? GIR.createGait(gir) : null;
    const dust = GIR.createDust && dbg.env ? GIR.createDust(scene, renderer, camera) : null;
    if (gait && dust) gait.onStep = (x, z, strength, dir) => dust.puff(x, z, simT, strength, dir);
    window.__gir = gir; window.__gait = gait; window.__setT = t => { dbg.t = t; }; window.__setCam = n => setCam(n);

    const camPresets = {
      follow: [6.6, 2.3, 8.6, 0.4, 2.55, 0],
      side: [0.4, 2.4, 9.2, 0.4, 2.45, 0],
      front: [10.5, 2.0, 2.6, 0.3, 2.7, 0], front0: [11, 2.2, 0.01, 0.3, 2.5, 0], hoof: [1.6, 0.5, 2.6, 0.2, 0.45, 0], hip: [-2.6, 2.3, 3.0, -0.5, 1.9, 0], chest: [3.2, 2.0, 2.6, 0.5, 2.1, 0], rear: [-10, 2.2, 0.01, 0.3, 2.3, 0],
      low: [4.6, 0.45, 5.2, 0.3, 2.2, 0],
      back: [-9, 3.0, -4.5, 0.3, 2.5, 0],
      head: [3.3, 4.6, 1.6, 1.95, 4.5, 0],
      head2: [3.6, 4.2, 0.9, 1.9, 4.3, 0], head3: [1.2, 4.6, 2.2, 1.9, 4.3, 0],
      legs: [-0.1, 1.3, 6.6, -0.1, 1.35, 0],
      top: [0.3, 14, 0.01, 0.3, 2.5, 0], sh: [2.6, 3.3, 2.6, 0.6, 2.8, 0.2], sh2: [0.6, 5.5, 1.2, 0.6, 2.8, 0.2],
      q: [5.5, 3.2, 5.5, 0.3, 2.6, 0],
    };
    let bodyX = 0;
    function setCam(name) {
      const p = camPresets[name]; if (!p) return;
      camera.position.set(p[0] + bodyX, p[1], p[2]);
      controls.target.set(p[3] + bodyX, p[4], p[5]);
    }
    if (dbg.cam) setCam(dbg.cam);

    // UI
    const $ = id => document.getElementById(id);
    let paused = false, speedMul = 1, skel = null;
    $('speed').addEventListener('input', e => (speedMul = parseFloat(e.target.value)));
    $('sun').addEventListener('input', e => env && env.setTimeOfDay && env.setTimeOfDay(parseFloat(e.target.value)));
    $('camFollow').onclick = () => setCam('follow');
    $('camSide').onclick = () => setCam('side');
    $('camFront').onclick = () => setCam('front');
    $('camLow').onclick = () => setCam('low');
    const togglePause = () => { paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; };
    $('pause').onclick = togglePause;
    $('bones').onclick = () => {
      if (!skel) { skel = new THREE.SkeletonHelper(gir.bones.root); skel.material.depthTest = false; skel.renderOrder = 10; scene.add(skel); }
      else skel.visible = !skel.visible;
    };
    window.addEventListener('keydown', e => {
      if (e.code === 'Space') { togglePause(); e.preventDefault(); }
      const k = { Digit1: 'follow', Digit2: 'side', Digit3: 'front', Digit4: 'low' }[e.code];
      if (k) setCam(k);
    });
    if (Q.has('ui') && Q.get('ui') === '0') { $('loading').style.display = 'none'; $('panel').style.display = 'none'; $('hud').style.display = 'none'; }
    if (Q.has('sun') && env && env.setTimeOfDay) env.setTimeOfDay(parseFloat(Q.get('sun')));
    if (Q.has('bones')) $('bones').onclick();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    let lastNow = performance.now();
    let simT = dbg.t !== null ? dbg.t : 0;
    let slowAcc = 0, slowN = 0, dpr = renderer.getPixelRatio();
    function frame() {
      requestAnimationFrame(frame);
      const now = performance.now(); const rawDt = (now - lastNow) / 1000; const dt = Math.min(0.05, rawDt); lastNow = now;
      // drop the render resolution a little if the machine cannot keep up
      slowAcc += rawDt; slowN++;
      if (slowN >= 45) {
        if (slowAcc / slowN > 1 / 34 && dpr > 0.75) { dpr = Math.max(0.75, dpr * 0.8); renderer.setPixelRatio(dpr); }
        slowAcc = 0; slowN = 0;
      }
      if (dbg.t !== null) simT = dbg.t; else if (!paused) simT += dt * speedMul;
      let x = 0;
      if (gait && !dbg.rest) x = gait.update(simT, dbg.t !== null ? 0 : (paused ? 0 : dt * speedMul));
      const dx = x - bodyX; bodyX = x;
      camera.position.x += dx; controls.target.x += dx;
      controls.update();
      if (env) env.update(bodyX, camera, simT);
      if (dust) dust.update(simT);
      renderer.render(scene, camera);
    }
    frame();
    document.getElementById('loading').classList.add('hidden');
    window.__ready = true;
  }
  // let the loading screen paint first
  setTimeout(start, 30);
})();
