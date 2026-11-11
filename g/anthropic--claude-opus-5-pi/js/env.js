/* Savanna environment: ground, grass tufts, acacias, rocks, sky dome. */
(function (global) {
  'use strict';
  var THREE = global.THREE;
  var V3 = THREE.Vector3;

  function buildSky(scene, renderer) {
    var geo = new THREE.SphereGeometry(400, 32, 24);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x4a86c8) },
        mid: { value: new THREE.Color(0xa8c9e0) },
        hor: { value: new THREE.Color(0xe8ddc4) },
        sunDir: { value: new V3(0.45, 0.55, -0.70).normalize() }
      },
      vertexShader: [
        'varying vec3 vP;',
        'void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir;',
        'void main(){',
        ' float h = clamp(vP.y, -1.0, 1.0);',
        ' vec3 c = mix(hor, mid, smoothstep(-0.02, 0.22, h));',
        ' c = mix(c, top, smoothstep(0.18, 0.85, h));',
        ' float s = max(dot(vP, normalize(sunDir)), 0.0);',
        ' c += vec3(1.0,0.92,0.75) * pow(s, 24.0) * 0.55;',
        ' c += vec3(1.0,0.95,0.85) * pow(s, 4.0) * 0.10;',
        ' if (h < 0.0) c = mix(c, vec3(0.52,0.46,0.34), smoothstep(0.0,-0.25,h));',
        ' gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    var m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  }

  function groundTexture(size) {
    size = size || 1024;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var x = c.getContext('2d');
    var noise = new global.Noise.ValueNoise2D(991);
    var img = x.createImageData(size, size);
    var d = img.data;
    for (var j = 0; j < size; j++) {
      for (var i = 0; i < size; i++) {
        var u = i / size * 8, v = j / size * 8;
        var n = noise.fbm(u * 2.5, v * 2.5, 5, 2.1, 0.55) * 0.5 + 0.5;
        var patch = noise.fbm(u * 0.6, v * 0.6, 3) * 0.5 + 0.5;
        var grass = Math.pow(Math.max(0, noise.fbm(u * 24, v * 24, 2)), 1.0) * 0.5 + 0.5;
        var dry = 0.48 + 0.42 * patch;
        var r = 134 * dry + 34 * n;
        var g = 115 * dry + 29 * n;
        var b = 70 * dry + 19 * n;
        // greenish streaks
        var gr = Math.max(0, noise.noise(u * 3.1 + 10, v * 3.1));
        g += gr * 30; r -= gr * 12; b -= gr * 6;
        // scattered bare earth
        var bare = Math.max(0, noise.fbm(u * 1.7 + 31, v * 1.7, 3));
        r += bare * 30; g += bare * 16; b += bare * 6;
        var sp = grass * 22 - 11;
        var k = (j * size + i) * 4;
        d[k] = THREE.MathUtils.clamp(r + sp, 0, 255);
        d[k + 1] = THREE.MathUtils.clamp(g + sp, 0, 255);
        d[k + 2] = THREE.MathUtils.clamp(b + sp * 0.7, 0, 255);
        d[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }

  function buildGround(scene) {
    var tex = groundTexture(1024);
    tex.repeat.set(26, 26);
    var size = 420;
    var geo = new THREE.PlaneGeometry(size, size, 140, 140);
    geo.rotateX(-Math.PI / 2);
    var noise = new global.Noise.ValueNoise2D(77);
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i), z = p.getZ(i);
      var r = Math.sqrt(x * x + z * z);
      // keep a flat walking corridor near the centre, undulate far away
      var mask = THREE.MathUtils.smoothstep(r, 8, 48);
      var h = noise.fbm(x * 0.012, z * 0.012, 4) * 3.4 + noise.fbm(x * 0.06, z * 0.06, 3) * 0.45;
      p.setY(i, h * mask + noise.fbm(x * 0.5, z * 0.5, 2) * 0.012);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.99, metalness: 0, color: 0xb9ad92 });
    var m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }

  // ---- grass: instanced crossed billboard-ish blades (cheap + convincing) ----
  function bladeGeometry() {
    // a curved tapered quad strip
    var seg = 4, h = 1.0, w = 0.035;
    var pos = [], uv = [], idx = [];
    for (var i = 0; i <= seg; i++) {
      var t = i / seg;
      var y = t * h;
      var bend = t * t * 0.42;
      var ww = w * (1 - t * 0.9);
      pos.push(-ww, y, bend, ww, y, bend);
      uv.push(0, t, 1, t);
    }
    for (var j = 0; j < seg; j++) {
      var a = j * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function buildGrass(scene, count, heightFn) {
    var geo = bladeGeometry();
    var mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, vertexColors: false
    });
    mat.userData.u = { uTime: { value: 0 }, uWind: { value: 1.0 } };
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = mat.userData.u.uTime;
      sh.uniforms.uWind = mat.userData.u.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nvarying float vT;\nvarying vec3 vTint;\nattribute vec3 aTint;')
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'vT = uv.y; vTint = aTint;',
          'vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0);',
          'float ph = wp.x*0.7 + wp.z*0.55;',
          'float g = pow(uv.y, 1.7) * uWind;',
          'float s = sin(uTime*1.9 + ph) * 0.5 + sin(uTime*3.3 + ph*1.7) * 0.22;',
          'transformed.x += s * 0.16 * g;',
          'transformed.z += (sin(uTime*1.3 + ph*0.8)*0.35 + 0.45) * 0.14 * g;',
          'transformed.y -= g * 0.04 * abs(s);'
        ].join('\n'));
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vT;\nvarying vec3 vTint;')
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          'vec3 base = mix(vec3(0.33,0.30,0.16), vTint, pow(vT,0.7));',
          'diffuseColor.rgb *= base * (0.75 + 0.45*vT);'
        ].join('\n'));
    };

    var mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    var rnd = global.Noise.mulberry32(2024);
    var dummy = new THREE.Object3D();
    var tint = new Float32Array(count * 3);
    var col = new THREE.Color();
    for (var i = 0; i < count; i++) {
      // cluster the blades into tufts
      var ang = rnd() * Math.PI * 2;
      var rad = 2.0 + Math.pow(rnd(), 0.62) * 54;
      var cx = Math.cos(ang) * rad, cz = Math.sin(ang) * rad;
      var jx = (rnd() - 0.5) * 0.9, jz = (rnd() - 0.5) * 0.9;
      var x = cx + jx, z = cz + jz;
      var y = heightFn ? heightFn(x, z) : 0;
      dummy.position.set(x, y - 0.02, z);
      dummy.rotation.set((rnd() - 0.5) * 0.35, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
      var sc = 0.17 + rnd() * 0.30;
      var far = THREE.MathUtils.clamp(rad / 50, 0, 1);
      dummy.scale.set(0.7 + rnd() * 0.5, sc * (1 + far * 0.8), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      var hue = 0.11 + rnd() * 0.045;
      col.setHSL(hue, 0.30 + rnd() * 0.22, 0.34 + rnd() * 0.20);
      tint[i * 3] = col.r; tint[i * 3 + 1] = col.g; tint[i * 3 + 2] = col.b;
    }
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    return { mesh: mesh, mat: mat };
  }

  // ---------------------------------------------------------- acacia tree
  function buildAcacia(seed, scale) {
    var rnd = global.Noise.mulberry32(seed);
    var g = new THREE.Group();
    var barkMat = new THREE.MeshStandardMaterial({ color: 0x6b5a46, roughness: 0.95 });
    var segs = [];

    function branch(p0, dir, len, rad, depth) {
      var p1 = p0.clone().addScaledVector(dir, len);
      segs.push({ a: p0, b: p1, r0: rad, r1: rad * 0.68 });
      if (depth <= 0) return;
      var n = depth > 2 ? 2 : (rnd() < 0.7 ? 2 : 3);
      for (var i = 0; i < n; i++) {
        var axis = new V3(rnd() - 0.5, rnd() * 0.25, rnd() - 0.5).normalize();
        var nd = dir.clone().applyAxisAngle(axis, 0.42 + rnd() * 0.55);
        nd.y = Math.max(nd.y, 0.12);
        nd.normalize();
        branch(p1, nd, len * (0.62 + rnd() * 0.18), rad * 0.66, depth - 1);
      }
    }
    var trunkDir = new V3((rnd() - 0.5) * 0.18, 1, (rnd() - 0.5) * 0.18).normalize();
    branch(new V3(0, 0, 0), trunkDir, 2.6 + rnd() * 0.8, 0.20, 4);

    // build merged cylinders
    var geos = [];
    segs.forEach(function (s) {
      var h = s.a.distanceTo(s.b);
      var cy = new THREE.CylinderGeometry(s.r1, s.r0, h, 7, 1, true);
      cy.translate(0, h / 2, 0);
      var q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), new V3().subVectors(s.b, s.a).normalize());
      cy.applyQuaternion(q);
      cy.translate(s.a.x, s.a.y, s.a.z);
      geos.push(cy);
    });
    var trunk = mergePlain(geos);
    var tm = new THREE.Mesh(trunk, barkMat);
    tm.castShadow = true; tm.receiveShadow = true;
    g.add(tm);

    // flat-topped canopy: several squashed spheres
    var canopyMat = new THREE.MeshStandardMaterial({ color: 0x53612f, roughness: 0.95, flatShading: true });
    var tips = segs.filter(function (s) { return s.r0 < 0.07; });
    var cg = [];
    var top = 0;
    segs.forEach(function (s) { top = Math.max(top, s.b.y); });
    for (var i = 0; i < 14; i++) {
      var ang = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.5) * 2.6;
      var sp = new THREE.SphereGeometry(0.75 + rnd() * 0.75, 8, 6);
      sp.scale(1.25, 0.42 + rnd() * 0.16, 1.25);
      sp.translate(Math.cos(ang) * rr, top - 0.25 + rnd() * 0.45 - rr * 0.10, Math.sin(ang) * rr);
      cg.push(sp);
    }
    var cm = new THREE.Mesh(mergePlain(cg), canopyMat);
    cm.castShadow = true; cm.receiveShadow = true;
    g.add(cm);
    g.scale.setScalar(scale || 1);
    return g;
  }

  function mergePlain(list) {
    var tv = 0, ti = 0;
    list.forEach(function (g) {
      tv += g.attributes.position.count;
      ti += g.index ? g.index.count : g.attributes.position.count;
    });
    var pos = new Float32Array(tv * 3), nor = new Float32Array(tv * 3), uv = new Float32Array(tv * 2);
    var idx = tv > 65535 ? new Uint32Array(ti) : new Uint16Array(ti);
    var vo = 0, io = 0;
    list.forEach(function (g) {
      if (!g.attributes.normal) g.computeVertexNormals();
      var c = g.attributes.position.count;
      pos.set(g.attributes.position.array.subarray(0, c * 3), vo * 3);
      nor.set(g.attributes.normal.array.subarray(0, c * 3), vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, c * 2), vo * 2);
      if (g.index) { for (var i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; io += g.index.count; }
      else { for (var j = 0; j < c; j++) idx[io + j] = j + vo; io += c; }
      vo += c;
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  function buildScatter(scene, heightFn) {
    var rnd = global.Noise.mulberry32(8080);
    var trees = new THREE.Group();
    for (var i = 0; i < 16; i++) {
      var ang = rnd() * Math.PI * 2;
      var rad = 22 + Math.pow(rnd(), 0.55) * 95;
      var x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      var t = buildAcacia(1000 + i * 37, 0.85 + rnd() * 0.9);
      t.position.set(x, heightFn(x, z) - 0.05, z);
      t.rotation.y = rnd() * Math.PI * 2;
      trees.add(t);
    }
    scene.add(trees);

    // rocks
    var rockMat = new THREE.MeshStandardMaterial({ color: 0x8c8375, roughness: 0.98, flatShading: true });
    var rg = [];
    for (var r = 0; r < 42; r++) {
      var a2 = rnd() * Math.PI * 2, rr = 5 + Math.pow(rnd(), 0.5) * 70;
      var rx = Math.cos(a2) * rr, rz = Math.sin(a2) * rr;
      var s = 0.08 + Math.pow(rnd(), 2.2) * 0.65;
      var sp = new THREE.IcosahedronGeometry(s, 0);
      var pp = sp.attributes.position;
      for (var v = 0; v < pp.count; v++) {
        pp.setXYZ(v, pp.getX(v) * (0.7 + rnd() * 0.6), pp.getY(v) * (0.45 + rnd() * 0.4), pp.getZ(v) * (0.7 + rnd() * 0.6));
      }
      sp.computeVertexNormals();
      sp.translate(rx, heightFn(rx, rz) + s * 0.18, rz);
      rg.push(sp);
    }
    var rocks = new THREE.Mesh(mergePlain(rg), rockMat);
    rocks.castShadow = true; rocks.receiveShadow = true;
    scene.add(rocks);
    return { trees: trees, rocks: rocks };
  }

  global.Env = {
    buildSky: buildSky, buildGround: buildGround, buildGrass: buildGrass,
    buildScatter: buildScatter, buildAcacia: buildAcacia, mergePlain: mergePlain
  };
})(window);
