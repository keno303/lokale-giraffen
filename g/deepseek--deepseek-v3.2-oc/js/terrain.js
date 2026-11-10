/* ==========================================================================
   terrain.js — the savanna the giraffe walks through.

   Treadmill convention: the animal stays at the origin, the world scrolls
   toward -X at the gait speed.  Ground texture offset and every props' x
   position are driven from `belt` (metres travelled), so motion stays locked
   to the hooves exactly.

   Everything here is procedural: no image files, no loaders.
   ========================================================================== */
(function (GIR) {
  'use strict';
  var T = {};
  GIR.Terrain = T;

  var SKY_VS = [
    'varying vec3 vDir;',
    'void main() {',
    '  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var SKY_FS = [
    'uniform vec3 uZenith;',
    'uniform vec3 uHorizon;',
    'uniform vec3 uGround;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunCol;',
    'varying vec3 vDir;',
    'void main() {',
    '  float h = vDir.y;',
    '  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));',
    '  col = mix(col, uGround, clamp(-h * 3.2, 0.0, 1.0));',
    '  float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);',
    '  col += uSunCol * (pow(s, 620.0) * 1.6 + pow(s, 12.0) * 0.16 + pow(s, 2.5) * 0.05);',
    '  /* faint band of high cloud */',
    '  float band = smoothstep(0.02, 0.22, h) * (1.0 - smoothstep(0.26, 0.62, h));',
    '  col += vec3(0.10, 0.09, 0.07) * band * (0.55 + 0.45 * sin(vDir.x * 9.0 + vDir.z * 5.0));',
    '  gl_FragColor = vec4(col, 1.0);',
    '  #include <tonemapping_fragment>',
    '  #include <encodings_fragment>',
    '}'
  ].join('\n');

  /* ridge line far in the distance: a band of quads whose top edge follows
     fbm(theta), which reads as low hills without any terrain simulation. */
  function ridge(radius, base, amp, seed, segs) {
    var pos = [], idx = [], i;
    for (i = 0; i <= segs; i++) {
      var a = i / segs * Math.PI * 2;
      var x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      var h = base + amp * (GIR.fbm(Math.cos(a) * 2.2 + 4, Math.sin(a) * 2.2 + 4, 4, 0, seed) - 0.5) * 2;
      h += amp * 0.55 * GIR.fbm(Math.cos(a) * 7.0, Math.sin(a) * 7.0, 3, 0, seed + 7);
      pos.push(x, 0, z, x, h, z);
      if (i < segs) {
        var k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function acacia(mats, rng, scale) {
    var g = new THREE.Group();
    var h = (6.2 + rng() * 3.4) * scale;
    var lean = (rng() - 0.5) * 0.22;
    var trunk = new THREE.Mesh(GIR.Loft.bone([0, 0, 0], [lean * h, h * 0.96, 0], function (t) {
      var r = GIR.lerp(0.36, 0.15, Math.pow(t, 0.8)) * scale;
      return { w: r * (1 + 0.25 * Math.pow(1 - t, 2)), hi: r, lo: r * 1.1, sq: 2.0 };
    }, { seg: 10, samples: 10, side: [0, 0, 1], capScale: 0.7 }), mats.bark);
    g.add(trunk);
    /* a few stiff branches that hold the flat top */
    var nb = 4 + ((rng() * 3) | 0);
    for (var i = 0; i < nb; i++) {
      var bl = h * (0.34 + rng() * 0.3);
      var spread = 0.55 + rng() * 0.5;
      var br = new THREE.Mesh(GIR.Loft.bone([0, 0, 0], [bl * spread, bl, 0], function (t) {
        var r = GIR.lerp(0.13, 0.035, t) * scale;
        return { w: r, hi: r, lo: r, sq: 2.0 };
      }, { seg: 7, samples: 6, side: [0, 0, 1], capScale: 0.6 }), mats.bark);
      br.position.y = h * (0.52 + rng() * 0.36);
      br.rotation.y = rng() * GIR.TAU;
      g.add(br);
    }
    /* umbrella canopy: two flattened ragged shells */
    var cw = h * (0.85 + rng() * 0.35);
    for (var c = 0; c < 2; c++) {
      var sp = new THREE.SphereGeometry(cw, 18, 9);
      var m = new THREE.Mesh(sp, c ? mats.canopyBack : mats.canopy);
      m.scale.set(1, 0.22 + c * 0.1, 0.86);
      m.position.set(lean * h * (1.02 + c * 0.09), h * (1.02 + c * 0.09) + rng() * 0.3, 0);
      m.rotation.y = rng() * 3;
      g.add(m);
    }
    return g;
  }

  T.create = function (renderer, mats, opts) {
    opts = opts || {};
    var texSize = opts.texSize || 1024;
    var quality = opts.quality || 1;
    var rng = GIR.mulberry32(20261108);
    var group = new THREE.Group();
    group.name = 'terrain';

    var M_PER_TILE = 6.0;
    var XSPAN = 110, ZSPAN = 60;

    /* ------------------------------------------------------------ sky -- */
    var sunDir = new THREE.Vector3(0.42, 0.46, -0.78).normalize();
    /* app.js turns on ColorManagement, so these hex values are sRGB already */
    function srgb(h) { return new THREE.Color(h); }
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: srgb(0x2f66a0) },
        uHorizon: { value: srgb(0xd8c39a) },
        uGround: { value: srgb(0x7d7362) },
        uSunDir: { value: sunDir },
        uSunCol: { value: srgb(0xffe9c0) }
      },
      vertexShader: SKY_VS, fragmentShader: SKY_FS,
      side: THREE.BackSide, depthWrite: false, fog: false
    });
    var sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 16), skyMat);
    sky.name = 'sky';
    group.add(sky);

    /* ---------------------------------------------------------- ground -- */
    var groundTex = GIR.Skin.ground(texSize, { metres: M_PER_TILE });
    groundTex.repeat.set(XSPAN / M_PER_TILE, ZSPAN / M_PER_TILE);
    var groundMat = new THREE.MeshStandardMaterial({
      map: groundTex, roughness: 0.96, metalness: 0.0,
      color: 0xffffff
    });
    if (groundTex.bump) {
      groundMat.bumpMap = groundTex.bump;
      groundMat.bumpScale = 0.02;
    }
    var ground = new THREE.Mesh(new THREE.PlaneGeometry(XSPAN, ZSPAN, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    group.add(ground);

    /* near strip of trampled dust under the animal */
    var dustRing = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 28),
      new THREE.MeshStandardMaterial({ color: 0xa08b6c, roughness: 1.0, transparent: true, opacity: 0.30 }));
    dustRing.rotation.x = -Math.PI / 2;
    dustRing.position.y = 0.004;
    dustRing.receiveShadow = true;
    group.add(dustRing);

    /* --------------------------------------------------------- hills -- */
    var hillMat = new THREE.MeshBasicMaterial({ color: 0x9aa48f, fog: true, side: THREE.DoubleSide });
    var ridgeMat = new THREE.MeshBasicMaterial({ color: 0xb6ac92, fog: true, side: THREE.DoubleSide });
    var hills = [
      new THREE.Mesh(ridge(300, 26, 15, 91, 110), hillMat),
      new THREE.Mesh(ridge(165, 9, 6.5, 37, 90), ridgeMat)
    ];
    hills.forEach(function (m) { m.name = 'hills'; group.add(m); });

    /* --------------------------------------------------------- grass -- */
    var grassTex = GIR.Skin.grassTuft(256);
    var bladeGeo = new THREE.BufferGeometry();
    (function () {
      var p = [], n = [], uv = [], ind = [], k = 0;
      for (var c = 0; c < 3; c++) {
        var a = c / 3 * Math.PI + 0.4;
        var cx = Math.cos(a) * 0.06, cz = Math.sin(a) * 0.06;
        var w = 0.30, h = 0.42;
        var nx = Math.cos(a + Math.PI / 2), nz = Math.sin(a + Math.PI / 2);
        p.push(cx - nx * w, 0, cz - nz * w, cx + nx * w, 0, cz + nz * w,
               cx + nx * w * 0.25, h, cz + nz * w * 0.25, cx - nx * w * 0.25, h, cz - nz * w * 0.25);
        for (var i = 0; i < 4; i++) { n.push(nx, 0, nz); }
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        ind.push(k, k + 1, k + 2, k, k + 2, k + 3);
        k += 4;
      }
      bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      bladeGeo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
      bladeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      bladeGeo.setIndex(ind);
    })();
    var grassMat = new THREE.MeshStandardMaterial({
      map: grassTex, alphaMap: grassTex, alphaTest: 0.45,
      side: THREE.DoubleSide, roughness: 0.92, color: 0xb9b071
    });
    var GRASS_N = quality >= 2 ? 1400 : (quality >= 1 ? 760 : 260);
    var grass = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS_N);
    grass.castShadow = false;
    grass.receiveShadow = false;
    var gdat = [];
    var mtx = new THREE.Matrix4(), qtr = new THREE.Quaternion(), eul = new THREE.Euler(),
        scl = new THREE.Vector3(), pvt = new THREE.Vector3();
    for (var gi = 0; gi < GRASS_N; gi++) {
      var s = 0.55 + rng() * 1.5;
      gdat.push({
        x: -XSPAN / 2 + rng() * XSPAN,
        z: (rng() - 0.5) * ZSPAN * 0.92,
        r: rng() * Math.PI, s: s, lean: (rng() - 0.5) * 0.5,
        sway: rng() * GIR.TAU
      });
    }
    group.add(grass);
    grass.frustumCulled = false;

    /* -------------------------------------------------- rocks & twigs -- */
    var rockGeo = new THREE.IcosahedronGeometry(0.26, 0);
    (function () {
      var pa = rockGeo.attributes.position;
      for (var i = 0; i < pa.count; i++) {
        pa.setXYZ(i, pa.getX(i) * (0.7 + GIR.hashFloat(i, 3, 11) * 0.7),
                     pa.getY(i) * 0.45,
                     pa.getZ(i) * (0.7 + GIR.hashFloat(i, 5, 13) * 0.7));
      }
      rockGeo.computeVertexNormals();
    })();
    var ROCK_N = quality >= 1 ? 90 : 30;
    var rocks = new THREE.InstancedMesh(rockGeo, mats.rock, ROCK_N);
    var rdat = [];
    for (var ri = 0; ri < ROCK_N; ri++) {
      rdat.push({
        x: -XSPAN / 2 + rng() * XSPAN, z: (rng() - 0.5) * ZSPAN * 0.9,
        r: rng() * Math.PI * 2, s: 0.35 + rng() * 1.6
      });
    }
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    rocks.frustumCulled = false;
    group.add(rocks);

    /* --------------------------------------------------------- trees -- */
    var treeMats = { bark: mats.bark, canopy: mats.canopy, canopyBack: mats.canopyBack };
    var trees = [], TREE_GAP = 34, TREE_N = 10;
    for (var ti = 0; ti < TREE_N; ti++) {
      var tr = acacia(treeMats, rng, 1);
      tr.position.set(-XSPAN / 2 + ti * TREE_GAP + rng() * 8, 0, (rng() - 0.5) * 46);
      tr.traverse(function (o) { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      group.add(tr);
      trees.push(tr);
    }
    var treeSpan = TREE_N * TREE_GAP;

    /* ------------------------------------------------------ dust motes -- */
    var DUST_N = quality >= 1 ? 500 : 120;
    var dpos = new Float32Array(DUST_N * 3), dvel = [];
    for (var di = 0; di < DUST_N; di++) {
      dpos[di * 3] = (rng() - 0.5) * 22;
      dpos[di * 3 + 1] = rng() * 4.2;
      dpos[di * 3 + 2] = (rng() - 0.5) * 12;
      dvel.push({ rise: 0.02 + rng() * 0.06, ph: rng() * GIR.TAU });
    }
    var dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3));
    var dust = new THREE.Points(dgeo, new THREE.PointsMaterial({
      color: 0xdcc7a0, size: 0.022, sizeAttenuation: true,
      transparent: true, opacity: 0.55, depthWrite: false, fog: true
    }));
    dust.name = 'dust';
    dust.frustumCulled = false;
    group.add(dust);

    /* ----------------------------------------------------------- api -- */
    var api = {
      group: group, sky: sky, ground: ground, grass: grass, rocks: rocks,
      trees: trees, dust: dust, sunDir: sunDir,
      materials: { ground: groundMat, grass: grassMat, hill: hillMat, sky: skyMat },
      time: 0,
      setGroundColour: function (c) { groundMat.color.set(c); },
      update: function (dt, belt, v) {
        api.time += dt;
        var i, d, m;
        /* ground texture: sample offset grows so the pattern drifts toward -X */
        groundTex.offset.x = belt / M_PER_TILE;
        if (groundTex.bump) groundTex.bump.offset.x = groundTex.offset.x;

        var wind = 0.35 + v * 0.25;
        for (i = 0; i < GRASS_N; i++) {
          d = gdat[i];
          d.x -= v * dt;
          if (d.x < -XSPAN / 2) d.x += XSPAN;
          if (d.x > XSPAN / 2) d.x -= XSPAN;
          var bend = d.lean + Math.sin(api.time * 1.6 + d.sway) * 0.09 * wind;
          eul.set(bend, d.r, 0);
          qtr.setFromEuler(eul);
          pvt.set(d.x, 0, d.z);
          scl.set(d.s, d.s * (1 + 0.2 * Math.sin(api.time + d.sway)), d.s);
          mtx.compose(pvt, qtr, scl);
          grass.setMatrixAt(i, mtx);
        }
        grass.instanceMatrix.needsUpdate = true;

        for (i = 0; i < ROCK_N; i++) {
          d = rdat[i];
          d.x -= v * dt;
          if (d.x < -XSPAN / 2) d.x += XSPAN;
          if (d.x > XSPAN / 2) d.x -= XSPAN;
          eul.set(0, d.r, 0);
          qtr.setFromEuler(eul);
          pvt.set(d.x, 0.02 * d.s, d.z);
          scl.set(d.s, d.s * 0.8, d.s);
          mtx.compose(pvt, qtr, scl);
          rocks.setMatrixAt(i, mtx);
        }
        rocks.instanceMatrix.needsUpdate = true;

        for (i = 0; i < trees.length; i++) {
          var tr = trees[i];
          tr.position.x -= v * dt;
          if (tr.position.x < -XSPAN / 2 - 10) tr.position.x += treeSpan;
          if (tr.position.x > XSPAN / 2 + 10) tr.position.x -= treeSpan;
        }

        var pa = dgeo.attributes.position.array;
        for (i = 0; i < DUST_N; i++) {
          var k3 = i * 3;
          pa[k3] -= (v * 0.55 + 0.25) * dt;
          pa[k3 + 1] += dvel[i].rise * dt;
          pa[k3 + 2] += Math.sin(api.time * 0.7 + dvel[i].ph) * 0.06 * dt;
          if (pa[k3] < -11) pa[k3] += 22;
          if (pa[k3 + 1] > 4.4) pa[k3 + 1] = 0.02;
        }
        dgeo.attributes.position.needsUpdate = true;

        /* keep the distant rings centred on the animal so they never drift off */
        hills[0].position.x = -belt;
        hills[1].position.x = -belt;
        sky.position.x = 0;
      },
      setTextureSize: function (size) {
        /* rebuild the ground texture at a new resolution */
        var t2 = GIR.Skin.ground(size, { metres: M_PER_TILE });
        t2.repeat.set(XSPAN / M_PER_TILE, ZSPAN / M_PER_TILE);
        t2.offset.x = groundTex.offset.x;
        groundMat.map = t2;
        groundMat.bumpMap = t2.bump || null;
        groundMat.needsUpdate = true;
        groundTex.dispose && groundTex.dispose();
        groundTex = t2;
      },
      dispose: function () {
        grass.dispose && grass.dispose();
        rocks.dispose && rocks.dispose();
      }
    };
    api.update(0, 0, 0);
    return api;
  };

})(window.GIR);
