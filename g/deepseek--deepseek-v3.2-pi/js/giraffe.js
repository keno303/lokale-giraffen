/* ---------------------------------------------------------------------------
 * giraffe.js — procedural giraffe: lofted anatomy, hierarchical rig with
 * analytic 2D IK for a planted, non-slipping foot, and a lateral-sequence
 * (pacing) walk gait with neck / head / tail / ear secondary motion.
 *
 * Coordinate convention: forward = +X, up = +Y, animal's RIGHT side = +Z.
 * Units are metres. Standing height ~5.2 m, shoulder 2.75 m.
 * ------------------------------------------------------------------------- */
(function () {
  const MET = { tile: 2.0 };   // one coat texture tile spans 2 m of skin

  function coatUV(circ, len, density) {
    density = density || 1;
    return [circ / MET.tile * density, len / MET.tile * density];
  }

  /* ================= materials ======================================== */
  function makeMaterials(tex) {
    const M = {};
    M.coat = new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap,
      roughness: 1, metalness: 0, vertexColors: true,
      normalScale: new THREE.Vector2(0.9, 0.9),
      envMapIntensity: 0.55,
    });
    M.dark = new THREE.MeshPhysicalMaterial({
      color: 0x241812, roughness: 0.55, metalness: 0, clearcoat: 0.25,
      clearcoatRoughness: 0.6, envMapIntensity: 0.5,
    });
    M.hoof = new THREE.MeshPhysicalMaterial({
      color: 0x2b2018, roughness: 0.38, metalness: 0, clearcoat: 0.4,
      clearcoatRoughness: 0.35, envMapIntensity: 0.8,
    });
    M.hair = new THREE.MeshStandardMaterial({
      color: 0x241610, roughness: 0.95, metalness: 0, envMapIntensity: 0.25,
    });
    M.innerEar = new THREE.MeshStandardMaterial({
      color: 0x50352a, roughness: 0.85, metalness: 0, vertexColors: false, envMapIntensity: 0.3,
    });
    M.eye = new THREE.MeshPhysicalMaterial({
      map: tex.eyeMap, color: 0xffffff, roughness: 0.08, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.35,
    });
    M.eyeWhite = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.35 });
    M.mucous = new THREE.MeshPhysicalMaterial({
      color: 0x5d2f2c, roughness: 0.32, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25,
    });
    M.nostril = new THREE.MeshStandardMaterial({ color: 0x1b110d, roughness: 0.7 });
    M.mouth = new THREE.MeshStandardMaterial({ color: 0x2c1a16, roughness: 0.6 });
    M.mane = new THREE.MeshStandardMaterial({
      map: tex.mane, color: 0x6b4a30, transparent: true, alphaTest: 0.35,
      side: THREE.DoubleSide, roughness: 0.9, metalness: 0, depthWrite: true,
    });
    M.tailHair = new THREE.MeshStandardMaterial({
      map: tex.tail, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide,
      roughness: 0.92, metalness: 0, color: 0x4a3225,
    });
    return M;
  }

  /* ================= geometry helpers ================================= */
  function ell(rx, ry, rz, su, sv) {
    const g = new THREE.SphereGeometry(1, su || 22, sv || 14);
    g.scale(rx, ry, rz);
    g.computeVertexNormals();
    return g;
  }
  // place an ellipsoid so that its centre is at p
  function at(x, y, z, rotx, roty, rotz) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotx || 0, roty || 0, rotz || 0));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    return m;
  }
  function xf(geo, x, y, z, rx, ry, rz) {
    const g = geo.clone();
    g.applyMatrix4(at(x, y, z, rx, ry, rz));
    return g;
  }

  // tint helper: darken / warm parts of a mesh by local position
  function tintCoat(geo, fn) {
    return G.paint(geo, (x, y, z, nx, ny, nz) => fn(x, y, z, nx, ny, nz));
  }

  /* ================= a bone =========================================== */
  class Bone extends THREE.Group {
    constructor(name, parent, x, y, z) {
      super();
      this.name = name;
      this.position.set(x, y, z);
      parent && parent.add(this);
      this.meshes = [];
      this._restQ = null;
    }
    addMesh(geo, mat, castShadow) {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = castShadow !== false;
      m.receiveShadow = true;
      this.add(m);
      this.meshes.push(m);
      return m;
    }
  }

  /* ================= analytic limb IK with a shape prior ============= */
  // Bones hang along local -Y; a hinge angle A points the segment toward
  // u(A) = (sin A, -cos A), so A>0 swings the tip forward (+x).
  //
  // A 3-link chain reaching a 2D target keeps one redundant DOF. Rather than
  // iterating for it we sweep the commanded bend of the last joint (the
  // carpus / hock, `c` - the angle that makes a limb look like a limb), take
  // the closed-form two-link solution for each candidate (links 2+3 fuse into
  // one virtual link) and keep the member of that family whose ABSOLUTE
  // segment angles sit closest to the anatomy we asked for.
  //   want = [a0,a1,a2]  desired absolute angles, rad from vertical
  function legIK(bones, lens, target, want, o) {
    const L0 = lens[0], L1 = lens[1], L2 = lens[2];
    const w = o.w || [1, 1.1, 0.9];
    const lo2 = o.lim2, lo1 = o.lim1, cmin = o.cRange[0], cmax = o.cRange[1];
    let tx = target[0], ty = target[1];
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    const D0 = Math.hypot(tx, ty);
    const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const N = o.steps || 17;
    let best = null, bestE = 1e9;
    for (let i = 0; i < N; i++) {
      const c = cmin + (cmax - cmin) * (N === 1 ? 0.5 : i / (N - 1));
      const M = Math.hypot(L2 * Math.sin(c), L1 + L2 * Math.cos(c));
      const beta = Math.atan2(L2 * Math.sin(c), L1 + L2 * Math.cos(c));
      let px = tx, py = ty, D = D0;
      const lo = Math.abs(L0 - M) + 1e-3, hi = L0 + M - 1e-3;
      if (D < 1e-5) { px = 0; py = -hi * 0.999; D = hi * 0.999; }
      let miss = 0;
      if (D < lo || D > hi) { const k = U.clamp(D, lo, hi) / D; px *= k; py *= k; D *= k; miss = Math.abs(D0 - D); }
      const base = Math.atan2(px, -py);
      const g = Math.acos(U.clamp((L0 * L0 + D * D - M * M) / (2 * L0 * D), -1, 1));
      for (const sgn of [1, -1]) {
        const A0 = base - sgn * g;
        const kx = L0 * Math.sin(A0), ky = -L0 * Math.cos(A0);
        const A1 = Math.atan2(px - kx, -(py - ky)) - beta;
        const th = [A0, A1 - A0, c];
        if (th[0] < lo1[0] || th[0] > lo1[1] || th[1] < lo2[0] || th[1] > lo2[1]) continue;
        const a = [th[0], th[0] + th[1], th[0] + th[1] + th[2]];
        let e = 400 * miss * miss;
        for (let k = 0; k < 3; k++) { const d = wrap(a[k] - want[k]); e += w[k] * d * d; }
        if (e < bestE) { bestE = e; best = th; }
      }
    }
    if (!best && !o.relaxed) {            // nothing inside the limits: relax
      return legIK(bones, lens, target, want, Object.assign({}, o, {
        lim1: [-1.6, 1.6], lim2: [-2.0, 2.0], steps: 25, relaxed: true,
      }));
    }
    if (!best) return null;
    for (let i = 0; i < 3; i++) bones[i].rotation.z = best[i];
    return best;
  }

  /* ================= 2D chain IK (CCD in the limb plane) ============== */
  // Chain lies in the local (x,y) plane of the root bone; all hinges rotate
  // about local Z. Positive angle = protraction (tip moves toward +X).
  function planarIK(bones, lens, target, opts) {
    opts = opts || {};
    const limits = opts.limits || bones.map(() => [-2.4, 2.4]);
    const rest = opts.rest || bones.map(() => 0);
    const n = bones.length;
    const ang = bones.map(b => b.rotation.z);
    function tipPos(a) {
      let x = 0, y = 0, th = 0;
      for (let i = 0; i < n; i++) {
        th += a[i];
        x += Math.sin(th) * lens[i];
        y -= Math.cos(th) * lens[i];
      }
      return [x, y];
    }
    function jointPos(k, a) {
      let x = 0, y = 0, th = 0;
      for (let i = 0; i < k; i++) {
        th += a[i];
        x += Math.sin(th) * lens[i];
        y -= Math.cos(th) * lens[i];
      }
      return [x, y];
    }
    const iters = opts.iters || 6;
    const restW = opts.restW === undefined ? 0.16 : opts.restW;
    const ccd = () => {
      for (let i = n - 1; i >= 0; i--) {
        const jp = jointPos(i, ang);
        const tp = tipPos(ang);
        const vx = tp[0] - jp[0], vy = tp[1] - jp[1];
        const wx = target[0] - jp[0], wy = target[1] - jp[1];
        const cur = Math.atan2(vx, -vy);      // angle measured like our hinge
        const want = Math.atan2(wx, -wy);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        d *= (opts.step || 1) * (i === 0 ? 0.85 : 1);
        const lim = limits[i];
        ang[i] = U.clamp(ang[i] + d, lim[0], lim[1]);
      }
    };
    // 3 links solving a 2D target leaves one redundant DOF: use it to hold a
    // preferred posture (which way each joint bends), then re-satisfy the
    // target. Alternating the two converges to target-with-good-posture.
    for (let it = 0; it < iters; it++) {
      ccd();
      if (restW > 0) {
        for (let i = 0; i < n; i++) {
          ang[i] = U.clamp(ang[i] + (rest[i] - ang[i]) * restW, limits[i][0], limits[i][1]);
        }
      }
    }
    ccd();
    for (let i = 0; i < n; i++) bones[i].rotation.z = ang[i];
    return ang;
  }

  /* ================= giraffe ========================================== */
  class Giraffe {
    constructor(tex) {
      this.M = makeMaterials(tex);
      this.root = new THREE.Group();
      this.root.name = 'giraffe';
      this.time = 0;
      this.phase = 0;
      this.speed = 1.35;         // m/s
      this.params = { strideScale: 1, gaitRate: 1, neckPose: 0, headPose: 0, maneOn: true, blink: 0 };
      this.dust = [];
      this._build();
    }

    /* ------------------------------------------------------------ build */
    _build() {
      const M = this.M;
      // body: the "torso" bone, everything hangs off it
      this.body = new Bone('body', this.root, 0, 0, 0);

      this._buildTorso();
      this._buildNeck();
      this._buildHead();
      this._buildTail();
      this._buildLegs();
      this._buildMane();

      // scale sanity: everything is authored in metres
      this.root.scale.setScalar(1);
    }

    /* ---------- torso ------------------------------------------------ */
    _buildTorso() {
      const M = this.M;
      // Main barrel: from chest (front, low) over the shoulders, dipping at
      // the loin, rising again over the rump.
      const path = [
        [1.42, 2.28, 0], [1.34, 2.55, 0], [0.95, 2.72, 0], [0.35, 2.72, 0],
        [-0.35, 2.72, 0], [-0.95, 2.74, 0], [-1.32, 2.62, 0], [-1.48, 2.36, 0],
      ];
      const radii = [
        [0.245, 0.30], [0.30, 0.40], [0.335, 0.44], [0.33, 0.45],
        [0.305, 0.425], [0.315, 0.43], [0.33, 0.42], [0.27, 0.33],
      ];
      const circ = 2 * Math.PI * 0.32, len = 3.0;
      const torso = G.loft({
        path, radii, radial: 26, sub: 9, noise: 0.05,
        capStart: { round: 0.85, len: 0.26 }, capEnd: { round: 0.75, len: 0.22 },
        uv: coatUV(circ, len, 0.95),
      });
      // deep-chested look: ribcage mass hanging below the barrel
      const chest = G.loft({
        path: [[1.36, 2.30, 0], [1.20, 2.02, 0], [0.86, 1.90, 0], [0.30, 1.90, 0], [-0.30, 1.95, 0], [-0.95, 2.05, 0], [-1.30, 2.20, 0]],
        radii: [[0.30, 0.26], [0.345, 0.33], [0.36, 0.40], [0.355, 0.41], [0.335, 0.39], [0.31, 0.34], [0.26, 0.24]],
        radial: 24, sub: 8, noise: 0.045,
        capStart: { round: 0.6, len: 0.16 }, capEnd: { round: 0.6, len: 0.16 },
        uv: coatUV(2 * Math.PI * 0.35, 2.6, 0.95),
      });
      // rump / pelvis mass
      const rump = xf(ell(0.34, 0.30, 0.36, 24, 16), -1.34, 2.44, 0, 0, 0, 0.2);
      const shoulderHump = xf(ell(0.34, 0.22, 0.30, 20, 14), 1.06, 2.86, 0, 0, 0, -0.35);
      // scapula ridges (one per side)
      const scapL = xf(ell(0.20, 0.42, 0.10, 16, 14), 0.96, 2.70, -0.28, 0.1, 0, -0.55);
      const scapR = xf(ell(0.20, 0.42, 0.10, 16, 14), 0.96, 2.70, 0.28, 0.1, 0, -0.55);
      // throat / dewlap fold behind the jaw, between forelegs
      const dewlap = G.loft({
        path: [[1.40, 2.62, 0], [1.34, 2.30, 0], [1.20, 2.05, 0], [1.02, 1.93, 0]],
        radii: [[0.20, 0.16], [0.24, 0.20], [0.26, 0.20], [0.22, 0.16]],
        radial: 18, sub: 6, noise: 0.05,
        capStart: { round: 0.7, len: 0.12 }, capEnd: { round: 0.8, len: 0.12 },
        uv: coatUV(2 * Math.PI * 0.23, 0.8, 1.0),
      });
      // udder / groin
      const udder = xf(ell(0.15, 0.13, 0.19, 16, 12), -1.02, 2.03, 0, 0, 0, 0);
      const teats = [];
      for (const s of [-1, 1]) {
        for (const dx of [-0.07, 0.09]) {
          teats.push(xf(G.loft({
            path: [[dx, 0, s * 0.10], [dx * 1.1, -0.11, s * 0.14], [dx * 1.05, -0.2, s * 0.15]],
            radii: [[0.035, 0.035], [0.03, 0.03], [0.022, 0.022]],
            radial: 10, sub: 4, uv: coatUV(0.2, 0.2, 2),
            capEnd: { round: 0.9, len: 0.03 },
          }), -1.02, 2.0, 0));
        }
      }
      // navel hollow + flank shading done with vertex colours below
      const parts = [torso, chest, rump, shoulderHump, scapL, scapR, dewlap, udder].concat(teats);
      const geo = G.merge(parts.map(g => ({ geo: g })));
      tintCoat(geo, (x, y, z) => {
        // dorsal-ventral shading: lighter on top, darker belly & inner thighs
        let k = 1;
        const up = U.clamp((y - 1.9) / 1.0, 0, 1);
        k *= 0.80 + 0.24 * up;
        const flank = U.clamp(Math.abs(z) / 0.36, 0, 1);
        k *= 1 - 0.10 * (1 - flank);                       // inner-side darkening
        if (y < 2.05) k *= 0.9;                             // belly
        if (x > 1.2 && y < 2.4) k *= 0.95;                  // chest shadow
        const hollow = U.smoothstep(U.clamp(1 - Math.hypot((x + 0.1) / 0.5, (y - 2.2) / 0.22), 0, 1));
        k *= 1 - 0.10 * hollow * flank;
        return [k, k * 0.985, k * 0.95];
      });
      this.bodyTorso = this.body.addMesh(geo, M.coat);
      // keep a reference for bounding info
      this.bodyHeight = 2.75;
    }

    /* ---------- neck -------------------------------------------------- */
    _buildNeck() {
      const M = this.M;
      // three bending bones; each bone holds its own half of the neck flesh
      // bone lengths along the neck (metres). Axial convention: flesh grows
      // along local +Y; rotation.z pitches fore/aft (negative = forward),
      // rotation.x sways sideways, rotation.y yaws.
      const B = this.neck = [];
      let parent = this.body;
      const L = [0.64, 0.62, 0.58];
      const specs = [
        { r0: [0.315, 0.305], r1: [0.26, 0.255], rad: 22, lean: 0.26 },
        { r0: [0.26, 0.255], r1: [0.215, 0.215], rad: 20, lean: 0.20 },
        { r0: [0.215, 0.215], r1: [0.17, 0.18], rad: 18, lean: 0.14 },
      ];
      this.neckSpecs = specs;
      // joint positions are in the parent bone's frame: the next bone sits at
      // the far end of this one (already leaning forward by `lean`).
      const joints = [
        [1.36, 2.78, 0],
        [L[0] * specs[0].lean, L[0], 0],
        [L[1] * specs[1].lean, L[1], 0],
      ];
      for (let i = 0; i < 3; i++) {
        const b = new Bone('neck' + i, parent, joints[i][0], joints[i][1], joints[i][2]);
        parent = b;
        B.push(b);
        const s = specs[i], l = L[i];
        const geo = G.loft({
          path: [[0, -0.05, 0], [l * 0.5 * s.lean, l * 0.5, 0], [l * s.lean, l + 0.02, 0]],
          radii: [s.r0, [U.lerp(s.r0[0], s.r1[0], 0.5), U.lerp(s.r0[1], s.r1[1], 0.5)], s.r1],
          radial: s.rad, sub: 7, noise: 0.045,
          uv: coatUV(2 * Math.PI * (s.r0[0] + s.r1[0]) * 0.5, l * 1.3, 1.0),
        });
        tintCoat(geo, (x, y, z) => {
          const t = U.clamp(y / l, 0, 1);
          const side = U.clamp(z / s.r0[0], -1, 1);
          let k = 0.90 + 0.14 * (1 - t * 0.35);
          k *= 1 - 0.17 * U.clamp(-side, 0, 1);   // throat (front) side darker
          k *= 1 - 0.05 * U.clamp(side, 0, 1);
          return [k, k * 0.99, k * 0.955];
        });
        b.addMesh(geo, M.coat);
      }
      this.neckLens = L;
      const s2 = specs[2];
      this.head = new Bone('head', this.neck[2], L[2] * s2.lean, L[2] + 0.02, 0);
    }

    /* ---------- head -------------------------------------------------- */
    _buildHead() {
      const M = this.M;
      const h = this.head;
      // authored at a generous size, then scaled down to a real ~0.6 m head
      h.scale.set(0.74, 0.95, 0.95);
      // local frame: skull centred near origin, muzzle toward +X, up +Y
      const R = [1, -1];
      // skull
      const skull = G.loft({
        path: [[-0.20, 0.015, 0], [-0.06, 0.03, 0], [0.10, 0.02, 0], [0.24, 0.005, 0]],
        radii: [[0.075, 0.085], [0.10, 0.115], [0.098, 0.112], [0.082, 0.096]],
        radial: 20, sub: 7, noise: 0.03,
        capStart: { round: 0.9, len: 0.09 },
        uv: coatUV(2 * Math.PI * 0.09, 0.46, 1.35),
      });
      // forehead ridge between the ossicones
      const forehead = xf(ell(0.09, 0.055, 0.075, 16, 12), 0.06, 0.075, 0);
      // muzzle (tapers, slightly flattened, ends blunt & dark)
      const muzzle = G.loft({
        path: [[0.22, 0.0, 0], [0.34, -0.02, 0], [0.44, -0.035, 0], [0.50, -0.045, 0]],
        radii: [[0.08, 0.09], [0.072, 0.082], [0.065, 0.072], [0.058, 0.062]],
        radial: 18, sub: 6, noise: 0.03,
        capEnd: { round: 0.8, len: 0.05 },
        uv: coatUV(2 * Math.PI * 0.07, 0.3, 1.7),
      });
      // lower jaw
      const jaw = G.loft({
        path: [[-0.02, -0.075, 0], [0.14, -0.09, 0], [0.32, -0.085, 0], [0.44, -0.07, 0]],
        radii: [[0.05, 0.045], [0.055, 0.05], [0.05, 0.042], [0.04, 0.03]],
        radial: 14, sub: 5, noise: 0.03,
        capStart: { round: 0.7, len: 0.05 }, capEnd: { round: 0.7, len: 0.04 },
        uv: coatUV(2 * Math.PI * 0.05, 0.45, 1.4),
      });
      // mouth crease (dark line between muzzle and jaw)
      const mouth = G.loft({
        path: [[0.16, -0.045, 0], [0.32, -0.052, 0], [0.46, -0.055, 0]],
        radii: [[0.03, 0.012], [0.028, 0.012], [0.02, 0.01]],
        radial: 10, sub: 4, uv: [0.4, 0.3],
        capEnd: { round: 0.9, len: 0.02 }, capStart: { round: 0.9, len: 0.02 },
      });
      const headGeo = G.merge([{ geo: skull }, { geo: forehead }, { geo: muzzle }, { geo: jaw }]);
      tintCoat(headGeo, (x, y, z) => {
        let k = 1;
        k *= 0.86 + 0.16 * U.clamp((y + 0.1) / 0.25, 0, 1);
        if (x > 0.42) k *= 0.9;                        // darker toward nose
        k *= 1 - 0.12 * U.clamp(1 - Math.abs(z) / 0.1, 0, 1) * (x < 0.1 ? 0.5 : 0);
        if (y < -0.05) k *= 0.9;
        return [k, k * 0.99, k * 0.96];
      });
      h.addMesh(headGeo, M.coat);
      h.addMesh(xf(mouth, 0, 0, 0), M.mouth);

      // nostrils: dark slanted slits on the top-front of the muzzle
      for (const s of R) {
        const nz = xf(ell(0.022, 0.013, 0.011, 12, 8), 0.472, -0.012, s * 0.034, 0.4, 0.4 * s, 0.5);
        h.addMesh(nz, M.nostril);
        // small nasal bump
        h.addMesh(xf(ell(0.028, 0.022, 0.02, 12, 8), 0.455, 0.004, s * 0.036, 0, 0, 0), M.coatDark || M.coat);
      }
      // eyes + lids + lashes
      this.eyes = [];
      for (const s of R) {
        const eye = new THREE.Group();
        eye.position.set(0.075, 0.03, s * 0.093);
        h.add(eye);
        const ball = new THREE.Mesh(ell(0.042, 0.04, 0.038, 20, 14), M.eye);
        ball.position.set(0.005, 0, s * 0.008);
        eye.add(ball);
        // lid (coat coloured) hinged at the top-back, rotates down to blink
        const lid = new THREE.Group();
        lid.position.set(0.0, 0.02, s * 0.005);
        eye.add(lid);
        const lidMesh = new THREE.Mesh(xf(ell(0.05, 0.026, 0.045, 16, 10), 0.004, 0.028, s * 0.012, 0, 0, 0), M.coat);
        lid.add(lidMesh);
        lid.userData.side = s;
        lid.rotation.z = -0.15 * (s > 0 ? 1 : -1) * 0;
        // brow ridge
        const brow = new THREE.Mesh(xf(ell(0.055, 0.028, 0.03, 14, 10), 0.004, 0.034, s * 0.02, 0, 0, 0.1 * s), M.coat);
        eye.add(brow);
        // lashes
        const lashGeo = new THREE.CylinderGeometry(0.0022, 0.0035, 0.04, 5);
        for (let i = 0; i < 5; i++) {
          const lmesh = new THREE.Mesh(lashGeo, M.hair);
          const a = -0.5 + i * 0.28;
          lmesh.position.set(0.02 + Math.cos(a) * 0.005, 0.045, s * (0.022 + Math.sin(a) * 0.02));
          lmesh.rotation.set(0.5, 0, s * -0.35);
          lmesh.scale.set(1, 1, 1);
          eye.add(lmesh);
        }
        this.eyes.push({ eye, lid, side: s });
      }

      // ossicones (horns) + hair tufts
      this.ossicones = [];
      for (const s of R) {
        const oc = new Bone('oss' + s, h, 0.055, 0.085, s * 0.045);
        oc.rotation.set(-s * 0.26, 0, -0.06);
        const shaft = G.loft({
          path: [[0, 0, 0], [0.012, 0.09, 0.004 * s], [0.024, 0.17, 0.008 * s]],
          radii: [[0.036, 0.036], [0.028, 0.028], [0.023, 0.023]],
          radial: 14, sub: 5, uv: [0.35, 0.35],
          capStart: { round: 0.5, len: 0.02 },
        });
        tintCoat(shaft, () => [0.92, 0.9, 0.86]);
        oc.addMesh(shaft, M.coat);
        const knob = xf(ell(0.032, 0.03, 0.032, 14, 10), 0.02, 0.185, 0.011 * s);
        oc.addMesh(knob, M.hair);
        // little tuft at the base
        oc.addMesh(xf(ell(0.045, 0.03, 0.04, 12, 8), 0.005, 0.02, 0.005 * s), M.hair);
        this.ossicones.push(oc);
      }

      // ears: flattened lofts on stalks, twitchable. The blade grows along
      // +Y and is tipped outward with rotation.x so it sticks sideways + back.
      this.ears = [];
      for (const s of R) {
        const ear = new Bone('ear' + s, h, -0.115, 0.05, s * 0.078);
        ear.rotation.set(s * 1.12, -s * 0.22, 0.40);
        ear.userData.base = ear.rotation.clone();
        ear.userData.s = s;
        const blade = G.loft({
          path: [[0, 0, 0], [0.012, 0.13, 0], [0.025, 0.245, 0]],
          radii: [[0.05, 0.018], [0.088, 0.026], [0.042, 0.013]],
          radial: 14, sub: 6, noise: 0.05,
          capStart: { round: 0.4, len: 0.02 }, capEnd: { round: 0.9, len: 0.06 },
          uv: [0.55, 0.7],
        });
        tintCoat(blade, (x, y, z) => {
          const inner = U.clamp((1 - Math.abs(z) / 0.026) * (y > 0.03 ? 1 : 0.5), 0, 1);
          const k = 1 - 0.32 * inner;
          return [k, k * 0.97, k * 0.93];
        });
        ear.addMesh(blade, M.coat);
        // front hair fringe on the ear
        ear.addMesh(xf(G.loft({
          path: [[0, 0.02, 0.03], [0, 0.14, 0.05], [0, 0.22, 0.03]],
          radii: [[0.02, 0.02], [0.03, 0.03], [0.015, 0.015]],
          radial: 8, sub: 4, uv: [0.3, 0.4],
        }), 0, 0, 0), M.hair);
        this.ears.push(ear);
      }

      // joint between head and neck: hide the seam with a thick throat ring
      h.addMesh(xf(ell(0.15, 0.12, 0.17, 18, 12), -0.19, 0.0, 0, 0, 0, 0.3), M.coat);
    }

    /* ---------- tail -------------------------------------------------- */
    _buildTail() {
      const M = this.M;
      const t1 = new Bone('tail1', this.body, -1.46, 2.52, 0);
      const t2 = new Bone('tail2', t1, 0, -0.30, 0);
      const t3 = new Bone('tail3', t2, 0, -0.28, 0);
      const seg = (b, l, r0, r1, segs) => {
        const geo = G.loft({
          path: [[0, 0, 0], [0.02, -l * 0.5, 0], [0.05, -l, 0]],
          radii: [r0, [(r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2], r1],
          radial: segs, sub: 5, uv: coatUV(2 * Math.PI * r0[0], l, 1.4),
        });
        tintCoat(geo, () => [0.9, 0.89, 0.87]);
        b.addMesh(geo, M.coat);
      };
      seg(t1, 0.32, [0.06, 0.06], [0.042, 0.042], 12);
      seg(t2, 0.30, [0.042, 0.042], [0.03, 0.03], 10);
      const geo3 = G.loft({
        path: [[0, 0, 0], [0.03, -0.14, 0], [0.06, -0.26, 0]],
        radii: [[0.03, 0.03], [0.024, 0.024], [0.02, 0.02]],
        radial: 10, sub: 4, uv: [0.2, 0.3],
      });
      t3.addMesh(geo3, M.coat);
      // tuft: crossed hair cards + a dark loft
      const tuft = new THREE.Group();
      tuft.position.set(0.06, -0.26, 0);
      t3.add(tuft);
      const hairLoft = G.loft({
        path: [[0, 0, 0], [0.02, -0.16, 0], [0.02, -0.34, 0]],
        radii: [[0.028, 0.028], [0.05, 0.05], [0.03, 0.03]],
        radial: 10, sub: 5, uv: [0.25, 0.5],
        capEnd: { round: 0.9, len: 0.06 },
      });
      tuft.add(new THREE.Mesh(hairLoft, M.hair));
      for (let i = 0; i < 3; i++) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.42), M.tailHair);
        pl.position.set(0.02, -0.2, 0);
        pl.rotation.y = i * Math.PI / 3;
        pl.castShadow = true;
        tuft.add(pl);
      }
      this.tail = [t1, t2, t3];
      this.tailTuft = tuft;
    }

    /* ---------- legs -------------------------------------------------- */
    _buildLegs() {
      const M = this.M;
      this.legs = {};
      const defs = {
        FR: { side: 1, front: true, hip: [1.16, 2.42, 0.20] },
        FL: { side: -1, front: true, hip: [1.16, 2.42, -0.20] },
        HR: { side: 1, front: false, hip: [-1.06, 2.50, 0.22] },
        HL: { side: -1, front: false, hip: [-1.06, 2.50, -0.22] },
      };
      for (const k of ['FR', 'FL', 'HR', 'HL']) this.legs[k] = this._buildLeg(k, defs[k]);
    }

    _buildLeg(key, d) {
      const M = this.M;
      const front = d.front, side = d.side;
      // segment lengths: upper, mid, lower(cannon+pastern) for the IK chain,
      // plus the hoof link that is oriented analytically to sit flat.
      const L = front ? [0.50, 0.92, 0.86] : [0.70, 0.84, 0.82];
      const HOOF_LINK = 0.16;            // fetlock -> hoof bone origin
      const bones = [];
      const hip = new Bone(key + '_hip', this.body, d.hip[0], d.hip[1], d.hip[2]);
      bones.push(hip);
      let parent = hip;
      const names = front ? ['elbow', 'knee', 'fetlock'] : ['stifle', 'hock', 'fetlock'];
      for (let i = 0; i < 2; i++) {
        const b = new Bone(key + '_' + names[i], parent, 0, -L[i], 0);
        bones.push(b);
        parent = b;
      }
      const fet = new Bone(key + '_fetlock', parent, 0, -L[2], 0);
      bones.push(fet);
      const hoofBone = new Bone(key + '_hoof', fet, 0, -HOOF_LINK, 0);
      bones.push(hoofBone);

      /* --- flesh per bone --- */
      // upper: muscular taper
      const upRadii = front
        ? [[0.145, 0.155], [0.10, 0.105], [0.078, 0.082]]
        : [[0.155, 0.17], [0.115, 0.12], [0.082, 0.086]];
      const up = G.loft({
        path: [[0, 0.06, 0], [front ? -0.02 : 0.03, -L[0] * 0.5, 0], [front ? -0.03 : 0.06, -L[0] + 0.02, 0]],
        radii: upRadii,
        radial: 16, sub: 7, noise: 0.04,
        capStart: { round: 0.85, len: 0.12 },
        uv: coatUV(2 * Math.PI * 0.12, L[0] + 0.15, 1.55),
      });
      hip.addMesh(this._limbTint(up, L[0]), M.coat);
      // joint bulge at the "knee"
      hip.addMesh(xf(ell(0.085, 0.09, 0.085, 14, 10), front ? -0.03 : 0.06, -L[0] + 0.03, 0), M.coat);

      // mid: slim, mostly tendon & bone
      const mid = G.loft({
        path: [[0, 0.04, 0], [0, -L[1] * 0.5, 0], [front ? 0.012 : -0.012, -L[1], 0]],
        radii: [[0.088, 0.092], [0.072, 0.076], [0.062, 0.066]],
        radial: 14, sub: 6, noise: 0.035,
        uv: coatUV(2 * Math.PI * 0.075, L[1] + 0.1, 1.6),
        capStart: { round: 0.5, len: 0.05 },
      });
      bones[1].addMesh(this._limbTint(mid, L[1]), M.coat);
      bones[1].addMesh(xf(ell(0.072, 0.08, 0.072, 14, 10), 0, 0.01, 0), M.coat);

      // carpus / hock knob + hair pad on the front of the fore knee
      if (front) {
        const pad = xf(ell(0.055, 0.075, 0.06, 12, 10), 0.045, 0.02, 0);
        const pg = this._limbTint(pad, 0.2);
        bones[2].addMesh(pg, M.coat);
      } else {
        bones[2].addMesh(xf(ell(0.062, 0.07, 0.06, 12, 10), -0.045, 0.02, 0), M.coat);
      }

      // lower: cannon + pastern, tapering, with a flare above the fetlock
      const low = G.loft({
        path: [[0, -0.02, 0], [0, -L[2] * 0.55, 0], [front ? 0.02 : -0.03, -L[2] + 0.10, 0], [front ? 0.045 : -0.05, -L[2], 0]],
        radii: [[0.062, 0.066], [0.055, 0.058], [0.068, 0.07], [0.055, 0.058]],
        radial: 14, sub: 8, noise: 0.03,
        uv: coatUV(2 * Math.PI * 0.06, L[2] + 0.15, 1.75),
        capEnd: { round: 0.4, len: 0.04 },
      });
      bones[2].addMesh(this._limbTint(low, L[2]), M.coat);
      // fetlock ring
      fet.addMesh(xf(ell(0.062, 0.05, 0.062, 14, 10), 0, 0.01, 0), M.coat);

      // hoof: wedge-shaped, dark, with a heel bulb and flat sole
      const hg = G.loft({
        path: [[0, 0.02, 0], [front ? 0.015 : -0.02, -0.06, 0], [front ? 0.04 : -0.035, -0.12, 0]],
        radii: [[0.062, 0.06], [0.072, 0.072], [0.078, 0.07]],
        radial: 16, sub: 6, noise: 0.02,
        capEnd: { round: 0.55, len: 0.05 },
        uv: [0.3, 0.25],
      });
      const hoofMesh = new THREE.Mesh(hg, M.hoof);
      hoofMesh.castShadow = true;
      hoofBone.add(hoofMesh);
      // exact ground contact: measure the sole in the hoof's own frame
      hg.computeBoundingBox();
      const soleY = hg.boundingBox.min.y;          // negative, below the bone
      const groundGap = HOOF_LINK - soleY + 0.004; // fetlock height when planted
      // coronary band (a slightly darker ring above the hoof)
      hoofBone.addMesh(xf(ell(0.066, 0.035, 0.064, 14, 10), 0, 0.02, 0), M.dark);

      // initial pose, roughly the mid-stance shape (also used by the idle rig)
      bones[0].rotation.z = (front ? -0.26 : 0.52);
      bones[1].rotation.z = (front ? 0.42 : -0.76);
      bones[2].rotation.z = (front ? -0.13 : 0.30);

      // Hinge signs follow real ungulate joints (forward = +x = toward the
      // chest/nose). Fore limb: the humerus slopes back, the elbow flexes the
      // forearm FORWARD, the carpus (the visible "knee") folds the cannon BACK.
      // Hind limb: the femur slopes forward, the stifle throws the gaskin BACK,
      // the hock brings the cannon forward again. `want` holds the ABSOLUTE
      // angle of each of the three segments, which is what the eye reads.
      return {
        key, front, side, bones, hip, fet, hoof: hoofBone,
        hipLocal: [d.hip[0], d.hip[1]],
        lens: L, hipY: d.hip[1], groundGap, soleY,
        // radius the hoof swings on: the chain nearly straight, with a little
        // slack so the column never locks out exactly
        Rmax: L[0] + L[1] + L[2] - 0.05,
        lim1: front ? [-0.85, 0.75] : [-0.7, 1.1],     // humerus / femur
        lim2: front ? [0.0, 1.2] : [-1.45, 0.15],      // elbow / stifle
        cRange: front ? [-1.45, 0.2] : [-0.1, 1.45],   // carpus / hock
        want: front
          ? { stance: [-0.26, 0.16, 0.03], swing: [0.26, 0.86, -0.10] }
          : { stance: [0.52, -0.24, 0.06], swing: [0.80, 0.18, 0.72] },
        wWant: front ? [0.9, 1.3, 1.0] : [0.8, 1.4, 1.0],
        // extra give of the wrist/ankle at mid-stance, rad
        give: front ? -0.14 : 0.16,
        seed: front ? [-0.26, 0.42, -0.13] : [0.52, -0.76, 0.30],
        prevPlanted: true,
      };
    }

    _limbTint(geo, len) {
      return tintCoat(geo, (x, y, z) => {
        const t = U.clamp(-y / Math.max(0.001, len), 0, 1);
        const k = 1 - 0.16 * t;             // darker down the leg
        return [k, k * 0.99, k * 0.96];
      });
    }

    /* ---------- mane --------------------------------------------------- */
    _buildMane() {
      const M = this.M;
      this.mane = [];
      // Place short erect hair cards along a crest line. `sense` picks which
      // side of the path is the outside of the body, `lean` tips the hairs.
      const add = (parent, path, o) => {
        const g = new THREE.Group();
        const w = o.w, h = o.h, r = o.r;
        const cardGeo = new THREE.PlaneGeometry(w * 1.25, h);
        cardGeo.translate(0, h * 0.36, 0);
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i], b = path[i + 1];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const len = Math.hypot(dx, dy);
          const tx = dx / len, ty = dy / len;
          const ox = o.sense > 0 ? ty : -ty, oy = o.sense > 0 ? -tx : tx;
          const th = Math.atan2(-ox, oy) + (o.lean || 0);
          const n = Math.max(2, Math.round(len / w));
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const px = U.lerp(a[0], b[0], t) + ox * r;
            const py = U.lerp(a[1], b[1], t) + oy * r;
            const pivot = new THREE.Group();
            pivot.position.set(px, py, 0);
            pivot.rotation.z = th;
            for (const s of [-1, 1]) {
              const pl = new THREE.Mesh(cardGeo, M.mane);
              pl.rotation.y = s * (o.spread !== undefined ? o.spread : 0.42);
              pl.castShadow = false;
              pivot.add(pl);
            }
            g.add(pivot);
          }
        }
        parent.add(g);
        this.mane.push(g);
        return g;
      };
      // neck crest: in a neck bone's frame the flesh grows along +Y, so the
      // path here runs up the neck and the outside is the posterior edge.
      const L = this.neckLens;
      for (let i = 0; i < 3; i++) {
        const l = L[i], lean = this.neckSpecs[i].lean, r = this.neckSpecs[i].r0[1];
        const pts = [[0, -0.04], [l * 0.5 * lean, l * 0.5], [l * lean, l]];
        add(this.neck[i], pts, { w: 0.09, h: 0.16, r: r * 0.94, sense: -1, lean: -0.15 });
      }
      // withers / back crest (path runs from front to back along the spine)
      add(this.body, [[1.30, 2.98], [0.95, 3.10], [0.35, 3.12], [-0.35, 3.10], [-0.95, 3.08], [-1.34, 2.90]],
        { w: 0.085, h: 0.14, r: 0.02, sense: 1, lean: 0.25 });
      // poll tuft between the ears + forehead hair
      const poll = new THREE.Group();
      this.head.add(poll);
      for (let i = 0; i < 6; i++) {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.11), M.mane);
        pl.position.set(-0.13 + i * 0.038, 0.115, 0);
        pl.rotation.set(0.35, 0, -0.5 + i * 0.12);
        poll.add(pl);
      }
      this.mane.push(poll);
    }

    /* ================================================================
     *  ANIMATION
     * ============================================================== */
    setParams(p) { Object.assign(this.params, p); }

    // gait: 4-beat lateral sequence (right fore, right hind, left fore, left hind)

    update(dt) {
      const p = this.params;
      const speed = this.speed;
      this.time += dt;
      // cycle duration from the giraffe's own walk cadence (~2 steps/s)
      const T = U.clamp(1.86 - 0.17 * (speed - 1.3), 1.15, 2.6) / U.clamp(p.gaitRate, 0.25, 2.2);
      if (p.playing === false) { this._poseIdle(dt, T); return; }
      this.phase = U.wrap01(this.phase + dt / T);
      const duty = 0.62;
      const ph = this.phase;
      // A planted hoof cannot slide, so the whole gait is built the other way
      // round: the foot swings on an arc of radius ~ the limb length about its
      // hip, the travel it needs per stance is speed*duty*T, and the body has
      // to rise and fall as those limbs angle away from vertical.
      const travel = U.clamp(speed * duty * T * p.strideScale, 0.04, 3.0);
      const bobSine = 0.035 * U.clamp(speed / 1.3, 0, 1.4);
      const keys = ['FR', 'FL', 'HR', 'HL'];

      // pass 1: which limb is on the ground, where it landed, and how far that
      // makes the body ride
      const SLACK = 0.10;      // the standing bend every limb keeps
      let bodyCap = 0.03, capSeen = false;
      const fetW = this._v5 || (this._v5 = new THREE.Vector3());
      const hipPrev = this._v6 || (this._v6 = new THREE.Vector3());
      this.footfalls = this.footfalls || [];
      for (const key of keys) {
        const leg = this.legs[key];
        const lp = U.wrap01(ph - Giraffe.PHASES[key]);
        const planted = lp < duty;
        const s = planted ? lp / duty : (lp - duty) / (1 - duty);
        const R = leg.Rmax;
        const A = Math.asin(U.clamp(travel / (2 * R), 0, 0.985));
        const th = planted ? A * (1 - 2 * s) : -A + 2 * A * U.smoothstep(s);
        leg._th = th; leg._s = s; leg._planted = planted;
        if (planted) {
          leg.hip.getWorldPosition(hipPrev);
          if (!leg.prevPlanted || !leg.anchor) {
            // touchdown: nail this hoof to a world point.  The body travels
            // past it from here on, which is exactly what a real step is.
            leg.bones[3].getWorldPosition(fetW);        // last frame's pose
            leg.anchor = Number.isFinite(fetW.x) && Number.isFinite(fetW.z)
              ? [fetW.x, fetW.z]
              : [hipPrev.x + R * Math.sin(th), hipPrev.z];
            leg.prevPlanted = true;
            this.footfalls.push({
              pos: new THREE.Vector3(fetW.x + 0.05, leg.groundGap - 0.18, fetW.z),
              swing: U.clamp(speed / 1.4, 0.3, 1.6), front: leg.front,
            });
          }
          // a planted limb is a strut of fixed length: the body cannot ride
          // higher than the most stretched strut allows, so take the lowest cap
          const dx = U.clamp(hipPrev.x - leg.anchor[0], -R * 0.98, R * 0.98);
          const cap = Math.sqrt(Math.max(0.05, R * R - dx * dx)) + leg.groundGap - leg.hipY - SLACK;
          if (Number.isFinite(cap)) {
            if (!capSeen || cap < bodyCap) bodyCap = cap;
            capSeen = true;
          }
        } else leg.prevPlanted = false;
      }
      const bodyY = bobSine * Math.sin(4 * Math.PI * ph + 0.6) + (capSeen ? bodyCap : 0);

      this.body.position.set(0, bodyY, 0);
      this.body.rotation.set(
        0.012 * Math.sin(4 * Math.PI * ph) + 0.01 * Math.sin(2 * Math.PI * ph),
        0.035 * Math.sin(2 * Math.PI * ph + 0.4),
        0.022 * Math.sin(4 * Math.PI * ph + 1.2)
      );
      this.body.updateMatrixWorld(true);
      // hip -> ground targets are worked out in world space so the planted
      // hoof sits exactly on the floor whatever the body pitch / roll does
      const tmpM4 = this._m4 || (this._m4 = new THREE.Matrix4());
      const tmpV3 = this._v1 || (this._v1 = new THREE.Vector3());
      const tmpV3b = this._v2 || (this._v2 = new THREE.Vector3());
      const fwdV = this._v3 || (this._v3 = new THREE.Vector3());
      const upV = this._v4 || (this._v4 = new THREE.Vector3(0, 1, 0));
      const bInv = tmpM4.copy(this.body.matrixWorld).invert();
      const tmpV = tmpV3, hipW = tmpV3b;

      // legs
      for (const key of keys) {
        const leg = this.legs[key];
        const off = Giraffe.PHASES[key];
        const planted = leg._planted, s = leg._s, th = leg._th;
        let hoofFlat = 0, want, tgt;
        leg.hip.getWorldPosition(hipW);          // before the hinge is solved
        const drop = hipW.y - leg.groundGap;      // hip -> fetlock of a flat foot
        if (planted) {
          // target is the anchored hoof tip, straight down from the fetlock
          tmpV.set(leg.anchor[0], leg.groundGap, leg.anchor[1]).applyMatrix4(bInv);
          tgt = [tmpV.x - leg.hipLocal[0], tmpV.y - leg.hipLocal[1]];
          const Aa = leg.want.stance;
          want = [Aa[0], Aa[1], Aa[2] + leg.give * Math.sin(Math.PI * s)];
        } else {
          let tx = leg.Rmax * Math.sin(th) * 0.96;
          const xlim = Math.sqrt(Math.max(1e-4, leg.Rmax * leg.Rmax - drop * drop));
          if (Math.abs(tx) > xlim) tx = Math.sign(tx) * xlim;
          const liftAmp = (leg.front ? 0.30 : 0.34) * U.clamp(speed / 1.3, 0.3, 1.5);
          const lift = liftAmp * Math.sin(Math.PI * Math.pow(s, 0.75));
          hoofFlat = -0.4 * Math.sin(Math.PI * s) + 0.12 * s;
          // world fetlock point -> body space -> hip space
          fwdV.set(1, 0, 0).applyQuaternion(this.root.quaternion);
          tmpV.copy(hipW).addScaledVector(fwdV, tx)
            .addScaledVector(upV, -drop + lift).applyMatrix4(bInv);
          tgt = [tmpV.x - leg.hipLocal[0], tmpV.y - leg.hipLocal[1]];
          const Aa = leg.want.stance, B = leg.want.swing;
          const f = Math.sin(Math.PI * Math.pow(s, 0.85));
          want = [U.lerp(Aa[0], B[0], f), U.lerp(Aa[1], B[1], f), U.lerp(Aa[2], B[2], f)];
        }
        const bones = [leg.bones[0], leg.bones[1], leg.bones[2]];
        const ang = legIK(bones, leg.lens, tgt, want, {
          lim1: leg.lim1, lim2: leg.lim2, cRange: leg.cRange, w: leg.wWant,
        }) || leg.lastAng || [0, 0, 0];
        leg.lastAng = ang;

        // keep the hoof sole parallel to the ground
        const sum = ang[0] + ang[1] + ang[2];
        leg.hoof.rotation.z = -sum + hoofFlat;
        leg.hoof.rotation.x = 0;
        // small in/out splay so the feet do not clip the body
        leg.hip.rotation.x = (leg.front ? 0.03 : 0.05) * leg.side + 0.018 * Math.sin(2 * Math.PI * (ph + off));
      }

      // neck & head: giraffes counter-swing the neck with the forelimbs
      const nsw = 0.075 * Math.sin(2 * Math.PI * ph) * U.clamp(speed / 1.3, 0, 1.3);
      const yaw = 0.05 * Math.sin(2 * Math.PI * ph + 0.5);
      const pitchBob = 0.05 * Math.sin(4 * Math.PI * ph);
      const np = p.neckPose * 1.15;   // 0 = normal carry, negative = reach down
      this.neck[0].rotation.set(nsw * 0.55, yaw * 0.4, np * 0.42 + pitchBob * 0.5);
      this.neck[1].rotation.set(nsw * 0.38, yaw * 0.3, np * 0.33 + pitchBob * 0.35);
      this.neck[2].rotation.set(nsw * 0.22, yaw * 0.25, np * 0.25 + pitchBob * 0.2);
      this.head.rotation.set(
        0.04 * Math.sin(2 * Math.PI * ph + 2.1),
        yaw * 1.1 + 0.03 * Math.sin(this.time * 0.6),
        -0.10 - np * 0.15 + 0.035 * Math.sin(4 * Math.PI * ph));

      // ears twitch independently; tail swishes faster than the gait
      const tw = Math.sin(this.time * 2.3);
      for (const e of this.ears) {
        const bse = e.userData.base, s = e.userData.s;
        e.rotation.z = bse.z + 0.11 * Math.sin(this.time * (s > 0 ? 1.7 : 1.3) + s);
        e.rotation.x = bse.x + s * 0.13 * Math.sin(this.time * (s > 0 ? 0.9 : 1.05) + 2 * s);
        e.rotation.y = bse.y + 0.10 * Math.sin(this.time * 0.55 + s);
      }

      this.tail[0].rotation.set(0, 0.12 * Math.sin(this.time * 1.3), 0.10 + 0.05 * tw);
      this.tail[1].rotation.set(0, 0.30 * Math.sin(this.time * 1.6 - 0.6), 0.10 * Math.sin(this.time * 2.1));
      this.tail[2].rotation.set(0, 0.45 * Math.sin(this.time * 1.8 - 1.2), 0.12 * Math.sin(this.time * 2.4 + 0.4));

      // blink every ~4-7 s
      this._blinkT = (this._blinkT || 2.5) - dt;
      if (this._blinkT < 0) this._blinkT = U.range(2.8, 6.5);
      const bt = this._blinkT;
      let close = 0;
      if (bt < 0.22) close = Math.sin(bt / 0.22 * Math.PI);
      for (const e of this.eyes) e.lid.rotation.z = -close * 1.15;

      // mane follows the neck with a lag
      for (const g of this.mane) g.rotation.z = -0.03 * Math.sin(2 * Math.PI * ph);
    }

    _poseIdle(dt, T) {
      // standing: limbs plumb with a little individual variation, breathing
      const b = Math.sin(this.time * 1.1) * 0.006;
      this.body.position.y = b;
      for (const key of ['FR', 'FL', 'HR', 'HL']) {
        const leg = this.legs[key];
        const bones = [leg.bones[0], leg.bones[1], leg.bones[2]];
        const st = leg.want.stance;
        const wob = 0.9 + 0.1 * Math.sin(this.time * 0.5 + leg.side);
        const ang = legIK(bones, leg.lens,
          [leg.front ? 0.02 : -0.03, -(leg.hipY + b - leg.groundGap)],
          [st[0], st[1], st[2] * wob],
          { lim1: leg.lim1, lim2: leg.lim2, cRange: leg.cRange, w: leg.wWant })
          || leg.lastAng || [0, 0, 0];
        leg.lastAng = ang;
        leg.hoof.rotation.z = -(ang[0] + ang[1] + ang[2]);
        leg.hip.rotation.x = (leg.front ? 0.03 : 0.05) * leg.side;
        leg.prevPlanted = false;      // re-anchor the hoof if walking resumes
      }
      this.neck[0].rotation.set(0.02 * Math.sin(this.time * 0.4), 0.015 * Math.sin(this.time * 0.3), -0.02 + 0.02 * Math.sin(this.time * 0.5));
      this.neck[1].rotation.set(0.012 * Math.sin(this.time * 0.35), 0, -0.01);
      this.neck[2].rotation.set(0.008 * Math.sin(this.time * 0.3), 0, 0);
      this.head.rotation.set(0, 0.05 * Math.sin(this.time * 0.45), -0.10 + 0.02 * Math.sin(this.time * 0.6));
      for (const e of this.ears) {
        const bse = e.userData.base, s = e.userData.s;
        e.rotation.z = bse.z + 0.13 * Math.sin(this.time * (s > 0 ? 1.3 : 1.05));
        e.rotation.x = bse.x + s * 0.10 * Math.sin(this.time * 0.8 + s);
      }
      this.tail[0].rotation.set(0, 0.1 * Math.sin(this.time * 0.7), 0.16);
      this.tail[1].rotation.set(0, 0.25 * Math.sin(this.time * 0.9), 0.05 * Math.sin(this.time * 1.3));
      this.tail[2].rotation.set(0, 0.3 * Math.sin(this.time * 1.1), 0.06 * Math.sin(this.time * 1.5));
      this._blinkT = (this._blinkT || 2.5) - dt;
      if (this._blinkT < 0) this._blinkT = U.range(2.8, 6.5);
      let close = this._blinkT < 0.22 ? Math.sin(this._blinkT / 0.22 * Math.PI) : 0;
      for (const e of this.eyes) e.lid.rotation.z = -close * 1.1;
    }

    /* ---- helpers used by the world / camera -------------------------- */
    headPosition(target) {
      this.head.updateWorldMatrix(true, false);
      return this.head.getWorldPosition(target || new THREE.Vector3());
    }
    footWorldPositions() {
      const out = [];
      for (const k of ['FR', 'FL', 'HR', 'HL']) {
        const leg = this.legs[k];
        const v = new THREE.Vector3();
        leg.hoof.getWorldPosition(v);
        out.push({ key: k, pos: v, planted: true });
      }
      return out;
    }
  }

  Giraffe.PHASES = { FR: 0.0, HR: 0.22, FL: 0.5, HL: 0.72 };

  window.Giraffe = Giraffe;
  window.__legIK = legIK;   // debug hook
})();
