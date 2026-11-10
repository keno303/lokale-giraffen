/* giraffe-world / main.js — renderer, loop, UI. Loaded last by index.html. */
(function (root) {
  'use strict';
  var GW = root.GW, M = GW.math, THREE = root.THREE;
  var watch = GW.Stopwatch('total');

  var canvas = document.getElementById('view');
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: true, powerPreference: 'high-performance', alpha: false
  });
  renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
  renderer.setSize(root.innerWidth, root.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd8cdb4, 60, 330);
  var camera = new THREE.PerspectiveCamera(38, root.innerWidth / root.innerHeight, 0.12, 900);

  /* ------------------------------------------------------------ build ---- */
  var mats = GW.Giraffe.makeMaterials(renderer);
  var rig = GW.Giraffe.build(mats);
  scene.add(rig.root);
  var env = GW.Env.create(scene, renderer, { seed: 7 });
  var state = GW.Gait.create(rig, { gait: 'walk', speed: 1.25, radius: 30 });

  /* two herd-mates: same geometry and materials, their own gait state */
  var herd = [];
  function makeHerd() {
    if (herd.length) return;
    var specs = [
      { scale: 0.94, radius: 39, speed: 1.05, heading: 2.6, gait: 'walk' },
      { scale: 0.74, radius: 20.5, speed: 1.45, heading: 4.4, gait: 'walk' }
    ];
    specs.forEach(function (sp, i) {
      var r = GW.Giraffe.cloneRig(rig, 'giraffe' + (i + 2));
      r.root.scale.setScalar(sp.scale);
      scene.add(r.root);
      var st = GW.Gait.create(r, { gait: sp.gait, speed: sp.speed, radius: sp.radius, heading: sp.heading });
      st.phase = (i * 0.37 + 0.11) % 1;
      herd.push({ rig: r, state: st });
    });
  }
  function stepHerd(dt) {
    herd.forEach(function (h) {
      GW.Gait.step(h.state, dt);
      h.rig.root.scale.setScalar(h.rig.root.userData.s || 1);
      h.rig.root.updateMatrixWorld(true);
    });
  }
  var cam = GW.CameraRig(camera, canvas, { mode: 'follow', distance: 12.5, azimuth: 2.1 });

  /* footfall dust */
  var _w = new THREE.Vector3();
  state.onStep = function (n, L, s) {
    if (!ui.dust) return;
    GW.Gait.hoofWorld(s, L, _w);
    var power = 0.25 + M.clamp01(s.speed / 5) * 1.1 * (L.front ? 1 : 0.85);
    env.puff(_w.x, _w.y + 0.02, _w.z, 0, power);
  };
  state.onRecenter = function (d) {
    env.world.position.sub(d);
    GW.Gait.shiftAnchors(state, d);
    herd.forEach(function (h) { GW.Gait.shiftAnchors(h.state, d); });
  };

  /* ------------------------------------------------------------- UI ------ */
  var ui = {
    gait: 'walk', speed: 1.25, radius: 30, sunAz: 128, sunEl: 46, herd: true,
    dust: true, rig: false, wire: false, shadows: true, autoOrbit: true,
    paused: false
  };
  var el = function (id) { return document.getElementById(id); };
  var stats = el('stats');

  function setGait(g) {
    ui.gait = g;
    GW.Gait.setGait(state, g);
    ui.speed = state.speed;
    var sp = el('speed');
    sp.max = Math.max(0.15, GW.Gait.GAITS[g].maxSpeed);
    sp.step = sp.max > 3 ? 0.1 : 0.05;
    sp.value = ui.speed;
    sp.dispatchEvent(new Event('input'));
    Array.prototype.forEach.call(document.querySelectorAll('[data-gait]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-gait') === g);
    });
  }
  function setCamera(m) {
    cam.setMode(m);
    cam.state.auto = ui.autoOrbit;
    Array.prototype.forEach.call(document.querySelectorAll('[data-cam]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-cam') === m);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-gait]'), function (b) {
    b.addEventListener('click', function () { setGait(b.getAttribute('data-gait')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-cam]'), function (b) {
    b.addEventListener('click', function () { setCamera(b.getAttribute('data-cam')); });
  });
  function slider(id, key, fn, fmt) {
    var s = el(id), out = el(id + 'v');
    function apply() {
      ui[key] = parseFloat(s.value);
      if (out) out.textContent = fmt ? fmt(ui[key]) : ui[key];
      if (fn) fn(ui[key]);
    }
    s.addEventListener('input', apply);
    apply();
    return apply;
  }
  slider('speed', 'speed', function (v) {
    if (ui.gait !== 'idle') GW.Gait.setSpeed(state, v);
  }, function (v) { return v.toFixed(2) + ' m/s · ' + (v * 3.6).toFixed(1) + ' km/h'; });
  slider('radius', 'radius', function (v) { state.radius = v; },
    function (v) { return v <= 0 ? 'straight' : v.toFixed(0) + ' m circle'; });
  slider('sunAz', 'sunAz', function () { env.setSun(ui.sunAz, ui.sunEl); }, function (v) { return v.toFixed(0) + '°'; });
  slider('sunEl', 'sunEl', function () { env.setSun(ui.sunAz, ui.sunEl); }, function (v) { return v.toFixed(0) + '° elev'; });
  slider('exposure', 'exposure', function (v) { renderer.toneMappingExposure = v; },
    function (v) { return v.toFixed(2); });

  function toggle(id, key, fn) {
    var c = el(id);
    c.addEventListener('change', function () { ui[key] = c.checked; fn(c.checked); });
    ui[key] = c.checked; fn(c.checked);
  }
  toggle('tRig', 'rig', function (v) {
    rig.debug.visible = v;
    rig.markers.forEach(function (m) { m.visible = v; });
    rig.lines.forEach(function (o) { o.line.visible = v; });
  });
  toggle('tDust', 'dust', function () { });
  toggle('tWire', 'wire', function (v) {
    Object.keys(mats).forEach(function (k) { mats[k].wireframe = v; });
    env.world.traverse(function (o) {
      if (o.isMesh && o.material && o.material.map && o.material !== mats.hair) o.material.wireframe = v;
    });
  });
  toggle('tShadow', 'shadows', function (v) {
    renderer.shadowMap.enabled = v;
    env.sun.castShadow = v;
    scene.traverse(function (o) {
      if (o.material) {
        var m = Array.isArray(o.material) ? o.material : [o.material];
        m.forEach(function (mm) { mm.needsUpdate = true; });
      }
    });
  });
  toggle('tAuto', 'autoOrbit', function (v) { cam.state.auto = v; });
  toggle('tHerd', 'herd', function (v) {
    if (v) makeHerd();
    herd.forEach(function (h) { h.rig.root.visible = v; });
  });
  var toastTimer = 0;
  toggle('tUI', 'hideUI', function (v) {
    document.body.classList.toggle('noui', v);
    var tst = el('toast');
    if (v) {
      tst.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { tst.classList.remove('show'); }, 2600);
      setTimeout(function () { el('tUI').blur(); }, 0);
    } else { tst.classList.remove('show'); }
  });

  var pauseBtn = el('pause');
  pauseBtn.addEventListener('click', function () {
    ui.paused = !ui.paused;
    pauseBtn.textContent = ui.paused ? '▶ walk again' : '⏸ pause';
    el('scrub').disabled = !ui.paused;
  });
  el('shot').addEventListener('click', function () {
    renderer.render(scene, camera);            /* the drawing buffer is live */
    var a = document.createElement('a');
    a.download = 'giraffe-' + Date.now() + '.png';
    a.href = renderer.domElement.toDataURL('image/png');
    a.click();
  });
  el('step').addEventListener('click', function () {
    GW.Gait.step(state, 1 / 90);
    rig.root.updateMatrixWorld(true);
  });
  el('scrub').addEventListener('input', function () {
    state.phase = parseFloat(el('scrub').value) / 1000;
    GW.Gait.step(state, 0);
    rig.root.updateMatrixWorld(true);
  });

  root.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    var k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); pauseBtn.click(); }
    else if (k === '1') setGait('idle');
    else if (k === '2') setGait('walk');
    else if (k === '3') setGait('trot');
    else if (k === '4') setGait('rack');
    else if (k === 'c') {
      var order = ['follow', 'side', 'low', 'free'];
      setCamera(order[(order.indexOf(cam.state.mode) + 1) % order.length]);
    } else if (k === 'r') { el('tRig').checked = !ui.rig; el('tRig').dispatchEvent(new Event('change')); }
    else if (k === 'w') { el('tWire').checked = !ui.wire; el('tWire').dispatchEvent(new Event('change')); }
    else if (k === 'h') { el('tUI').checked = !ui.hideUI; el('tUI').dispatchEvent(new Event('change')); }
    else if (k === 'arrowup' || k === 'arrowdown') {
      var sp = el('speed');
      sp.value = M.clamp(parseFloat(sp.value) + (k === 'arrowup' ? 0.15 : -0.15), 0, 8);
      sp.dispatchEvent(new Event('input'));
    }
  });

  /* ------------------------------------------------------------ resize -- */
  function resize() {
    var w = root.innerWidth, h = root.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  root.addEventListener('resize', resize);
  resize();

  /* ------------------------------------------------------------- loop ---- */
  var last = (root.performance || Date).now(), fpsAcc = 0, fpsN = 0, fps = 60, t = 0;
  var actor = { pos: rig.root.position, heading: 0, bodyY: 2.9 };
  var triCount = 0;
  rig.root.traverse(function (o) {
    if (o.isMesh) {
      var g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
      triCount += n / 3 * (o.isInstancedMesh ? o.count : 1);
    }
  });

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;

    if (!ui.paused) { GW.Gait.step(state, dt); if (ui.herd) stepHerd(dt); }
    rig.root.updateMatrixWorld(true);
    if (ui.rig) {
      rig.lines.forEach(function (o) {
        var a = rig.root.worldToLocal(o.L.hip.getWorldPosition(new THREE.Vector3()));
        var b = rig.root.worldToLocal(o.L.knee.getWorldPosition(new THREE.Vector3()));
        var c = rig.root.worldToLocal(o.L.ankle.getWorldPosition(new THREE.Vector3()));
        var d = o.L.sole.clone().applyMatrix4(rig.root.matrix);
        var arr = o.line.geometry.attributes.position.array;
        arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
        arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
        arr[6] = c.x; arr[7] = c.y; arr[8] = c.z;
        arr[9] = d.x; arr[10] = d.y; arr[11] = d.z;
        o.line.geometry.attributes.position.needsUpdate = true;
      });
    }

    actor.heading = state.heading;
    actor.bodyY = rig.body.position.y + 2.95;
    cam.update(dt, actor);
    env.follow(rig.root.position);
    env.stepDust(dt);
    env.sway(t);
    env.driftMotes(t, rig.root.position.x, rig.root.position.z);

    renderer.render(scene, camera);

    /* stats */
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.4) {
      fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      var down = 0;
      ['LF', 'RF', 'LH', 'RH'].forEach(function (n) { if (rig.legs[n].contact) down++; });
      stats.innerHTML =
        row('gait', state.gait) +
        row('speed', (state.speed * 3.6).toFixed(1) + ' km/h') +
        row('cadence', state.gait === 'idle' ? '—' : (state.freq * 60).toFixed(0) + ' cycles/min · ' + (state.freq * 240).toFixed(0) + ' steps/min') +
        row('stride', state.stride ? state.stride.toFixed(2) + ' m' : '—') +
        row('hooves down', down + ' / 4') +
        row('distance', (state.travel % 1000).toFixed(0) + ' m') +
        row('triangles', (Math.round(triCount / 100) / 10).toFixed(1) + 'k') +
        row('fps', fps.toFixed(0));
      el('scrub').value = Math.round(M.fract(state.phase) * 1000);
    }
    requestAnimationFrame(frame);
  }
  function row(k, v) { return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>'; }

  GW.app = { renderer: renderer, scene: scene, camera: camera, rig: rig, mats: mats, state: state,
    cam: cam, env: env, ui: ui, setGait: setGait, setCamera: setCamera, herd: herd };
  setGait('walk');
  setCamera('follow');
  env.setSun(ui.sunAz, ui.sunEl);
  el('boot').style.display = 'none';
  watch();
  requestAnimationFrame(function (n) { last = n; frame(n); });
})(typeof window !== 'undefined' ? window : globalThis);
