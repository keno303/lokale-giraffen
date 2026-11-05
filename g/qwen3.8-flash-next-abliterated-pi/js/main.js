/* main.js -- scene, savanna, camera, controls, UI */
(function (G) {
  'use strict';

  var SCALE = 1.22;                 // model scale -> a ~4.3 m tall giraffe
  var scene, camera, renderer, model, rig, walker, clock, scenery, orbit, ui = {};
  var sunPos = new THREE.Vector3(-7.5, 12.5, 6.5);
  G.sceneGroup = new THREE.Group();

  /* ------------------------------------------------------------------ */
  function materials() {
    var coatTex = G.coatTexture(11);
    var coatBump = G.coatTexture(11);
    var paleTex = G.texFrom(G.paleCanvas({ seed: 5 }), 1);
    var m = {
      coat: new THREE.MeshStandardMaterial({
        map: coatTex, bumpMap: coatBump, bumpScale: 0.006,
        roughness: 0.93, metalness: 0.0, vertexColors: true
      }),
      pale: new THREE.MeshStandardMaterial({
        map: paleTex, bumpMap: paleTex, bumpScale: 0.004,
        roughness: 0.95, metalness: 0.0, vertexColors: true
      }),
      mane: new THREE.MeshStandardMaterial({
        color: 0x6d4526, roughness: 0.98, metalness: 0, vertexColors: true, side: THREE.DoubleSide
      }),
      dark: new THREE.MeshStandardMaterial({ color: 0x4b3121, roughness: 0.85, vertexColors: true }),
      hoof: new THREE.MeshStandardMaterial({ color: 0x3a2718, roughness: 0.7 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x150c05, roughness: 0.15, metalness: 0.05 })
    };
    return m;
  }

  /* ------------------------------------------------------------------ */
  function makeSky() {
    var g = new THREE.SphereGeometry(320, 24, 16);
    var m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d7ab5) },
        mid: { value: new THREE.Color(0xb9cdd9) },
        bot: { value: new THREE.Color(0xdfcaa3) },
        sunCol: { value: new THREE.Color(0xffeecb) },
        sunDir: { value: sunPos.clone().normalize() }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunCol; uniform vec3 sunDir;',
        'varying vec3 vP;',
        'void main(){',
        '  vec3 d = normalize(vP);',
        '  vec3 c = mix(bot, mid, smoothstep(-0.03, 0.16, d.y));',
        '  c = mix(c, top, smoothstep(0.10, 0.62, d.y));',
        '  float s = max(0.0, dot(d, normalize(sunDir)));',
        '  c += sunCol * pow(s, 300.0) * 1.6;',
        '  c += sunCol * pow(s, 9.0) * 0.14;',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    var sky = new THREE.Mesh(g, m);
    sky.frustumCulled = false;
    return sky;
  }

  function crossQuads(w, h) {
    var p = [], uv = [], idx = [], k, i;
    var pts = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
    for (k = 0; k < 2; k++) {
      var o = p.length / 3;
      for (i = 0; i < 4; i++) {
        var s = pts[i][0], t = pts[i][1];
        p.push(k ? 0 : s * w, h * t, k ? s * w : 0);
        uv.push(s * 0.5 + 0.5, t);
      }
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // billboard-style normals: blades catch the sky, not the ground
    var nr = [];
    for (var q = 0; q < p.length / 3; q++) nr.push(0, 0.85, 0.5);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
    return g;
  }

  /* savanna scenery that slides past the animal as it walks */
  function makeScenery() {
    var S = {}, TRACK = 130, i;
    var rnd = G.rng(77);
    var leafTex = G.texFrom(G.leafCanvas({ seed: 21 }), 2);
    var tuftTex = G.texFrom(G.tuftCanvas({ seed: 9 }), 1);
    leafTex.wrapS = leafTex.wrapT = THREE.RepeatWrapping;
    tuftTex.wrapS = tuftTex.wrapT = THREE.RepeatWrapping;

    S.root = new THREE.Group();
    var bark = new THREE.MeshStandardMaterial({ color: 0x6b5540, roughness: 0.95 });
    var leaf = new THREE.MeshStandardMaterial({
      map: leafTex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1, color: 0xbfc49a
    });
    var bushMat = new THREE.MeshStandardMaterial({
      map: leafTex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1, color: 0xa8ae80
    });

    function tree() {
      var g = new THREE.Group();
      var h = 3.4 + rnd() * 3.2;
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.30, h, 7), bark);
      trunk.position.y = h / 2; trunk.castShadow = true;
      g.add(trunk);
      var n = 2 + ((rnd() * 2) | 0), k;
      for (k = 0; k < n; k++) {
        var br = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 1.3, 5), bark);
        br.position.y = h * (0.62 + 0.1 * k);
        br.rotation.z = (rnd() - 0.5) * 1.5;
        br.rotation.x = (rnd() - 0.5) * 1.2;
        br.castShadow = true;
        g.add(br);
      }
      var cs = 1 + ((rnd() * 2) | 0);
      for (k = 0; k < cs; k++) {
        var cw = 2.0 + rnd() * 2.4;
        var can = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), leaf);
        can.scale.set(cw, 0.42 + rnd() * 0.22, cw * (0.8 + rnd() * 0.4));
        can.position.set((rnd() - 0.5) * 1.4, h * (0.92 + rnd() * 0.16), (rnd() - 0.5) * 1.4);
        can.castShadow = true;
        g.add(can);
      }
      g.scale.setScalar(0.8 + rnd() * 0.5);
      return g;
    }
    function bush() {
      var g = new THREE.Group();
      var s = 0.5 + rnd() * 0.9;
      var m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), bushMat);
      m.scale.set(s * 1.3, s * 0.75, s * 1.1);
      m.position.y = s * 0.6;
      m.castShadow = true;
      g.add(m);
      return g;
    }

    S.trees = []; S.bushes = [];
    for (i = 0; i < 9; i++) {
      var t = tree();
      t.userData = { x: (rnd() - 0.5) * 40, z: (i + rnd()) * TRACK / 9, r: rnd() * 6.28 };
      if (Math.abs(t.userData.x) < 3.2) t.userData.x += (rnd() > 0.5 ? 4.5 : -4.5);
      t.rotation.y = t.userData.r;
      S.root.add(t); S.trees.push(t);
    }
    for (i = 0; i < 16; i++) {
      var b = bush();
      b.userData = { x: (rnd() - 0.5) * 30, z: (i + rnd()) * TRACK / 16, r: rnd() * 6.28 };
      b.rotation.y = b.userData.r;
      S.root.add(b); S.bushes.push(b);
    }

    var nT = 110, tg = crossQuads(0.24, 0.42);
    var tm = new THREE.MeshStandardMaterial({
      map: tuftTex, alphaTest: 0.32, side: THREE.DoubleSide, roughness: 1, color: 0xf0e6c6
    });
    S.tufts = new THREE.InstancedMesh(tg, tm, nT);
    S.tufts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    S.tuftData = [];
    for (i = 0; i < nT; i++) {
      var x = (rnd() - 0.5) * 40;
      if (Math.abs(x) < 1.3) x += x > 0 ? 1.6 : -1.6;
      S.tuftData.push({ x: x, z: (i + rnd()) * TRACK / nT, s: 0.45 + rnd() * 0.85, r: rnd() * 6.28 });
    }
    S.root.add(S.tufts);
    S.TRACK = TRACK;
    S.m4 = new THREE.Matrix4();
    S.q = new THREE.Quaternion();
    S.v = new THREE.Vector3();
    S.sc = new THREE.Vector3();
    S.e = new THREE.Euler();

    S.update = function (dz) {
      var i2, d, o = S.TRACK;
      for (i2 = 0; i2 < S.trees.length; i2++) {
        d = S.trees[i2].userData; d.z -= dz;
        if (d.z < -34) { d.z += o; d.x = (rnd() - 0.5) * 46; if (Math.abs(d.x) < 3.2) d.x += rnd() > 0.5 ? 4.5 : -4.5; }
        S.trees[i2].position.set(d.x, 0, d.z);
      }
      for (i2 = 0; i2 < S.bushes.length; i2++) {
        d = S.bushes[i2].userData; d.z -= dz;
        if (d.z < -30) { d.z += o; d.x = (rnd() - 0.5) * 34; }
        S.bushes[i2].position.set(d.x, 0, d.z);
      }
      for (i2 = 0; i2 < nT; i2++) {
        d = S.tuftData[i2]; d.z -= dz;
        if (d.z < -26) { d.z += o; d.x = (rnd() - 0.5) * 40; if (Math.abs(d.x) < 1.3) d.x += d.x > 0 ? 1.6 : -1.6; }
        S.v.set(d.x, 0, d.z);
        S.e.set(0, d.r, 0);
        S.q.setFromEuler(S.e);
        S.sc.set(d.s, d.s, d.s);
        S.m4.compose(S.v, S.q, S.sc);
        S.tufts.setMatrixAt(i2, S.m4);
      }
      S.tufts.instanceMatrix.needsUpdate = true;
    };
    S.update(0);
    return S;
  }

  /* ------------------------------------------------------------------ */
  function Orbit(cam, dom) {
    var O = { az: 1.36, pol: 1.46, r: 11.0, taz: 1.36, tp: 1.46, tr: 11.0, auto: false };
    var target = new THREE.Vector3(0, 2.25, 0);
    var drag = false, px = 0, py = 0, id = null, pinch = 0;
    function down(e) { drag = true; px = e.clientX; py = e.clientY; id = e.pointerId; dom.setPointerCapture && dom.setPointerCapture(id); }
    function move(e) {
      if (!drag) return;
      O.taz -= (e.clientX - px) * 0.006;
      O.tp -= (e.clientY - py) * 0.005;
      O.tp = Math.max(0.22, Math.min(1.53, O.tp));
      px = e.clientX; py = e.clientY;
    }
    function up() { drag = false; }
    dom.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    dom.addEventListener('wheel', function (e) {
      e.preventDefault();
      O.tr = Math.max(3.6, Math.min(26, O.tr * (1 + Math.sign(e.deltaY) * 0.08)));
    }, { passive: false });
    O.set = function (az, pol, r) { O.taz = az; O.tp = pol; O.tr = r; };
    O.target = target;
    O.update = function (dt) {
      if (O.auto) O.taz += dt * 0.16;
      var k = 1 - Math.pow(0.0015, dt);
      O.az += (O.taz - O.az) * k; O.pol += (O.tp - O.pol) * k; O.r += (O.tr - O.r) * k;
      var sp = Math.sin(O.pol);
      camera.position.set(target.x + O.r * sp * Math.sin(O.az), target.y + O.r * Math.cos(O.pol),
        target.z + O.r * sp * Math.cos(O.az));
      camera.lookAt(target);
    };
    return O;
  }

  /* ------------------------------------------------------------------ */
  function init() {
    var host = document.getElementById('stage');
    var qs = new URLSearchParams(location.search);
    G.shot = !!qs.get('shot');
    renderer = new THREE.WebGLRenderer({
      antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: G.shot
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd8c4a0, 26, 175);
    scene.add(makeSky());

    camera = new THREE.PerspectiveCamera(36, host.clientWidth / host.clientHeight, 0.2, 700);

    var hemi = new THREE.HemisphereLight(0xa9c9e6, 0x6e5c38, 0.62);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff0d4, 2.9);
    sun.position.copy(sunPos);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9; sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
    sun.shadow.camera.near = 2; sun.shadow.camera.far = 42;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 2;
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0xcfe2ff, 0.55);
    fill.position.set(7, 5, -8);
    scene.add(fill);

    var gt = G.texFrom(G.groundCanvas({ seed: 3 }), 84);
    gt.anisotropy = renderer.capabilities.getMaxAnisotropy();
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshStandardMaterial({ map: gt, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    scenery = makeScenery();
    scene.add(scenery.root);
    G.groundTex = gt;
    G.groundTile = 420 / 84;

    var mats = materials();
    rig = G.buildGiraffe(mats);
    model = rig.model;
    model.scale.setScalar(SCALE);
    scene.add(model);
    walker = new G.Walker(rig, model);
    walker.torsoScale = SCALE;
    clock = new THREE.Clock();
    orbit = Orbit(camera, renderer.domElement);

    /* ---------------- ui ---------------- */
    ui = {
      speed: document.getElementById('speed'),
      gait: document.getElementById('gait'),
      halt: document.getElementById('halt'),
      coat: document.getElementById('coat'),
      fps: document.getElementById('fps'),
      read: document.getElementById('read'),
      auto: document.getElementById('orbit'),
      views: document.querySelectorAll('.view')
    };
    ui.speed.addEventListener('input', function () {
      walker.freq = parseFloat(ui.speed.value);
      document.getElementById('speedv').textContent = walker.freq.toFixed(2);
    });
    ui.gait.addEventListener('change', function () { walker.gait = ui.gait.value; });
    ui.halt.addEventListener('click', function () {
      var stopped = walker.timeScale > 0;
      walker.timeScale = stopped ? 0 : 1;
      ui.halt.textContent = stopped ? 'Walk' : 'Halt';
      ui.halt.classList.toggle('off', stopped);
    });
    ui.coat.addEventListener('click', function () {
      var s = 2 + ((Math.random() * 40) | 0);
      var t = G.coatTexture(s);
      mats.coat.map = t; mats.coat.bumpMap = t; mats.coat.needsUpdate = true;
    });
    function setView(v) {
      var t = [0, 2.10, 0];
      if (v === 'side') orbit.set(1.5708, 1.50, 11.0);
      else if (v === 'three') orbit.set(0.95, 1.44, 11.5);
      else if (v === 'front') orbit.set(0.06, 1.46, 9.6);
      else if (v === 'high') orbit.set(1.15, 0.98, 13.0);
      else if (v === 'head') { orbit.set(1.15, 1.52, 4.2); t = [0, 4.15, 2.10]; }
      else if (v === 'feet') { orbit.set(1.30, 1.52, 5.4); t = [0, 0.55, 0.40]; }
      orbit.target.set(t[0], t[1], t[2]);
    }
    G.setView = setView;
    Array.prototype.forEach.call(ui.views, function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-v')); });
    });
    ui.auto.addEventListener('change', function () { orbit.auto = ui.auto.checked; });
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space') { e.preventDefault(); ui.halt.click(); }
      if (e.code === 'ArrowUp') { ui.speed.value = Math.min(2.2, walker.freq + 0.05); ui.speed.dispatchEvent(new Event('input')); }
      if (e.code === 'ArrowDown') { ui.speed.value = Math.max(0.3, walker.freq - 0.05); ui.speed.dispatchEvent(new Event('input')); }
    });
    window.addEventListener('resize', function () {
      renderer.setSize(host.clientWidth, host.clientHeight);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    });

    /* ---- still mode for headless screenshots: ?shot=1&p=0.2&view=side ---- */
    if (G.shot) {
      if (qs.get('freq')) walker.freq = parseFloat(qs.get('freq'));
      if (qs.get('gait')) walker.gait = qs.get('gait');
      if (qs.get('view')) setView(qs.get('view'));
      if (qs.get('r')) orbit.tr = parseFloat(qs.get('r'));
      if (qs.get('az')) orbit.taz = parseFloat(qs.get('az'));
      if (qs.get('pol')) orbit.tp = parseFloat(qs.get('pol'));
      if (qs.get('ty')) orbit.target.y = parseFloat(qs.get('ty'));
      ui.speed.value = walker.freq;
      walker.p = parseFloat(qs.get('p') || '0.2');
      for (var s1 = 0; s1 < 6; s1++) orbit.update(1);
      for (var s2 = 0; s2 < 12; s2++) walker.update(1 / 60);
      walker.p = parseFloat(qs.get('p') || '0.2');
      walker.update(0.0002);
      if (qs.get('probe')) {
        for (var pz = 0; pz < 8; pz++) {
          for (var pk = 0; pk < 7; pk++) { walker.p = (pz + pk / 8) / 8; walker.update(1 / 90); }
          walker.p = pz / 8;
          walker.update(1 / 90);
          var po = 'P' + pz + ' ';
          rig.legs.forEach(function (l) {
            var vv = new THREE.Vector3();
            l.joints[3].getWorldPosition(vv); model.worldToLocal(vv);
            po += l.name + '=' + vv.y.toFixed(3) + '@' + vv.z.toFixed(2) + ' ';
          });
          console.log(po);
        }
        walker.p = 0.12; walker.update(1 / 60);
      }
      renderer.render(scene, camera);
      var gl = renderer.getContext(), px = new Uint8Array(4);
      gl.readPixels(renderer.domElement.width >> 1, renderer.domElement.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      console.log('SHOT calls=' + renderer.info.render.calls + ' tris=' + renderer.info.render.triangles +
        ' geo=' + renderer.info.memory.geometries + ' px=' + Array.prototype.join.call(px, ',') +
        ' cam=' + camera.position.toArray().map(function (v) { return v.toFixed(1); }).join(','));
      rig.legs.forEach(function (l) {
        var v = new THREE.Vector3();
        l.joints[0].getWorldPosition(v); model.worldToLocal(v);
        var hy = v.y, hz = v.z;
        l.joints[3].getWorldPosition(v); model.worldToLocal(v);
        console.log('LEG ' + l.name + ' hip=' + hy.toFixed(2) + ',' + hz.toFixed(2) +
          ' fet=' + v.y.toFixed(3) + ',' + v.z.toFixed(2) + ' a=' + l.a.map(function (x) { return x.toFixed(2); }).join('/'));
      });
      console.log('SCENERY trees ' + scenery.trees.map(function (t) {
        return t.position.x.toFixed(0) + ',' + t.position.z.toFixed(0);
      }).join(' '));
      var cc = G.coatCanvas({ seed: 11, size: 64 });
      var cd = cc.getContext('2d').getImageData(32, 32, 1, 1).data;
      console.log('COAT px=' + Array.prototype.join.call(cd, ','));
      if (qs.get('ui') === '0') {
        var pl = document.querySelectorAll('.plate');
        for (var pi = 0; pi < pl.length; pi++) pl[pi].style.display = 'none';
      }
      var d = document.createElement('div');
      d.setAttribute('id', 'shotdata');
      d.textContent = renderer.domElement.toDataURL('image/png');
      document.body.appendChild(d);
      // keep compositing a few frames for plain --screenshot runs
      var nf = 0;
      (function tick() {
        renderer.render(scene, camera);
        if (++nf < 12) requestAnimationFrame(tick);
      })();
      return;
    }

    var acc = 0, frames = 0;
    var moved = 0;
    function frame() {
      var dt = Math.min(0.05, clock.getDelta());
      walker.update(dt);
      moved += walker.speed * dt;
      scenery.update(walker.speed * dt);
      G.groundTex.offset.y = moved / G.groundTile;
      orbit.update(dt);
      renderer.render(scene, camera);
      frames++; acc += dt;
      if (acc > 0.5) {
        ui.fps.textContent = Math.round(frames / acc);
        ui.read.textContent = (walker.speed).toFixed(2) + ' m/s · ' + walker.freq.toFixed(2) +
          ' Hz · ' + walker.gait + (walker.timeScale > 0 ? '' : ' · halted');
        frames = 0; acc = 0;
      }
      requestAnimationFrame(frame);
    }
    frame();
  }


  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window.G = window.G || {});
