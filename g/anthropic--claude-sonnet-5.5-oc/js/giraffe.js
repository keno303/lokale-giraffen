/* Procedural giraffe: lofted skinned anatomy + analytic IK walk cycle */
(function () {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const TAU = Math.PI * 2;
  const { loft, profile, chainWeights, mergeGeometries, mulberry32 } = GU;

  // angle of a (dz,dy) vector measured from straight-down, positive toward +z (forward)
  const phi = (dz, dy) => Math.atan2(dz, -dy);

  function bone(parent, restWorld, parentRest) {
    const b = new THREE.Bone();
    b.position.copy(restWorld).sub(parentRest || V(0, 0, 0));
    if (parent) parent.add(b);
    b.userData.rest = restWorld.clone();
    return b;
  }

  class Giraffe {
    constructor() {
      this.root = new THREE.Group();
      this.body = new THREE.Group();
      this.root.add(this.body);
      this.phase = 0;
      this.time = 0;
      this.strideT = 1.5;
      this.duty = 0.62;
      this.halfStride = 0.53;
      this.rand = mulberry32(7);

      this.mats = {
        skin: makeSkin({ scale: 3.6, fadeLo: 0.45, fadeHi: 1.5 }),
        hoof: new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.5, metalness: 0.0 }),
        mane: new THREE.MeshStandardMaterial({ color: 0x2b1a0f, roughness: 0.9 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x1b120d, roughness: 0.85 }),
        horn: new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.8 }),
        ear: new THREE.MeshPhysicalMaterial({ color: 0x6b3d22, roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color(0xffd9b0) }),
        earIn: new THREE.MeshPhysicalMaterial({ color: 0x9a7560, roughness: 0.75, sheen: 0.6, sheenColor: new THREE.Color(0xffe6cc) }),
        eye: new THREE.MeshPhysicalMaterial({ color: 0x24120a, roughness: 0.08, metalness: 0.0, clearcoat: 0.5, clearcoatRoughness: 0.05, envMapIntensity: 0.6 }),
        lid: new THREE.MeshStandardMaterial({ color: 0x2a1a11, roughness: 0.85 }),
        lash: new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 0.7 }),
        tuft: new THREE.MeshStandardMaterial({ color: 0x0f0a07, roughness: 0.9, side: THREE.DoubleSide }),
      };

      this.buildBody();
      this.buildNeckAndHead();
      this.buildLegs();
      this.buildTail();

      this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    }

    /* ---------------------------------------------------------------- torso */
    buildBody() {
      const z0 = 0.90, z1 = -1.3, Lz = z0 - z1;
      const knots = [
        // z,     cy,   rx,   ry
        [0.90, 2.56, 0.19, 0.36],
        [0.72, 2.60, 0.27, 0.53],
        [0.45, 2.62, 0.31, 0.60],
        [0.10, 2.55, 0.33, 0.54],
        [-0.25, 2.49, 0.33, 0.47],
        [-0.65, 2.50, 0.31, 0.40],
        [-1.00, 2.46, 0.29, 0.36],
        [-1.30, 2.40, 0.21, 0.27],
      ];
      const ss = knots.map(k => (z0 - k[0]) / Lz);
      const fcy = profile(knots.map((k, i) => [ss[i], k[1]]));
      const frx = profile(knots.map((k, i) => [ss[i], k[2]]));
      const fry = profile(knots.map((k, i) => [ss[i], k[3]]));
      const geo = loft({
        path: s => V(0, fcy(s), z0 - s * Lz),
        rx: frx, ry: fry, rings: 90, radial: 44, cap: 8,
      });
      const m = new THREE.Mesh(geo, this.mats.skin);
      this.body.add(m);
      this.torsoMesh = m;
    }

    /* ----------------------------------------------------------- neck + head */
    buildNeckAndHead() {
      const neckPts = [V(0, 2.85, 0.35), V(0, 3.30, 0.60), V(0, 3.95, 0.95), V(0, 4.55, 1.35), V(0, 5.00, 1.72)];
      const curve = new THREE.CatmullRomCurve3(neckPts, false, 'centripetal');
      const path = s => curve.getPointAt(s);
      const frx = profile([[0, 0.30], [0.2, 0.235], [0.5, 0.165], [0.8, 0.130], [1, 0.108]]);
      const fry = profile([[0, 0.42], [0.2, 0.31], [0.5, 0.21], [0.8, 0.155], [1, 0.122]]);

      const sJ = [0, 0.2, 0.4, 0.6, 0.8];
      const cuts = sJ.slice(1), win = 0.1;
      const skinFn = s => chainWeights(s, cuts, win);

      // bones (neck chain, then head)
      const bones = [];
      let parent = this.body, prevRest = V(0, 0, 0);
      for (const s of sJ) {
        const r = path(s);
        const b = bone(parent, r, prevRest);
        bones.push(b); parent = b; prevRest = r;
      }
      // head geometry frame
      const hAng = THREE.MathUtils.degToRad(32);
      const O = V(0, 4.99, 1.70);
      const D = V(0, -Math.sin(hAng), Math.cos(hAng));
      const Up = V(0, Math.cos(hAng), Math.sin(hAng));
      const L = 0.76;
      const headBone = bone(parent, O.clone().addScaledVector(D, 0.0), prevRest);
      bones.push(headBone);
      this.neckBones = bones.slice(0, 5);
      this.headBone = headBone;
      const headRest = headBone.userData.rest;

      const neckGeo = loft({ path, rx: frx, ry: fry, rings: 110, radial: 36, cap: 6, skin: skinFn });
      const neckMesh = new THREE.SkinnedMesh(neckGeo, this.mats.skin);

      // head
      const hs = [[0, 0.108], [0.1, 0.128], [0.28, 0.115], [0.5, 0.087], [0.72, 0.071], [0.9, 0.075], [1, 0.070]];
      const hr = [[0, 0.142], [0.1, 0.160], [0.28, 0.140], [0.5, 0.104], [0.72, 0.084], [0.9, 0.085], [1, 0.072]];
      const hrx = profile(hs), hry = profile(hr);
      const hoff = profile([[0, 0.0], [0.2, -0.012], [0.5, -0.012], [0.8, -0.002], [1, -0.004]]);
      const hpath = s => O.clone().addScaledVector(D, L * s).addScaledVector(Up, hoff(s));
      const headGeo = loft({
        path: hpath, rx: hrx, ry: hry, rings: 70, radial: 32, cap: 8,
        capLenA: 1.0, capLenB: 0.9,
        skin: () => [5, 5, 1, 0],
      });
      const headMat = makeSkin({ scale: 6.0, fadeLo: -1, fadeHi: -0.5, head: true, headO: O.clone(), headD: D.clone(), headU: Up.clone(), headL: L });
      const headMesh = new THREE.SkinnedMesh(headGeo, headMat);
      this.headMat = headMat;

      const skel = new THREE.Skeleton(bones);
      this.root.add(neckMesh, headMesh);

      // mane (skinned with the neck chain)
      const maneParts = [];
      const rnd = this.rand;
      const maneN = 170;
      for (let i = 0; i < maneN; i++) {
        const s = 0.99 - (i / (maneN - 1)) * 0.985;
        const p = path(s);
        const a = path(Math.max(0, s - 1e-3)), b = path(Math.min(1, s + 1e-3));
        const T = b.clone().sub(a).normalize();
        const Sx = V(1, 0, 0);
        const Un = new THREE.Vector3().crossVectors(T, Sx);
        for (let k = 0; k < 4; k++) {
          const hgt = (0.085 - 0.025 * s) * (0.65 + 0.7 * rnd());
          const g = new THREE.ConeGeometry(0.013, hgt, 5, 1, true);
          g.translate(0, hgt / 2, 0);
          const dir = Un.clone().multiplyScalar(0.85 + 0.3 * rnd()).addScaledVector(T, -0.35 - 0.3 * rnd())
            .addScaledVector(Sx, (rnd() - 0.5) * 0.45).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
          const lat = (rnd() - 0.5) * 0.05;
          const pos = p.clone().addScaledVector(Un, fry(s) * 0.93).addScaledVector(T, (rnd() - 0.5) * 0.03);
          pos.x += lat;
          g.applyMatrix4(new THREE.Matrix4().compose(pos, q, V(1, 1, 1)));
          g.deleteAttribute('uv');
          const n = g.attributes.position.count;
          const si = new Float32Array(n * 4), sw = new Float32Array(n * 4);
          const w = chainWeights(s, cuts, win);
          for (let v = 0; v < n; v++) { si[v * 4] = w[0]; si[v * 4 + 1] = w[1]; sw[v * 4] = w[2]; sw[v * 4 + 1] = w[3]; }
          g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
          g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
          maneParts.push(g);
        }
      }
      const maneMesh = new THREE.SkinnedMesh(mergeGeometries(maneParts), this.mats.mane);
      this.root.add(maneMesh);
      this.skinnedMeshes = [neckMesh, headMesh, maneMesh];
      this.root.updateMatrixWorld(true);
      for (const m of this.skinnedMeshes) m.bind(skel);

      // ---- head details (children of head bone, rest-space placed)
      const hp = (s, up, x) => O.clone().addScaledVector(D, L * s).addScaledVector(Up, up).add(V(x, 0, 0));
      const local = p => p.clone().sub(headRest);
      const basis = (n, upHint) => {
        const z = n.clone().normalize();
        const y = upHint.clone().addScaledVector(z, -upHint.dot(z)).normalize();
        const x = new THREE.Vector3().crossVectors(y, z);
        return new THREE.Matrix4().makeBasis(x, y, z);
      };
      this.eyes = [];
      this.ears = [];
      for (const sx of [1, -1]) {
        // eye
        const eg = new THREE.Group();
        const ep = hp(0.215, 0.045, sx * 0.112);
        eg.position.copy(local(ep));
        const n = V(sx * 1.0, 0.18, 0.55);
        eg.quaternion.setFromRotationMatrix(basis(n, Up));
        const eyeball = new THREE.Mesh(new THREE.SphereGeometry(0.031, 32, 24), this.mats.eye);
        eyeball.scale.set(1, 1, 0.9);
        eg.add(eyeball);
        const socket = new THREE.Mesh(new THREE.SphereGeometry(0.047, 24, 16), this.mats.lid);
        socket.scale.set(1.05, 0.95, 0.42);
        socket.position.z = -0.015;
        eg.add(socket);
        // lashes
        const lashes = [];
        for (let i = 0; i < 16; i++) {
          const a = (-0.12 + (i / 15) * 1.24) * Math.PI;  // upper arc
          const len = 0.026 + 0.012 * Math.sin((i / 15) * Math.PI);
          const g = new THREE.ConeGeometry(0.0014, len, 4, 1);
          g.translate(0, len / 2, 0);
          const dir = V(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0.55).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
          const pos = V(Math.cos(a) * 0.031, Math.sin(a) * 0.031, 0.008);
          g.applyMatrix4(new THREE.Matrix4().compose(pos, q, V(1, 1, 1)));
          lashes.push(g);
        }
        const lashMesh = new THREE.Mesh(mergeGeometries(lashes.map(g => { g.deleteAttribute('uv'); return g; })), this.mats.lash);
        eg.add(lashMesh);
        // eyelid for blinking (pivot at top of the eyeball)
        const lidPivot = new THREE.Group();
        lidPivot.position.y = 0.032;
        const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0335, 24, 16), this.mats.lid);
        lid.position.y = -0.032;
        lid.scale.set(1.0, 1.0, 0.95);
        lidPivot.add(lid);
        lidPivot.scale.y = 0.001;
        eg.add(lidPivot);
        headBone.add(eg);
        this.eyes.push({ lid: lidPivot });

        // ossicone
        const oBase = hp(0.115, 0.115, sx * 0.058);
        const oDir = V(sx * 0.16, 0.95, -0.22).normalize();
        const oLen = 0.23;
        const og = new THREE.Group();
        og.position.copy(local(oBase));
        const hornGeo = loft({
          path: s => V(0, 0, 0).addScaledVector(oDir, oLen * s), rx: profile([[0, 0.036], [1, 0.027]]), ry: profile([[0, 0.036], [1, 0.027]]),
          rings: 8, radial: 14, cap: 4, capLenA: 0.1, capLenB: 0.3,
        });
        og.add(new THREE.Mesh(hornGeo, this.mats.horn));
        // tuft
        const tg = new THREE.Group();
        tg.position.copy(oDir.clone().multiplyScalar(oLen));
        const hairs = [];
        const rnd2 = this.rand;
        for (let i = 0; i < 60; i++) {
          const hl = 0.055 + 0.04 * rnd2();
          const g = new THREE.ConeGeometry(0.0035, hl, 3, 1);
          g.translate(0, hl / 2, 0);
          const spread = 0.8;
          const d = V((rnd2() - 0.5) * spread, 1, (rnd2() - 0.5) * spread).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
          g.applyMatrix4(new THREE.Matrix4().compose(V((rnd2() - 0.5) * 0.03, -0.012, (rnd2() - 0.5) * 0.03), q, V(1, 1, 1)));
          g.deleteAttribute('uv');
          hairs.push(g);
        }
        const tm = new THREE.Mesh(mergeGeometries(hairs), this.mats.tuft);
        tg.add(tm);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), this.mats.mane);
        knob.scale.set(1, 0.9, 1);
        tg.add(knob);
        og.add(tg);
        headBone.add(og);

        // ear
        const eb = hp(0.015, 0.105, sx * 0.095);
        const earPivot = new THREE.Group();
        earPivot.position.copy(local(eb));
        const outward = V(sx * 0.9, 0.38, -0.2).normalize();
        const earQ = new THREE.Quaternion().setFromRotationMatrix(basis(outward, V(0, 0, 1)));
        earPivot.quaternion.copy(earQ);   // local +z = along ear, +y = flat face normal side
        const earGeo = new THREE.SphereGeometry(1, 20, 14);
        const earOut = new THREE.Mesh(earGeo, this.mats.ear);
        earOut.scale.set(0.05, 0.018, 0.125);
        earOut.position.z = 0.1;
        const earIn = new THREE.Mesh(earGeo, this.mats.earIn);
        earIn.scale.set(0.04, 0.012, 0.105);
        earIn.position.set(0, 0.009, 0.108);
        earPivot.add(earOut, earIn);
        headBone.add(earPivot);
        this.ears.push({ g: earPivot, base: earQ.clone(), sx });
      }
      // median ossicone bump
      const mb = hp(0.32, 0.125, 0);
      const bump = new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 14), this.mats.horn);
      bump.scale.set(1, 0.9, 1);
      bump.position.copy(local(mb));
      headBone.add(bump);

      // nostrils and mouth line
      for (const sx of [1, -1]) {
        const nos = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), this.mats.dark);
        nos.scale.set(0.55, 0.9, 1.5);
        nos.position.copy(local(hp(0.975, 0.032, sx * 0.034)));
        nos.rotation.x = -hAng;
        nos.rotation.z = sx * 0.4;
        headBone.add(nos);
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const s = 0.99 - i * 0.045;
          pts.push(hp(s, -0.022 + i * 0.0015 - hoff(s) * 0, sx * (hrx(s) * 0.985)));
        }
        const mc = new THREE.CatmullRomCurve3(pts);
        const mouth = new THREE.Mesh(new THREE.TubeGeometry(mc, 30, 0.0035, 6, false), this.mats.dark);
        mouth.position.copy(headRest).multiplyScalar(-1);
        headBone.add(mouth);
      }
      this.headInfo = { O, D, Up, L };
    }

    /* ------------------------------------------------------------------ legs */
    buildLegs() {
      const defs = [
        { id: 'LH', x: 0.17, front: false, hip: [2.45, -0.85], knee: [1.20, -1.00], fet: [0.17, -0.90], toe: -0.835, off: 0.00, lift: 0.27, flex: 0.95 },
        { id: 'LF', x: 0.18, front: true, hip: [2.45, 0.55], knee: [1.25, 0.60], fet: [0.17, 0.60], toe: 0.665, off: 0.78, lift: 0.30, flex: 1.05 },
        { id: 'RH', x: -0.17, front: false, hip: [2.45, -0.85], knee: [1.20, -1.00], fet: [0.17, -0.90], toe: -0.835, off: 0.50, lift: 0.27, flex: 0.95 },
        { id: 'RF', x: -0.18, front: true, hip: [2.45, 0.55], knee: [1.25, 0.60], fet: [0.17, 0.60], toe: 0.665, off: 0.28, lift: 0.30, flex: 1.05 },
      ];
      const radF = [[0.08, 0.052, 0.060], [0.17, 0.068, 0.082], [0.30, 0.058, 0.066], [0.7, 0.060, 0.072], [1.0, 0.066, 0.082], [1.18, 0.080, 0.100],
        [1.25, 0.090, 0.108], [1.36, 0.082, 0.104], [1.6, 0.098, 0.125], [2.0, 0.125, 0.175], [2.45, 0.140, 0.220]];
      const radH = [[0.08, 0.052, 0.060], [0.17, 0.068, 0.080], [0.35, 0.058, 0.066], [0.8, 0.060, 0.072], [1.05, 0.070, 0.095], [1.2, 0.084, 0.125],
        [1.36, 0.088, 0.118], [1.7, 0.112, 0.170], [2.1, 0.138, 0.235], [2.45, 0.150, 0.260]];
      this.legs = [];
      const rnd = this.rand;
      for (const d of defs) {
        const hipR = V(d.x, d.hip[0], d.hip[1]);
        const kneeR = V(d.x, d.knee[0], d.knee[1]);
        const fetR = V(d.x, d.fet[0], d.fet[1]);
        const toeR = V(d.x, 0, d.toe);
        const pts = [hipR, kneeR, fetR, V(d.x, 0.085, d.fet[1] + (d.front ? 0.03 : 0.03))];
        // hold the tube close to straight segments between joints
        const curve = new THREE.CatmullRomCurve3([
          hipR, hipR.clone().lerp(kneeR, 0.5), kneeR, kneeR.clone().lerp(fetR, 0.5), fetR, pts[3]], false, 'centripetal');
        const rr = d.front ? radF : radH;
        const frx = profile(rr.map(r => [r[0], r[1]]));
        const fry = profile(rr.map(r => [r[0], r[2]]));
        const path = s => curve.getPointAt(s);
        const kc = -d.knee[0], fc = -d.fet[0];
        const geo = loft({
          path, rx: s => frx(path(s).y), ry: s => fry(path(s).y), rings: 100, radial: 28, cap: 6,
          skin: (s, p) => chainWeights(-p.y, [kc, fc], [0.15, 0.05]),
        });
        const mesh = new THREE.SkinnedMesh(geo, this.mats.skin);
        // skeleton
        const b0 = bone(this.root, hipR, V(0, 0, 0));
        const b1 = bone(b0, kneeR, hipR);
        const b2 = bone(b1, fetR, kneeR);
        const skel = new THREE.Skeleton([b0, b1, b2]);
        this.root.add(mesh);
        this.root.updateMatrixWorld(true);
        mesh.bind(skel);

        // hoof (cloven) + ergot
        const hoofGroup = new THREE.Group();
        for (const tx of [-1, 1]) {
          const g = new THREE.CylinderGeometry(0.031, 0.047, 0.15, 16, 3);
          const pa = g.attributes.position;
          for (let i = 0; i < pa.count; i++) {
            const y = pa.getY(i), z = pa.getZ(i), x = pa.getX(i);
            const front = z > 0 ? 1 : 0.6;
            pa.setZ(i, z * 1.25 * front - y * 0.28);
            pa.setX(i, x * 0.78);
          }
          g.computeVertexNormals();
          const m = new THREE.Mesh(g, this.mats.hoof);
          m.position.set(tx * 0.031, -0.095, d.toe - d.fet[1] - 0.015);
          hoofGroup.add(m);
        }
        const ergot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), this.mats.dark);
        ergot.scale.set(0.8, 1, 1.1);
        ergot.position.set(0, -0.025, -0.06);
        hoofGroup.add(ergot);
        b2.add(hoofGroup);

        const leg = {
          def: d, front: d.front, bones: [b0, b1, b2], hipRest: hipR.clone(),
          L1: hipR.distanceTo(kneeR), L2: kneeR.distanceTo(fetR),
          a1: phi(kneeR.z - hipR.z, kneeR.y - hipR.y),
          a2: phi(fetR.z - kneeR.z, fetR.y - kneeR.y),
          a3: phi(toeR.z - fetR.z, toeR.y - fetR.y),
          z0: d.fet[1], bend: d.front ? 1 : -1,
          foot: new THREE.Vector3(), lastGround: true, justLanded: false,
        };
        this.legs.push(leg);
      }
    }

    /* ------------------------------------------------------------------ tail */
    buildTail() {
      const pts = [V(0, 2.52, -1.28), V(0, 2.28, -1.40), V(0, 1.95, -1.47), V(0, 1.62, -1.47), V(0, 1.38, -1.44)];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const path = s => curve.getPointAt(s);
      const frx = profile([[0, 0.05], [0.4, 0.034], [1, 0.02]]);
      const sJ = [0, 0.3, 0.55, 0.78];
      const bones = [];
      let parent = this.body, prev = V(0, 0, 0);
      for (const s of sJ) { const r = path(s); const b = bone(parent, r, prev); bones.push(b); parent = b; prev = r; }
      const cuts = sJ.slice(1);
      const geo = loft({ path, rx: frx, ry: frx, rings: 50, radial: 14, cap: 4, skin: s => chainWeights(s, cuts, 0.08) });
      const mesh = new THREE.SkinnedMesh(geo, this.mats.skin);
      // tuft on the last bone
      const tipRest = path(1);
      const lastRest = bones[3].userData.rest;
      const hairs = [];
      const rnd = this.rand;
      for (let i = 0; i < 90; i++) {
        const hl = 0.16 + 0.17 * rnd();
        const g = new THREE.ConeGeometry(0.004, hl, 3, 1);
        g.translate(0, -hl / 2, 0);
        const d = V((rnd() - 0.5) * 0.5, -1, (rnd() - 0.5) * 0.5 - 0.08).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), d);
        const o = tipRest.clone().sub(lastRest).add(V((rnd() - 0.5) * 0.03, 0.02, (rnd() - 0.5) * 0.03));
        g.applyMatrix4(new THREE.Matrix4().compose(o, q, V(1, 1, 1)));
        g.deleteAttribute('uv');
        hairs.push(g);
      }
      const tuft = new THREE.Mesh(mergeGeometries(hairs), this.mats.tuft);
      bones[3].add(tuft);
      this.root.add(mesh);
      this.root.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(bones));
      this.tailBones = bones;
    }

    /* ------------------------------------------------------------- animation */
    solveLeg(leg, hip, F, hoofRot) {
      // 2-bone IK in the sagittal (y,z) plane
      const { L1, L2 } = leg;
      let dz = F.z - hip.z, dy = F.y - hip.y;
      let d = Math.hypot(dz, dy);
      const dmax = (L1 + L2) * 0.9995, dmin = Math.abs(L1 - L2) + 0.01;
      const dc = Math.min(dmax, Math.max(dmin, d));
      const base = phi(dz, dy);
      const fz = hip.z + Math.sin(base) * dc, fy = hip.y - Math.cos(base) * dc;
      const cosA = THREE.MathUtils.clamp((L1 * L1 + dc * dc - L2 * L2) / (2 * L1 * dc), -1, 1);
      const A = Math.acos(cosA);
      const th1 = base + leg.bend * A;
      const kz = hip.z + L1 * Math.sin(th1), ky = hip.y - L1 * Math.cos(th1);
      const th2 = phi(fz - kz, fy - ky);
      const th3 = leg.a3 + hoofRot;
      const [b0, b1, b2] = leg.bones;
      b0.position.copy(hip);
      b0.rotation.order = 'ZXY';
      b0.rotation.z = -Math.asin(THREE.MathUtils.clamp((hip.x - leg.hipRest.x) / dc, -0.5, 0.5));
      b0.rotation.x = -(th1 - leg.a1);
      b1.rotation.x = -((th2 - th1) - (leg.a2 - leg.a1));
      b2.rotation.x = -((th3 - th2) - (leg.a3 - leg.a2));
    }

    update(dt, speed) {
      this.time += dt;
      const T = this.strideT / Math.max(0.05, speed);
      this.phase = (this.phase + dt / T) % 1;
      const ph = this.phase, t = this.time;
      const A = this.halfStride, duty = this.duty;

      // ground speed that keeps planted hooves from sliding
      this.velocity = (2 * A) / (duty * T);

      // torso motion
      const bob = -0.108 + 0.017 * Math.cos(2 * TAU * (ph - 0.07));
      const pitch = 0.012 * Math.sin(TAU * ph + 0.6) + 0.006 * Math.sin(2 * TAU * ph + 0.4);
      const roll = 0.022 * Math.sin(TAU * ph + 1.9);
      const yaw = 0.018 * Math.sin(TAU * ph + 0.3);
      const sway = 0.012 * Math.sin(TAU * ph + 1.9);
      this.body.position.set(sway, bob, 0);
      this.body.rotation.set(pitch, yaw, roll, 'YXZ');
      this.body.updateMatrix();

      // legs
      const hip = new THREE.Vector3();
      this.landed = [];
      for (const leg of this.legs) {
        const d = leg.def;
        const lp = (ph + d.off) % 1;
        const F = leg.foot;
        let hoofRot = 0;
        let ground = false;
        if (lp < duty) {
          const u = lp / duty;
          F.z = leg.z0 + A * (1 - 2 * u);
          F.y = 0.17;
          ground = true;
          // small heel-off before lift
          hoofRot = -0.22 * GU.smoothstep(0.88, 1.0, u);
        } else {
          const v = (lp - duty) / (1 - duty);
          const e = v - Math.sin(TAU * v) / TAU;
          F.z = leg.z0 - A + 2 * A * e;
          const lift = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.85)), 1.1);
          F.y = 0.17 + d.lift * lift;
          hoofRot = -d.flex * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.08)), 0.8) - 0.22 * (1 - GU.smoothstep(0, 0.25, v));
          if (v > 0.9) hoofRot = THREE.MathUtils.lerp(hoofRot, 0.0, GU.smoothstep(0.9, 1.0, v));
        }
        if (ground && !leg.lastGround) this.landed.push(leg);
        leg.lastGround = ground;
        hip.copy(leg.hipRest).applyMatrix4(this.body.matrix);
        this.solveLeg(leg, hip, F, hoofRot);
      }

      // neck and head
      const nb = this.neckBones;
      let sum = 0;
      const wv = [0.8, 1.0, 1.0, 0.9, 0.7];
      for (let k = 0; k < nb.length; k++) {
        const p = 0.026 * wv[k] * Math.sin(TAU * ph + 2.3 + 0.38 * k) + 0.012 * Math.sin(t * 0.37 + k * 0.5) * wv[k] - (k === 0 ? pitch * 0.8 : 0);
        nb[k].rotation.x = p;
        sum += p;
        nb[k].rotation.y = 0.045 * Math.sin(t * 0.21 + 0.4 * k) + 0.025 * Math.sin(TAU * ph + 0.5 * k) * (k > 0 ? 0.6 : 0);
        nb[k].rotation.z = 0.01 * Math.sin(TAU * ph + 0.3 + k * 0.1) - roll * 0.5 * (k < 2 ? 1 : 0);
      }
      const hb = this.headBone;
      hb.rotation.x = -sum * 0.85 + 0.04 * Math.sin(2 * TAU * ph + 1.3) + 0.04 * Math.sin(t * 0.5 + 1);
      hb.rotation.y = 0.16 * Math.sin(t * 0.23 + 1.0) * Math.sin(t * 0.11 + 0.3) + 0.05 * Math.sin(t * 0.8);
      hb.rotation.z = 0.04 * Math.sin(t * 0.31);

      // ears
      for (let i = 0; i < this.ears.length; i++) {
        const e = this.ears[i];
        const flick = Math.max(0, Math.sin(t * (0.9 + i * 0.37) + i * 2.0)) ** 14 * Math.sin(t * 28);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12 * Math.sin(TAU * ph * 2 + i) + 0.1 * flick, 0, e.sx * (0.07 * Math.sin(t * 1.3 + i) - 0.35 * Math.abs(flick)), 'XYZ'));
        e.g.quaternion.copy(e.base).multiply(q);
      }
      // blink
      const bl = (t % 4.3);
      const blink = bl < 0.16 ? Math.sin((bl / 0.16) * Math.PI) : 0;
      for (const e of this.eyes) e.lid.scale.y = 0.001 + blink * 0.999;

      // tail
      const tb = this.tailBones;
      for (let k = 0; k < tb.length; k++) {
        tb[k].rotation.x = 0.12 * Math.sin(TAU * ph + 0.9 - 0.7 * k) * (0.5 + k * 0.3) + 0.05 * (k > 0 ? 1 : 0) - pitch * (k === 0 ? 1 : 0);
        tb[k].rotation.z = 0.30 * Math.sin(t * 1.9 - k * 0.8) * (0.35 + k * 0.35) * (0.6 + 0.4 * Math.sin(t * 0.4)) + roll * (k === 0 ? 1 : 0);
      }
    }

    headWorld(out) {
      return out.copy(this.headBone.userData.rest).add(V(0, 0.0, 0.3)).applyMatrix4(this.root.matrixWorld);
    }
  }

  window.Giraffe = Giraffe;
})();
