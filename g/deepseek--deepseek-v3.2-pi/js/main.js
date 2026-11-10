/* ---------------------------------------------------------------------------
 * main.js — renderer, scene assembly, camera rig, UI, animation loop.
 * ------------------------------------------------------------------------- */
(function () {
  let renderer, scene, camera, world, giraffe, clock;
  const state = {
    playing: true,
    speed: 1.35,
    gaitRate: 1.0,
    strideScale: 1.0,
    neckPose: 0,
    heading: 0,
    headingTarget: 0,
    follow: true,
    autoOrbit: false,
    quality: 2048,
    camDist: 13.5,
    camAz: Math.PI / 2,     // side view
    camEl: 0.22,
    camTarget: new THREE.Vector3(0, 2.8, 0),
  };
  let tmp = new THREE.Vector3();

  /* ------------------------------------------------------------ wind mats */
  function windMaterial(opts) {
    opts = opts || {};
    const m = new THREE.MeshStandardMaterial({
      map: opts.map || null,
      color: opts.color !== undefined ? opts.color : 0xffffff,
      alphaTest: opts.alphaTest || 0,
      transparent: !!opts.transparent,
      side: opts.side || THREE.DoubleSide,
      roughness: opts.roughness !== undefined ? opts.roughness : 0.9,
      metalness: 0,
      alphaMap: opts.alphaMap || null,
    });
    m.windStrength = opts.wind !== undefined ? opts.wind : 0.06;
    m.onBeforeCompile = function (shader) {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWind = { value: m.windStrength };
      shader.vertexShader = 'uniform float uTime; uniform float uWind;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', [
        'vec3 transformed = vec3( position );',
        '{',
        '  #ifdef USE_INSTANCING',
        '    vec4 lp = instanceMatrix * vec4(position, 1.0);',
        '  #else',
        '    vec4 lp = vec4(position, 1.0);',
        '  #endif',
        '  vec3 wp = (modelMatrix * lp).xyz;',
        '  float ph = wp.x * 0.42 + wp.z * 0.33;',
        '  float amt = pow(max(uv.y, 0.0), 1.7) * uWind;',
        '  float s = sin(uTime * 1.7 + ph) * 0.62 + sin(uTime * 3.1 + ph * 1.7) * 0.38;',
        '  transformed.x += s * amt;',
        '  transformed.z += s * amt * 0.55;',
        '  transformed.y -= abs(s) * amt * 0.25;',
        '}',
      ].join('\n'));
      m.userData.shader = shader;
    };
    m.customProgramCacheKey = () => 'wind' + (m.windStrength);
    return m;
  }

  function radialSprite(size, stops) {
    const c = U.canvas(size, size), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(s => g.addColorStop(s[0], s[1]));
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* ------------------------------------------------------------- build */
  function build() {
    const host = document.getElementById('stage');
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.25, 1600);
    camera.position.set(0, 4, 14);

    /* ---- textures ---- */
    const status = document.getElementById('status');
    status.textContent = 'growing coat pattern…';
    const coat = T.coat({ size: 1024, cells: 6 });
    status.textContent = 'painting the savanna…';
    const ground = T.ground(512);

    const tex = {
      coat: coat,
      ground: ground,
      eyeMap: T.eye(),
      mane: T.maneCard(),
      tail: T.tailCard(),
      leaf: T.foliageCard(),
      grass: T.grassCard(),
      bark: T.bark(256),
      dustSprite: radialSprite(64, [[0, 'rgba(255,248,232,0.95)'], [0.45, 'rgba(226,206,170,0.5)'], [1, 'rgba(200,180,150,0)']]),
    };
    tex.leafMat = windMaterial({ map: tex.leaf, wind: 0.05, roughness: 0.85 });
    tex.leafMatDry = windMaterial({ map: tex.leaf, color: 0xbfae74, wind: 0.09, roughness: 0.95 });
    tex.grassMat = windMaterial({ map: tex.grass, wind: 0.14, alphaTest: 0.42, roughness: 0.95 });
    tex.bushMat = new THREE.MeshStandardMaterial({ color: 0x6d6a3c, roughness: 0.95 });
    tex.rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8577, roughness: 1.0, metalness: 0, flatShading: true });
    tex.barkMat = new THREE.MeshStandardMaterial({
      map: tex.bark.map, normalMap: tex.bark.normalMap, color: 0xbdb3a2,
      roughness: 0.95, metalness: 0,
    });
    tex.barkMat.map.repeat.set(3, 3);
    tex.barkMat.normalMap.repeat.set(3, 3);

    /* ---- world ---- */
    world = new World(scene, renderer, tex);

    /* ---- giraffe ---- */
    status.textContent = 'assembling the giraffe…';
    const coatTex = {
      map: coat.map, normalMap: coat.normalMap, roughnessMap: coat.roughnessMap,
      eyeMap: tex.eyeMap, mane: tex.mane, tail: tex.tail,
    };
    giraffe = new Giraffe(coatTex);
    scene.add(giraffe.root);
    giraffe.root.position.set(0, 0, 0);

    clock = { last: performance.now() };
    window.__dbg = { scene, camera, renderer, world, giraffe, THREE };
    document.getElementById('collapse').addEventListener('click', () => {
      const b = document.getElementById('panelBody');
      const btn = document.getElementById('collapse');
      const hidden = b.style.display === 'none';
      b.style.display = hidden ? '' : 'none';
      btn.textContent = hidden ? '–' : '+';
    });
    bindUI();
    window.addEventListener('resize', onResize);
    onResize();
    status.textContent = '';
    document.getElementById('loader').style.display = 'none';
    animate();
  }

  /* --------------------------------------------------------- camera rig */
  function updateCamera(dt) {
    // target follows the giraffe's centre of interest
    const g = giraffe.root.position;
    const tgtY = state.targetY === undefined ? 2.75 : state.targetY;
    if (state.follow) {
      state.camTarget.x = U.damp(state.camTarget.x, g.x + 0.2, 3.2, dt);
      state.camTarget.z = U.damp(state.camTarget.z, g.z, 3.2, dt);
    }
    state.camTarget.y = U.damp(state.camTarget.y, tgtY, 3.0, dt);
    if (state.autoOrbit) state.camAz += dt * 0.06;
    const d = state.camDist;
    const ce = Math.cos(state.camEl), se = Math.sin(state.camEl);
    camera.position.set(
      state.camTarget.x + Math.cos(state.camAz) * d * ce,
      state.camTarget.y + d * se + 0.6,
      state.camTarget.z + Math.sin(state.camAz) * d * ce
    );
    camera.lookAt(state.camTarget.x, state.camTarget.y + 0.35, state.camTarget.z);
  }

  /* ------------------------------------------------------------ pointer */
  function bindPointer() {
    const el = renderer.domElement;
    let dragging = false, panning = false, lx = 0, ly = 0, moved = 0;
    const onDown = e => {
      dragging = true; panning = e.button === 2 || e.shiftKey;
      lx = e.clientX; ly = e.clientY;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    };
    const onMove = e => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (panning) {
        state.camDist = U.clamp(state.camDist * (1 + dy * 0.004), 3.5, 60);
        setSlider('dist', state.camDist);
      } else {
        state.camAz -= dx * 0.006;
        state.camEl = U.clamp(state.camEl + dy * 0.004, -0.12, 1.15);
      }
    };
    const onUp = () => { dragging = false; };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('wheel', e => {
      e.preventDefault();
      state.camDist = U.clamp(state.camDist * Math.exp(e.deltaY * 0.0011), 3.5, 60);
      setSlider('dist', state.camDist);
    }, { passive: false });
    // touch: 1 finger orbit, 2 finger zoom
    let pinch = 0;
    el.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        state.camDist = U.clamp(state.camDist * (pinch / d), 3.5, 60);
        pinch = d;
        setSlider('dist', state.camDist);
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ UI */
  function setSlider(id, v) {
    const el = document.getElementById('s-' + id);
    if (el) { el.value = v; const out = el.parentElement.querySelector('.val'); if (out) out.textContent = (+v).toFixed(el.dataset.dec || 2); }
  }

  function bindUI() {
    bindPointer();
    const bind = (id, fn, dec) => {
      const el = document.getElementById('s-' + id);
      if (!el) return;
      const out = el.parentElement.querySelector('.val');
      if (out) { out.textContent = (+el.value).toFixed(dec || 2); out.dataset.k = id; }
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        if (out) out.textContent = v.toFixed(dec || 2);
        fn(v);
      });
      fn(parseFloat(el.value));
    };
    bind('speed', v => { state.speed = v; }, 2);
    bind('rate', v => { state.gaitRate = v; }, 2);
    bind('stride', v => { state.strideScale = v; }, 2);
    bind('neck', v => { state.neckPose = v; }, 2);
    bind('sun', v => { world.setTimeOfDay(v); document.getElementById('tod').textContent =
      v < 0.2 ? 'early morning' : v < 0.45 ? 'morning' : v < 0.7 ? 'midday' : v < 0.9 ? 'afternoon' : 'golden hour'; }, 2);
    bind('dist', v => { state.camDist = v; }, 1);
    bind('expo', v => { renderer.toneMappingExposure = v; }, 2);

    const toggles = {
      'b-play': () => { state.playing = !state.playing; reflectPlay(); },
      'b-turn': () => { state.headingTarget = state.headingTarget === 0 ? Math.PI : 0; },
      'b-follow': () => { state.follow = !state.follow; reflect('b-follow', state.follow); },
      'b-orbit': () => { state.autoOrbit = !state.autoOrbit; reflect('b-orbit', state.autoOrbit); },
      'b-mane': () => { giraffe.mane.forEach(g => g.visible = !g.visible); },
      'b-shadow': () => {
        world.sun.shadow.mapSize.set(state.qNext, state.qNext);
        if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
      },
      'b-shot': () => {
        renderer.render(scene, camera);
        const a = document.createElement('a');
        a.download = 'giraffe.png';
        a.href = renderer.domElement.toDataURL('image/png');
        a.click();
      },
    };
    for (const id in toggles) {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', toggles[id]);
    }
    const q = document.getElementById('s-quality');
    if (q) q.addEventListener('change', () => {
      state.qNext = parseInt(q.value, 10);
      world.sun.shadow.mapSize.set(state.qNext, state.qNext);
      if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
    });
    const presets = {
      'p-side': () => { state.camAz = Math.PI / 2; state.camEl = 0.16; state.camDist = 14; },
      'p-quarter': () => { state.camAz = Math.PI * 0.28; state.camEl = 0.2; state.camDist = 11; },
      'p-head': () => { state.camAz = Math.PI * 0.1; state.camEl = 0.5; state.camDist = 5.2; },
      'p-low': () => { state.camAz = Math.PI / 2; state.camEl = 0.02; state.camDist = 9; },
      'p-front': () => { state.camAz = 0; state.camEl = 0.14; state.camDist = 13; },
      'p-high': () => { state.camAz = Math.PI * 0.62; state.camEl = 0.75; state.camDist = 20; },
    };
    for (const id in presets) {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', () => { presets[id](); setSlider('dist', state.camDist); });
    }
    reflectPlay();

    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { state.playing = !state.playing; reflectPlay(); e.preventDefault(); }
      else if (k === 'f') { state.follow = !state.follow; reflect('b-follow', state.follow); }
      else if (k === 'o') { state.autoOrbit = !state.autoOrbit; reflect('b-orbit', state.autoOrbit); }
      else if (k === 't') { state.headingTarget = state.headingTarget === 0 ? Math.PI : 0; }
      else if (k === 'arrowup') { state.speed = U.clamp(state.speed + 0.1, 0, 3.2); setSlider('speed', state.speed); }
      else if (k === 'arrowdown') { state.speed = U.clamp(state.speed - 0.1, 0, 3.2); setSlider('speed', state.speed); }
    });
  }
  function reflectPlay() {
    const b = document.getElementById('b-play');
    if (b) b.textContent = state.playing ? '⏸ pause (space)' : '▶ walk (space)';
  }
  function reflect(id, on) {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('on', !!on);
  }

  /* ------------------------------------------------------------- loop */
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  let fpsAcc = 0, fpsN = 0, fpsTimer = 0;
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    let dt = (now - clock.last) / 1000;
    clock.last = now;
    dt = U.clamp(dt, 0.0005, 0.05);

    // smooth heading change
    state.heading = U.damp(state.heading, state.headingTarget, 2.0, dt);
    giraffe.root.rotation.y = state.heading;

    // drive the walk
    const effSpeed = state.playing ? state.speed : 0;
    const dir = tmp.set(Math.cos(state.heading), 0, -Math.sin(state.heading));
    giraffe.root.position.addScaledVector(dir, effSpeed * dt);
    giraffe.speed = state.speed;
    giraffe.params = {
      playing: state.playing, strideScale: state.strideScale,
      gaitRate: state.gaitRate, neckPose: state.neckPose,
    };
    if (!state.frozen) giraffe.update(dt);

    // hoof dust
    if (giraffe.footfalls && giraffe.footfalls.length) {
      for (const f of giraffe.footfalls) world.emitDust(f.pos, f.swing);
      giraffe.footfalls.length = 0;
    }

    world.follow(giraffe.root.position);
    world.update(dt, state.playing);

    updateCamera(dt);
    renderer.render(scene, camera);

    fpsTimer += dt; fpsAcc += 1 / dt; fpsN++;
    if (fpsTimer > 0.5) {
      const el = document.getElementById('fps');
      if (el) el.textContent = Math.round(fpsAcc / fpsN) + ' fps';
      const d = document.getElementById('distTravelled');
      if (d) d.textContent = (giraffe.root.position.x / 1000).toFixed(2) + ' km';
      fpsAcc = 0; fpsN = 0; fpsTimer = 0;
    }
  }

  /* ------------------------------------------------------------ boot */
  window.addEventListener('DOMContentLoaded', () => {
    // let the loader paint before we spend a second generating textures
    setTimeout(() => {
      try {
        build();
      } catch (e) {
        document.getElementById('status').textContent = 'ERROR: ' + e.message;
        console.error(e);
        throw e;
      }
    }, 30);
  });

  // expose for debugging / screenshots
  window.__giraffe = () => giraffe;
  window.__state = state;
  window.__setView = (az, el, d, target) => {
    state.camAz = az; state.camEl = el; state.camDist = d;
    if (target) {
      state.follow = false;
      state.camTarget.set(target[0], target[1], target[2]);
      state.targetY = target.length > 3 ? target[3] : target[1];
    } else { state.follow = true; state.targetY = undefined; }
  };
  // hold the current pose (everything else keeps rendering) - handy for
  // screenshots and for eyeballing a single frame of the gait
  window.__freeze = (on) => { state.frozen = !!on; };
})();
