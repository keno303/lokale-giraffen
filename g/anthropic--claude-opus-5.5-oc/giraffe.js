/* Realistic procedural walking giraffe – plain Three.js (r147), no build step. */
(function () {
  'use strict';

  THREE.ColorManagement.legacyMode = false;

  const V3 = THREE.Vector3;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const frac = (x) => x - Math.floor(x);
  const sgnpow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

  const params = new URLSearchParams(location.search);

  // ---------- seeded random + value noise ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(1234567);
  function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
  function vnoise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    const n = (a, b, c) => hash3(xi + a, yi + b, zi + c);
    const x00 = lerp(n(0, 0, 0), n(1, 0, 0), xf), x10 = lerp(n(0, 1, 0), n(1, 1, 0), xf);
    const x01 = lerp(n(0, 0, 1), n(1, 0, 1), xf), x11 = lerp(n(0, 1, 1), n(1, 1, 1), xf);
    return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
  }
  function fbm2(x, y, oct) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise3(x * f, y * f, 0.5); f *= 2.03; a *= 0.5; } return s; }

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 4000);
  camera.position.set(9, 4, 9);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 2;
  controls.maxDistance = 120;

  // ---------- lighting & sky ----------
  const hemi = new THREE.HemisphereLight(0xbcd3f0, 0x8a7350, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const sunDir = new V3(0.55, 0.55, 0.35).normalize();

  const skyUniforms = {
    uSunDir: { value: sunDir.clone() },
    uZenith: { value: new THREE.Color(0x2f6bc0) },
    uHorizon: { value: new THREE.Color(0xe9dcc4) },
    uSunCol: { value: new THREE.Color(0xfff0d0) },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uSunDir, uZenith, uHorizon, uSunCol; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
        col = mix(col, uHorizon*0.92, smoothstep(0.0, -0.08, d.y));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunCol * (pow(s, 900.0)*12.0 + pow(s, 40.0)*0.35 + pow(s, 6.0)*0.12);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.FogExp2(0xe2d6bf, 0.0028);

  function setTimeOfDay(t) {
    // t: 0 = early morning, 0.5 = noon, 1 = evening
    const elev = lerp(0.12, 1.05, Math.sin(Math.PI * clamp(t, 0, 1)));
    const az = lerp(-1.6, 1.6, t) + 0.6;
    sunDir.set(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az)).normalize();
    skyUniforms.uSunDir.value.copy(sunDir);
    const warm = 1 - smooth(0.15, 0.75, Math.sin(elev));
    sun.color.setRGB(1.0, lerp(0.95, 0.72, warm), lerp(0.88, 0.5, warm));
    sun.intensity = lerp(2.7, 1.9, warm);
    skyUniforms.uHorizon.value.setRGB(lerp(0.56, 0.85, warm), lerp(0.62, 0.58, warm), lerp(0.70, 0.40, warm));
    skyUniforms.uZenith.value.setRGB(lerp(0.05, 0.12, warm), lerp(0.16, 0.18, warm), lerp(0.48, 0.42, warm));
    scene.fog.color.copy(skyUniforms.uHorizon.value).multiplyScalar(0.95);
    hemi.intensity = lerp(0.8, 0.6, warm);
  }

  // ---------- geometry helpers ----------
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }
  // keys: array of arrays; t in [0, n-1] (index space)
  function sampleKeysIdx(keys, t) {
    const n = keys.length;
    const i = clamp(Math.floor(t), 0, n - 2), f = t - i;
    const k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, n - 1)];
    return k1.map((_, c) => catmull(k0[c], k1[c], k2[c], k3[c], f));
  }
  // keys where channel 0 is a distance; returns values at distance d
  function sampleKeysDist(keys, d) {
    const n = keys.length;
    if (d <= keys[0][0]) return keys[0].slice();
    if (d >= keys[n - 1][0]) return keys[n - 1].slice();
    let i = 0; while (i < n - 2 && d > keys[i + 1][0]) i++;
    const f = (d - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
    const k0 = keys[Math.max(i - 1, 0)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(i + 2, n - 1)];
    return k1.map((_, c) => catmull(k0[c], k1[c], k2[c], k3[c], f));
  }

  // Build an indexed geometry from rings of points (wrapping), with optional caps & skinning.
  function gridGeometry(rings, opts) {
    opts = opts || {};
    const R = rings[0].pts.length, N = rings.length;
    const pos = [], pat = [], si = [], sw = [], idx = [];
    const patFn = opts.patFn || (() => [1, 1, 0]);
    const pushV = (p, ring) => {
      pos.push(p.x, p.y, p.z);
      pat.push.apply(pat, patFn(p, ring));
      if (ring.skin) { si.push.apply(si, ring.skin.i); sw.push.apply(sw, ring.skin.w); }
    };
    rings.forEach((r) => r.pts.forEach((p) => pushV(p, r)));
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < R; j++) {
        const a = i * R + j, b = i * R + (j + 1) % R, c = (i + 1) * R + j, d = (i + 1) * R + (j + 1) % R;
        idx.push(a, b, c, b, d, c);
      }
    }
    const centroid = (r) => r.pts.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / r.pts.length);
    if (opts.capStart) {
      const cs = pos.length / 3; const c = centroid(rings[0]); if (opts.capStartOffset) c.add(opts.capStartOffset);
      pushV(c, rings[0]);
      for (let j = 0; j < R; j++) idx.push(cs, (j + 1) % R, j);
    }
    if (opts.capEnd) {
      const ce = pos.length / 3; const c = centroid(rings[N - 1]); if (opts.capEndOffset) c.add(opts.capEndOffset);
      pushV(c, rings[N - 1]);
      const o = (N - 1) * R;
      for (let j = 0; j < R; j++) idx.push(ce, o + j, o + (j + 1) % R);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(pat, 3));
    if (si.length) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    g.setIndex(idx);
    g.computeVertexNormals();
    // ensure outward-facing winding
    const mid = rings[Math.floor(N / 2)], c = centroid(mid);
    const nrm = g.attributes.normal;
    let score = 0;
    for (let j = 0; j < R; j++) {
      const p = mid.pts[j];
      score += (p.x - c.x) * nrm.getX(Math.floor(N / 2) * R + j) + (p.y - c.y) * nrm.getY(Math.floor(N / 2) * R + j) + (p.z - c.z) * nrm.getZ(Math.floor(N / 2) * R + j);
    }
    if (score < 0) {
      const ix = g.index.array;
      for (let t = 0; t < ix.length; t += 3) { const tmp = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = tmp; }
      g.index.needsUpdate = true;
      g.computeVertexNormals();
    }
    return g;
  }

  // Lofted shape along Z. keys: [z, top, bottom, halfWidth]
  function loftZ(keys, segs, R, opts) {
    opts = opts || {};
    const exp = opts.exp || 2.0, narrow = opts.narrowBottom || 0;
    const rings = [];
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * (keys.length - 1);
      const [z, top, bot, w] = sampleKeysIdx(keys, t);
      const c = (top + bot) / 2, h = (top - bot) / 2;
      const pts = [];
      for (let j = 0; j < R; j++) {
        const a = (j / R) * TAU, s = Math.sin(a), co = Math.cos(a);
        const p = new V3(w * sgnpow(s, 2 / exp) * (1 - narrow * Math.max(0, -co)), c + h * sgnpow(co, 2 / exp), z);
        if (opts.deform) opts.deform(p, s, co, t / (keys.length - 1));
        pts.push(p);
      }
      rings.push({ pts });
    }
    return rings;
  }

  // Skinned tube along Y (dir = +1 up, -1 down). profile keys: [d, rx, rz, oz, (ox)]
  function skinnedTube(opts) {
    const segLens = opts.segLens, dir = opts.dir;
    const total = opts.length || segLens.reduce((a, b) => a + b, 0);
    const bounds = [0]; segLens.forEach((l) => bounds.push(bounds[bounds.length - 1] + l));
    const blend = opts.blend || 0.05;
    const N = opts.segs, R = opts.radial, start = opts.start || 0;
    const rings = [];
    for (let i = 0; i <= N; i++) {
      const d = start + (i / N) * (total - start);
      const pr = sampleKeysDist(opts.profile, d);
      const rx = pr[1], rz = pr[2], oz = pr[3] || 0, ox = pr[4] || 0;
      const pts = [];
      for (let j = 0; j < R; j++) {
        const a = (j / R) * TAU;
        let m = 1;
        if (opts.shape) m = opts.shape(d, a, pr);
        pts.push(new V3(ox + rx * Math.sin(a) * m, dir * d, oz + rz * Math.cos(a) * m));
      }
      // skin weights
      let k = 0; while (k < segLens.length - 1 && d > bounds[k + 1]) k++;
      let wi = [k, 0, 0, 0], ww = [1, 0, 0, 0];
      if (k > 0 && d - bounds[k] < blend) {
        const t = smooth(0, 1, 0.5 + 0.5 * (d - bounds[k]) / blend);
        wi = [k, k - 1, 0, 0]; ww = [t, 1 - t, 0, 0];
      } else if (k < segLens.length - 1 && bounds[k + 1] - d < blend) {
        const t = smooth(0, 1, 0.5 + 0.5 * (bounds[k + 1] - d) / blend);
        wi = [k, k + 1, 0, 0]; ww = [t, 1 - t, 0, 0];
      }
      rings.push({ pts, skin: { i: wi, w: ww }, d });
    }
    const geo = gridGeometry(rings, {
      capStart: true, capEnd: true, patFn: opts.patFn,
      capEndOffset: new V3(0, dir * (opts.endCapBulge || 0), 0),
    });
    const bones = [];
    let prev = null;
    for (let k = 0; k <= segLens.length; k++) {
      const b = new THREE.Bone();
      if (prev) { b.position.set(0, dir * segLens[k - 1], 0); prev.add(b); }
      bones.push(b); prev = b;
    }
    return { geo, bones };
  }

  // Tapered tube along an arbitrary curve (for tree branches)
  function taperTube(points, r0, r1, segs, radial) {
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(segs, false);
    const rings = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, c = curve.getPointAt(t), r = lerp(r0, r1, Math.pow(t, 0.8));
      const N = frames.normals[i], B = frames.binormals[i];
      const pts = [];
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * TAU;
        const wob = 1 + 0.12 * (vnoise3(c.x * 3 + Math.cos(a) * 2, c.y * 3, c.z * 3 + Math.sin(a) * 2) - 0.5);
        pts.push(c.clone().addScaledVector(N, Math.cos(a) * r * wob).addScaledVector(B, Math.sin(a) * r * wob));
      }
      rings.push({ pts });
    }
    return gridGeometry(rings, { capEnd: true });
  }

  // ---------- giraffe skin material (procedural reticulated coat) ----------
  const COAT_GLSL = `
    varying vec3 vRest; varying vec3 vPat;
    vec3 gHash3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453123); }
    float gHash1(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
    float gNoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(gHash1(i),gHash1(i+vec3(1,0,0)),f.x),mix(gHash1(i+vec3(0,1,0)),gHash1(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(gHash1(i+vec3(0,0,1)),gHash1(i+vec3(1,0,1)),f.x),mix(gHash1(i+vec3(0,1,1)),gHash1(i+vec3(1,1,1)),f.x),f.y),f.z); }
    vec2 gVoronoi(vec3 x, out float cellId){
      vec3 p=floor(x), f=fract(x); vec3 mg=vec3(0.0), mr=vec3(0.0); float md=8.0;
      for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
        vec3 g=vec3(float(i),float(j),float(k)); vec3 o=0.1+0.8*gHash3(p+g); vec3 r=g+o-f; float d=dot(r,r);
        if(d<md){ md=d; mr=r; mg=g; } }
      float ed=8.0;
      for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
        vec3 g=mg+vec3(float(i),float(j),float(k)); vec3 o=0.1+0.8*gHash3(p+g); vec3 r=g+o-f;
        vec3 dr=r-mr; if(dot(dr,dr)>1e-5) ed=min(ed, dot(0.5*(mr+r), normalize(dr))); }
      cellId = gHash1(p+mg);
      return vec2(sqrt(md), ed);
    }
    vec3 giraffeColor(){
      vec3 P = vRest;
      float y = P.y;
      float scale = vPat.x * mix(1.9, 1.0, smoothstep(0.7, 2.1, y));
      float strength = vPat.y * mix(0.3, 1.0, smoothstep(0.30, 1.30, y));
      vec3 q = P * (4.4*scale);
      q += (vec3(gNoise(P*7.0), gNoise(P*7.0+17.3), gNoise(P*7.0+31.7))-0.5)*0.6;
      q += (vec3(gNoise(P*34.0), gNoise(P*34.0+5.1), gNoise(P*34.0+9.7))-0.5)*0.16;
      float id; vec2 v = gVoronoi(q, id);
      float lw = mix(0.62, 0.07, strength);
      float aa = fwidth(v.y) + 0.004;
      float patchM = smoothstep(lw-aa, lw+aa, v.y);
      vec3 cream = mix(vec3(0.80,0.70,0.54), vec3(0.88,0.79,0.62), smoothstep(0.8,2.0,y));
      vec3 c1 = vec3(0.58,0.31,0.12), c2 = vec3(0.38,0.19,0.08), c3 = vec3(0.66,0.42,0.19);
      vec3 pc = mix(c1, c2, id);
      pc = mix(pc, c3, step(0.78, fract(id*7.31))*0.6);
      pc *= mix(1.1, 0.82, smoothstep(0.06, 0.45, v.y));
      cream = mix(cream, vec3(0.70,0.52,0.32), clamp(-vPat.z,0.0,1.0));
      vec3 col = mix(cream, pc, patchM);
      col = mix(col, vec3(0.31,0.18,0.09), clamp(vPat.z,0.0,1.0));
      col *= 0.9 + 0.2*gNoise(P*140.0);
      return pow(col, vec3(2.2));
    }
  `;
  function makeCoatMaterial() {
    const m = new THREE.MeshPhysicalMaterial({
      roughness: 0.78, metalness: 0, sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xc8a070),
    });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute vec3 aRest;\nattribute vec3 aPat;\nvarying vec3 vRest;\nvarying vec3 vPat;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = aRest; vPat = aPat;');
      shader.fragmentShader = COAT_GLSL + shader.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = giraffeColor();');
    };
    return m;
  }
  const coat = makeCoatMaterial();
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x3a332c, roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 0.95 });
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x120a06, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
  const darkSkin = new THREE.MeshStandardMaterial({ color: 0x2e2420, roughness: 0.7 });

  // ---------- giraffe construction ----------
  const giraffe = new THREE.Group();   // follows path
  const body = new THREE.Group();      // bobs/sways
  giraffe.add(body);
  scene.add(giraffe);
  const coatMeshes = [];
  const skinned = [];

  function addCoatMesh(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; coatMeshes.push(mesh); return mesh; }

  // Torso
  {
    const keys = [
      [-1.34, 2.47, 2.33, 0.03],
      [-1.27, 2.60, 2.10, 0.20],
      [-1.10, 2.68, 1.99, 0.31],
      [-0.82, 2.73, 1.95, 0.355],
      [-0.45, 2.80, 1.88, 0.385],
      [-0.05, 2.94, 1.80, 0.415],
      [0.32, 3.09, 1.78, 0.40],
      [0.62, 3.14, 1.86, 0.34],
      [0.86, 3.04, 2.00, 0.285],
      [1.02, 2.88, 2.20, 0.22],
      [1.10, 2.66, 2.42, 0.08],
    ];
    const bumps = [
      // [z, y, amp, sz, sy]
      [0.48, 2.78, 0.07, 0.28, 0.32],   // scapula
      [0.82, 2.38, 0.09, 0.16, 0.16],   // point of shoulder
      [-0.72, 2.55, 0.07, 0.18, 0.18],  // point of hip
      [-1.02, 2.28, 0.09, 0.22, 0.22],  // thigh / buttock
      [-0.15, 2.30, 0.04, 0.45, 0.35],  // barrel
    ];
    const rings = loftZ(keys, 60, 40, {
      exp: 2.3, narrowBottom: 0.22,
      deform: (p, s, co) => {
        let b = 0;
        for (const [z, y, a, sz, sy] of bumps) b += a * Math.exp(-((p.z - z) ** 2) / (sz * sz) - ((p.y - y) ** 2) / (sy * sy));
        p.x *= 1 + b * Math.abs(s);
        // slight spine ridge & belly sag
        if (co > 0.9) p.y += 0.012 * (co - 0.9) * 10;
      },
    });
    const g = gridGeometry(rings, {
      capStart: true, capEnd: true,
      patFn: (p) => [1, lerp(0.45, 1, smooth(1.86, 2.25, p.y)), 0],
    });
    body.add(addCoatMesh(new THREE.Mesh(g, coat)));
  }

  // Legs
  const FORE_L = [0.62, 0.82, 0.78, 0.26];
  const HIND_L = [0.55, 0.80, 0.88, 0.26];
  const FORE_PROFILE = [
    [-0.24, 0.03, 0.05, 0.0], [-0.17, 0.10, 0.14, 0.0], [-0.06, 0.14, 0.19, 0.0], [0.04, 0.15, 0.20, 0.00], [0.30, 0.14, 0.19, 0.0], [0.62, 0.105, 0.13, -0.01], [0.80, 0.095, 0.115, 0.0],
    [1.15, 0.062, 0.072, 0], [1.37, 0.054, 0.06, 0], [1.44, 0.066, 0.072, 0.006], [1.52, 0.049, 0.055, 0],
    [1.70, 0.039, 0.05, -0.009], [2.11, 0.041, 0.05, -0.009], [2.22, 0.054, 0.06, -0.006], [2.32, 0.044, 0.047, 0],
    [2.45, 0.056, 0.06, 0.012],
  ];
  const HIND_PROFILE = [
    [-0.26, 0.04, 0.07, 0.0], [-0.18, 0.12, 0.2, -0.01], [-0.06, 0.16, 0.26, -0.02], [0.04, 0.17, 0.28, -0.02], [0.30, 0.15, 0.24, -0.03], [0.55, 0.11, 0.15, 0.0], [0.72, 0.09, 0.13, -0.02],
    [1.10, 0.058, 0.08, -0.02], [1.29, 0.05, 0.07, -0.02], [1.35, 0.056, 0.086, -0.036], [1.43, 0.047, 0.06, -0.01],
    [1.57, 0.039, 0.05, -0.007], [2.13, 0.041, 0.05, -0.009], [2.23, 0.054, 0.06, -0.006], [2.33, 0.044, 0.047, 0],
    [2.49, 0.056, 0.06, 0.012],
  ];
  const A4S_FORE = 0.72, A4S_HIND = 0.74;

  function makeLeg(fore, side) {
    const L = fore ? FORE_L : HIND_L;
    const { geo, bones } = skinnedTube({
      segLens: L, length: 2.45, start: -0.25, dir: -1, segs: 100, radial: 18, blend: 0.06,
      profile: fore ? FORE_PROFILE : HIND_PROFILE,
    });
    const mesh = new THREE.SkinnedMesh(geo, coat);
    mesh.frustumCulled = false;
    mesh.add(bones[0]);
    mesh.position.set(side * (fore ? 0.2 : 0.19), fore ? 2.28 : 2.22, fore ? 0.72 : -0.85);
    body.add(addCoatMesh(mesh));
    bones[0].rotation.order = 'ZYX';
    // hoof
    const hoofPivot = new THREE.Group();
    hoofPivot.rotation.x = fore ? A4S_FORE : A4S_HIND;
    const hg = new THREE.CylinderGeometry(0.052, 0.072, 0.12, 20, 2);
    {
      const hp = hg.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        let x = hp.getX(i), y = hp.getY(i) + 0.06, z = hp.getZ(i);
        // slanted dorsal wall, rounded toe, split between the two digits
        y *= 1 - 0.45 * Math.max(0, z) / 0.072;
        z = z * 1.3 + 0.02;
        if (Math.abs(x) < 0.008 && z > 0.03) x *= 0.3;
        hp.setXYZ(i, x, y, z);
      }
      hg.computeVertexNormals();
    }
    const hoof = new THREE.Mesh(hg, hoofMat); hoof.castShadow = true;
    hoofPivot.add(hoof);
    bones[4].add(hoofPivot);
    skinned.push({ mesh, bones });
    return { mesh, bones, L, fore, side };
  }

  // Neck
  const NECK_SEG = [0.35, 0.35, 0.35, 0.35, 0.35, 0.31];
  const NECK_BASE_ANGLE = 0.62;
  const NECK_PROFILE = [
    [0.0, 0.25, 0.37, -0.05], [0.3, 0.19, 0.27, -0.01], [0.7, 0.14, 0.19, 0.0],
    [1.25, 0.112, 0.152, 0.0], [1.75, 0.092, 0.118, 0.0], [2.06, 0.078, 0.098, 0.0],
  ];
  const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  let neck;
  {
    const total = NECK_SEG.reduce((a, b) => a + b, 0);
    const maneAmt = (d) => smooth(0.12, 0.35, d) * (1 - smooth(1.85, 2.03, d));
    const { geo, bones } = skinnedTube({
      segLens: NECK_SEG, length: total, dir: 1, segs: 70, radial: 28, blend: 0.12,
      profile: NECK_PROFILE,
      shape: (d, a, pr) => 1 + (0.055 / pr[2]) * maneAmt(d) * Math.exp(-Math.pow(wrapA(a - Math.PI) / 0.2, 2)),
      patFn: (p) => {
        // mane: back side of neck (-z)
        const a = Math.atan2(p.x, p.z), d = p.y;
        const m = maneAmt(d) * smooth(0.25, 0.12, Math.abs(wrapA(a - Math.PI)));
        return [1.05, 1, m];
      },
    });
    const mesh = new THREE.SkinnedMesh(geo, coat);
    mesh.frustumCulled = false;
    mesh.add(bones[0]);
    mesh.position.set(0, 2.80, 0.74);
    mesh.rotation.x = NECK_BASE_ANGLE;
    body.add(addCoatMesh(mesh));
    skinned.push({ mesh, bones });
    neck = { mesh, bones };
  }

  // Head
  const head = new THREE.Group();
  const earL = new THREE.Group(), earR = new THREE.Group();
  {
    neck.bones[NECK_SEG.length].add(head);
    head.position.set(0, 0.02, -0.02);
    head.scale.setScalar(1.12);
    const keys = [
      [-0.12, 0.06, -0.06, 0.03],
      [-0.09, 0.105, -0.13, 0.072],
      [-0.02, 0.125, -0.185, 0.092],
      [0.07, 0.13, -0.19, 0.108],
      [0.15, 0.12, -0.16, 0.098],
      [0.25, 0.092, -0.13, 0.082],
      [0.36, 0.066, -0.118, 0.074],
      [0.45, 0.054, -0.114, 0.079],
      [0.515, 0.040, -0.104, 0.080],
      [0.555, 0.014, -0.082, 0.064],
      [0.572, -0.02, -0.05, 0.02],
    ];
    const rings = loftZ(keys, 48, 32, {
      exp: 2.2, narrowBottom: 0.3,
      deform: (p, s, co) => {
        // median boss on forehead + cheek bulge
        p.y += 0.03 * Math.exp(-((p.z - 0.14) ** 2) / 0.004) * Math.max(0, co) ** 4;
        p.x *= 1 + 0.08 * Math.exp(-((p.z - 0.05) ** 2) / 0.01 - ((p.y + 0.08) ** 2) / 0.004);
      },
    });
    const g = gridGeometry(rings, {
      capStart: true, capEnd: true,
      patFn: (p) => [2.1, lerp(0.9, 0.25, smooth(0.1, 0.42, p.z)), -lerp(0.45, 1.0, smooth(0.0, 0.5, p.z))],
    });
    const hm = addCoatMesh(new THREE.Mesh(g, coat));
    head.add(hm);

    // ossicones
    for (const s of [1, -1]) {
      const og = new THREE.CylinderGeometry(0.03, 0.04, 0.13, 14, 4);
      og.translate(0, 0.065, 0);
      const pa = []; const pp = og.attributes.position;
      for (let i = 0; i < pp.count; i++) pa.push(2.4, 0.6, smooth(0.08, 0.13, pp.getY(i)) * 0.9 - 0.4);
      og.setAttribute('aPat', new THREE.Float32BufferAttribute(pa, 3));
      const o = addCoatMesh(new THREE.Mesh(og, coat));
      o.position.set(s * 0.05, 0.10, -0.02);
      o.rotation.set(-0.45, 0, -s * 0.22);
      head.add(o);
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), hairMat);
      tuft.scale.set(1.05, 0.75, 1.05); tuft.position.set(0, 0.135, 0); tuft.castShadow = true;
      o.add(tuft);
    }
    // ears
    for (const [s, grp] of [[1, earL], [-1, earR]]) {
      grp.position.set(s * 0.075, 0.075, -0.06);
      grp.rotation.set(0, s * 0.55, -s * 0.25);
      const eg = new THREE.SphereGeometry(1, 20, 12);
      eg.scale(0.12, 0.022, 0.048); eg.translate(s * 0.11, 0, 0);
      const pa = []; for (let i = 0; i < eg.attributes.position.count; i++) pa.push(2.2, 0.3, -0.5);
      eg.setAttribute('aPat', new THREE.Float32BufferAttribute(pa, 3));
      const ear = addCoatMesh(new THREE.Mesh(eg, coat));
      grp.add(ear);
      const ig = new THREE.SphereGeometry(1, 16, 8);
      ig.scale(0.1, 0.01, 0.034); ig.translate(s * 0.115, 0.015, 0);
      const inner = new THREE.Mesh(ig, new THREE.MeshStandardMaterial({ color: 0xd9c3a6, roughness: 0.9 }));
      grp.add(inner);
      head.add(grp);
    }
    // eyes
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), eyeMat);
      eye.position.set(s * 0.098, 0.035, 0.09);
      eye.scale.set(0.8, 1, 1.05);
      head.add(eye);
      const lid = new THREE.Mesh(new THREE.TorusGeometry(0.029, 0.006, 8, 24), darkSkin);
      lid.position.copy(eye.position); lid.rotation.y = Math.PI / 2 - s * 0.25;
      head.add(lid);
      // upper eyelid with lashes (half-closed lid gives the typical sleepy giraffe look)
      const ulg = new THREE.SphereGeometry(0.034, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.36);
      const upa = []; for (let i = 0; i < ulg.attributes.position.count; i++) upa.push(2.2, 0.4, -0.6);
      ulg.setAttribute('aPat', new THREE.Float32BufferAttribute(upa, 3));
      const ul = addCoatMesh(new THREE.Mesh(ulg, coat));
      ul.position.copy(eye.position); ul.scale.set(0.85, 1, 1.1);
      ul.rotation.set(0.2, 0, s * 0.35);
      head.add(ul);
      const lash = new THREE.Mesh(new THREE.TorusGeometry(0.0255, 0.0035, 6, 20, Math.PI * 0.9), hairMat);
      lash.position.set(0, Math.cos(Math.PI * 0.36) * 0.034, 0); lash.rotation.x = Math.PI / 2;
      lash.rotation.z = Math.PI * 0.05; lash.scale.set(1, 1.25, 1);
      ul.add(lash);
      head.userData['lid' + s] = ul;
      // nostrils
      const n = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), darkSkin);
      n.scale.set(0.012, 0.007, 0.03); n.position.set(s * 0.038, 0.03, 0.49); n.rotation.set(0.3, s * 0.35, 0);
      head.add(n);
    }
    // mouth line
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.005, 6, 24, Math.PI), darkSkin);
    mouth.rotation.set(Math.PI / 2, 0, 0); mouth.scale.set(0.95, 1.6, 1);
    mouth.position.set(0, -0.074, 0.52);
    mouth.scale.set(0.9, 1.5, 0.6);
  }

  // Tail
  let tail;
  {
    const seg = [0.19, 0.19, 0.19, 0.19, 0.19];
    const { geo, bones } = skinnedTube({
      segLens: seg, length: 0.95, dir: -1, segs: 40, radial: 12, blend: 0.08,
      profile: [[0, 0.07, 0.07, 0], [0.15, 0.045, 0.045, 0], [0.6, 0.026, 0.026, 0], [0.95, 0.02, 0.02, 0]],
      patFn: (p) => [1.6, 0.7, smooth(-0.5, -0.9, p.y)],
    });
    const mesh = new THREE.SkinnedMesh(geo, coat);
    mesh.frustumCulled = false;
    mesh.add(bones[0]);
    mesh.position.set(0, 2.6, -1.22);
    mesh.rotation.x = 0.3;
    body.add(addCoatMesh(mesh));
    skinned.push({ mesh, bones });
    const pts = [[0.012, 0.05], [0.03, 0.0], [0.05, -0.08], [0.068, -0.2], [0.06, -0.32], [0.035, -0.42], [0.0, -0.47]].map((a) => new THREE.Vector2(a[0], a[1]));
    const tg = new THREE.LatheGeometry(pts, 16);
    // stringy hair: perturb radius
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i), y = tp.getY(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.25 * Math.sin(a * 9 + y * 6) * smooth(0, -0.25, y);
      tp.setXYZ(i, x * k, y, z * k);
    }
    tg.computeVertexNormals();
    const tuft = new THREE.Mesh(tg, hairMat); tuft.castShadow = true;
    bones[4].add(tuft);
    tail = { mesh, bones };
  }

  const legs = [
    Object.assign(makeLeg(false, 1), { id: 'LH', off: 0.0 }),
    Object.assign(makeLeg(true, 1), { id: 'LF', off: 0.16 }),
    Object.assign(makeLeg(false, -1), { id: 'RH', off: 0.5 }),
    Object.assign(makeLeg(true, -1), { id: 'RF', off: 0.66 }),
  ];
  legs.forEach((l) => {
    l.home = new V3(l.side * (l.fore ? 0.22 : 0.21), 0, l.fore ? 0.84 : -0.98);
    l.planted = new V3(); l.lift = new V3(); l.target = new V3(); l.wasStance = null;
  });

  // Bind skeletons and bake rest-space coordinates for the coat pattern.
  giraffe.updateMatrixWorld(true);
  skinned.forEach(({ mesh, bones }) => {
    const sk = new THREE.Skeleton(bones);
    mesh.bind(sk, mesh.matrixWorld);
  });
  coatMeshes.forEach((m) => {
    const p = m.geometry.attributes.position;
    const rest = new Float32Array(p.count * 3), v = new V3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      rest[i * 3] = v.x; rest[i * 3 + 1] = v.y; rest[i * 3 + 2] = v.z;
    }
    m.geometry.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
    if (!m.geometry.attributes.aPat) {
      const a = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { a[i * 3] = 1; a[i * 3 + 1] = 1; }
      m.geometry.setAttribute('aPat', new THREE.BufferAttribute(a, 3));
    }
  });

  // ---------- environment ----------
  // Walking path: a gentle closed loop through the savanna
  const pathPts = [];
  for (let i = 0; i < 14; i++) {
    const th = (i / 14) * TAU;
    const r = 40 + 9 * Math.sin(2 * th + 0.5) + 5 * Math.cos(3 * th + 1.2);
    pathPts.push(new V3(r * Math.cos(th), 0, r * Math.sin(th)));
  }
  const path = new THREE.CatmullRomCurve3(pathPts, true, 'centripetal');
  const pathLen = path.getLength();
  const _pp = new V3(), _pt = new V3();
  function pathPose(s) {
    const u = frac(s / pathLen);
    path.getPointAt(u, _pp); path.getTangentAt(u, _pt);
    return { x: _pp.x, z: _pp.z, yaw: Math.atan2(_pt.x, _pt.z) };
  }
  function homeWorld(s, local, out) {
    const p = pathPose(s), c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    return out.set(p.x + local.x * c + local.z * sn, 0, p.z - local.x * sn + local.z * c);
  }
  function distToPath(x, z) {
    let best = 1e9;
    for (let i = 0; i < 200; i++) { path.getPointAt(i / 200, _pp); best = Math.min(best, Math.hypot(_pp.x - x, _pp.z - z)); }
    return best;
  }

  // Ground
  function makeGroundTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
    const P = 8; // periodic noise
    const pn = (x, y, per) => {
      const xi = Math.floor(x), yi = Math.floor(y); let xf = x - xi, yf = y - yi;
      xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
      const h = (a, b) => hash3(((xi + a) % per + per) % per, ((yi + b) % per + per) % per, 3.3);
      return lerp(lerp(h(0, 0), h(1, 0), xf), lerp(h(0, 1), h(1, 1), xf), yf);
    };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        let n = 0, a = 0.5, f = P;
        for (let o = 0; o < 5; o++) { n += a * pn(u * f, v * f, f); f *= 2; a *= 0.5; }
        const speck = hash3(x, y, 7.7);
        const dirt = smooth(0.48, 0.62, n);
        let r = lerp(176, 150, dirt), g = lerp(152, 116, dirt), b = lerp(96, 84, dirt);
        const k = 0.82 + 0.3 * speck;
        r *= k; g *= k; b *= k;
        if (speck > 0.985) { r *= 0.6; g *= 0.6; b *= 0.6; }
        const i = (y * S + x) * 4;
        img.data[i] = clamp(r, 0, 255); img.data[i + 1] = clamp(g, 0, 255); img.data[i + 2] = clamp(b, 0, 255); img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(220, 220);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return tex;
  }
  {
    const gm = new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 });
    gm.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvWPos = (modelMatrix*vec4(position,1.0)).xyz;');
      shader.fragmentShader = `varying vec3 vWPos;
        float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(gh(i),gh(i+vec2(1,0)),f.x), mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x), f.y); }
        ` + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          float mN = gn(vWPos.xz*0.025)*0.6 + gn(vWPos.xz*0.11)*0.3 + gn(vWPos.xz*0.5)*0.1;
          diffuseColor.rgb *= mix(0.72, 1.18, mN);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.0,0.88,0.76), smoothstep(0.55,0.75,gn(vWPos.xz*0.04+7.0)));
        `);
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1), gm);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // Grass tufts (instanced, wind-animated)
  const windUniform = { value: 0 };
  {
    const pos = [], col = [], nrm = [];
    const blades = 14;
    for (let b = 0; b < blades; b++) {
      const a = rand() * TAU, lean = 0.12 + rand() * 0.4, h = 0.3 + rand() * 0.5, w = 0.008 + rand() * 0.007;
      const ox = (rand() - 0.5) * 0.14, oz = (rand() - 0.5) * 0.14;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
      // two-segment curved blade
      const mid = [ox + dx * lean * h * 0.35, h * 0.55, oz + dz * lean * h * 0.35];
      const tip = [ox + dx * lean * h, h, oz + dz * lean * h];
      const v = [
        [ox - px * w, 0, oz - pz * w], [ox + px * w, 0, oz + pz * w],
        [mid[0] - px * w * 0.7, mid[1], mid[2] - pz * w * 0.7], [mid[0] + px * w * 0.7, mid[1], mid[2] + pz * w * 0.7], tip,
      ];
      const tint = 0.85 + rand() * 0.25;
      const cB = [0.60, 0.50, 0.31], cM = [0.78, 0.67, 0.44].map((c) => c * tint), cT = [0.92, 0.83, 0.6].map((c) => c * tint);
      const cl = [cB, cB, cM, cM, cT];
      const tris = [[0, 1, 2], [1, 3, 2], [2, 3, 4]];
      for (const t of tris) for (const order of [t, [t[0], t[2], t[1]]]) {
        for (const i of order) {
          pos.push(...v[i]); col.push(...cl[i]);
          nrm.push(dx * 0.35, 1, dz * 0.35);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col.map((c) => Math.pow(c, 2.2)), 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.normalizeNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = windUniform;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        float hh = position.y*position.y;
        float w = sin(uTime*1.6 + ip.x*0.21 + ip.y*0.17)*0.6 + sin(uTime*3.1 + ip.x*0.9)*0.25;
        transformed.x += w*hh*0.35; transformed.z += w*hh*0.2;`);
    };
    const COUNT = 40000;
    const inst = new THREE.InstancedMesh(g, m, COUNT);
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), e = new THREE.Euler();
    const color = new THREE.Color();
    let k = 0;
    while (k < COUNT) {
      const r = Math.sqrt(rand()) * 85, th = rand() * TAU;
      const x = r * Math.cos(th), z = r * Math.sin(th);
      const dens = fbm2(x * 0.05, z * 0.05, 3);
      if (rand() > smooth(0.3, 0.6, dens)) continue;
      p.set(x, 0, z); e.set(0, rand() * TAU, 0); q.setFromEuler(e);
      const sz = 0.6 + rand() * 0.9; s.set(sz, sz * (0.7 + rand() * 0.6), sz);
      mat.compose(p, q, s); inst.setMatrixAt(k, mat);
      color.setHSL(0.1 + rand() * 0.05, 0.3 + rand() * 0.25, 0.42 + rand() * 0.3); inst.setColorAt(k, color);
      k++;
    }
    inst.receiveShadow = true;
    scene.add(inst);
  }

  // Acacia trees
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x4a3c2e, roughness: 1 });
  const leafMats = [0x55602a, 0x4b5a26, 0x606b30, 0x434f22].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true, vertexColors: true }));
  function makeBlob(r) {
    const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position, sd = rand() * 100;
    const cols = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const jag = hash3(Math.round(x * 1000), Math.round(y * 1000), Math.round(z * 1000) + sd);
      const k = (1 + 0.4 * (vnoise3(x * 2.2 + sd, y * 2.2, z * 2.2) - 0.5)) * (0.86 + 0.24 * jag);
      x *= k; y *= k; z *= k;
      if (y < -0.1) y = -0.1 + (y + 0.1) * 0.25;
      p.setXYZ(i, x * r, y * r * 0.45, z * r);
      const shade = (0.55 + 0.45 * smooth(-0.15, 0.6, y)) * (0.8 + 0.4 * jag);
      cols[i * 3] = shade; cols[i * 3 + 1] = shade; cols[i * 3 + 2] = shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    return g;
  }
  const leafTex = (() => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const r2 = mulberry32(99);
    for (let k = 0; k < 9; k++) {
      // twig with tiny bipinnate acacia leaflets
      let px = S * (0.2 + 0.6 * r2()), py = S * (0.2 + 0.6 * r2());
      const ang = r2() * TAU, len = S * (0.25 + 0.2 * r2());
      x.strokeStyle = 'rgba(70,60,35,1)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); x.stroke();
      for (let j = 0; j < 26; j++) {
        const t = j / 26, cx = px + Math.cos(ang) * len * t, cy = py + Math.sin(ang) * len * t;
        for (const sd of [-1, 1]) {
          const a2 = ang + sd * (1.1 + 0.3 * r2()), d = 8 + 10 * r2();
          const g = 90 + Math.floor(60 * r2()), rr = 60 + Math.floor(40 * r2());
          x.fillStyle = `rgb(${rr},${g},${30 + Math.floor(20 * r2())})`;
          x.beginPath(); x.ellipse(cx + Math.cos(a2) * d, cy + Math.sin(a2) * d, 7 + 4 * r2(), 3.2, a2, 0, TAU); x.fill();
        }
      }
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    return t;
  })();
  const leafCardMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, color: 0xb8c890 });
  const leafCardDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.45 });
  function makeCards(centers, top) {
    const pos = [], uv = [], nrm = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler(), cn = new V3();
    centers.forEach((c) => cn.add(c)); cn.multiplyScalar(1 / centers.length);
    for (const c of centers) {
      const n = Math.floor(28 + c.r * 22);
      for (let i = 0; i < n; i++) {
        const u = rand() * TAU, rr = Math.sqrt(rand()) * c.r;
        const p = new V3(c.x + Math.cos(u) * rr, c.y + (rand() - 0.35) * c.r * 0.45 * (1 - 0.5 * rr / c.r), c.z + Math.sin(u) * rr);
        const sz = 0.7 + rand() * 0.6;
        e.set(-Math.PI / 2 + (rand() - 0.5) * 0.9, rand() * TAU, (rand() - 0.5) * 0.9, 'YXZ'); q.setFromEuler(e);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new V3(a * sz * 0.5, b * sz * 0.5, 0).applyQuaternion(q).add(p));
        const out = p.clone().sub(cn); out.y = 0; out.normalize().multiplyScalar(0.5); out.y = 1; out.normalize();
        const idx = [0, 1, 2, 0, 2, 3], uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
        for (const k of idx) { pos.push(corners[k].x, corners[k].y, corners[k].z); uv.push(...uvs[k]); nrm.push(out.x, out.y, out.z); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const m = new THREE.Mesh(g, leafCardMat);
    m.customDepthMaterial = leafCardDepth;
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function makeAcacia(scale, detailed) {
    const tree = new THREE.Group();
    const centers = [];
    const lean = new V3((rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8);
    const top = new V3(lean.x, 2.4 + rand() * 0.6, lean.z);
    const trunk = taperTube([new V3(0, 0, 0), new V3(lean.x * 0.3, 1.2, lean.z * 0.3), top], 0.24, 0.15, 14, 9);
    const tm = new THREE.Mesh(trunk, barkMat); tm.castShadow = true; tree.add(tm);
    const nb = 3 + Math.floor(rand() * 3);
    const canopyH = 4.6 + rand() * 1.4;
    for (let b = 0; b < nb; b++) {
      const a = (b / nb) * TAU + rand() * 0.6, spread = 1.8 + rand() * 1.8;
      const end = new V3(top.x + Math.cos(a) * spread, canopyH - 0.3 - rand() * 0.5, top.z + Math.sin(a) * spread);
      const mid = top.clone().lerp(end, 0.5); mid.y += 0.2; mid.x += (rand() - 0.5) * 0.4;
      const bm = new THREE.Mesh(taperTube([top.clone().add(new V3(0, -0.2, 0)), mid, end], 0.13, 0.04, 10, 7), barkMat);
      bm.castShadow = true; tree.add(bm);
      const blobs = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < blobs; i++) {
        const r = 1.1 + rand() * 1.0;
        const m = new THREE.Mesh(makeBlob(detailed ? r * 0.72 : r), leafMats[Math.floor(rand() * leafMats.length)]);
        m.position.set(end.x + (rand() - 0.5) * 1.8, canopyH + (rand() - 0.3) * 0.4, end.z + (rand() - 0.5) * 1.8);
        m.castShadow = true; m.receiveShadow = true;
        tree.add(m);
        centers.push({ x: m.position.x, y: m.position.y, z: m.position.z, r });
      }
    }
    if (detailed) tree.add(makeCards(centers));
    tree.scale.setScalar(scale);
    return tree;
  }
  {
    const placed = [];
    let tries = 0;
    while (placed.length < 26 && tries < 2000) {
      tries++;
      const r = 12 + rand() * 95, th = rand() * TAU;
      const x = r * Math.cos(th), z = r * Math.sin(th);
      if (distToPath(x, z) < 9) continue;
      if (placed.some((p) => Math.hypot(p[0] - x, p[1] - z) < 14)) continue;
      placed.push([x, z]);
      const t = makeAcacia(0.85 + rand() * 0.6, true);
      t.position.set(x, 0, z); t.rotation.y = rand() * TAU;
      scene.add(t);
    }
    // distant tree line (cheap, no shadows)
    for (let i = 0; i < 70; i++) {
      const r = 160 + rand() * 260, th = rand() * TAU;
      const t = makeAcacia(0.9 + rand() * 0.8);
      t.position.set(r * Math.cos(th), 0, r * Math.sin(th));
      t.traverse((o) => { o.castShadow = false; });
      scene.add(t);
    }
  }
  // rocks & termite mounds
  {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 0.95, flatShading: true });
    const moundMat = new THREE.MeshStandardMaterial({ color: 0x85583c, roughness: 1, flatShading: true });
    for (let i = 0; i < 40; i++) {
      const r = 8 + rand() * 100, th = rand() * TAU, x = r * Math.cos(th), z = r * Math.sin(th);
      if (distToPath(x, z) < 3) continue;
      const g = new THREE.DodecahedronGeometry(0.3 + rand() * 0.6, 1), p = g.attributes.position;
      for (let j = 0; j < p.count; j++) {
        const k = 0.8 + 0.4 * vnoise3(p.getX(j) * 3 + i, p.getY(j) * 3, p.getZ(j) * 3);
        p.setXYZ(j, p.getX(j) * k, p.getY(j) * k * 0.6, p.getZ(j) * k);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, rockMat); m.position.set(x, 0.05, z); m.rotation.y = rand() * TAU;
      m.castShadow = m.receiveShadow = true; scene.add(m);
    }
    for (let i = 0; i < 5; i++) {
      const r = 15 + rand() * 60, th = rand() * TAU, x = r * Math.cos(th), z = r * Math.sin(th);
      if (distToPath(x, z) < 5) continue;
      const pts = [];
      const h = 1.6 + rand() * 1.6;
      for (let j = 0; j <= 14; j++) { const t = j / 14; pts.push(new THREE.Vector2((1 - Math.pow(t, 0.9)) * (0.9 + 0.15 * Math.sin(t * 11)) * 1.0 + 0.12 * (1 - t) + 0.06, t * h)); }
      const g = new THREE.LatheGeometry(pts, 18), gp = g.attributes.position;
      for (let j = 0; j < gp.count; j++) {
        const x = gp.getX(j), y = gp.getY(j), z = gp.getZ(j);
        const k = 0.75 + 0.5 * vnoise3(x * 2 + i * 7, y * 1.5, z * 2);
        gp.setXYZ(j, x * k + 0.15 * Math.sin(y * 2 + i) * (y / h), y, z * k);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, moundMat); m.position.set(x, 0, z);
      m.castShadow = m.receiveShadow = true; scene.add(m);
    }
    // distant hills
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x8c8a78, roughness: 1, flatShading: true });
    for (let i = 0; i < 22; i++) {
      const th = (i / 22) * TAU + rand() * 0.2, r = 900 + rand() * 500;
      const g = new THREE.IcosahedronGeometry(1, 2);
      const m = new THREE.Mesh(g, hillMat);
      m.scale.set(150 + rand() * 200, 40 + rand() * 90, 150 + rand() * 150);
      m.position.set(r * Math.cos(th), -10, r * Math.sin(th));
      scene.add(m);
    }
  }

  // Dust puffs when hooves land
  const dust = [];
  const dustTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  function spawnDust(p) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.SpriteMaterial({ map: dustTex, color: 0xc8ab80, transparent: true, opacity: 0.35, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.position.copy(p).add(new V3((rand() - 0.5) * 0.15, 0.04, (rand() - 0.5) * 0.15));
      s.scale.setScalar(0.12);
      s.userData = { v: new V3((rand() - 0.5) * 0.35, 0.12 + rand() * 0.1, (rand() - 0.5) * 0.35), age: 0, life: 1.4 + rand() * 0.6 };
      scene.add(s); dust.push(s);
    }
  }
  function updateDust(dt) {
    for (let i = dust.length - 1; i >= 0; i--) {
      const s = dust[i], u = s.userData;
      u.age += dt;
      s.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.pow(0.3, dt));
      s.scale.setScalar(0.12 + u.age * 0.35);
      s.material.opacity = 0.32 * (1 - u.age / u.life);
      if (u.age >= u.life) { scene.remove(s); s.material.dispose(); dust.splice(i, 1); }
    }
  }

  // ---------- animation ----------
  const DUTY = 0.62;
  const DEBUG = params.has('debug');
  if (DEBUG) {
    window.__checkIK = function (steps) {
      const out = { maxErr: 0, maxSlide: 0, sum: 0 };
      const prev = legs.map(() => null);
      for (let i = 0; i < steps; i++) {
        update(1 / 60, false);
        giraffe.updateMatrixWorld(true);
        legs.forEach((l, j) => {
          const w = new V3(); l.bones[4].getWorldPosition(w);
          const e = w.distanceTo(l.dbgH); if (e > out.maxErr) { out.maxErr = e; out.who = l.id + ' q=' + frac(state.phase - l.off).toFixed(2); } out.sum += e; if (e > 0.01) out['n_' + l.id] = (out['n_' + l.id] || 0) + 1;
          if (l.dbgStance && prev[j]) out.maxSlide = Math.max(out.maxSlide, w.distanceTo(prev[j]));
          prev[j] = l.dbgStance ? w : null;
        });
      }
      out.avg = out.sum / (steps * 4);
      return JSON.stringify(out);
    };
  }
  const state = {
    time: parseFloat(params.get('t') || '0'),
    phase: 0, dist: 0, speedK: 1, paused: params.has('pause'),
  };
  state.dist = 1.08 * state.time; state.phase = 0.62 * state.time;
  const tmp = new V3(), tmp2 = new V3();

  function bump(u, peak) {
    const w = u < peak ? 0.5 * u / peak : 0.5 + 0.5 * (u - peak) / (1 - peak);
    return Math.sin(Math.PI * clamp(w, 0, 1));
  }

  function solveLeg(leg, H, c, a4) {
    const [L1, L2, L3, L4] = leg.L;
    const v = body.worldToLocal(tmp.copy(H));
    const J0 = leg.mesh.position;
    const dx = v.x - J0.x, dy = v.y - J0.y, dz = v.z - J0.z;
    const beta = Math.atan2(dx, -dy);
    const yp = -Math.hypot(dx, dy), zp = dz;
    const tz = zp - L4 * Math.sin(a4), ty = yp + L4 * Math.cos(a4);
    const vx = L3 * Math.sin(c), vy = L2 + L3 * Math.cos(c);
    const Lv = Math.hypot(vx, vy), phi = Math.atan2(vx, vy);
    let D = Math.hypot(tz, ty);
    D = clamp(D, Math.abs(L1 - Lv) + 1e-3, L1 + Lv - 1e-3);
    const theta = Math.atan2(tz, -ty);
    const alpha = Math.acos(clamp((L1 * L1 + D * D - Lv * Lv) / (2 * L1 * D), -1, 1));
    const a1 = leg.fore ? theta - alpha : theta + alpha;
    const j1z = L1 * Math.sin(a1), j1y = -L1 * Math.cos(a1);
    const av = Math.atan2(tz - j1z, -(ty - j1y));
    const a2 = av - phi, a3 = a2 + c;
    const b = leg.bones;
    b[0].rotation.set(-a1, 0, beta);
    b[1].rotation.x = -(a2 - a1);
    b[2].rotation.x = -c;
    b[3].rotation.x = -(a4 - a3);
  }

  function updateLeg(leg, f, speed, init) {
    const q = frac(state.phase - leg.off);
    const stance = q < DUTY;
    if (init) {
      const s0 = state.dist + speed * (DUTY / 2 - q) / f;
      homeWorld(s0, leg.home, leg.planted); leg.lift.copy(leg.planted); leg.target.copy(leg.planted);
      leg.wasStance = stance;
    }
    let H, c, a4, u = 0;
    const base4 = leg.fore ? A4S_FORE : A4S_HIND;
    if (stance) {
      if (!leg.wasStance) { leg.planted.copy(leg.target); leg.planted.y = 0; if (!init) spawnDust(leg.planted); }
      H = tmp2.copy(leg.planted);
      // gentle heel lift at end of stance
      const late = smooth(DUTY - 0.1, DUTY, q);
      c = leg.fore ? -0.12 * late : 0.42 + 0.08 * late;
      a4 = base4 - 0.35 * late;
    } else {
      if (leg.wasStance) leg.lift.copy(leg.planted);
      u = (q - DUTY) / (1 - DUTY);
      const tau = (1 - q) / f, tMid = tau + (DUTY / 2) / f;
      homeWorld(state.dist + speed * tMid, leg.home, leg.target);
      const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
      H = tmp2.copy(leg.lift).lerp(leg.target, e);
      H.y = (leg.fore ? 0.3 : 0.22) * bump(u, leg.fore ? 0.42 : 0.5);
      if (leg.fore) c = -0.12 - 1.1 * bump(u, 0.4) * (1 - smooth(0.85, 1, u)) + 0.12 * smooth(0.7, 1, u);
      else c = 0.5 + 0.55 * bump(u, 0.4) - 0.08 * smooth(0.8, 1, u);
      a4 = base4 - 0.35 - 1.2 * bump(u, 0.3) + 0.35 * smooth(0.6, 1, u);
    }
    leg.wasStance = stance;
    solveLeg(leg, H, c, a4);
    if (DEBUG) { leg.dbgH = H.clone(); leg.dbgStance = stance; }
  }

  // ear flicks
  const blink = { t: 0, next: 3 };
  const earState = [{ g: earL, s: 1, t: 0, next: 2 }, { g: earR, s: -1, t: 0, next: 3.5 }];

  function update(dt, init) {
    const k = state.speedK;
    const f = 0.62 * Math.sqrt(k), speed = 1.08 * k;
    state.time += dt;
    state.phase += dt * f;
    state.dist += dt * speed;
    const t = state.time, p = state.phase;

    const pose = pathPose(state.dist);
    giraffe.position.set(pose.x, 0, pose.z);
    let dyaw = pose.yaw - (state.lastYaw === undefined ? pose.yaw : state.lastYaw);
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    state.lastYaw = pose.yaw;
    if (dt > 0) state.turn = lerp(state.turn || 0, dyaw / dt, 1 - Math.exp(-dt * 2));
    giraffe.rotation.y = pose.yaw;

    // body motion: lateral sway toward stance side (pace-like walk), small bob and pitch
    const amp = smooth(0.3, 1, k);
    body.position.set(0.035 * amp * Math.cos(TAU * (p - 0.4)), 0.022 * amp * Math.cos(2 * TAU * (p - 0.12)) - 0.01, 0);
    body.rotation.set(0.008 * amp * Math.sin(2 * TAU * (p - 0.2)), 0.015 * amp * Math.sin(TAU * (p - 0.15)), -0.022 * amp * Math.cos(TAU * (p - 0.4)) - (state.turn || 0) * speed * 0.03);
    giraffe.updateMatrixWorld(true);

    legs.forEach((l) => updateLeg(l, f, speed, init));

    // neck: rhythmic forward bob (twice per stride) + slow look-around
    const nb = neck.bones;
    const bob = 0.055 * amp * Math.sin(2 * TAU * (p - 0.05));
    const look = 0.28 * Math.sin(t * 0.11) + 0.14 * Math.sin(t * 0.27 + 1.3) - (state.turn || 0) * 0.6;
    const lookUp = 0.08 * Math.sin(t * 0.07 + 2.0);
    const curve = [0, -0.03, -0.02, 0.0, 0.03, 0.06];
    let total = NECK_BASE_ANGLE;
    for (let i = 0; i < 6; i++) {
      const rx = i === 0 ? bob - lookUp : curve[i] + bob * 0.08 * (i - 2);
      nb[i].rotation.x = rx; nb[i].rotation.z = look / 6 * (0.6 + i * 0.15);
      total += rx;
    }
    const PSI = 0.78 + 0.03 * Math.sin(2 * TAU * (p - 0.3)) - lookUp * 0.5;
    head.rotation.set(PSI - total, look * 0.35, 0);

    // tail swish
    const tb = tail.bones;
    for (let i = 0; i < 5; i++) {
      tb[i].rotation.z = (0.03 + 0.035 * i) * Math.sin(t * 2.1 - i * 0.7) + 0.03 * Math.sin(TAU * p + i * 0.3);
      if (i > 0) tb[i].rotation.x = 0.06 * Math.sin(TAU * p - i * 0.5) + 0.04;
    }
    tb[0].rotation.x = 0.05 * Math.sin(TAU * 2 * p);

    // ears
    earState.forEach((e) => {
      e.t += dt;
      let flick = 0;
      if (e.t > e.next) { const ft = e.t - e.next; flick = Math.sin(Math.min(ft / 0.35, 1) * Math.PI); if (ft > 0.35) { e.t = 0; e.next = 2 + rand() * 6; } }
      e.g.rotation.set(0.25 * flick, e.s * (0.55 + 0.1 * Math.sin(t * 0.5 + e.s)), -e.s * (0.25 - 0.3 * flick));
    });

    // blinking
    blink.t += dt;
    let bl = 0;
    if (blink.t > blink.next) { const bt = (blink.t - blink.next) / 0.22; bl = Math.sin(Math.min(bt, 1) * Math.PI); if (bt >= 1) { blink.t = 0; blink.next = 2.5 + rand() * 4; } }
    for (const sd of [1, -1]) { const ul = head.userData['lid' + sd]; if (ul) ul.rotation.z = sd * (0.35 - 1.25 * bl); }

    windUniform.value = t;
    updateDust(dt);
  }

  // ---------- camera & UI ----------
  const camTarget = new V3();
  const lastFocus = new V3();
  function giraffeFocus(out) { return out.set(0, 2.6, 0.3).applyMatrix4(giraffe.matrixWorld); }
  function setCam(mode) {
    giraffe.updateMatrixWorld(true);
    giraffeFocus(camTarget);
    const local = {
      side: new V3(10.5, 1.2, 1.5), close: new V3(6.2, -0.6, 0.3), full: new V3(9.5, -0.6, 0.3), legs: new V3(3.6, 0.1, 0.6), closeR: new V3(-6.2, -0.6, 0.3), front: new V3(2.5, 0.6, 10), head: new V3(1.6, 0.1, 1.2), headSide: new V3(2.2, -0.1, 0.1), rear: new V3(-3, 1, -9), top: new V3(0.5, 14, 0.5),
    }[mode] || new V3(8, 1.5, 7);
    const off = local.clone().applyQuaternion(giraffe.quaternion);
    if (mode === 'legs') camTarget.y = 0.5;
    if (mode === "head" || mode === "headSide") { const hp = new V3(); head.getWorldPosition(hp); camTarget.copy(hp); }
    controls.target.copy(camTarget);
    camera.position.copy(camTarget).add(off);
    controls.update();
    giraffeFocus(lastFocus);
  }

  const ui = {
    speed: document.getElementById('speed'), tod: document.getElementById('tod'), follow: document.getElementById('follow'),
    pause: document.getElementById('pause'),
  };
  ui.speed.addEventListener('input', () => { state.speedK = parseFloat(ui.speed.value); });
  ui.tod.addEventListener('input', () => setTimeOfDay(parseFloat(ui.tod.value)));
  ui.pause.addEventListener('click', () => { state.paused = !state.paused; ui.pause.textContent = state.paused ? 'Play' : 'Pause'; });
  document.getElementById('camSide').addEventListener('click', () => setCam('side'));
  document.getElementById('camFront').addEventListener('click', () => setCam('front'));
  document.getElementById('camHead').addEventListener('click', () => setCam('head'));
  if (params.has('nogui')) document.getElementById('ui').style.display = 'none';
  if (state.paused) ui.pause.textContent = 'Play';

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  setTimeOfDay(parseFloat(params.get('tod') || ui.tod.value));
  ui.tod.value = params.get('tod') || ui.tod.value;
  update(0, true);
  setCam(params.get('cam') || 'default');

  const clock = new THREE.Clock();
  const focus = new V3();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    if (!state.paused) update(dt, false);
    giraffeFocus(focus);
    if (ui.follow.checked) {
      const d = focus.clone().sub(lastFocus);
      camera.position.add(d); controls.target.add(d);
    }
    lastFocus.copy(focus);
    controls.update();
    // shadow camera follows the giraffe
    sun.target.position.copy(giraffe.position);
    sun.position.copy(giraffe.position).addScaledVector(sunDir, 60);
    sun.target.updateMatrixWorld();
    renderer.render(scene, camera);
  }
  frame();
})();
