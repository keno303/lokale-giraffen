/* Savanna environment: sky, ground, grass, acacias, rocks, sunlight. */
(function (G) {
  'use strict';

  var V = THREE.Vector3;
  var TAU = Math.PI * 2;

  function mulberry(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  G.World = function (scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sunDir = new V(0.44, 0.62, 0.55).normalize();
    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildGrass();
    this.buildTrees();
    this.buildRocks();
  };

  G.World.prototype.buildSky = function () {
    var geo = new THREE.SphereGeometry(480, 32, 20);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: G.col(0x1d5f9e) },
        uMid: { value: G.col(0x77a6cb) },
        uHorizon: { value: G.col(0xdbccb2) },
        uSun: { value: this.sunDir.clone() }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main() {',
        '  vDir = normalize(position);',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSun;',
        'varying vec3 vDir;',
        'void main() {',
        '  vec3 d = normalize(vDir);',
        '  float h = clamp(d.y, -0.15, 1.0);',
        '  vec3 col = mix(uHorizon, uMid, smoothstep(-0.03, 0.13, h));',
        '  col = mix(col, uTop, smoothstep(0.09, 0.62, h));',
        '  float sd = max(dot(d, normalize(uSun)), 0.0);',
        '  col += vec3(1.0, 0.82, 0.55) * pow(sd, 6.0) * 0.22;',
        '  col += vec3(1.0, 0.93, 0.78) * pow(sd, 420.0) * 1.4;',
        '  float band = exp(-pow((h - 0.02) * 9.0, 2.0));',
        '  col = mix(col, vec3(0.94, 0.88, 0.76), band * 0.16);',
        '  gl_FragColor = vec4(col, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '}'
      ].join('\n')
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  };

  G.World.prototype.buildLights = function () {
    var hemi = new THREE.HemisphereLight(G.col(0xb9d3ee), G.col(0xb59a6c), 0.50);
    this.scene.add(hemi);

    var sun = new THREE.DirectionalLight(G.col(0xfff2dc), 1.85);
    sun.position.copy(this.sunDir).multiplyScalar(30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    var e = 8.5;
    sun.shadow.camera.left = -e;
    sun.shadow.camera.right = e;
    sun.shadow.camera.top = e;
    sun.shadow.camera.bottom = -e;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.022;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    var fill = new THREE.DirectionalLight(G.col(0xcfe2ff), 0.22);
    fill.position.set(-14, 9, -18);
    this.scene.add(fill);

    var bounce = new THREE.DirectionalLight(G.col(0xffd9a8), 0.13);
    bounce.position.set(2, -6, 12);
    this.scene.add(bounce);
  };

  G.World.prototype.buildGround = function () {
    var tex = G.tex.ground();
    tex.repeat.set(58, 58);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;

    var geo = new THREE.PlaneGeometry(520, 520, 90, 90);
    geo.rotateX(-Math.PI / 2);
    var pos = geo.attributes.position;
    var col = new Float32Array(pos.count * 3);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i);
      var n = G.fbm2(x * 0.035 + 11.2, z * 0.035 - 4.7, 4);
      var n2 = G.fbm2(x * 0.13 - 2.0, z * 0.13 + 8.0, 3);
      var v = 0.80 + n * 0.34 + n2 * 0.10;
      var warm = 1.0 + (n - 0.5) * 0.10;
      col[i * 3] = v * warm;
      col[i * 3 + 1] = v;
      col[i * 3 + 2] = v * (1.02 - (n - 0.5) * 0.18);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    var mat = new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: tex,
      bumpScale: 0.035,
      roughness: 0.96,
      metalness: 0.0,
      vertexColors: true
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.ground.rotation.y = 0.3;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  };

  function tuftGeometry() {
    var w = 0.46, h = 0.38;
    var pos = [], uv = [], idx = [];
    var angles = [0, Math.PI / 3, (2 * Math.PI) / 3];
    for (var i = 0; i < angles.length; i++) {
      var a = angles[i];
      var ca = Math.cos(a), sa = Math.sin(a);
      var base = i * 4;
      var corners = [
        [-w / 2, 0], [w / 2, 0], [-w / 2, h], [w / 2, h]
      ];
      for (var c = 0; c < 4; c++) {
        var x = corners[c][0], y = corners[c][1];
        pos.push(x * ca, y, x * sa);
        uv.push(c % 2, c >= 2 ? 1 : 0);
      }
      idx.push(base + 0, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  G.World.prototype.buildGrass = function () {
    var rnd = mulberry(5150);
    var count = 46000;
    var geo = tuftGeometry();
    var mat = new THREE.MeshStandardMaterial({
      map: G.tex.grass(),
      alphaTest: 0.36,
      side: THREE.DoubleSide,
      roughness: 1.0,
      metalness: 0.0,
      color: 0xffffff
    });
    var grass = new THREE.InstancedMesh(geo, mat, count);
    grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var m = new THREE.Matrix4();
    var q = new THREE.Quaternion();
    var sc = new V();
    var p = new V();
    var color = new THREE.Color();
    for (var i = 0; i < count; i++) {
      var ang = rnd() * TAU;
      var rad = 2.4 + Math.pow(rnd(), 0.66) * 60;
      var x = Math.cos(ang) * rad;
      var z = Math.sin(ang) * rad;
      var y = 0;
      // sparse patches: skip some spots to create bare ground
      if (G.fbm2(x * 0.09, z * 0.09, 3) < 0.30 && rnd() < 0.86) {
        y = -2.0;
      }
      p.set(x, y, z);
      q.setFromAxisAngle(new V(0, 1, 0), rnd() * TAU);
      // keep tufts low so the animal's legs stay readable
      var s = 0.50 + rnd() * 0.55;
      sc.set(s * (0.8 + rnd() * 0.5), s * (0.7 + rnd() * 0.7), s);
      m.compose(p, q, sc);
      grass.setMatrixAt(i, m);
      var t = rnd();
      color.setRGB(0.78 + t * 0.22, 0.80 + t * 0.19, 0.70 + t * 0.2);
      grass.setColorAt(i, color);
    }
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    grass.frustumCulled = false;
    grass.receiveShadow = true;
    this.scene.add(grass);
    this.grass = grass;
  };

  G.World.prototype.tree = function (x, z, sc, seed) {
    var rnd = mulberry(seed);
    var g = new THREE.Group();
    var trunkMat = new THREE.MeshStandardMaterial({ color: G.col(0x50402f), roughness: 0.95 });
    var leafMat = new THREE.MeshStandardMaterial({ color: G.col(0x4b5a26), roughness: 0.98 });

    function limb(a, b, r0, r1, mat) {
      var d = new V().subVectors(b, a);
      var len = d.length();
      var geo = new THREE.CylinderGeometry(r1, r0, len, 7, 1, false);
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(a).addScaledVector(d, 0.5);
      G.basisQuat(d, new V(1, 0, 0), mesh.quaternion);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    }

    var h = 2.3 + rnd() * 1.5;
    var top = new V((rnd() - 0.5) * 0.4, h, (rnd() - 0.5) * 0.4);
    limb(new V(0, 0, 0), top, 0.30, 0.16, trunkMat);
    limb(top, top.clone().add(new V(0.5, 0.7, 0.3)), 0.16, 0.09, trunkMat);

    var canopyCount = 3 + Math.floor(rnd() * 3);
    var leafMat2 = leafMat.clone();
    leafMat2.color.setHSL(0.18 + rnd() * 0.05, 0.34 + rnd() * 0.12, 0.20 + rnd() * 0.05).convertSRGBToLinear();
    for (var i = 0; i < canopyCount; i++) {
      var ang = rnd() * TAU;
      var rad = 0.5 + rnd() * 2.1;
      var bx = top.x + Math.cos(ang) * rad;
      var bz = top.z + Math.sin(ang) * rad;
      var by = h + 0.5 + rnd() * 0.9;
      var tip = new V(bx, by + 0.35, bz);
      limb(top, tip, 0.11, 0.045, trunkMat);
      var cr = 1.1 + rnd() * 1.1;
      var blob = new THREE.Mesh(new THREE.SphereGeometry(cr, 12, 8), leafMat2);
      blob.position.set(bx, by + 0.5, bz);
      blob.scale.set(1.0 + rnd() * 0.35, 0.44 + rnd() * 0.20, 1.0 + rnd() * 0.35);
      blob.castShadow = true;
      blob.receiveShadow = true;
      g.add(blob);
    }
    // a broad flat crown
    var crown = new THREE.Mesh(new THREE.SphereGeometry(2.05, 18, 12), leafMat2);
    crown.position.set(top.x, h + 1.15, top.z);
    crown.scale.set(1.30, 0.46, 1.20);
    crown.castShadow = true;
    g.add(crown);

    g.position.set(x, 0, z);
    g.scale.setScalar(sc);
    g.rotation.y = rnd() * TAU;
    this.scene.add(g);
    return g;
  };

  G.World.prototype.buildTrees = function () {
    var rnd = mulberry(88991);
    var spots = [
      [-38, 34, 1.5], [18, -45, 1.2], [52, 8, 1.35], [-26, -38, 1.0],
      [12, 36, 0.9], [-58, -6, 1.15], [34, 40, 0.8], [2, 26, 0.7],
      [-9, 12, 0.55], [30, -18, 0.9]
    ];
    for (var i = 0; i < spots.length; i++) {
      this.tree(spots[i][0], spots[i][1], spots[i][2], 1000 + i * 37);
    }
    // a few low bushes
    var leafMat = new THREE.MeshStandardMaterial({ color: G.col(0x445322), roughness: 1 });
    for (var k = 0; k < 26; k++) {
      var a = rnd() * TAU, r = 8 + rnd() * 50;
      var b = new THREE.Mesh(new THREE.SphereGeometry(0.6 + rnd() * 0.9, 10, 7), leafMat);
      b.position.set(Math.cos(a) * r, 0.45, Math.sin(a) * r);
      b.scale.set(1.15, 0.78, 1.15);
      b.castShadow = true;
      b.receiveShadow = true;
      this.scene.add(b);
    }
  };

  G.World.prototype.buildRocks = function () {
    var rnd = mulberry(31337);
    var mat = new THREE.MeshStandardMaterial({ color: G.col(0x7b6d5b), roughness: 0.9, flatShading: true });
    for (var i = 0; i < 30; i++) {
      var a = rnd() * TAU, r = 6 + rnd() * 52;
      var x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(Math.hypot(x, z) - 22) < 3.5) continue;
      var s = 0.25 + Math.pow(rnd(), 2) * 1.3;
      var rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
      rock.position.set(x, s * 0.3, z);
      rock.scale.set(s * (0.8 + rnd() * 0.7), s * (0.4 + rnd() * 0.5), s * (0.8 + rnd() * 0.7));
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
    }
  };

  G.World.prototype.follow = function (pos) {
    var p = new V(pos.x, 0, pos.z);
    this.sun.position.copy(p).addScaledVector(this.sunDir, 34);
    this.sun.target.position.copy(p).add(new V(0, 2.4, 0));
    this.sun.target.updateMatrixWorld();
    this.sky.position.set(pos.x, 0, pos.z);
  };

})(window.G);
