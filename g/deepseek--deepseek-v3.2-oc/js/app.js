/* ==========================================================================
   app.js — scene, materials, UI, loop.

   Open index.html straight from the filesystem: no server, no build step,
   no network.  All textures are generated in js/coat.js at load time.
   ========================================================================== */
(function (GIR) {
  'use strict';

  var TAU = GIR.TAU;

  /* --------------------------------------------------------------- query -- */
  function qs() {
    var out = {};
    var s = location.search.replace(/^\?/, '');
    if (!s) return out;
    s.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p.length === 2) out[decodeURIComponent(p[0])] = decodeURIComponent(p[1]);
    });
    return out;
  }
  var Q = qs();
  function num(name, def) {
    return Q[name] === undefined ? def : (parseFloat(Q[name]) || def);
  }
  function flag(name, def) {
    return Q[name] === undefined ? def : (Q[name] !== '0' && Q[name] !== 'false');
  }

  /* ------------------------------------------------------------- params -- */
  var params = {
    gait: Q.gait || 'walk',
    speed: Q.speed === undefined ? undefined : num('speed', 1.05),
    preset: Q.cam || 'quarter',
    quality: Q.quality || (flag('fast', false) ? 'low' : 'med'),
    texSize: num('tex', 0),
    shadow: flag('shadow', true),
    terrain: flag('terrain', true),
    time: num('t', 0),
    paused: flag('pause', false),
    slowmo: flag('slow', false),
    autoOrbit: flag('auto', true),
    wire: flag('wire', false),
    timeScale: 1
  };

  var QUALITY = {
    low:  { tex: 384, seg: 16, segLeg: 12, segHead: 12, torsoRings: 20, neckRings: 16,
            grass: 0, shadowMap: 1024, dpr: 1, dust: 0, trees: 5, px: 0.75 },
    med:  { tex: 768, seg: 22, segLeg: 16, segHead: 16, torsoRings: 28, neckRings: 22,
            grass: 1, shadowMap: 2048, dpr: 1.5, dust: 1, trees: 9, px: 1 },
    high: { tex: 1280, seg: 28, segLeg: 20, segHead: 20, torsoRings: 34, neckRings: 26,
            grass: 2, shadowMap: 2048, dpr: 2, dust: 2, trees: 12, px: 1 }
  };
  var qv = QUALITY[params.quality] || QUALITY.med;
  if (params.texSize) qv.tex = params.texSize;

  var app = GIR.app = {
    params: params, errors: [], logs: [], ready: false, frame: 0, simTime: 0
  };

  window.addEventListener('error', function (e) {
    app.errors.push(String(e.message || e.error) + ' @' +
      String(e.filename || '').split('/').pop() + ':' + e.lineno);
  });
  window.addEventListener('unhandledrejection', function (e) {
    app.errors.push('promise: ' + e.reason);
  });

  /* ------------------------------------------------------------ boot UI -- */
  var boot = document.getElementById('boot');
  function step(msg) {
    if (boot) boot.textContent = msg;
    app.logs.push(msg);
    /* let the browser paint between the heavy generation steps */
    return new Promise(function (res) { requestAnimationFrame(function () { requestAnimationFrame(res); }); });
  }

  /* ------------------------------------------------------------- three.js -- */
  var renderer, scene, camera, sun, hemi, fill, rig, state, terrain, camRig;

  function makeRenderer(canvas) {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: qv.px >= 1, powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qv.dpr) * qv.px);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = params.shadow;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xcdbb9a, 1);
    GIR.Skin.setAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    return renderer;
  }

  function makeLights() {
    hemi = new THREE.HemisphereLight(0xbfd4e8, 0x8a7256, 0.62);
    scene.add(hemi);

    sun = new THREE.DirectionalLight(0xfff0d0, 2.05);
    sun.position.set(18, 22, -28);
    sun.castShadow = true;
    sun.shadow.mapSize.set(qv.shadowMap, qv.shadowMap);
    var sc = sun.shadow.camera;
    sc.left = -5.2; sc.right = 5.2; sc.top = 6.4; sc.bottom = -1.6;
    sc.near = 6; sc.far = 80;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.022;
    sun.target.position.set(0.4, 2.2, 0);
    scene.add(sun);
    scene.add(sun.target);

    fill = new THREE.DirectionalLight(0x9fb8d6, 0.42);
    fill.position.set(-14, 8, 16);
    scene.add(fill);

    var rim = new THREE.DirectionalLight(0xffd8a8, 0.5);
    rim.position.set(-10, 6, -18);
    scene.add(rim);
  }

  /* --------------------------------------------------------- materials ---- */
  function makeMaterials() {
    var M = GIR.Mat, S = GIR.Skin;
    var coat = S.coat(qv.tex, { cells: 11, seed: 4711, channel: 0.052, warp: 0.62 });
    var mats = {};
    mats.coat = M.coat(coat, { bump: 0.014, rough: 0.86 });
    mats.mane = M.hair(S.fur(256, { base: [86, 52, 30], hi: [158, 104, 56], streaks: 3 }), 0x8a5a30, 0.95);
    mats.hairDark = M.hair(S.fur(192, { base: [46, 28, 18], hi: [96, 60, 34], streaks: 2 }), 0x503320, 0.96);
    mats.hairLight = M.hair(S.fur(192, { base: [150, 118, 74], hi: [214, 186, 138], streaks: 2 }), 0xa8875a, 0.96);
    var muzzleTex = S.fur(160, { base: [52, 38, 34], hi: [96, 74, 66], streaks: 1 });
    mats.leather = M.leather(muzzleTex, 0x4a332c, 0.55);
    mats.leatherDark = M.leather(muzzleTex, 0x2a1d19, 0.6);
    mats.earInner = M.leather(S.fur(128, { base: [150, 96, 88], hi: [206, 152, 138], streaks: 1 }), 0x9c6c60, 0.8);
    mats.nostril = new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 0.35, metalness: 0 });
    mats.eye = M.eye();
    mats.sclera = new THREE.MeshStandardMaterial({ color: 0x241a15, roughness: 0.5 });
    mats.lid = new THREE.MeshStandardMaterial({ map: S.fur(128, { base: [58, 38, 26], hi: [110, 76, 50], streaks: 1 }),
      color: 0x6b4a30, roughness: 0.9 });
    mats.lash = new THREE.MeshStandardMaterial({ color: 0x150f0b, roughness: 0.8 });
    mats.hoof = M.hoof(0x2c211a);
    mats.pale = new THREE.MeshStandardMaterial({
      map: S.fur(160, { base: [206, 198, 180], hi: [238, 232, 216], streaks: 1 }),
      color: 0xd8d2c2, roughness: 0.85
    });

    /* terrain materials */
    mats.bark = new THREE.MeshStandardMaterial({ map: S.bark(256), color: 0x9a8266, roughness: 0.95 });
    var canopyTex = S.canopy(256);
    mats.canopy = new THREE.MeshStandardMaterial({
      map: canopyTex, alphaMap: canopyTex, alphaTest: 0.42, color: 0x7d8449,
      roughness: 1.0, side: THREE.DoubleSide
    });
    mats.canopyBack = new THREE.MeshStandardMaterial({
      map: canopyTex, alphaMap: canopyTex, alphaTest: 0.42, color: 0x5c6337,
      roughness: 1.0, side: THREE.DoubleSide
    });
    mats.rock = new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.98, metalness: 0 });
    mats._coatTextures = coat;
    return mats;
  }

  /* ----------------------------------------------------------- scene setup - */
  function buildShadowRig() {
    /* keep the shadow box tight on the animal: it is ~5.5 m tall and 3 m long */
    sun.shadow.camera.top = 6.2;
    sun.shadow.camera.bottom = -0.6;
    sun.shadow.camera.left = -5.6;
    sun.shadow.camera.right = 5.6;
    sun.shadow.camera.updateProjectionMatrix();
  }

  function setWireframe(on) {
    scene.traverse(function (o) {
      if (o.isMesh && o.material && !Array.isArray(o.material)) {
        if (o.material.isMeshStandardMaterial || o.material.isMeshBasicMaterial) {
          o.material.wireframe = on;
        }
      }
    });
  }

  /* ------------------------------------------------------------- HUD -------- */
  var el = {};
  function $(id) { return document.getElementById(id); }

  function wireUI() {
    el.hud = $('hud');
    el.panel = $('panel');
    el.gaitSel = $('gait');
    el.speed = $('speed');
    el.speedV = $('speedV');
    el.gaitLab = $('gaitLab');
    el.diagram = $('diagram');
    el.stats = $('stats');
    el.cams = $('cams');
    el.log = $('log');
    el.btnPause = $('btnPause');
    el.btnSlow = $('btnSlow');
    el.btnShadow = $('btnShadow');
    el.btnTerrain = $('btnTerrain');
    el.btnWire = $('btnWire');
    el.btnAuto = $('btnAuto');
    el.btnDump = $('btnDump');
    el.texSel = $('tex');

    el.gaitSel.innerHTML = '';
    GIR.Gait.order.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g; o.textContent = GIR.Gait.gaits[g].label;
      el.gaitSel.appendChild(o);
    });
    el.gaitSel.value = params.gait;
    el.gaitSel.addEventListener('change', function () { setGait(el.gaitSel.value); });

    el.speed.min = '0'; el.speed.max = '2.6'; el.speed.step = '0.05';
    el.speed.addEventListener('input', function () { setSpeed(parseFloat(el.speed.value)); });

    el.btnPause.addEventListener('click', function () { togglePause(); });
    el.btnSlow.addEventListener('click', function () { toggleSlow(); });
    el.btnShadow.addEventListener('click', function () { toggleShadow(); });
    el.btnTerrain.addEventListener('click', function () { toggleTerrain(); });
    el.btnWire.addEventListener('click', function () { toggleWire(); });
    el.btnAuto.addEventListener('click', function () { toggleAuto(); });
    el.btnDump.addEventListener('click', function () { dumpToLog(); });

    Object.keys(GIR.CameraRig.presets).forEach(function (k) {
      var b = document.createElement('button');
      b.textContent = k; b.className = 'cam';
      b.addEventListener('click', function () { camRig.setPreset(k); setActiveCam(k); });
      el.cams.appendChild(b);
    });

    el.texSel.innerHTML = '';
    [256, 384, 512, 768, 1024, 1280].forEach(function (t) {
      var o = document.createElement('option'); o.value = t; o.textContent = t + ' px';
      el.texSel.appendChild(o);
    });
    el.texSel.value = String(qv.tex);
    el.texSel.addEventListener('change', function () { rebuildCoat(parseInt(el.texSel.value, 10)); });

    $('btnReset').addEventListener('click', function () {
      state.t = 0; state.cycle = 0; state.belt = 0;
      camRig.setPreset(params.preset, true);
    });
    $('btnHide').addEventListener('click', function () {
      el.panel.classList.toggle('hidden');
    });
  }

  function setActiveCam(k) {
    Array.prototype.forEach.call(el.cams.children, function (b) {
      b.classList.toggle('on', b.textContent === k);
    });
  }

  function rebuildCoat(size) {
    var old = mats._coatTextures;
    mats._coatTextures = GIR.Skin.coat(size, { cells: 11, seed: 4711, channel: 0.052, warp: 0.62 });
    mats.coat.map = mats._coatTextures.map;
    mats.coat.bumpMap = mats._coatTextures.bump;
    mats.coat.needsUpdate = true;
    if (old && old.map) { old.map.dispose(); old.bump.dispose(); }
    if (terrain) terrain.setTextureSize(Math.round(size * 0.75));
  }

  /* ----------------------------------------------------------- controls ---- */
  function setGait(name) {
    params.gait = name;
    GIR.Gait.setGait(state, name, params.speed === undefined ? undefined : params.speed);
    if (params.speed === undefined) {
      params.speed = state.gait.speed;
      el.speed.value = String(params.speed);
    }
    el.speedV.textContent = GIR.fmt(state.v, 2) + ' m/s';
    el.gaitLab.textContent = state.gait.label +
      '  ·  ' + GIR.fmt(state.stride, 2) + ' m stride, duty ' + GIR.fmt(state.duty, 2) +
      ', ' + GIR.fmt(state.f, 2) + ' Hz';
  }
  function setSpeed(v) {
    params.speed = v;
    state.speed = v;
    GIR.Gait.resize(state);
    el.speed.value = String(v);
    el.speedV.textContent = GIR.fmt(v, 2) + ' m/s';
    if (v < 0.02) { state.gait = GIR.Gait.gaits.stand; }
    else if (params.gait !== 'stand') { state.gait = GIR.Gait.gaits[params.gait]; }
    el.gaitLab.textContent = state.gait.label +
      '  ·  ' + GIR.fmt(state.stride, 2) + ' m stride, duty ' + GIR.fmt(state.duty, 2) +
      ', ' + GIR.fmt(state.f, 2) + ' Hz';
  }
  function togglePause() {
    params.paused = !params.paused;
    el.btnPause.classList.toggle('on', params.paused);
    el.btnPause.textContent = params.paused ? '▶ walk' : '⏸ pause';
  }
  function toggleSlow() {
    params.slowmo = !params.slowmo;
    params.timeScale = params.slowmo ? 0.25 : 1;
    el.btnSlow.classList.toggle('on', params.slowmo);
  }
  function toggleShadow() {
    params.shadow = !params.shadow;
    renderer.shadowMap.enabled = params.shadow;
    sun.castShadow = params.shadow;
    scene.traverse(function (o) { if (o.isMesh && o.material) o.material.needsUpdate = true; });
    el.btnShadow.classList.toggle('on', params.shadow);
  }
  function toggleTerrain() {
    params.terrain = !params.terrain;
    terrain.group.visible = params.terrain;
    el.btnTerrain.classList.toggle('on', params.terrain);
  }
  function toggleWire() {
    params.wire = !params.wire;
    setWireframe(params.wire);
    el.btnWire.classList.toggle('on', params.wire);
  }
  function toggleAuto() {
    params.autoOrbit = !params.autoOrbit;
    camRig.state.auto = params.autoOrbit;
    el.btnAuto.classList.toggle('on', params.autoOrbit);
  }

  function dumpToLog() {
    var d = window.__diag();
    el.log.textContent = JSON.stringify(d.hooves, null, 1);
  }

  /* ------------------------------------------------------------- keys ------ */
  var KEYCAM = ['side', 'quarter', 'front', 'rear', 'low', 'hero', 'head', 'hooves', 'top', 'wide'];
  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    var k = e.key;
    if (k === ' ') { togglePause(); e.preventDefault(); }
    else if (k === 'g') {
      var i = GIR.Gait.order.indexOf(params.gait);
      params.gait = GIR.Gait.order[(i + 1) % GIR.Gait.order.length];
      el.gaitSel.value = params.gait; setGait(params.gait);
    }
    else if (k === 's') toggleSlow();
    else if (k === 'w') toggleWire();
    else if (k === 't') toggleTerrain();
    else if (k === 'h') { el.hud.classList.toggle('hidden'); el.panel.classList.toggle('hidden'); }
    else if (k === 'x') toggleShadow();
    else if (k === 'a') toggleAuto();
    else if (k === 'r') { state.t = 0; state.cycle = 0; state.belt = 0; }
    else if (k === '+' || k === ']') setSpeed(Math.min(2.6, params.speed + 0.1));
    else if (k === '-' || k === '[') setSpeed(Math.max(0, params.speed - 0.1));
    else if (/^[0-9]$/.test(k)) {
      var p = KEYCAM[parseInt(k, 10)];
      if (p) { camRig.setPreset(p); setActiveCam(p); }
    }
  });

  /* -------------------------------------------------------------- diag ---- */
  var mats;
  function diag() {
    var bb = GIR.Giraffe.bodyBounds(rig);
    var info = renderer.info;
    return {
      ready: app.ready,
      frame: app.frame,
      simTime: +app.simTime.toFixed(2),
      gait: state.gaitName,
      speed: +state.v.toFixed(3),
      cycle: +GIR.mod1(state.cycle).toFixed(3),
      stride: +state.stride.toFixed(3),
      duty: +state.duty.toFixed(3),
      freq: +state.f.toFixed(3),
      belt: +state.belt.toFixed(2),
      fps: +GIR.Stats.fps.toFixed(1),
      ms: +GIR.Stats.avgMs.toFixed(2),
      bounds: {
        min: [+bb.min.x.toFixed(3), +bb.min.y.toFixed(3), +bb.min.z.toFixed(3)],
        max: [+bb.max.x.toFixed(3), +bb.max.y.toFixed(3), +bb.max.z.toFixed(3)]
      },
      measures: rig.measures,
      slide: +state.debug.slideMax.toFixed(4),
      ext: +state.debug.reachMax.toFixed(3),
      over: +state.debug.overMax.toFixed(3),
      err: +state.debug.errMax.toFixed(4),
      hoofFloor: +state.debug.hoofYMin.toFixed(4),
      hooves: GIR.Gait.hoofReport(state),
      cam: camRig ? camRig.info() : null,
      draw: {
        tris: info.render.triangles, calls: info.render.calls,
        geometries: info.memory.geometries, textures: info.memory.textures,
        programs: info.programs ? info.programs.length : -1
      },
      quality: params.quality, texSize: qv.tex,
      shadows: renderer.shadowMap.enabled,
      errors: app.errors.slice(0, 8)
    };
  }
  window.__diag = diag;

  /* --------------------------------------------------------------- main ---- */
  async function main() {
    if (!window.THREE) throw new Error('three.min.js failed to load');
    /* author everything with CSS-style hex colours: convert to linear so the
       sRGB output pass puts them back where they belong */
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    await step('renderer');
    var canvas = $('view');
    makeRenderer(canvas);
    scene = app.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd6c3a2, 40, 340);
    camera = app.camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 900);
    app.renderer = renderer;

    await step('coat + skin textures');
    mats = app.mats = makeMaterials();

    await step('terrain');
    terrain = app.terrain = GIR.Terrain.create(renderer, mats, {
      texSize: Math.round(qv.tex * 0.75), quality: qv.grass
    });
    scene.add(terrain.group);

    await step('giraffe');
    rig = app.rig = GIR.Giraffe.build(mats, {
      seg: qv.seg, segLeg: qv.segLeg, segHead: qv.segHead,
      torsoRings: qv.torsoRings, neckRings: qv.neckRings, lashes: qv.grass > 0
    });
    rig.root.name = 'giraffe';
    scene.add(rig.root);
    app.skeleton = GIR.Giraffe.skeletonSummary(rig);

    makeLights();
    buildShadowRig();

    await step('gait');
    state = app.state = GIR.Gait.create(rig, params.gait, { speed: params.speed });
    if (params.speed === undefined) params.speed = state.gait.speed;
    state.speed = params.speed;
    GIR.Gait.resize(state);

    camRig = app.camRig = GIR.CameraRig.create(camera, canvas, { preset: params.preset, auto: params.autoOrbit });

    wireUI();
    setActiveCam(params.preset);
    el.speed.value = String(params.speed);
    el.speedV.textContent = GIR.fmt(state.v, 2) + ' m/s';
    el.gaitLab.textContent = state.gait.label +
      '  ·  ' + GIR.fmt(state.stride, 2) + ' m stride, duty ' + GIR.fmt(state.duty, 2) +
      ', ' + GIR.fmt(state.f, 2) + ' Hz';
    el.btnPause.classList.toggle('on', params.paused);
    el.btnSlow.classList.toggle('on', params.slowmo);
    el.btnShadow.classList.toggle('on', params.shadow);
    el.btnTerrain.classList.toggle('on', params.terrain);
    el.btnAuto.classList.toggle('on', params.autoOrbit);
    el.btnWire.classList.toggle('on', params.wire);

    /* deterministic starting pose */
    if (params.time) {
      state.t = params.time;
      state.cycle = GIR.mod1(params.time * state.f);
      state.belt = params.time * state.v;
      GIR.Gait.update(rig, state, 0);
    } else {
      GIR.Gait.update(rig, state, 0);
    }

    window.addEventListener('resize', onResize);
    onResize();

    if (boot) boot.style.display = 'none';
    document.body.classList.add('live');
    app.ready = true;
    loop(performance.now());
  }

  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  var last = 0, acc = 0, hudAcc = 0;
  var SUBSTEP = 1 / 120;
  function loop(now) {
    requestAnimationFrame(loop);
    var dtRaw = last ? (now - last) / 1000 : 0.016;
    last = now;
    var dt = Math.min(0.05, dtRaw) * params.timeScale;
    var t0 = performance.now();

    if (!params.paused) {
      acc += dt;
      var guard = 0;
      while (acc >= SUBSTEP && guard++ < 12) {
        GIR.Gait.update(rig, state, SUBSTEP);
        acc -= SUBSTEP;
        app.simTime += SUBSTEP;
      }
      if (guard >= 12) acc = 0;
    }

    terrain.update(dt, state.belt, state.v);
    camRig.update(dtRaw);
    renderer.render(scene, camera);

    GIR.Stats.tick(performance.now() - t0);
    app.frame++;
    hudAcc += dtRaw;
    if (hudAcc > 0.2) { hudAcc = 0; updateHUD(); }
  }

  function updateHUD() {
    var d = diag();
    el.stats.innerHTML =
      row('gait', state.gait.label.split('—')[0].trim()) +
      row('speed', GIR.fmt(d.speed, 2) + ' m/s') +
      row('stride', GIR.fmt(d.stride, 2) + ' m · duty ' + GIR.fmt(d.duty, 2)) +
      row('cycle', GIR.fmt(d.freq, 2) + ' Hz · φ ' + GIR.fmt(d.cycle, 2)) +
      row('withers', GIR.fmt(d.measures.withersHeight, 2) + ' m') +
      row('height', GIR.fmt(d.measures.totalHeight, 2) + ' m') +
      row('length', GIR.fmt(d.measures.bodyLength, 2) + ' m') +
      row('slide', GIR.fmt(d.slide, 4) + ' m') +
      row('reach', GIR.fmt(d.reach, 3)) +
      row('fps', GIR.fmt(GIR.Stats.fps, 0) + ' (' + GIR.fmt(GIR.Stats.avgMs, 1) + ' ms)') +
      row('tris', d.draw.tris.toLocaleString() + ' · ' + d.draw.calls + ' calls') +
      row('dist', d.cam ? GIR.fmt(d.cam.dist, 1) + ' m' : '');
    if (el.diagram && el.diagram.getContext) {
      GIR.Gait.gaitDiagram(state, el.diagram.getContext('2d'), el.diagram.width, el.diagram.height);
    }
    if (app.errors.length) {
      el.log.textContent = app.errors.join('\n');
      el.log.style.display = 'block';
    }
  }
  function row(k, v) {
    return '<div class="kv"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  /* expose a few handles for the console */
  app.setGait = setGait; app.setSpeed = setSpeed; app.togglePause = togglePause;
  app.dump = function (w, dir) { return window.__girDump(w || 104, { dir: dir || 'side' }); };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { main().catch(fail); });
  } else {
    main().catch(fail);
  }
  function fail(err) {
    app.errors.push('fatal: ' + (err && err.message ? err.message : err));
    if (boot) {
      boot.style.display = 'block';
      boot.textContent = 'FAILED: ' + (err && err.stack ? err.stack : err);
    }
    console.error(err);
    window.__diag = function () { return { ready: false, errors: app.errors, logs: app.logs }; };
  }

})(window.GIR = window.GIR || {});
