// Savanna environment: sky, sun, ground, grass, acacias and distant hills.
// Everything is procedural; the world scrolls endlessly around the walking giraffe.
(function () {
  'use strict';
  const GIR = (window.GIR = window.GIR || {});

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------------------------------------------------------------- textures
  function groundTexture() {
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), r = rng(11);
    g.fillStyle = '#a98b5c'; g.fillRect(0, 0, S, S);
    // soil mottling (wrapped blobs)
    for (let i = 0; i < 900; i++) {
      const x = r() * S, y = r() * S, rad = 8 + r() * 46;
      const l = 0.5 + r() * 0.5, a = 0.05 + r() * 0.09;
      const col = r() < 0.5 ? `rgba(${Math.floor(120 * l)},${Math.floor(92 * l)},${Math.floor(58 * l)},${a})` : `rgba(${Math.floor(214 * l + 30)},${Math.floor(186 * l + 30)},${Math.floor(128 * l + 20)},${a})`;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        if (x + ox < -rad || x + ox > S + rad || y + oy < -rad || y + oy > S + rad) continue;
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
        g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    // dry grass litter: lots of short straw strokes
    g.lineCap = 'round';
    for (let i = 0; i < 26000; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI, len = 3 + r() * 11;
      const t = r();
      const cr = Math.floor(lerp(150, 232, t)), cg = Math.floor(lerp(122, 204, t)), cb = Math.floor(lerp(70, 132, t));
      g.strokeStyle = `rgba(${cr},${cg},${cb},${0.25 + r() * 0.5})`;
      g.lineWidth = 0.6 + r() * 1.1;
      const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        if (x + ox < -14 || x + ox > S + 14 || y + oy < -14 || y + oy > S + 14) continue;
        g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + dx, y + oy + dy); g.stroke();
      }
    }
    // pebbles / dark specks
    for (let i = 0; i < 2600; i++) {
      const x = r() * S, y = r() * S;
      g.fillStyle = r() < 0.6 ? `rgba(70,52,34,${0.15 + r() * 0.3})` : `rgba(235,220,190,${0.15 + r() * 0.25})`;
      g.beginPath(); g.arc(x, y, 0.6 + r() * 1.8, 0, 7); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  function leafTexture() {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), r = rng(5);
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 1500; i++) {
      const x = r() * S, y = r() * S, a = r() * Math.PI, l = 3 + r() * 5, w = 1.4 + r() * 2.2;
      const t = r();
      g.fillStyle = `rgb(${Math.floor(lerp(58, 122, t))},${Math.floor(lerp(84, 138, t))},${Math.floor(lerp(30, 58, t))})`;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        if (x + ox < -9 || x + ox > S + 9 || y + oy < -9 || y + oy > S + 9) continue;
        g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.beginPath(); g.ellipse(0, 0, l, w, 0, 0, 7); g.fill(); g.restore();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function blobTexture() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  // ---------------------------------------------------------------- sky
  const SKY_FRAG = `
uniform vec3 uSun, uZenith, uHorizon, uSunCol, uGroundCol;
uniform float uCloud;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n2(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.38));
  col = mix(col, uHorizon * 1.04, exp(-h * 9.0) * 0.6);
  float sd = max(dot(d, uSun), 0.0);
  col += uSunCol * (pow(sd, 12.0) * 0.16 + pow(sd, 90.0) * 0.5);
  // high, thin clouds
  vec2 cuv = d.xz / (d.y + 0.12);
  float cl = fbm(cuv * vec2(0.55, 1.1) + vec2(3.1, 0.0));
  cl = smoothstep(0.60, 0.95, cl + 0.12 * fbm(cuv * 3.1)) * smoothstep(0.015, 0.22, d.y) * uCloud;
  vec3 ccol = mix(uHorizon * 1.08, vec3(1.0), 0.55) + uSunCol * 0.22 * pow(sd, 3.0);
  col = mix(col, ccol, cl * 0.75);
  col += uSunCol * smoothstep(0.99955, 0.99985, dot(d, uSun)) * 14.0 * (1.0 - cl);
  col = mix(col, uGroundCol, smoothstep(0.0, -0.06, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

  // ---------------------------------------------------------------- acacia
  function tube(points, radii, sides) {
    const pos = [], idx = [], nor = [];
    const up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < points.length; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[Math.min(points.length - 1, i + 1)];
      t.subVectors(p1, p0).normalize();
      a.crossVectors(t, Math.abs(t.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize();
      b.crossVectors(t, a).normalize();
      for (let j = 0; j < sides; j++) {
        const an = j / sides * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
        const nx = a.x * c + b.x * s, ny = a.y * c + b.y * s, nz = a.z * c + b.z * s;
        pos.push(points[i].x + nx * radii[i], points[i].y + ny * radii[i], points[i].z + nz * radii[i]);
        nor.push(nx, ny, nz);
      }
    }
    for (let i = 0; i < points.length - 1; i++) for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides, p = i * sides, q = (i + 1) * sides;
      idx.push(p + j, p + j2, q + j, p + j2, q + j2, q + j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }

  let blobBase = null;
  function makeBlob(r, c, rx, ry, rz) {
    if (!blobBase) blobBase = new THREE.IcosahedronGeometry(1, 2);
    const g = blobBase.clone();
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const col = new Float32Array(p.count * 3);
    const ph = r() * 10;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const w = 1 + 0.16 * Math.sin(x * 4.1 + ph) * Math.sin(z * 3.7 + ph * 1.3) + 0.1 * Math.sin(y * 6 + x * 5 + ph);
      const yy = y < 0 ? y * 0.55 : y;
      n.setXYZ(i, x, y * 1.6 + 0.35, z);
      p.setXYZ(i, c.x + x * rx * w, c.y + yy * ry * w, c.z + z * rz * w);
      uv.setXY(i, uv.getX(i) * Math.max(2, Math.round(rx * 2.4)), uv.getY(i) * 2);
      const sh = 0.42 + 0.58 * Math.min(1, Math.max(0, y * 0.9 + 0.55));
      col[i * 3] = sh; col[i * 3 + 1] = sh; col[i * 3 + 2] = sh * 0.95;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.normalizeNormals();
    return g;
  }
  function makeShrub(seed) {
    const r = rng(seed), gs = [];
    for (let i = 0; i < 6; i++) gs.push(makeBlob(r, new THREE.Vector3((r() - 0.5) * 1.6, 0.45 + r() * 0.5, (r() - 0.5) * 1.6), 0.6 + r() * 0.5, 0.5 + r() * 0.35, 0.6 + r() * 0.5));
    return THREE.mergeGeometries(gs);
  }

  function makeAcacia(seed) {
    const r = rng(seed);
    const woods = [], leaves = [];
    const H = 5.5 + r() * 2.5;
    const blob = (c, rx, ry, rz) => leaves.push(makeBlob(r, c, rx, ry, rz));
    function branch(start, dir, len, rad, depth) {
      const pts = [], radii = [];
      const bend = new THREE.Vector3(r() - 0.5, (r() - 0.3) * 0.5, r() - 0.5).multiplyScalar(0.5);
      const d = dir.clone();
      const p = start.clone();
      const n = 5;
      for (let i = 0; i <= n; i++) {
        pts.push(p.clone()); radii.push(rad * (1 - 0.38 * i / n));
        d.addScaledVector(bend, 1 / n).normalize();
        if (depth > 0) d.y = lerp(d.y, 0.22, 0.12);
        d.normalize();
        p.addScaledVector(d, len / n);
      }
      woods.push(tube(pts, radii, depth === 0 ? 8 : 6));
      const end = pts[n];
      if (depth >= 3 || rad < 0.035) {
        blob(new THREE.Vector3(end.x, Math.max(end.y, H * 0.82) + 0.15, end.z), 1.5 + r() * 1.0, 0.42 + r() * 0.22, 1.5 + r() * 1.0);
        return;
      }
      const kids = depth === 0 ? 3 + Math.floor(r() * 2) : 2 + Math.floor(r() * 1.6);
      const a0 = r() * Math.PI * 2;
      for (let k = 0; k < kids; k++) {
        const an = a0 + (k / kids) * Math.PI * 2 + (r() - 0.5) * 0.7;
        const tilt = depth === 0 ? 0.55 + r() * 0.35 : 0.75 + r() * 0.5;
        const nd = new THREE.Vector3(Math.cos(an) * Math.sin(tilt), Math.cos(tilt), Math.sin(an) * Math.sin(tilt));
        nd.lerp(d, 0.3).normalize();
        branch(end, nd, len * (0.62 + r() * 0.2), rad * 0.62, depth + 1);
      }
    }
    branch(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3((r() - 0.5) * 0.25, 1, (r() - 0.5) * 0.25).normalize(), H * 0.5, 0.2 + r() * 0.08, 0);
    // filler blobs to close the umbrella
    for (let i = 0; i < 5; i++) {
      const an = r() * 7, rd = r() * H * 0.42;
      blob(new THREE.Vector3(Math.cos(an) * rd, H * (0.86 + r() * 0.07), Math.sin(an) * rd), 1.7 + r(), 0.4 + r() * 0.2, 1.7 + r());
    }
    return { wood: THREE.mergeGeometries(woods), leaf: THREE.mergeGeometries(leaves), radius: H * 0.75, height: H };
  }

  // ---------------------------------------------------------------- build
  GIR.buildEnvironment = function (scene, renderer, opts) {
    opts = opts || {};
    const U = {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uGroundCol: { value: new THREE.Color() }, uCloud: { value: 1 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 0.0); gl_Position = projectionMatrix * vec4(p.xyz, 1.0); gl_Position.z = gl_Position.w; }',
      fragmentShader: SKY_FRAG,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    scene.add(sky);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(sky.geometry, skyMat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null;

    scene.fog = new THREE.FogExp2(0xd8c9a8, 0.0042);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a6a40, 0.35);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025; sun.shadow.radius = 2.5;
    scene.add(sun, sun.target);

    // ground
    const gTex = groundTexture();
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, map: gTex });
    groundMat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <map_fragment>', `
          vec2 guv = vWPos.xz;
          vec3 g1 = texture2D(map, guv / 5.3).rgb;
          vec3 g2 = texture2D(map, guv.yx / 23.0 + 0.37).rgb;
          float m1 = texture2D(map, guv / 91.0 + 0.11).g, m2 = texture2D(map, guv.yx / 317.0).r;
          float nearW = smoothstep(60.0, 8.0, length(vWPos - cameraPosition));
          vec3 gc = mix(g2, g1, 0.35 + 0.4 * nearW);
          gc *= 0.62 + 0.55 * m1 + 0.45 * m2;
          gc = mix(gc, gc * vec3(0.86, 0.95, 0.70), smoothstep(0.42, 0.7, m2) * 0.5);
          gc = mix(gc, vec3(0.62, 0.50, 0.30) * (0.8 + 0.4 * m1), smoothstep(14.0, 70.0, length(vWPos - cameraPosition)) * 0.6);
          diffuseColor.rgb *= gc * 1.18;`);
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);

    const R = rng(77);
    const updaters = [];
    const center = new THREE.Vector2();

    if (!opts.simple) {
      // ---- grass tufts (instanced blades, wrapped around the giraffe in the shader)
      const AREA = 84, HALF = AREA / 2, TUFTS = 26000, BL = 12;
      const bp = [], bi = [], bh = [];
      for (let k = 0; k < BL; k++) {
        const an = R() * Math.PI * 2, lean = 0.1 + R() * 0.55, hh = 0.5 + R() * 0.6, w = 0.007 + R() * 0.008;
        const dx = Math.cos(an), dz = Math.sin(an), fa = an + 1.2 + R() * 0.8, px = Math.cos(fa) * w, pz = Math.sin(fa) * w;
        const ox = dx * 0.05 * R(), oz = dz * 0.05 * R();
        const base = bp.length / 3;
        const o1 = lean * 0.2 * hh, o2 = lean * hh;
        bp.push(ox + px, 0, oz + pz, ox - px, 0, oz - pz,
          ox + dx * o1 + px * 0.75, hh * 0.5, oz + dz * o1 + pz * 0.75, ox + dx * o1 - px * 0.75, hh * 0.5, oz + dz * o1 - pz * 0.75,
          ox + dx * o2, hh, oz + dz * o2);
        bh.push(0, 0, 0.5, 0.5, 1);
        bi.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
      }
      const gg = new THREE.InstancedBufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      gg.setAttribute('aH', new THREE.Float32BufferAttribute(bh, 1));
      gg.setAttribute('normal', new THREE.Float32BufferAttribute(bh.flatMap(() => [0, 1, 0]), 3));
      gg.setIndex(bi);
      const off = new Float32Array(TUFTS * 4), tint = new Float32Array(TUFTS * 3);
      for (let i = 0; i < TUFTS; i++) {
        off[i * 4] = R() * AREA; off[i * 4 + 1] = R() * AREA; off[i * 4 + 2] = R() * Math.PI * 2;
        const clump = Math.sin(off[i * 4] * 0.21) * Math.sin(off[i * 4 + 1] * 0.17 + 1.3);
        const big = Math.sin(off[i * 4] * 0.075 + 2.0) * Math.sin(off[i * 4 + 1] * 0.0748 + 0.4);
        off[i * 4 + 3] = (0.4 + R() * 0.8) * (0.7 + 0.5 * clump) * (0.55 + 0.45 * Math.min(1, Math.max(0, big * 2.5 + 0.8)));
        const t = R(), gr = Math.max(0, clump) * R();
        tint[i * 3] = lerp(0.60, 0.95, t) - gr * 0.28; tint[i * 3 + 1] = lerp(0.46, 0.78, t) - gr * 0.04; tint[i * 3 + 2] = lerp(0.2, 0.4, t) - gr * 0.1;
      }
      gg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
      gg.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
      gg.instanceCount = TUFTS;
      const grassU = { uCenter: { value: center }, uTime: { value: 0 } };
      const grassMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      grassMat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, grassU);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 aOff; attribute vec3 aTint; attribute float aH;
uniform vec2 uCenter; uniform float uTime;
varying vec3 vTint;`)
          .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
          .replace('#include <begin_vertex>', `
vec2 w = mod(aOff.xy - uCenter + ${HALF.toFixed(1)}, ${AREA.toFixed(1)}) - ${HALF.toFixed(1)};
float fade = smoothstep(${HALF.toFixed(1)}, ${(HALF * 0.72).toFixed(1)}, length(w));
float ca = cos(aOff.z), sa = sin(aOff.z);
vec3 transformed = vec3(position.x * ca - position.z * sa, position.y, position.x * sa + position.z * ca) * aOff.w * fade;
vec2 wp = w + uCenter;
float sway = sin(uTime * 1.3 + wp.x * 0.35 + wp.y * 0.21) + 0.5 * sin(uTime * 2.9 + wp.x * 1.7);
transformed.xz += vec2(0.05, 0.03) * sway * aH * aH * aOff.w;
transformed.xz += wp;
vTint = aTint * (0.55 + 0.6 * aH);`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
          .replace('#include <color_fragment>', 'diffuseColor.rgb *= vTint;')
          .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
      };
      const grass = new THREE.Mesh(gg, grassMat);
      grass.frustumCulled = false; grass.receiveShadow = true;
      scene.add(grass);
      updaters.push((x, cam, t) => { grassU.uTime.value = t; });

      // ---- acacias
      const leafTex = leafTexture();
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.95 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: leafTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, vertexColors: true });
      const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x1a1206, opacity: 0.8 });
      const blobGeo = new THREE.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
      const variants = [makeAcacia(3), makeAcacia(8), makeAcacia(21)];
      const SPAN = 520, N = 34;
      const trees = [];
      for (let i = 0; i < N; i++) {
        const v = variants[i % variants.length];
        const z0 = (R() < 0.5 ? -1 : 1) * (17 + Math.pow(R(), 1.6) * 190);
        const tr = { v, x: R() * SPAN, z: z0, s: 0.8 + R() * 0.7, rot: R() * 7 };
        const grp = new THREE.Group();
        const wood = new THREE.Mesh(v.wood, woodMat), leaf = new THREE.Mesh(v.leaf, leafMat);
        const shadow = new THREE.Mesh(blobGeo, blobMat);
        shadow.renderOrder = 1;
        grp.add(wood, leaf);
        grp.rotation.y = tr.rot;
        tr.grp = grp; tr.shadow = shadow;
        scene.add(grp, shadow);
        trees.push(tr);
      }
      // a few low shrubs close to the path
      const shrubGeo = makeShrub(40);
      const shrubMat = leafMat.clone(); shrubMat.color.set(0xa9a67c);
      const shrubs = [];
      for (let i = 0; i < 16; i++) {
        const m = new THREE.Mesh(shrubGeo, shrubMat);
        const sh = { m, x: R() * SPAN, z: (R() < 0.5 ? -1 : 1) * (15 + R() * 60), s: 0.6 + R() * 0.7 };
        m.rotation.y = R() * 7;
        const shadow = new THREE.Mesh(blobGeo, blobMat); shadow.renderOrder = 1;
        sh.shadow = shadow;
        scene.add(m, shadow); shrubs.push(sh);
      }
      const sdir = new THREE.Vector3();
      updaters.push(x => {
        sdir.copy(U.uSun.value);
        const sl = Math.min(4, 1 / Math.max(0.2, sdir.y)); // shadow stretch
        const hx = -sdir.x / Math.max(0.2, sdir.y), hz = -sdir.z / Math.max(0.2, sdir.y);
        const ang = Math.atan2(-hz, hx);
        for (const t of trees) {
          const wx = t.x + SPAN * Math.round((x - t.x) / SPAN);
          const edge = Math.min(1, (SPAN / 2 - Math.abs(wx - x)) / 30);
          const s = t.s * (0.001 + 0.999 * edge * edge * (3 - 2 * edge));
          t.grp.position.set(wx, 0, t.z); t.grp.scale.setScalar(s);
          const hh = t.v.height * s * 0.9, rr = t.v.radius * s * 2.3;
          t.shadow.position.set(wx + hx * hh, 0.03, t.z + hz * hh);
          t.shadow.rotation.y = ang;
          t.shadow.scale.set(rr * (0.6 + 0.4 * sl), 1, rr);
        }
        for (const t of shrubs) {
          const wx = t.x + SPAN * Math.round((x - t.x) / SPAN);
          const edge = Math.min(1, (SPAN / 2 - Math.abs(wx - x)) / 30);
          const s = t.s * (0.001 + 0.999 * edge);
          t.m.position.set(wx, 0, t.z); t.m.scale.setScalar(s);
          t.shadow.position.set(wx + hx * 0.4, 0.03, t.z + hz * 0.4);
          t.shadow.scale.set(s * 4.2, 1, s * 3.4);
        }
      });

      // ---- distant hills (two parallax layers that travel with the camera)
      const hillMats = [];
      function hills(radius, hMax, seed, par) {
        const r = rng(seed), seg = 220, pos = [], idx = [];
        const ph = [r() * 7, r() * 7, r() * 7, r() * 7];
        for (let i = 0; i <= seg; i++) {
          const a = i / seg * Math.PI * 2;
          let h = 0.5 + 0.5 * Math.sin(a * 3 + ph[0]); h *= 0.55 + 0.45 * Math.sin(a * 7 + ph[1]);
          h = Math.max(0, h) + 0.12 * Math.sin(a * 17 + ph[2]) + 0.05 * Math.sin(a * 41 + ph[3]);
          h = Math.max(0.03, h) * hMax;
          pos.push(Math.cos(a) * radius, -2, Math.sin(a) * radius, Math.cos(a) * radius, h, Math.sin(a) * radius);
          if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        const m = new THREE.MeshBasicMaterial({ color: 0x8899aa, fog: false, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(g, m);
        mesh.frustumCulled = false; mesh.renderOrder = -5;
        scene.add(mesh); hillMats.push({ m, par });
        updaters.push((x, cam) => { mesh.position.set(cam.position.x * par, 0, cam.position.z * par); });
      }
      hills(2300, 190, 4, 0.985);
      hills(1500, 70, 9, 0.96);
      updaters.hillMats = hillMats;
    }

    // ---------------------------------------------------------------- time of day
    const cA = new THREE.Color(), cB = new THREE.Color();
    const mixc = (out, a, b, t) => out.copy(cA.set(a)).lerp(cB.set(b), t);
    const sunDir = new THREE.Vector3();
    let envDirty = true, lastEnv = -1e9;
    function setTimeOfDay(k) {
      const el = THREE.MathUtils.degToRad(lerp(5, 62, k)), az = THREE.MathUtils.degToRad(lerp(76, 58, k));
      sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      U.uSun.value.copy(sunDir);
      const w = Math.pow(1 - Math.min(1, k / 0.55), 1.5); // warmth: 1 at sunrise/sunset, 0 at midday
      mixc(U.uZenith.value, 0x1c5cc0, 0x3d63a6, w);
      mixc(U.uHorizon.value, 0xbcd6ee, 0xf9c486, w);
      mixc(U.uSunCol.value, 0xfff4e2, 0xffa24d, w);
      mixc(U.uGroundCol.value, 0xc3b28c, 0xc79a66, w);
      mixc(sun.color, 0xfff3e0, 0xffac62, w);
      sun.intensity = lerp(3.7, 3.0, w) * Math.min(1, 0.45 + k * 4);
      mixc(hemi.color, 0xdfeaff, 0xffd9b8, w);
      hemi.intensity = 0.18;
      scene.fog.color.copy(U.uHorizon.value).lerp(cA.set(0xc9b48a), 0.25);
      scene.fog.density = lerp(0.0036, 0.005, w);
      if (updaters.hillMats) for (const h of updaters.hillMats) h.m.color.copy(U.uHorizon.value).lerp(cA.set(h.par > 0.97 ? 0x6f86a8 : 0x6b7466), h.par > 0.97 ? 0.38 : 0.5);
      scene.environmentIntensity = lerp(0.72, 0.62, w);
      envDirty = true;
    }
    setTimeOfDay(0.3);

    return {
      setTimeOfDay,
      update(x, camera, t) {
        center.set(x, 0);
        sky.position.copy(camera.position); sky.scale.setScalar(2500);
        sun.target.position.set(x + 0.3, 1.8, 0);
        sun.position.copy(sun.target.position).addScaledVector(sunDir, 30);
        ground.position.set(Math.round(x / 50) * 50, 0, 0);
        for (const u of updaters) u(x, camera, t);
        const now = performance.now();
        if (envDirty && now - lastEnv > 120) {
          envDirty = false; lastEnv = now;
          const old = envRT;
          envRT = pmrem.fromScene(envScene, 0, 0.1, 10);
          scene.environment = envRT.texture;
          if (old) old.dispose();
        }
      },
    };
  };
})();
