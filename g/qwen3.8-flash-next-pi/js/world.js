/* world.js - savanna: sky dome, sun, ground, wrapping grass, acacias, hills */
(function (G) {
  'use strict';
  const V = THREE.Vector3;

  function sky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x4f7fb5) },
        mid: { value: new THREE.Color(0xa8c4dc) },
        hor: { value: new THREE.Color(0xe4d3ae) },
        sunCol: { value: new THREE.Color(0xfff4d6) },
        sunDir: { value: new THREE.Vector3(-0.5, 0.42, -0.36).normalize() },
        haziness: { value: 0.55 }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: [
        'varying vec3 vP;',
        'uniform vec3 top,mid,hor,sunCol,sunDir; uniform float haziness;',
        'float h(float a,float b,float x){return clamp((x-a)/(b-a),0.0,1.0);}',
        'void main(){',
        '  vec3 d=normalize(vP);',
        '  float y=max(d.y,0.0);',
        '  vec3 c=mix(hor,mid,smoothstep(0.0,0.16,pow(y,0.55)));',
        '  c=mix(c,top,smoothstep(0.10,0.85,pow(y,0.7)));',
        '  float s=max(dot(d,normalize(sunDir)),0.0);',
        '  c+=sunCol*pow(s,320.0)*2.2;',
        '  c+=sunCol*pow(s,14.0)*0.32*haziness;',
        '  c+=sunCol*pow(s,3.0)*0.10*haziness;',
        '  float below=clamp(-d.y*6.0,0.0,1.0);',
        '  c=mix(c,hor*0.92,below*0.85);',
        '  c+= (fract(sin(dot(d.xy,vec2(12.9898,78.233)))*43758.5453)-0.5)*0.004;',
        '  gl_FragColor=vec4(c,1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <colorspace_fragment>',
        '}'
      ].join('\n')
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(700, 40, 24), mat);
    m.frustumCulled = false;
    return m;
  }

  function ground(tex) {
    const g = new THREE.PlaneGeometry(1400, 1400, 64, 64);
    /* bake a slow fbm into vertex colours so the plain is not one flat tone */
    const posA = g.attributes.position, cols = new Float32Array(posA.count * 3);
    const h = (x, y) => { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); };
    const nz = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) +
             h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
    };
    for (let i = 0; i < posA.count; i++) {
      const x = posA.getX(i) * 0.013, y = posA.getY(i) * 0.013;
      let n = 0.6 * nz(x, y) + 0.3 * nz(x * 2.7 + 11, y * 2.7 - 7) + 0.1 * nz(x * 7.1 - 5, y * 7.1 + 3);
      n = 0.80 + 0.34 * n;                       /* 0.80 .. 1.14 */
      cols[i * 3] = n * 1.02; cols[i * 3 + 1] = n * 0.99; cols[i * 3 + 2] = n * 0.93;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const t = tex.clone(); t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1400 / 7, 1400 / 7);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    return mesh;
  }

  /* ---- instanced grass blades (crossed quads) ---- */
  function grass(btex, count, band) {
    const q = new THREE.PlaneGeometry(1, 1);
    q.translate(0, 0.5, 0);
    const geo = new THREE.BufferGeometry();
    const pos = [], nor = [], uv = [], idx = [];
    function addQuad(rot) {
      const base = pos.length / 3;
      const c = Math.cos(rot), s = Math.sin(rot);
      const corners = [[-0.5, 0, 0], [0.5, 0, 0], [0.5, 1, 0], [-0.5, 1, 0]];
      for (const p of corners) { pos.push(p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c); nor.push(Math.sin(rot), 0.25, Math.cos(rot)); }
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    addQuad(0); addQuad(Math.PI / 2); addQuad(Math.PI / 4);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({
      map: btex, transparent: false, alphaTest: 0.35, side: THREE.DoubleSide,
      roughness: 0.95, metalness: 0, color: 0xe4d8b4
    });
    const im = new THREE.InstancedMesh(geo, mat, count);
    im.castShadow = false; im.receiveShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    let seed = 4242;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const data = [];
    for (let i = 0; i < count; i++) {
      const x = (rnd() * 2 - 1) * 42;
      const z = (rnd() * 2 - 1) * band;
      const h = 0.16 + rnd() * 0.42, w = 0.20 + rnd() * 0.30, rot = rnd() * Math.PI;
      data.push({ x: x, z: z, h: h, w: w, rot: rot });
    }
    im.userData = { data: data, band: band, M: M, Q: Q, S: S, P: P, rnd: rnd };
    function place(i) {
      const d = data[i];
      P.set(d.x, 0, d.z); Q.setFromAxisAngle(new V(0, 1, 0), d.rot); S.set(d.w, d.h, d.w);
      M.compose(P, Q, S); im.setMatrixAt(i, M);
    }
    for (let i = 0; i < count; i++) place(i);
    im.instanceMatrix.needsUpdate = true;
    im.userData.place = place;
    return im;
  }

  /* ---- acacia tree ---- */
  function acacia(seed) {
    const g = new THREE.Group();
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const bark = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.95 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x6d7a44, roughness: 0.9, flatShading: true });
    const h = 4.5 + rnd() * 4.5;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.42, h, 7, 1), bark);
    trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
    const nBr = 3 + (rnd() * 3 | 0);
    for (let i = 0; i < nBr; i++) {
      const a = rnd() * 6.283, L = 1.1 + rnd() * 1.4;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, L, 5), bark);
      b.position.set(Math.cos(a) * L * 0.35, h * (0.72 + rnd() * 0.2), Math.sin(a) * L * 0.35);
      b.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      b.castShadow = true; g.add(b);
    }
    const nC = 2 + (rnd() * 3 | 0);
    for (let i = 0; i < nC; i++) {
      const a = rnd() * 6.283, r = rnd() * 1.6;
      const c = new THREE.Mesh(new THREE.SphereGeometry(1.6 + rnd() * 1.5, 10, 6), leaf);
      c.scale.set(1, 0.30 + rnd() * 0.14, 1);
      c.position.set(Math.cos(a) * r, h + 0.5 + rnd() * 1.1, Math.sin(a) * r);
      c.castShadow = true; g.add(c);
    }
    return g;
  }

  function rock(seed) {
    let s = seed;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4 + rnd() * 0.7, 0),
      new THREE.MeshStandardMaterial({ color: 0x8b8272, roughness: 1, flatShading: true }));
    m.scale.set(1 + rnd(), 0.45 + rnd() * 0.5, 0.8 + rnd() * 0.7);
    m.position.y = 0.05; m.rotation.y = rnd() * 3;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  /* distant hill silhouettes */
  function hills() {
    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xa89e88, fog: true });
    let s = 99;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 34; i++) {
      const a = (i / 26) * 6.2832 + rnd() * 0.12;
      const r = 430 + rnd() * 90;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat);
      m.position.set(Math.cos(a) * r, -6 - rnd() * 8, Math.sin(a) * r);
      m.scale.set(120 + rnd() * 180, 22 + rnd() * 46, 110 + rnd() * 140);
      grp.add(m);
    }
    return grp;
  }

  G.world = { sky: sky, ground: ground, grass: grass, acacia: acacia, rock: rock, hills: hills };
})(window.G = window.G || {});
