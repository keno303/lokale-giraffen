/* Procedural giraffe anatomy and a ground-contact, four-beat walking rig.
   No models, textures, network requests, or module loading are required. */
(function () {
  'use strict';
  const T = THREE;
  const TAU = Math.PI * 2;
  const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
  const clamp = T.MathUtils.clamp;
  const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  function random(seed) {
    return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // Clipped, jittered Voronoi cells form the reticulated coat. A periodically
  // repeated seed field makes this hand-generated canvas texture seamless.
  function coatTexture() {
    const size = 1024, cells = 8, step = size / cells, rng = random(38107);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d7be8f'; ctx.fillRect(0, 0, size, size);
    const seeds = [];
    for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
      seeds.push({ x: (x + .18 + rng() * .64) * step, y: (y + .18 + rng() * .64) * step, shade: rng(), inset: .075 + rng() * .07 });
    }
    const points = [];
    for (let iy = -1; iy <= 1; iy++) for (let ix = -1; ix <= 1; ix++) for (const p of seeds) points.push({ ...p, x: p.x + ix * size, y: p.y + iy * size });
    const clip = (poly, nx, ny, limit) => {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = a[0] * nx + a[1] * ny - limit, db = b[0] * nx + b[1] * ny - limit;
        if (da <= 0) out.push(a);
        if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      return out;
    };
    for (const p of points) {
      if (p.x < -step || p.x > size + step || p.y < -step || p.y > size + step) continue;
      let poly = [[p.x - step * 2, p.y - step * 2], [p.x + step * 2, p.y - step * 2], [p.x + step * 2, p.y + step * 2], [p.x - step * 2, p.y + step * 2]];
      for (const q of points) {
        const dx = q.x - p.x, dy = q.y - p.y;
        if (p === q || dx * dx + dy * dy > step * step * 10) continue;
        poly = clip(poly, dx, dy, (q.x * q.x + q.y * q.y - p.x * p.x - p.y * p.y) / 2);
        if (!poly.length) break;
      }
      if (poly.length < 3) continue;
      poly = poly.map(a => [a[0] + (p.x - a[0]) * p.inset, a[1] + (p.y - a[1]) * p.inset]);
      const r = Math.floor(102 + p.shade * 32), g = Math.floor(69 + p.shade * 22), b = Math.floor(42 + p.shade * 16);
      const grad = ctx.createRadialGradient(p.x - 14, p.y - 19, 3, p.x, p.y, step * .76);
      grad.addColorStop(0, `rgb(${r + 15},${g + 9},${b + 3})`); grad.addColorStop(1, `rgb(${r - 8},${g - 7},${b - 3})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      // A very slightly rounded perimeter avoids the sterile look of a diagram.
      for (let i = 0; i < poly.length; i++) {
        const prev = poly[(i + poly.length - 1) % poly.length], cur = poly[i], next = poly[(i + 1) % poly.length];
        const a = [cur[0] * .89 + prev[0] * .11, cur[1] * .89 + prev[1] * .11];
        const c = [cur[0] * .89 + next[0] * .11, cur[1] * .89 + next[1] * .11];
        if (!i) ctx.moveTo(...a); else ctx.lineTo(...a);
        ctx.quadraticCurveTo(...cur, ...c);
      }
      ctx.closePath(); ctx.fill();
    }
    const image = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const noise = (rng() - .5) * 16;
      image.data[i] += noise; image.data[i + 1] += noise; image.data[i + 2] += noise * .75;
    }
    ctx.putImageData(image, 0, 0);
    const texture = new T.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
    return texture;
  }

  function coatMaterial(texture, frequency = .55) {
    const material = new T.MeshStandardMaterial({ color: 0xffffff, roughness: .91 });
    material.onBeforeCompile = shader => {
      shader.uniforms.coatMap = { value: texture };
      shader.uniforms.coatFrequency = { value: frequency };
      shader.vertexShader = 'attribute vec3 coatPosition; attribute vec3 coatNormal; attribute float coatWeight; varying vec3 vCoat; varying vec3 vCoatNormal; varying float vCoatWeight;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoat = coatPosition; vCoatNormal = coatNormal; vCoatWeight = coatWeight;');
      shader.fragmentShader = 'uniform sampler2D coatMap; uniform float coatFrequency; varying vec3 vCoat; varying vec3 vCoatNormal; varying float vCoatWeight;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        vec3 weights = pow(abs(normalize(vCoatNormal)), vec3(7.0));
        weights /= max(weights.x + weights.y + weights.z, 0.0001);
        vec3 p = vCoat * coatFrequency;
        p += sin(p.yzx * 25.0 + cos(p.zxy * 19.0)) * .0045;
        p += sin(p.yzx * 71.0) * .0012;
        vec3 coat = texture2D(coatMap, p.yz + vec2(0.32, 0.13)).rgb * weights.x
                  + texture2D(coatMap, p.xz + vec2(0.73, 0.35)).rgb * weights.y
                  + texture2D(coatMap, p.xy).rgb * weights.z;
        diffuseColor.rgb *= mix(vec3(0.65, 0.505, 0.30), coat, vCoatWeight);
      `);
    };
    material.customProgramCacheKey = () => 'giraffe-coat-' + frequency;
    return material;
  }

  function furTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d'), rng = random(812);
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 44000; i++) {
      const shade = Math.floor(65 + rng() * 115);
      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`; ctx.lineWidth = .6;
      const x = rng() * 512, y = rng() * 512;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - .5) * 1.5, y + 1.5 + rng() * 4); ctx.stroke();
    }
    const map = new T.CanvasTexture(canvas); map.wrapS = map.wrapT = T.RepeatWrapping; map.repeat.set(10, 10); map.anisotropy = 8; return map;
  }

  function addCoat(geometry, offset = v(), weightFn) {
    const pos = geometry.attributes.position, coords = new Float32Array(pos.count * 3), weights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + offset.x, y = pos.getY(i) + offset.y, z = pos.getZ(i) + offset.z;
      coords[i * 3] = x; coords[i * 3 + 1] = y; coords[i * 3 + 2] = z;
      weights[i] = weightFn ? weightFn(x, y, z) : 1;
    }
    geometry.setAttribute('coatPosition', new T.BufferAttribute(coords, 3));
    geometry.setAttribute('coatNormal', geometry.attributes.normal.clone());
    geometry.setAttribute('coatWeight', new T.BufferAttribute(weights, 1));
    return geometry;
  }

  // Elliptical cross sections smoothly follow a Catmull–Rom centerline.
  // A section is [x, y, z, radius in the XY plane, radius across the animal].
  function loft(sections, rings = 48, sides = 32) {
    const curve = new T.CatmullRomCurve3(sections.map(s => v(s[0], s[1], s[2])), false, 'catmullrom', .4);
    const shape = new T.CatmullRomCurve3(sections.map((s, i) => v(i / (sections.length - 1), s[3], s[4])), false, 'catmullrom', .35);
    const positions = [], uv = [], indices = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, p = curve.getPoint(t), tangent = curve.getTangent(t).normalize(), r = shape.getPoint(t);
      const side = v(-tangent.y, tangent.x, 0).normalize();
      for (let j = 0; j <= sides; j++) {
        const angle = j / sides * TAU, c = Math.cos(angle), s = Math.sin(angle);
        positions.push(p.x + side.x * c * Math.max(.001, r.y), p.y + side.y * c * Math.max(.001, r.y), p.z + s * Math.max(.001, r.z));
        uv.push(j / sides, t);
        if (i < rings && j < sides) {
          const a = i * (sides + 1) + j, b = a + sides + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    const capStart = positions.length / 3, first = curve.getPoint(0), last = curve.getPoint(1);
    positions.push(first.x, first.y, first.z, last.x, last.y, last.z); uv.push(.5, 0, .5, 1);
    for (let j = 0; j < sides; j++) {
      indices.push(capStart, j + 1, j);
      const end = rings * (sides + 1) + j; indices.push(capStart + 1, end, end + 1);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }

  function mesh(geometry, material, parent) {
    const object = new T.Mesh(geometry, material); object.castShadow = true; object.receiveShadow = true;
    if (parent) parent.add(object); return object;
  }
  function ellipsoid(parent, material, position, scale, coatOffset, weightFn, detail = 32) {
    const geo = new T.SphereGeometry(1, detail, Math.floor(detail * .7));
    geo.scale(scale.x, scale.y, scale.z);
    if (coatOffset) addCoat(geo, coatOffset.clone().add(position), weightFn);
    const object = mesh(geo, material, parent); object.position.copy(position); return object;
  }
  function tube(parent, points, radius, material, segments = 30, radial = 7) {
    const curve = new T.CatmullRomCurve3(points);
    return mesh(new T.TubeGeometry(curve, segments, radius, radial, false), material, parent);
  }

  // A smoothly blended implicit surface joins the barrel, scapulae, rump, and
  // neck into continuous skin. Marching tetrahedra needs no lookup-table asset.
  function organicTrunk() {
    const softMin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
    function ellipse(x, y, z, cx, cy, rx, ry, rz, cz = 0) {
      x -= cx; y -= cy; z -= cz;
      const k0 = Math.sqrt(x * x / (rx * rx) + y * y / (ry * ry) + z * z / (rz * rz));
      const k1 = Math.sqrt(x * x / (rx ** 4) + y * y / (ry ** 4) + z * z / (rz ** 4));
      return k0 * (k0 - 1) / Math.max(k1, .00001);
    }
    function taper(x, y, z, ax, ay, bx, by, ra, rb) {
      const dx = bx - ax, dy = by - ay;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      return Math.hypot(x - ax - dx * t, y - ay - dy * t, z * 1.17) - (ra + (rb - ra) * t);
    }
    function field(x, y, z) {
      let d = ellipse(x, y, z, -.31, 2.76, 1.13, .525, .425);
      d = softMin(d, ellipse(x, y, z, -1.03, 2.71, .46, .43, .337), .17);
      d = softMin(d, ellipse(x, y, z, .40, 2.84, .49, .56, .338), .22);
      d = softMin(d, ellipse(x, y, z, .57, 2.59, .235, .40, .29), .19);
      d = softMin(d, taper(x, y, z, .59, 3.1, .97, 3.97, .35, .255), .24);
      d = softMin(d, taper(x, y, z, .97, 3.97, 1.38, 4.99, .255, .182), .11);
      d = softMin(d, taper(x, y, z, 1.38, 4.99, 1.57, 5.26, .182, .17), .10);
      return d;
    }
    const step = .042, min = [-1.66, 2.02, -.60], nx = 85, ny = 84, nz = 29;
    const plane = nx * ny, values = new Float32Array(nx * ny * nz);
    const point = id => { const iz = Math.floor(id / plane), iy = Math.floor((id - iz * plane) / nx), ix = id % nx; return [min[0] + ix * step, min[1] + iy * step, min[2] + iz * step]; };
    for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) values[ix + iy * nx + iz * plane] = field(min[0] + ix * step, min[1] + iy * step, min[2] + iz * step);
    const positions = [], normals = [], indices = [], cache = new Map();
    function crossing(a, b) {
      if (a > b) [a, b] = [b, a];
      const key = a * values.length + b;
      if (cache.has(key)) return cache.get(key);
      const pa = point(a), pb = point(b), t = values[a] / (values[a] - values[b]);
      const x = pa[0] + (pb[0] - pa[0]) * t, y = pa[1] + (pb[1] - pa[1]) * t, z = pa[2] + (pb[2] - pa[2]) * t;
      const eps = .0015, dx = field(x + eps, y, z) - field(x - eps, y, z), dy = field(x, y + eps, z) - field(x, y - eps, z), dz = field(x, y, z + eps) - field(x, y, z - eps), length = Math.hypot(dx, dy, dz);
      const id = positions.length / 3; positions.push(x, y, z); normals.push(dx / length, dy / length, dz / length); cache.set(key, id); return id;
    }
    function triangle(a, b, c) {
      const ax = positions[b * 3] - positions[a * 3], ay = positions[b * 3 + 1] - positions[a * 3 + 1], az = positions[b * 3 + 2] - positions[a * 3 + 2];
      const bx = positions[c * 3] - positions[a * 3], by = positions[c * 3 + 1] - positions[a * 3 + 1], bz = positions[c * 3 + 2] - positions[a * 3 + 2];
      const dot = (ay * bz - az * by) * normals[a * 3] + (az * bx - ax * bz) * normals[a * 3 + 1] + (ax * by - ay * bx) * normals[a * 3 + 2];
      if (dot > 0) indices.push(a, b, c); else indices.push(a, c, b);
    }
    const tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
    for (let z = 0; z < nz - 1; z++) for (let y = 0; y < ny - 1; y++) for (let x = 0; x < nx - 1; x++) {
      const n = x + y * nx + z * plane;
      const ids = [n, n + 1, n + nx + 1, n + nx, n + plane, n + plane + 1, n + plane + nx + 1, n + plane + nx];
      let mask = 0; for (let i = 0; i < 8; i++) if (values[ids[i]] < 0) mask |= 1 << i;
      if (mask === 0 || mask === 255) continue;
      for (const tet of tetrahedra) {
        const inside = [], outside = [];
        for (const i of tet) (values[ids[i]] < 0 ? inside : outside).push(ids[i]);
        if (!inside.length || !outside.length) continue;
        if (inside.length === 1 || outside.length === 1) {
          const single = inside.length === 1 ? inside[0] : outside[0], rest = inside.length === 1 ? outside : inside;
          triangle(crossing(single, rest[0]), crossing(single, rest[1]), crossing(single, rest[2]));
        } else {
          const a = crossing(inside[0], outside[0]), b = crossing(inside[0], outside[1]), c = crossing(inside[1], outside[0]), d = crossing(inside[1], outside[1]);
          triangle(a, b, c); triangle(b, d, c);
        }
      }
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(normals, 3)); geo.setIndex(indices);
    // Bump-map UVs have no visible seams: their only role is microscopic fur.
    const uvs = []; for (let i = 0; i < positions.length; i += 3) uvs.push(positions[i] * .5, positions[i + 1] * .5); geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    return geo;
  }

  function createGiraffe() {
    const root = new T.Group(); root.name = 'Giraffe';
    const body = new T.Group(); root.add(body);
    const texture = coatTexture(), coat = coatMaterial(texture), fineCoat = coatMaterial(texture, .96);
    const fur = furTexture();
    for (const material of [coat, fineCoat]) { material.bumpMap = fur; material.bumpScale = .0025; }
    const tan = new T.MeshStandardMaterial({ color: 0xbba078, roughness: .94 });
    const muzzleMat = new T.MeshStandardMaterial({ color: 0xbca17a, roughness: .87 });
    const darkSkin = new T.MeshStandardMaterial({ color: 0x493725, roughness: .86 });
    const hornMat = new T.MeshStandardMaterial({ color: 0x685135, roughness: 1 });
    const hairMat = new T.MeshStandardMaterial({ color: 0x352619, roughness: 1, side: T.DoubleSide });
    const hoofMat = new T.MeshStandardMaterial({ color: 0x4d4738, roughness: .72 });
    const eyeMat = new T.MeshPhysicalMaterial({ color: 0x130e08, roughness: .12, clearcoat: 1, clearcoatRoughness: .08 });
    const bodyWeight = (x, y, z) => .32 + .68 * smooth(2.18, 2.6, y + Math.abs(z) * .6);
    const torso = organicTrunk();
    mesh(addCoat(torso, v(), bodyWeight), coat, body);
    const restPositions = torso.attributes.position.array.slice(), restNormals = torso.attributes.normal.array.slice();
    const bendingVertices = [];
    for (let i = 0; i < restPositions.length; i += 3) if (restPositions[i + 1] > 3.02) bendingVertices.push([i, smooth(3.02, 3.85, restPositions[i + 1])]);
    torso.attributes.position.setUsage(T.DynamicDrawUsage); torso.attributes.normal.setUsage(T.DynamicDrawUsage);

    const neck = new T.Group(); neck.position.set(.58, 3.09, 0); body.add(neck);
    // A slight throat fold and the short, erect mane follow opposite neck edges.
    const maneCurve = new T.CatmullRomCurve3([v(-.35, .17, 0), v(-.09, .53, 0), v(.15, .99, 0), v(.38, 1.45, 0), v(.63, 1.97, 0), v(.81, 2.24, 0)]);
    const manePositions = [], maneIndices = [], rng = random(1533);
    for (let i = 0; i <= 85; i++) {
      const t = i / 85, p = maneCurve.getPoint(t), h = .035 + Math.sin(t * Math.PI) * .026 + rng() * .012;
      manePositions.push(p.x, p.y, -.024, p.x - h, p.y + .018, 0, p.x, p.y, .024);
      if (i < 85) { const a = i * 3; maneIndices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
    const maneGeo = new T.BufferGeometry(); maneGeo.setAttribute('position', new T.Float32BufferAttribute(manePositions, 3)); maneGeo.setIndex(maneIndices); maneGeo.computeVertexNormals(); mesh(maneGeo, hairMat, neck);
    const maneHair = [];
    for (let i = 0; i < 650; i++) {
      const p = maneCurve.getPoint(rng()); p.z = (rng() - .5) * .055;
      maneHair.push(p.x, p.y, p.z, p.x - .032 - rng() * .035, p.y + .005 + rng() * .023, p.z + (rng() - .5) * .023);
    }
    const hairGeo = new T.BufferGeometry(); hairGeo.setAttribute('position', new T.Float32BufferAttribute(maneHair, 3));
    neck.add(new T.LineSegments(hairGeo, new T.LineBasicMaterial({ color: 0x35271b, transparent: true, opacity: .72 })));

    const head = new T.Group(); head.position.set(.99, 2.12, 0); neck.add(head);
    const headOffset = neck.position.clone().add(head.position);
    const skull = loft([
      [-.22, .07, 0, .015, .025], [-.13, .10, 0, .168, .15], [.025, .11, 0, .213, .187],
      [.20, .053, 0, .176, .165], [.39, -.026, 0, .132, .138], [.57, -.07, 0, .115, .143],
      [.71, -.078, 0, .111, .151], [.79, -.071, 0, .075, .12], [.821, -.065, 0, .008, .015]
    ], 60, 40);
    mesh(addCoat(skull, headOffset, x => 1 - smooth(headOffset.x + .49, headOffset.x + .73, x)), fineCoat, head);
    ellipsoid(head, tan, v(.40, -.148, 0), v(.32, .054, .117));
    ellipsoid(head, muzzleMat, v(.655, -.17, 0), v(.15, .030, .135));
    tube(head, [v(.36, -.173, .119), v(.57, -.176, .140), v(.746, -.15, .10), v(.791, -.143, 0), v(.746, -.15, -.10), v(.57, -.176, -.140), v(.36, -.173, -.119)], .0045, darkSkin, 38);

    const ears = [], eyelids = [];
    for (const side of [-1, 1]) {
      // Nostrils are nested into a raised soft rim, angled along the muzzle.
      const rim = ellipsoid(head, tan, v(.715, -.052, side * .132), v(.057, .025, .016)); rim.rotation.z = -.3;
      const nostril = ellipsoid(head, darkSkin, v(.722, -.048, side * .147), v(.042, .013, .006)); nostril.rotation.z = -.35;
      const whiskers = [];
      for (let i = 0; i < 18; i++) {
        const x = .53 + rng() * .2, y = -.11 - rng() * .025, z = side * (.125 + rng() * .015);
        whiskers.push(x, y, z, x + .007, y - .009 - rng() * .01, z + side * (.015 + rng() * .017));
      }
      const whiskerGeo = new T.BufferGeometry(); whiskerGeo.setAttribute('position', new T.Float32BufferAttribute(whiskers, 3)); head.add(new T.LineSegments(whiskerGeo, new T.LineBasicMaterial({ color: 0x8c7654, transparent: true, opacity: .65 })));
      const eyeStart = head.children.length;
      ellipsoid(head, fineCoat, v(.147, .133, side * .147), v(.123, .107, .071), headOffset);
      ellipsoid(head, darkSkin, v(.178, .145, side * .202), v(.076, .061, .022));
      ellipsoid(head, eyeMat, v(.187, .15, side * .215), v(.055, .045, .026));
      const upperLid = [v(.120, .152, side * .221), v(.147, .190, side * .229), v(.191, .202, side * .226), v(.235, .177, side * .216), v(.249, .155, side * .205)];
      tube(head, upperLid, .010, darkSkin, 20);
      tube(head, [v(.122, .147, side * .217), v(.172, .113, side * .225), v(.212, .12, side * .219), v(.247, .155, side * .205)], .007, tan, 18);
      const lid = ellipsoid(head, tan, v(.18, .15, side * .231), v(.061, .046, .012)); lid.visible = false; eyelids.push(lid);
      for (let i = 0; i < 9; i++) {
        const t = i / 8, x = .133 + t * .106, y = .173 + Math.sin(t * Math.PI) * .025;
        tube(head, [v(x, y, side * .229), v(x - .012, y + .018, side * .25), v(x - .02, y + .025, side * .268)], .0018, hairMat, 4, 3);
      }
      const eyeParts = head.children.slice(eyeStart), eyeGroup = new T.Group(), eyePivot = v(.18, .15, side * .195);
      eyeGroup.position.copy(eyePivot); eyeGroup.position.z = side * .16; eyeGroup.scale.setScalar(.65); head.add(eyeGroup);
      for (const part of eyeParts) { part.position.sub(eyePivot); eyeGroup.add(part); }
      const horn = loft([[-.052, .25, side * .119, .07, .063], [-.077, .36, side * .125, .047, .043], [-.085, .49, side * .133, .039, .037], [-.075, .54, side * .137, .046, .043]], 24, 18);
      mesh(addCoat(horn, headOffset), fineCoat, head);
      ellipsoid(head, hornMat, v(-.075, .54, side * .137), v(.051, .046, .047));
      for (let i = 0; i < 22; i++) {
        const a = rng() * TAU, r = rng() * .04;
        tube(head, [v(-.075 + Math.cos(a) * r, .556, side * .137 + Math.sin(a) * r), v(-.078 + Math.cos(a) * r * 1.2, .575 + rng() * .025, side * .137 + Math.sin(a) * r * 1.2)], .0025, hairMat, 2, 3);
      }
      // Leaf-like pinnae: thick outer silhouette, cupped inner skin, fine hairs.
      const ear = new T.Group(); ear.position.set(-.127, .214, side * .126); ear.scale.setScalar(.9); head.add(ear); ears.push(ear);
      const epos = [], eind = [], ecolor = [];
      const earColor = new T.Color();
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, width = Math.pow(Math.sin(Math.PI * t), .85) * .107;
        for (let j = 0; j <= 12; j++) {
          const s = j / 6 - 1;
          epos.push(-.14 * t + width * s, .20 * t - .043 * (1 - s * s) * Math.sin(Math.PI * t), side * (.37 * t + .018 * Math.sin(Math.PI * t)));
          earColor.set(Math.abs(s) > .80 ? 0xd6bc87 : 0xb39a76); ecolor.push(earColor.r, earColor.g, earColor.b);
          if (i < 20 && j < 12) { const a = i * 13 + j; eind.push(a, a + 13, a + 1, a + 1, a + 13, a + 14); }
        }
      }
      const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.Float32BufferAttribute(epos, 3)); eg.setAttribute('color', new T.Float32BufferAttribute(ecolor, 3)); eg.setIndex(eind); eg.computeVertexNormals();
      mesh(eg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: T.DoubleSide }), ear);
      const outline = [];
      for (let i = 0; i <= 30; i++) { const t = i / 30; outline.push(v(-.14 * t - Math.pow(Math.sin(Math.PI * t), .85) * .107, .20 * t, side * (.37 * t + .018 * Math.sin(Math.PI * t)))); }
      for (let i = 30; i >= 0; i--) { const t = i / 30; outline.push(v(-.14 * t + Math.pow(Math.sin(Math.PI * t), .85) * .107, .20 * t, side * (.37 * t + .018 * Math.sin(Math.PI * t)))); }
      tube(ear, outline, .008, tan, 60, 5);
    }

    const legs = [];
    function bone(length, sections, bind, material = coat) {
      const group = new T.Group(); root.add(group);
      const geo = loft(sections.map(s => [s[0], -s[1] * length, 0, s[2], s[3]]), 35, 24);
      mesh(addCoat(geo, bind, (x, y) => .28 + .72 * smooth(.24, 1.08, y)), material, group);
      return group;
    }
    for (const front of [true, false]) for (const side of [-1, 1]) {
      const x = front ? .55 : -1.08, y = front ? 2.77 : 2.66, z = side * (front ? .285 : .30);
      const upperLength = front ? 1.39 : .65, lowerLength = front ? 1.31 : .98;
      const hip = v(x, y, z);
      const upper = bone(upperLength, front ? [[0, 0, .16, .15], [-.015, .18, .145, .125], [-.02, .40, .103, .085], [0, .7, .068, .059], [0, .95, .091, .074], [0, 1, .084, .07]] : [[0, 0, .21, .18], [.02, .2, .215, .165], [.025, .58, .145, .115], [0, 1, .102, .08]], hip);
      const lower = bone(lowerLength, [[0, 0, .081, .072], [0, .10, .085, .073], [-.012, .32, .055, .045], [-.016, .76, .046, .041], [0, .94, .061, .057], [0, 1, .069, .06]], v(x, y - upperLength, z), fineCoat);
      let cannon = null;
      if (!front) cannon = bone(1.10, [[0, 0, .082, .068], [.01, .09, .067, .056], [0, .45, .045, .037], [0, .85, .043, .039], [0, 1, .063, .055]], v(x, 1.23, z), fineCoat);
      const joint = ellipsoid(root, fineCoat, v(), v(front ? .09 : .095, .093, .076), v(x, 1.4, z));
      const foot = new T.Group(); root.add(foot);
      ellipsoid(foot, tan, v(0, .11, 0), v(.072, .095, .069));
      for (const half of [-1, 1]) {
        const hoof = loft([[.035, .006, half * .04, .11, .034], [.035, .065, half * .04, .105, .039], [.012, .142, half * .037, .068, .032], [0, .16, half * .035, .035, .026]], 12, 16);
        mesh(hoof, hoofMat, foot);
      }
      legs.push({ front, side, hip, upper, lower, cannon, joint, foot, upperLength, lowerLength, phase: side === 1 ? (front ? .14 : 0) : (front ? .64 : .5) });
    }

    const tail = new T.Group(); tail.position.set(-1.42, 2.82, 0); body.add(tail);
    const tailGeo = loft([[0, 0, 0, .085, .075], [-.12, -.2, 0, .046, .043], [-.20, -.49, 0, .031, .03], [-.22, -.82, 0, .025, .024], [-.24, -1.02, 0, .025, .025]], 40, 16);
    mesh(addCoat(tailGeo, tail.position), coat, tail);
    const tuft = loft([[-.24, -.87, 0, .026, .026], [-.25, -1.00, 0, .057, .057], [-.24, -1.20, 0, .08, .065], [-.21, -1.39, 0, .035, .026], [-.18, -1.48, 0, .001, .001]], 30, 16);
    mesh(tuft, hairMat, tail);
    const tailHairs = [];
    for (let i = 0; i < 150; i++) {
      const a = rng() * TAU, r = rng() * .055, x = -.25 + Math.cos(a) * r, z = Math.sin(a) * r;
      tailHairs.push(x, -1.0 - rng() * .15, z, x + .04 + rng() * .045, -1.37 - rng() * .14, z * .6);
    }
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(tailHairs, 3)); tail.add(new T.LineSegments(tg, new T.LineBasicMaterial({ color: 0x30261b })));

    const down = v(0, -1, 0), dir = v();
    function placeBone(group, start, end) { group.position.copy(start); dir.copy(end).sub(start).normalize(); group.quaternion.setFromUnitVectors(down, dir); }
    function solveKnee(start, end, a, b, bend) {
      const delta = end.clone().sub(start), d = clamp(delta.length(), .001, a + b - .001); delta.normalize();
      const along = (a * a - b * b + d * d) / (2 * d), across = Math.sqrt(Math.max(0, a * a - along * along));
      const perpendicular = v(-delta.y, delta.x, 0).normalize().multiplyScalar(bend * across);
      return start.clone().addScaledVector(delta, along).add(perpendicular);
    }
    const contact = [];
    function update(time, moving = true) {
      const cycle = time * .58;
      const bob = Math.sin(cycle * TAU * 2) * .022;
      const roll = Math.sin(cycle * TAU) * .015;
      body.position.y = bob; body.rotation.x = roll;
      body.rotation.z = Math.sin(cycle * TAU * 2 + .6) * .009;
      body.scale.z = 1 + Math.sin(time * 1.4) * .006;
      neck.rotation.z = Math.sin(cycle * TAU - .5) * .022 + Math.sin(time * .41) * .008;
      neck.rotation.x = -roll * .7;
      const positions = torso.attributes.position.array, normals = torso.attributes.normal.array;
      for (const [i, w] of bendingVertices) {
        const angle = neck.rotation.z * w, c = Math.cos(angle), s = Math.sin(angle), ax = neck.rotation.x * w, cx = Math.cos(ax), sx = Math.sin(ax);
        const x = restPositions[i] - .58, y = restPositions[i + 1] - 3.09, z = restPositions[i + 2];
        const ry = x * s + y * c;
        positions[i] = .58 + x * c - y * s; positions[i + 1] = 3.09 + ry * cx - z * sx; positions[i + 2] = ry * sx + z * cx;
        const nx = restNormals[i], ny = restNormals[i + 1], nz = restNormals[i + 2], rny = nx * s + ny * c;
        normals[i] = nx * c - ny * s; normals[i + 1] = rny * cx - nz * sx; normals[i + 2] = rny * sx + nz * cx;
      }
      torso.attributes.position.needsUpdate = true; torso.attributes.normal.needsUpdate = true;
      head.rotation.z = -neck.rotation.z * .7 + Math.sin(time * .63) * .016;
      head.rotation.y = Math.sin(time * .36) * .045;
      tail.rotation.x = Math.sin(time * 1.8) * .19 + Math.pow(Math.max(0, Math.sin(time * .52)), 10) * .55;
      tail.rotation.z = -.05 + Math.sin(time * 1.13) * .10;
      ears.forEach((ear, i) => { ear.rotation.x = Math.sin(time * .8 + i * 2.4) * .06 + Math.pow(Math.max(0, Math.sin(time * 2.1 + i * 3)), 18) * .15; });
      const blink = time % 5.7; eyelids.forEach(lid => { lid.visible = blink > 5.49 && blink < 5.64; });
      contact.length = 0;
      for (const leg of legs) {
        const phase = (cycle + leg.phase) % 1, stance = .66;
        let footX, footY = 0, angle = 0;
        if (phase < stance) {
          footX = .47 - phase / stance * .94;
          angle = -.08 * Math.pow(phase / stance, 8);
        } else {
          const t = (phase - stance) / (1 - stance), ease = t * t * (3 - 2 * t);
          // Hermite endpoint tangents match ground velocity at lift-off and
          // touchdown, avoiding a snap or a sliding planted foot.
          const tangent = -.94 * (1 - stance) / stance;
          footX = -.47 + ease * .94 + tangent * (2 * t * t * t - 3 * t * t + t);
          footY = Math.pow(Math.sin(Math.PI * t), 1.3) * (leg.front ? .25 : .21);
          angle = Math.sin(t * TAU) * .24;
        }
        const hip = leg.hip.clone(); hip.y += bob + Math.sin(cycle * TAU) * leg.side * .008;
        const ankle = v(leg.hip.x + footX, .145 + footY, leg.hip.z + Math.sin(phase * TAU) * .015);
        if (leg.front) {
          const knee = solveKnee(hip, ankle, leg.upperLength, leg.lowerLength, 1);
          placeBone(leg.upper, hip, knee); placeBone(leg.lower, knee, ankle); leg.joint.position.copy(knee);
        } else {
          const thighAngle = .36 + footX * .40;
          const stifle = hip.clone().add(v(Math.sin(thighAngle) * leg.upperLength, -Math.cos(thighAngle) * leg.upperLength, 0));
          const hock = solveKnee(stifle, ankle, leg.lowerLength, 1.10, -1);
          placeBone(leg.upper, hip, stifle); placeBone(leg.lower, stifle, hock); placeBone(leg.cannon, hock, ankle); leg.joint.position.copy(hock);
        }
        leg.foot.position.set(ankle.x, footY, ankle.z); leg.foot.rotation.z = angle;
        if (phase < stance && moving) contact.push({ x: ankle.x, z: ankle.z, phase });
      }
    }
    update(0);
    return { root, update, contact, rig: { legs, body, neck, head, tail }, stride: .94, cyclesPerSecond: .58, height: 5.8 };
  }
  window.SavannaGiraffe = { create: createGiraffe, random };
}());
