/* ------------------------------------------------------------------
 * main.js -- renderer, animation loop, dust puffs and the UI panel.
 * ------------------------------------------------------------------ */
(function (root) {
  'use strict';
  var THREE = root.THREE, GX = root.GX, TEX = root.TEX,
    GIRAFFE = root.GIRAFFE, ENV = root.ENV, CAM = root.CAM;

  function fail(msg) {
    var status = document.getElementById('status');
    if (status) {
      status.textContent = msg;
      status.style.display = 'flex';
    }
    console.error(msg);
  }

  if (!THREE) { fail('three.min.js failed to load. Keep the vendor/ folder next to index.html.'); return; }
  if (!GIRAFFE) { fail('giraffe.js failed to load.'); return; }

  /* Let the browser paint the loading veil before we block on the
     procedural textures and mesh generation. */
  function boot() {
    init();
  }
  if (root.requestAnimationFrame) {
    root.requestAnimationFrame(function () { root.requestAnimationFrame(boot); });
  } else {
    setTimeout(boot, 30);
  }

  function init() {

  /* ---------------- renderer ---------------- */
  var canvas = document.getElementById('scene');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, powerPreference: 'high-performance'
    });
  } catch (e) {
    fail('WebGL is unavailable in this browser: ' + e.message);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.physicallyCorrectLights = false;

  /* ---------------- scene ---------------- */
  var tex = TEX.build({ quality: 'high' });
  if (!tex) fail('Canvas textures are unavailable; falling back to flat colours.');

  var env = ENV.build(tex);
  env.setRenderer(renderer);
  var scene = env.scene;

  /* ---------------- giraffe ---------------- */
  var giraffe = GIRAFFE.build(tex, {});
  scene.add(giraffe.root);

  var gait = GIRAFFE.controller(giraffe, { speed: 1.0 });
  var S = gait.S;

  /* ---------------- camera ---------------- */
  var camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 900);
  var controls = new CAM.Orbit(camera, canvas, {
    target: new THREE.Vector3(0.4, 2.45, 0),
    distance: 13.5, azimuth: 0.78, polar: 1.22,
    minDistance: 4, maxDistance: 46, autoRotate: true, autoRotateSpeed: 0.05
  });

  /* ---------------- dust puffs ---------------- */
  var DUST = 90;
  var dustGeo = new THREE.PlaneGeometry(1, 1);
  dustGeo.rotateX(-Math.PI / 2);
  var dustMat = new THREE.MeshBasicMaterial({
    map: tex ? tex.dust : null,
    color: tex ? 0xffffff : 0xd6c4a6,
    transparent: true, opacity: 0.5, depthWrite: false,
    side: THREE.DoubleSide
  });
  var dust = new THREE.InstancedMesh(dustGeo, dustMat, DUST);
  dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dust.frustumCulled = false;
  scene.add(dust);
  var puffs = [];
  for (var i = 0; i < DUST; i++) puffs.push({ life: 0, max: 1, x: 0, z: 0, s: 1 });
  var dustDummy = new THREE.Object3D();
  var puffCursor = 0;

  function spawnPuff(x, z, power) {
    var p = puffs[puffCursor];
    puffCursor = (puffCursor + 1) % DUST;
    p.life = 0.55 + Math.random() * 0.35;
    p.max = p.life;
    p.x = x; p.z = z;
    p.s = (0.35 + Math.random() * 0.4) * power;
    p.vx = -0.25 - Math.random() * 0.35;
    p.vz = (Math.random() - 0.5) * 0.5;
    p.vy = 0.10 + Math.random() * 0.22;
  }

  /* ---------------- pointer look-at ---------------- */
  var pointer = { x: 0, y: 0, active: false };
  window.addEventListener('pointermove', function (e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.active = true;
  });

  /* ---------------- UI ---------------- */
  var ui = {
    speed: document.getElementById('speed'),
    speedVal: document.getElementById('speedVal'),
    pause: document.getElementById('pause'),
    orbit: document.getElementById('orbit'),
    reset: document.getElementById('reset'),
    panel: document.getElementById('panel'),
    toggle: document.getElementById('togglePanel')
  };

  function bindRange(el, out, fmt) {
    if (!el) return;
    var apply = function () {
      var v = parseFloat(el.value);
      if (out) out(v);
      if (ui.speedVal) ui.speedVal.textContent = fmt ? fmt(v) : v.toFixed(2);
    };
    el.addEventListener('input', apply);
    apply();
  }

  bindRange(ui.speed, function (v) { S.targetSpeed = v; },
    function (v) { return v.toFixed(2) + ' m/s'; });

  if (ui.pause) {
    ui.pause.addEventListener('click', function () {
      S.paused = !S.paused;
      ui.pause.textContent = S.paused ? 'Resume' : 'Pause';
      ui.pause.classList.toggle('on', S.paused);
    });
  }
  if (ui.orbit) {
    ui.orbit.addEventListener('click', function () {
      controls.autoRotate = !controls.autoRotate;
      ui.orbit.classList.toggle('on', controls.autoRotate);
      ui.orbit.textContent = controls.autoRotate ? 'Auto-orbit: on' : 'Auto-orbit: off';
    });
  }
  if (ui.reset) {
    ui.reset.addEventListener('click', function () {
      controls.reset();
      S.targetSpeed = 1.0;
      if (ui.speed) { ui.speed.value = '1.0'; ui.speed.dispatchEvent(new Event('input')); }
    });
  }
  if (ui.toggle && ui.panel) {
    ui.toggle.addEventListener('click', function () {
      ui.panel.classList.toggle('hidden');
    });
  }
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); ui.pause && ui.pause.click(); }
    if (e.key === 'r' || e.key === 'R') ui.reset && ui.reset.click();
    if (e.key === 'o' || e.key === 'O') ui.orbit && ui.orbit.click();
    if (e.key === 'h' || e.key === 'H') ui.panel && ui.panel.classList.toggle('hidden');
  });

  /* ---------------- resize ---------------- */
  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  /* ---------------- loading veil ---------------- */
  var veil = document.getElementById('veil');
  if (veil) {
    // give the first frames a chance to compile shaders
    setTimeout(function () { veil.classList.add('gone'); }, 260);
  }

  /* ---------------- loop ---------------- */
  var clock = new THREE.Clock();
  var fpsAcc = 0, fpsN = 0, fpsTime = 0;
  var hud = document.getElementById('hud');

  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);

    // look-at from the pointer
    if (pointer.active) {
      S.lookTargetX = pointer.x * 0.9;
      S.lookTargetY = -pointer.y * 0.5;
    }

    gait.update(dt);

    // footfalls kick up dust
    for (var i = 0; i < S.footContacts.length; i++) {
      var c = S.footContacts[i];
      spawnPuff(c.x, c.z, 0.6 + Math.min(1.2, S.speed * 0.55));
    }

    // dust simulation
    for (var p = 0; p < DUST; p++) {
      var q = puffs[p];
      if (q.life > 0) {
        q.life -= dt;
        q.x += q.vx * dt; q.z += q.vz * dt;
        var t = 1 - Math.max(0, q.life) / q.max;
        var s = q.s * (0.5 + t * 2.4);
        dustDummy.position.set(q.x, 0.05 + t * 0.35, q.z);
        dustDummy.rotation.set(0, 0, 0);
        dustDummy.scale.set(s, 1, s);
        dustDummy.updateMatrix();
        dust.setMatrixAt(p, dustDummy.matrix);
      } else {
        dustDummy.position.set(0, -50, 0);
        dustDummy.scale.set(0.0001, 0.0001, 0.0001);
        dustDummy.updateMatrix();
        dust.setMatrixAt(p, dustDummy.matrix);
      }
    }
    dust.instanceMatrix.needsUpdate = true;

    env.update(dt, S.distance, S.speed);

    // shadow camera follows the giraffe
    env.sun.position.set(env.sunDir.x * 60, env.sunDir.y * 60, env.sunDir.z * 60);
    env.sun.target.position.set(0, 1.6, 0);

    controls.update(dt);
    renderer.render(scene, camera);

    // hud
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) {
      fpsTime = Math.round(fpsN / fpsAcc);
      fpsAcc = 0; fpsN = 0;
      if (hud) {
        hud.textContent = fpsTime + ' fps  ·  ' + S.speed.toFixed(2) + ' m/s  ·  ' +
          (S.distance).toFixed(0) + ' m travelled';
      }
    }
  }

  onResize();
  frame();

  // expose for debugging / automated checks
  root.__giraffeApp = {
    renderer: renderer, scene: scene, camera: camera, controls: controls,
    giraffe: giraffe, gait: gait, env: env, tex: tex
  };
  }

})(typeof self !== 'undefined' ? self : globalThis);
