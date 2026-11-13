(function () {
  'use strict';

  const GS = (window.GiraffeSim = window.GiraffeSim || {});

  // Optional procedural WebAudio hoofbeat synthesizer (muted by default; zero external assets)
  function createHoofAudio() {
    let ctx = null;
    let enabled = false;
    let noiseBuf = null;

    function ensureContext() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;
        ctx = new AudioCtx();
        const len = Math.floor(ctx.sampleRate * 0.25);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.045));
        }
      }
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }

    function playStrike(limbKey) {
      if (!enabled || !ctx || !noiseBuf) return;
      const now = ctx.currentTime;
      const isFore = limbKey.startsWith('fore'); // Forelimbs carry ~58% of giraffe's body mass -> deeper thud!

      // 1) Low earthy thump oscillator
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isFore ? 78 : 88, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.085);
      oscGain.gain.setValueAtTime(isFore ? 0.22 : 0.16, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(oscGain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.10);

      // 2) Dry sandy soil crunch filtered noise
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = isFore ? 620 : 760;
      filter.Q.value = 1.4;
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.11, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      src.connect(filter).connect(nGain).connect(ctx.destination);
      src.start(now);
    }

    return {
      toggle() {
        if (!enabled) {
          if (ensureContext()) enabled = true;
        } else {
          enabled = false;
        }
        return enabled;
      },
      isEnabled() {
        return enabled;
      },
      playStrike
    };
  }

  function initApp() {
    const container = document.getElementById('canvas-container');

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      38,
      window.innerWidth / window.innerHeight,
      0.08,
      650
    );

    // 1. Build East African Savannah World
    const world = GS.World.createSavannahWorld(renderer, scene, 'golden');

    // 2. Build Anatomically Sculpted Skinned Giraffe
    const giraffe = GS.Anatomy.createGiraffe({ subspecies: 'reticulated' });
    scene.add(giraffe.group);
    scene.add(giraffe.skeletonHelper);

    // Optional IK joint target debug spheres (hidden unless Skeleton/IK debug enabled)
    const ikDebugGroup = new THREE.Group();
    ikDebugGroup.visible = false;
    scene.add(ikDebugGroup);
    const ikDots = {};
    const dotGeo = new THREE.SphereGeometry(0.032, 10, 8);
    const dotColors = {
      root: 0xffaa00,
      j1: 0x00ddff,
      j2: 0x44ff66,
      fetlock: 0xff44aa,
      hoof: 0xff2222
    };
    ['hindL', 'foreL', 'hindR', 'foreR'].forEach((lk) => {
      ikDots[lk] = {};
      Object.keys(dotColors).forEach((jk) => {
        const m = new THREE.Mesh(
          dotGeo,
          new THREE.MeshBasicMaterial({ color: dotColors[jk], depthTest: false })
        );
        m.renderOrder = 999;
        ikDebugGroup.add(m);
        ikDots[lk][jk] = m;
      });
    });

    const hoofAudio = createHoofAudio();

    // 3. Build Biomechanical Lateral-Sequence Gait Controller
    const gait = new GS.Gait.GiraffeGaitController(giraffe, {
      groundHeightFn: world.groundHeight,
      onHoofStrike: function (limbKey, wx, wy, wz, yaw) {
        world.spawnHoofStrike(limbKey, wx, wy, wz, yaw);
        hoofAudio.playStrike(limbKey);
      }
    });
    gait.applyPose(0.016, false);

    // 4. Tracking Spherical Orbit Camera
    const camCtrl = new GS.Camera.TrackingOrbitCamera(
      camera,
      renderer.domElement,
      world.groundHeight
    );
    camCtrl.setPreset('hero', true);
    camCtrl.update(0.016, gait.worldPos, gait.worldYaw);
    world.update(0.016, 0, gait.worldPos, camera.position);

    // ------------------------------------------------------------------
    // Wire HUD Controls
    // ------------------------------------------------------------------
    const presetButtons = document.querySelectorAll('[data-cam]');
    function highlightPreset(key) {
      presetButtons.forEach((b) => b.classList.toggle('active', b.dataset.cam === key));
    }
    presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        camCtrl.autoTurntable = false;
        const autoBtn = document.getElementById('btn-turntable');
        if (autoBtn) autoBtn.classList.remove('active');
        camCtrl.setPreset(btn.dataset.cam, false);
        highlightPreset(btn.dataset.cam);
      });
    });

    const btnTurntable = document.getElementById('btn-turntable');
    if (btnTurntable) {
      btnTurntable.addEventListener('click', () => {
        camCtrl.autoTurntable = !camCtrl.autoTurntable;
        btnTurntable.classList.toggle('active', camCtrl.autoTurntable);
      });
    }

    const btnPlay = document.getElementById('btn-play');
    const sliderSpeed = document.getElementById('slider-speed');
    const valSpeed = document.getElementById('val-speed');
    const sliderPhase = document.getElementById('slider-phase');
    const valPhase = document.getElementById('val-phase');

    function syncPlayUI() {
      if (!btnPlay) return;
      btnPlay.textContent = gait.paused ? 'Resume Walk' : 'Pause';
      btnPlay.classList.toggle('active', !gait.paused);
    }

    if (btnPlay) {
      btnPlay.addEventListener('click', () => {
        gait.paused = !gait.paused;
        syncPlayUI();
      });
    }

    if (sliderSpeed) {
      sliderSpeed.addEventListener('input', () => {
        const v = parseFloat(sliderSpeed.value);
        gait.speedScale = v;
        if (valSpeed) valSpeed.textContent = v.toFixed(2) + 'x';
      });
    }

    if (sliderPhase) {
      sliderPhase.addEventListener('input', () => {
        gait.paused = true;
        syncPlayUI();
        const p = parseFloat(sliderPhase.value);
        gait.setPhaseDirect(p);
        if (valPhase) valPhase.textContent = Math.round(p * 100) + '%';
      });
    }

    // Subspecies selector
    const coatBtns = document.querySelectorAll('[data-coat]');
    coatBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        giraffe.coatMaterial.setSubspecies(btn.dataset.coat);
        coatBtns.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    // Lighting mood selector
    const moodBtns = document.querySelectorAll('[data-mood]');
    moodBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        world.applyMood(btn.dataset.mood);
        moodBtns.forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    // Skeleton / IK overlay & Sound toggles
    const btnRig = document.getElementById('btn-rig');
    if (btnRig) {
      btnRig.addEventListener('click', () => {
        const vis = !giraffe.skeletonHelper.visible;
        giraffe.skeletonHelper.visible = vis;
        ikDebugGroup.visible = vis;
        btnRig.classList.toggle('active', vis);
      });
    }

    const btnSound = document.getElementById('btn-sound');
    if (btnSound) {
      btnSound.addEventListener('click', () => {
        const on = hoofAudio.toggle();
        btnSound.textContent = on ? 'Audio: On' : 'Audio: Off';
        btnSound.classList.toggle('active', on);
      });
    }

    const hudPanel = document.getElementById('hud-panel');
    const btnToggleHud = document.getElementById('btn-toggle-hud');
    function toggleHud() {
      if (!hudPanel) return;
      const collapsed = hudPanel.classList.toggle('collapsed');
      if (btnToggleHud) btnToggleHud.textContent = collapsed ? 'Controls [H]' : 'Hide [H]';
    }
    if (btnToggleHud) btnToggleHud.addEventListener('click', toggleHud);

    // Keyboard shortcuts
    const presetOrder = ['hero', 'side', 'front', 'low', 'head', 'hooves', 'wide'];
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        gait.paused = !gait.paused;
        syncPlayUI();
      } else if (e.key === 'h' || e.key === 'H') {
        toggleHud();
      } else if (e.key >= '1' && e.key <= '7') {
        const key = presetOrder[parseInt(e.key, 10) - 1];
        if (key) {
          camCtrl.autoTurntable = false;
          if (btnTurntable) btnTurntable.classList.remove('active');
          camCtrl.setPreset(key, false);
          highlightPreset(key);
        }
      }
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Footfall phase indicator DOM bars
    const footDots = {
      hindL: document.getElementById('foot-hl'),
      foreL: document.getElementById('foot-fl'),
      hindR: document.getElementById('foot-hr'),
      foreR: document.getElementById('foot-fr')
    };

    function updateGaitHUD() {
      if (!gait.paused && sliderPhase) {
        sliderPhase.value = gait.phase.toFixed(3);
        if (valPhase) valPhase.textContent = Math.round(gait.phase * 100) + '%';
      }
      for (let i = 0; i < gait.limbDefs.length; i++) {
        const ld = gait.limbDefs[i];
        const el = footDots[ld.key];
        if (!el) continue;
        const lp = (((gait.phase - ld.phaseOffset) % 1) + 1) % 1;
        const stance = lp < gait.dutyFactor;
        el.classList.toggle('stance', stance);
      }

      if (ikDebugGroup.visible) {
        Object.keys(gait.debugTargets).forEach((lk) => {
          const dt = gait.debugTargets[lk];
          const grp = ikDots[lk];
          if (!dt || !grp) return;
          grp.root.position.copy(dt.root);
          grp.j1.position.copy(dt.j1);
          grp.j2.position.copy(dt.j2);
          grp.fetlock.position.copy(dt.fetlock);
          grp.hoof.position.copy(dt.hoof);
        });
      }
    }

    // ------------------------------------------------------------------
    // Main Animation Loop
    // ------------------------------------------------------------------
    const clock = new THREE.Clock();
    let elapsed = 0;

    function animate() {
      requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;

      gait.update(dt);
      camCtrl.update(dt, gait.worldPos, gait.worldYaw);
      world.update(dt, elapsed, gait.worldPos, camera.position);
      updateGaitHUD();

      renderer.render(scene, camera);
    }

    animate();

    // Expose clean inspection API for automated testing & user debugging
    window.GiraffeApp = {
      scene,
      camera,
      renderer,
      giraffe,
      gait,
      world,
      camCtrl,
      renderOnce() {
        camCtrl.update(0.016, gait.worldPos, gait.worldYaw);
        world.update(0.016, elapsed, gait.worldPos, camera.position);
        renderer.render(scene, camera);
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
