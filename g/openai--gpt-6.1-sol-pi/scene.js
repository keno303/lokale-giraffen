/* Giraffa — a local, procedural Three.js nature study. Three.js r128. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const TAU = Math.PI * 2;
  let seed = 38119;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const rand = (a, b) => a + random() * (b - a);
  const clamp = THREE.MathUtils.clamp;
  const lerp = THREE.MathUtils.lerp;
  const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) { $('loading').remove(); $('error').hidden = false; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('scene').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ded9be');
  scene.fog = new THREE.FogExp2('#e4d5b5', .012);
  const camera = new THREE.PerspectiveCamera(35, 1, .05, 220);
  scene.add(new THREE.HemisphereLight('#e8eee0', '#ac8050', .78));
  const sun = new THREE.DirectionalLight('#fff0cc', 1.95);
  sun.position.set(-5, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 11, bottom: -11, near: 1, far: 35 });
  sun.shadow.bias = -.00025;
  sun.shadow.normalBias = .025;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#e4e4d3', .43);
  fill.position.set(7, 5, -8); scene.add(fill);

  // A soft sky, entirely procedural; no file textures or network requests.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#b8c9c7') }, horizon: { value: new THREE.Color('#e9dbbc') } },
    vertexShader: 'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 horizon;varying vec3 p;void main(){float h=max(normalize(p).y,0.); vec3 c=mix(horizon,top,pow(h,.55));gl_FragColor=vec4(c,1.);}'
  }));
  scene.add(sky);

  // Irregular Voronoi reticulation, clipped into individual warm-brown coat patches.
  function coatTexture(columns, rows, salt, pale = false) {
    const previousSeed = seed; seed = salt;
    const size = 1024, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = pale ? '#cfb27c' : '#d6bb86'; ctx.fillRect(0, 0, size, size);
    const sites = [];
    for (let y = -1; y <= rows; y++) for (let x = -1; x <= columns; x++) {
      sites.push({ x: (x + .5 + rand(-.33, .33)) / columns * size, y: (y + .5 + rand(-.35, .35)) / rows * size, shade: rand(0, 1) });
    }
    for (const site of sites) {
      let polygon = [[site.x - size / columns * 1.8, site.y - size / rows * 1.8], [site.x + size / columns * 1.8, site.y - size / rows * 1.8], [site.x + size / columns * 1.8, site.y + size / rows * 1.8], [site.x - size / columns * 1.8, site.y + size / rows * 1.8]];
      for (const other of sites) {
        const dx = other.x - site.x, dy = other.y - site.y;
        if (other === site || Math.abs(dx) > size / columns * 3 || Math.abs(dy) > size / rows * 3) continue;
        const k = (other.x * other.x + other.y * other.y - site.x * site.x - site.y * site.y) / 2;
        const clipped = [];
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i], b = polygon[(i + 1) % polygon.length];
          const da = a[0] * dx + a[1] * dy - k, db = b[0] * dx + b[1] * dy - k;
          if (da <= 0) clipped.push(a);
          if ((da < 0) !== (db < 0)) { const t = da / (da - db); clipped.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); }
        }
        polygon = clipped;
        if (!polygon.length) break;
      }
      if (polygon.length < 3) continue;
      const shrink = pale ? rand(.89, .94) : rand(.91, .96);
      const points = polygon.map(p => [lerp(site.x, p[0], shrink), lerp(site.y, p[1], shrink)]);
      ctx.beginPath();
      // Rounded corners soften the geometry without making the patches circular.
      for (let i = 0; i < points.length; i++) {
        const before = points[(i + points.length - 1) % points.length], p = points[i], after = points[(i + 1) % points.length];
        const a = [lerp(p[0], before[0], .12), lerp(p[1], before[1], .12)];
        if (!i) ctx.moveTo(...a); else ctx.lineTo(...a);
        ctx.quadraticCurveTo(p[0], p[1], lerp(p[0], after[0], .12), lerp(p[1], after[1], .12));
      }
      ctx.closePath();
      const light = 24 + site.shade * 15;
      const gradient = ctx.createRadialGradient(site.x - 12, site.y + 7, 0, site.x, site.y, size / Math.min(columns, rows));
      gradient.addColorStop(0, `hsl(${27 + site.shade * 7}, ${pale ? 41 : 52}%, ${light}%)`);
      gradient.addColorStop(1, `hsl(31, ${pale ? 37 : 47}%, ${light + 9}%)`);
      ctx.fillStyle = gradient; ctx.fill();
    }
    // Short, low-contrast fur strokes give the coat a tactile surface in close-up.
    ctx.globalAlpha = .10;
    for (let i = 0; i < 56000; i++) {
      const x = rand(0, size), y = rand(0, size);
      ctx.strokeStyle = random() > .5 ? '#ffebba' : '#523319';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rand(-.8, .8), y + rand(1, 3.2)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    seed = previousSeed;
    return texture;
  }
  const furCanvas = document.createElement('canvas'); furCanvas.width = furCanvas.height = 512;
  const furContext = furCanvas.getContext('2d'); furContext.fillStyle = '#858585'; furContext.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 38000; i++) {
    const gray = Math.floor(rand(75, 185)); furContext.strokeStyle = `rgba(${gray},${gray},${gray},.45)`;
    const x = rand(0, 512), y = rand(0, 512); furContext.beginPath(); furContext.moveTo(x, y); furContext.lineTo(x + rand(-1, 1), y + rand(2, 7)); furContext.stroke();
  }
  const furTexture = new THREE.CanvasTexture(furCanvas); furTexture.wrapS = furTexture.wrapT = THREE.RepeatWrapping; furTexture.repeat.set(5, 5); furTexture.anisotropy = 8;
  function skin(columns, rows, salt, pale = false) {
    const map = coatTexture(columns, rows, salt, pale);
    return new THREE.MeshStandardMaterial({ map, bumpMap: furTexture, bumpScale: .011, roughness: .97, color: '#ffffff' });
  }
  const bodyMat = skin(12, 10, 2112);
  const neckMat = skin(7, 13, 3412);
  const upperLegMat = skin(5, 7, 5504, true);
  const headMat = skin(12, 8, 12234, true);
  const cream = new THREE.MeshStandardMaterial({ color: '#d9be86', roughness: 1 });
  const lightCream = new THREE.MeshStandardMaterial({ color: '#d3bb90', roughness: .94 });
  const muzzleMat = new THREE.MeshStandardMaterial({ color: '#b39a73', roughness: .95 });
  const maneMat = new THREE.MeshStandardMaterial({ color: '#443122', roughness: 1 });
  const hoofMat = new THREE.MeshStandardMaterial({ color: '#514d3d', roughness: .85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#2b2018', roughness: .9 });
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: '#100d08', roughness: .12, clearcoat: 1 });
  const innerEarMat = new THREE.MeshStandardMaterial({ color: '#b49471', side: THREE.DoubleSide, roughness: 1 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#c6b79a', roughness: .75 });
  const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
  function ellipsoid(parent, material, position, scale, rotation) {
    const mesh = new THREE.Mesh(sphereGeo, material);
    mesh.position.set(...position); mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  // Smooth elliptical loft. Rings are [axial position, radius-x, radius-z, center-x, center-z].
  function loft(rings, segments = 40) {
    const positions = [], uv = [], indices = [];
    const pts = rings.map(r => new THREE.Vector3(r[0], r[1], r[2]));
    // Interpolate all five channels using Catmull-Rom, with small, nonzero end caps.
    const curveA = new THREE.CatmullRomCurve3(pts);
    const curveB = new THREE.CatmullRomCurve3(rings.map(r => v3(r[0], r[3] || 0, r[4] || 0)));
    const lengthSegments = (rings.length - 1) * 8;
    for (let j = 0; j <= lengthSegments; j++) {
      const t = j / lengthSegments, a = curveA.getPoint(t), b = curveB.getPoint(t);
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * TAU;
        positions.push(b.y + Math.cos(angle) * Math.max(.003, a.y), a.x, b.z + Math.sin(angle) * Math.max(.003, a.z));
        uv.push(i / segments, t);
      }
    }
    for (let j = 0; j < lengthSegments; j++) for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    // Close both ends; small exposed tips must not show the sky through a ring.
    const first = rings[0], last = rings[rings.length - 1];
    const bottomCenter = positions.length / 3;
    positions.push(first[3] || 0, first[0], first[4] || 0); uv.push(.5, 0);
    const topCenter = positions.length / 3;
    positions.push(last[3] || 0, last[0], last[4] || 0); uv.push(.5, 1);
    const topRing = lengthSegments * (segments + 1);
    for (let i = 0; i < segments; i++) { indices.push(bottomCenter, i, i + 1, topCenter, topRing + i + 1, topRing + i); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(indices); g.computeVertexNormals();
    return g;
  }
  function makeLoft(parent, rings, material, segments) {
    const mesh = new THREE.Mesh(loft(rings, segments), material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function tube(parent, points, radius, material, radial = 7) {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(8, points.length * 5), radius, radial, false), material);
    mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  const giraffe = new THREE.Group(); scene.add(giraffe);
  const torso = new THREE.Group(); giraffe.add(torso);
  // Sloping back, deep chest, lean belly, and round but not spherical hindquarters.
  const trunk = makeLoft(torso, [
    [-1.46, .025, .025, .04], [-1.30, .33, .32, .04], [-1.04, .52, .44, .02],
    [-.64, .54, .45, .01], [-.12, .51, .43, -.035], [.40, .59, .44, -.08],
    [.76, .60, .41, -.09], [1.02, .45, .31, .02], [1.13, .06, .06, .07]
  ], bodyMat, 56);
  trunk.rotation.z = -Math.PI / 2; trunk.position.y = 3.28;
  // Shoulder and haunch volume is integrated into the loft rather than attached spheres.
  const neckPivot = new THREE.Group(); neckPivot.position.set(.58, 3.52, 0); torso.add(neckPivot);
  const neck = makeLoft(neckPivot, [
    [-.26, .33, .32, -.10], [0, .43, .36, .03], [.31, .37, .30, .18],
    [.82, .285, .245, .37], [1.40, .215, .205, .58], [1.91, .195, .18, .73],
    [2.25, .18, .17, .81], [2.36, .12, .14, .84]
  ], neckMat, 48);
  // Nuchal mane follows the back edge of the neck, made of a dark ridge and fine hairs.
  const manePoints = [v3(-.29, .05, 0), v3(-.13, .47, 0), v3(.16, 1.08, 0), v3(.44, 1.75, 0), v3(.63, 2.27, 0)];
  tube(neckPivot, manePoints, .027, maneMat);
  const maneCurve = new THREE.CatmullRomCurve3(manePoints);
  for (let i = 0; i < 170; i++) {
    const t = (i + .5) / 170, p = maneCurve.getPoint(t);
    const length = rand(.055, .11);
    tube(neckPivot, [p.clone().add(v3(0, 0, rand(-.023, .023))), p.clone().add(v3(-length * .5, .025, 0)), p.clone().add(v3(-length, .045, rand(-.02, .02)))], .0035, maneMat, 3);
  }
  const headPivot = new THREE.Group(); headPivot.position.set(.83, 2.25, 0); neckPivot.add(headPivot);
  headPivot.rotation.z = -.12;
  // Cranium and long facial bridge form a single tapered head silhouette.
  const head = makeLoft(headPivot, [
    [-.25, .055, .07], [-.15, .22, .20, .015], [.04, .245, .205, .015],
    [.28, .20, .17, .05], [.52, .155, .145, .105], [.70, .14, .155, .135], [.80, .015, .025, .135]
  ], headMat, 44);
  head.rotation.z = -Math.PI / 2;
  ellipsoid(headPivot, muzzleMat, [.68, -.13, 0], [.22, .135, .17], [0, 0, -.08]);
  ellipsoid(headPivot, lightCream, [.39, -.19, 0], [.38, .085, .135], [0, 0, -.10]);
  // Mouth seam wraps both sides, meeting at the soft upper lip.
  for (const side of [-1, 1]) {
    tube(headPivot, [v3(.36, -.235, side * .115), v3(.57, -.24, side * .15), v3(.76, -.215, side * .13), v3(.85, -.18, side * .08)], .008, darkMat);
    ellipsoid(headPivot, darkMat, [.74, -.072, side * .145], [.057, .026, .012], [side * .18, .1, -.3]);
    ellipsoid(headPivot, muzzleMat, [.728, -.052, side * .144], [.075, .012, .018], [0, 0, -.2]);
    // Dark, almond-shaped eye with a raised eyelid and little catchlight.
    ellipsoid(headPivot, muzzleMat, [.085, .075, side * .19], [.080, .062, .025], [0, 0, .10]);
    ellipsoid(headPivot, darkMat, [.095, .075, side * .211], [.059, .042, .014], [0, 0, .12]);
    ellipsoid(headPivot, eyeMat, [.10, .079, side * .222], [.045, .032, .018]);
    ellipsoid(headPivot, whiteMat, [.090, .093, side * .239], [.007, .006, .0025]);
    tube(headPivot, [v3(.033, .083, side * .215), v3(.055, .12, side * .223), v3(.10, .126, side * .223), v3(.15, .097, side * .216)], .007, muzzleMat);
    for (let i = 0; i < 9; i++) {
      const a = i / 8 * Math.PI;
      const p = v3(.10 + Math.cos(a) * .051, .083 + Math.sin(a) * .042, side * .226);
      tube(headPivot, [p, p.clone().add(v3(-.009, .016, side * .018))], .0015, darkMat, 3);
    }
  }
  // The paired ossicones are skin-covered horns, with dark bristled tips.
  for (const z of [-.125, .125]) {
    const horn = makeLoft(headPivot, [[0, .068, .062], [.08, .052, .047, -.012], [.20, .038, .036, -.045], [.26, .045, .042, -.055], [.29, .025, .025, -.055]], headMat, 20);
    horn.position.set(-.075, .195, z);
    ellipsoid(headPivot, maneMat, [-.13, .475, z], [.049, .039, .048]);
    for (let i = 0; i < 14; i++) {
      const p = v3(-.13 + rand(-.034, .034), .49, z + rand(-.033, .033));
      tube(headPivot, [p, p.clone().add(v3(rand(-.015, .015), rand(.025, .05), rand(-.015, .015)))], .0025, maneMat, 3);
    }
  }
  // Leaf-shaped ears: sculpted outer surface, cupped inner surface, soft rim.
  function earGeometry(inner) {
    const positions = [], indices = [], uvs = [], steps = 20, around = 24;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const width = Math.pow(Math.sin(Math.PI * t), .8) * .15;
      for (let i = 0; i <= around; i++) {
        const a = i / around * TAU;
        positions.push(Math.cos(a) * width, t * .46, Math.sin(a) * width * .21 + (inner ? .023 : 0));
        uvs.push(i / around, t);
      }
    }
    for (let j = 0; j < steps; j++) for (let i = 0; i < around; i++) {
      const a = j * (around + 1) + i, b = a + around + 1; indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }
  const ears = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(-.125, .115, side * .18); headPivot.add(pivot);
    pivot.rotation.x = side * 1.0; pivot.rotation.z = .30;
    const outer = new THREE.Mesh(earGeometry(false), headMat); outer.castShadow = true; pivot.add(outer);
    const inner = ellipsoid(pivot, innerEarMat, [0, .237, .023], [.103, .185, .021]);
    for (let i = 0; i < 8; i++) tube(pivot, [v3(rand(-.06, .06), .13, .047), v3(rand(-.045, .045), rand(.23, .33), .05)], .0017, lightCream, 3);
    ears.push({ pivot, side });
  }
  // Whiskers around the muzzle, visible in the detail camera.
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const p = v3(rand(.57, .78), rand(-.17, -.12), side * .15);
    tube(headPivot, [p, p.clone().add(v3(rand(-.025, .055), -.02, side * rand(.04, .065)))], .0012, cream, 3);
  }

  const legs = [];
  const hoofGeometry = sphereGeo.clone();
  const hoofPositions = hoofGeometry.attributes.position;
  for (let i = 0; i < hoofPositions.count; i++) {
    hoofPositions.setY(i, Math.max(-.8, hoofPositions.getY(i)));
    hoofPositions.setX(i, Math.min(.82, hoofPositions.getX(i)));
  }
  hoofGeometry.computeVertexNormals();
  const boneUp = v3(0, 1, 0);
  function boneMesh(rings, mat) { return makeLoft(giraffe, rings, mat, 24); }
  function setBone(mesh, a, b, nominalLength) {
    mesh.position.copy(a); const delta = b.clone().sub(a);
    mesh.quaternion.setFromUnitVectors(boneUp, delta.clone().normalize());
    mesh.scale.y = delta.length() / nominalLength;
  }
  function createLeg(front, side) {
    const leg = { front, side, x: front ? .69 : -1.05, z: side * .315, phase: side > 0 ? (front ? 0 : .15) : (front ? .5 : .65) };
    leg.upper = boneMesh([[0, .15, .14], [.18, front ? .16 : .21, .14], [.43, .12, .115], [.69, .085, .084], [.75, .065, .065]], upperLegMat);
    leg.middle = boneMesh([[0, .087, .084], [.14, .096, .085], [.39, .075, .07], [.80, .049, .046], [1.19, .046, .045], [1.4, .066, .062]], upperLegMat);
    leg.lower = boneMesh([[0, .058, .053], [.13, .047, .042], [.40, .040, .036], [.86, .035, .032], [1.08, .048, .043], [1.22, .068, .058]], cream);
    leg.knee = ellipsoid(giraffe, upperLegMat, [0, 0, 0], [.076, .082, .073]);
    leg.elbow = ellipsoid(giraffe, upperLegMat, [0, 0, 0], [.091, .09, .089]);
    leg.ankle = ellipsoid(giraffe, cream, [0, 0, 0], [.077, .10, .070]);
    leg.foot = new THREE.Group(); giraffe.add(leg.foot);
    for (const dz of [-.042, .042]) {
      const hoof = ellipsoid(leg.foot, hoofMat, [.025, .080, dz], [.118, .10, .04], [0, 0, -.04]); hoof.geometry = hoofGeometry;
      // Coronary band and the two distinct toes, with a narrow cloven gap.
      ellipsoid(leg.foot, muzzleMat, [.004, .144, dz], [.086, .021, .037]);
    }
    legs.push(leg);
  }
  createLeg(true, -1); createLeg(false, -1); createLeg(true, 1); createLeg(false, 1);
  // A supple tail with a long dark hair switch.
  const tailRoot = new THREE.Group(); tailRoot.position.set(-1.32, 3.46, 0); torso.add(tailRoot);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(), v3(-.35, -.5, 0), v3(-.4, -1.1, 0), v3(-.35, -1.47, 0)]), 28, .028, 8, false), cream);
  tailMesh.castShadow = true; tailRoot.add(tailMesh);
  const tailSwitch = new THREE.Group(); tailSwitch.position.set(-.35, -1.47, 0); tailRoot.add(tailSwitch);
  ellipsoid(tailSwitch, maneMat, [0, -.18, 0], [.07, .24, .066], [0, 0, -.12]);
  for (let i = 0; i < 45; i++) {
    const p = v3(rand(-.04, .04), rand(-.07, .01), rand(-.04, .04));
    tube(tailSwitch, [p, v3(p.x - .02, -.22, p.z), v3(p.x + rand(-.05, .06), rand(-.42, -.30), p.z + rand(-.03, .03))], .0025, maneMat, 3);
  }

  // Ground: warm mineral soil with fine grain, pebbles, and patches of dried earth.
  function groundTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const c = canvas.getContext('2d'); c.fillStyle = '#baa575'; c.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 650; i++) {
      const x = rand(0, 1024), y = rand(0, 1024), r = rand(10, 110);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, random() > .5 ? '#d8c39235' : '#897a5025'); g.addColorStop(1, '#ab986500'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 100000; i++) {
      c.fillStyle = random() > .5 ? `rgba(65,53,29,${rand(.03, .14)})` : `rgba(246,227,180,${rand(.07, .25)})`;
      c.fillRect(rand(0, 1024), rand(0, 1024), rand(.5, 2), rand(.5, 2));
    }
    for (let i = 0; i < 400; i++) {
      c.fillStyle = '#75644135'; c.beginPath(); c.ellipse(rand(0, 1024), rand(0, 1024), rand(.8, 3), rand(.5, 2), rand(0, TAU), 0, TAU); c.fill();
    }
    const t = new THREE.CanvasTexture(canvas); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(50, 50); t.anisotropy = 8; return t;
  }
  const soilTexture = groundTexture();
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ map: soilTexture, color: '#f1dfb7', roughness: 1, bumpMap: soilTexture, bumpScale: .022 }));
  soil.rotation.x = -Math.PI / 2; soil.receiveShadow = true; scene.add(soil);
  // A subtle contact shadow prevents floating even on low-resolution shadow maps.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 128;
  const shadowCtx = shadowCanvas.getContext('2d'); const sg = shadowCtx.createRadialGradient(64, 64, 5, 64, 64, 64);
  sg.addColorStop(0, '#36291455'); sg.addColorStop(1, '#36291400'); shadowCtx.fillStyle = sg; shadowCtx.fillRect(0, 0, 128, 128);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 1.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false, opacity: .48 }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = .008; scene.add(contact);
  for (const leg of legs) {
    leg.contact = new THREE.Mesh(new THREE.PlaneGeometry(.34, .25), new THREE.MeshBasicMaterial({ map: contact.material.map, transparent: true, depthWrite: false, opacity: .42 }));
    leg.contact.rotation.x = -Math.PI / 2; leg.contact.position.y = .012; scene.add(leg.contact);
  }

  // Little puffs of dry soil are emitted only at a hoof's new ground contact.
  const dustCount = 72, dustPositions = new Float32Array(dustCount * 3), dustAges = new Float32Array(dustCount), dustSizes = new Float32Array(dustCount);
  const dustParticles = Array.from({ length: dustCount }, () => ({ active: false, born: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0 }));
  dustAges.fill(2); let nextDust = 0;
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3)); dustGeometry.setAttribute('aAge', new THREE.BufferAttribute(dustAges, 1)); dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
  const dustMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 500 } },
    vertexShader: 'attribute float aAge; attribute float aSize; uniform float uScale; varying float age; void main(){age=aAge; vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_PointSize=clamp(aSize*uScale/-p.z,1.,45.);}',
    fragmentShader: 'varying float age; void main(){float r=length(gl_PointCoord-.5)*2.; float opacity=(1.-smoothstep(0.,1.,r))*max(0.,1.-age)*.14; gl_FragColor=vec4(.55,.45,.30,opacity);}'
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial); dust.frustumCulled = false; scene.add(dust);
  function emitDust(x, z) {
    for (let i = 0; i < 5; i++) {
      const particle = dustParticles[nextDust]; particle.active = true; particle.born = wallTime; particle.travel = walkTime * (1.04 / (1.55 * .65)); particle.x = x + rand(-.04, .04); particle.z = z + rand(-.05, .05); particle.y = .025;
      particle.vx = rand(-.16, .08); particle.vz = rand(-.13, .13); dustSizes[nextDust] = rand(.14, .25);
      nextDust = (nextDust + 1) % dustCount;
    }
  }

  // Thousands of grass blades are packed into one draw call, with a light breeze in the shader.
  const grassPositions = [], grassColors = [], grassIndices = [];
  const grassOffsets = [], grassHeights = [], grassAnchors = [];
  const grassPalette = ['#8e934d', '#b3a064', '#a2915e', '#727f45', '#bfaa72'].map(c => new THREE.Color(c).convertSRGBToLinear());
  for (let i = 0; i < 3300; i++) {
    const x = rand(-27, 27), z = rand(-26, 20);
    if (Math.abs(x) < 2.5 && Math.abs(z) < 1.0 && random() < .87) continue;
    const clumpSize = Math.floor(rand(3, 8)), baseHeight = rand(.08, .30);
    for (let b = 0; b < clumpSize; b++) {
      const px = x + rand(-.12, .12), pz = z + rand(-.12, .12), angle = rand(0, TAU);
      const width = rand(.009, .018), height = baseHeight * rand(.65, 1.25), bend = rand(.03, .13);
      const dx = Math.cos(angle), dz = Math.sin(angle), start = grassPositions.length / 3;
      const vertices = [[px - dx * width, .008, pz - dz * width], [px + dx * width, .008, pz + dz * width], [px + dx * bend * .5 - dx * width * .5, height * .55, pz + dz * bend * .5 - dz * width * .5], [px + dx * bend * .5 + dx * width * .5, height * .55, pz + dz * bend * .5 + dz * width * .5], [px + dx * bend, height, pz + dz * bend]];
      const color = grassPalette[Math.floor(random() * grassPalette.length)];
      for (const p of vertices) { grassPositions.push(...p); grassColors.push(color.r, color.g, color.b); grassOffsets.push(rand(0, TAU)); grassHeights.push(p[1] / height); grassAnchors.push(x); }
      grassIndices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2, start + 2, start + 3, start + 4);
    }
  }
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(grassPositions, 3)); grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(grassColors, 3)); grassGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(grassOffsets, 1)); grassGeo.setAttribute('aHeight', new THREE.Float32BufferAttribute(grassHeights, 1)); grassGeo.setAttribute('aAnchor', new THREE.Float32BufferAttribute(grassAnchors, 1)); grassGeo.setIndex(grassIndices); grassGeo.computeVertexNormals();
  const breeze = { value: 0 }, groundTravel = { value: 0 };
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  grassMat.onBeforeCompile = shader => {
    shader.uniforms.uTime = breeze; shader.uniforms.uTravel = groundTravel;
    shader.vertexShader = 'uniform float uTime; uniform float uTravel; attribute float aPhase; attribute float aHeight; attribute float aAnchor;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += mod(aAnchor-uTravel+27.,54.)-27.-aAnchor; transformed.x += sin(uTime*1.3 + position.x*.43 + position.z*.4)*.028*aHeight*aHeight; transformed.z += cos(uTime*.8 + position.x*.5)*.018*aHeight;');
  };
  const grass = new THREE.Mesh(grassGeo, grassMat); grass.receiveShadow = true; scene.add(grass);

  // Small scattered mineral rocks, using instancing to keep the landscape inexpensive.
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#9d916c', roughness: 1 });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 200);
  const dummy = new THREE.Object3D(), rockTransforms = [];
  for (let i = 0; i < 200; i++) {
    dummy.position.set(rand(-26, 26), .025, rand(-25, 19)); dummy.rotation.set(rand(0, 3), rand(0, 6), rand(0, 3));
    const s = rand(.025, .09); dummy.scale.set(s * 1.8, s * .7, s); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    rockTransforms.push({ x: dummy.position.x, matrix: dummy.matrix.clone() });
  }
  rocks.receiveShadow = true; scene.add(rocks);

  // Umbrella acacias: branching trunks and textured, irregular flat-topped canopies.
  const barkMat = new THREE.MeshStandardMaterial({ color: '#675d42', roughness: 1 });
  const foliageGeometry = new THREE.IcosahedronGeometry(1, 1);
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const foliageColors = ['#536342', '#66734a', '#485d3c', '#7a7a4e'].map(c => new THREE.Color(c).convertSRGBToLinear());
  const landscapeTrees = [];
  function branch(parent, a, b, radiusA, radiusB) {
    const direction = b.clone().sub(a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), 7), barkMat);
    mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(boneUp, direction.normalize()); mesh.castShadow = true; parent.add(mesh);
  }
  function acacia(x, z, scale, salt) {
    const oldSeed = seed; seed = salt;
    const tree = new THREE.Group(); tree.position.set(x, 0, z); tree.scale.setScalar(scale); scene.add(tree);
    branch(tree, v3(), v3(.12, 1.8, 0), .16, .09);
    branch(tree, v3(.12, 1.8, 0), v3(.22, 2.6, .08), .10, .055);
    const foliage = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, 9 * 48);
    foliage.castShadow = true; foliage.receiveShadow = true; tree.add(foliage);
    const leafDummy = new THREE.Object3D(); let leafIndex = 0;
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * TAU + rand(-.3, .3), radius = rand(1.2, 2.8);
      const end = v3(Math.cos(angle) * radius, rand(2.65, 3.4), Math.sin(angle) * radius);
      const joint = end.clone().multiply(v3(.45, .78, .45));
      branch(tree, v3(.12, rand(1.4, 2.1), 0), joint, .07, .035);
      branch(tree, joint, end, .037, .013);
      for (let j = 0; j < 48; j++) {
        const angle = rand(0, TAU), radius = Math.sqrt(random()) * 1.12;
        leafDummy.position.copy(end).add(v3(Math.cos(angle) * radius, rand(-.11, .22) - radius * .04, Math.sin(angle) * radius));
        leafDummy.scale.set(rand(.18, .36), rand(.08, .16), rand(.18, .36));
        leafDummy.rotation.set(rand(-.2, .2), rand(0, TAU), rand(-.2, .2)); leafDummy.updateMatrix();
        foliage.setMatrixAt(leafIndex, leafDummy.matrix); foliage.setColorAt(leafIndex, foliageColors[Math.floor(rand(0, 4))]); leafIndex++;
      }
    }
    landscapeTrees.push({ tree, x });
    seed = oldSeed;
    return tree;
  }
  acacia(-12, -22, 1.25, 611);
  acacia(15, -31, 1.42, 512);
  acacia(-22, -38, 1.2, 871);
  acacia(24, -36, 1.6, 929);
  acacia(2, -43, 1.7, 199);
  acacia(-30, -46, 1.7, 668);
  acacia(37, -48, 1.5, 279);
  // Hazy rolling escarpments beyond the open grassland.
  function hill(z, height, color, phase) {
    const positions = [], indices = [];
    for (let i = 0; i <= 100; i++) {
      const x = -120 + i * 2.4;
      const h = height * (.52 + .22 * Math.sin(x * .035 + phase) + .15 * Math.sin(x * .08 + phase * 2) + .10 * Math.sin(x * .13));
      positions.push(x, -.15, z, x, h, z - 9);
      if (i < 100) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); scene.add(mesh);
  }
  hill(-87, 7.0, '#b8b59a', 1.3); hill(-74, 4.5, '#b5b18e', 2.4); hill(-60, 2.8, '#aaa77d', .3);

  // Batch the fine hairs and tree branches, preserving each articulated parent's transform.
  function batchStaticDetails(parent) {
    for (const child of [...parent.children]) batchStaticDetails(child);
    const groups = new Map();
    for (const child of parent.children) {
      if (!child.isMesh || !['TubeGeometry', 'CylinderGeometry'].includes(child.geometry.type)) continue;
      if (!groups.has(child.material)) groups.set(child.material, []);
      groups.get(child.material).push(child);
    }
    for (const [material, children] of groups) {
      if (children.length < 2) continue;
      const data = { position: [], normal: [], uv: [] };
      for (const mesh of children) {
        mesh.updateMatrix(); const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); geometry.applyMatrix4(mesh.matrix);
        for (const name of Object.keys(data)) {
          const a = geometry.getAttribute(name); if (!a) continue;
          for (let i = 0; i < a.array.length; i++) data[name].push(a.array[i]);
        }
        geometry.dispose(); mesh.geometry.dispose(); parent.remove(mesh);
      }
      const geometry = new THREE.BufferGeometry();
      for (const name of Object.keys(data)) geometry.setAttribute(name, new THREE.Float32BufferAttribute(data[name], name === 'uv' ? 2 : 3));
      const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; parent.add(mesh);
    }
  }
  batchStaticDetails(scene);

  // r128 expects material albedo in linear space; CanvasTexture albedo is already sRGB-decoded.
  const linearized = new Set();
  scene.traverse(object => {
    if (!object.material) return;
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (material.color && !linearized.has(material)) { material.color.convertSRGBToLinear(); linearized.add(material); }
    }
  });

  // Sparse drifting motes, only visible as a little depth in the golden light.
  const motePositions = [];
  for (let i = 0; i < 100; i++) motePositions.push(rand(-14, 14), rand(.1, 7), rand(-10, 10));
  const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: '#fff3d3', size: .015, transparent: true, opacity: .4, depthWrite: false })); scene.add(motes);

  // Camera orbit, smooth preset transitions, wheel zoom and touch pinch.
  const mobile = () => window.innerWidth < 650;
  const presets = {
    portrait: { azimuth: .51, elevation: .085, distance: 14.4, target: [-1.12, 2.94, 0] },
    profile: { azimuth: .05, elevation: .04, distance: 12.7, target: [-1.0, 2.9, 0] },
    detail: { azimuth: .71, elevation: .11, distance: 5.0, target: [1.26, 4.98, 0] }
  };
  const orbit = { azimuth: .51, elevation: .085, distance: 13.5, target: v3(-1.12, 2.88, 0) };
  const goal = { azimuth: orbit.azimuth, elevation: orbit.elevation, distance: orbit.distance, target: orbit.target.clone() };
  let selectedView = 'portrait', cameraTouched = false;
  function selectView(name) {
    selectedView = name; cameraTouched = false; $('experience').dataset.view = name;
    const p = presets[name]; goal.azimuth = p.azimuth; goal.elevation = p.elevation; goal.distance = p.distance; goal.target.set(...p.target);
    if (mobile()) {
      if (name === 'detail') { goal.distance = 6.6; goal.target.set(1.23, 4.76, 0); }
      else { goal.distance = 22.8; goal.target.set(.24, 3.0, 0); goal.azimuth = name === 'profile' ? .08 : .51; }
    }
    document.querySelectorAll('button[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === name); b.setAttribute('aria-pressed', String(b.dataset.view === name)); });
  }
  document.querySelectorAll('button[data-view]').forEach(b => b.addEventListener('click', () => selectView(b.dataset.view)));
  const pointers = new Map(); let lastPinch = 0;
  renderer.domElement.addEventListener('pointerdown', event => {
    renderer.domElement.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) { const p = [...pointers.values()]; lastPinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    renderer.domElement.style.cursor = 'grabbing';
  });
  renderer.domElement.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId); if (!previous) return;
    const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); cameraTouched = true;
    if (pointers.size === 1) { goal.azimuth -= dx * .005; goal.elevation = clamp(goal.elevation + dy * .003, -.07, .66); }
    else { const p = [...pointers.values()], d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); goal.distance = clamp(goal.distance * lastPinch / Math.max(1, d), 3.4, 24); lastPinch = d; }
  });
  const release = event => { pointers.delete(event.pointerId); if (!pointers.size) renderer.domElement.style.cursor = 'grab'; };
  renderer.domElement.addEventListener('pointerup', release); renderer.domElement.addEventListener('pointercancel', release);
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('wheel', event => { event.preventDefault(); goal.distance = clamp(goal.distance * Math.exp(event.deltaY * .001), 3.4, 24); cameraTouched = true; }, { passive: false });
  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight); dustMaterial.uniforms.uScale.value = window.innerHeight * renderer.getPixelRatio(); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    if (!cameraTouched) selectView(selectedView);
  }
  window.addEventListener('resize', resize); resize();
  orbit.azimuth = goal.azimuth; orbit.elevation = goal.elevation; orbit.distance = goal.distance; orbit.target.copy(goal.target);

  // Foot contacts last 65% of each cycle; the return is an eased, lifted swing.
  // Same-side legs are close in phase, as in the giraffe's distinctive lateral walk.
  let walking = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speed = 1, walkTime = .12, wallTime = 0;
  function syncPlayback() {
    $('pauseIcon').hidden = !walking; $('playIcon').hidden = walking;
    $('playButton').setAttribute('aria-label', walking ? 'Pause walking' : 'Resume walking');
    $('motionState').textContent = walking ? 'NATURAL PACE' : 'A MOMENT OF STILLNESS';
    document.querySelector('.motion-label').firstChild.textContent = walking ? 'Walking' : 'Resting';
  }
  $('playButton').addEventListener('click', () => { walking = !walking; syncPlayback(); });
  $('speedSlider').addEventListener('input', event => { speed = +event.target.value; $('speedValue').textContent = speed.toFixed(1) + '×'; });
  window.addEventListener('keydown', event => {
    if (event.code === 'Space' && !['INPUT', 'BUTTON'].includes(document.activeElement.tagName) && !$('aboutDialog').open) { event.preventDefault(); walking = !walking; syncPlayback(); }
    if (event.code === 'KeyR' && !$('aboutDialog').open) selectView('portrait');
  });
  syncPlayback();
  $('aboutButton').addEventListener('click', () => $('aboutDialog').showModal());
  $('closeAbout').addEventListener('click', () => $('aboutDialog').close());
  $('aboutDialog').addEventListener('click', event => { const r = $('aboutDialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('aboutDialog').close(); });

  // Optional ambience, synthesized locally with Web Audio (off until explicitly enabled).
  let audio = null, audioEnabled = false;
  function createAmbience() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    const context = new AudioContext(), volume = context.createGain(); volume.gain.value = 0; volume.connect(context.destination);
    const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate), data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .02) / 1.02; data[i] = brown * 3.5; }
    const wind = context.createBufferSource(); wind.buffer = buffer; wind.loop = true;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 650;
    const windGain = context.createGain(); windGain.gain.value = .32; wind.connect(filter).connect(windGain).connect(volume); wind.start();
    const rustle = context.createOscillator(), rustleGain = context.createGain(); rustle.frequency.value = .14; rustleGain.gain.value = .10;
    rustle.connect(rustleGain).connect(windGain.gain); rustle.start();
    function bird() {
      if (!audioEnabled || context.state !== 'running') return;
      const time = context.currentTime, osc = context.createOscillator(), gain = context.createGain(); osc.type = 'sine';
      osc.frequency.setValueAtTime(1900 + Math.random() * 800, time); osc.frequency.exponentialRampToValueAtTime(3400, time + .10); osc.frequency.exponentialRampToValueAtTime(1700, time + .22);
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.027, time + .025); gain.gain.exponentialRampToValueAtTime(.0001, time + .28);
      osc.connect(gain).connect(volume); osc.start(time); osc.stop(time + .3);
    }
    const interval = setInterval(bird, 3800);
    return { context, volume, interval };
  }
  $('soundButton').addEventListener('click', async () => {
    if (!audio) audio = createAmbience(); if (!audio) return;
    await audio.context.resume(); audioEnabled = !audioEnabled;
    audio.volume.gain.setTargetAtTime(audioEnabled ? .42 : 0, audio.context.currentTime, .6);
    $('soundButton').classList.toggle('enabled', audioEnabled); $('soundButton').setAttribute('aria-label', audioEnabled ? 'Mute savanna ambience' : 'Enable savanna ambience');
    $('soundButton').setAttribute('aria-pressed', String(audioEnabled));
  });

  function updateGiraffe(time) {
    const cycle = time / 1.55;
    const bob = Math.sin(cycle * TAU * 2) * .025;
    torso.position.y = bob;
    torso.rotation.x = Math.sin(cycle * TAU) * .013;
    torso.rotation.z = Math.sin(cycle * TAU * 2 + .3) * .007;
    neckPivot.rotation.z = Math.sin(cycle * TAU * 2 + .7) * .009;
    neckPivot.rotation.x = Math.sin(cycle * TAU + .2) * .012;
    headPivot.rotation.z = -.12 + Math.sin(cycle * TAU * 2 - .3) * .018;
    headPivot.rotation.y = Math.sin(time * .6) * .045;
    ears.forEach(({ pivot, side }) => { pivot.rotation.x = side * (1.0 + Math.sin(time * 1.25 + side) * .055); pivot.rotation.z = .30 + Math.sin(time * .8 + side * 2) * .045; });
    tailRoot.rotation.x = Math.sin(time * 1.9) * .29 + Math.sin(time * .65) * .14;
    tailRoot.rotation.z = Math.sin(time * 2.2 + .5) * .09;
    tailSwitch.rotation.x = Math.sin(time * 1.9 - .5) * .22;
    for (const leg of legs) {
      const phase = ((cycle + leg.phase) % 1 + 1) % 1, duty = .65;
      let stride, lift;
      if (phase < duty) { stride = .52 - phase / duty * 1.04; lift = 0; }
      else {
        const u = (phase - duty) / (1 - duty), eased = u * u * (3 - 2 * u);
        // Hermite endpoint tangents match the soil velocity at toe-off and touchdown.
        stride = -.52 + eased * 1.04 - 1.04 * (1 - duty) / duty * (2 * u * u * u - 3 * u * u + u);
        lift = Math.sin(u * Math.PI) * .25;
      }
      const root = v3(leg.x, (leg.front ? 3.39 : 3.33) + bob, leg.z);
      const elbow = v3(leg.x + (leg.front ? -.15 : .30) + stride * .22, root.y - (leg.front ? .72 : .73), leg.z);
      const foot = v3(leg.x + stride, .15 + lift, leg.z + Math.sin(phase * TAU) * .018);
      const direction = foot.clone().sub(elbow), distance = direction.length(); direction.normalize();
      const upperLength = 1.40, lowerLength = 1.22;
      const d = Math.min(distance, upperLength + lowerLength - .001);
      const along = (upperLength * upperLength - lowerLength * lowerLength + d * d) / (2 * d);
      const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
      const perpendicular = v3(-direction.y, direction.x, 0).multiplyScalar(leg.front ? 1 : -1);
      const knee = elbow.clone().addScaledVector(direction, along).addScaledVector(perpendicular, height);
      setBone(leg.upper, root, elbow, .75); setBone(leg.middle, elbow, knee, 1.4); setBone(leg.lower, knee, foot, 1.22);
      leg.elbow.position.copy(elbow); leg.knee.position.copy(knee); leg.ankle.position.copy(foot);
      leg.foot.position.set(foot.x, lift, foot.z);
      leg.foot.rotation.z = phase > duty ? Math.sin((phase - duty) / (1 - duty) * Math.PI * 2) * .16 : 0;
      leg.contact.position.x = foot.x; leg.contact.position.z = foot.z; leg.contact.material.opacity = .42 * Math.max(0, 1 - lift * 5);
      if (walking && leg.lastPhase !== undefined && phase < leg.lastPhase) emitDust(foot.x, foot.z);
      leg.lastPhase = phase;
    }
  }
  const clock = new THREE.Clock();
  let ready = false;
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), .05); wallTime += dt;
    if (walking && !document.hidden) walkTime += dt * speed;
    updateGiraffe(walkTime);
    breeze.value = wallTime;
    // The camera tracks the animal: planted feet and soil travel at the same velocity.
    const travel = walkTime * (1.04 / (1.55 * .65));
    groundTravel.value = travel;
    soilTexture.offset.x = travel / 220 * 50;
    for (let i = 0; i < rockTransforms.length; i++) {
      const r = rockTransforms[i]; r.matrix.elements[12] = ((r.x - travel + 27) % 54 + 54) % 54 - 27;
      rocks.setMatrixAt(i, r.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < dustCount; i++) {
      const p = dustParticles[i]; if (!p.active) continue;
      const age = wallTime - p.born; dustAges[i] = age / .95;
      dustPositions[i * 3] = p.x + p.vx * age - (travel - p.travel);
      dustPositions[i * 3 + 1] = p.y + age * .09; dustPositions[i * 3 + 2] = p.z + p.vz * age;
      if (age > .95) p.active = false;
    }
    dustGeometry.attributes.position.needsUpdate = true; dustGeometry.attributes.aAge.needsUpdate = true; dustGeometry.attributes.aSize.needsUpdate = true;
    landscapeTrees.forEach(({ tree, x }) => { tree.position.x = ((x - travel + 65) % 130 + 130) % 130 - 65; });
    motes.rotation.y = Math.sin(wallTime * .015) * .06;
    const smooth = 1 - Math.exp(-dt * 5.5);
    orbit.azimuth = lerp(orbit.azimuth, goal.azimuth, smooth); orbit.elevation = lerp(orbit.elevation, goal.elevation, smooth); orbit.distance = lerp(orbit.distance, goal.distance, smooth); orbit.target.lerp(goal.target, smooth);
    const horizontal = Math.cos(orbit.elevation) * orbit.distance;
    camera.position.set(orbit.target.x + Math.sin(orbit.azimuth) * horizontal, orbit.target.y + Math.sin(orbit.elevation) * orbit.distance, orbit.target.z + Math.cos(orbit.azimuth) * horizontal);
    camera.lookAt(orbit.target);
    renderer.render(scene, camera);
    if (!ready) { ready = true; $('loading').classList.add('done'); setTimeout(() => $('loading').remove(), 850); }
  }
  animate();
  // Useful for offline smoke tests without altering the public UI.
  window.giraffa = { scene, camera, renderer, giraffe, selectView, get walking() { return walking; }, get time() { return walkTime; } };
})();
