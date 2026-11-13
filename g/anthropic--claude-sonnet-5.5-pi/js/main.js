(function () {
  const T = THREE;
  const q = new URLSearchParams(location.search);
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  const scene = new T.Scene();
  // sky gradient dome
  const sky = new T.Mesh(new T.SphereGeometry(400, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y;
      vec3 hor = vec3(0.93,0.82,0.65), mid = vec3(0.55,0.72,0.90), top = vec3(0.22,0.43,0.78);
      vec3 c = mix(hor, mid, smoothstep(0.0,0.25,h)); c = mix(c, top, smoothstep(0.2,0.8,h));
      c = mix(vec3(0.85,0.76,0.60), c, smoothstep(-0.08,0.02,h));
      vec3 sd = normalize(vec3(-0.5,0.45,0.7)); float s = max(dot(normalize(vP),sd),0.0); c += vec3(1.0,0.85,0.55)*pow(s,24.0)*0.35 + vec3(1.0,0.95,0.8)*pow(s,900.0);
      gl_FragColor = vec4(c,1.0); }`
  }));
  scene.add(sky);
  scene.fog = new T.Fog(0xe2cfa6, 40, 190);

  const camera = new T.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 800);
  camera.position.set(-10.5, 2.8, 8.5);
  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.set(0, 2.7, 0); controls.minDistance = 2.5; controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49;

  // lights
  const hemi = new T.HemisphereLight(0xbfd8ff, 0x9a7a4a, 0.75); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffe2b0, 3.0);
  sun.position.set(-12, 16, 14); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 60;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const sunOff = sun.position.clone();

  // ground with procedural texture, scrolling with giraffe
  function noiseTex() {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    x.fillStyle = '#b09256'; x.fillRect(0, 0, 512, 512);
    const id = x.getImageData(0, 0, 512, 512), d = id.data;
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const g = new Float32Array(66 * 66 * 4).map(() => rnd());
    const sm = (a, b, t) => a + (b - a) * (t * t * (3 - 2 * t));
    function vn(px, py, f) { const X = px / 512 * f, Y = py / 512 * f, xi = Math.floor(X) % f, yi = Math.floor(Y) % f, fx = X - Math.floor(X), fy = Y - Math.floor(Y);
      const G = (i, j) => g[((j % f) * 66 + (i % f))]; return sm(sm(G(xi, yi), G(xi + 1, yi), fx), sm(G(xi, yi + 1), G(xi + 1, yi + 1), fx), fy); }
    for (let y = 0; y < 512; y++) for (let xx = 0; xx < 512; xx++) {
      const n = vn(xx, y, 4) * 0.5 + vn(xx, y, 16) * 0.3 + vn(xx, y, 64) * 0.2 + (rnd() - .5) * 0.08;
      const gr = Math.max(0, vn(xx + 100, y + 50, 8) - 0.45) * 2;
      const o = (y * 512 + xx) * 4;
      d[o] = (176 + (n - .5) * 90) * (1 - gr * .35) + gr * 0; d[o + 1] = (146 + (n - .5) * 80) * (1 - gr * .05) + gr * 8; d[o + 2] = (88 + (n - .5) * 60) * (1 - gr * .4); d[o + 3] = 255;
    }
    x.putImageData(id, 0, 0);
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  const gtex = noiseTex(); const GS = 400, TILE = 14; gtex.repeat.set(GS / TILE, GS / TILE);
  const ground = new T.Mesh(new T.PlaneGeometry(GS, GS), new T.MeshStandardMaterial({ map: gtex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // giraffe
  const giraffe = new Giraffe(); scene.add(giraffe.group);
  const world = { z: 0 };

  // ---------- scenery that recycles around the giraffe ----------
  const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const SPAN = 120;
  // grass tufts
  const bladeGeo = (() => { const geos = []; const pos = [], idx = [];
    for (let b = 0; b < 7; b++) { const a = b / 7 * Math.PI * 2 + rnd(), h = 0.25 + rnd() * 0.3, w = 0.025, lean = 0.12 + rnd() * 0.15; const bx = Math.cos(a) * 0.05, bz = Math.sin(a) * 0.05;
      const o = pos.length / 3; pos.push(bx - Math.cos(a + 1.57) * w, 0, bz - Math.sin(a + 1.57) * w, bx + Math.cos(a + 1.57) * w, 0, bz + Math.sin(a + 1.57) * w, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean); idx.push(o, o + 1, o + 2); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; })();
  const NG = 1400;
  const grass = new T.InstancedMesh(bladeGeo, new T.MeshStandardMaterial({ color: 0xa09550, roughness: 1, side: T.DoubleSide }), NG);
  grass.receiveShadow = true; grass.frustumCulled = false; scene.add(grass);
  const gItems = Array.from({ length: NG }, () => ({ x: (rnd() - .5) * SPAN, z: (rnd() - .5) * SPAN, s: 0.6 + rnd() * 1.6, r: rnd() * 6.28 }));
  for (let i = 0; i < NG; i++) grass.setColorAt(i, new T.Color().setHSL(0.12 + rnd() * 0.04, 0.4 + rnd() * 0.2, 0.34 + rnd() * 0.2));

  // acacia trees
  function makeAcacia() {
    const g = new T.Group(); const bark = new T.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
    const leaf = new T.MeshStandardMaterial({ color: 0x6b7a35, roughness: 0.95 });
    const pts = [new T.Vector3(0, 0, 0), new T.Vector3(0.2, 2.2, 0.1), new T.Vector3(-0.15, 4.2, 0), new T.Vector3(0.1, 5.4, 0.1)];
    const trunk = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 16, 0.22, 8), bark); trunk.castShadow = true; g.add(trunk);
    const arms = [[-2.6, 6.0, .4], [2.4, 6.2, -.5], [.3, 6.4, 2.6], [-.5, 6.0, -2.4]];
    for (const a of arms) { const c = new T.CatmullRomCurve3([new T.Vector3(0.1, 4.7, 0.1), new T.Vector3(a[0] * .4, 5.5, a[2] * .4), new T.Vector3(a[0], a[1], a[2])]);
      const m = new T.Mesh(new T.TubeGeometry(c, 8, 0.1, 6), bark); m.castShadow = true; g.add(m);
      for (let k = 0; k < 4; k++) { const s = new T.Mesh(new T.SphereGeometry(1, 10, 8), leaf); s.scale.set(1.9 + rnd(), 0.32 + rnd() * .12, 1.9 + rnd());
        s.position.set(a[0] * (.8 + rnd() * .5) + (rnd() - .5) * 1.2, a[1] + 0.35 + rnd() * .3, a[2] * (.8 + rnd() * .5) + (rnd() - .5) * 1.2); s.castShadow = true; g.add(s); } }
    return g;
  }
  const trees = [];
  for (let i = 0; i < 14; i++) { const t = makeAcacia(); const s = 0.8 + rnd() * 0.8; t.scale.setScalar(s); t.rotation.y = rnd() * 6;
    let x = (rnd() - .5) * SPAN, z = (rnd() - .5) * SPAN; if (Math.abs(x) < 9) x += Math.sign(x || 1) * 12;
    t.position.set(x, 0, z); scene.add(t); trees.push(t); }
  // rocks
  const rocks = []; const rockMat = new T.MeshStandardMaterial({ color: 0x8a7b68, roughness: 1, flatShading: true });
  for (let i = 0; i < 22; i++) { const gm = new T.IcosahedronGeometry(1, 1); const p = gm.attributes.position;
    for (let k = 0; k < p.count; k++) { const f = 0.75 + rnd() * 0.5; p.setXYZ(k, p.getX(k) * f, p.getY(k) * f * .7, p.getZ(k) * f); } gm.computeVertexNormals();
    const r = new T.Mesh(gm, rockMat); r.scale.setScalar(0.25 + rnd() * 0.7); r.castShadow = r.receiveShadow = true;
    let x = (rnd() - .5) * SPAN, z = (rnd() - .5) * SPAN; if (Math.abs(x) < 4) x += 8; r.position.set(x, 0.1, z); scene.add(r); rocks.push(r); }
  const wrap = (v, c) => c + ((v - c + SPAN / 2) % SPAN + SPAN) % SPAN - SPAN / 2;

  // distant hills
  const hillMat = new T.MeshBasicMaterial({ color: 0xb59e78, fog: true });
  for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28; const h = new T.Mesh(new T.SphereGeometry(1, 16, 8, 0, 6.28, 0, 1.6), hillMat.clone());
    h.material.color.setHSL(0.09, 0.28, 0.58 - (i % 3) * 0.04); h.scale.set(40 + rnd() * 40, 8 + rnd() * 12, 30); h.position.set(Math.cos(a) * 170, -1, Math.sin(a) * 170); h.rotation.y = -a; scene.add(h); }

  // ---------- UI ----------
  const ui = document.getElementById('ui');
  const $ = id => document.getElementById(id);
  let paused = false, auto = q.has('auto') ? true : false, followCam = true;
  $('speed').oninput = e => { giraffe.speedFactor = +e.target.value; $('sv').textContent = (+e.target.value).toFixed(2) + '×'; };
  $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Play' : 'Pause'; };
  $('orbit').onclick = () => { auto = !auto; $('orbit').textContent = auto ? 'Auto-orbit: on' : 'Auto-orbit: off'; };
  $('orbit').textContent = auto ? 'Auto-orbit: on' : 'Auto-orbit: off';
  addEventListener('keydown', e => { if (e.code === 'Space') { $('pause').click(); e.preventDefault(); } if (e.key === 'h') ui.classList.toggle('hide'); });

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  // fixed camera for screenshots: ?cam=x,y,z&t=seconds&speed=
  if (q.get('cam')) { const c = q.get('cam').split(',').map(Number); camera.position.set(c[0], c[1], c[2]); }
  if (q.get('look')) { const c = q.get('look').split(',').map(Number); controls.target.set(c[0], c[1], c[2]); }
  controls.userData = { lz: 0 };
  const warm = q.get('t') ? +q.get('t') : 0;
  if (warm) { for (let t = 0; t < warm; t += 1 / 60) stepSim(1 / 60); }
  if (q.get('ph')) { giraffe.phase = +q.get('ph'); giraffe.update(0, 0); }

  const m4 = new T.Matrix4(), tmpV = new T.Vector3();
  function stepSim(dt) {
    const prevZ = world.z;
    giraffe.update(dt);
    const v = GIRAFFE_GAIT.STRIDE / (GIRAFFE_GAIT.DUTY * giraffe.cycleT);
    world.z += v * dt * giraffe.speedFactor;
    giraffe.group.position.z = world.z;
  }
  let last = performance.now(); let fps = 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (q.get('freeze')) dt = 0;
    if (!paused) stepSim(dt);
    const gz = world.z;
    // camera follows
    const dz = gz - (controls.userData?.lz ?? gz);
    controls.userData = controls.userData || {}; controls.userData.lz = gz;
    camera.position.z += dz; controls.target.z += dz;
    if (auto) { const a = dt * 0.12, c = Math.cos(a), s = Math.sin(a); const rx = camera.position.x - controls.target.x, rz = camera.position.z - controls.target.z; camera.position.x = controls.target.x + rx * c - rz * s; camera.position.z = controls.target.z + rx * s + rz * c; }
    controls.update();
    // world
    sun.position.set(sunOff.x, sunOff.y, sunOff.z + gz); sun.target.position.set(0, 0, gz); sun.target.updateMatrixWorld();
    ground.position.z = gz; gtex.offset.set(0, (gz) / TILE * -0 + (-gz / TILE)); // texture is mapped in plane's local v; plane rotated so +v -> -z
    gtex.offset.y = gz / TILE * 1; gtex.offset.x = 0;
    sky.position.set(0, 0, gz);
    for (let i = 0; i < NG; i++) { const it = gItems[i]; const z = wrap(it.z, gz); m4.makeRotationY(it.r); m4.scale(tmpV.set(it.s, it.s, it.s)); m4.setPosition(it.x, 0, z); grass.setMatrixAt(i, m4); }
    grass.instanceMatrix.needsUpdate = true;
    trees.forEach(t => { t.userData.z0 = t.userData.z0 ?? t.position.z; t.position.z = wrap(t.userData.z0, gz); });
    rocks.forEach(t => { t.userData.z0 = t.userData.z0 ?? t.position.z; t.position.z = wrap(t.userData.z0, gz); });
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
  window.__giraffe = giraffe; window.__scene = scene;
})();
