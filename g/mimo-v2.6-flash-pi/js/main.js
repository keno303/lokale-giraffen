'use strict';
(function () {

  const params = new URLSearchParams(location.search);

  function init() {
    const canvas = document.getElementById('scene');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      const l = document.getElementById('loading');
      l.innerHTML = '<span>WebGL is not available in this browser &mdash; the giraffe cannot be rendered.</span>';
      l.classList.remove('done');
      console.error(err);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd8d0b2);

    const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1200);
    camera.position.set(16, 5, 14);

    const pathR = 26;
    const scenery = SCENERY.build(scene, { pathR });
    scene.fog = new THREE.Fog(0xdad0ae, 95, 340);

    const rig = GIRAFFE.build();
    const anim = new GiraffeAnimator(rig);
    anim.pathR = pathR;
    scene.add(anim.root);

    const cam = new OrbitCam(camera, canvas);
    cam.colliders = scenery.colliders;
    const tmp = new THREE.Vector3();
    const heading = new THREE.Vector3();
    cam.followFn = (useHead) => {
      const yaw = anim.root.rotation.y;
      heading.set(Math.cos(yaw), 0, -Math.sin(yaw));
      if (useHead) tmp.set(2.45, 4.72, 0);
      else tmp.set(0.30, 0, 0);
      tmp.applyQuaternion(anim.root.quaternion).add(anim.root.position);
      if (!useHead) tmp.y += 2.9;
      return tmp;
    };
    cam.setPreset('side', heading);
    // snap the camera onto the start of the walk
    cam.theta = cam.goalTheta; cam.phi = cam.goalPhi; cam.radius = cam.goalRadius;
    cam.target.copy(cam.goalTarget);

    /* ---------------- UI ---------------- */
    const speedEl = document.getElementById('speed');
    const speedVal = document.getElementById('speedVal');
    const fpsEl = document.getElementById('fps');
    const gaitEl = document.getElementById('gait');
    const pauseEl = document.getElementById('pauseState');
    const revEl = document.getElementById('rev');
    revEl.textContent = THREE.REVISION;
    let paused = false;

    const setSpeed = (v) => {
      v = U.clamp(v, 0, 2.6);
      anim.setSpeed(v);
      speedEl.value = v;
      speedVal.textContent = v.toFixed(2) + ' m/s';
    };
    speedEl.addEventListener('input', () => setSpeed(parseFloat(speedEl.value)));
    setSpeed(1.4);

    document.querySelectorAll('button[data-view]').forEach(b => {
      b.addEventListener('click', () => setView(b.dataset.view));
    });
    const orbitBtn = document.getElementById('orbitBtn');
    orbitBtn.addEventListener('click', () => {
      cam.autoRotate = !cam.autoRotate;
      orbitBtn.classList.toggle('on', cam.autoRotate);
    });

    function setView(name) {
      const yaw = anim.root.rotation.y;
      heading.set(Math.cos(yaw), 0, -Math.sin(yaw));
      cam.useHead = false;
      cam.setPreset(name, heading);
      cam.followLerp = name === 'head' ? 3.0 : 6.0;
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === ' ') { paused = !paused; pauseEl.textContent = paused ? 'paused' : ''; e.preventDefault(); }
      else if (e.key === 'ArrowRight') setSpeed(anim.speed + 0.1);
      else if (e.key === 'ArrowLeft') setSpeed(anim.speed - 0.1);
      else if (e.key === 'o' || e.key === 'O') orbitBtn.click();
      else if (e.key >= '1' && e.key <= '6') {
        setView(['side', 'front34', 'head', 'rear', 'wide', 'low'][parseInt(e.key, 10) - 1]);
      }
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    });

    /* ---------------- loop ---------------- */
    let last = performance.now();
    let frames = 0, fpsT = 0;
    function frame(now) {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.06) dt = 0.06;

      if (!paused) anim.update(dt);
      scenery.updateLight(anim.root.position);
      cam.update(dt);
      renderer.render(scene, camera);

      frames++; fpsT += dt;
      if (fpsT > 0.5) {
        fpsEl.textContent = Math.round(frames / fpsT) + ' fps';
        gaitEl.textContent = 'cycle ' + anim.cycleTime().toFixed(2) + 's · stride ' +
          anim.stanceTravel.toFixed(2) + 'm';
        frames = 0; fpsT = 0;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    document.getElementById('loading').classList.add('done');
    window.__giraffe = { THREE, scene, camera, renderer, rig, anim, cam, setView, setSpeed };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
