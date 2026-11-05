/* main.js — boot: renderer, scene, UI, animation loop. */
(function (G) {
  'use strict';

  if (typeof THREE === 'undefined') {
    document.getElementById('loading').textContent =
      'Failed to load lib/three.min.js — keep the lib folder next to index.html.';
    return;
  }

  var app = document.getElementById('app');
  var params = new URLSearchParams(location.search);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  app.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1200);

  var tex = G.makeTextures(renderer);
  var mats = G.makeMaterials(tex);
  var rig = G.buildGiraffe(mats);
  scene.add(rig.root);
  var env = G.buildEnv(scene, tex);
  var gait = G.Gait.create(rig);
  var FREEZE = params.has('freeze');
  if (params.has('t')) gait.t = parseFloat(params.get('t')) || 0;
  var orbit = new G.MiniOrbit(camera, renderer.domElement, new THREE.Vector3(0, 2.35, 0));

  /* ---- state + UI ---- */
  var speed = params.has('speed') ? G.clamp(parseFloat(params.get('speed')) || 0, 0, 2.6) : 1.35;
  var paused = false, wire = false;
  var speedEl = document.getElementById('speed');
  var speedVal = document.getElementById('speedVal');
  speedEl.value = speed;
  speedVal.textContent = speed.toFixed(2) + ' m/s';
  speedEl.addEventListener('input', function () {
    speed = parseFloat(speedEl.value);
    speedVal.textContent = speed.toFixed(2) + ' m/s';
  });
  document.getElementById('pauseBtn').addEventListener('click', togglePause);
  document.getElementById('camBtn').addEventListener('click', function () { orbit.nextPreset(); });
  document.getElementById('wireBtn').addEventListener('click', function () {
    wire = !wire;
    for (var k in mats) if (mats[k].isMeshStandardMaterial) mats[k].wireframe = wire;
  });
  function togglePause() {
    paused = !paused;
    document.getElementById('pauseBtn').textContent = paused ? 'resume' : 'pause';
  }
  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    if (e.key === 'c') orbit.nextPreset();
  });

  if (params.has('cam')) orbit.snap(parseInt(params.get('cam'), 10) || 0);
  if (params.has('wire')) {
    wire = true;
    for (var mk in mats) if (mats[mk].isMeshStandardMaterial) mats[mk].wireframe = true;
  }

  /* ---- dust on hoof landing ---- */
  var DUTY = 0.37;
  var wasSwing = {};
  function dustCheck(dt, v) {
    if (v < 0.2) return;
    var T = G.Gait.cycleTime(v);
    for (var name in rig.legs) {
      var phase = { RR: 0, FR: 0.12, RL: 0.5, FL: 0.62 }[name];
      var lu = G.fract(gait.t / T - phase);
      var swinging = lu < DUTY;
      if (wasSwing[name] && !swinging) {
        env.emitDust(G.Gait.hoofPos(rig, name), 3 + Math.round(v * 2));
      }
      wasSwing[name] = swinging;
    }
  }

  /* ---- loop ---- */
  var hud = document.getElementById('hud');
  var frames = 0, fpsT = performance.now();
  var clock = new THREE.Clock();

  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, clock.getDelta());
    if (FREEZE) dt = 0;
    var v = paused ? 0 : speed;

    G.Gait.update(gait, rig, v, dt);
    dustCheck(dt, v);
    env.update(dt, v);
    orbit.update(dt);
    renderer.render(scene, camera);

    frames++;
    var now = performance.now();
    if (now - fpsT >= 500) {
      hud.textContent = Math.round(frames * 1000 / (now - fpsT)) + ' fps';
      frames = 0; fpsT = now;
    }
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  var loading = document.getElementById('loading');
  loading.style.opacity = '0';
  setTimeout(function () { loading.remove(); }, 600);
  frame();
})(window.G);
