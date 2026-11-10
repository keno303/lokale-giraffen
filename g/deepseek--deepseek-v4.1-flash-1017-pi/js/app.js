/* Scene, camera, controls, loop. */
(function (G) {
  'use strict';

  var V = THREE.Vector3;
  var TAU = Math.PI * 2;

  var R = 22;
  var TH0 = 0.06;
  var SPEED = G.GAIT.speed;

  var params = new URLSearchParams(location.search);
  var fixedT = params.has('t') ? parseFloat(params.get('t')) : null;
  var ui = params.get('ui') !== '0';
  var driftOn = params.get('drift') !== '0';
  var startPaused = params.get('pause') === '1';
  var startTime = fixedT !== null ? fixedT : 0.35;

  var errBox = document.getElementById('err');
  function fail(msg) {
    errBox.style.display = 'block';
    errBox.textContent = 'ERROR\n\n' + msg;
    document.title = 'ERR ' + msg;
  }
  window.addEventListener('error', function (e) {
    fail((e.message || 'unknown') + '\n' + (e.error && e.error.stack ? e.error.stack : ''));
  });

  var container = document.getElementById('app');
  var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(G.col(0xd9cbb2), 62, 320);

  var camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 950);

  var world, giraffe;
  try {
    world = new G.World(scene, renderer);
    giraffe = new G.Giraffe();
    scene.add(giraffe.root);
  } catch (err) {
    fail(err.message + '\n' + (err.stack || ''));
    return;
  }

  /* ------------- camera state ------------- */
  var cam = {
    userAz: 0,
    userEl: 0,
    dist: params.has('dist') ? parseFloat(params.get('dist')) : 9.3,
    relAz: (params.has('az') ? parseFloat(params.get('az')) : 71) * Math.PI / 180,
    el: (params.has('el') ? parseFloat(params.get('el')) : 11) * Math.PI / 180,
    targetY: params.has('ty') ? parseFloat(params.get('ty')) : 2.62,
    target: new V(0, 2.6, 0),
    pos: new V(),
    init: false
  };

  var paused = startPaused;
  var simTime = startTime;
  var last = performance.now();
  var frames = 0;

  function pathAt(t) {
    var theta = TH0 + (SPEED / R) * t;
    return {
      theta: theta,
      pos: new V(Math.cos(theta) * R, 0, Math.sin(theta) * R),
      yaw: Math.atan2(-Math.sin(theta), Math.cos(theta))
    };
  }

  function updateWorld(t) {
    var p = pathAt(t);
    giraffe.root.position.copy(p.pos);
    giraffe.root.rotation.y = p.yaw;
    giraffe.update(t + 0.34);
    world.follow(p.pos);
    return p;
  }

  function updateCamera(dt, t, instant) {
    var target = new V(
      giraffe.root.position.x,
      cam.targetY,
      giraffe.root.position.z
    );
    var fwd = new V(0, 0, 1).applyQuaternion(giraffe.root.quaternion);
    target.addScaledVector(fwd, 0.15);

    if (!cam.init || instant) {
      cam.target.copy(target);
    } else {
      var k = 1 - Math.exp(-dt * 5.0);
      cam.target.lerp(target, k);
    }

    var drift = driftOn ? 0.16 * Math.sin(t * 0.061 + 0.7) : 0;
    var az = giraffe.root.rotation.y + cam.relAz + cam.userAz + drift;
    var el = G.clamp(cam.el + cam.userEl, -0.04, 0.9);
    var d = cam.dist;
    var pos = new V(
      cam.target.x + Math.sin(az) * d * Math.cos(el),
      cam.target.y + Math.sin(el) * d + 0.15,
      cam.target.z + Math.cos(az) * d * Math.cos(el)
    );
    if (!cam.init || instant) {
      camera.position.copy(pos);
      cam.init = true;
    } else {
      var k2 = 1 - Math.exp(-dt * 8.0);
      camera.position.lerp(pos, k2);
    }
    camera.lookAt(cam.target.x, cam.target.y - 0.12, cam.target.z);
  }

  /* ------------- controls ------------- */
  var dom = renderer.domElement;
  var dragging = false, lastX = 0, lastY = 0;

  dom.addEventListener('pointerdown', function (e) {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    dom.classList.add('dragging');
    dom.setPointerCapture(e.pointerId);
  });
  dom.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    cam.userAz -= dx * 0.0052;
    cam.userEl = G.clamp(cam.userEl + dy * 0.0035, -0.24, 0.62);
  });
  function endDrag(e) {
    dragging = false;
    dom.classList.remove('dragging');
    if (dom.releasePointerCapture && e && e.pointerId !== undefined) {
      try { dom.releasePointerCapture(e.pointerId); } catch (err) {}
    }
  }
  dom.addEventListener('pointerup', endDrag);
  dom.addEventListener('pointercancel', endDrag);
  dom.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.dist = G.clamp(cam.dist * Math.exp(e.deltaY * 0.00065), 4.2, 30);
  }, { passive: false });
  dom.addEventListener('dblclick', function () {
    cam.userAz = 0; cam.userEl = 0;
    cam.dist = 9.3;
    cam.el = 11 * Math.PI / 180;
  });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      e.preventDefault();
      paused = !paused;
    } else if (e.key === 'r' || e.key === 'R') {
      cam.userAz = 0; cam.userEl = 0; cam.dist = 9.3; cam.el = 11 * Math.PI / 180;
    } else if (e.key === 'h' || e.key === 'H') {
      var hud = document.getElementById('hud');
      hud.classList.toggle('hidden');
    }
  });

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  if (!ui) {
    document.getElementById('hud').style.display = 'none';
    document.getElementById('vignette').style.display = 'none';
  }

  /* ------------- loop ------------- */
  var loader = document.getElementById('loader');
  var loaderHidden = false;

  function frame(now) {
    var dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    if (!paused) simTime += dt;

    updateWorld(simTime);
    updateCamera(dt, simTime, frames < 2);
    renderer.render(scene, camera);

    frames++;
    if (frames === 2) {
      window.__READY = true;
      if (!loaderHidden) {
        loader.classList.add('hidden');
        loaderHidden = true;
        setTimeout(function () { loader.style.display = 'none'; }, 800);
      }
    }
    requestAnimationFrame(frame);
  }

  // initial placement before first frame
  updateWorld(simTime);
  updateCamera(0.016, simTime, true);
  requestAnimationFrame(frame);

  window.__giraffe = giraffe;
  window.__renderer = renderer;
  window.__world = world;
  window.__scene = scene;
  window.__camera = camera;
  window.__cam = cam;
})(window.G);
