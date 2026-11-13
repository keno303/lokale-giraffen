/* environment.js — savanna world: sky dome, ground, grass, acacias, dust */
(function (global) {
  'use strict';

  const V3 = THREE.Vector3;

  /* ---------------------------------------------------------------- */
  /*  sky                                                              */
  /* ---------------------------------------------------------------- */
  function createSky(sunDir) {
    const geo = new THREE.SphereGeometry(700, 40, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x2f6cb0) },
        uMid: { value: new THREE.Color(0x8fb6d8) },
        uHorizon: { value: new THREE.Color(0xe6d7bb) },
        uSun: { value: new THREE.Color(0xfff0cf) },
        uSunDir: { value: sunDir.clone().normalize() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop, uMid, uHorizon, uSun, uSunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(uMid, uTop, pow(clamp(h, 0.0, 1.0), 0.7));
          col = mix(uHorizon, col, smoothstep(-0.02, 0.30, h));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSun * pow(sd, 1400.0) * 8.0;
          col += uSun * pow(sd, 12.0) * 0.30;
          col += uSun * pow(sd, 3.0) * 0.07;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* ---------------------------------------------------------------- */
  /*  ground                                                           */
  /* ---------------------------------------------------------------- */
  function createGround() {
    const canvas = Patterns.groundTexture(1024);
    const map = Patterns.tex(canvas, 90, 90);
    const bump = Patterns.tex(Patterns.furBumpTexture(256, 55), 90, 90, false);
    const mat = new THREE.MeshStandardMaterial({
      map, bumpMap: bump, bumpScale: 0.35, roughness: 1.0, metalness: 0.0, color: 0xffffff,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  /* worn trail the giraffe follows */
  function annulusGeometry(inner, outer, seg, worldScale) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(inner * ca, 0, inner * sa);
      uv.push(0.5 + inner * ca / (worldScale * 2), 0.5 + inner * sa / (worldScale * 2));
      pos.push(outer * ca, 0, outer * sa);
      uv.push(0.5 + outer * ca / (worldScale * 2), 0.5 + outer * sa / (worldScale * 2));
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function trailTexture() {
    const size = 512;
    const { c, x } = Patterns.canvas2d(size, size);
    const rnd = Patterns.mulberry32(313);
    const g = x.createRadialGradient(size / 2, size / 2, size * 0.10, size / 2, size / 2, size * 0.48);
    g.addColorStop(0, 'rgba(126,105,68,0.95)');
    g.addColorStop(0.72, 'rgba(140,118,78,0.75)');
    g.addColorStop(1, 'rgba(150,128,88,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    // speckle the packed dirt
    for (let i = 0; i < 900; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * size * 0.46;
      x.globalAlpha = 0.06 + rnd() * 0.12;
      x.fillStyle = rnd() > 0.5 ? '#6f5c39' : '#c6b183';
      x.beginPath();
      x.arc(size / 2 + Math.cos(a) * r, size / 2 + Math.sin(a) * r, 0.8 + rnd() * 3, 0, 6.283);
      x.fill();
    }
    x.globalAlpha = 1;
    return c;
  }

  function createTrail(radius) {
    const geo = annulusGeometry(radius - 1.5, radius + 1.5, 160, 80);
    const map = Patterns.tex(trailTexture(), 1, 1);
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshStandardMaterial({
      map, transparent: true, opacity: 0.85, roughness: 1, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.015;
    m.receiveShadow = true;
    return m;
  }

  /* ---------------------------------------------------------------- */
  /*  grass tufts                                                      */
  /* ---------------------------------------------------------------- */
  function tuftGeometry(blades, height) {
    blades = blades || 10;
    const pos = [], col = [], nor = [];
    const rnd = Patterns.mulberry32(404);
    const cBase = new THREE.Color(0x6f6234);
    const cTip = new THREE.Color(0xc8b56a);
    const c = new THREE.Color();
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * Math.PI * 2 + rnd() * 0.8;
      const dir = new V3(Math.cos(a), 0, Math.sin(a));
      const side = new V3(-Math.sin(a), 0, Math.cos(a));
      const h = height * (0.55 + rnd() * 0.8);
      const lean = 0.62 + rnd() * 0.6;
      const w = 0.0035 + rnd() * 0.0045;
      const base = dir.clone().multiplyScalar(0.02);
      const A = base.clone().addScaledVector(side, -w);
      const B = base.clone().addScaledVector(side, w);
      const M = base.clone().addScaledVector(dir, h * lean * 0.45).setY(h * 0.58);
      const T = base.clone().addScaledVector(dir, h * lean).setY(h);
      const tri = (p, q, r, ca, cb, cc) => {
        const n = new V3().crossVectors(
          new V3().subVectors(q, p), new V3().subVectors(r, p)).normalize();
        pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
        nor.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
        col.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
      };
      tri(A, B, M, cBase, cBase, cTip);
      tri(B, T, M, cBase, cTip, cTip);
      tri(T, A, M, cTip, cBase, cTip);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }

  function createGrass(count, radius, skip) {
    const geo = tuftGeometry(18, 0.36);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: 1, metalness: 0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const rnd = Patterns.mulberry32(808);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const ang = rnd() * Math.PI * 2;
      let rad = Math.sqrt(rnd()) * radius;
      if (skip && Math.abs(rad - skip) < 2.0) rad += 2.4 * (rad < skip ? -1 : 1);
      p.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
      q.setFromAxisAngle(new V3(0, 1, 0), rnd() * Math.PI * 2);
      const sc = 0.5 + rnd() * 0.75;
      s.set(sc, sc * (0.7 + rnd() * 0.75), sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      const t = 0.75 + rnd() * 0.5;
      col.setRGB(t, t * (0.92 + rnd() * 0.16), t * (0.7 + rnd() * 0.3));
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  /* ---------------------------------------------------------------- */
  /*  acacia trees                                                     */
  /* ---------------------------------------------------------------- */
  function canopyGeometry(cw, ch, seed) {
    const g = new THREE.SphereGeometry(1, 22, 12);
    const pos = g.attributes.position;
    const v = new V3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 1 + 0.20 * Math.sin(v.x * 4.1 + seed) * Math.cos(v.z * 3.3 + seed * 0.5);
      v.multiplyScalar(n);
      v.y = v.y > 0 ? v.y * 0.26 : v.y * 0.95;
      v.x *= cw; v.z *= cw; v.y *= ch;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  function acacia(rnd, scale) {
    const g = new THREE.Group();
    const h = (3.2 + rnd() * 2.2) * scale;
    const trunkPts = [];
    const lean = (rnd() - 0.5) * 0.5;
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      trunkPts.push(new V3(
        lean * h * t * t + (rnd() - 0.5) * 0.12 * scale,
        t * h,
        (rnd() - 0.5) * 0.12 * scale * t,
      ));
    }
    const trunkCurve = new THREE.CatmullRomCurve3(trunkPts, false, 'catmullrom', 0.5);
    const trunkGeo = Geom.loftGeometry({
      center: trunkCurve,
      radii: (t) => ({ x: (0.30 - 0.16 * t) * scale, y: (0.30 - 0.16 * t) * scale }),
      sections: 14, radial: 10,
    });
    const barkMat = new THREE.MeshStandardMaterial({ color: 0x6b5540, roughness: 0.95 });
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.castShadow = true; trunk.receiveShadow = true;
    g.add(trunk);

    // a couple of branches
    for (let b = 0; b < 3; b++) {
      const ang = rnd() * Math.PI * 2;
      const len = (0.9 + rnd() * 0.7) * scale;
      const bp = [];
      for (let i = 0; i <= 3; i++) {
        const t = i / 3;
        bp.push(new V3(
          Math.cos(ang) * len * t,
          h * 0.72 + t * len * 0.55,
          Math.sin(ang) * len * t,
        ));
      }
      const bc = new THREE.CatmullRomCurve3(bp, false, 'catmullrom', 0.5);
      const bg = Geom.loftGeometry({
        center: bc,
        radii: (t) => ({ x: (0.09 - 0.05 * t) * scale, y: (0.09 - 0.05 * t) * scale }),
        sections: 8, radial: 8,
      });
      const br = new THREE.Mesh(bg, barkMat);
      br.castShadow = true;
      g.add(br);
    }

    // flat-topped umbrella canopy
    const leafMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.21, 0.32, 0.24), roughness: 0.95, flatShading: true,
    });
    const cw = (2.4 + rnd() * 1.2) * scale;
    const canopy = new THREE.Mesh(canopyGeometry(cw, cw * 0.30, 100 + Math.floor(rnd() * 50)), leafMat);
    canopy.position.set(lean * h, h * 0.94, 0);
    canopy.castShadow = true;
    g.add(canopy);
    for (let i = 0; i < 5; i++) {
      const cl = new THREE.Mesh(
        canopyGeometry(cw * (0.34 + rnd() * 0.22), cw * 0.13, 300 + i), leafMat);
      cl.position.set(
        lean * h + (rnd() - 0.5) * cw * 1.05,
        h * (0.90 + rnd() * 0.14),
        (rnd() - 0.5) * cw * 1.05);
      cl.rotation.y = rnd() * 3;
      g.add(cl);
    }
    return g;
  }

  function createTrees(count, innerR, outerR) {
    const group = new THREE.Group();
    const rnd = Patterns.mulberry32(909);
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = innerR + rnd() * (outerR - innerR);
      const t = acacia(rnd, 0.8 + rnd() * 0.9);
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      t.rotation.y = rnd() * Math.PI * 2;
      group.add(t);
    }
    return group;
  }

  function createRocks(count, radius) {
    const group = new THREE.Group();
    const rnd = Patterns.mulberry32(616);
    const mat = new THREE.MeshStandardMaterial({ color: 0x7c7263, roughness: 0.95, flatShading: true });
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 12 + rnd() * radius;
      const s = 0.16 + rnd() * 0.4;
      const m = new THREE.Mesh(Geom.blobGeometry(s, 1, 0.35, 700 + i, new V3(1, 0.7, 1)), mat);
      m.position.set(Math.cos(a) * r, s * 0.35, Math.sin(a) * r);
      m.rotation.set(rnd(), rnd() * 3, rnd());
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }

  function createBushes(count, radius) {
    const group = new THREE.Group();
    const rnd = Patterns.mulberry32(717);
    const mat = new THREE.MeshStandardMaterial({ color: 0x515d2d, roughness: 0.95, flatShading: true });
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 10 + rnd() * radius;
      const s = 0.15 + rnd() * 0.30;
      const m = new THREE.Mesh(Geom.blobGeometry(s, 1, 0.3, 900 + i, new V3(1.3, 0.75, 1.3)), mat);
      m.position.set(Math.cos(a) * r, s * 0.5, Math.sin(a) * r);
      m.castShadow = true; m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }

  /* ---------------------------------------------------------------- */
  /*  dust puffs                                                       */
  /* ---------------------------------------------------------------- */
  function createDust(max) {
    max = max || 300;
    const positions = new Float32Array(max * 3);
    const life = new Float32Array(max);
    const seed = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new V3(), 1e4);

    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uMap: { value: new THREE.CanvasTexture(Patterns.puffTexture(128)) },
        uScale: { value: 600 },
        uColor: { value: new THREE.Color(0xcdbb96) },
      },
      vertexShader: `
        attribute float aLife;
        attribute float aSeed;
        uniform float uScale;
        varying float vLife;
        varying float vSeed;
        void main() {
          vLife = aLife; vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float grow = 1.0 + (1.0 - aLife) * 2.2;
          gl_PointSize = max(1.0, uScale * (0.10 + 0.06 * aSeed) * grow / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying float vLife;
        varying float vSeed;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          float a = t.a * vLife * vLife * 0.5;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor * (0.85 + 0.3 * vSeed), a);
        }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 2;

    const parts = [];
    for (let i = 0; i < max; i++) parts.push({ on: false, p: new V3(), v: new V3(), t: 0, life: 1 });
    let cursor = 0;

    return {
      points,
      spawn(x, y, z, strength) {
        const p = parts[cursor];
        cursor = (cursor + 1) % max;
        p.on = true;
        p.p.set(x, y, z);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.35 * strength;
        p.v.set(Math.cos(a) * r, 0.25 + Math.random() * 0.35 * strength, Math.sin(a) * r);
        p.t = 0;
        p.life = 0.9 + Math.random() * 0.8;
      },
      update(dt) {
        for (let i = 0; i < max; i++) {
          const p = parts[i];
          if (!p.on) { life[i] = 0; continue; }
          p.t += dt;
          if (p.t >= p.life) { p.on = false; life[i] = 0; continue; }
          p.v.y -= 0.22 * dt;
          p.v.multiplyScalar(1 - 1.6 * dt);
          p.p.addScaledVector(p.v, dt);
          positions[i * 3] = p.p.x; positions[i * 3 + 1] = p.p.y; positions[i * 3 + 2] = p.p.z;
          life[i] = 1 - p.t / p.life;
          seed[i] = Math.random();
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aLife.needsUpdate = true;
        geo.attributes.aSeed.needsUpdate = true;
      },
      setScale(s) { mat.uniforms.uScale.value = s; },
    };
  }

  /* soft blob shadow used for distant animals (outside the sun's shadow frustum) */
  function createContactShadow() {
    const size = 128;
    const { c, x } = Patterns.canvas2d(size, size);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(40,30,16,0.55)');
    g.addColorStop(0.55, 'rgba(40,30,16,0.30)');
    g.addColorStop(1, 'rgba(40,30,16,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    mesh.scale.set(3.4, 2.0, 1);
    mesh.renderOrder = 1;
    return mesh;
  }

  /* a few soft clouds high over the plain */
  function cloudTexture() {
    const w = 512, h = 256;
    const { c, x } = Patterns.canvas2d(w, h);
    const rnd = Patterns.mulberry32(5150);
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const cx = 40 + rnd() * (w - 80);
      const cy = h * (0.42 + rnd() * 0.28);
      const r = 24 + rnd() * 52;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.62)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath();
      x.ellipse(cx, cy, r * 1.5, r * 0.62, 0, 0, 6.283);
      x.fill();
    }
    return c;
  }

  function createClouds(count) {
    const group = new THREE.Group();
    const tex = new THREE.CanvasTexture(cloudTexture());
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.85, fog: false,
    });
    const rnd = Patterns.mulberry32(6060);
    for (let i = 0; i < count; i++) {
      const s = 90 + rnd() * 150;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.5), mat);
      const a = rnd() * Math.PI * 2;
      const d = 180 + rnd() * 260;
      m.position.set(Math.cos(a) * d, 90 + rnd() * 90, Math.sin(a) * d);
      m.rotation.x = -Math.PI / 2 + 0.06;
      m.rotation.z = rnd() * 3;
      m.renderOrder = -0.5;
      group.add(m);
    }
    return group;
  }

  global.Environment = {
    createSky, createGround, createTrail, createGrass, createTrees,
    createRocks, createBushes, createDust, createContactShadow, createClouds,
  };
})(window);
