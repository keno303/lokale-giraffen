/* Boot, UI and the render loop. */
(function () {
  'use strict';

  const U = window.GU;
  const canvas = document.getElementById('view');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, powerPreference: 'high-performance'
    });
  } catch (err) {
    document.getElementById('loader').innerHTML =
      '<div class="inner"><h2>No WebGL</h2><p>This browser could not create a ' +
      'WebGL context, so the giraffe has nowhere to walk.</p></div>';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.10;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1400);
  const cam = new window.OrbitCam(camera, canvas);

  let world = null, giraffe = null, gait = null, skelHelper = null;
  let paused = false, camMode = 'follow';
  let wire = false, showBones = false;

  /* ---- staged load so the progress bar actually paints ---------------- */
  const steps = [
    ['painting the coat', function () {
      window._coatTex = window.Coat.buildCoat(1024, 6, 1337);
    }],
    ['growing the savanna', function () {
      world = window.buildWorld(scene, renderer);
    }],
    ['assembling 35 bones', function () {
      giraffe = new window.Giraffe(window._coatTex);
      scene.add(giraffe.group);
      gait = new window.Gait(giraffe);
      gait.obstacles = world.obstacles;
      skelHelper = new THREE.SkeletonHelper(giraffe.group);
      skelHelper.visible = false;
      skelHelper.material.depthTest = false;
      scene.add(skelHelper);
    }],
    ['warming up the shaders', function () {
      resize();
      gait.update(1 / 60);
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
    }]
  ];

  function runStep(i) {
    if (i >= steps.length) return finish();
    const msg = document.getElementById('loader-msg');
    const bar = document.querySelector('#bar i');
    msg.textContent = steps[i][0] + '\u2026';
    bar.style.width = Math.round((i / steps.length) * 100) + '%';
    requestAnimationFrame(function () {
      setTimeout(function () {
        steps[i][1]();
        runStep(i + 1);
      }, 24);
    });
  }

  /* Deep links, handy for inspection: ?sim=6&cam=side&gait=amble&tod=0.5 */
  const Q = new URLSearchParams(location.search);
  const VIEWS = {
    side:  { d: 11.0, th: Math.PI / 2, ph: 1.40, y: 2.6 },
    side2: { d: 9.0, th: Math.PI / 2 + 0.5, ph: 1.30, y: 3.0 },
    front: { d: 9.0, th: 0.10, ph: 1.36, y: 3.0 },
    rear:  { d: 9.0, th: Math.PI, ph: 1.36, y: 2.6 },
    head:  { d: 2.4, th: 1.6, ph: 1.42, bone: 'head', up: 0.05 },
    head2: { d: 2.2, th: 0.35, ph: 1.46, bone: 'head', up: 0.0 },
    legs:  { d: 5.5, th: 1.2, ph: 1.52, y: 1.1 },
    wide:  { d: 24.0, th: 1.0, ph: 1.22, y: 3.2 },
    top:   { d: 14.0, th: 1.0, ph: 0.55, y: 3.0 }
  };

  function applyQuery() {
    if (Q.has('tod')) {
      const t = parseFloat(Q.get('tod'));
      world.setTimeOfDay(t);
      document.getElementById('tod').value = t;
    }
    if (Q.has('gait')) setGait(Q.get('gait'));
    if (Q.has('speed')) gait.targetSpeed = parseFloat(Q.get('speed'));
    if (Q.has('sim')) {
      const n = Math.round(parseFloat(Q.get('sim')) * 60);
      gait.speed = gait.targetSpeed;
      for (let i = 0; i < n; i++) gait.update(1 / 60);
    }
    if (Q.has('rig')) { showBones = true; skelHelper.visible = true; }
    if (Q.has('wire')) setWire(true);
    syncGaitButtons();
    if (Q.has('cam')) {
      const v = VIEWS[Q.get('cam')] || VIEWS.side;
      camMode = 'free';
      const p = new THREE.Vector3();
      giraffe.byName[v.bone || 'spine2'].getWorldPosition(p);
      if (v.y !== undefined) p.y = v.y; else p.y += v.up || 0;
      cam.frame(p, v.d, gait.yaw + v.th, v.ph);
      cam.snap();
      [...document.querySelectorAll('#seg-cam button')]
        .forEach((b) => b.classList.toggle('on', b.dataset.c === 'free'));
    }
  }

  function finish() {
    document.querySelector('#bar i').style.width = '100%';
    const l = document.getElementById('loader');
    l.style.opacity = '0';
    setTimeout(() => l.remove(), 650);
    bindUI();
    cam.frame(new THREE.Vector3(0, 2.8, 0), 17, 0.95, 1.41);
    cam.snap();
    applyQuery();
    requestAnimationFrame(loop);
  }

  /* ---- UI ------------------------------------------------------------- */
  function bindUI() {
    const segClick = (id, fn) => {
      const root = document.getElementById(id);
      root.addEventListener('click', function (e) {
        const b = e.target.closest('button');
        if (!b) return;
        fn(b, root);
      });
    };
    const mark = (root, b) => {
      [...root.querySelectorAll('button')].forEach((x) => x.classList.toggle('on', x === b));
    };

    segClick('seg-gait', function (b, root) {
      setGait(b.dataset.g);
      mark(root, b);
    });
    segClick('seg-cam', function (b, root) {
      camMode = b.dataset.c;
      cam.enabled = true;
      mark(root, b);
    });
    segClick('seg-view', function (b) {
      if (b.dataset.v === 'bones') { showBones = !showBones; skelHelper.visible = showBones; b.classList.toggle('on', showBones); }
      if (b.dataset.v === 'wire') { wire = !wire; setWire(wire); b.classList.toggle('on', wire); }
      if (b.dataset.v === 'pause') { paused = !paused; b.classList.toggle('on', paused); }
    });

    const sp = document.getElementById('sp');
    sp.addEventListener('input', function () {
      gait.targetSpeed = parseFloat(sp.value);
      document.getElementById('sp-val').textContent = (+sp.value).toFixed(2) + ' m/s';
      syncGaitButtons();
    });
    const tod = document.getElementById('tod');
    tod.addEventListener('input', () => world.setTimeOfDay(parseFloat(tod.value)));

    window.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === ' ') { paused = !paused; e.preventDefault(); document.querySelector('[data-v=pause]').classList.toggle('on', paused); }
      if (k === '1') clickSeg('seg-gait', 'stand');
      if (k === '2') clickSeg('seg-gait', 'walk');
      if (k === '3') clickSeg('seg-gait', 'amble');
      if (k === 'c') {
        const modes = ['follow', 'free', 'cine'];
        clickSeg('seg-cam', modes[(modes.indexOf(camMode) + 1) % 3]);
      }
      if (k === 'r') document.querySelector('[data-v=bones]').click();
      if (k === 'w') document.querySelector('[data-v=wire]').click();
    });
  }

  function clickSeg(id, value) {
    const b = document.querySelector('#' + id + ' [data-' + id.charAt(4) + '="' + value + '"]');
    if (b) b.click();
  }

  function setGait(name) {
    const sp = document.getElementById('sp');
    if (name === 'stand') {
      gait.targetSpeed = 0;
      sp.value = 0;
    } else {
      gait.gait = name;
      const v = name === 'amble' ? 2.0 : 1.25;
      gait.targetSpeed = v;
      sp.value = v;
    }
    document.getElementById('sp-val').textContent = (+sp.value).toFixed(2) + ' m/s';
  }

  function syncGaitButtons() {
    const name = gait.targetSpeed < 0.05 ? 'stand' : gait.gait;
    [...document.querySelectorAll('#seg-gait button')]
      .forEach((b) => b.classList.toggle('on', b.dataset.g === name));
  }

  function setWire(on) {
    for (const m of giraffe.materials) m.wireframe = on;
  }

  /* ---- camera behaviours ------------------------------------------------ */
  const _p = new THREE.Vector3();
  let shot = 0, shotT = 0;
  const SHOTS = [
    { dist: 19, phi: 1.26, th: 1.05, bone: 'spine2', up: 0.0 },
    { dist: 5.2, phi: 1.22, th: 2.25, bone: 'head', up: 0.0 },
    { dist: 8.5, phi: 1.48, th: -0.9, bone: 'pelvis', up: -1.1 },
    { dist: 26, phi: 0.82, th: -2.1, bone: 'chest', up: 0.0 },
    { dist: 11, phi: 1.40, th: 0.25, bone: 'neck3', up: 0.0 },
    { dist: 14, phi: 1.18, th: 3.0, bone: 'chest', up: 0.0 }
  ];

  function updateCamera(dt) {
    if (camMode === 'follow') {
      giraffe.byName['spine2'].getWorldPosition(_p);
      _p.y -= 0.2;
      cam.goal.target.copy(_p);
      cam.enabled = true;
    } else if (camMode === 'cine') {
      cam.enabled = false;
      shotT += dt;
      if (shotT > 9.5) { shotT = 0; shot = (shot + 1 + ((Math.random() * 2) | 0)) % SHOTS.length; }
      const s = SHOTS[shot];
      giraffe.byName[s.bone].getWorldPosition(_p);
      _p.y += s.up;
      cam.goal.target.copy(_p);
      cam.goal.dist = s.dist * (1 + Math.sin(shotT * 0.22) * 0.07);
      cam.goal.theta = gait.yaw + s.th + shotT * 0.014;
      cam.goal.phi = s.phi + Math.sin(shotT * 0.3) * 0.05;
    } else {
      cam.enabled = true;
    }
    cam.update(dt);
  }

  /* ---- loop -------------------------------------------------------------- */
  let last = performance.now(), fpsAcc = 0, fpsN = 0, uiAcc = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt)) dt = 1 / 60;
    dt = Math.min(dt, 0.05);

    if (!paused) gait.update(dt);
    updateCamera(dt);

    // Keep the shadow frustum tight around the animal.
    const sun = world.sun;
    sun.target.position.copy(gait.pos);
    sun.position.copy(gait.pos).addScaledVector(
      world.sky.material.uniforms.sunDir.value, 70);
    sun.target.updateMatrixWorld();

    world.sky.position.set(camera.position.x, 0, camera.position.z);

    renderer.render(scene, camera);

    fpsAcc += dt; fpsN++; uiAcc += dt;
    if (uiAcc > 0.4) {
      document.getElementById('st-fps').textContent = Math.round(fpsN / fpsAcc);
      document.getElementById('st-speed').textContent = gait.speed.toFixed(2);
      document.getElementById('st-stride').textContent = gait.stepLength().toFixed(2);
      fpsAcc = 0; fpsN = 0; uiAcc = 0;
    }
  }

  /* ---- resize ------------------------------------------------------------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  runStep(0);
})();
