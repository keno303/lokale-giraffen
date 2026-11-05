// ---------------------------------------------------------------------------
// 40_world.js -- sky, sun, ground, grass, acacias, rocks
// ---------------------------------------------------------------------------
window.G = window.G || {};
(function (G) {
  'use strict';
  const srgb = (h) => new THREE.Color(h).convertSRGBToLinear();

  // ---------- procedural textures -----------------------------------------
  G.groundTexture = function () {
    const S = 512, cv = G.canvas(S, S), c = cv.getContext('2d');
    const img = c.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const u = x / S * 8, v = y / S * 8;
      const n = G.fbm(u, v, 4, 3);
      const n2 = G.fbm(u * 4 + 20, v * 4, 3, 11);
      const dry = G.smooth(0.35, 0.72, n);
      // dry straw <-> dusty earth <-> sparse green
      let r = G.mix(0.55, 0.70, dry), g = G.mix(0.46, 0.56, dry), b = G.mix(0.33, 0.38, dry);
      const green = G.smooth(0.62, 0.85, n2) * 0.8;
      r = G.mix(r, 0.36, green); g = G.mix(g, 0.42, green); b = G.mix(b, 0.22, green);
      const speck = G.noise2(x * 0.9, y * 0.9, 5);
      const k = 0.86 + 0.3 * speck;
      d[i] = r * k * 255; d[i + 1] = g * k * 255; d[i + 2] = b * k * 255; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    // grass strokes
    c.globalAlpha = 0.5;
    for (let i = 0; i < 4200; i++) {
      const x = Math.random() * S, y = Math.random() * S, l = 2 + Math.random() * 7;
      const t = Math.random();
      c.strokeStyle = t < 0.55 ? 'rgba(150,138,80,0.55)' : t < 0.8 ? 'rgba(110,116,62,0.5)' : 'rgba(188,172,124,0.5)';
      c.lineWidth = 0.8 + Math.random();
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 3, y - l); c.stroke();
    }
    c.globalAlpha = 1;
    return G.tex(cv, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, srgb: true, aniso: 8, repeat: [26, 26] });
  };

  G.grassTuftTexture = function () {
    const S = 128, cv = G.canvas(S, S), c = cv.getContext('2d');
    c.clearRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
      const x = 8 + Math.random() * (S - 16);
      const h = 40 + Math.random() * 80;
      const bend = (Math.random() - 0.5) * 34;
      const w = 1.6 + Math.random() * 2.6;
      const t = Math.random();
      const col = t < 0.45 ? [186, 168, 106] : t < 0.75 ? [146, 150, 84] : [210, 192, 138];
      const grad = c.createLinearGradient(0, S, 0, S - h);
      grad.addColorStop(0, 'rgba(' + (col[0] * 0.78 | 0) + ',' + (col[1] * 0.76 | 0) + ',' + (col[2] * 0.72 | 0) + ',1)');
      grad.addColorStop(1, 'rgba(' + Math.min(255, col[0] * 1.18 | 0) + ',' + Math.min(255, col[1] * 1.14 | 0) + ',' + col[2] + ',0.95)');
      c.strokeStyle = grad; c.lineWidth = w * 1.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, S);
      c.quadraticCurveTo(x + bend * 0.3, S - h * 0.55, x + bend, S - h);
      c.stroke();
    }
    return G.tex(cv, { srgb: true });
  };

  G.barkTexture = function () {
    const W = 128, H = 256, cv = G.canvas(W, H), c = cv.getContext('2d');
    const img = c.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = G.fbm(x * 0.10, y * 0.02, 4, 9);
      const crack = G.smooth(0.42, 0.52, G.noise2(x * 0.35, y * 0.06, 4));
      const k = (0.5 + 0.5 * n) * (0.55 + 0.45 * crack);
      d[i] = 0.42 * k * 255; d[i + 1] = 0.35 * k * 255; d[i + 2] = 0.28 * k * 255; d[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    return G.tex(cv, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, srgb: true, repeat: [2, 2] });
  };

  // ---------- sky ----------------------------------------------------------
  G.Sky = function () {
    const geo = new THREE.SphereGeometry(1200, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: srgb(0x3f7fc4) },
        uHor: { value: srgb(0xcfd8cf) },
        uHaze: { value: srgb(0xd9cdae) },
        uSun: { value: new THREE.Vector3(0.4, 0.5, 0.3) },
        uSunCol: { value: srgb(0xfff2d0) },
        uSunI: { value: 1 }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vP;',
        'uniform vec3 uTop, uHor, uHaze, uSunCol; uniform vec3 uSun; uniform float uSunI;',
        'void main(){',
        '  vec3 d = normalize(vP);',
        '  vec3 col = mix(uHor, uTop, pow(clamp(d.y,0.0,1.0), 0.62));',
        '  col = mix(col, uHaze, smoothstep(0.06, -0.10, d.y));',
        '  float s = clamp(dot(d, normalize(uSun)), 0.0, 1.0);',
        '  col += uSunCol * (pow(s, 1400.0) * 9.0 + pow(s, 22.0) * 0.5 + pow(s, 4.0) * 0.12) * uSunI;',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  };

  // ---------- vegetation ---------------------------------------------------
  G.makeGrass = function (n, radius, tex) {
    // two crossed quads per tuft, instanced
    const g1 = new THREE.PlaneGeometry(1, 1, 1, 3);
    g1.translate(0, 0.5, 0);
    const g2 = g1.clone();
    g2.rotateY(Math.PI / 2);
    const merged = mergeGeos([g1, g2]);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.42, side: THREE.DoubleSide,
      roughness: 0.95, metalness: 0
    });
    const t = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = t;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
        '#include <begin_vertex>',
        ['#include <begin_vertex>',
          '#ifdef USE_INSTANCING',
          '  float ph = instanceMatrix[3][0]*0.7 + instanceMatrix[3][2]*0.9;',
          '  float sway = sin(uTime*1.5 + ph) * 0.16 + sin(uTime*3.7 + ph*1.7)*0.05;',
          '  transformed.x += sway * transformed.y * transformed.y;',
          '  transformed.z += sway * 0.5 * transformed.y * transformed.y;',
          '#endif'].join('\n'));
    };
    const mesh = new THREE.InstancedMesh(merged, mat, n);
    mesh.receiveShadow = false; mesh.castShadow = false;
    const r = G.rng(99);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = r() * G.TAU, rad = Math.sqrt(r()) * radius;
      p.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      const h = 0.16 + r() * 0.38, w = 0.26 + r() * 0.3;
      q.setFromEuler(new THREE.Euler(0, r() * G.TAU, 0));
      s.set(w, h, w);
      mesh.setMatrixAt(i, m4.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.userData.time = t;
    return mesh;
  };

  function mergeGeos(list) {
    let vc = 0, ic = 0;
    list.forEach((g) => { vc += g.attributes.position.count; ic += g.index.count; });
    const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
    const idx = new Uint32Array(ic);
    let vo = 0, io = 0;
    list.forEach((g) => {
      pos.set(g.attributes.position.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      uv.set(g.attributes.uv.array, vo * 2);
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
      vo += g.attributes.position.count; io += ix.length;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  G.makeAcacia = function (tex, seed) {
    const r = G.rng(seed);
    const g = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0xb9ab98 });
    const H = r.range(4.5, 8.5);
    // trunk: tapered, slightly bent
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push(new THREE.Vector3(Math.sin(t * 2 + seed) * 0.25 * t, t * H * 0.72, Math.cos(t * 1.7 + seed) * 0.2 * t));
    }
    const cv = G.curve(pts, false);
    const L = new G.Loft(9, 8);
    const st = G.stations(9);
    for (let i = 0; i < 9; i++) {
      const t = i / 8, S = st[i];
      cv.at(t, S.c);
      cv.at(Math.min(1, t + 0.02), _a); cv.at(Math.max(0, t - 0.02), _b);
      S.dt.copy(_a).sub(_b).normalize();
      S.dr.set(1, 0, 0).addScaledVector(S.dt, S.dt.x).normalize();
      S.du.crossVectors(S.dt, S.dr).normalize();
      S.rx = S.ry = G.lerp(0.34, 0.13, t);
      S.p = 2.2; S.u0 = t * 0.6; S.v0 = 0.1;
      S.topFade = 1; S.bellyFade = 1; S.topTone = 1; S.bellyTone = 1;
    }
    L.update(st);
    const trunk = new THREE.Mesh(L.geometry, bark);
    trunk.castShadow = true; trunk.receiveShadow = true;
    g.add(trunk);
    // branches + flat canopy
    const leafMat = new THREE.MeshStandardMaterial({ color: srgb(0x6a7a41), roughness: 1, flatShading: true });
    const nb = 4 + r.int(0, 3);
    const canopy = [];
    for (let i = 0; i < nb; i++) {
      const a = r() * G.TAU, len = r.range(1.2, 2.6);
      const bg = new THREE.CylinderGeometry(0.055, 0.13, len, 6);
      bg.translate(0, len / 2, 0);
      const bm = new THREE.Mesh(bg, bark);
      bm.position.set(Math.sin(a) * 0.15, H * 0.70 + r.range(-0.3, 0.5), Math.cos(a) * 0.15);
      bm.rotation.set(Math.cos(a) * r.range(0.5, 0.9), 0, -Math.sin(a) * r.range(0.5, 0.9));
      bm.castShadow = true;
      g.add(bm);
      canopy.push(new THREE.Vector3(bm.position.x + Math.sin(a) * len * 0.55, bm.position.y + len * 0.5, bm.position.z + Math.cos(a) * len * 0.55));
    }
    canopy.push(new THREE.Vector3(0, H * 0.78 + 0.5, 0));
    canopy.forEach((c) => {
      const rr = r.range(1.5, 2.8);
      const sg = new THREE.IcosahedronGeometry(rr, 1);
      const pa = sg.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const n = 1 + (G.noise2(pa.getX(i) * 1.7 + c.x, pa.getZ(i) * 1.7 + c.z, 3) - 0.5) * 0.6;
        pa.setXYZ(i, pa.getX(i) * n, pa.getY(i) * n * 0.42, pa.getZ(i) * n);
      }
      sg.computeVertexNormals();
      const m = new THREE.Mesh(sg, leafMat);
      m.position.copy(c);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    });
    return g;
  };
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

  G.makeRock = function (seed) {
    const r = G.rng(seed);
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const n = 0.75 + G.noise2(pa.getX(i) * 2 + seed, pa.getZ(i) * 2, 6) * 0.6;
      pa.setXYZ(i, pa.getX(i) * n, pa.getY(i) * n * 0.6, pa.getZ(i) * n);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: srgb(0x8b8477), roughness: 1, flatShading: true }));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };
})(window.G);
