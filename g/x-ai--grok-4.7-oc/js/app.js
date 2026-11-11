/* Giraffa camelopardalis — a procedural walking giraffe.
   Opens from index.html with the vendored Three.js r159 UMD build. */

(function () {
  "use strict";

  const TAU = Math.PI * 2;

  // Walk: a pace. Same-side legs swing together, the way a real giraffe walks.
  const CYCLE = 1.48;
  const SWING = 0.40;
  const STANCE = 1 - SWING;
  const REACH = 0.58;
  const STANCE_TIME = CYCLE * STANCE;
  const SWING_TIME = CYCLE * SWING;
  const SPEED = (2 * REACH) / STANCE_TIME;
  const PATH_R = 16.5;

  const HOOF_DROP = 0.10;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  function sampleKeys(keys, n, fields) {
    const out = [];
    const m = keys.length;
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1)) * (m - 1);
      const i1 = Math.floor(f);
      const t = f - i1;
      const i0 = Math.max(0, i1 - 1);
      const i2 = Math.min(m - 1, i1 + 1);
      const i3 = Math.min(m - 1, i1 + 2);
      const a = keys[i0], b = keys[Math.min(i1, m - 1)], c = keys[i2], d = keys[i3];
      const s = {};
      for (const field of fields) s[field] = catmull(a[field], b[field], c[field], d[field], t);
      out.push(s);
    }
    return out;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------
  // Coat shader — Voronoi "cracks" are the cream channels between brown patches.
  // ---------------------------------------------------------------------------

  const COAT_VERT = `
    attribute vec3 aPattern;
    attribute vec2 aStyle;
    varying vec3 vPattern;
    varying vec2 vStyle;
    varying vec3 vWorldN;
  `;

  const COAT_FRAG = `
    varying vec3 vPattern;
    varying vec2 vStyle;
    varying vec3 vWorldN;

    vec3 hash33(vec3 p){
      p = fract(p * vec3(0.1031, 0.1030, 0.0973));
      p += dot(p, p.yxz + 33.33);
      return fract((p.xxy + p.yxx) * p.zyx);
    }
    float hash13(vec3 p){
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }
    float vnoise(vec3 x){
      vec3 i = floor(x);
      vec3 f = fract(x);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash13(i);
      float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
      float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
      float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
      float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
      float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
      float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
      float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
      float nx00 = mix(n000, n100, f.x);
      float nx10 = mix(n010, n110, f.x);
      float nx01 = mix(n001, n101, f.x);
      float nx11 = mix(n011, n111, f.x);
      return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
    }
    float voronoiEdge(vec3 p, out vec3 rnd){
      vec3 base = floor(p);
      vec3 f = fract(p);
      float md = 8.0;
      float md2 = 8.0;
      rnd = vec3(0.5);
      for (int k = -1; k <= 1; k++) {
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec3 g = vec3(float(i), float(j), float(k));
            vec3 o = hash33(base + g);
            vec3 r = g + o - f;
            float d = dot(r, r);
            if (d < md) {
              md2 = md;
              md = d;
              rnd = o;
            } else if (d < md2) {
              md2 = d;
            }
          }
        }
      }
      return sqrt(md2) - sqrt(md);
    }
    vec3 srgb(vec3 c){ return pow(c, vec3(2.2)); }
    vec3 coatColor(vec3 p, vec2 style){
      float scale = max(style.x, 0.001);
      float pale = clamp(style.y, 0.0, 1.0);
      vec3 q = p * scale;
      q.y *= 0.92;
      float w1 = vnoise(q * 0.75);
      float w2 = vnoise(q * 0.75 + vec3(4.2, 1.3, 2.1));
      float w3 = vnoise(q * 0.75 + vec3(1.7, 6.4, 3.3));
      q += vec3(w1, w2, w3) * 0.62;
      q += vec3(
        vnoise(q * 1.7 + vec3(8.0, 2.0, 1.0)),
        vnoise(q * 1.7 + vec3(1.0, 8.0, 3.0)),
        vnoise(q * 1.7 + vec3(3.0, 1.0, 9.0))
      ) * 0.22;
      vec3 rnd;
      float edge = voronoiEdge(q, rnd);
      float erode = mix(-0.01, 0.075, rnd.y);
      float spot = smoothstep(0.035 + erode, 0.145 + erode, edge);
      vec3 lineCol = srgb(vec3(0.945, 0.886, 0.745));
      vec3 spotA = srgb(vec3(0.455, 0.255, 0.135));
      vec3 spotB = srgb(vec3(0.600, 0.370, 0.195));
      vec3 spotC = srgb(vec3(0.300, 0.155, 0.080));
      vec3 spotCol = mix(spotA, spotB, rnd.z);
      spotCol = mix(spotCol, spotC, smoothstep(0.62, 0.98, rnd.x));
      float mottling = vnoise(q * 3.4 + rnd.x * 9.0);
      spotCol *= 0.90 + 0.18 * mottling;
      vec3 col = mix(lineCol, spotCol, spot);
      float grain = vnoise(p * 26.0);
      col *= 0.94 + 0.09 * grain;
      vec3 paleCol = srgb(vec3(0.965, 0.910, 0.800));
      float kept = mix(1.0, 0.18, pale);
      col = mix(paleCol, col, kept);
      return col;
    }
  `;

  function createCoatMaterial() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.0,
      sheen: 0.42,
      sheenRoughness: 0.65,
      sheenColor: new THREE.Color(0xd9c4a0),
    });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\n" + COAT_VERT)
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
           vPattern = aPattern;
           vStyle = aStyle;
           vWorldN = normalize(mat3(modelMatrix) * objectNormal);`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\n" + COAT_FRAG)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
           diffuseColor.rgb = coatColor(vPattern, vStyle);`
        );
    };
    mat.customProgramCacheKey = () => "giraffe-coat-v1";
    return mat;
  }

  const coatMat = createCoatMaterial();

  const maneMat = new THREE.MeshStandardMaterial({
    color: 0x8d4a24,
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const maneDarkMat = new THREE.MeshStandardMaterial({
    color: 0x6a3416,
    roughness: 0.94,
    side: THREE.DoubleSide,
  });
  // A short flat lock. PlaneGeometry lies in XY; width is across the crest, height stands off it.
  const maneCardGeo = new THREE.PlaneGeometry(0.045, 0.085, 1, 3);
  {
    const p = maneCardGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      // Taper the tip and bend it back a little.
      const t = (y + 0.0425) / 0.085;
      p.setX(i, p.getX(i) * lerp(1, 0.35, t));
      p.setZ(i, -t * t * 0.02);
    }
    maneCardGeo.translate(0, 0.02, 0);
    maneCardGeo.computeVertexNormals();
  }
  const hoofMat = new THREE.MeshStandardMaterial({
    color: 0x241c18,
    roughness: 0.42,
    metalness: 0.05,
  });
  const tuftMat = new THREE.MeshStandardMaterial({
    color: 0x16110e,
    roughness: 0.9,
  });
  const hornTipMat = new THREE.MeshStandardMaterial({
    color: 0x1a140f,
    roughness: 0.55,
  });
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0x3a342f,
    roughness: 0.38,
  });
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a120e,
    roughness: 0.18,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x070605, roughness: 0.3 });
  const innerEarMat = new THREE.MeshStandardMaterial({
    color: 0xf0c2b0,
    roughness: 0.72,
  });
  const lashMat = new THREE.MeshStandardMaterial({ color: 0x1c140f, roughness: 0.6 });

  // ---------------------------------------------------------------------------
  // Lofted organic meshes
  // ---------------------------------------------------------------------------

  const _n = new THREE.Vector3();
  const _b = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _up = new THREE.Vector3();

  function framesFor(points) {
    const frames = [];
    let normal = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < points.length; i++) {
      if (i === 0) _t.copy(points[1]).sub(points[0]);
      else if (i === points.length - 1) _t.copy(points[i]).sub(points[i - 1]);
      else _t.copy(points[i + 1]).sub(points[i - 1]);
      if (_t.lengthSq() < 1e-8) _t.set(0, 1, 0);
      _t.normalize();
      if (Math.abs(_t.dot(normal)) > 0.98) {
        normal.set(Math.abs(_t.y) < 0.9 ? 0 : 1, Math.abs(_t.y) < 0.9 ? 1 : 0, 0);
      }
      normal.addScaledVector(_t, -normal.dot(_t));
      if (normal.lengthSq() < 1e-8) normal.set(1, 0, 0);
      normal.normalize();
      _b.crossVectors(normal, _t).normalize();
      // Re-orthogonalize so binormal stays stable.
      _up.crossVectors(_t, _b).normalize();
      frames.push({
        t: _t.clone(),
        n: _up.clone(),
        b: _b.clone(),
      });
      normal.copy(_up);
    }
    return frames;
  }

  /**
   * stations: [{point: Vector3, rx, ry, ox, oy}]
   * Ellipse in the binormal (x) / normal (y) plane.
   */
  function loftGeometry(stations, radial, options) {
    const caps = !options || options.caps !== false;
    const points = stations.map((s) => s.point);
    const frames = framesFor(points);
    const rings = stations.length;
    const positions = new Float32Array(rings * radial * 3);
    const v = new THREE.Vector3();
    let p = 0;
    for (let i = 0; i < rings; i++) {
      const s = stations[i];
      const fr = frames[i];
      for (let j = 0; j < radial; j++) {
        const theta = (j / radial) * TAU;
        const x = Math.cos(theta) * s.rx + (s.ox || 0);
        const y = Math.sin(theta) * s.ry + (s.oy || 0);
        v.copy(s.point)
          .addScaledVector(fr.b, x)
          .addScaledVector(fr.n, y);
        positions[p++] = v.x;
        positions[p++] = v.y;
        positions[p++] = v.z;
      }
    }
    const indices = [];
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial;
        const a = i * radial + j;
        const b = i * radial + j2;
        const c = (i + 1) * radial + j;
        const d = (i + 1) * radial + j2;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }
    let positionArray = positions;
    if (caps) {
      const baseCenter = rings * radial;
      const tipCenter = baseCenter + 1;
      const capPos = new Float32Array((rings * radial + 2) * 3);
      capPos.set(positions);
      const p0 = stations[0].point;
      const p1 = stations[rings - 1].point;
      capPos[baseCenter * 3] = p0.x;
      capPos[baseCenter * 3 + 1] = p0.y;
      capPos[baseCenter * 3 + 2] = p0.z;
      capPos[tipCenter * 3] = p1.x;
      capPos[tipCenter * 3 + 1] = p1.y;
      capPos[tipCenter * 3 + 2] = p1.z;
      for (let j = 0; j < radial; j++) {
        const j2 = (j + 1) % radial;
        indices.push(baseCenter, j2, j);
        const tip = (rings - 1) * radial;
        indices.push(tipCenter, tip + j, tip + j2);
      }
      positionArray = capPos;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positionArray, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // Path direction changes the resulting winding. Force normals to point
    // away from each ring's center so the hide, not the hollow interior, faces out.
    const posAttr = geo.attributes.position;
    const norAttr = geo.attributes.normal;
    const probe = new THREE.Vector3();
    const nprobe = new THREE.Vector3();
    const outward = new THREE.Vector3();
    let dotSum = 0;
    for (let i = 1; i < rings - 1; i += Math.max(1, Math.floor((rings - 2) / 3))) {
      for (let j = 0; j < radial; j += Math.max(1, Math.floor(radial / 4))) {
        const vi = i * radial + j;
        probe.fromBufferAttribute(posAttr, vi);
        nprobe.fromBufferAttribute(norAttr, vi);
        outward.copy(probe).sub(stations[i].point);
        dotSum += nprobe.dot(outward);
      }
    }
    if (dotSum < 0) {
      const idx = geo.index;
      for (let i = 0; i < idx.count; i += 3) {
        const b = idx.getX(i + 1);
        const c = idx.getX(i + 2);
        idx.setX(i + 1, c);
        idx.setX(i + 2, b);
      }
      geo.computeVertexNormals();
    }
    return geo;
  }

  function straightStations(length, r0, r1, along, dir, bulge) {
    const stations = [];
    for (let i = 0; i <= along; i++) {
      const t = i / along;
      const muscle = bulge ? Math.sin(Math.min(t, 1) * Math.PI) * bulge * (1 - t) : 0;
      const r = lerp(r0, r1, t) + muscle;
      stations.push({
        point: new THREE.Vector3(0, dir * length * t, 0),
        rx: r,
        ry: r * (1 + (bulge ? 0.04 : 0)),
      });
    }
    return stations;
  }

  function profileToStations(samples, axis) {
    return samples.map((s) => {
      const point =
        axis === "z"
          ? new THREE.Vector3(0, s.y, s.z)
          : new THREE.Vector3(0, s.y, s.z);
      return { point, rx: Math.max(0.01, s.rx), ry: Math.max(0.01, s.ry), ox: s.ox || 0, oy: s.oy || 0 };
    });
  }

  function coatMesh(geo, coat) {
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, coatMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.coat = coat;
    return mesh;
  }

  function solidMesh(geo, mat, shadow) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = shadow !== false;
    mesh.receiveShadow = true;
    return mesh;
  }

  function bakeCoat(mesh) {
    const spec = mesh.userData.coat;
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const n = pos.count;
    const pattern = new Float32Array(n * 3);
    const style = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    const local = new THREE.Vector3();
    const nm = new THREE.Vector3();
    const nmat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < n; i++) {
      local.fromBufferAttribute(pos, i);
      v.copy(local).applyMatrix4(mesh.matrixWorld);
      pattern[i * 3] = v.x;
      pattern[i * 3 + 1] = v.y;
      pattern[i * 3 + 2] = v.z;
      let pale = spec.pale || 0;
      let scale = spec.scale;
      if (typeof spec.vertex === "function") {
        const extra = spec.vertex(local, v) || {};
        if (extra.pale != null) pale = Math.max(pale, extra.pale);
        if (extra.scale != null) scale = extra.scale;
      }
      if (spec.belly || spec.sock) {
        nm.fromBufferAttribute(nrm, i).applyMatrix3(nmat).normalize();
        if (spec.belly && nm.y < -0.05 && v.y < 2.05 && v.y > 1.15) {
          const b = smoothstep01((-nm.y - 0.05) / 0.75);
          pale = Math.max(pale, b * 0.92);
        }
        if (spec.sock) {
          const s = 1 - smoothstep01((v.y - 0.12) / 0.78);
          pale = Math.max(pale, s);
        }
      }
      style[i * 2] = scale;
      style[i * 2 + 1] = pale;
    }
    geo.setAttribute("aPattern", new THREE.BufferAttribute(pattern, 3));
    geo.setAttribute("aStyle", new THREE.BufferAttribute(style, 2));
  }

  function smoothstep01(t) {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  }

  // ---------------------------------------------------------------------------
  // Giraffe
  // ---------------------------------------------------------------------------

  function createGiraffe() {
    const root = new THREE.Group();
    root.name = "giraffe";
    const torso = new THREE.Group();
    torso.name = "torso";
    root.add(torso);

    // Body — short, deep, sloping from withers down to the rump.
    const bodyKeys = [
      { z: -1.12, y: 1.98, rx: 0.10, ry: 0.14 },
      { z: -0.98, y: 2.00, rx: 0.28, ry: 0.36 },
      { z: -0.72, y: 1.96, rx: 0.37, ry: 0.44 },
      { z: -0.38, y: 1.90, rx: 0.42, ry: 0.50 },
      { z: 0.05, y: 1.98, rx: 0.42, ry: 0.55 },
      { z: 0.28, y: 2.18, rx: 0.40, ry: 0.64 },
      { z: 0.48, y: 2.24, rx: 0.36, ry: 0.58 },
      { z: 0.66, y: 2.18, rx: 0.30, ry: 0.46 },
      { z: 0.82, y: 2.10, rx: 0.20, ry: 0.34 },
    ];
    const bodySamples = sampleKeys(bodyKeys, 28, ["z", "y", "rx", "ry"]);
    const body = coatMesh(loftGeometry(profileToStations(bodySamples, "z"), 22), {
      scale: 2.15,
      pale: 0,
      belly: true,
    });
    torso.add(body);

    // ---- Neck ----
    // Absolute pitches (radians from vertical, leaning +Z / forward).
    const neckDefs = [
      { len: 0.46, pitch: 0.46, r0x: 0.34, r0y: 0.42, r1x: 0.20, r1y: 0.26 },
      { len: 0.42, pitch: 0.44, r0x: 0.20, r0y: 0.26, r1x: 0.165, r1y: 0.210 },
      { len: 0.42, pitch: 0.40, r0x: 0.165, r0y: 0.210, r1x: 0.140, r1y: 0.175 },
      { len: 0.40, pitch: 0.36, r0x: 0.140, r0y: 0.175, r1x: 0.118, r1y: 0.148 },
      { len: 0.38, pitch: 0.33, r0x: 0.118, r0y: 0.148, r1x: 0.100, r1y: 0.126 },
      { len: 0.32, pitch: 0.30, r0x: 0.100, r0y: 0.126, r1x: 0.090, r1y: 0.112 },
    ];

    const neckBase = new THREE.Group();
    // Buried in the withers so the neck grows out of the shoulder instead of perching on it.
    neckBase.position.set(0, 1.92, 0.18);
    torso.add(neckBase);

    const neckBones = [];
    let parent = neckBase;
    let prevPitch = 0;
    neckDefs.forEach((def, i) => {
      const bone = new THREE.Group();
      bone.rotation.x = def.pitch - prevPitch;
      prevPitch = def.pitch;
      parent.add(bone);
      const along = 6;
      const stations = [];
      // Overlap neighboring segments so the bend reads as one neck, not a stack of tubes.
      const y0 = i === 0 ? 0 : -def.len * 0.12;
      const y1 = def.len * (i === neckDefs.length - 1 ? 1.04 : 1.24);
      for (let k = 0; k <= along; k++) {
        const t = k / along;
        const y = lerp(y0, y1, t);
        const rt = clamp((y / def.len), 0, 1);
        // Nest the root of each segment inside the previous sleeve to hide the joint.
        const nest = 0.955;
        const rx = lerp(def.r0x, def.r1x, rt) * nest;
        const ry = lerp(def.r0y, def.r1y, rt) * nest;
        stations.push({ point: new THREE.Vector3(0, y, 0), rx, ry });
      }
      const mesh = coatMesh(loftGeometry(stations, 16, { caps: i === 0 }), {
        scale: 2.45 + i * 0.12,
        pale: 0,
      });
      bone.add(mesh);

      // Short auburn mane along the nape (local -Z), lying back along the crest.
      const hairs = Math.max(6, Math.round(def.len / 0.035));
      for (let h = 0; h < hairs; h++) {
        const tt = (h + 0.5) / hairs;
        const ry = lerp(def.r0y, def.r1y, tt);
        const card = solidMesh(maneCardGeo, h % 4 === 0 ? maneDarkMat : maneMat, false);
        card.position.set((h % 2 === 0 ? -1 : 1) * 0.008, def.len * tt, -(ry * 0.92));
        card.rotation.y = (h % 2 === 0 ? 0.18 : -0.18);
        card.rotation.x = 0.55;
        card.scale.setScalar(lerp(1.15, 0.72, (i + tt) / neckDefs.length));
        bone.add(card);
      }

      const next = new THREE.Group();
      next.position.y = def.len;
      bone.add(next);
      neckBones.push(bone);
      parent = next;
    });

    // ---- Head ----
    const head = new THREE.Group();
    // Sink the skull slightly back into the neck so the junction doesn't gape.
    head.position.y = -0.07;
    // Tuned so the muzzle sits just above horizontal once the neck's lean is included.
    head.rotation.x = 0.42;
    parent.add(head);

    const headKeys = [
      { z: 0.00, y: 0.02, rx: 0.100, ry: 0.112 },
      { z: 0.07, y: 0.045, rx: 0.128, ry: 0.148 },
      { z: 0.15, y: 0.055, rx: 0.136, ry: 0.150 },
      { z: 0.24, y: 0.040, rx: 0.122, ry: 0.128 },
      { z: 0.33, y: 0.012, rx: 0.090, ry: 0.100 },
      { z: 0.44, y: -0.006, rx: 0.062, ry: 0.070 },
      { z: 0.54, y: -0.008, rx: 0.050, ry: 0.052 },
      { z: 0.63, y: -0.004, rx: 0.046, ry: 0.040 },
    ];
    const headSamples = sampleKeys(headKeys, 20, ["z", "y", "rx", "ry"]);
    const headMesh = coatMesh(loftGeometry(profileToStations(headSamples, "z"), 18), {
      scale: 6.4,
      pale: 0.08,
      vertex(local) {
        const muzzle = smoothstep01((local.z - 0.40) / 0.22);
        return { pale: muzzle * 0.75, scale: lerp(6.4, 9.5, muzzle) };
      },
    });
    head.add(headMesh);

    // Nose leather
    const nose = solidMesh(new THREE.SphereGeometry(0.048, 14, 12), noseMat);
    nose.scale.set(1.05, 0.78, 1.25);
    nose.position.set(0, 0.002, 0.625);
    head.add(nose);
    for (const s of [-1, 1]) {
      const nostril = solidMesh(new THREE.SphereGeometry(0.014, 8, 8), pupilMat, false);
      nostril.scale.set(0.7, 1.15, 0.7);
      nostril.position.set(s * 0.018, 0.012, 0.658);
      head.add(nostril);
    }
    // Mouth line
    const mouth = solidMesh(new THREE.BoxGeometry(0.045, 0.008, 0.05), pupilMat, false);
    mouth.position.set(0, -0.028, 0.60);
    mouth.rotation.x = 0.2;
    head.add(mouth);

    // Ossicones + median horn
    function ossicone(x, z, h, r) {
      const g = new THREE.Group();
      const shaft = coatMesh(
        loftGeometry(straightStations(h, r, r * 0.72, 4, 1, 0), 8),
        { scale: 8.5, pale: 0.15 }
      );
      g.add(shaft);
      const tip = solidMesh(new THREE.SphereGeometry(r * 1.15, 10, 8), hornTipMat);
      tip.position.y = h;
      g.add(tip);
      const tuft = solidMesh(new THREE.SphereGeometry(r * 0.7, 8, 6), tuftMat);
      tuft.scale.set(1, 1.4, 1);
      tuft.position.y = h + r * 0.7;
      g.add(tuft);
      g.position.set(x, 0.16, z);
      g.rotation.x = -0.15;
      g.rotation.z = x * 0.4;
      return g;
    }
    head.add(ossicone(-0.055, 0.14, 0.15, 0.020));
    head.add(ossicone(0.055, 0.14, 0.15, 0.020));
    const median = coatMesh(
      loftGeometry(straightStations(0.07, 0.028, 0.02, 3, 1, 0), 8),
      { scale: 8, pale: 0.2 }
    );
    median.position.set(0, 0.155, 0.20);
    head.add(median);

    // Ears
    function makeEar(side) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.06, 0.03, 0.075, 0.12, 0.012, 0.205);
      shape.bezierCurveTo(-0.02, 0.16, -0.055, 0.12, -0.045, 0.04);
      shape.bezierCurveTo(-0.035, 0.012, -0.01, 0.0, 0, 0);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.012,
        bevelEnabled: true,
        bevelThickness: 0.005,
        bevelSize: 0.005,
        bevelSegments: 2,
        curveSegments: 10,
      });
      geo.translate(0, 0, -0.006);
      const outer = coatMesh(geo, { scale: 7.5, pale: 0.25 });
      const innerGeo = geo.clone();
      innerGeo.scale(0.82, 0.86, 0.4);
      const inner = solidMesh(innerGeo, innerEarMat, false);
      inner.position.z = 0.008 * side;
      const pivot = new THREE.Group();
      const flap = new THREE.Group();
      flap.add(outer);
      flap.add(inner);
      // Shape is built in XY; stand it up and flare outward.
      flap.rotation.y = side * 0.15;
      pivot.add(flap);
      pivot.position.set(side * 0.10, 0.09, 0.07);
      pivot.rotation.z = side * -1.15;
      pivot.rotation.x = 0.25;
      pivot.rotation.y = side * -0.35;
      pivot.userData.flap = flap;
      pivot.userData.baseZ = flap.rotation.z;
      return pivot;
    }
    const earL = makeEar(1);
    const earR = makeEar(-1);
    head.add(earL);
    head.add(earR);

    // Eyes
    const lids = [];
    function makeEye(side) {
      const g = new THREE.Group();
      g.position.set(side * 0.105, 0.055, 0.27);
      // Push the eye along its outward aim.
      g.lookAt(side * 2.2, 0.4, 2.4);
      const ball = solidMesh(new THREE.SphereGeometry(0.034, 16, 12), eyeMat);
      g.add(ball);
      const pupil = solidMesh(new THREE.CircleGeometry(0.012, 12), pupilMat, false);
      pupil.position.z = 0.031;
      g.add(pupil);
      const iris = solidMesh(new THREE.CircleGeometry(0.02, 14), new THREE.MeshStandardMaterial({
        color: 0x5a3a22,
        roughness: 0.35,
      }), false);
      iris.position.z = 0.030;
      g.add(iris);
      const lidGeo = new THREE.SphereGeometry(0.040, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
      const lid = coatMesh(lidGeo, { scale: 7, pale: 0.35 });
      lid.rotation.x = -0.15;
      lid.userData.baseX = -0.15;
      g.add(lid);
      lids.push(lid);
      // Lashes
      for (let i = 0; i < 7; i++) {
        const a = -0.7 + (i / 6) * 1.4;
        const lash = solidMesh(new THREE.ConeGeometry(0.003, 0.028, 4), lashMat, false);
        lash.position.set(Math.sin(a) * 0.030, 0.018 + Math.cos(a) * 0.006, Math.cos(a) * 0.012 + 0.02);
        lash.rotation.x = 1.1;
        lash.rotation.z = -a * 0.6;
        g.add(lash);
      }
      return g;
    }
    head.add(makeEye(1));
    head.add(makeEye(-1));

    // ---- Tail ----
    const tailBase = new THREE.Group();
    tailBase.position.set(0, 2.02, -1.02);
    torso.add(tailBase);
    const tailSegs = [];
    let tailParent = tailBase;
    const tailLens = [0.18, 0.16, 0.15, 0.13];
    tailLens.forEach((len, i) => {
      const bone = new THREE.Group();
      // Hang downward: local +Y rotated toward -Y / slightly back (-Z).
      bone.rotation.x = i === 0 ? 2.35 : 0.25;
      tailParent.add(bone);
      const r0 = lerp(0.035, 0.012, i / tailLens.length);
      const r1 = lerp(0.035, 0.012, (i + 1) / tailLens.length);
      const mesh = coatMesh(loftGeometry(straightStations(len, r0, r1, 3, 1, 0), 8), {
        scale: 4.5,
        pale: 0.1,
      });
      bone.add(mesh);
      const nxt = new THREE.Group();
      nxt.position.y = len;
      bone.add(nxt);
      tailSegs.push(bone);
      tailParent = nxt;
    });
    // Long black tuft, the signature of the silhouette.
    const tuft = new THREE.Group();
    tailParent.add(tuft);
    for (let i = 0; i < 14; i++) {
      const len = 0.48 + (i % 5) * 0.04;
      const strand = solidMesh(new THREE.ConeGeometry(0.012, len, 4), tuftMat);
      const ang = (i / 14) * TAU;
      strand.position.set(Math.cos(ang) * 0.02, len * 0.35, Math.sin(ang) * 0.02);
      strand.rotation.x = Math.PI + (Math.sin(ang) * 0.25);
      strand.rotation.z = Math.cos(ang) * 0.25;
      tuft.add(strand);
    }

    // ---- Legs ----
    // Front legs nearly columnar, carpus bends forward.
    // Hind legs bend backward at the hock.
    function createLeg(opts) {
      const anchor = new THREE.Group();
      anchor.position.set(opts.x, opts.y, opts.z);
      torso.add(anchor);

      const upper = new THREE.Group();
      anchor.add(upper);
      const upperLen = opts.l1 + 0.07;
      const upperMesh = coatMesh(
        loftGeometry(straightStations(upperLen, opts.rHip, opts.rKnee, 7, -1, opts.bulge || 0), 12, { caps: false }),
        { scale: opts.upperScale, pale: 0, sock: true }
      );
      // Start the limb inside the torso and run it just past the joint.
      upperMesh.position.y = 0.05;
      upper.add(upperMesh);

      const lower = new THREE.Group();
      lower.position.y = -opts.l1;
      upper.add(lower);
      const lowerLen = opts.l2 + 0.06;
      const lowerMesh = coatMesh(
        loftGeometry(straightStations(lowerLen, opts.rKnee * 1.15, opts.rAnkle, 7, -1, 0.012), 12, { caps: false }),
        { scale: opts.lowerScale, pale: 0.05, sock: true }
      );
      lowerMesh.position.y = 0.05;
      lower.add(lowerMesh);

      const hoofPivot = new THREE.Group();
      hoofPivot.position.y = -opts.l2;
      lower.add(hoofPivot);
      // Pastern
      const pastern = coatMesh(
        loftGeometry(straightStations(0.07, opts.rAnkle, opts.rAnkle * 0.9, 2, -1, 0), 8),
        { scale: opts.lowerScale, pale: 0.65, sock: true }
      );
      hoofPivot.add(pastern);
      for (const s of [-1, 1]) {
        const toe = solidMesh(new THREE.CylinderGeometry(0.026, 0.032, 0.075, 7), hoofMat);
        toe.position.set(s * 0.024, -0.09, 0.016);
        toe.scale.set(0.95, 1.05, 1.35);
        hoofPivot.add(toe);
      }

      return {
        name: opts.name,
        phase: opts.phase,
        anchor,
        upper,
        lower,
        hoofPivot,
        l1: opts.l1,
        l2: opts.l2,
        bend: opts.bend,
        lift: opts.lift,
        hipLocal: new THREE.Vector3(opts.x, opts.y, opts.z),
        side: opts.x >= 0 ? 1 : -1,
      };
    }

    const legs = [
      createLeg({
        name: "fl", phase: 0.0, x: 0.20, y: 2.18, z: 0.50,
        l1: 1.14, l2: 0.98, rHip: 0.125, rKnee: 0.055, rAnkle: 0.038,
        bend: 1, lift: 0.20, upperScale: 3.3, lowerScale: 4.6, bulge: 0.02,
      }),
      createLeg({
        name: "fr", phase: 0.5, x: -0.20, y: 2.18, z: 0.50,
        l1: 1.14, l2: 0.98, rHip: 0.125, rKnee: 0.055, rAnkle: 0.038,
        bend: 1, lift: 0.20, upperScale: 3.3, lowerScale: 4.6, bulge: 0.02,
      }),
      createLeg({
        name: "hl", phase: 0.03, x: 0.17, y: 1.98, z: -0.62,
        l1: 1.02, l2: 0.90, rHip: 0.14, rKnee: 0.058, rAnkle: 0.038,
        bend: -1, lift: 0.26, upperScale: 3.1, lowerScale: 4.6, bulge: 0.03,
      }),
      createLeg({
        name: "hr", phase: 0.53, x: -0.17, y: 1.98, z: -0.62,
        l1: 1.02, l2: 0.90, rHip: 0.14, rKnee: 0.058, rAnkle: 0.038,
        bend: -1, lift: 0.26, upperScale: 3.1, lowerScale: 4.6, bulge: 0.03,
      }),
    ];

    return {
      root,
      torso,
      body,
      neckBase,
      neckBones,
      head,
      earL,
      earR,
      lids,
      tailSegs,
      tuft,
      legs,
    };
  }

  // ---------------------------------------------------------------------------
  // Gait
  // ---------------------------------------------------------------------------

  const _forward = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _hip = new THREE.Vector3();
  const _foot = new THREE.Vector3();
  const _localTarget = new THREE.Vector3();

  function pathAngle(time) {
    return (SPEED / PATH_R) * time;
  }

  function pathPose(time) {
    const a = pathAngle(time);
    // Position on XZ, forward is the tangent.
    const x = Math.sin(a) * PATH_R;
    const z = Math.cos(a) * PATH_R;
    _forward.set(Math.cos(a), 0, -Math.sin(a));
    // right = up × forward
    _right.set(_forward.z, 0, -_forward.x);
    const yaw = Math.atan2(_forward.x, _forward.z);
    return { x, z, yaw, forward: _forward, right: _right };
  }

  function torsoMotion(time) {
    const w = (time / CYCLE) * TAU;
    return {
      y: Math.sin(w * 2) * 0.018,
      pitch: Math.sin(w * 2 + 0.4) * 0.02,
      roll: Math.sin(w) * 0.028,
    };
  }

  function hipWorldAt(time, hipLocal, target) {
    const pose = pathPose(time);
    const m = torsoMotion(time);
    // Small-angle contribution of torso pitch/roll on the hip offset.
    const ly = hipLocal.y + m.y;
    const lx = hipLocal.x + hipLocal.y * m.roll;
    const lz = hipLocal.z - hipLocal.y * m.pitch;
    target.set(pose.x, 0, pose.z);
    target.addScaledVector(pose.right, lx);
    target.addScaledVector(pose.forward, lz);
    target.y = ly;
    return target;
  }

  const _liftPos = new THREE.Vector3();
  const _landPos = new THREE.Vector3();

  function computeFoot(time, leg, target) {
    const cycle = (((time / CYCLE) + leg.phase) % 1 + 1) % 1;
    if (cycle >= SWING) {
      const s = (cycle - SWING) / STANCE;
      const landingTime = time - s * STANCE_TIME;
      hipWorldAt(landingTime, leg.hipLocal, target);
      const pose = pathPose(landingTime);
      target.addScaledVector(pose.forward, REACH);
      target.y = HOOF_DROP;
      return { cycle, swingK: 0, planted: true };
    }
    const s = cycle / SWING;
    const liftTime = time - s * SWING_TIME;
    const landTime = liftTime + SWING_TIME;
    hipWorldAt(liftTime, leg.hipLocal, _liftPos);
    const liftPose = pathPose(liftTime);
    _liftPos.addScaledVector(liftPose.forward, -REACH);
    _liftPos.y = HOOF_DROP;
    hipWorldAt(landTime, leg.hipLocal, _landPos);
    const landPose = pathPose(landTime);
    _landPos.addScaledVector(landPose.forward, REACH);
    _landPos.y = HOOF_DROP;
    const k = smoother(s);
    target.copy(_liftPos).lerp(_landPos, k);
    target.y += Math.sin(s * Math.PI) * leg.lift;
    return { cycle, swingK: s, planted: false };
  }

  /**
   * 2-bone IK in the anchor's local YZ plane, with a fixed bend sign.
   * Bone meshes extend along local -Y. Positive rotation.x aims -Y toward -Z,
   * so we negate angles that were measured toward +Z.
   */
  function solveLeg(leg, worldFoot) {
    leg.anchor.updateWorldMatrix(true, false);
    _localTarget.copy(worldFoot);
    leg.anchor.worldToLocal(_localTarget);
    // _localTarget is relative to the hip anchor. +Y up, +Z forward, +X outward-ish.
    let z = _localTarget.z;
    let y = _localTarget.y;
    const x = _localTarget.x;
    const L1 = leg.l1;
    const L2 = leg.l2;
    let dist = Math.hypot(z, y);
    const maxD = L1 + L2 - 1e-3;
    const minD = Math.abs(L1 - L2) + 1e-3;
    if (dist < 1e-4) dist = 1e-4;
    const clamped = clamp(dist, minD, maxD);
    const scale = clamped / dist;
    z *= scale;
    y *= scale;
    dist = clamped;

    const cosHip = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const angleA = Math.acos(cosHip);
    const dirZ = z / dist;
    const dirY = y / dist;
    // Perp in YZ that points +Z when the target is straight down.
    const perpZ = -dirY;
    const perpY = dirZ;
    const along = Math.cos(angleA) * L1;
    const height = Math.sin(angleA) * L1;
    const kz = along * dirZ + leg.bend * height * perpZ;
    const ky = along * dirY + leg.bend * height * perpY;
    const upperFromDown = Math.atan2(kz, -ky);
    const fz = z - kz;
    const fy = y - ky;
    const lowerFromDown = Math.atan2(fz, -fy);

    // See header comment: negate so +angle (toward +Z) becomes the correct rotation.x.
    leg.upper.rotation.x = -upperFromDown;
    leg.lower.rotation.x = -(lowerFromDown - upperFromDown);
    // Mild abduction so a lateral target error doesn't leave the foot floating inward.
    const lateral = Math.atan2(x, Math.max(0.2, Math.hypot(y, z))) * 0.85;
    leg.upper.rotation.z = lateral;

    const swingTilt = 0; // filled by caller via hoof
    leg.hoofPivot.rotation.x = -(leg.upper.rotation.x + leg.lower.rotation.x);
    leg.hoofPivot.userData.swingTiltBase = leg.hoofPivot.rotation.x;
    return { swingReady: true };
  }

  // ---------------------------------------------------------------------------
  // World
  // ---------------------------------------------------------------------------

  function makeDustTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grd.addColorStop(0, "rgba(220,200,160,0.7)");
    grd.addColorStop(1, "rgba(220,200,160,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeSky() {
    const geo = new THREE.SphereGeometry(280, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x6aa0cf) },
        horizonColor: { value: new THREE.Color(0xf3d2a4) },
        groundColor: { value: new THREE.Color(0xe4c48a) },
        sunDir: { value: new THREE.Vector3(0.55, 0.42, 0.28).normalize() },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 groundColor;
        uniform vec3 sunDir;
        float hash(vec2 p){
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float n2(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        float fbm(vec2 p){
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) {
            v += a * n2(p);
            p = p * 2.03 + vec2(1.7, 9.2);
            a *= 0.5;
          }
          return v;
        }
        void main() {
          vec3 n = normalize(vPos);
          float h = n.y;
          vec3 zenith = topColor;
          vec3 col = mix(horizonColor, zenith, smoothstep(0.0, 0.62, h));
          col = mix(groundColor, col, smoothstep(-0.18, 0.06, h));
          vec2 cuv = n.xz / max(n.y + 0.35, 0.25);
          float clouds = fbm(cuv * 1.6 + vec2(2.0, 4.0));
          float mask = smoothstep(0.52, 0.78, clouds);
          mask *= smoothstep(0.02, 0.28, h);
          col = mix(col, vec3(0.98, 0.94, 0.86), mask * 0.72);
          float sun = pow(max(dot(n, sunDir), 0.0), 140.0);
          float glow = pow(max(dot(n, sunDir), 0.0), 6.0);
          col += vec3(1.0, 0.95, 0.82) * sun;
          col += vec3(1.0, 0.72, 0.40) * glow * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    mat.fog = false;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  function makeAcacia(rng, scale) {
    const g = new THREE.Group();
    const bark = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.07, 0.28, 0.28 + rng() * 0.06),
      roughness: 0.95,
    });
    const leafA = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.22, 0.42, 0.22 + rng() * 0.05),
      roughness: 0.9,
    });
    const leafB = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.18, 0.38, 0.28 + rng() * 0.05),
      roughness: 0.88,
    });
    const trunkH = 2.4 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.22 * scale, trunkH, 7), bark);
    trunk.position.y = trunkH * 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);

    const branches = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < branches; i++) {
      const ang = (i / branches) * TAU + rng();
      const len = (1.1 + rng() * 0.6) * scale;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * scale, 0.07 * scale, len, 5), bark);
      branch.position.y = trunkH * (0.72 + rng() * 0.1);
      branch.position.x = Math.cos(ang) * 0.05;
      branch.position.z = Math.sin(ang) * 0.05;
      branch.rotation.z = Math.cos(ang) * 0.9;
      branch.rotation.x = Math.sin(ang) * 0.9;
      branch.castShadow = true;
      g.add(branch);
    }

    const clumps = 14 + Math.floor(rng() * 6);
    for (let i = 0; i < clumps; i++) {
      const mat = i % 3 === 0 ? leafB : leafA;
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
      const rad = (0.7 + rng() * 1.15) * scale;
      const flat = 0.18 + rng() * 0.14;
      canopy.scale.set(rad * (0.85 + rng() * 0.4), rad * flat, rad * (0.75 + rng() * 0.45));
      const ang = rng() * TAU;
      const dist = Math.pow(rng(), 0.7) * 2.3 * scale;
      const droop = dist * 0.18;
      canopy.position.set(
        Math.cos(ang) * dist,
        trunkH + 0.55 * scale - droop + rng() * 0.25 * scale,
        Math.sin(ang) * dist
      );
      canopy.rotation.y = rng() * TAU;
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      g.add(canopy);
    }
    return g;
  }

  function makeBush(rng) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.20, 0.40, 0.24 + rng() * 0.06),
      roughness: 0.92,
    });
    const n = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.35 + rng() * 0.25, 8, 6), mat);
      s.scale.y = 0.55;
      s.position.set((rng() - 0.5) * 0.4, 0.25, (rng() - 0.5) * 0.4);
      s.castShadow = true;
      g.add(s);
    }
    return g;
  }

  // ---------------------------------------------------------------------------
  // Scene bootstrap
  // ---------------------------------------------------------------------------

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xefd3a6, 0.011);
  scene.add(makeSky());

  const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 400);
  const lookAt = new THREE.Vector3();
  const camDesired = new THREE.Vector3();
  const lookDesired = new THREE.Vector3();

  const hemi = new THREE.HemisphereLight(0xc5ddf5, 0xc6a56a, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d2, 3.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0xc9d7ee, 0.55);
  scene.add(fill);
  const bounce = new THREE.DirectionalLight(0xf0c48a, 0.28);
  scene.add(bounce);

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0xd7bf8c,
    roughness: 0.98,
    metalness: 0.0,
  });
  groundMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vGroundWorld;\n")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vGroundWorld;
         float gHash(vec2 p){
           return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
         }
         float gNoise(vec2 p){
           vec2 i = floor(p), f = fract(p);
           f = f * f * (3.0 - 2.0 * f);
           float a = gHash(i);
           float b = gHash(i + vec2(1.0, 0.0));
           float c = gHash(i + vec2(0.0, 1.0));
           float d = gHash(i + vec2(1.0, 1.0));
           return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
         }
         float gFbm(vec2 p){
           float v = 0.0, a = 0.5;
           for (int i = 0; i < 5; i++) {
             v += a * gNoise(p);
             p = p * 2.02 + vec2(3.1, 1.7);
             a *= 0.5;
           }
           return v;
         }
         vec3 groundTint(vec2 xz){
           float big = gFbm(xz * 0.035);
           float mid = gFbm(xz * 0.11 + 4.0);
           float fine = gFbm(xz * 0.45);
           vec3 sand = vec3(0.78, 0.66, 0.40);
           vec3 straw = vec3(0.62, 0.52, 0.28);
           vec3 soil = vec3(0.45, 0.36, 0.20);
           vec3 olive = vec3(0.48, 0.46, 0.24);
           vec3 col = mix(soil, sand, smoothstep(0.35, 0.72, big));
           col = mix(col, straw, smoothstep(0.45, 0.8, mid) * 0.55);
           col = mix(col, olive, smoothstep(0.62, 0.9, gFbm(xz * 0.02 + 9.0)) * 0.35);
           col *= 0.92 + 0.16 * fine;
           return col;
         }
        `
      )
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\n diffuseColor.rgb *= groundTint(vGroundWorld.xz);\n"
      );
  };
  const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 80), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Dry-grass clumps: several wide blades sharing one geometry.
  const grassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide });
  const clumpPositions = [];
  const clumpIndices = [];
  function pushBlade(ox, oz, leanX, leanZ, height, width) {
    const base = clumpPositions.length / 3;
    clumpPositions.push(
      ox - width, 0, oz,
      ox + width, 0, oz + width * 0.3,
      ox + leanX * 0.45, height * 0.55, oz + leanZ * 0.45,
      ox + leanX, height, oz + leanZ
    );
    clumpIndices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    pushBlade(Math.cos(a) * 0.09, Math.sin(a) * 0.09, Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.42 + (i % 3) * 0.16, 0.045);
  }
  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute("position", new THREE.Float32BufferAttribute(clumpPositions, 3));
  bladeGeo.setIndex(clumpIndices);
  bladeGeo.computeVertexNormals();
  const grassCount = 640;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
  grass.castShadow = false;
  grass.receiveShadow = true;
  grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(grassCount * 3), 3);
  const dummy = new THREE.Object3D();
  const rng = mulberry32(7);
  const grassColor = new THREE.Color();
  for (let i = 0; i < grassCount; i++) {
    const ang = rng() * TAU;
    // Prefer the ground the giraffe actually walks, without planting tufts on the hoof line.
    const rad = rng() < 0.55
      ? PATH_R + (rng() - 0.5) * 14
      : 2.5 + Math.pow(rng(), 0.55) * 50;
    const onPath = Math.abs(rad - PATH_R) < 0.85;
    const r = onPath ? rad + (rng() > 0.5 ? 1.35 : -1.35) : rad;
    dummy.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r);
    dummy.rotation.set((rng() - 0.5) * 0.25, rng() * TAU, (rng() - 0.5) * 0.25);
    const s = 0.35 + rng() * 0.85;
    dummy.scale.set(s * (0.6 + rng() * 0.6), s * (0.45 + rng() * 0.9), s * (0.6 + rng() * 0.6));
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    const hue = lerp(0.12, 0.22, rng());
    const light = lerp(0.28, 0.48, rng());
    grassColor.setHSL(hue, 0.38, light);
    grass.setColorAt(i, grassColor);
  }
  scene.add(grass);

  // Trees and bushes
  const treeRng = mulberry32(21);
  // Hero acacia inside the circuit.
  const hero = makeAcacia(treeRng, 1.35);
  hero.position.set(-1.5, 0, 1.2);
  scene.add(hero);
  const treeSpots = [
    [28, 6], [34, -12], [-26, 18], [-32, -8], [18, 30], [-14, -30],
    [40, 16], [-40, 22], [8, -38], [-22, 36], [48, -6], [-8, 46],
    [22, -22], [-36, -24],
  ];
  for (const [x, z] of treeSpots) {
    const t = makeAcacia(treeRng, 0.85 + treeRng() * 0.7);
    t.position.set(x, 0, z);
    t.rotation.y = treeRng() * TAU;
    scene.add(t);
  }
  for (let i = 0; i < 16; i++) {
    const bush = makeBush(treeRng);
    const ang = treeRng() * TAU;
    const rad = 8 + treeRng() * 30;
    bush.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    if (Math.abs(rad - PATH_R) < 2) bush.position.multiplyScalar(1.25);
    bush.scale.setScalar(0.8 + treeRng() * 1.1);
    scene.add(bush);
  }

  // Distant hills
  const hillMat = new THREE.MeshStandardMaterial({ color: 0xcbb892, roughness: 1 });
  const hillMat2 = new THREE.MeshStandardMaterial({ color: 0xb7c3b0, roughness: 1 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8072, roughness: 0.95 });
  for (let i = 0; i < 18; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + treeRng() * 0.45, 0), rockMat);
    const ang = treeRng() * TAU;
    const rad = 6 + treeRng() * 36;
    rock.position.set(Math.cos(ang) * rad, 0.05, Math.sin(ang) * rad);
    if (Math.abs(rad - PATH_R) < 1.4) continue;
    rock.scale.set(1.4, 0.55 + treeRng() * 0.3, 1.1);
    rock.rotation.y = treeRng() * TAU;
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }
  [[-70, -40, 28, 8], [80, 20, 36, 10], [-20, 90, 40, 9], [30, -100, 46, 12], [-110, 30, 34, 8]].forEach((h, i) => {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(h[2], 18, 12), i % 2 ? hillMat2 : hillMat);
    hill.scale.y = h[3] / h[2];
    hill.position.set(h[0], -h[2] * 0.15, h[1]);
    scene.add(hill);
  });

  // Dust pool
  const dustTex = makeDustTexture();
  const dustMat = new THREE.MeshBasicMaterial({
    map: dustTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.0,
  });
  const dustPool = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.45), dustMat.clone());
    m.visible = false;
    m.userData.life = 0;
    scene.add(m);
    dustPool.push(m);
  }
  let dustCursor = 0;
  const prevPlanted = {};

  function spawnDust(pos) {
    for (let k = 0; k < 3; k++) {
      const m = dustPool[dustCursor];
      dustCursor = (dustCursor + 1) % dustPool.length;
      m.visible = true;
      m.userData.life = 1;
      m.userData.vx = (Math.random() - 0.5) * 0.35;
      m.userData.vz = (Math.random() - 0.5) * 0.35;
      m.position.set(pos.x + (Math.random() - 0.5) * 0.12, 0.12, pos.z + (Math.random() - 0.5) * 0.12);
      m.scale.setScalar(0.6 + Math.random() * 0.5);
    }
  }

  // Build the animal at the origin, pose it, then bake spots in that pose
  // so the pattern is glued to the hide rather than sliding through world space.
  const animal = createGiraffe();
  scene.add(animal.root);

  const params = new URLSearchParams(location.search);
  let userYaw = params.has("yaw") ? parseFloat(params.get("yaw")) : 0.95;
  let userPitch = params.has("pitch") ? parseFloat(params.get("pitch")) : 0.06;
  let camDist = params.has("dist") ? parseFloat(params.get("dist")) : 8.6;
  const freezeTime = params.has("freeze") ? parseFloat(params.get("freeze")) : null;
  const timeOffset = params.has("t") ? parseFloat(params.get("t")) : 0;
  if (params.has("fov")) {
    camera.fov = parseFloat(params.get("fov"));
    camera.updateProjectionMatrix();
  }
  let dragging = false;
  let lastX = 0, lastY = 0;

  function updateGiraffe(time) {
    const pose = pathPose(time);
    animal.root.position.set(pose.x, 0, pose.z);
    animal.root.rotation.y = pose.yaw;
    const motion = torsoMotion(time);
    animal.torso.position.y = motion.y;
    animal.torso.rotation.x = motion.pitch;
    animal.torso.rotation.z = motion.roll;
    // Breathing lives on the body mesh only, so it doesn't pump the skeleton.
    const breath = 1 + Math.sin(time * 1.45) * 0.012;
    animal.body.scale.set(1, breath, 1);

    const w = (time / CYCLE) * TAU;
    // Neck counter-sway. Bones store a rest rotation.x; add a delta on top.
    animal.neckBones.forEach((bone, i) => {
      if (bone.userData.restX == null) bone.userData.restX = bone.rotation.x;
      const follow = Math.sin(w - i * 0.35) * (0.025 - i * 0.003);
      const nod = Math.sin(w * 2 - i * 0.25) * 0.018;
      bone.rotation.x = bone.userData.restX + (i === 0 ? nod : nod * 0.6);
      bone.rotation.z = follow;
    });
    if (animal.head.userData.restX == null) animal.head.userData.restX = animal.head.rotation.x;
    animal.head.rotation.x = animal.head.userData.restX - Math.sin(w * 2) * 0.03;
    animal.head.rotation.y = Math.sin(w) * 0.045;
    animal.head.rotation.z = -Math.sin(w) * 0.02;

    // Ears: rare flicks.
    flickEar(animal.earL, time, 0.0);
    flickEar(animal.earR, time, 1.7);

    // Blink
    const blinkPhase = (time % 4.2);
    const blinking = blinkPhase < 0.14;
    const blinkT = blinking ? Math.sin((blinkPhase / 0.14) * Math.PI) : 0;
    animal.lids.forEach((lid) => {
      lid.rotation.x = lid.userData.baseX + blinkT * 0.85;
    });

    // Tail
    animal.tailSegs.forEach((seg, i) => {
      if (seg.userData.restX == null) {
        seg.userData.restX = seg.rotation.x;
        seg.userData.restY = seg.rotation.y;
      }
      const swish = Math.sin(time * 2.1 - i * 0.6) * (0.18 + i * 0.05);
      const swish2 = Math.sin(time * 3.3 - i) * 0.06;
      seg.rotation.y = seg.userData.restY + swish;
      seg.rotation.x = seg.userData.restX + (i === 0 ? Math.sin(time * 1.3) * 0.08 : swish2);
    });

    animal.root.updateMatrixWorld(true);
    for (const leg of animal.legs) {
      const info = computeFoot(time, leg, _foot);
      solveLeg(leg, _foot);
      // During swing, tip the hoof forward a little (fetlock flex).
      if (!info.planted) {
        leg.hoofPivot.rotation.x += Math.sin(info.swingK * Math.PI) * 0.55;
      }
      const was = prevPlanted[leg.name];
      if (info.planted && was === false) spawnDust(_foot);
      prevPlanted[leg.name] = info.planted;
    }
  }

  function flickEar(ear, time, offset) {
    const flap = ear.userData.flap;
    if (!flap) return;
    if (flap.userData.base == null) flap.userData.base = flap.rotation.z;
    const period = 3.6;
    const u = ((time + offset) % period);
    let flick = 0;
    if (u < 0.18) flick = Math.sin((u / 0.18) * Math.PI) * 0.45;
    flap.rotation.z = flap.userData.base + flick * (ear.position.x >= 0 ? 1 : -1);
  }

  // Pose once at a mid-stride moment so baked spots sit on a natural stance,
  // then bake. Animation continues from real time afterwards.
  updateGiraffe(0.4);
  animal.root.updateWorldMatrix(true, true);
  animal.root.traverse((obj) => {
    if (obj.isMesh && obj.userData.coat) bakeCoat(obj);
  });

  function updateDust(dt, cam) {
    for (const m of dustPool) {
      if (!m.visible) continue;
      m.userData.life -= dt * 0.85;
      if (m.userData.life <= 0) {
        m.visible = false;
        continue;
      }
      m.position.x += m.userData.vx * dt;
      m.position.z += m.userData.vz * dt;
      m.position.y += dt * 0.25;
      m.material.opacity = Math.max(0, m.userData.life) * 0.45;
      m.lookAt(cam.position);
    }
  }

  let cameraReady = false;
  function updateCamera(dt) {
    const gp = animal.root.position;
    lookDesired.set(gp.x, 2.85, gp.z);
    const yaw = animal.root.rotation.y + userYaw;
    const cp = userPitch;
    const horiz = Math.cos(cp) * camDist;
    camDesired.set(
      lookDesired.x + Math.sin(yaw) * horiz,
      lookDesired.y + Math.sin(cp) * camDist + 0.15,
      lookDesired.z + Math.cos(yaw) * horiz
    );
    if (!cameraReady) {
      camera.position.copy(camDesired);
      lookAt.copy(lookDesired);
      cameraReady = true;
    } else {
      const k = 1 - Math.pow(0.0015, Math.max(dt, 1e-4));
      camera.position.lerp(camDesired, k);
      lookAt.lerp(lookDesired, k);
    }
    camera.lookAt(lookAt);
  }

  function updateSun() {
    const gp = animal.root.position;
    sun.position.set(gp.x + 18, gp.y + 26, gp.z + 10);
    sun.target.position.set(gp.x, 2.2, gp.z);
    fill.position.set(gp.x - 12, gp.y + 8, gp.z - 6);
    bounce.position.set(gp.x - 4, gp.y + 1, gp.z + 8);
  }

  renderer.domElement.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener("pointerup", () => { dragging = false; });
  renderer.domElement.addEventListener("pointercancel", () => { dragging = false; });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    userYaw -= dx * 0.005;
    userPitch = clamp(userPitch + dy * 0.0035, -0.15, 1.05);
  });
  renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    camDist = clamp(camDist * Math.exp(e.deltaY * 0.001), 5.5, 32);
  }, { passive: false });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Clock();
  // Skip the big dt from texture generation.
  clock.getDelta();

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = freezeTime != null ? freezeTime : clock.elapsedTime + timeOffset;
    updateGiraffe(time);
    updateCamera(dt);
    updateSun();
    updateDust(dt, camera);
    renderer.render(scene, camera);
  }
  frame();
})();
