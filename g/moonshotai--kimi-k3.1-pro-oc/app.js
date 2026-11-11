(function () {
  'use strict';

  const canvas = document.getElementById('scene');
  const loading = document.getElementById('loading');
  const errorMessage = document.getElementById('errorMessage');
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    loading.classList.add('loaded');
    errorMessage.hidden = false;
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd7c49e, 24, 92);
  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 220);
  const clock = new THREE.Clock();
  const UP = new THREE.Vector3(0, 1, 0);
  const DOWN = new THREE.Vector3(0, -1, 0);
  const tempVector = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  let seed = 48721;

  function random() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }

  function range(min, max) { return min + (max - min) * random(); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function wrap01(t) { return ((t % 1) + 1) % 1; }

  function makeCanvasTexture(size, painter) {
    const element = document.createElement('canvas');
    element.width = element.height = size;
    painter(element.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(element);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function clipPolygon(polygon, nx, ny, d) {
    const output = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const da = a[0] * nx + a[1] * ny - d;
      const db = b[0] * nx + b[1] * ny - d;
      if (da <= 0) output.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        output.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return output;
  }

  function createCoatTexture() {
    return makeCanvasTexture(1024, function (ctx, size) {
      const cells = 8;
      const step = size / cells;
      const points = [];
      ctx.fillStyle = '#dfb773';
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          points.push({ x: (x + 0.5 + range(-0.28, 0.28)) * step, y: (y + 0.5 + range(-0.28, 0.28)) * step });
        }
      }
      points.forEach(function (point, index) {
        let polygon = [[point.x - step, point.y - step], [point.x + step, point.y - step], [point.x + step, point.y + step], [point.x - step, point.y + step]];
        points.forEach(function (other, otherIndex) {
          if (index === otherIndex) return;
          for (let ox = -1; ox <= 1; ox++) {
            for (let oy = -1; oy <= 1; oy++) {
              const qx = other.x + ox * size;
              const qy = other.y + oy * size;
              if (Math.abs(qx - point.x) > step * 2.2 || Math.abs(qy - point.y) > step * 2.2) continue;
              const nx = qx - point.x;
              const ny = qy - point.y;
              const d = (qx * qx + qy * qy - point.x * point.x - point.y * point.y) / 2;
              polygon = clipPolygon(polygon, nx, ny, d);
            }
          }
        });
        const shrink = range(0.82, 0.9);
        polygon = polygon.map(function (p) { return [point.x + (p[0] - point.x) * shrink, point.y + (p[1] - point.y) * shrink]; });
        const light = Math.floor(range(-10, 13));
        ctx.fillStyle = 'rgb(' + (130 + light) + ',' + (66 + light * 0.55) + ',' + (35 + light * 0.25) + ')';
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            ctx.beginPath();
            polygon.forEach(function (p, i) {
              if (i === 0) ctx.moveTo(p[0] + ox * size, p[1] + oy * size);
              else ctx.lineTo(p[0] + ox * size, p[1] + oy * size);
            });
            ctx.closePath();
            ctx.fill();
          }
        }
      });
      const image = ctx.getImageData(0, 0, size, size);
      for (let i = 0; i < image.data.length; i += 4) {
        const noise = range(-5, 5);
        image.data[i] += noise;
        image.data[i + 1] += noise;
        image.data[i + 2] += noise;
      }
      ctx.putImageData(image, 0, 0);
      ctx.globalAlpha = 0.075;
      for (let i = 0; i < 19000; i++) {
        ctx.fillStyle = random() > 0.5 ? '#fff2cf' : '#422c20';
        ctx.fillRect(random() * size, random() * size, range(0.3, 1.2), range(0.5, 2));
      }
      ctx.globalAlpha = 1;
    });
  }

  const coatTexture = createCoatTexture();
  coatTexture.wrapS = coatTexture.wrapT = THREE.RepeatWrapping;
  const coatMaterial = new THREE.MeshStandardMaterial({ map: coatTexture, roughness: 0.91, metalness: 0 });
  const creamMaterial = new THREE.MeshStandardMaterial({ color: 0xd9b77d, roughness: 0.94 });
  const lightCreamMaterial = new THREE.MeshStandardMaterial({ color: 0xe6c88f, roughness: 0.95 });
  const maneMaterial = new THREE.MeshStandardMaterial({ color: 0x4c3021, roughness: 1 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x382a22, roughness: 0.88 });
  const muzzleMaterial = new THREE.MeshStandardMaterial({ color: 0x735644, roughness: 0.92 });
  const innerEarMaterial = new THREE.MeshStandardMaterial({ color: 0x9b7158, roughness: 1, side: THREE.DoubleSide });
  const hoofMaterial = new THREE.MeshStandardMaterial({ color: 0x332e29, roughness: 0.82 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x100d09, roughness: 0.16, metalness: 0.05 });
  const eyeRimMaterial = new THREE.MeshStandardMaterial({ color: 0x5b3c27, roughness: 0.9 });
  const glintMaterial = new THREE.MeshBasicMaterial({ color: 0xfff8dc });

  function cloneCoatMaterial(repeatX, repeatY) {
    const texture = coatTexture.clone();
    texture.needsUpdate = true;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.93 });
  }

  function mesh(geometry, material, parent, cast, receive) {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = cast !== false;
    object.receiveShadow = receive !== false;
    if (parent) parent.add(object);
    return object;
  }

  function ellipsoid(parent, material, position, scale, segments) {
    const object = mesh(new THREE.SphereGeometry(1, segments || 20, Math.max(10, (segments || 20) / 2)), material, parent);
    object.position.copy(position);
    object.scale.copy(scale);
    return object;
  }

  function createLoftX(sections, radialSegments) {
    const radial = radialSegments || 24;
    const positions = [];
    const uvs = [];
    const indices = [];
    sections.forEach(function (s, i) {
      for (let j = 0; j <= radial; j++) {
        const theta = j / radial * Math.PI * 2;
        positions.push(s.x, s.y + Math.cos(theta) * s.ry, s.z + Math.sin(theta) * s.rz);
        uvs.push(j / radial, i / (sections.length - 1));
      }
    });
    for (let i = 0; i < sections.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const first = sections[0];
    const last = sections[sections.length - 1];
    const startCenter = positions.length / 3;
    positions.push(first.x, first.y, first.z);
    uvs.push(0.5, 0.5);
    const startRing = positions.length / 3;
    for (let j = 0; j <= radial; j++) {
      const theta = j / radial * Math.PI * 2;
      positions.push(first.x, first.y + Math.cos(theta) * first.ry, first.z + Math.sin(theta) * first.rz);
      uvs.push(0.5 + Math.sin(theta) * 0.13, 0.5 + Math.cos(theta) * 0.13);
    }
    const endCenter = positions.length / 3;
    positions.push(last.x, last.y, last.z);
    uvs.push(0.5, 0.5);
    const endRing = positions.length / 3;
    for (let j = 0; j <= radial; j++) {
      const theta = j / radial * Math.PI * 2;
      positions.push(last.x, last.y + Math.cos(theta) * last.ry, last.z + Math.sin(theta) * last.rz);
      uvs.push(0.5 + Math.sin(theta) * 0.13, 0.5 + Math.cos(theta) * 0.13);
    }
    for (let j = 0; j < radial; j++) {
      indices.push(startCenter, startRing + j + 1, startRing + j);
      indices.push(endCenter, endRing + j, endRing + j + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createTube(sections, radialSegments) {
    const radial = radialSegments || 18;
    const positions = [];
    const uvs = [];
    const indices = [];
    sections.forEach(function (section, i) {
      const previous = sections[Math.max(0, i - 1)].p;
      const next = sections[Math.min(sections.length - 1, i + 1)].p;
      const tangent = next.clone().sub(previous).normalize();
      let side = new THREE.Vector3(0, 0, 1);
      if (Math.abs(tangent.dot(side)) > 0.95) side = new THREE.Vector3(1, 0, 0);
      const normal = new THREE.Vector3().crossVectors(side, tangent).normalize();
      side = new THREE.Vector3().crossVectors(tangent, normal).normalize();
      for (let j = 0; j <= radial; j++) {
        const theta = j / radial * Math.PI * 2;
        tempVector.copy(section.p)
          .addScaledVector(normal, Math.cos(theta) * section.r1)
          .addScaledVector(side, Math.sin(theta) * section.r2);
        positions.push(tempVector.x, tempVector.y, tempVector.z);
        uvs.push(j / radial, i / (sections.length - 1));
      }
    });
    for (let i = 0; i < sections.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j;
        const b = a + radial + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function cylinderBetween(a, b, radiusA, radiusB, material, parent, radial) {
    const object = mesh(new THREE.CylinderGeometry(radiusB, radiusA, 1, radial || 8, 1, false), material, parent);
    object.position.copy(a).add(b).multiplyScalar(0.5);
    object.scale.y = a.distanceTo(b);
    object.quaternion.setFromUnitVectors(UP, tempVector.copy(b).sub(a).normalize());
    return object;
  }

  function addCurveTube(parent, points, radius, material, segments) {
    const curve = new THREE.CatmullRomCurve3(points);
    return mesh(new THREE.TubeGeometry(curve, segments || 16, radius, 5, false), material, parent);
  }

  // Soft, warm sky with a high, pale blue zenith and a dusty horizon.
  const sky = mesh(new THREE.SphereGeometry(150, 36, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x87aeb5) },
      horizonColor: { value: new THREE.Color(0xead3a6) },
      lowColor: { value: new THREE.Color(0xd4ad78) }
    },
    vertexShader: 'varying vec3 vPosition; void main(){ vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vPosition; uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 lowColor; void main(){ float h=normalize(vPosition).y; vec3 c=mix(horizonColor,topColor,smoothstep(-0.02,0.32,h)); c=mix(lowColor,c,smoothstep(-0.18,0.03,h)); gl_FragColor=vec4(c,1.0); }'
  }), scene, false, false);

  const sunTexture = makeCanvasTexture(256, function (ctx, size) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,248,206,1)');
    gradient.addColorStop(0.1, 'rgba(255,237,174,.95)');
    gradient.addColorStop(0.24, 'rgba(255,218,143,.35)');
    gradient.addColorStop(1, 'rgba(255,205,125,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sun.position.set(-24, 18, -55);
  sun.scale.set(24, 24, 1);
  scene.add(sun);

  const hemiLight = new THREE.HemisphereLight(0xe3edf0, 0x8e653d, 0.82);
  scene.add(hemiLight);
  const sunlight = new THREE.DirectionalLight(0xffd69a, 2.15);
  sunlight.position.set(-7, 12, 8);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -7;
  sunlight.shadow.camera.right = 7;
  sunlight.shadow.camera.top = 8;
  sunlight.shadow.camera.bottom = -5;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 35;
  sunlight.shadow.bias = -0.00035;
  sunlight.shadow.normalBias = 0.025;
  scene.add(sunlight);
  scene.add(sunlight.target);
  const fillLight = new THREE.DirectionalLight(0xa9c6ce, 0.27);
  fillLight.position.set(8, 5, -9);
  scene.add(fillLight);

  const groundTexture = makeCanvasTexture(512, function (ctx, size) {
    ctx.fillStyle = '#9e967d';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 95; i++) {
      const x = random() * size;
      const y = random() * size;
      const radius = range(18, 70);
      const patch = ctx.createRadialGradient(x, y, 0, x, y, radius);
      patch.addColorStop(0, random() > 0.5 ? 'rgba(91,88,62,.16)' : 'rgba(207,187,135,.18)');
      patch.addColorStop(1, 'rgba(150,140,100,0)');
      ctx.fillStyle = patch;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 22000; i++) {
      const tone = Math.floor(range(105, 188));
      ctx.fillStyle = 'rgba(' + tone + ',' + Math.floor(tone * 0.88) + ',' + Math.floor(tone * 0.57) + ',' + range(0.04, 0.2) + ')';
      const r = range(0.4, 2.2);
      ctx.fillRect(random() * size, random() * size, r * 2.5, r);
    }
    for (let i = 0; i < 160; i++) {
      ctx.strokeStyle = 'rgba(74,68,40,' + range(0.03, 0.09) + ')';
      ctx.lineWidth = range(1, 3);
      ctx.beginPath();
      const x = random() * size;
      const y = random() * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + range(-20, 20), y + range(-5, 5));
      ctx.stroke();
    }
  });
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(65, 65);
  const ground = mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: 0xbcb49a, map: groundTexture, roughness: 1 }), scene, false, true);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.035;

  // Distant, softly layered landforms.
  const hillMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x8c9272, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0xa39c78, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0xb4a17b, roughness: 1 })
  ];
  for (let i = 0; i < 22; i++) {
    const angle = i / 22 * Math.PI * 2;
    const distance = range(49, 72);
    const hill = mesh(new THREE.SphereGeometry(1, 16, 8), hillMaterials[i % 3], scene, false, true);
    hill.position.set(Math.cos(angle) * distance, range(-2.1, -1.1), Math.sin(angle) * distance);
    hill.scale.set(range(10, 18), range(3.5, 6.5), range(7, 13));
    hill.rotation.y = random() * Math.PI;
  }

  const barkMaterial = new THREE.MeshStandardMaterial({ color: 0x554d36, roughness: 1, flatShading: true });
  const branchMaterial = new THREE.MeshStandardMaterial({ color: 0x665b3f, roughness: 1, flatShading: true });
  const leafMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x52603b, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x687046, roughness: 1 }),
    new THREE.MeshStandardMaterial({ color: 0x7b7749, roughness: 1 })
  ];
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 2);
  const canopyPositions = canopyGeometry.attributes.position;
  for (let i = 0; i < canopyPositions.count; i++) {
    const x = canopyPositions.getX(i);
    const y = canopyPositions.getY(i);
    const z = canopyPositions.getZ(i);
    const ruffle = 0.9 + 0.1 * Math.sin(x * 17 + z * 11) * Math.cos(y * 13 - z * 7);
    canopyPositions.setXYZ(i, x * ruffle, y * (0.94 + 0.09 * Math.sin(x * 15 + z * 9)), z * ruffle);
  }
  canopyGeometry.computeVertexNormals();

  function createAcacia(x, z, scale, detail) {
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(scale);
    tree.rotation.y = random() * Math.PI * 2;
    scene.add(tree);
    const trunkTop = new THREE.Vector3(0.12, 3.25, 0);
    cylinderBetween(new THREE.Vector3(0, 0, 0), trunkTop, 0.23, 0.12, barkMaterial, tree, 7);
    const branchCount = detail ? 7 : 5;
    for (let i = 0; i < branchCount; i++) {
      const angle = i / branchCount * Math.PI * 2 + range(-0.25, 0.25);
      const start = new THREE.Vector3(0.08, range(2.0, 2.8), 0);
      const middle = new THREE.Vector3(Math.cos(angle) * range(0.8, 1.4), range(3.4, 3.9), Math.sin(angle) * range(0.8, 1.4));
      const end = new THREE.Vector3(Math.cos(angle) * range(1.8, 2.8), range(3.9, 4.35), Math.sin(angle) * range(1.8, 2.8));
      cylinderBetween(start, middle, 0.105, 0.055, branchMaterial, tree, 6);
      cylinderBetween(middle, end, 0.06, 0.018, branchMaterial, tree, 5);
      const canopy = mesh(canopyGeometry, leafMaterials[i % leafMaterials.length], tree, detail, true);
      canopy.position.copy(end);
      canopy.scale.set(range(1.45, 2.2), range(0.35, 0.57), range(1.2, 1.8));
      canopy.rotation.y = random() * Math.PI;
      if (detail) {
        for (let j = 0; j < 2; j++) {
          const lobe = mesh(canopyGeometry, leafMaterials[(i + j + 1) % 3], tree, true, true);
          lobe.position.copy(end).add(new THREE.Vector3(range(-0.9, 0.9), range(-0.12, 0.18), range(-0.7, 0.7)));
          lobe.scale.set(range(0.7, 1.15), range(0.24, 0.42), range(0.65, 1.1));
        }
      }
    }
    const crown = mesh(canopyGeometry, leafMaterials[0], tree, detail, true);
    crown.position.set(0, 4.1, 0);
    crown.scale.set(2.15, 0.48, 1.7);
    return tree;
  }

  createAcacia(-13, -15, 1.28, true);
  createAcacia(11, -17, 1.02, true);
  createAcacia(-17, 5, 0.95, false);
  createAcacia(20, 7, 1.35, false);
  createAcacia(-26, -21, 1.6, false);
  createAcacia(31, -22, 1.3, false);
  createAcacia(-4, -31, 1.0, false);
  createAcacia(30, 25, 1.55, false);
  createAcacia(-34, 23, 1.15, false);
  createAcacia(6, 32, 0.95, false);
  createAcacia(42, 1, 1.6, false);

  // A single instanced draw call supplies thousands of dry grass blades.
  function createGrassGeometry() {
    const positions = [];
    const normals = [];
    const uvs = [];
    for (let blade = 0; blade < 3; blade++) {
      const angle = blade / 3 * Math.PI;
      const dx = Math.cos(angle) * 0.032;
      const dz = Math.sin(angle) * 0.032;
      const bendX = Math.cos(angle + 0.8) * 0.12;
      const bendZ = Math.sin(angle + 0.8) * 0.12;
      positions.push(-dx, 0, -dz, dx, 0, dz, bendX * 0.35 + dx * 0.5, 0.52, bendZ * 0.35 + dz * 0.5);
      positions.push(-dx, 0, -dz, bendX * 0.35 + dx * 0.5, 0.52, bendZ * 0.35 + dz * 0.5, bendX, 1, bendZ);
      for (let j = 0; j < 6; j++) { normals.push(0, 0.4, 0.6); uvs.push(0, 0); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
  }

  const grassTime = { value: 0 };
  const grassMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x665532).convertSRGBToLinear(), side: THREE.DoubleSide, vertexColors: true });
  grassMaterial.onBeforeCompile = function (shader) {
    shader.uniforms.uGrassTime = grassTime;
    shader.vertexShader = 'uniform float uGrassTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat wind = sin(uGrassTime * 1.25 + instanceMatrix[3].x * .38 + instanceMatrix[3].z * .29) * .055;\ntransformed.x += wind * position.y * position.y;\ntransformed.z += wind * .35 * position.y;');
  };
  grassMaterial.customProgramCacheKey = function () { return 'savanna-grass-wind'; };
  const grassCount = window.innerWidth < 700 ? 1800 : 3400;
  const grass = new THREE.InstancedMesh(createGrassGeometry(), grassMaterial, grassCount);
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const grassColor = new THREE.Color();
  for (let i = 0; i < grassCount; i++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * 43 + 1.8;
    dummy.position.set(Math.cos(angle) * radius, -0.01, Math.sin(angle) * radius);
    dummy.rotation.set(0, random() * Math.PI, range(-0.06, 0.06));
    const height = range(0.12, 0.44) * (random() > 0.96 ? 1.6 : 1);
    dummy.scale.set(range(0.7, 1.6), height, range(0.7, 1.5));
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grassColor.setHSL(range(0.105, 0.16), range(0.16, 0.32), range(0.53, 0.70));
    grass.setColorAt(i, grassColor);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  scene.add(grass);

  const rockMaterials = [new THREE.MeshStandardMaterial({ color: 0x8a8065, roughness: 1, flatShading: true }), new THREE.MeshStandardMaterial({ color: 0xa29370, roughness: 1, flatShading: true })];
  for (let i = 0; i < 70; i++) {
    const angle = random() * Math.PI * 2;
    const radius = range(4, 37);
    const rock = mesh(new THREE.DodecahedronGeometry(range(0.07, 0.24), 0), rockMaterials[i % 2], scene, false, true);
    rock.position.set(Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius);
    rock.scale.set(range(1, 2.1), range(0.4, 0.9), range(0.8, 1.5));
    rock.rotation.set(random(), random() * Math.PI, random());
  }

  // GIRAFFE: custom lofts preserve the sloping back, deep chest, and tapered neck.
  const giraffe = new THREE.Group();
  scene.add(giraffe);
  const bodyRig = new THREE.Group();
  giraffe.add(bodyRig);

  const bodyGeometry = createLoftX([
    { x: -1.35, y: 2.34, z: 0, ry: 0.12, rz: 0.10 },
    { x: -1.24, y: 2.37, z: 0, ry: 0.39, rz: 0.35 },
    { x: -0.98, y: 2.39, z: 0, ry: 0.57, rz: 0.48 },
    { x: -0.55, y: 2.42, z: 0, ry: 0.59, rz: 0.54 },
    { x: -0.05, y: 2.47, z: 0, ry: 0.57, rz: 0.54 },
    { x: 0.45, y: 2.52, z: 0, ry: 0.63, rz: 0.55 },
    { x: 0.78, y: 2.53, z: 0, ry: 0.70, rz: 0.48 },
    { x: 1.04, y: 2.54, z: 0, ry: 0.55, rz: 0.36 },
    { x: 1.18, y: 2.55, z: 0, ry: 0.25, rz: 0.18 }
  ], 32);
  mesh(bodyGeometry, cloneCoatMaterial(1.15, 1), bodyRig);

  const bellyMaterial = new THREE.MeshStandardMaterial({ color: 0xcaa36a, roughness: 1, transparent: true, opacity: 0.34 });
  const belly = ellipsoid(bodyRig, bellyMaterial, new THREE.Vector3(-0.10, 1.99, 0), new THREE.Vector3(0.74, 0.21, 0.40));
  belly.castShadow = false;

  const neckRig = new THREE.Group();
  neckRig.position.set(0.80, 2.75, 0);
  bodyRig.add(neckRig);
  const neckSections = [
    { p: new THREE.Vector3(0, -0.12, 0), r1: 0.43, r2: 0.36 },
    { p: new THREE.Vector3(0.10, 0.20, 0), r1: 0.38, r2: 0.32 },
    { p: new THREE.Vector3(0.23, 0.65, 0), r1: 0.32, r2: 0.27 },
    { p: new THREE.Vector3(0.39, 1.13, 0), r1: 0.265, r2: 0.225 },
    { p: new THREE.Vector3(0.57, 1.59, 0), r1: 0.22, r2: 0.19 },
    { p: new THREE.Vector3(0.73, 1.96, 0), r1: 0.195, r2: 0.165 },
    { p: new THREE.Vector3(0.81, 2.13, 0), r1: 0.18, r2: 0.155 }
  ];
  mesh(createTube(neckSections, 28), cloneCoatMaterial(1, 1.8), neckRig);

  // Short, dark mane along the rear edge of the neck.
  const manePoints = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const x = -0.34 + t * 0.97;
    const y = 0.02 + t * 2.06;
    manePoints.push(new THREE.Vector3(x, y, 0));
    if (i % 2 === 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([x + 0.06, y - 0.04, -0.035, x + 0.06, y - 0.04, 0.035, x - range(0.06, 0.13), y + 0.015, 0], 3));
      geometry.computeVertexNormals();
      mesh(geometry, new THREE.MeshStandardMaterial({ color: i % 4 ? 0x503222 : 0x68452b, roughness: 1, side: THREE.DoubleSide }), neckRig);
    }
  }
  addCurveTube(neckRig, manePoints, 0.047, maneMaterial, 28);

  const head = new THREE.Group();
  head.position.set(0.81, 2.11, 0);
  head.rotation.z = -0.08;
  neckRig.add(head);
  const headGeometry = createLoftX([
    { x: -0.16, y: 0.02, z: 0, ry: 0.12, rz: 0.12 },
    { x: -0.04, y: 0.08, z: 0, ry: 0.23, rz: 0.18 },
    { x: 0.17, y: 0.09, z: 0, ry: 0.25, rz: 0.215 },
    { x: 0.36, y: 0.015, z: 0, ry: 0.20, rz: 0.17 },
    { x: 0.58, y: -0.075, z: 0, ry: 0.145, rz: 0.145 },
    { x: 0.79, y: -0.10, z: 0, ry: 0.13, rz: 0.17 },
    { x: 0.86, y: -0.10, z: 0, ry: 0.08, rz: 0.12 }
  ], 24);
  mesh(headGeometry, cloneCoatMaterial(0.65, 0.8), head);
  const muzzle = ellipsoid(head, muzzleMaterial, new THREE.Vector3(0.76, -0.115, 0), new THREE.Vector3(0.235, 0.135, 0.18));
  muzzle.rotation.z = -0.08;
  const chin = ellipsoid(head, creamMaterial, new THREE.Vector3(0.54, -0.215, 0), new THREE.Vector3(0.31, 0.07, 0.125));
  chin.rotation.z = -0.05;

  // Nostrils, lips, glossy side-set eyes, lids and lashes.
  [-1, 1].forEach(function (side) {
    const nostril = ellipsoid(head, darkMaterial, new THREE.Vector3(0.855, -0.055, side * 0.135), new THREE.Vector3(0.066, 0.035, 0.019), 16);
    nostril.rotation.z = -0.25;
    const eyeSocket = ellipsoid(head, eyeRimMaterial, new THREE.Vector3(0.205, 0.16, side * 0.191), new THREE.Vector3(0.09, 0.070, 0.028), 20);
    eyeSocket.rotation.y = side * 0.12;
    ellipsoid(head, eyeMaterial, new THREE.Vector3(0.225, 0.166, side * 0.214), new THREE.Vector3(0.053, 0.047, 0.030), 20);
    ellipsoid(head, glintMaterial, new THREE.Vector3(0.247, 0.188, side * 0.250), new THREE.Vector3(0.014, 0.014, 0.009), 10).castShadow = false;
    addCurveTube(head, [new THREE.Vector3(0.145, 0.201, side * 0.229), new THREE.Vector3(0.22, 0.225, side * 0.241), new THREE.Vector3(0.285, 0.201, side * 0.222)], 0.011, darkMaterial, 8);
    for (let lash = 0; lash < 3; lash++) {
      const x = 0.18 + lash * 0.037;
      addCurveTube(head, [new THREE.Vector3(x, 0.22, side * 0.235), new THREE.Vector3(x - 0.006, 0.246, side * 0.275)], 0.005, darkMaterial, 2);
    }
    addCurveTube(head, [new THREE.Vector3(0.54, -0.16, side * 0.135), new THREE.Vector3(0.75, -0.17, side * 0.175), new THREE.Vector3(0.91, -0.145, side * 0.10)], 0.009, darkMaterial, 10);
  });

  const ears = [];
  [-1, 1].forEach(function (side) {
    const ear = new THREE.Group();
    ear.position.set(-0.07, 0.255, side * 0.15);
    ear.rotation.x = side * 0.94;
    ear.rotation.z = side * 0.06 + 0.25;
    head.add(ear);
    const outer = ellipsoid(ear, lightCreamMaterial, new THREE.Vector3(0, 0.16, 0), new THREE.Vector3(0.105, 0.245, 0.055), 18);
    outer.rotation.z = -0.08;
    const inner = ellipsoid(ear, innerEarMaterial, new THREE.Vector3(0.046, 0.17, 0), new THREE.Vector3(0.064, 0.177, 0.041), 18);
    inner.rotation.z = -0.08;
    ears.push(ear);

    const horn = new THREE.Group();
    horn.position.set(0.105, 0.27, side * 0.105);
    horn.rotation.z = -0.13;
    head.add(horn);
    const stem = mesh(new THREE.CylinderGeometry(0.036, 0.052, 0.24, 10), coatMaterial, horn);
    stem.position.y = 0.12;
    ellipsoid(horn, maneMaterial, new THREE.Vector3(0, 0.255, 0), new THREE.Vector3(0.061, 0.071, 0.058), 14);
    for (let hair = 0; hair < 5; hair++) {
      const angle = hair / 5 * Math.PI * 2;
      cylinderBetween(new THREE.Vector3(0, 0.29, 0), new THREE.Vector3(Math.cos(angle) * 0.045, 0.32 + random() * 0.025, Math.sin(angle) * 0.045), 0.005, 0.002, maneMaterial, horn, 4);
    }
  });

  const tailRig = new THREE.Group();
  tailRig.position.set(-1.25, 2.51, 0);
  bodyRig.add(tailRig);
  addCurveTube(tailRig, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.29, -0.24, 0), new THREE.Vector3(-0.39, -0.66, 0.015), new THREE.Vector3(-0.34, -1.02, 0.02)], 0.035, creamMaterial, 20);
  const tailTuft = new THREE.Group();
  tailTuft.position.set(-0.34, -1.00, 0.02);
  tailRig.add(tailTuft);
  for (let i = 0; i < 15; i++) {
    const angle = random() * Math.PI * 2;
    addCurveTube(tailTuft, [new THREE.Vector3(range(-0.025, 0.025), 0, range(-0.02, 0.02)), new THREE.Vector3(Math.cos(angle) * 0.075, -0.19, Math.sin(angle) * 0.075), new THREE.Vector3(Math.cos(angle) * 0.10, -range(0.33, 0.44), Math.sin(angle) * 0.1)], range(0.008, 0.015), maneMaterial, 7);
  }

  function createLegSegment(topRadius, middleRadius, bottomRadius, material) {
    const geometry = createTube([
      { p: new THREE.Vector3(0, 0, 0), r1: topRadius, r2: topRadius * 0.9 },
      { p: new THREE.Vector3(0, -0.18, 0), r1: middleRadius * 1.04, r2: middleRadius * 0.9 },
      { p: new THREE.Vector3(0, -0.64, 0), r1: middleRadius, r2: middleRadius * 0.88 },
      { p: new THREE.Vector3(0, -1, 0), r1: bottomRadius, r2: bottomRadius * 0.9 }
    ], 16);
    return mesh(geometry, material, giraffe);
  }

  const legs = [];
  [
    { name: 'leftFore', x: 0.76, y: 2.46, z: 0.365, l1: 1.10, l2: 1.075, phase: 0, front: true, bend: 1 },
    { name: 'rightFore', x: 0.76, y: 2.46, z: -0.365, l1: 1.10, l2: 1.075, phase: 0.5, front: true, bend: 1 },
    { name: 'leftHind', x: -0.88, y: 2.32, z: 0.345, l1: 1.055, l2: 1.015, phase: 0.075, front: false, bend: -1 },
    { name: 'rightHind', x: -0.88, y: 2.32, z: -0.345, l1: 1.055, l2: 1.015, phase: 0.575, front: false, bend: -1 }
  ].forEach(function (data) {
    const upper = createLegSegment(data.front ? 0.18 : 0.20, data.front ? 0.125 : 0.145, 0.085, coatMaterial);
    const lower = createLegSegment(0.087, 0.069, 0.052, coatMaterial);
    const pastern = createLegSegment(0.056, 0.05, 0.066, creamMaterial);
    const knee = ellipsoid(giraffe, coatMaterial, new THREE.Vector3(), new THREE.Vector3(data.front ? 0.105 : 0.11, 0.12, 0.095), 16);
    const fetlock = ellipsoid(giraffe, creamMaterial, new THREE.Vector3(), new THREE.Vector3(0.072, 0.095, 0.075), 14);
    const hoof = new THREE.Group();
    giraffe.add(hoof);
    [-1, 1].forEach(function (toe) {
      const hoofPart = mesh(new THREE.CylinderGeometry(0.082, 0.103, 0.145, 9), hoofMaterial, hoof);
      hoofPart.position.set(0.025, 0.083, toe * 0.060);
      hoofPart.scale.set(1.28, 1, 0.83);
      const coronet = mesh(new THREE.CylinderGeometry(0.079, 0.084, 0.035, 10), darkMaterial, hoof);
      coronet.position.set(0.025, 0.16, toe * 0.06);
      coronet.scale.set(1.2, 1, 0.83);
    });
    legs.push(Object.assign({}, data, { upper: upper, lower: lower, pastern: pastern, knee: knee, fetlock: fetlock, hoof: hoof }));
  });

  function alignSegment(object, a, b) {
    object.position.copy(a);
    const direction = tempVector.copy(b).sub(a);
    object.scale.set(1, direction.length(), 1);
    object.quaternion.setFromUnitVectors(DOWN, direction.normalize());
  }

  const shadowTexture = makeCanvasTexture(128, function (ctx, size) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 3, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(45,36,22,.5)');
    gradient.addColorStop(0.45, 'rgba(45,36,22,.24)');
    gradient.addColorStop(1, 'rgba(45,36,22,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  });
  const contactShadow = mesh(new THREE.PlaneGeometry(4.3, 2.2), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.65 }), giraffe, false, false);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.008, 0);

  // Foot-level dust motes are deliberately subtle; they never obscure the silhouette.
  const dustGeometry = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(95 * 3);
  for (let i = 0; i < 95; i++) {
    dustPositions[i * 3] = range(-1.5, 1.4);
    dustPositions[i * 3 + 1] = range(0.05, 1.15);
    dustPositions[i * 3 + 2] = range(-0.75, 0.75);
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xe6c892, size: 0.035, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true }));
  giraffe.add(dust);

  const birdGroup = new THREE.Group();
  scene.add(birdGroup);
  const birdMaterial = new THREE.LineBasicMaterial({ color: 0x4d5144, transparent: true, opacity: 0.58 });
  for (let i = 0; i < 7; i++) {
    const birdGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.25, 0, 0), new THREE.Vector3(-0.10, 0.08, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, 0.08, 0), new THREE.Vector3(0.25, 0, 0)]);
    const bird = new THREE.Line(birdGeometry, birdMaterial);
    bird.position.set(range(-4, 4), range(-0.8, 1.5), range(-2, 2));
    bird.scale.setScalar(range(0.6, 1.25));
    birdGroup.add(bird);
  }
  birdGroup.position.set(-8, 13, -29);

  const path = { angle: 0, x: 0, z: 6, heading: 0 };
  let gaitTime = 0;
  let simulationTime = 0;
  let playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speed = 1;
  const baseSpeed = 0.62;
  const cycleDuration = 1.85;
  const duty = 0.66;
  const stride = baseSpeed * cycleDuration * duty;

  function updateLeg(leg, phase, bodyBob, sideSway) {
    const p = wrap01(phase);
    let footX;
    let footY = leg.front ? 0.335 : 0.32;
    let lateral = leg.z;
    if (p < duty) {
      footX = stride * 0.5 - stride * p / duty;
    } else {
      const q = (p - duty) / (1 - duty);
      footX = -stride * 0.5 + stride * smoothstep(q);
      footY += Math.pow(Math.sin(q * Math.PI), 1.25) * (leg.front ? 0.25 : 0.20);
      lateral += Math.sign(leg.z) * Math.sin(q * Math.PI) * 0.025;
    }
    const hip = new THREE.Vector3(leg.x, leg.y + bodyBob, leg.z + sideSway * 0.25);
    const ankle = new THREE.Vector3(leg.x + footX, footY, lateral);
    const dx = ankle.x - hip.x;
    const dy = ankle.y - hip.y;
    const distance = Math.min(Math.sqrt(dx * dx + dy * dy), leg.l1 + leg.l2 - 0.002);
    const ux = dx / distance;
    const uy = dy / distance;
    const along = (leg.l1 * leg.l1 - leg.l2 * leg.l2 + distance * distance) / (2 * distance);
    const height = Math.sqrt(Math.max(0, leg.l1 * leg.l1 - along * along));
    const knee = new THREE.Vector3(hip.x + ux * along + (-uy) * height * leg.bend, hip.y + uy * along + ux * height * leg.bend, leg.z + (lateral - leg.z) * 0.35);
    const hoofLift = footY - (leg.front ? 0.335 : 0.32);
    const hoofPoint = new THREE.Vector3(ankle.x + 0.035, 0.145 + hoofLift, lateral);
    alignSegment(leg.upper, hip, knee);
    alignSegment(leg.lower, knee, ankle);
    alignSegment(leg.pastern, ankle, hoofPoint);
    leg.knee.position.copy(knee);
    leg.fetlock.position.copy(ankle);
    leg.hoof.position.set(hoofPoint.x, hoofLift, hoofPoint.z);
    leg.hoof.rotation.z = -hoofLift * 0.42;
  }

  function updateGiraffe(dt) {
    if (playing) {
      gaitTime += dt * speed;
      simulationTime += dt * speed;
      const derivative = Math.sqrt(Math.pow(8 * Math.cos(path.angle), 2) + Math.pow(6 * Math.sin(path.angle), 2));
      path.angle += dt * speed * baseSpeed / Math.max(4, derivative);
    }
    path.x = Math.sin(path.angle) * 8;
    path.z = Math.cos(path.angle) * 6;
    const dx = 8 * Math.cos(path.angle);
    const dz = -6 * Math.sin(path.angle);
    path.heading = Math.atan2(-dz, dx);
    giraffe.position.set(path.x, 0, path.z);
    giraffe.rotation.y = path.heading;

    const phase = gaitTime / cycleDuration;
    const bodyBob = Math.cos(phase * Math.PI * 4 + 0.4) * 0.026;
    const sideSway = Math.sin(phase * Math.PI * 2) * 0.055;
    bodyRig.position.set(0, bodyBob, sideSway);
    bodyRig.rotation.x = Math.sin(phase * Math.PI * 2) * 0.018;
    bodyRig.rotation.z = Math.sin(phase * Math.PI * 4) * 0.008;
    neckRig.rotation.z = Math.sin(phase * Math.PI * 2 + 0.8) * 0.017;
    neckRig.rotation.x = Math.sin(phase * Math.PI * 2 + 0.3) * 0.012;
    head.rotation.z = -0.08 + Math.sin(phase * Math.PI * 2 + 1.2) * 0.024;
    head.rotation.y = Math.sin(simulationTime * 0.24) * 0.045;
    tailRig.rotation.x = Math.sin(simulationTime * 1.65) * 0.24 + Math.sin(simulationTime * 0.47) * 0.16;
    tailRig.rotation.z = -0.05 + Math.sin(simulationTime * 1.12) * 0.08;
    tailTuft.rotation.z = Math.sin(simulationTime * 2.1) * 0.10;
    ears[0].rotation.y = Math.sin(simulationTime * 0.72) * 0.08;
    ears[1].rotation.y = Math.sin(simulationTime * 0.72 + 1.8) * 0.08;
    legs.forEach(function (leg) { updateLeg(leg, phase + leg.phase, bodyBob, sideSway); });
    dust.rotation.y = simulationTime * 0.055;
    dust.position.y = Math.sin(simulationTime * 0.8) * 0.04;

    sunlight.position.set(path.x - 7, 12, path.z + 8);
    sunlight.target.position.set(path.x, 1.5, path.z);
    sunlight.target.updateMatrixWorld();
    grassTime.value = simulationTime;
    birdGroup.position.x = -8 + Math.sin(simulationTime * 0.035) * 9;
    birdGroup.children.forEach(function (bird, i) { bird.rotation.z = Math.sin(simulationTime * 2 + i) * 0.09; });
  }

  const cameraControl = {
    view: 'profile',
    theta: 0.61,
    targetTheta: 0.61,
    distance: 11.25,
    targetDistance: 11.25,
    height: 2.25,
    targetHeight: 2.25,
    dragging: false,
    lastX: 0,
    lastY: 0,
    moved: false
  };

  function setView(view) {
    cameraControl.view = view;
    if (view === 'profile') {
      cameraControl.targetTheta = 0.61;
      cameraControl.targetDistance = window.innerWidth < 700 ? 17.2 : 11.25;
      cameraControl.targetHeight = 2.25;
    } else if (view === 'portrait') {
      cameraControl.targetTheta = 1.29;
      cameraControl.targetDistance = window.innerWidth < 700 ? 14.8 : 10.8;
      cameraControl.targetHeight = 1.72;
    }
    document.querySelectorAll('.view-button').forEach(function (button) { button.classList.toggle('active', button.dataset.view === view); });
    document.getElementById('annotation').classList.toggle('visible', view === 'profile');
  }

  function updateCamera(dt) {
    const blend = 1 - Math.pow(0.002, Math.min(dt, 0.05));
    cameraControl.theta += (cameraControl.targetTheta - cameraControl.theta) * blend;
    cameraControl.distance += (cameraControl.targetDistance - cameraControl.distance) * blend;
    cameraControl.height += (cameraControl.targetHeight - cameraControl.height) * blend;
    const theta = cameraControl.theta + path.heading;
    const horizontal = cameraControl.distance;
    const offset = new THREE.Vector3(Math.sin(theta) * horizontal, cameraControl.height, Math.cos(theta) * horizontal);
    const target = new THREE.Vector3(path.x, 2.57, path.z);
    // On wide screens the composition leaves quiet space for the editorial typography.
    if (window.innerWidth > 1000) {
      const right = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
      const shift = right.multiplyScalar(-0.60);
      target.add(shift);
      offset.add(shift);
    } else if (window.innerWidth < 700) {
      const forward = new THREE.Vector3(Math.cos(path.heading), 0, -Math.sin(path.heading)).multiplyScalar(0.65);
      target.add(forward);
      offset.add(forward);
    }
    camera.position.set(path.x + offset.x, 2.57 + offset.y, path.z + offset.z);
    camera.lookAt(target);
    sky.position.copy(camera.position);
  }

  canvas.addEventListener('pointerdown', function (event) {
    cameraControl.dragging = true;
    cameraControl.lastX = event.clientX;
    cameraControl.lastY = event.clientY;
    cameraControl.moved = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!cameraControl.dragging) return;
    const dx = event.clientX - cameraControl.lastX;
    const dy = event.clientY - cameraControl.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 1 && cameraControl.view !== 'free') setView('free');
    cameraControl.targetTheta -= dx * 0.005;
    cameraControl.targetHeight = clamp(cameraControl.targetHeight + dy * 0.012, -0.5, 6.5);
    cameraControl.lastX = event.clientX;
    cameraControl.lastY = event.clientY;
  });
  function stopDrag(event) {
    cameraControl.dragging = false;
    canvas.classList.remove('dragging');
    if (event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
  canvas.addEventListener('wheel', function (event) {
    event.preventDefault();
    cameraControl.targetDistance = clamp(cameraControl.targetDistance + event.deltaY * 0.009, 6.2, 18);
  }, { passive: false });

  document.querySelectorAll('.view-button').forEach(function (button) { button.addEventListener('click', function () { setView(button.dataset.view); }); });
  const playButton = document.getElementById('playButton');
  const pauseIcon = document.getElementById('pauseIcon');
  const playIcon = document.getElementById('playIcon');
  function syncPlayButton() {
    pauseIcon.hidden = !playing;
    playIcon.hidden = playing;
    // SVGElement.hidden is not consistently implemented in older browsers.
    pauseIcon.style.display = playing ? '' : 'none';
    playIcon.style.display = playing ? 'none' : '';
    playButton.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
  }
  function togglePlaying() { playing = !playing; syncPlayButton(); }
  playButton.addEventListener('click', togglePlaying);
  syncPlayButton();
  const speedInput = document.getElementById('speed');
  speedInput.addEventListener('input', function () {
    speed = Number(speedInput.value);
    document.getElementById('speedValue').textContent = speed.toFixed(1) + '×';
    const fill = (speed - 0.5) * 100;
    speedInput.style.background = 'linear-gradient(to right,var(--accent) ' + fill + '%,rgba(44,47,37,.2) ' + fill + '%)';
  });
  function resetView() { setView('profile'); }
  document.getElementById('resetButton').addEventListener('click', resetView);
  document.getElementById('brand').addEventListener('click', function (event) { event.preventDefault(); resetView(); });
  const notes = document.getElementById('fieldNotes');
  document.getElementById('aboutButton').addEventListener('click', function () { notes.hidden = !notes.hidden; });
  document.getElementById('closeNotes').addEventListener('click', function () { notes.hidden = true; });
  window.addEventListener('keydown', function (event) {
    if (event.code === 'Space' && event.target.tagName !== 'INPUT') { event.preventDefault(); togglePlaying(); }
    if (event.key === 'Escape') notes.hidden = true;
    if (event.key === '1') setView('profile');
    if (event.key === '2') setView('portrait');
    if (event.key === '3') setView('free');
  });

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (cameraControl.view !== 'free') setView(cameraControl.view);
  });
  document.addEventListener('visibilitychange', function () { clock.getDelta(); });

  // Three r128 expects material colors in linear space when using an sRGB renderer.
  const linearMaterials = new Set();
  scene.traverse(function (object) {
    const material = object.material;
    if (material && material.color && !linearMaterials.has(material)) {
      material.color.convertSRGBToLinear();
      linearMaterials.add(material);
    }
  });

  setView('profile');
  updateGiraffe(0);
  updateCamera(1);
  renderer.render(scene, camera);
  requestAnimationFrame(function () { loading.classList.add('loaded'); });
  setTimeout(function () { document.getElementById('annotation').classList.add('visible'); }, 2200);

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.045);
    updateGiraffe(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }
  animate();

  // A small read-only hook makes offline browser validation possible.
  window.fieldStudy = {
    get ready() { return true; },
    get playing() { return playing; },
    get speed() { return speed; },
    get view() { return cameraControl.view; },
    get gaitPhase() { return wrap01(gaitTime / cycleDuration); },
    get rendererInfo() { return renderer.info; }
  };
}());
