/* Scene assembly, camera rig, lighting, controls, main loop. */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  var V3 = THREE.Vector3;

  var renderer, scene, camera, clock, rig, model, grass, sky, ground, sun, sunTarget;
  var state = {
    speed: 1.10, paused: false, camMode: 0, showSkel: false,
    orbit: 0.0, orbitTarget: 0.0, elev: 0.075, dist: 6.6, distTarget: 6.6,
    auto: true, turn: 0, heading: 0, headTurn: 0, headPitch: 0, neckPitch: 0,
    look: 0
  };
  var giraffeRoot = new THREE.Group();
  var heightFn = function () { return 0; };
  var fpsEl, infoEl;

  function init() {
    var canvas = document.getElementById('c');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.physicallyCorrectLights = false;

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xc6b795, 0.0062);

    camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 900);
    camera.position.set(7, 3.4, 7.5);

    sky = global.Env.buildSky(scene, renderer);
    ground = global.Env.buildGround(scene);

    // sample the real deformed ground for placement
    (function () {
      var noise = new global.Noise.ValueNoise2D(77);
      heightFn = function (x, z) {
        var r = Math.sqrt(x * x + z * z);
        var mask = THREE.MathUtils.smoothstep(r, 8, 48);
        var h = noise.fbm(x * 0.012, z * 0.012, 4) * 3.4 + noise.fbm(x * 0.06, z * 0.06, 3) * 0.45;
        return h * mask + noise.fbm(x * 0.5, z * 0.5, 2) * 0.012;
      };
    })();

    grass = global.Env.buildGrass(scene, 26000, heightFn);
    global.Env.buildScatter(scene, heightFn);

    // ---------------- lighting ----------------
    sun = new THREE.DirectionalLight(0xfff1dc, 1.65);
    sun.position.set(9, 13, -11);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var d = 16;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.022;
    scene.add(sun);
    sunTarget = new THREE.Object3D();
    scene.add(sunTarget);
    sun.target = sunTarget;

    var hemi = new THREE.HemisphereLight(0x8fb6e4, 0x6d5c3c, 0.42);
    scene.add(hemi);
    var fill = new THREE.DirectionalLight(0xbfd6f0, 0.20);
    fill.position.set(-8, 5, 9);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffd9a8, 0.30);
    rim.position.set(-3, 2.2, -12);
    scene.add(rim);

    // ---------------- giraffe ----------------
    model = global.Giraffe.build({});
    giraffeRoot.add(model.group);
    scene.add(giraffeRoot);
    rig = new global.Rig.Rig(model);

    // skeleton debug helper
    var helper = new THREE.SkeletonHelper(model.rootBone);
    helper.material.linewidth = 2;
    helper.visible = false;
    scene.add(helper);
    state.helper = helper;

    clock = new THREE.Clock();
    fpsEl = document.getElementById('fps');
    infoEl = document.getElementById('info');

    global.__state = state; global.__rig = rig; global.__model = model;
    global.__three = { renderer: renderer, scene: scene, camera: camera };

    bindUI();
    window.addEventListener('resize', onResize);
    onResize();
    animate();
    var ld = document.getElementById('loading');
    if (ld) ld.style.display = 'none';
  }

  // ------------------------------------------------------------- controls
  function bindUI() {
    var canvas = renderer.domElement;
    var dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', function (e) {
      dragging = true; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', function (e) { dragging = false; });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      state.orbitTarget -= (e.clientX - lx) * 0.006;
      state.elev = THREE.MathUtils.clamp(state.elev - (e.clientY - ly) * 0.004, -0.22, 0.95);
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('wheel', function (e) {
      state.distTarget = THREE.MathUtils.clamp(state.distTarget * (1 + Math.sign(e.deltaY) * 0.09), 2.2, 42);
      e.preventDefault();
    }, { passive: false });

    var keys = {};
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Space') { state.paused = !state.paused; e.preventDefault(); }
      if (e.code === 'KeyC') { state.camMode = (state.camMode + 1) % 5; updateInfo(); }
      if (e.code === 'KeyK') { state.showSkel = !state.showSkel; state.helper.visible = state.showSkel; }
      if (e.code === 'KeyH') { var p = document.getElementById('panel'); p.classList.toggle('hidden'); }
      if (e.code === 'Digit1') setSpeed(0);
      if (e.code === 'Digit2') setSpeed(0.75);
      if (e.code === 'Digit3') setSpeed(1.15);
      if (e.code === 'Digit4') setSpeed(1.9);
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    state.keys = keys;

    var sp = document.getElementById('speed');
    sp.addEventListener('input', function () { setSpeed(parseFloat(sp.value)); });
    state.speedSlider = sp;
    document.getElementById('cam').addEventListener('click', function () {
      state.camMode = (state.camMode + 1) % 5; updateInfo();
    });
    document.getElementById('skel').addEventListener('click', function () {
      state.showSkel = !state.showSkel; state.helper.visible = state.showSkel;
    });
    document.getElementById('pause').addEventListener('click', function () { state.paused = !state.paused; });
  }

  function setSpeed(v) {
    state.speed = v;
    if (state.speedSlider) state.speedSlider.value = v;
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- subject bounds in world space, used to frame the follow camera ---
  // Bone.matrixWorld is already in world space (the skeleton root is a child
  // of giraffeRoot), so no extra localToWorld conversion is needed.
  function bonePos(name, out) {
    return out.setFromMatrixPosition(model.byName[name].matrixWorld);
  }
  function subjectHeight() {
    return Math.max(2.0, bonePos('headTip', new V3()).y - giraffeRoot.position.y);
  }
  function subjectCentre() {
    var head = bonePos('headTip', new V3());
    var tail = bonePos('tail2', new V3());
    var c = new V3().addVectors(head, tail).multiplyScalar(0.5);
    c.y = giraffeRoot.position.y + subjectHeight() * 0.52;
    return c;
  }

  var CAM_NAMES = ['Follow (3/4)', 'Side profile', 'Front', 'Low hero', 'Head close-up'];
  function updateInfo() {
    if (infoEl) infoEl.textContent = CAM_NAMES[state.camMode];
  }

  // --------------------------------------------------------------- camera
  var camPos = new V3(8, 3.2, 8), camLook = new V3(0, 2.6, 0);
  function updateCamera(dt, bodyPos, bodyYaw) {
    state.orbit += (state.orbitTarget - state.orbit) * Math.min(1, dt * 8);
    state.dist += (state.distTarget - state.dist) * Math.min(1, dt * 5);

    var want = new V3(), look = new V3();
    var m = state.camMode;
    var fwd = new V3(Math.sin(bodyYaw), 0, Math.cos(bodyYaw));
    var right = new V3(Math.cos(bodyYaw), 0, -Math.sin(bodyYaw));

    if (m === 0) {
      // Three-quarter follow framed from the animal's ACTUAL extent: aim at the
      // middle of the head..ground span and pick a distance that fits that span
      // in the vertical FOV, so the giraffe can never drift out of shot.
      var ctr = subjectCentre();
      var a = state.orbit + 1.00;
      var need = (subjectHeight() * 0.72) / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      var dh = Math.max(state.dist, need);
      want.copy(ctr).add(new V3(Math.sin(a + bodyYaw) * dh, 0, Math.cos(a + bodyYaw) * dh));
      want.y = ctr.y + dh * state.elev;
      look.copy(ctr);
    } else if (m === 1) {
      want.copy(bodyPos).addScaledVector(right, state.dist * 0.95).addScaledVector(fwd, 0.1);
      want.y = bodyPos.y - 0.10 + state.dist * state.elev * 1.6;
      look.copy(bodyPos); look.y = bodyPos.y + 0.55;
    } else if (m === 2) {
      want.copy(bodyPos).addScaledVector(fwd, state.dist * 0.9).addScaledVector(right, state.dist * 0.18);
      want.y = bodyPos.y + 0.9 + state.dist * state.elev;
      look.copy(bodyPos); look.y = bodyPos.y + 0.75;
    } else if (m === 3) {
      want.copy(bodyPos).addScaledVector(fwd, state.dist * 0.55).addScaledVector(right, state.dist * 0.62);
      want.y = heightFn(want.x, want.z) + 0.45;
      look.copy(bodyPos); look.y = bodyPos.y + 0.9;
      look.addScaledVector(fwd, 0.4);
    } else {
      var hb = model.byName['headBase'];
      var hp = new V3().setFromMatrixPosition(hb.matrixWorld);
      var hf = fwd.clone().multiplyScalar(1.0).add(right.clone().multiplyScalar(1.25));
      want.copy(hp).add(hf.setLength(Math.max(1.3, state.dist * 0.30)));
      want.y = hp.y + 0.20 + state.dist * state.elev * 0.5;
      look.copy(hp).addScaledVector(fwd, 0.25);
    }

    if (state.fixedCam) {
      camera.position.fromArray(state.fixedCam.pos);
      camera.lookAt(new V3().fromArray(state.fixedCam.look));
      camPos.copy(camera.position); camLook.fromArray(state.fixedCam.look);
      return;
    }
    // Position lags gently (smooth dolly) but the aim point tracks quickly, so
    // the animal stays centred instead of drifting toward frame edge.
    var k = state.snapCam ? 1 : (1 - Math.pow(0.00005, dt));
    state.snapCam = false;
    camPos.lerp(want, k);
    camLook.lerp(look, state.snapCam ? 1 : Math.min(1, 1 - Math.pow(0.000001, dt)));
    // Re-centre: after smoothing, nudge the camera sideways so the aim point
    // really is in the middle of frame (pure position lerping leaves the
    // subject drifting toward an edge while the animal turns).
    if (!state.fixedCam) {
      var toLook = new V3().subVectors(camLook, camPos);
      var flat = new V3(toLook.x, 0, toLook.z);
      var wantFlat = new V3().subVectors(look, want);
      wantFlat.y = 0;
      if (flat.lengthSq() > 1e-6 && wantFlat.lengthSq() > 1e-6) {
        flat.normalize(); wantFlat.normalize();
        var dAng = Math.atan2(
          flat.x * wantFlat.z - flat.z * wantFlat.x,
          flat.x * wantFlat.x + flat.z * wantFlat.z);
        var rot = Math.min(1, dt * 2.6) * dAng;
        var rel = new V3().subVectors(camPos, camLook);
        rel.applyAxisAngle(new V3(0, 1, 0), -rot);
        camPos.copy(camLook).add(rel);
      }
    }
    if (k === 1) { camPos.copy(want); camLook.copy(look); }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  // ----------------------------------------------------------------- loop
  var acc = 0, frames = 0, fpsT = 0;
  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var now = performance.now() * 0.001;

    // keyboard steering / head look
    var K = state.keys || {};
    var turnIn = (K['KeyA'] || K['ArrowLeft'] ? 1 : 0) - (K['KeyD'] || K['ArrowRight'] ? 1 : 0);
    var spIn = (K['KeyW'] || K['ArrowUp'] ? 1 : 0) - (K['KeyS'] || K['ArrowDown'] ? 1 : 0);
    if (spIn) setSpeed(THREE.MathUtils.clamp(state.speed + spIn * dt * 1.1, 0, 2.6));
    state.turn += (turnIn * 0.55 - state.turn) * Math.min(1, dt * 3);

    var effDt = state.paused ? 0 : dt;

    // meander: slow heading drift when not steered
    var wander = Math.sin(now * 0.17) * 0.09 + Math.sin(now * 0.063 + 1.3) * 0.06;
    var turnRate = state.turn + (turnIn === 0 ? wander : 0);
    state.heading += turnRate * effDt * (state.speed > 0.05 ? 1 : 0.15);

    // adapt gait to speed
    var sp = state.speed;
    // A giraffe's walking stride is long: ~1.2 m at an amble, >2.2 m striding.
    var stepLen = THREE.MathUtils.clamp(1.05 + sp * 0.62, 1.00, 2.45);
    var duty = THREE.MathUtils.clamp(0.70 - sp * 0.062, 0.55, 0.74);
    var stepH = THREE.MathUtils.clamp(0.13 + sp * 0.115, 0.11, 0.36);

    // gentle, life-like head motion
    var hn = Math.sin(now * 0.31) * 0.5 + Math.sin(now * 0.17 + 2.0) * 0.5;
    state.headTurn += (hn * 0.19 - turnRate * 0.55 - state.headTurn) * Math.min(1, dt * 1.2);
    state.headPitch += ((Math.sin(now * 0.23 + 0.7) * 0.07) - state.headPitch) * Math.min(1, dt * 1.1);

    var pose = rig.update(effDt, {
      speed: sp, stepLen: stepLen, duty: duty, stepHeight: stepH,
      bodyBob: 0.012 + sp * 0.020, bodySway: 0.016 + sp * 0.016,
      neckSwing: 0.020 + sp * 0.040, tailSwing: 0.55 + sp * 0.55,
      headTurn: state.headTurn, headPitch: state.headPitch,
      neckPitch: -0.012 + Math.sin(now * 0.12) * 0.02
    });

    // place the giraffe in the world
    if (state.freeze) {
      giraffeRoot.position.set(0, 0, 0);
      giraffeRoot.rotation.y = state.heading;
      if (state.lockPhase !== undefined) rig.t = state.lockPhase;
      giraffeRoot.updateMatrixWorld(true);
      var sb0 = model.byName['spineB'];
      var bp0 = new V3().setFromMatrixPosition(sb0.matrixWorld);
      updateCamera(dt, bp0, state.heading);
      sunTarget.position.set(0, 2.5, 0);
      sun.position.set(9, 14, -11);
      if (grass) grass.mat.userData.u.uTime.value = now;
      sky.position.copy(camera.position);
      renderer.render(scene, camera);
      return;
    }
    giraffeRoot.rotation.y = state.heading;
    var dir = new V3(Math.sin(state.heading), 0, Math.cos(state.heading));
    giraffeRoot.position.addScaledVector(dir, sp * effDt);
    // keep it inside the nice flat area
    var pr = Math.hypot(giraffeRoot.position.x, giraffeRoot.position.z);
    if (pr > 26) {
      var toCenter = Math.atan2(-giraffeRoot.position.x, -giraffeRoot.position.z);
      var diff = ((toCenter - state.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      state.heading += diff * Math.min(1, dt * 0.9);
    }
    giraffeRoot.position.y = heightFn(giraffeRoot.position.x, giraffeRoot.position.z);

    // body world position for the camera (mid-torso)
    var sb = model.byName['spineB'];
    var bodyPos = new V3().setFromMatrixPosition(sb.matrixWorld);

    updateCamera(dt, bodyPos, state.heading);

    // sun follows so shadows always resolve
    sunTarget.position.copy(bodyPos);
    sun.position.copy(bodyPos).add(new V3(9, 14, -11));
    sun.shadow.camera.updateProjectionMatrix();

    if (grass) grass.mat.userData.u.uTime.value = now;
    sky.position.copy(camera.position);

    renderer.render(scene, camera);

    frames++;
    if (now - fpsT > 0.5) {
      if (fpsEl) fpsEl.textContent = Math.round(frames / (now - fpsT)) + ' fps';
      frames = 0; fpsT = now;
    }
  }

  global.addEventListener('DOMContentLoaded', function () {
    try { init(); updateInfo(); }
    catch (e) {
      var ld = document.getElementById('loading');
      if (ld) { ld.textContent = 'Error: ' + e.message; ld.style.color = '#f66'; }
      throw e;
    }
  });
})(window);
