/* main.js - scene, lights, savanna, camera, controls, UI, render loop */
(function (G) {
  'use strict';
  const V = THREE.Vector3;
  const q = new URLSearchParams(location.search);
  const num = (k, d) => (q.has(k) ? parseFloat(q.get(k)) : d);
  const flag = (k, d) => (q.has(k) ? q.get(k) !== '0' : d);
  let loadMs = 0;

  /* ---------------- renderer ---------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdccfae, 60, 430);
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.25, 1800);

  /* ---------------- lights ---------------- */
  const SUN = new THREE.Vector3(0.34, 0.80, 0.32).normalize();
  scene.add(new THREE.HemisphereLight(0xc9d8ea, 0xb89862, 1.25));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -5;
  sun.shadow.camera.near = 4; sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xd6e0ee, 0.85); fill.position.set(-14, 7, -10); scene.add(fill);
  const bounce = new THREE.DirectionalLight(0xe3c79a, 0.62); bounce.position.set(1, -7, 3); scene.add(bounce);

  /* ---------------- textures / world ---------------- */
  const t0 = performance.now();
  const coatTex = G.textures.makeCoat(1024);
  const groundTex = G.textures.makeGround(512);
  const bladeTex = G.textures.makeBlade();
  const dustTex = G.textures.makeDust();
  loadMs = performance.now() - t0;

  const skyDome = G.world.sky(); scene.add(skyDome);
  scene.add(G.world.hills());
  const ground = G.world.ground(groundTex); scene.add(ground);
  const grassMesh = G.world.grass(bladeTex, 1000, 70); scene.add(grassMesh);

  const props = new THREE.Group(); scene.add(props);
  let sd = 31337; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const propData = [];
  for (let i = 0; i < 18; i++) {
    const m = G.world.acacia(1000 + i * 37);
    const d = { obj: m, x: (i % 2 ? 1 : -1) * (10 + rnd() * 46) };
    propData.push(d); props.add(m);
  }
  for (let i = 0; i < 26; i++) {
    const m = G.world.rock(7000 + i * 91);
    const d = { obj: m, x: (rnd() * 2 - 1) * 32 };
    propData.push(d); props.add(m);
  }
  const BAND = 160;
  propData.forEach(d => {
    d.obj.position.set(d.x, 0, (rnd() * 2 - 1) * BAND);
    d.obj.scale.setScalar(d.obj.geometry ? 0.7 + rnd() * 0.9 : 1);
    d.obj.rotation.y = rnd() * 6.28;
  });

  /* ---------------- giraffe ---------------- */
  const built = G.buildGiraffe();
  /* DoubleSide: the body is assembled from overlapping sweeps, so a limb tube
   * end or barrel cap can be exposed at a junction - two-sided shading keeps
   * those seams from reading as holes. */
  const coatMat = new THREE.MeshStandardMaterial({
    map: coatTex.map, bumpMap: coatTex.bump, bumpScale: 0.45, vertexColors: true,
    roughness: 0.74, metalness: 0.0, side: THREE.DoubleSide
  });
  const hornMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.34, metalness: 0.05, side: THREE.DoubleSide
  });
  const lidMat = new THREE.MeshStandardMaterial({
    map: coatTex.map, bumpMap: coatTex.bump, bumpScale: 0.3, roughness: 0.78,
    color: 0xd8bd90
  });
  const mesh = new THREE.SkinnedMesh(built.geometry, [coatMat, hornMat]);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;

  const rig = new G.Rig(built.bones, built.joints);
  const giraffe = new THREE.Group();
  giraffe.add(rig.rootBone); giraffe.add(mesh);
  scene.add(giraffe);
  scene.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(rig.list));

  /* eyes and blinking lids ride the head bone (identity bind rotation => local
   * offsets are plain body-space offsets) */
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0x15100c, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04
  });
  const eyes = [], lids = [];
  const HB = built.joints.head.p;
  for (const s of [1, -1]) {
    const grp = new THREE.Object3D();
    grp.position.set(s * 0.142, 5.05 - HB[1], 2.24 - HB[2]);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.033, 20, 14), eyeMat);
    ball.scale.set(0.92, 1.0, 0.86);
    ball.rotation.z = s * 0.3;
    grp.add(ball); eyes.push(ball);
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.0405, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.40), lidMat);
    lid.rotation.x = -0.5;
    lid.visible = false;
    grp.add(lid); lids.push(lid);
    rig.bones.head.add(grp);
  }

  const bonesHelper = new THREE.SkeletonHelper(rig.rootBone);
  bonesHelper.visible = flag('bones', false);
  scene.add(bonesHelper);

  /* ---------------- hoof dust ---------------- */
  const ND = 160;
  const dpos = new Float32Array(ND * 3), dsize = new Float32Array(ND), dlife = new Float32Array(ND);
  const dvel = new Float32Array(ND * 3);
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute('aSize', new THREE.BufferAttribute(dsize, 1));
  dgeo.setAttribute('aLife', new THREE.BufferAttribute(dlife, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: dustTex } },
    vertexShader: 'attribute float aSize; attribute float aLife; varying float vL;' +
      'void main(){ vL=aLife; vec4 mv=modelViewMatrix*vec4(position,1.0);' +
      ' gl_PointSize = aSize*(340.0/max(0.001,-mv.z)); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform sampler2D map; varying float vL;' +
      'void main(){ vec4 c=texture2D(map,gl_PointCoord); gl_FragColor=vec4(c.rgb,c.a*vL*0.85); }'
  });
  const dust = new THREE.Points(dgeo, dustMat);
  dust.frustumCulled = false; scene.add(dust);
  let dnext = 0;
  function puff(x, y, z, n, power) {
    for (let i = 0; i < n; i++) {
      dnext = (dnext + 1) % ND;
      const k = dnext;
      dpos[k * 3] = x + (Math.random() - 0.5) * 0.14;
      dpos[k * 3 + 1] = y + Math.random() * 0.04;
      dpos[k * 3 + 2] = z + (Math.random() - 0.5) * 0.14;
      const a = Math.random() * 6.283, sp = (0.2 + Math.random() * 0.45) * power;
      dvel[k * 3] = Math.cos(a) * sp; dvel[k * 3 + 1] = 0.22 + Math.random() * 0.4; dvel[k * 3 + 2] = Math.sin(a) * sp;
      dsize[k] = 0.26 + Math.random() * 0.42; dlife[k] = 1;
    }
  }
  function stepDust(dt) {
    for (let i = 0; i < ND; i++) {
      if (dlife[i] <= 0) continue;
      dlife[i] -= dt * 0.7;
      dpos[i * 3] += dvel[i * 3] * dt; dpos[i * 3 + 1] += dvel[i * 3 + 1] * dt; dpos[i * 3 + 2] += dvel[i * 3 + 2] * dt;
      dvel[i * 3] *= 0.94; dvel[i * 3 + 2] *= 0.94;
      dvel[i * 3 + 1] = Math.max(0, dvel[i * 3 + 1] - dt * 0.3);
      dsize[i] += dt * 0.5;
    }
    dgeo.attributes.position.needsUpdate = true;
    dgeo.attributes.aSize.needsUpdate = true;
    dgeo.attributes.aLife.needsUpdate = true;
  }

  /* ---------------- camera rig ---------------- */
  const cam = {
    theta: num('theta', 1.05), phi: num('phi', 1.30), dist: num('dist', 14.5),
    base: new V(0, 2.85, 0.2), pan: new V(0, 0, 0), cur: new V(0, 2.85, 0.2),
    follow: true
  };
  const PRESETS = {
    full: { theta: 1.02, phi: 1.33, dist: 12.5, t: [0, 2.8, 0.2] },
    side: { theta: 1.5708, phi: 1.38, dist: 12.0, t: [0, 2.8, 0.3] },
    head: { theta: 0.75, phi: 1.44, dist: 3.2, t: [0.1, 4.95, 2.15] },
    front: { theta: 0.02, phi: 1.42, dist: 9.0, t: [0, 3.1, 0.9] },
    low: { theta: 1.95, phi: 1.565, dist: 9.5, t: [0, 2.1, 0.5] },
    high: { theta: 2.45, phi: 0.72, dist: 18.0, t: [0, 2.6, 0.0] },
    legs: { theta: 1.52, phi: 1.53, dist: 5.4, t: [0, 1.25, 0.7] },
    rump: { theta: -2.45, phi: 1.36, dist: 10.0, t: [0, 2.7, -0.7] }
  };
  let want = null;
  function preset(n) {
    const p = PRESETS[n]; if (!p) return;
    want = { theta: p.theta, phi: p.phi, dist: p.dist, t: new V(p.t[0], p.t[1], p.t[2]) };
    cineT = 0;
  }
  let cine = flag('cine', false), cineT = 0, cineBase = cam.theta;

  const el = renderer.domElement;
  let drag = null;
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      const m = camera.matrixWorld.elements, s = cam.dist * 0.0013;
      cam.pan.addScaledVector(new V(m[0], m[1], m[2]), -dx * s).addScaledVector(new V(m[4], m[5], m[6]), dy * s);
      cam.pan.x = G.clamp(cam.pan.x, -12, 12); cam.pan.y = G.clamp(cam.pan.y, -3, 8); cam.pan.z = G.clamp(cam.pan.z, -12, 12);
    } else {
      cam.theta -= dx * 0.005;
      cam.phi = G.clamp(cam.phi - dy * 0.004, 0.10, 1.60);
      cine = false; cineBase = cam.theta;
      const c = document.getElementById('cine'); if (c) c.checked = false;
    }
  });
  el.addEventListener('wheel', e => {
    e.preventDefault();
    cam.dist = G.clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 1.5, 95);
  }, { passive: false });
  let pinch = 0;
  el.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) cam.dist = G.clamp(cam.dist * (pinch / d), 1.5, 95);
      pinch = d; e.preventDefault();
    }
  }, { passive: false });
  el.addEventListener('touchend', () => { pinch = 0; });

  /* ---------------- UI ---------------- */
  const P = { speed: num('speed', 1.25), gait: q.get('gait') || 'walk', paused: flag('paused', false) };
  if (flag('clean', false)) { document.getElementById('panel').style.display = 'none'; document.getElementById('hint').style.display = 'none'; document.getElementById('info').style.display = 'none'; }
  const $ = id => document.getElementById(id);
  const host = $('panel');
  function row(html) { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = html; host.appendChild(d); return d; }
  row('<button id="pp" class="big">&#10074;&#10074;&nbsp;pause</button>' +
    '<button id="rst" class="big">reset view</button>' +
    '<button id="sn" class="big" title="save a PNG">snapshot</button>');
  row('<label>speed <output id="ospd">' + P.speed.toFixed(2) + '</output> m/s &middot; ' +
    '<span id="kph"></span></label><input id="spd" type="range" min="0" max="2.6" step="0.05" value="' + P.speed + '">');
  row('<label>gait</label><select id="gait">' +
    Object.keys(G.GAITS).map(k => '<option value="' + k + '"' + (k === P.gait ? ' selected' : '') + '>' + G.GAITS[k].name + '</option>').join('') +
    '</select>');
  row('<label>cameras</label><div class="cams">' +
    Object.keys(PRESETS).map(k => '<button class="cam" data-c="' + k + '">' + k + '</button>').join('') + '</div>');
  row('<label class="ck"><input id="fol" type="checkbox" checked>follow</label>' +
    '<label class="ck"><input id="cine" type="checkbox"' + (cine ? ' checked' : '') + '>slow orbit</label>');
  row('<label class="ck"><input id="shad" type="checkbox" checked>shadows</label>' +
    '<label class="ck"><input id="bone" type="checkbox"' + (flag('bones', false) ? ' checked' : '') + '>skeleton</label>');
  row('<label class="ck"><input id="dustc" type="checkbox" checked>dust</label>' +
    '<label class="ck"><input id="wire" type="checkbox"' + (flag('wire', false) ? ' checked' : '') + '>wireframe</label>');
  const ui = {
    pp: $('pp'), spd: $('spd'), ospd: $('ospd'), gait: $('gait'), fol: $('fol'), cine: $('cine'),
    shad: $('shad'), bone: $('bone'), dustc: $('dustc'), wire: $('wire'), info: $('info')
  };
  host.querySelectorAll('.cam').forEach(b => b.addEventListener('click', () => preset(b.dataset.c)));
  ui.pp.addEventListener('click', () => { P.paused = !P.paused; ui.pp.innerHTML = P.paused ? '&#9654;&nbsp;play' : '&#10074;&#10074;&nbsp;pause'; });
  $('rst').addEventListener('click', () => { preset('full'); cam.pan.set(0, 0, 0); });
  $('sn').addEventListener('click', () => {
    renderer.render(scene, camera);
    const a = document.createElement('a');
    a.download = 'giraffe-' + Date.now() + '.png';
    a.href = renderer.domElement.toDataURL('image/png'); a.click();
  });
  ui.spd.addEventListener('input', () => { P.speed = parseFloat(ui.spd.value); ui.ospd.value = P.speed.toFixed(2); });
  ui.gait.addEventListener('change', () => { P.gait = ui.gait.value; });
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); ui.pp.click(); }
    else if (e.key >= '1' && e.key <= '8') preset(Object.keys(PRESETS)[+e.key - 1]);
    else if (e.key === 'b' || e.key === 'B') ui.bone.checked = !ui.bone.checked;
    else if (e.key === 'ArrowUp') { e.preventDefault(); P.speed = Math.min(2.6, P.speed + 0.05); ui.spd.value = P.speed; ui.ospd.value = P.speed.toFixed(2); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); P.speed = Math.max(0, P.speed - 0.05); ui.spd.value = P.speed; ui.ospd.value = P.speed.toFixed(2); }
  });

  /* ---------------- loop ---------------- */
  let travelled = 0, last = performance.now(), fps = 60, acc = 0, frames = 0;
  const frozen = q.has('t') ? parseFloat(q.get('t')) : null;
  const stepFixed = q.has('step') ? parseFloat(q.get('step')) : null;
  const prevU = { FL: 0, FR: 0, HL: 0, HR: 0 };
  const hoofXY = { FL: [0.295, 0.99], FR: [-0.295, 0.99], HL: [0.255, -1.09], HR: [-0.255, -1.09] };
  const origin = new V();
  preset(q.get('cam') || 'full');

  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (stepFixed !== null) dt = stepFixed;

    const running = !P.paused && frozen === null;
    if (running) travelled += P.speed * dt;
    giraffe.position.z = travelled;
    origin.set(giraffe.position.x, 0, giraffe.position.z);

    if (frozen !== null) rig.phase = ((frozen % 1) + 1) % 1;
    const info = rig.update(dt, { gait: P.gait, speed: P.speed, paused: !running, origin: origin });

    /* dust puffs at each hoof-strike */
    if (ui.dustc.checked) {
      if (running) {
        const ph = G.GAITS[P.gait].phase;
        for (const k of ['FL', 'FR', 'HL', 'HR']) {
          const uu = (info.phase + ph[k]) % 1;
          if (uu < prevU[k] && P.speed > 0.45) {
            puff(hoofXY[k][0], 0.02, hoofXY[k][1] + travelled, 5, 0.45 + P.speed * 0.55);
          }
          prevU[k] = uu;
        }
      }
      stepDust(dt);
    }
    dust.visible = ui.dustc.checked;

    /* blink */
    const close = info.blink > 0 ? Math.sin(Math.min(1, info.blink) * Math.PI) : 0;
    for (let i = 0; i < 2; i++) {
      eyes[i].scale.y = 1 - 0.66 * close;
      lids[i].visible = close > 0.05;
      lids[i].rotation.x = -0.5 - close * 1.45;
    }

    /* sun + shadow frustum travel with the animal */
    sun.position.set(giraffe.position.x + SUN.x * 36, SUN.y * 36, giraffe.position.z + SUN.z * 36);
    sun.target.position.set(giraffe.position.x, 2.3, giraffe.position.z);
    sun.target.updateMatrixWorld();
    skyDome.position.set(giraffe.position.x, 0, giraffe.position.z);

    /* recycle scenery: an endless stretch of savanna */
    const gz = giraffe.position.z;
    for (const d of propData) {
      const z = d.obj.position.z;
      if (z < gz - BAND) d.obj.position.z = z + 2 * BAND;
      else if (z > gz + BAND) d.obj.position.z = z - 2 * BAND;
    }
    (function () {
      const ud = grassMesh.userData, data = ud.data;
      let moved = false;
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        if (d.z < gz - ud.band || d.z > gz + ud.band) {
          d.z += (d.z < gz ? 2 * ud.band : -2 * ud.band);
          d.x = (Math.random() * 2 - 1) * 44; ud.place(i); moved = true;
        }
      }
      if (moved) grassMesh.instanceMatrix.needsUpdate = true;
    })();

    /* camera */
    if (want) {
      const k = 1 - Math.pow(0.0015, dt);
      cam.theta += (want.theta - cam.theta) * k;
      cam.phi += (want.phi - cam.phi) * k;
      cam.dist += (want.dist - cam.dist) * k;
      cam.base.lerp(want.t, k);
      if (Math.abs(want.dist - cam.dist) < 0.03 && Math.abs(want.theta - cam.theta) < 0.01) want = null;
    }
    cine = ui.cine.checked;
    if (cine) { cineT += dt; cam.theta = cineBase + Math.sin(cineT * 0.11) * 0.62; }
    else cineBase = cam.theta;

    if (cam.follow) cam.cur.set(giraffe.position.x + cam.base.x + cam.pan.x, cam.base.y + cam.pan.y, giraffe.position.z + cam.base.z + cam.pan.z);
    else cam.cur.copy(cam.base).add(cam.pan);
    const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    camera.position.set(cam.cur.x + cam.dist * sp * Math.sin(cam.theta), cam.cur.y + cam.dist * cp, cam.cur.z + cam.dist * sp * Math.cos(cam.theta));
    camera.lookAt(cam.cur);
    camera.updateMatrixWorld();

    /* polled toggles */
    renderer.shadowMap.enabled = ui.shad.checked;
    mesh.castShadow = ui.shad.checked;
    grassMesh.receiveShadow = false;
    bonesHelper.visible = ui.bone.checked;
    coatMat.wireframe = hornMat.wireframe = lidMat.wireframe = ui.wire.checked;
    ground.visible = !ui.wire.checked;

    renderer.render(scene, camera);

    acc += dt; frames++;
    if (acc > 0.5) {
      fps = frames / acc; acc = 0; frames = 0;
      const rest = P.speed < 0.05;
      ui.info.innerHTML = '<b>' + (rest ? 'standing &nbsp;&mdash;&nbsp; weight shifted, chewing' : info.gait) + '</b><br>' +
        'ground speed ' + P.speed.toFixed(2) + ' m/s (' + (P.speed * 3.6).toFixed(1) + ' km/h)<br>' +
        (rest ? 'all four feet planted &middot; idle sway &amp; chew<br>'
              : 'stride ' + info.stride.toFixed(2) + ' m &middot; cycle ' + info.cycleT.toFixed(2) + ' s<br>') +
        'body dip ' + (info.drop * 100).toFixed(1) + ' cm &middot; phase ' + info.phase.toFixed(2) + '<br>' +
        'stance [FL FR HL HR] ' + info.stance.join('') + '<br>' +
        Math.round(fps) + ' fps &middot; ' + (built.tris / 1000).toFixed(0) + 'k tris &middot; ' +
        rig.list.length + ' bones<br><span class="dim">procedural textures in ' + Math.round(loadMs) + ' ms</span>';
    }
  }
  frame();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  window.GIRAFFE = {
    scene: scene, camera: camera, renderer: renderer, rig: rig, mesh: mesh, giraffe: giraffe,
    P: P, cam: cam, preset: preset, built: built, sun: sun,
    get fps() { return Math.round(fps); }
  };
  const boot = document.getElementById('boot');
  if (boot) boot.classList.add('gone');
})(window.G = window.G || {});
