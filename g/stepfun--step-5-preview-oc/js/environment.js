/* ------------------------------------------------------------------
 * environment.js -- savanna: sky dome, scrolling ground, acacias,
 * grass tufts, rocks, sun + bounce lighting.
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var api = factory(root.THREE, root.GX, root.TEX);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ENV = api;
})(typeof self !== 'undefined' ? self : globalThis, function (THREE, GX, TEX) {
  'use strict';

  var clamp = GX.clamp;

  function build(tex) {
    var scene = new THREE.Scene();
    scene.name = 'savanna';
    var g = { scene: scene, props: [], update: update, sun: null, dispose: dispose };

    /* ---------------- sky ---------------- */
    var skyGeo = new THREE.SphereGeometry(400, 40, 24);
    var skyMat = new THREE.MeshBasicMaterial({
      map: tex ? tex.sky : null,
      color: tex ? 0xffffff : 0x9fc4de,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    });
    var sky = new THREE.Mesh(skyGeo, skyMat);
    sky.name = 'sky';
    scene.add(sky);
    g.sky = sky;

    /* ---------------- lighting ---------------- */
    // Sun low and to the right, matching the glow in the sky texture.
    var sunDir = new THREE.Vector3(0.52, 0.62, 0.58).normalize();
    var sun = new THREE.DirectionalLight(0xfff2d8, 2.5);
    sun.position.copy(sunDir).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 170;
    var sc = 14;
    sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
    sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.target.position.set(0, 1.8, 0);
    scene.add(sun);
    scene.add(sun.target);
    g.sun = sun;
    g.sunDir = sunDir;

    scene.add(new THREE.HemisphereLight(0xbdd7f2, 0x8a7448, 0.85));
    var bounce = new THREE.DirectionalLight(0xd8c39a, 0.42);
    bounce.position.set(-8, 5, -10);
    scene.add(bounce);

    /* ---------------- ground ---------------- */
    var GROUND_SIZE = 320;      // metres
    var GROUND_TILE = 2.3;      // metres per texture repeat
    var groundMat = new THREE.MeshStandardMaterial({
      map: tex ? tex.ground : null,
      color: tex ? 0xffffff : 0x9c8355,
      roughness: 0.98,
      metalness: 0.0
    });
    if (tex && tex.ground) {
      tex.ground.repeat.set(GROUND_SIZE / GROUND_TILE, GROUND_SIZE / GROUND_TILE);
      tex.ground.wrapS = tex.ground.wrapT = THREE.RepeatWrapping;
      tex.ground.anisotropy = 8;
    }
    var groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.name = 'ground';
    scene.add(ground);
    g.ground = ground;
    g.groundTile = GROUND_TILE;

    /* ---------------- acacia trees ---------------- */
    var barkMat = new THREE.MeshStandardMaterial({
      map: tex ? tex.bark : null, color: tex ? 0xffffff : 0x5a4632,
      roughness: 0.95, metalness: 0
    });
    var canopyMat = new THREE.MeshStandardMaterial({
      map: tex ? tex.canopy : null, color: tex ? 0xffffff : 0x5d6b38,
      roughness: 0.92, metalness: 0
    });

    function makeTree(x, z, scale) {
      var t = new THREE.Group();
      var h = 5.2 * scale;
      var trunkPts = [
        [0.30 * scale, 0], [0.28 * scale, h * 0.25],
        [0.22 * scale, h * 0.55], [0.15 * scale, h * 0.8], [0.10 * scale, h]
      ];
      var trunk = GX.lathe(trunkPts, 12);
      var tm = new THREE.Mesh(trunk, barkMat);
      tm.castShadow = true;
      t.add(tm);
      // two main limbs
      for (var i = 0; i < 2; i++) {
        var s = i === 0 ? 1 : -1;
        var lp = [
          [0.10 * scale, h * 0.72], [0.09 * scale, h * 0.82],
          [0.07 * scale, h * 0.9], [0.05 * scale, h * 0.97]
        ];
        var limb = GX.lathe(lp, 8);
        var lm = new THREE.Mesh(limb, barkMat);
        lm.position.set(s * 0.16 * scale, 0, 0);
        lm.rotation.z = -s * 0.55;
        lm.castShadow = true;
        t.add(lm);
      }
      // flat umbrella canopy (acacia silhouette)
      var disc = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      disc.scale(1.55 * scale, 0.42 * scale, 1.5 * scale);
      var cm = new THREE.Mesh(disc, canopyMat);
      cm.position.y = h * 0.96;
      cm.castShadow = true;
      t.add(cm);

      var disc2 = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      disc2.scale(1.05 * scale, 0.30 * scale, 1.0 * scale);
      var cm2 = new THREE.Mesh(disc2, canopyMat);
      cm2.position.set(0.85 * scale, h * 0.82, 0.25 * scale);
      cm2.castShadow = true;
      t.add(cm2);

      t.position.set(x, 0, z);
      t.rotation.y = Math.random() * 6.28;
      scene.add(t);
      return t;
    }

    /* ---------------- grass tufts ---------------- */
    var grassMat = new THREE.MeshStandardMaterial({
      map: tex ? tex.grass : null,
      color: tex ? 0xffffff : 0x7d8a4a,
      roughness: 0.95, metalness: 0,
      transparent: true, alphaTest: 0.35, side: THREE.DoubleSide
    });
    var grassGeo = new THREE.PlaneGeometry(1.1, 0.75, 1, 1);
    grassGeo.rotateX(-Math.PI / 2);
    var GRASS = 260;
    var grass = new THREE.InstancedMesh(grassGeo, grassMat, GRASS);
    grass.receiveShadow = true;
    grass.castShadow = false;
    grass.name = 'grass';
    var dummy = new THREE.Object3D();
    scene.add(grass);
    g.grass = grass;

    /* ---------------- rocks ---------------- */
    var rockMat = new THREE.MeshStandardMaterial({
      color: 0x8b8378, roughness: 0.9, metalness: 0, flatShading: true
    });
    var rockGeo = new THREE.IcosahedronGeometry(1, 0);
    var ROCKS = 34;
    var rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCKS);
    rocks.castShadow = true; rocks.receiveShadow = true;
    scene.add(rocks);
    g.rocks = rocks;

    /* ---------------- distant hills ---------------- */
    var hillMat = new THREE.MeshStandardMaterial({
      color: 0x7d7a5c, roughness: 1.0, metalness: 0, fog: true
    });
    var hills = new THREE.Group();
    for (var hi = 0; hi < 14; hi++) {
      var hr = 26 + Math.random() * 34;
      var hg = new THREE.SphereGeometry(hr, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      var hm = new THREE.Mesh(hg, hillMat);
      var ang = Math.random() * Math.PI * 2;
      var dist = 130 + Math.random() * 90;
      hm.position.set(Math.cos(ang) * dist, -hr * 0.28, Math.sin(ang) * dist);
      hm.scale.set(1, 0.42 + Math.random() * 0.3, 1);
      hills.add(hm);
    }
    scene.add(hills);
    g.hills = hills;

    /* ---------------- props registry (scrolling world) ---------------- */
    // Each prop carries an x position that is recycled as it passes behind.
    g.props = [];
    for (var ti = 0; ti < 16; ti++) {
      var side = ti % 2 === 0 ? 1 : -1;
      var px = (Math.random() - 0.5) * 150;
      var pz = side * (9 + Math.random() * 42);
      var sc2 = 0.75 + Math.random() * 0.85;
      g.props.push({ obj: makeTree(px, pz, sc2), x: px, z: pz, s: sc2 });
    }

    var grassState = [];
    for (var gi = 0; gi < GRASS; gi++) {
      var gxp = (Math.random() - 0.5) * 150;
      var gzp = (Math.random() - 0.5) * 110;
      var gs = 0.6 + Math.random() * 1.1;
      if (Math.abs(gxp) < 4.5 && Math.abs(gzp) < 4.5) { gxp += 7; }
      grassState.push({ x: gxp, z: gzp, s: gs, r: Math.random() * 6.28 });
    }
    var rockState = [];
    for (var ri = 0; ri < ROCKS; ri++) {
      var rxp = (Math.random() - 0.5) * 130;
      var rzp = (Math.random() - 0.5) * 90;
      rockState.push({
        x: rxp, z: rzp, s: 0.25 + Math.random() * 0.75,
        ry: Math.random() * 6.28, rx: Math.random() * 0.5
      });
    }
    g.grassState = grassState;
    g.rockState = rockState;

    // fog
    scene.fog = new THREE.Fog(0xd9d6c8, 45, 210);

    /* ---------------- update: scroll the world ---------------- */
    var SPAN = 150;
    function update(dt, distance, speed) {
      var dx = speed * dt;

      // ground texture scrolls so the pattern streams past (world moves -X)
      if (tex && tex.ground) {
        tex.ground.offset.x += dx / GROUND_TILE;
      }

      // recycle trees / grass / rocks
      var i2, p;
      for (i2 = 0; i2 < g.props.length; i2++) {
        p = g.props[i2];
        p.x -= dx;
        if (p.x < -SPAN * 0.5) p.x += SPAN;
        else if (p.x > SPAN * 0.5) p.x -= SPAN;
        p.obj.position.x = p.x;
      }
      for (i2 = 0; i2 < grassState.length; i2++) {
        var gs2 = grassState[i2];
        gs2.x -= dx;
        if (gs2.x < -75) gs2.x += 150;
        else if (gs2.x > 75) gs2.x -= 150;
      }
      for (i2 = 0; i2 < rockState.length; i2++) {
        var rs = rockState[i2];
        rs.x -= dx;
        if (rs.x < -65) rs.x += 130;
        else if (rs.x > 65) rs.x -= 130;
      }

      // write instance matrices
      for (i2 = 0; i2 < grassState.length; i2++) {
        var gs3 = grassState[i2];
        dummy.position.set(gs3.x, 0.34 * gs3.s, gs3.z);
        dummy.rotation.set(0, gs3.r, 0);
        dummy.scale.set(gs3.s, 0.8 + gs3.s * 0.5, gs3.s);
        dummy.updateMatrix();
        grass.setMatrixAt(i2, dummy.matrix);
      }
      grass.instanceMatrix.needsUpdate = true;

      for (i2 = 0; i2 < rockState.length; i2++) {
        var rs2 = rockState[i2];
        dummy.position.set(rs2.x, rs2.s * 0.28, rs2.z);
        dummy.rotation.set(rs2.rx, rs2.ry, 0);
        dummy.scale.set(rs2.s, rs2.s * 0.7, rs2.s * 1.1);
        dummy.updateMatrix();
        rocks.setMatrixAt(i2, dummy.matrix);
      }
      rocks.instanceMatrix.needsUpdate = true;
    }

    /* renderer hook so the environment map can be generated lazily */
    var _renderer = null;
    g.setRenderer = function (r) {
      _renderer = r;
      if (!tex || !tex.sky || !THREE.PMREMGenerator || scene.environment) return;
      try {
        var pm = new THREE.PMREMGenerator(r);
        pm.compileEquirectangularShader();
        var env = pm.fromEquirectangular(tex.sky);
        scene.environment = env.texture;
        g.envTexture = env.texture;
        pm.dispose();
      } catch (e) {
        console.warn('environment map unavailable:', e);
      }
    };

    function dispose() {
      scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
    }

    return g;
  }

  return { build: build };
});
