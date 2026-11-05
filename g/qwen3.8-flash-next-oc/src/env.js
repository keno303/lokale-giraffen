/* env.js — savanna stage: gradient sky, warm sun with shadows, scrolling
 * ground, acacias, rocks, grass and hoof dust. Props recycle so the giraffe
 * appears to walk forever without ever leaving the origin. */
(function (G) {
  'use strict';

  var SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.55).normalize();
  var LOOP_X = 230;   // recycling period along X

  function skyMaterial() {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        sunDir: { value: SUN_DIR },
        top: { value: new THREE.Color(0x5f8fc4) },
        mid: { value: new THREE.Color(0xaebdd0) },
        horizon: { value: new THREE.Color(0xe6d3a8) }
      },
      vertexShader:
        'varying vec3 vDir; void main(){ vDir = normalize(position);' +
        ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'varying vec3 vDir; uniform vec3 sunDir, top, mid, horizon;' +
        ' void main(){' +
        '   float y = vDir.y;' +
        '   vec3 c = mix(horizon, mid, smoothstep(0.0, 0.28, y));' +
        '   c = mix(c, top, smoothstep(0.18, 0.85, y));' +
        '   c = mix(vec3(0.42,0.36,0.27), c, smoothstep(-0.06, 0.02, y));' +
        '   float s = max(dot(vDir, sunDir), 0.0);' +
        '   c += vec3(1.0,0.86,0.62) * (pow(s, 220.0)*1.4 + pow(s, 8.0)*0.16);' +
        '   gl_FragColor = vec4(c, 1.0); }'
    });
  }

  function makeAcacia(rand, mats) {
    var g = new THREE.Group();
    var trunkH = 3.2 + rand() * 1.6;
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.42, trunkH, 8), mats.trunk);
    trunk.position.y = trunkH / 2;
    trunk.rotation.z = (rand() - 0.5) * 0.16;
    trunk.castShadow = true;
    g.add(trunk);
    // flat canopy: two or three squashed blobs
    var n = 2 + ((rand() * 2) | 0);
    for (var i = 0; i < n; i++) {
      var r = 1.9 + rand() * 1.5;
      var blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mats.canopy);
      blob.scale.set(1, 0.30 + rand() * 0.1, 1);
      blob.position.set((rand() - 0.5) * 2.2, trunkH + 0.4 + rand() * 0.9, (rand() - 0.5) * 2.2);
      blob.rotation.y = rand() * 3;
      blob.castShadow = true;
      g.add(blob);
    }
    var s = 0.75 + rand() * 1.1;
    g.scale.setScalar(s);
    return g;
  }

  G.buildEnv = function (scene, tex) {
    var rand = G.rng(90210);
    var api = { props: [] };

    var mats = {
      trunk: new THREE.MeshStandardMaterial({ color: G.col(0x5d462e), roughness: 1 }),
      canopy: new THREE.MeshStandardMaterial({ color: G.col(0x55612c), roughness: 1, flatShading: true }),
      rock: new THREE.MeshStandardMaterial({ color: G.col(0x7d766a), roughness: 1, flatShading: true }),
      grass: new THREE.MeshStandardMaterial({
        color: G.col(0x8d7f47), roughness: 1, side: THREE.DoubleSide, transparent: true
      })
    };
    api.mats = mats;

    /* sky dome */
    var sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMaterial());
    sky.frustumCulled = false;
    scene.add(sky);

    /* fog matched to the horizon colour */
    scene.fog = new THREE.FogExp2(0xdfcda4, 0.0092);

    /* lights: warm key sun + sky/ground fill */
    var sun = new THREE.DirectionalLight(0xffe6bd, 1.55);
    sun.position.copy(SUN_DIR).multiplyScalar(60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    var sc = sun.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10;
    sc.near = 30; sc.far = 110;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    scene.add(new THREE.HemisphereLight(0xa8c4e0, 0x9a8258, 0.5));
    scene.add(new THREE.AmbientLight(0xffefdc, 0.12));

    /* ground */
    tex.ground.repeat.set(36, 36);           // ~19 m per tile on a 700 m plane
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    api.groundTex = tex.ground;

    /* recycling props: acacias, rocks */
    function scatter(count, factory, zMin, zMax) {
      for (var i = 0; i < count; i++) {
        var o = factory(rand, mats);
        o.position.set(rand() * LOOP_X - 80, 0, zMin + rand() * (zMax - zMin));
        scene.add(o);
        api.props.push(o);
      }
    }
    scatter(16, makeAcacia, -85, -12);
    scatter(16, makeAcacia, 12, 85);
    scatter(18, function (r) {
      var m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + r() * 0.9, 0), mats.rock);
      m.scale.set(1, 0.45 + r() * 0.3, 1.1);
      m.rotation.y = r() * 3;
      m.castShadow = true;
      return m;
    }, -40, 40);

    /* instanced dry-grass tufts (three crossed billboards each) */
    var tuftGeo = new THREE.BufferGeometry();
    (function () {
      var pos = [];
      for (var k = 0; k < 3; k++) {
        var a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a);
        // one tapered quad
        pos.push(-0.13 * c, 0, -0.13 * s, 0.13 * c, 0, 0.13 * s, 0.09 * c, 0.4, 0.09 * s);
        pos.push(-0.13 * c, 0, -0.13 * s, 0.09 * c, 0.4, 0.09 * s, -0.09 * c, 0.4, -0.09 * s);
      }
      tuftGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      tuftGeo.computeVertexNormals();
    })();
    var GRASS_N = 260;
    var grass = new THREE.InstancedMesh(tuftGeo, mats.grass, GRASS_N);
    grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    var gData = [];
    var mtx = new THREE.Matrix4(), qt = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    for (var i = 0; i < GRASS_N; i++) {
      gData.push({
        x: rand() * LOOP_X - 80, z: (rand() < 0.5 ? -1 : 1) * (2.2 + rand() * 30),
        y: 0, s: 0.30 + rand() * 0.45, r: rand() * Math.PI * 2
      });
    }
    scene.add(grass);
    api.grass = grass; api.gData = gData;
    function placeGrass() {
      for (var i = 0; i < GRASS_N; i++) {
        var d = gData[i];
        pv.set(d.x, d.y, d.z);
        qt.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.r);
        sv.set(d.s, d.s, d.s);
        mtx.compose(pv, qt, sv);
        grass.setMatrixAt(i, mtx);
      }
      grass.instanceMatrix.needsUpdate = true;
    }
    placeGrass();

    /* hoof dust: point sprites puffed when a hoof lands */
    var DUST_N = 140;
    var dPos = new Float32Array(DUST_N * 3);
    var dVel = new Float32Array(DUST_N * 3);
    var dLife = new Float32Array(DUST_N);
    var dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: G.col(0xd9c193), size: 0.16, transparent: true, opacity: 0.38, depthWrite: false,
      sizeAttenuation: true
    }));
    dust.frustumCulled = false;
    scene.add(dust);
    var dustHead = 0;
    api.emitDust = function (p, amount) {
      for (var k = 0; k < amount; k++) {
        var i = dustHead = (dustHead + 1) % DUST_N;
        dPos[i * 3] = p.x + (rand() - 0.5) * 0.25;
        dPos[i * 3 + 1] = 0.04 + rand() * 0.08;
        dPos[i * 3 + 2] = p.z + (rand() - 0.5) * 0.25;
        dVel[i * 3] = (rand() - 0.5) * 0.5;
        dVel[i * 3 + 1] = 0.15 + rand() * 0.35;
        dVel[i * 3 + 2] = (rand() - 0.5) * 0.5;
        dLife[i] = 0.9 + rand() * 0.7;
      }
    };

    /* advance world scroll: ground texture, props, grass, dust */
    api.update = function (dt, v) {
      var dx = v * dt;
      api.groundTex.offset.x += dx / 19.44;    // one tile = 700/36 m
      for (var i = 0; i < api.props.length; i++) {
        var o = api.props[i];
        o.position.x -= dx;
        if (o.position.x < -110) {
          o.position.x += LOOP_X;
          o.position.z = (rand() < 0.5 ? -1 : 1) * (12 + rand() * 75);
          o.rotation.y = rand() * Math.PI * 2;
        }
      }
      for (i = 0; i < GRASS_N; i++) {
        gData[i].x -= dx;
        if (gData[i].x < -60) { gData[i].x += LOOP_X; gData[i].z = (rand() < 0.5 ? -1 : 1) * (2.2 + rand() * 30); }
      }
      placeGrass();
      // dust physics (drifts backward with the treadmill world)
      for (i = 0; i < DUST_N; i++) {
        if (dLife[i] <= 0) continue;
        dLife[i] -= dt;
        dPos[i * 3] += dVel[i * 3] * dt - dx;
        dPos[i * 3 + 1] += dVel[i * 3 + 1] * dt;
        dPos[i * 3 + 2] += dVel[i * 3 + 2] * dt;
        dVel[i * 3 + 1] -= 0.35 * dt;
        if (dLife[i] <= 0) dPos[i * 3 + 1] = -10;
      }
      dustGeo.getAttribute('position').needsUpdate = true;
    };
    return api;
  };
})(window.G);
