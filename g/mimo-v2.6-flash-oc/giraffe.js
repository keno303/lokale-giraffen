/* ============================================================================
   Walking Giraffe — procedural Three.js scene
   Runs from file:// with a vendored UMD build of three.js (r149).
   Everything (geometry, coat texture, landscape) is generated at runtime.
   ========================================================================== */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var V3 = THREE.Vector3;

  /* ------------------------------------------------------------------ *
   *  Utilities
   * ------------------------------------------------------------------ */

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function easeInOutQuad(t) { t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* Build a tapered tube along a polyline.
     pts: [[x,y,z, rx, ry], ...]  where rx/ry are the cross-section radii
     along the local "side" and "up" axes derived from `opt.up`. */
  function makeTube(pts, opt) {
    opt = opt || {};
    var radial = opt.radial || 24;
    var upHint = (opt.up ? opt.up.clone() : new V3(0, 0, 1));
    var uScale = opt.uScale === undefined ? 1 : opt.uScale;
    var vScale = opt.vScale === undefined ? 1 : opt.vScale;
    var capStart = !!opt.capStart, capEnd = !!opt.capEnd;
    var n = pts.length, i, j;

    var P = [], R = [];
    for (i = 0; i < n; i++) {
      P.push(new V3(pts[i][0], pts[i][1], pts[i][2]));
      R.push([pts[i][3] === undefined ? 0.1 : pts[i][3], pts[i][4] === undefined ? 0.1 : pts[i][4]]);
    }

    // tangents
    var T = [];
    for (i = 0; i < n; i++) {
      var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      var t = new V3().subVectors(b, a);
      if (t.lengthSq() < 1e-12) t.set(0, -1, 0);
      t.normalize(); T.push(t);
    }

    var rings = [];
    for (i = 0; i < n; i++) {
      var t = T[i];
      var ref = upHint;
      if (Math.abs(t.dot(ref)) > 0.985) ref = Math.abs(t.dot(new V3(0, 1, 0))) > 0.985 ? new V3(0, 0, 1) : new V3(0, 1, 0);
      var side = new V3().crossVectors(t, ref).normalize();   // lateral
      var up = new V3().crossVectors(side, t).normalize();    // "up" in section
      var ring = [];
      for (j = 0; j <= radial; j++) {
        var th = (j / radial) * TAU;
        var c = Math.cos(th), s = Math.sin(th);
        ring.push(new V3(
          P[i].x + side.x * c * R[i][0] + up.x * s * R[i][1],
          P[i].y + side.y * c * R[i][0] + up.y * s * R[i][1],
          P[i].z + side.z * c * R[i][0] + up.z * s * R[i][1]
        ));
      }
      rings.push(ring);
    }

    // arc length for V coordinate
    var arc = [0];
    for (i = 1; i < n; i++) arc.push(arc[i - 1] + P[i].distanceTo(P[i - 1]));

    var pos = [], uv = [], idx = [];
    for (i = 0; i < n; i++) {
      for (j = 0; j <= radial; j++) {
        var p = rings[i][j];
        pos.push(p.x, p.y, p.z);
        uv.push((j / radial) * uScale, (arc[i] / Math.max(1e-6, arc[n - 1])) * vScale * (opt.vRepeat || 1) + (opt.vOffset || 0));
      }
    }
    var stride = radial + 1;
    for (i = 0; i < n - 1; i++) {
      for (j = 0; j < radial; j++) {
        var a0 = i * stride + j, b0 = a0 + 1, c0 = a0 + stride, d0 = c0 + 1;
        idx.push(a0, c0, b0, b0, c0, d0);
      }
    }

    // caps (fan)
    function addCap(center, ringIdx, flip) {
      var ci = pos.length / 3;
      pos.push(center.x, center.y, center.z); uv.push(0.5, flip ? 0 : 1);
      for (var j = 0; j < radial; j++) {
        var v = ringIdx * stride + j;
        if (flip) idx.push(ci, v + 1, v); else idx.push(ci, v, v + 1);
      }
    }
    if (capStart) addCap(P[0], 0, true);
    if (capEnd) addCap(P[n - 1], n - 1, false);

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();

    // merge normals across the UV seam so the seam is not visible
    var nrm = g.attributes.normal;
    for (i = 0; i < n; i++) {
      var i0 = i * stride, i1 = i * stride + radial;
      var nx = (nrm.getX(i0) + nrm.getX(i1)) * 0.5,
          ny = (nrm.getY(i0) + nrm.getY(i1)) * 0.5,
          nz = (nrm.getZ(i0) + nrm.getZ(i1)) * 0.5;
      nrm.setXYZ(i0, nx, ny, nz); nrm.setXYZ(i1, nx, ny, nz);
    }
    nrm.needsUpdate = true;
    return g;
  }

  /* Sample a polyline of [x,y,z,rx,ry] with Catmull-Rom-ish smoothing to
     build a denser profile (used for the neck / torso / limbs). */
  function resample(pts, times) {
    var out = [];
    var n = pts.length;
    function at(t) {                       // t in [0, n-1]
      var i = clamp(Math.floor(t), 0, n - 2);
      var f = t - i;
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      var o = [];
      for (var k = 0; k < 5; k++) {
        var a = p0[k], b = p1[k], c = p2[k], d = p3[k];
        o[k] = 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
      }
      return o;
    }
    for (var i = 0; i < times; i++) out.push(at((i / (times - 1)) * (n - 1)));
    return out;
  }

  /* Vertex-colour tint: lighten/darken where the surface faces `dir`. */
  function tintByNormal(geo, dir, color, strength, bias) {
    var nor = geo.attributes.normal, col = new Float32Array(nor.count * 3);
    var d = dir.clone().normalize(), c = new THREE.Color(color);
    var hasCol = geo.attributes.color;
    for (var i = 0; i < nor.count; i++) {
      var base = 1, g = 1, b = 1;
      if (hasCol) { base = hasCol.getX(i); g = hasCol.getY(i); b = hasCol.getZ(i); }
      var f = clamp((dotN(nor, i, d) + (bias || 0)) * strength, 0, 1);
      f = smoothstep(f);
      col[i * 3] = lerp(base, c.r, f);
      col[i * 3 + 1] = lerp(g, c.g, f);
      col[i * 3 + 2] = lerp(b, c.b, f);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
    function dotN(a, i, d) { return a.getX(i) * d.x + a.getY(i) * d.y + a.getZ(i) * d.z; }
  }

  /* ------------------------------------------------------------------ *
   *  Procedural textures
   * ------------------------------------------------------------------ */

  /* Reticulated giraffe coat: toroidal Voronoi cells, inset, warm browns. */
  function makeCoatTexture(size) {
    size = size || 1024;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d');

    g.fillStyle = '#e9dfc5';
    g.fillRect(0, 0, size, size);

    // seeds on a jittered grid
    var cols = 10, rows = 10, seeds = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        seeds.push([
          (c + 0.5 + rand(-0.36, 0.36)) * size / cols,
          (r + 0.5 + rand(-0.36, 0.36)) * size / rows
        ]);
      }
    }

    // toroidal half-plane clipping (Sutherland–Hodgman)
    function clip(poly, ax, ay, bx, by) {           // keep side closer to a than b
      var mx = (ax + bx) / 2, my = (ay + by) / 2;
      var dx = bx - ax, dy = by - ay;
      function f(p) { return (p[0] - mx) * dx + (p[1] - my) * dy; }  // <0 → nearer a
      var out = [];
      for (var i = 0; i < poly.length; i++) {
        var P = poly[i], Q = poly[(i + 1) % poly.length];
        var fp = f(P), fq = f(Q);
        if (fp <= 0) out.push(P);
        if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
          var t = fp / (fp - fq);
          out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
        }
      }
      return out;
    }

    var browns = ['#8a4d26', '#9c5a2b', '#77421f', '#a5652f', '#8d5123', '#7f471f', '#9a5d28'];
    for (var s = 0; s < seeds.length; s++) {
      var poly = [[0, 0], [size, 0], [size, size], [0, size]];
      var A = seeds[s];
      for (var o = -1; o <= 1; o++) {
        for (var p = -1; p <= 1; p++) {
          for (var t = 0; t < seeds.length; t++) {
            if (t === s) continue;
            var B = [seeds[t][0] + o * size, seeds[t][1] + p * size];
            if (Math.abs(B[0] - A[0]) > size * 0.75 || Math.abs(B[1] - A[1]) > size * 0.75) continue;
            poly = clip(poly, A[0], A[1], B[0], B[1]);
            if (poly.length < 3) break;
          }
          if (poly.length < 3) break;
        }
        if (poly.length < 3) break;
      }
      if (poly.length < 3) continue;

      // inset toward centroid → the cream "mortar" between patches
      var cx = 0, cy = 0, i2;
      for (i2 = 0; i2 < poly.length; i2++) { cx += poly[i2][0]; cy += poly[i2][1]; }
      cx /= poly.length; cy /= poly.length;
      var inset = rand(0.87, 0.94);
      var q = [];
      for (i2 = 0; i2 < poly.length; i2++) {
        var wi = clamp(inset * rand(0.9, 1.12), 0.6, 0.99);   // wobble → organic, non-polygonal edges
        q.push([cx + (poly[i2][0] - cx) * wi, cy + (poly[i2][1] - cy) * wi]);
      }

      g.beginPath();
      g.moveTo(q[0][0], q[0][1]);
      for (i2 = 1; i2 < q.length; i2++) g.lineTo(q[i2][0], q[i2][1]);
      g.closePath();
      var col = browns[(Math.random() * browns.length) | 0];
      g.fillStyle = col;
      g.globalAlpha = rand(0.88, 1);
      g.fill();
      g.globalAlpha = 0.35;
      g.strokeStyle = 'rgba(60,30,12,1)';
      g.lineWidth = 3;
      g.stroke();
      g.globalAlpha = 1;

      // mottling inside the patch
      g.save();
      g.clip();
      for (var m = 0; m < 4; m++) {
        var mx = cx + rand(-0.3, 0.3) * size / cols, my = cy + rand(-0.3, 0.3) * size / rows;
        var rad = rand(size / cols * 0.15, size / cols * 0.4);
        var grd = g.createRadialGradient(mx, my, 0, mx, my, rad);
        grd.addColorStop(0, Math.random() < 0.5 ? 'rgba(60,30,10,0.30)' : 'rgba(235,200,150,0.26)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.fillRect(mx - rad, my - rad, rad * 2, rad * 2);
      }
      g.restore();
    }

    // fine grain over the whole hide
    var img = g.getImageData(0, 0, size, size), d = img.data;
    for (var k = 0; k < d.length; k += 4) {
      var nz = (Math.random() - 0.5) * 14;
      d[k] = clamp(d[k] + nz, 0, 255);
      d[k + 1] = clamp(d[k + 1] + nz, 0, 255);
      d[k + 2] = clamp(d[k + 2] + nz, 0, 255);
    }
    g.putImageData(img, 0, 0);

    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* Dry savannah ground. */
  function makeGroundTexture(size) {
    size = size || 512;
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d');
    g.fillStyle = '#a89a63';
    g.fillRect(0, 0, size, size);

    var blobs = [['#8f9a55', 0.34], ['#bcae7a', 0.3], ['#9c8f5c', 0.3], ['#7d8a4b', 0.24], ['#c2b184', 0.26]];
    function blobAt(x, y, r, style, alpha) {
      var grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, style);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = alpha;
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (var i = 0; i < 170; i++) {
      var x = Math.random() * size, y = Math.random() * size, r = rand(size * 0.02, size * 0.1);
      var b = blobs[(Math.random() * blobs.length) | 0];
      var al = b[1] * rand(0.5, 1);
      for (var ox = -1; ox <= 1; ox++)                 // wrap across the tile edges
        for (var oy = -1; oy <= 1; oy++)
          blobAt(x + ox * size, y + oy * size, r, b[0], al);
    }
    g.globalAlpha = 1;

    // speckle / dry grass strokes (wrapped when near an edge)
    function edgeOffsets(x, y, m) {
      var out = [[0, 0]];
      if (x < m) out.push([size, 0]); if (x > size - m) out.push([-size, 0]);
      if (y < m) out.push([0, size]); if (y > size - m) out.push([0, -size]);
      if (x < m && y < m) out.push([size, size]);
      if (x > size - m && y < m) out.push([-size, size]);
      if (x < m && y > size - m) out.push([size, -size]);
      if (x > size - m && y > size - m) out.push([-size, -size]);
      return out;
    }
    for (var s = 0; s < 4200; s++) {
      var sx = Math.random() * size, sy = Math.random() * size;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(70,74,40,0.18)' : 'rgba(220,210,170,0.16)';
      var w = rand(1, 2.5), h2 = rand(1, 2.5), ofs = edgeOffsets(sx, sy, 3);
      for (var oi = 0; oi < ofs.length; oi++) g.fillRect(sx + ofs[oi][0], sy + ofs[oi][1], w, h2);
    }
    for (var t = 0; t < 900; t++) {
      var tx = Math.random() * size, ty = Math.random() * size, h = rand(4, 11);
      var lean = rand(-3, 3), ofs2 = edgeOffsets(tx, ty, 12);
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(96,104,54,0.3)' : 'rgba(180,168,110,0.3)';
      g.lineWidth = 1;
      for (var oj = 0; oj < ofs2.length; oj++) {
        g.beginPath();
        g.moveTo(tx + ofs2[oj][0], ty + ofs2[oj][1]);
        g.lineTo(tx + ofs2[oj][0] + lean, ty + ofs2[oj][1] - h);
        g.stroke();
      }
    }

    var tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  /* ------------------------------------------------------------------ *
   *  Renderer / scene / lights
   * ------------------------------------------------------------------ */

  var app = document.getElementById('app');
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
  app.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var HORIZON = new THREE.Color(0xcfd9e0);
  scene.fog = new THREE.Fog(HORIZON.getHex(), 70, 330);

  var camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 1200);
  camera.position.set(7.5, 4.2, -6.5);

  var sunDir = new THREE.Vector3(-0.36, 0.86, 0.37).normalize();

  var sun = new THREE.DirectionalLight(0xfff1d4, 1.85);
  sun.position.copy(sunDir).multiplyScalar(30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -6;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.022;
  scene.add(sun);
  scene.add(sun.target);

  scene.add(new THREE.HemisphereLight(0xbcd7f2, 0x8a7a4e, 0.62));
  var fill = new THREE.DirectionalLight(0x9fc0e8, 0.3);
  fill.position.set(6, 5, -8);
  scene.add(fill);

  /* Sky dome with a soft sun disc. */
  (function buildSky() {
    var geo = new THREE.SphereGeometry(600, 32, 20);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3f7fd0) },
        mid: { value: new THREE.Color(0x9fc4e8) },
        bot: { value: new THREE.Color(0xe6e9e2) },
        sunDir: { value: sunDir.clone() }
      },
      vertexShader:
        'varying vec3 vDir;\n' +
        'void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'varying vec3 vDir; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir;\n' +
        'void main(){\n' +
        '  float h = clamp(vDir.y*0.5+0.5, 0.0, 1.0);\n' +
        '  vec3 c = mix(bot, mid, smoothstep(0.48, 0.60, h));\n' +
        '  c = mix(c, top, smoothstep(0.60, 0.95, h));\n' +
        '  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);\n' +
        '  c += vec3(1.0,0.92,0.75) * (pow(s, 220.0)*0.9 + pow(s, 14.0)*0.16);\n' +
        '  gl_FragColor = vec4(c, 1.0);\n' +
        '}'
    });
    var sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    scene.add(sky);
    scene.userData.sky = sky;
  })();

  /* Soft contact shadow that anchors the animal to the ground. */
  var contactTex = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var x = c.getContext('2d');
    var gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.62)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0.34)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  var contact = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 7.2),
    new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, opacity: 0.5 })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.015;
  contact.renderOrder = 1;
  scene.add(contact);

  /* Ground plane (follows the animal, snapped to the texture period). */
  var groundTex = makeGroundTexture(512);
  groundTex.repeat.set(200, 200);
  var ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200, 1, 1),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0, color: 0xffffff })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  /* ------------------------------------------------------------------ *
   *  Landscape: acacia trees, bushes, rocks, grass tufts, distant hills
   * ------------------------------------------------------------------ */

  var barkMat = new THREE.MeshStandardMaterial({ color: 0x3d3125, roughness: 1 });
  var leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x3f4d26, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x4b5a2d, roughness: 1, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x35411f, roughness: 1, flatShading: true })
  ];
  var rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6459, roughness: 1, flatShading: true });

  var recyclable = [];   // {obj, span, offset}

  function makeAcacia() {
    var g = new THREE.Group();
    var h = rand(3.2, 5.4);
    var trunk = new THREE.Mesh(makeTube([
      [0, 0, 0, 0.20, 0.20],
      [rand(-0.1, 0.1), h * 0.3, rand(-0.1, 0.1), 0.15, 0.15],
      [rand(-0.2, 0.2), h * 0.62, rand(-0.15, 0.15), 0.11, 0.11],
      [0, h * 0.86, 0, 0.08, 0.08],
      [0, h, 0, 0.05, 0.05]
    ], { radial: 8, up: new V3(0, 0, 1), capEnd: true }), barkMat);
    trunk.castShadow = true;
    g.add(trunk);

    // a couple of limbs
    for (var b = 0; b < 3; b++) {
      var a = rand(0, TAU), len = rand(0.8, 1.6), y0 = h * rand(0.55, 0.8);
      var limb = new THREE.Mesh(makeTube([
        [0, 0, 0, 0.07, 0.07],
        [Math.cos(a) * len * 0.5, len * 0.5, Math.sin(a) * len * 0.5, 0.05, 0.05],
        [Math.cos(a) * len, len * 0.95, Math.sin(a) * len, 0.03, 0.03]
      ], { radial: 6, up: new V3(0, 0, 1), capEnd: true }), barkMat);
      limb.position.y = y0;
      limb.castShadow = true;
      g.add(limb);
    }

    // flat, spreading umbrella canopy — one big core plus an overlapping ring
    var core = new THREE.Mesh(new THREE.SphereGeometry(rand(1.9, 2.5), 12, 8), leafMats[0]);
    core.position.y = h + 0.1;
    core.scale.set(1, 0.19, 1);
    core.castShadow = true;
    g.add(core);
    var nBlob = 6 + ((Math.random() * 3) | 0);
    for (var i = 0; i < nBlob; i++) {
      var r = rand(1.2, 1.9);
      var blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 7), leafMats[(Math.random() * leafMats.length) | 0]);
      var a2 = (i / nBlob) * TAU + rand(-0.3, 0.3);
      var d2 = rand(1.0, 2.1);
      blob.position.set(Math.cos(a2) * d2, h + rand(-0.1, 0.3) - d2 * 0.1, Math.sin(a2) * d2);
      blob.scale.set(1, rand(0.15, 0.22), 1);
      blob.castShadow = true;
      blob.receiveShadow = true;
      g.add(blob);
    }
    return g;
  }

  function makeBush() {
    var g = new THREE.Group();
    var n = 2 + ((Math.random() * 3) | 0);
    for (var i = 0; i < n; i++) {
      var r = rand(0.35, 0.8);
      var m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), leafMats[(Math.random() * leafMats.length) | 0]);
      m.position.set(rand(-0.5, 0.5), r * rand(0.4, 0.7), rand(-0.5, 0.5));
      m.scale.set(1, rand(0.55, 0.85), 1);
      m.castShadow = true;
      g.add(m);
    }
    return g;
  }

  function makeRock() {
    var geo = new THREE.IcosahedronGeometry(rand(0.25, 0.9), 1);
    var p = geo.attributes.position;
    for (var i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) * rand(0.85, 1.15), p.getY(i) * rand(0.6, 1.0), p.getZ(i) * rand(0.85, 1.15));
    }
    geo.computeVertexNormals();
    var m = new THREE.Mesh(geo, rockMat);
    m.scale.y = rand(0.5, 0.9);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  function tuftMaterial() {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rand(0.16, 0.22), rand(0.25, 0.45), rand(0.28, 0.42)), roughness: 1 });
  }

  var CORRIDOR = 420;          // length of the recycled scenery strip
  function addScenery() {
    var i, o;
    function place(obj, x, z, span, off) {
      obj.position.set(x, 0, z);
      scene.add(obj);
      recyclable.push({ obj: obj, span: span, off: off });
    }
    var Z0 = -150;                              // scenery also behind the start
    for (i = 0; i < 58; i++) {           // trees
      var side = Math.random() < 0.5 ? -1 : 1;
      var x = side * rand(9, 55);
      o = makeAcacia();
      o.rotation.y = rand(0, TAU);
      var sc = rand(0.75, 1.35);
      o.scale.setScalar(sc);
      place(o, x, rand(Z0, CORRIDOR), CORRIDOR, 0);
    }
    for (i = 0; i < 46; i++) {           // bushes
      var s2 = Math.random() < 0.5 ? -1 : 1;
      o = makeBush();
      o.rotation.y = rand(0, TAU);
      place(o, s2 * rand(4.5, 40), rand(Z0, CORRIDOR), CORRIDOR, 0);
    }
    for (i = 0; i < 46; i++) {           // rocks
      var s3 = Math.random() < 0.5 ? -1 : 1;
      o = makeRock();
      o.rotation.y = rand(0, TAU);
      place(o, s3 * rand(3.5, 45), rand(Z0, CORRIDOR), CORRIDOR, 0);
    }
    for (i = 0; i < 170; i++) {          // grass tufts
      var s4 = Math.random() < 0.5 ? -1 : 1;
      o = new THREE.Mesh(new THREE.ConeGeometry(rand(0.06, 0.16), rand(0.25, 0.6), 5, 1), tuftMaterial());
      o.castShadow = false;
      place(o, s4 * rand(2.2, 26), rand(Z0, CORRIDOR), CORRIDOR, 0);
    }
    for (i = 0; i < 10; i++) {            // distant hills
      var s5 = Math.random() < 0.5 ? -1 : 1;
      o = new THREE.Mesh(new THREE.SphereGeometry(rand(30, 70), 16, 10),
        new THREE.MeshStandardMaterial({ color: 0x77805f, roughness: 1 }));
      o.scale.y = rand(0.10, 0.18);
      place(o, s5 * rand(155, 330), rand(Z0, CORRIDOR), CORRIDOR, 0);
      o.position.y = -rand(6, 14);
    }
  }
  addScenery();

  /* ------------------------------------------------------------------ *
   *  Materials
   * ------------------------------------------------------------------ */

  var coatTex = makeCoatTexture(1024);
  coatTex.repeat.set(1, 1);

  var MAT = {
    coat: new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.82, metalness: 0.0 }),
    coatVC: new THREE.MeshStandardMaterial({ map: coatTex, roughness: 0.82, metalness: 0.0, vertexColors: true }),
    plain: new THREE.MeshStandardMaterial({ color: 0xd9c39a, roughness: 0.85 }),
    mane: new THREE.MeshStandardMaterial({ color: 0x241a10, roughness: 1.0, side: THREE.DoubleSide }),
    hoof: new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.5, metalness: 0.08 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x1a1109, roughness: 0.18, metalness: 0.0 }),
    glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b211a, roughness: 0.8 }),
    lash: new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.9, side: THREE.DoubleSide })
  };

  function mesh(geo, mat, parent, castShadow) {
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = castShadow !== false;
    m.receiveShadow = false;
    if (parent) parent.add(m);
    return m;
  }

  /* Rectangular "blade" along a profile — used for the mane / dorsal crest.
     pts: [[x,y,z,rx,ry], ...]; grows along the surface normal. */
  function makeMane(pts, opt) {
    opt = opt || {};
    var halfW = opt.halfW === undefined ? 0.035 : opt.halfW;
    var height = opt.height || 0.07;
    var upHint = (opt.up ? opt.up.clone() : new V3(0, 0, 1));
    var n = pts.length, i, j;
    var P = [], R = [];
    for (i = 0; i < n; i++) { P.push(new V3(pts[i][0], pts[i][1], pts[i][2])); R.push([pts[i][3], pts[i][4]]); }

    var sections = [];
    for (i = 0; i < n; i++) {
      var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      var t = new V3().subVectors(b, a).normalize();
      var ref = upHint;
      if (Math.abs(t.dot(ref)) > 0.985) ref = new V3(0, 1, 0);
      var side = new V3().crossVectors(t, ref).normalize();     // lateral
      var up = new V3().crossVectors(side, t).normalize();      // points "outward"
      // the mane sits on the rear/top of the neck: pick the normal with +upHint bias
      if (up.dot(ref) < 0) up.negate();
      var surf = P[i].clone().addScaledVector(up, R[i][1] * 0.88);
      var h = height * (opt.taper ? lerp(1, 0.7, i / (n - 1)) : 1);
      var tip = surf.clone().addScaledVector(up, h);
      sections.push({ s: surf, t: tip, side: side });
    }

    var pos = [], idx = [];
    for (i = 0; i < sections.length; i++) {
      var S = sections[i];
      pos.push(
        S.s.x - S.side.x * halfW, S.s.y - S.side.y * halfW, S.s.z - S.side.z * halfW,
        S.s.x + S.side.x * halfW, S.s.y + S.side.y * halfW, S.s.z + S.side.z * halfW,
        S.t.x - S.side.x * halfW * 0.55, S.t.y - S.side.y * halfW * 0.55, S.t.z - S.side.z * halfW * 0.55,
        S.t.x + S.side.x * halfW * 0.55, S.t.y + S.side.y * halfW * 0.55, S.t.z + S.side.z * halfW * 0.55
      );
    }
    for (i = 0; i < sections.length - 1; i++) {
      var b0 = i * 4, b1 = b0 + 4;
      // bottom, top, left, right faces
      idx.push(b0, b1, b0 + 1, b0 + 1, b1, b1 + 1);
      idx.push(b0 + 2, b0 + 3, b1 + 2, b0 + 3, b1 + 3, b1 + 2);
      idx.push(b0, b0 + 2, b1, b0 + 2, b1 + 2, b1);
      idx.push(b0 + 1, b1 + 1, b0 + 3, b0 + 3, b1 + 1, b1 + 3);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g = g.toNonIndexed();          // flat shading: a mane is a crisp blade, not a tube
    g.computeVertexNormals();
    return g;
  }

  /* ------------------------------------------------------------------ *
   *  The giraffe
   * ------------------------------------------------------------------ */

  var giraffe = new THREE.Group();          // root: yaw + forward motion
  var body = new THREE.Group();             // bob / roll / pitch
  giraffe.add(body);
  scene.add(giraffe);

  /* ---- torso ------------------------------------------------------- */
  var TORSO_PROFILE = [
    [0, 2.62, 1.30, 0.13, 0.17],
    [0, 2.63, 1.18, 0.25, 0.35],
    [0, 2.65, 1.02, 0.32, 0.50],
    [0, 2.67, 0.86, 0.34, 0.55],
    [0, 2.68, 0.66, 0.33, 0.575],
    [0, 2.68, 0.40, 0.31, 0.555],
    [0, 2.66, 0.10, 0.29, 0.52],
    [0, 2.64, -0.20, 0.28, 0.49],
    [0, 2.65, -0.50, 0.29, 0.50],
    [0, 2.68, -0.78, 0.32, 0.54],
    [0, 2.70, -1.00, 0.30, 0.52],
    [0, 2.70, -1.16, 0.22, 0.40],
    [0, 2.68, -1.30, 0.11, 0.19]
  ];
  var torsoGeo = makeTube(resample(TORSO_PROFILE, 34), {
    radial: 34, up: new V3(0, 1, 0), uScale: 1.1, vScale: 1.3, capStart: true, capEnd: true
  });
  tintByNormal(torsoGeo, new V3(0, -1, 0), 0xf1e9d6, 0.8, 0.12);
  var torso = mesh(torsoGeo, MAT.coatVC, body);
  torso.name = 'torso';

  // dorsal crest: withers → rump
  (function () {
    var pts = [];
    for (var i = 1; i < TORSO_PROFILE.length - 1; i++) {
      var p = TORSO_PROFILE[i];
      pts.push([0, p[1] + p[4], p[2], 0.05, 0.05]);
    }
    var crest = mesh(makeMane(resample(pts, 18), { up: new V3(0, 1, 0), halfW: 0.045, height: 0.055, taper: true }), MAT.mane, body);
    crest.castShadow = true;
  })();

  // subtle shoulder & haunch masses (baked into the silhouette via extra shells)
  (function () {
    var sh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 16), MAT.coat);
    sh.scale.set(0.84, 1.12, 1.25);
    sh.position.set(0, 2.84, 0.72);
    sh.castShadow = true;
    body.add(sh);
    var ha = new THREE.Mesh(new THREE.SphereGeometry(0.44, 20, 16), MAT.coat);
    ha.scale.set(0.82, 1.05, 1.15);
    ha.position.set(0, 2.80, -0.86);
    ha.castShadow = true;
    body.add(ha);
  })();

  /* ---- neck -------------------------------------------------------- */
  var NECK_LOWER = [
    [0, 0.00, 0.00, 0.275, 0.30],
    [0, 0.26, 0.16, 0.255, 0.275],
    [0, 0.52, 0.32, 0.230, 0.25],
    [0, 0.79, 0.49, 0.205, 0.22],
    [0, 1.05, 0.66, 0.185, 0.20]
  ];
  /* Upper segment lives in a frame already tilted by NECK_TILT, so its
     profile must start straight up in LOCAL space — otherwise the tilt
     is applied twice and the two neck tubes open a wedge. */
  var NECK_UPPER = [
    [0, -0.10, 0.000, 0.168, 0.180],   // hidden inside the lower tube (seal)
    [0, 0.00, 0.000, 0.185, 0.200],    // joint ring — must coincide with the lower tube's end
    [0, 0.26, 0.000, 0.177, 0.191],
    [0, 0.52, -0.015, 0.168, 0.181],
    [0, 0.76, -0.050, 0.157, 0.168],
    [0, 0.92, -0.090, 0.147, 0.155]
  ];

  var neckLower = new THREE.Group();
  neckLower.position.set(0, 3.00, 0.92);
  body.add(neckLower);

  var nlPts = resample(NECK_LOWER, 22);
  var neckLowerMesh = mesh(makeTube(nlPts, { radial: 26, up: new V3(0, 0, 1), uScale: 0.86, vScale: 0.78 }), MAT.coat, neckLower);
  tintByNormal(neckLowerMesh.geometry, new V3(0, -0.45, 0.89), 0xf6efe0, 1.0, 0.1);
  neckLowerMesh.material = MAT.coatVC;
  mesh(makeMane(nlPts, { up: new V3(0, 0, -1), halfW: 0.032, height: 0.078 }), MAT.mane, neckLower);

  var NECK_TILT = Math.atan2(0.17, 0.26);             // lower tube's end tangent
  var neckUpper = new THREE.Group();
  neckUpper.position.set(0, 1.05, 0.66);
  neckUpper.rotation.x = NECK_TILT;
  neckLower.add(neckUpper);

  var nuPts = resample(NECK_UPPER, 20);
  var neckUpperMesh = mesh(makeTube(nuPts, { radial: 26, up: new V3(0, 0, 1), uScale: 0.86, vScale: 0.78 }), MAT.coat, neckUpper);
  tintByNormal(neckUpperMesh.geometry, new V3(0, -0.45, 0.89), 0xf6efe0, 1.0, 0.1);
  neckUpperMesh.material = MAT.coatVC;
  mesh(makeMane(nuPts, { up: new V3(0, 0, -1), halfW: 0.03, height: 0.07 }), MAT.mane, neckUpper);

  /* ---- head -------------------------------------------------------- */
  var head = new THREE.Group();
  head.position.set(0, 0.92, -0.09);
  head.rotation.x = -0.47;
  neckUpper.add(head);

  var HEAD_PROFILE = [
    /* rounded occiput: a dome centred on the neck joint so the neck tube's
       open rim is always swallowed by the skull (no see-through seams). */
    [0, 0.040, -0.160, 0.006, 0.006],
    [0, 0.040, -0.150, 0.055, 0.057],
    [0, 0.040, -0.125, 0.095, 0.098],
    [0, 0.040, -0.090, 0.127, 0.131],
    [0, 0.040, -0.045, 0.152, 0.157],
    [0, 0.043, 0.010, 0.160, 0.167],
    [0, 0.050, 0.075, 0.165, 0.174],
    [0, 0.055, 0.155, 0.159, 0.178],
    [0, 0.040, 0.27, 0.146, 0.168],
    [0, 0.010, 0.39, 0.120, 0.144],
    [0, -0.025, 0.52, 0.098, 0.118],
    [0, -0.045, 0.64, 0.088, 0.103],
    [0, -0.055, 0.73, 0.078, 0.088],
    [0, -0.060, 0.79, 0.030, 0.035]
  ];
  var headPts = resample(HEAD_PROFILE, 24);
  var skullGeo = makeTube(headPts, { radial: 26, up: new V3(0, 1, 0), uScale: 0.83, vScale: 0.75, capStart: true, capEnd: true });
  tintByNormal(skullGeo, new V3(0, -1, 0), 0xf3ead8, 1.0, 0.1);
  mesh(skullGeo, MAT.coatVC, head);

  // lower jaw / chin
  var jawGeo = makeTube(resample([
    [0, -0.02, 0.14, 0.10, 0.09],
    [0, -0.055, 0.30, 0.085, 0.08],
    [0, -0.08, 0.46, 0.068, 0.068],
    [0, -0.085, 0.60, 0.05, 0.052],
    [0, -0.08, 0.70, 0.016, 0.02]
  ], 16), { radial: 18, up: new V3(0, 1, 0), uScale: 0.7, vScale: 0.5, capStart: true, capEnd: true });
  tintByNormal(jawGeo, new V3(0, -1, 0), 0xf6efe2, 1.0, 0.0);
  mesh(jawGeo, MAT.coatVC, head);

  // mouth line
  (function () {
    for (var s = -1; s <= 1; s += 2) {
      var line = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.013, 0.30), MAT.dark);
      line.position.set(s * 0.062, -0.09, 0.52);
      line.rotation.x = -0.06;
      line.rotation.z = s * 0.1;
      head.add(line);
    }
  })();

  // nostrils
  for (var ns = -1; ns <= 1; ns += 2) {
    var nos = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), MAT.dark);
    nos.scale.set(0.55, 0.9, 1.6);
    nos.position.set(ns * 0.058, -0.03, 0.645);
    nos.rotation.z = ns * 0.35;
    head.add(nos);
  }

  // ossicones
  for (var os = -1; os <= 1; os += 2) {
    var oc = new THREE.Group();
    oc.position.set(os * 0.075, 0.175, 0.02);
    oc.rotation.z = -os * 0.12;
    oc.rotation.x = -0.12;
    head.add(oc);
    mesh(makeTube([
      [0, 0, 0, 0.036, 0.036],
      [0, 0.07, 0, 0.031, 0.031],
      [0, 0.13, -0.008, 0.03, 0.03],
      [0, 0.17, -0.012, 0.047, 0.047],
      [0, 0.195, -0.014, 0.036, 0.036]
    ], { radial: 12, up: new V3(0, 0, 1), capStart: true, capEnd: true }), MAT.coat, oc);
    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), MAT.mane);
    knob.position.set(0, 0.19, -0.014);
    knob.scale.y = 0.8;
    knob.castShadow = true;
    oc.add(knob);
  }

  // ears
  var ears = [];
  for (var es = -1; es <= 1; es += 2) {
    var ear = new THREE.Group();
    ear.position.set(es * 0.145, 0.115, -0.055);
    ear.rotation.z = -es * 0.78;
    ear.rotation.x = -0.62;
    head.add(ear);
    var earGeo = makeTube(resample([
      [0, 0, 0, 0.06, 0.032],
      [0, 0.10, 0.012, 0.10, 0.042],
      [0, 0.20, 0.018, 0.094, 0.033],
      [0, 0.28, 0.012, 0.058, 0.02],
      [0, 0.32, 0.0, 0.013, 0.006]
    ], 16), { radial: 14, up: new V3(0, 0, 1), uScale: 0.5, vScale: 0.45, capStart: true, capEnd: true });
    tintByNormal(earGeo, new V3(0, 0, 1), 0x6b5236, 0.8, 0.1);
    mesh(earGeo, MAT.coatVC, ear);
    ears.push(ear);
  }

  // eyes + lids + lashes
  var eyes = [], lids = [];
  for (var ys = -1; ys <= 1; ys += 2) {
    var eg = new THREE.Group();
    eg.position.set(ys * 0.126, 0.078, 0.21);
    eg.rotation.y = ys * Math.PI / 2;
    head.add(eg);

    var socket = new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 12), MAT.coat);
    socket.scale.set(1, 0.92, 0.8);
    socket.castShadow = true;
    eg.add(socket);

    var ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 16), MAT.eye);
    ball.position.z = 0.006;
    eg.add(ball);
    eyes.push(ball);

    var glint = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), MAT.glint);
    glint.position.set(0.017 * ys, 0.022, 0.056);
    eg.add(glint);

    // upper lid: hemisphere that rotates down over the eye
    var lidGeo = new THREE.SphereGeometry(0.066, 18, 12, 0, TAU, 0, Math.PI * 0.55);
    var lid = new THREE.Mesh(lidGeo, MAT.plain);
    lid.rotation.x = -1.15;                 // open
    lid.position.z = 0.006;
    eg.add(lid);
    lids.push(lid);

    // brow ridge
    var brow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), MAT.coat);
    brow.scale.set(1.05, 0.4, 0.72);
    brow.position.set(0, 0.074, 0.012);
    brow.castShadow = true;
    eg.add(brow);
  }

  /* ---- legs -------------------------------------------------------- */
  var LEG = {
    L1: 1.50,   // shoulder / hip → knee / hock
    L2: 1.30,   // knee / hock → fetlock
    hoof: 0.15  // fetlock → ground
  };

  var FRONT_UPPER = [
    [0, 0.00, 0.00, 0.175, 0.20],
    [0, -0.20, -0.03, 0.172, 0.202],
    [0, -0.45, -0.06, 0.145, 0.172],
    [0, -0.75, -0.05, 0.12, 0.138],
    [0, -1.05, -0.03, 0.098, 0.108],
    [0, -1.30, -0.01, 0.086, 0.092],
    [0, -1.50, 0.00, 0.08, 0.086]
  ];
  var FRONT_LOWER = [
    [0, 0.00, 0.00, 0.084, 0.09],
    [0, -0.10, 0.01, 0.098, 0.114],
    [0, -0.25, 0.00, 0.075, 0.084],
    [0, -0.60, 0.00, 0.062, 0.068],
    [0, -0.95, 0.00, 0.058, 0.062],
    [0, -1.10, 0.00, 0.074, 0.081],
    [0, -1.30, 0.00, 0.068, 0.074]
  ];
  var HIND_UPPER = [
    [0, 0.00, 0.00, 0.20, 0.225],
    [0, -0.25, 0.10, 0.235, 0.265],
    [0, -0.55, 0.11, 0.20, 0.23],
    [0, -0.90, 0.07, 0.14, 0.16],
    [0, -1.20, 0.03, 0.105, 0.118],
    [0, -1.50, 0.00, 0.09, 0.10]
  ];
  var HIND_LOWER = [
    [0, 0.00, 0.00, 0.094, 0.112],
    [0, -0.12, -0.02, 0.098, 0.118],
    [0, -0.30, 0.00, 0.072, 0.081],
    [0, -0.65, 0.00, 0.059, 0.067],
    [0, -1.00, 0.00, 0.056, 0.063],
    [0, -1.15, 0.00, 0.072, 0.079],
    [0, -1.30, 0.00, 0.066, 0.072]
  ];
  var HOOV = [
    [0, 0.00, 0.00, 0.075, 0.082],
    [0, -0.04, 0.086, 0.096],
    [0, -0.10, 0.09, 0.101],
    [0, -0.15, 0.092, 0.103]
  ];

  var legs = [];

  function buildLeg(cfg) {
    var root = new THREE.Group();
    root.position.set(cfg.x, cfg.y, cfg.z);
    body.add(root);

    var b1 = new THREE.Group();                 // upper
    root.add(b1);
    var upPts = resample(cfg.upper, 20);
    var upGeo = makeTube(upPts, { radial: 18, up: new V3(0, 0, 1), uScale: 0.8, vScale: 1.25, capStart: true, capEnd: false });
    tintByNormal(upGeo, new V3(cfg.inner, 0, 0), 0xf4ecdc, 0.85, 0.05);
    mesh(upGeo, MAT.coatVC, b1);

    var b2 = new THREE.Group();                 // lower
    b2.position.set(0, -LEG.L1, 0);
    b1.add(b2);
    var loPts = resample(cfg.lower, 20);
    var loGeo = makeTube(loPts, { radial: 16, up: new V3(0, 0, 1), uScale: 0.45, vScale: 1.3, capStart: true, capEnd: false });
    tintByNormal(loGeo, new V3(cfg.inner, 0, 0), 0xf6efe2, 1.0, 0.1);
    mesh(loGeo, MAT.coatVC, b2);

    var foot = new THREE.Group();               // hoof — kept vertical
    foot.position.set(0, -LEG.L2, 0);
    b2.add(foot);
    mesh(makeTube(resample(HOOV, 10), { radial: 16, up: new V3(0, 0, 1), capStart: true, capEnd: true }), MAT.hoof, foot);

    var leg = {
      root: root, b1: b1, b2: b2, foot: foot,
      hip: new V3(cfg.x, cfg.y, cfg.z),
      pole: new V3(0, 0, cfg.pole),            // knee/hock direction
      front: !!cfg.front,
      phase: cfg.phase,
      plant: new V3(),
      swing: new V3(),
      prevPhi: 0,
      side: cfg.x > 0 ? 1 : -1
    };
    legs.push(leg);
    return leg;
  }

  // lateral-sequence walk: LH → LF → RH → RF
  buildLeg({ x: -0.30, y: 2.82, z: -0.86, upper: HIND_UPPER, lower: HIND_LOWER, pole: -1, front: false, phase: 0.00, inner: 1 });
  buildLeg({ x: -0.30, y: 2.85, z: 0.72, upper: FRONT_UPPER, lower: FRONT_LOWER, pole: 1, front: true, phase: 0.25, inner: 1 });
  buildLeg({ x: 0.30, y: 2.82, z: -0.86, upper: HIND_UPPER, lower: HIND_LOWER, pole: -1, front: false, phase: 0.50, inner: -1 });
  buildLeg({ x: 0.30, y: 2.85, z: 0.72, upper: FRONT_UPPER, lower: FRONT_LOWER, pole: 1, front: true, phase: 0.75, inner: -1 });

  /* ---- tail -------------------------------------------------------- */
  var tail = new THREE.Group();
  tail.position.set(0, 2.92, -1.22);
  body.add(tail);
  var TAIL_PROFILE = [
    [0, 0.00, 0.00, 0.075, 0.075],
    [0, -0.22, -0.06, 0.055, 0.055],
    [0, -0.46, -0.10, 0.042, 0.042],
    [0, -0.70, -0.10, 0.034, 0.034],
    [0, -0.86, -0.07, 0.03, 0.03]
  ];
  var tailPts = resample(TAIL_PROFILE, 14);
  mesh(makeTube(tailPts, { radial: 12, up: new V3(0, 0, 1), uScale: 0.3, vScale: 0.5, capStart: true }), MAT.coat, tail);
  var tuft = new THREE.Group();
  tuft.position.set(0, -0.86, -0.07);
  tail.add(tuft);
  mesh(makeTube(resample([
    [0, 0.00, 0, 0.03, 0.03],
    [0, -0.10, -0.01, 0.062, 0.062],
    [0, -0.24, -0.02, 0.05, 0.05],
    [0, -0.36, -0.02, 0.012, 0.012]
  ], 12), { radial: 12, up: new V3(0, 0, 1), capStart: true, capEnd: true }), MAT.mane, tuft);
  for (var hs = 0; hs < 5; hs++) {
    var a = (hs / 5) * TAU;
    var hair = new THREE.Mesh(new THREE.ConeGeometry(0.016, rand(0.18, 0.3), 5), MAT.mane);
    hair.position.set(Math.cos(a) * 0.03, -0.32, Math.sin(a) * 0.03);
    hair.rotation.set(rand(-0.2, 0.2), 0, rand(-0.2, 0.2));
    tuft.add(hair);
  }

  /* ------------------------------------------------------------------ *
   *  Gait + inverse kinematics
   * ------------------------------------------------------------------ */

  var GAIT = {
    T: 1.62,          // seconds per full stride cycle
    duty: 0.625,      // fraction of the cycle each foot is planted
    stride: 1.95,     // metres travelled per cycle
    lift: 0.30        // peak hoof lift during swing
  };
  var SPEED = GAIT.stride / GAIT.T;
  var FWD = new V3(0, 0, 1);
  var A0 = GAIT.stride * GAIT.duty * 0.5;   // touchdown offset ahead of the hip

  var travel = 0;      // metres walked along +Z
  var gaitTime = 0;

  function frac(v) { return v - Math.floor(v); }

  function initPlants() {
    for (var i = 0; i < legs.length; i++) {
      var L = legs[i];
      var phi = frac(L.phase);
      L.plant.set(L.hip.x, LEG.hoof, L.hip.z + travel + A0 - GAIT.stride * phi);
      L.prevPhi = phi;
    }
  }

  function footTarget(L, phi, out) {
    if (phi < GAIT.duty) {                     // stance — pinned to the world
      out.copy(L.plant);
    } else {                                   // swing — arc to the next plant
      var q = (phi - GAIT.duty) / (1 - GAIT.duty);
      out.set(
        L.plant.x,
        LEG.hoof + GAIT.lift * Math.pow(Math.sin(Math.PI * q), 0.8),
        L.plant.z + GAIT.stride * easeInOutQuad(q)
      );
    }
    return out;
  }

  var _ft = new V3(), _tg = new V3();

  function solveLeg(L) {
    _tg.copy(_ft);
    L.root.updateWorldMatrix(true, false);
    L.root.worldToLocal(_tg);

    var L1 = LEG.L1, L2 = LEG.L2;
    var d = clamp(_tg.length(), Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
    var u = _tg.clone().normalize();
    var cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    var A = Math.acos(cosA);

    var n = L.pole.clone().addScaledVector(u, -L.pole.dot(u));
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
    n.normalize();

    var dir1 = u.clone().multiplyScalar(Math.cos(A)).addScaledVector(n, Math.sin(A));
    var th1 = Math.atan2(-dir1.z, -dir1.y);
    L.b1.rotation.x = th1;

    var knee = dir1.clone().multiplyScalar(L1);
    var dir2 = _tg.clone().sub(knee).normalize();
    var th2 = Math.atan2(-dir2.z, -dir2.y);
    L.b2.rotation.x = th2 - th1;

    L.foot.rotation.x = -(th1 + th2);          // keep the hoof flat on the ground
    L.foot.rotation.z = 0;
  }

  function updateGait(dt) {
    gaitTime += dt;
    travel += SPEED * dt;

    giraffe.position.z = travel;
    var gp = frac(gaitTime / GAIT.T);

    // --- body: bob, roll, pitch, weight shift -------------------------
    var bob = Math.sin(TAU * 2 * gp);
    body.position.y = 0.032 * bob + 0.010 * Math.sin(TAU * 4 * gp + 1.1);
    body.position.x = 0.022 * Math.sin(TAU * gp + 0.35);
    body.rotation.z = 0.017 * Math.sin(TAU * gp + 0.5);
    body.rotation.x = 0.010 * Math.sin(TAU * 2 * gp + 1.3) - 0.006;

    // --- breathing ----------------------------------------------------
    var br = Math.sin(gaitTime * 1.15);
    torso.scale.set(1, 1 + 0.013 * br, 1 + 0.009 * br);

    // --- neck / head counter-sway -------------------------------------
    neckLower.rotation.x = 0.030 * Math.sin(TAU * gp + 1.0) + 0.010 * Math.sin(gaitTime * 0.47);
    neckLower.rotation.z = 0.020 * Math.sin(TAU * gp + 2.4);
    neckUpper.rotation.x = NECK_TILT + 0.026 * Math.sin(TAU * gp + 1.9);
    neckUpper.rotation.z = 0.016 * Math.sin(TAU * gp + 3.1);

    var look = 0.16 * Math.sin(gaitTime * 0.27) + 0.09 * Math.sin(gaitTime * 0.13 + 1.7);
    head.rotation.y = look;
    head.rotation.z = 0.05 * Math.sin(gaitTime * 0.21 + 0.6);
    head.rotation.x = -0.47 + 0.035 * Math.sin(TAU * gp + 2.6) + 0.020 * Math.sin(gaitTime * 0.19 + 2.2);

    // --- tail swing ---------------------------------------------------
    tail.rotation.x = 0.12 + 0.10 * Math.sin(gaitTime * 1.1) + 0.05 * Math.sin(gaitTime * 2.7 + 1);
    tail.rotation.z = 0.20 * Math.sin(gaitTime * 0.83 + 0.7);
    tuft.rotation.x = -0.25 + 0.28 * Math.sin(gaitTime * 1.1 - 0.7);
    tuft.rotation.z = 0.22 * Math.sin(gaitTime * 0.83 - 0.2);

    // --- feet ---------------------------------------------------------
    for (var i = 0; i < legs.length; i++) {
      var L = legs[i];
      var phi = frac(gaitTime / GAIT.T + L.phase);
      if (phi < L.prevPhi) {                   // touchdown → new plant
        L.plant.set(L.hip.x, LEG.hoof, L.hip.z + travel + A0);
      }
      L.prevPhi = phi;
      footTarget(L, phi, _ft);
      solveLeg(L);
    }
  }

  /* ------------------------------------------------------------------ *
   *  Idle behaviours: blinks, ear flicks
   * ------------------------------------------------------------------ */

  var blink = { t: 1.6, phase: -1 };
  var earState = [{ base: -0.95, t: 2.5, k: 0 }, { base: 0.95, t: 4.1, k: 0 }];
  // ears were built mirrored: left group has rotation.z = +0.95, right −0.95
  earState[0].base = ears[0].rotation.z;
  earState[1].base = ears[1].rotation.z;

  function updateIdle(dt) {
    // blink
    blink.t -= dt;
    if (blink.phase < 0 && blink.t <= 0) { blink.phase = 0; blink.t = rand(2.2, 5.5); }
    if (blink.phase >= 0) {
      blink.phase += dt / 0.16;
      var p = blink.phase;
      var k = p < 0.5 ? p * 2 : (1 - p) * 2;
      k = smoothstep(clamp(k, 0, 1));
      var rx = lerp(-1.0, 1.35, k);
      lids[0].rotation.x = rx;
      lids[1].rotation.x = rx;
      if (p >= 1) { blink.phase = -1; lids[0].rotation.x = -1.0; lids[1].rotation.x = -1.0; }
    }

    // ear flicks
    for (var i = 0; i < earState.length; i++) {
      var e = earState[i];
      e.t -= dt;
      if (e.t <= 0) { e.k = 1; e.t = rand(3.5, 9); }
      if (e.k > 0) {
        e.k = Math.max(0, e.k - dt * 4.5);
        var tw = Math.sin(e.k * Math.PI) * (i ? -1 : 1) * 0.5;
        ears[i].rotation.z = e.base + tw;
      }
    }
  }

  /* ------------------------------------------------------------------ *
   *  Camera: follow + orbit
   * ------------------------------------------------------------------ */

  var camTarget = new V3(0, 2.6, 0);
  var orbit = { theta: 0.78, phi: 1.30, dist: 9.5, idle: 0, auto: true };

  function updateCamera(dt) {
    var want = new V3(giraffe.position.x, orbit.ty || 2.55, giraffe.position.z + (orbit.tz === undefined ? 0.4 : orbit.tz));
    camTarget.lerp(want, 1 - Math.exp(-dt * 3.2));

    orbit.idle += dt;
    if (orbit.auto && orbit.idle > 5) orbit.theta += dt * 0.055;

    var sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
    camera.position.set(
      camTarget.x + orbit.dist * sp * Math.sin(orbit.theta),
      camTarget.y + orbit.dist * cp,
      camTarget.z + orbit.dist * sp * Math.cos(orbit.theta)
    );
    camera.lookAt(camTarget);

    // sun rig + sky follow the animal
    sun.position.set(giraffe.position.x, 0, giraffe.position.z).addScaledVector(sunDir, 30);
    sun.target.position.set(giraffe.position.x, 1.6, giraffe.position.z);
    sun.target.updateMatrixWorld();
    scene.userData.sky.position.copy(camera.position);

    // keep the ground under our feet (snapped to the texture period)
    ground.position.z = Math.round(travel / 6) * 6;
    contact.position.z = travel + 0.55;

    // recycle scenery
    for (var i = 0; i < recyclable.length; i++) {
      var o = recyclable[i];
      while (o.obj.position.z < travel - 60) o.obj.position.z += CORRIDOR;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Input
   * ------------------------------------------------------------------ */

  var paused = false, uiVisible = true;
  var drag = null;

  function userActive() { orbit.idle = 0; }

  renderer.domElement.addEventListener('pointerdown', function (e) {
    drag = { x: e.clientX, y: e.clientY };
    renderer.domElement.setPointerCapture(e.pointerId);
    userActive();
  });
  renderer.domElement.addEventListener('pointermove', function (e) {
    if (!drag) return;
    orbit.theta -= (e.clientX - drag.x) * 0.006;
    orbit.phi = clamp(orbit.phi - (e.clientY - drag.y) * 0.005, 0.35, 1.52);
    drag.x = e.clientX; drag.y = e.clientY;
    userActive();
  });
  renderer.domElement.addEventListener('pointerup', function () { drag = null; });
  renderer.domElement.addEventListener('pointercancel', function () { drag = null; });
  renderer.domElement.addEventListener('wheel', function (e) {
    e.preventDefault();
    orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.0012), 3.5, 45);
    userActive();
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Space') { e.preventDefault(); paused = !paused; }
    else if (e.key === 'a' || e.key === 'A') orbit.auto = !orbit.auto;
    else if (e.key === 'h' || e.key === 'H') {
      uiVisible = !uiVisible;
      document.getElementById('hud').style.display = uiVisible ? '' : 'none';
      document.getElementById('stats').style.display = uiVisible ? '' : 'none';
    }
    userActive();
  });

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ------------------------------------------------------------------ *
   *  Main loop
   * ------------------------------------------------------------------ */

  /* debug / deep-link parameters:  ?t=<seconds>  &view=side|front|back|close|top  &ui=0 */
  (function readParams() {
    var q = {};
    location.search.replace(/[?&]+([^=&]+)=([^&]*)/g, function (m, k, v) { q[k] = decodeURIComponent(v); return m; });
    if (q.t) {
      gaitTime = parseFloat(q.t) || 0;
      travel = SPEED * gaitTime;
      giraffe.position.z = travel;
    }
    if (q.view === 'side') { orbit.theta = Math.PI / 2; orbit.phi = 1.35; orbit.dist = 10.5; }
    else if (q.view === 'front') { orbit.theta = Math.PI * 0.78; orbit.phi = 1.30; orbit.dist = 9.5; }
    else if (q.view === 'back') { orbit.theta = -Math.PI * 0.22; orbit.phi = 1.30; orbit.dist = 10.5; }
    else if (q.view === 'close') { orbit.theta = Math.PI * 0.62; orbit.phi = 1.25; orbit.dist = 5.0; }
    else if (q.view === 'head') { orbit.theta = Math.PI * 0.16; orbit.phi = 1.30; orbit.dist = 2.6; orbit.ty = 4.90; orbit.tz = 1.95; }
    else if (q.view === 'legs') { orbit.theta = Math.PI * 0.55; orbit.phi = 1.45; orbit.dist = 5.0; orbit.ty = 1.2; }
    else if (q.view === 'top') { orbit.theta = Math.PI / 2; orbit.phi = 0.5; orbit.dist = 14; }
    if (q.ui === '0') { uiVisible = false; document.getElementById('hud').style.display = 'none'; document.getElementById('stats').style.display = 'none'; }
    orbit.idle = 0;
    camTarget.set(0, orbit.ty || 2.55, travel + (orbit.tz === undefined ? 0.4 : orbit.tz));
    updateCamera(1);
  })();

  initPlants();

  var clock = new THREE.Clock();
  var statsEl = document.getElementById('stats');
  var frames = 0, fpsT = 0, fps = 0, ready = false;

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);

    if (!paused) {
      updateGait(dt);
      updateIdle(dt);
    }
    giraffe.updateMatrixWorld(true);
    updateCamera(dt);

    renderer.render(scene, camera);

    frames++; fpsT += dt;
    if (fpsT >= 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    if (statsEl && uiVisible) {
      statsEl.textContent =
        (fps ? fps + ' fps' : '…') + '\n' +
        SPEED.toFixed(2) + ' m/s\n' +
        travel.toFixed(0) + ' m walked' +
        (paused ? '\n‖ paused' : '');
    }

    if (!ready) {
      ready = true;
      window.__giraffeOK = true;
      document.title = 'Walking Giraffe — Three.js';
    }
  }

  try {
    animate();
  } catch (err) {
    var el = document.getElementById('err');
    if (el) { el.style.display = 'block'; el.textContent += (err && err.stack ? err.stack : err) + '\n'; }
    document.title = 'ERROR: ' + (err && err.message ? err.message : err);
  }

})();
