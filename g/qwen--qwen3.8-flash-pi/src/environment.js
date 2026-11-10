/* giraffe-world / environment.js — sky, ground, hills, acacias, grass, dust.
   Everything is procedural; nothing is loaded from disk.                  */
(function (root) {
  'use strict';
  var GW = root.GW, M = GW.math, THREE = root.THREE;
  var T = GW.Textures, geo = GW.geo;
  var Env = GW.Env = {};

  Env.create = function (scene, renderer, opts) {
    opts = opts || {};
    var world = new THREE.Group();
    world.name = 'world';
    scene.add(world);
    var rnd = GW.Rand(opts.seed || 2024);

    /* ------------------------------------------------------------- sky --- */
    var skyTex = new THREE.CanvasTexture(T.sky());
    skyTex.mapping = THREE.EquirectangularReflectionMapping;
    skyTex.colorSpace = THREE.SRGBColorSpace;
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 40, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.name = 'sky';
    world.add(sky);

    /* ---------------------------------------------------------- lights --- */
    var sunDir = new THREE.Vector3(0.55, 0.72, 0.42).normalize();
    var sun = new THREE.DirectionalLight(0xfff2d8, 2.25);
    sun.position.copy(sunDir).multiplyScalar(45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera;
    sc.left = -19; sc.right = 19; sc.top = 19; sc.bottom = -19;
    sc.near = 1; sc.far = 130;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3.4;
    world.add(sun);
    world.add(sun.target);
    var bounce = new THREE.HemisphereLight(0xc6ddef, 0x9b8158, 1.05);
    world.add(bounce);
    var amb = new THREE.AmbientLight(0xf0e6d2, 0.22);
    world.add(amb);
    var rim = new THREE.DirectionalLight(0xffd9a0, 0.5);
    rim.position.set(-18, 9, -22);
    world.add(rim);

    /* ---------------------------------------------------------- ground --- */
    var gTex = new THREE.CanvasTexture(T.ground());
    gTex.wrapS = gTex.wrapT = THREE.RepeatWrapping;
    gTex.colorSpace = THREE.SRGBColorSpace;
    gTex.repeat.set(96, 96);
    gTex.anisotropy = Math.min(16, renderer ? renderer.capabilities.getMaxAnisotropy() : 1);
    var gBump = new THREE.CanvasTexture(T.groundBump());
    gBump.wrapS = gBump.wrapT = THREE.RepeatWrapping;
    gBump.repeat.set(96, 96);
    gBump.colorSpace = THREE.NoColorSpace;
    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(300, 72),
      new THREE.MeshStandardMaterial({ map: gTex, bumpMap: gBump, bumpScale: 0.55, roughness: 0.97, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.004;
    ground.receiveShadow = true;
    world.add(ground);

    /* a shallow track the giraffe tends to walk along */
    var track = new THREE.Mesh(
      new THREE.RingGeometry(27.6, 32.4, 96),
      new THREE.MeshStandardMaterial({ map: gTex, bumpMap: gBump, bumpScale: 0.4, roughness: 1, transparent: true, opacity: 0.55 }));
    track.rotation.x = -Math.PI / 2;
    track.position.y = -0.002;
    track.receiveShadow = true;
    world.add(track);

    /* ------------------------------------------------------ distant hills - */
    var hc = GW.canvas(1024, 256), hctx = hc.getContext('2d');
    hctx.clearRect(0, 0, 1024, 256);
    for (var layer = 0; layer < 3; layer++) {
      var colr = ['rgba(158,160,158,0.62)', 'rgba(150,142,124,0.8)', 'rgba(132,116,90,0.95)'][layer];
      hctx.fillStyle = colr;
      hctx.beginPath();
      hctx.moveTo(0, 256);
      var base = 176 - layer * 44, amp = 46 - layer * 11, wl = 110 + layer * 130;
      for (var x = 0; x <= 1024; x += 8) {
        var h = base + Math.sin(x / wl * 6.2 + layer * 2.1) * amp
          + Math.sin(x / (wl * 0.37) + layer) * amp * 0.5
          + GW.fbm(x / 1024, layer, 32, 3, layer * 7) * 30;
        if (GW.hash2(Math.floor(x / 128), layer, 1024, 5) > 0.82) h -= 34;  /* mesas */
        hctx.lineTo(x, h);
      }
      hctx.lineTo(1024, 256);
      hctx.closePath();
      hctx.fill();
      /* a few flat-topped acacia silhouettes on the ridges */
      hctx.fillStyle = 'rgba(84,76,62,' + (0.42 - layer * 0.1) + ')';
      for (var b = 0; b < 9; b++) {
        var bx = ((b * 137 + layer * 51) % 1024), by = base + 6 + (b % 3) * 8;
        hctx.fillRect(bx, by - 8, 2, 9);
        hctx.beginPath(); hctx.ellipse(bx + 1, by - 10, 12 + (b % 4) * 4, 3.4, 0, 0, 6.3); hctx.fill();
      }
    }
    var hillTex = new THREE.CanvasTexture(hc);
    hillTex.colorSpace = THREE.SRGBColorSpace;
    hillTex.wrapS = THREE.RepeatWrapping;
    var hills = new THREE.Mesh(
      new THREE.CylinderGeometry(258, 258, 74, 72, 1, true),
      new THREE.MeshBasicMaterial({ map: hillTex, transparent: true, side: THREE.BackSide, depthWrite: false, fog: false }));
    hills.position.y = 14.5;
    world.add(hills);

    /* ----------------------------------------------------------- acacias -- */
    function buildTree(seed) {
      var r2 = GW.Rand(seed);
      var barkParts = [], canopyParts = [];
      var m = new THREE.Matrix4();
      var h = 4.6 + r2() * 2.4;
      /* trunk: leaning, forking */
      var trunk = new THREE.Mesh(geo.loft({
        path: [[0, 0, 0], [0.35 * (r2() - 0.5), h * 0.42, 0], [0.2 * (r2() - 0.5), h * 0.78, 0], [0, h, 0]],
        radii: [[0.34, 0.36], [0.26, 0.28], [0.17, 0.18], [0.12, 0.12]],
        stations: 18, radial: 12, tile: 1, up: [0, 1, 0], caps: 'both',
        profile: function (n) { return geo.Profiles.round(n, 0.35); }
      }));
      trunk.updateMatrix();
      barkParts.push({ geometry: trunk.geometry, matrix: trunk.matrix.clone() });
      var nB = 3 + Math.floor(r2() * 3);
      for (var i = 0; i < nB; i++) {
        var a = i / nB * 6.28 + r2(), len = 1.5 + r2() * 1.8, up = 0.35 + r2() * 0.45;
        var bx = Math.cos(a), bz = Math.sin(a);
        var br = new THREE.Mesh(geo.loft({
          path: [[0, h * (0.72 + r2() * 0.14), 0],
          [bx * len * 0.5, h * 0.8 + up * len * 0.5, bz * len * 0.5],
          [bx * len, h * 0.86 + up * len, bz * len]],
          radii: [[0.13, 0.13], [0.09, 0.09], [0.05, 0.05]],
          stations: 10, radial: 8, tile: 1, up: [0, 1, 0], caps: 'both'
        }));
        br.updateMatrix();
        barkParts.push({ geometry: br.geometry, matrix: br.matrix.clone() });
        /* umbrella canopy plate */
        var cy = h * 0.86 + up * len + 0.25;
        var cw = 1.5 + r2() * 1.5;
        var cn = new THREE.Mesh(geo.loft({
          path: [[bx * len, cy - 0.35, bz * len], [bx * len, cy, bz * len], [bx * len, cy + 0.12, bz * len]],
          radii: [[cw * 0.42, cw * 0.42], [cw, cw * 0.5], [cw * 0.66, cw * 0.24]],
          stations: 10, radial: 16, tile: 1, up: [0, 1, 0], caps: 'both',
          profile: function (n) { return geo.Profiles.round(n, 0.9); }
        }));
        cn.updateMatrix();
        canopyParts.push({ geometry: cn.geometry, matrix: cn.matrix.clone() });
      }
      /* crown over the trunk */
      var crown = new THREE.Mesh(geo.loft({
        path: [[0, h + 0.1, 0], [0, h + 0.5, 0]],
        radii: [[1.9, 0.62], [1.1, 0.5]], stations: 6, radial: 16,
        up: [0, 1, 0], caps: 'both', profile: function (n) { return geo.Profiles.round(n, 0.9); }
      }));
      crown.updateMatrix();
      canopyParts.push({ geometry: crown.geometry, matrix: crown.matrix.clone() });
      return {
        bark: geo.merge(barkParts),
        canopy: geo.merge(canopyParts)
      };
    }
    var barkMat = new THREE.MeshStandardMaterial({
      color: 0xbdae99, roughness: 0.92, map: new THREE.CanvasTexture(T.bark())
    });
    barkMat.map.wrapS = barkMat.map.wrapT = THREE.RepeatWrapping;
    barkMat.map.colorSpace = THREE.SRGBColorSpace;
    barkMat.map.repeat.set(0.12, 0.12);
    var leafTex = new THREE.CanvasTexture(T.leaf({ seed: 13 }));
    leafTex.wrapS = leafTex.wrapT = THREE.RepeatWrapping;
    leafTex.repeat.set(6.5, 4.2);
    var leafCol = new THREE.CanvasTexture(T.leafColour());
    leafCol.wrapS = leafCol.wrapT = THREE.RepeatWrapping;
    leafCol.repeat.set(4, 2.6);
    leafCol.colorSpace = THREE.SRGBColorSpace;
    var canopyMat = new THREE.MeshStandardMaterial({
      color: 0x8f9a63, roughness: 0.95, map: leafCol, alphaMap: leafTex,
      alphaTest: 0.30, side: THREE.DoubleSide, flatShading: false
    });

    var variants = [buildTree(3), buildTree(17), buildTree(31)];
    var treeCount = 22;
    var barkIM = [], canopyIM = [];
    variants.forEach(function (v, vi) {
      var cnt = Math.ceil(treeCount / variants.length);
      var bi = new THREE.InstancedMesh(v.bark, barkMat, cnt);
      var ci = new THREE.InstancedMesh(v.canopy, canopyMat, cnt);
      bi.castShadow = ci.castShadow = true;
      bi.receiveShadow = ci.receiveShadow = true;
      barkIM.push(bi); canopyIM.push(ci);
      world.add(bi); world.add(ci);
    });
    var mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler();
    var pp = new THREE.Vector3(), ss = new THREE.Vector3();
    var slotIdx = variants.map(function () { return 0; });
    for (var t = 0; t < treeCount; t++) {
      var ang = rnd() * 6.283;
      var rad = 22 + rnd() * 120;
      var sc2 = 0.75 + rnd() * 0.9;
      pp.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      /* keep them off the walking track */
      if (pp.length() < 26) pp.multiplyScalar(26 / pp.length());
      if (pp.length() > 30 && pp.length() < 38) pp.multiplyScalar(38 / pp.length());
      ee.set(0, rnd() * 6.283, 0);
      qq.setFromEuler(ee);
      ss.set(sc2, sc2 * (0.85 + rnd() * 0.4), sc2);
      mm.compose(pp, qq, ss);
      var vi = t % variants.length;
      barkIM[vi].setMatrixAt(slotIdx[vi], mm);
      canopyIM[vi].setMatrixAt(slotIdx[vi], mm);
      slotIdx[vi]++;
    }
    variants.forEach(function (v, vi) {
      barkIM[vi].count = slotIdx[vi]; canopyIM[vi].count = slotIdx[vi];
      barkIM[vi].instanceMatrix.needsUpdate = true;
      canopyIM[vi].instanceMatrix.needsUpdate = true;
    });

    /* ------------------------------------------------------- grass layer -- */
    function tuftField(count, radius, inner, scale, seedN) {
      var g = new THREE.PlaneGeometry(1, 1);
      g.translate(0, 0.5, 0);
      var tex = new THREE.CanvasTexture(T.grass({ seed: seedN }));
      tex.colorSpace = THREE.SRGBColorSpace;
      var mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, alphaTest: 0.30, side: THREE.DoubleSide,
        roughness: 1, metalness: 0
      });
      var im = new THREE.InstancedMesh(g, mat, count);
      im.castShadow = false;
      im.receiveShadow = true;
      var rr = GW.Rand(seedN);
      for (var i = 0; i < count; i++) {
        var a = rr() * 6.283, r = inner + Math.sqrt(rr()) * (radius - inner);
        pp.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        var s = scale * (0.55 + rr() * 0.8);
        ee.set(0, rr() * 6.283, 0); qq.setFromEuler(ee);
        ss.set(s * (0.8 + rr() * 0.4), s, s);
        mm.compose(pp, qq, ss);
        im.setMatrixAt(i, mm);
      }
      im.instanceMatrix.needsUpdate = true;
      world.add(im);
      return im;
    }
    var grassA = tuftField(1700, 48, 2.2, 0.6, 5);
    var grassB = tuftField(900, 70, 6, 1.0, 9);

    /* cross-wise second blade set so tufts read from any angle */
    [grassA, grassB].forEach(function (im) {
      var g2 = new THREE.InstancedMesh(im.geometry, im.material, im.count);
      g2.receiveShadow = true;
      for (var i = 0; i < im.count; i++) {
        im.getMatrixAt(i, mm);
        var q = new THREE.Quaternion(); var p = new THREE.Vector3(); var sc3 = new THREE.Vector3();
        mm.decompose(p, q, sc3);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
        mm.compose(p, q, sc3);
        g2.setMatrixAt(i, mm);
      }
      g2.instanceMatrix.needsUpdate = true;
      world.add(g2);
    });

    /* ------------------------------------------------------ low bushes ---- */
    function bushGeo(seed) {
      var r3 = GW.Rand(seed), parts = [];
      var n = 4 + Math.floor(r3() * 3);
      for (var i2 = 0; i2 < n; i2++) {
        var g = new THREE.IcosahedronGeometry(0.5 + r3() * 0.35, 0);
        var m2 = new THREE.Matrix4().compose(
          new THREE.Vector3((r3() - 0.5) * 1.1, 0.28 + r3() * 0.5, (r3() - 0.5) * 1.1),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(r3(), r3() * 6, r3())),
          new THREE.Vector3(1, 0.62 + r3() * 0.3, 1));
        parts.push({ geometry: g, matrix: m2 });
      }
      return geo.merge(parts);
    }
    var bushMat = new THREE.MeshStandardMaterial({ color: 0x8b8358, roughness: 1, flatShading: true });
    var bushGeos = [bushGeo(5), bushGeo(19), bushGeo(44)];
    var bushIMs = bushGeos.map(function (g) {
      var im = new THREE.InstancedMesh(g, bushMat, 26);
      im.castShadow = true; im.receiveShadow = true;
      world.add(im); return im;
    });
    var bslot = [0, 0, 0];
    for (var bi = 0; bi < 72; bi++) {
      var ba = rnd() * 6.283, br = 12 + rnd() * 105;
      if (br > 13 && br < 44) br = 44 + rnd() * 60;
      pp.set(Math.cos(ba) * br, 0, Math.sin(ba) * br);
      var bs = 0.32 + rnd() * 0.62;
      ee.set(0, rnd() * 6.283, 0); qq.setFromEuler(ee);
      ss.set(bs * (0.95 + rnd() * 0.5), bs * (0.7 + rnd() * 0.35), bs * (0.95 + rnd() * 0.5));
      mm.compose(pp, qq, ss);
      var bvi = bi % 3;
      if (bslot[bvi] < 26) { bushIMs[bvi].setMatrixAt(bslot[bvi], mm); bslot[bvi]++; }
    }
    bushIMs.forEach(function (im, ix) { im.count = bslot[ix]; im.instanceMatrix.needsUpdate = true; });

    /* termite mounds: dark clay pillars, very savanna */
    var moundMat = new THREE.MeshStandardMaterial({ color: 0x7d5f42, roughness: 1, flatShading: true });
    var moundGeo = geo.loft({
      path: [[0, 0, 0], [0.1, 0.7, 0], [0.05, 1.5, 0], [0.12, 2.1, 0]],
      radii: [[0.75, 0.8], [0.55, 0.6], [0.35, 0.4], [0.2, 0.24]],
      stations: 12, radial: 10, up: [0, 1, 0], caps: 'both',
      profile: function (n) { return geo.Profiles.round(n, 0.5); }
    });
    var mounds = new THREE.InstancedMesh(moundGeo, moundMat, 14);
    mounds.castShadow = mounds.receiveShadow = true;
    for (var mi = 0; mi < 14; mi++) {
      var ma = rnd() * 6.283, mr = 18 + rnd() * 95;
      if (mr > 20 && mr < 42) mr += 24;
      pp.set(Math.cos(ma) * mr, -0.05, Math.sin(ma) * mr);
      ee.set((rnd() - 0.5) * 0.1, rnd() * 6.283, (rnd() - 0.5) * 0.1); qq.setFromEuler(ee);
      var ms = 0.6 + rnd() * 1.5;
      ss.set(ms * (0.8 + rnd() * 0.5), ms, ms * (0.8 + rnd() * 0.5));
      mm.compose(pp, qq, ss);
      mounds.setMatrixAt(mi, mm);
    }
    mounds.instanceMatrix.needsUpdate = true;
    world.add(mounds);

    /* ------------------------------------------------------------- rocks -- */
    var rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9184, roughness: 0.9, flatShading: true });
    var rg = new THREE.IcosahedronGeometry(0.6, 0);
    var rocks = new THREE.InstancedMesh(rg, rockMat, 26);
    rocks.castShadow = rocks.receiveShadow = true;
    for (var i = 0; i < 26; i++) {
      var a2 = rnd() * 6.283, r2d = 12 + rnd() * 95;
      if (r2d > 14 && r2d < 42) r2d += 30;
      pp.set(Math.cos(a2) * r2d, -0.1 * rnd(), Math.sin(a2) * r2d);
      ee.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283); qq.setFromEuler(ee);
      var s4 = 0.22 + rnd() * 0.85;
      ss.set(s4 * (1 + rnd()), s4 * (0.4 + rnd() * 0.5), s4 * (0.8 + rnd() * 0.6));
      mm.compose(pp, qq, ss);
      rocks.setMatrixAt(i, mm);
    }
    rocks.instanceMatrix.needsUpdate = true;
    world.add(rocks);

    /* ------------------------------------------------------------- dust -- */
    var dustTex = new THREE.CanvasTexture(T.dust());
    dustTex.colorSpace = THREE.SRGBColorSpace;
    var DUST = 90;
    var dg = new THREE.BufferGeometry();
    var dpos = new Float32Array(DUST * 3), dcol = new Float32Array(DUST * 3);
    dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    dg.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
    var dm = new THREE.PointsMaterial({
      size: 0.55, map: dustTex, transparent: true, depthWrite: false,
      vertexColors: true, opacity: 0.85, sizeAttenuation: true
    });
    var dust = new THREE.Points(dg, dm);
    dust.frustumCulled = false;
    world.add(dust);
    var parts = [];
    for (i = 0; i < DUST; i++) parts.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1 });
    var dp = 0;
    function puff(x, y, z, e, power) {
      var n = Math.round(2 + power * 6);
      for (var k = 0; k < n; k++) {
        var p = parts[dp % DUST]; dp++;
        p.life = 1;
        p.x = x + (Math.random() - 0.5) * 0.25;
        p.y = y + Math.random() * 0.06;
        p.z = z + (Math.random() - 0.5) * 0.25;
        var a = Math.random() * 6.283;
        p.vx = Math.cos(a) * (0.25 + Math.random() * 0.5) * power;
        p.vz = Math.sin(a) * (0.25 + Math.random() * 0.5) * power;
        p.vy = (0.15 + Math.random() * 0.35) * power;
        p.size = 0.5 + Math.random() * 0.9;
      }
    }
    function stepDust(dt) {
      for (var k = 0; k < DUST; k++) {
        var p = parts[k];
        if (p.life <= 0) { dpos[k * 3 + 1] = -50; dcol[k * 3] = 0; continue; }
        p.life -= dt * 0.55;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= dt * 0.25;
        p.vx *= 1 - dt * 1.2; p.vz *= 1 - dt * 1.2;
        dpos[k * 3] = p.x; dpos[k * 3 + 1] = p.y; dpos[k * 3 + 2] = p.z;
        var f = M.clamp01(p.life) * 0.85;
        dcol[k * 3] = f; dcol[k * 3 + 1] = f * 0.95; dcol[k * 3 + 2] = f * 0.82;
      }
      dg.attributes.position.needsUpdate = true;
      dg.attributes.color.needsUpdate = true;
    }

    /* ------------------------------------------------- floating motes -----
       airborne dust in the light: a slow drifting point cloud             */
    var MOTES = 260;
    var mg = new THREE.BufferGeometry();
    var mp = new Float32Array(MOTES * 3), mc = new Float32Array(MOTES * 3);
    var mv = [];
    for (var mi2 = 0; mi2 < MOTES; mi2++) {
      mp[mi2 * 3] = (rnd() - 0.5) * 46;
      mp[mi2 * 3 + 1] = 0.3 + rnd() * 7.5;
      mp[mi2 * 3 + 2] = (rnd() - 0.5) * 46;
      var b = 0.55 + rnd() * 0.45;
      mc[mi2 * 3] = b; mc[mi2 * 3 + 1] = b * 0.95; mc[mi2 * 3 + 2] = b * 0.85;
      mv.push({ ph: rnd() * 6.283, sp: 0.1 + rnd() * 0.35, y: rnd() * 6.283 });
    }
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    var motes = new THREE.Points(mg, new THREE.PointsMaterial({
      size: 0.075, map: dustTex, transparent: true, depthWrite: false,
      vertexColors: true, opacity: 0.5, sizeAttenuation: true
    }));
    motes.frustumCulled = false;
    world.add(motes);
    function driftMotes(time, cx, cz) {
      for (var k2 = 0; k2 < MOTES; k2++) {
        var m2 = mv[k2], i3 = k2 * 3;
        mp[i3] += Math.sin(time * 0.25 + m2.ph) * 0.004 + 0.004 * m2.sp;
        mp[i3 + 1] += Math.sin(time * 0.4 + m2.y) * 0.0016;
        mp[i3 + 2] += Math.cos(time * 0.2 + m2.ph) * 0.004;
        if (mp[i3] - cx > 23) mp[i3] -= 46; if (mp[i3] - cx < -23) mp[i3] += 46;
        if (mp[i3 + 2] - cz > 23) mp[i3 + 2] -= 46; if (mp[i3 + 2] - cz < -23) mp[i3 + 2] += 46;
      }
      mg.attributes.position.needsUpdate = true;
    }

    /* wind: grass sways by rotating the fields slightly (cheap, effective) */
    function sway(time) {
      grassA.rotation.z = Math.sin(time * 0.7) * 0.03;
      grassB.rotation.z = Math.sin(time * 0.5 + 1.3) * 0.045;
      grassA.rotation.x = Math.sin(time * 0.45 + 0.6) * 0.02;
      grassB.rotation.x = Math.sin(time * 0.35 + 2.1) * 0.03;
    }

    return {
      world: world, sun: sun, sky: sky, hills: hills, ground: ground,
      puff: puff, stepDust: stepDust, sway: sway, driftMotes: driftMotes,
      setSun: function (azDeg, elDeg) {
        var az = azDeg * M.DEG, el = elDeg * M.DEG;
        sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
        sun.position.copy(sunDir).multiplyScalar(45);
        sun.intensity = M.clamp(0.7 + Math.sin(el) * 2.4, 0.25, 3.0);
        bounce.intensity = 0.45 + Math.sin(el) * 0.5;
        var warm = M.clamp01(1 - Math.sin(el) * 1.6);
        sun.color.setRGB(1, M.mix(0.95, 0.72, warm), M.mix(0.86, 0.48, warm));
        skyTex.offset.x = -az / 6.283;
        hills.rotation.y = -az + 1.2;
        scene.fog.color.setRGB(M.mix(0.80, 0.90, Math.sin(el)), M.mix(0.74, 0.85, Math.sin(el)), M.mix(0.64, 0.78, Math.sin(el)));
      },
      follow: function (targetPos) {
        sun.position.copy(targetPos).addScaledVector(sunDir, 45);
        sun.target.position.copy(targetPos).setY(1.5);
        sky.position.copy(targetPos);
        hills.position.set(targetPos.x, 14.5, targetPos.z);
        ground.position.set(targetPos.x, -0.004, targetPos.z);
        track.position.set(targetPos.x, -0.002, targetPos.z);
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
