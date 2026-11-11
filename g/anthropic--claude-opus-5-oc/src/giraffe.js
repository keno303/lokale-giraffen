/* Procedural giraffe: skeleton + skinned mesh.

   Proportions follow an adult reticulated bull: 3.45 m at the withers, 2.0 m
   of neck, ~5.5 m to the ossicone tips. Everything is modelled in metres with
   +Z pointing forward (the direction the animal walks).

   The bind pose is built from pure translations, which makes the analytic leg
   IK in gait.js straightforward: every joint angle is a rotation about the
   bone's local X axis, measured from a known bind angle. */
(function (global) {
  'use strict';

  const U = global.GU;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  const MAT_COAT = 0, MAT_DARK = 1, MAT_HORN = 2, MAT_MANE = 3;

  /* ---- bind pose joint table ----------------------------------------- */

  const SPINE = [
    ['pelvis',   null,       [0, 2.96, -0.95]],
    ['spine1',   'pelvis',   [0, 3.05, -0.40]],
    ['spine2',   'spine1',   [0, 3.13,  0.20]],
    ['chest',    'spine2',   [0, 3.22,  0.72]],
    ['neckBase', 'chest',    [0, 3.21,  1.02]],
    ['neck1',    'neckBase', [0, 3.42,  1.11]],
    ['neck2',    'neck1',    [0, 3.72,  1.22]],
    ['neck3',    'neck2',    [0, 4.02,  1.33]],
    ['neck4',    'neck3',    [0, 4.32,  1.44]],
    ['neck5',    'neck4',    [0, 4.62,  1.55]],
    ['neck6',    'neck5',    [0, 4.88,  1.655]],
    ['neck7',    'neck6',    [0, 5.06,  1.745]],
    ['head',     'neck7',    [0, 5.20,  1.845]]
  ];

  const TAIL = [
    ['tail1', 'pelvis', [0, 2.82, -1.28]],
    ['tail2', 'tail1',  [0, 2.48, -1.50]],
    ['tail3', 'tail2',  [0, 2.10, -1.58]]
  ];

  /* Body / neck / head cross sections. rUp is towards the frame normal
     (spine side -> back of neck -> top of skull), rDn the opposite. */
  const BODY_KEYS = [
    { p: [0, 2.78, -1.34], rx: 0.225, rUp: 0.185, rDn: 0.225, e: 0.92, kx: 0.14 },
    { p: [0, 2.90, -1.12], rx: 0.335, rUp: 0.235, rDn: 0.420, e: 0.92, kx: 0.24 },
    { p: [0, 2.98, -0.86], rx: 0.380, rUp: 0.228, rDn: 0.590, e: 0.90, kx: 0.32 },
    { p: [0, 3.03, -0.55], rx: 0.388, rUp: 0.205, rDn: 0.690, e: 0.90, kx: 0.36 },
    { p: [0, 3.07, -0.20], rx: 0.384, rUp: 0.185, rDn: 0.780, e: 0.90, kx: 0.38 },
    { p: [0, 3.12,  0.15], rx: 0.388, rUp: 0.185, rDn: 0.870, e: 0.90, kx: 0.38 },
    { p: [0, 3.18,  0.48], rx: 0.398, rUp: 0.225, rDn: 0.965, e: 0.90, kx: 0.36 },
    { p: [0, 3.23,  0.78], rx: 0.390, rUp: 0.235, rDn: 0.975, e: 0.92, kx: 0.32 },
    { p: [0, 3.21,  1.02], rx: 0.302, rUp: 0.215, rDn: 0.430, e: 0.95, kx: 0.26 },
    { p: [0, 3.42,  1.11], rx: 0.272, rUp: 0.205, rDn: 0.360, e: 0.98, kx: 0.18 },
    { p: [0, 3.72,  1.22], rx: 0.250, rUp: 0.195, rDn: 0.310, e: 1.00, kx: 0.10 },
    { p: [0, 4.02,  1.33], rx: 0.235, rUp: 0.188, rDn: 0.278, e: 1.00, kx: 0.06 },
    { p: [0, 4.32,  1.44], rx: 0.222, rUp: 0.182, rDn: 0.252, e: 1.00, kx: 0.05 },
    { p: [0, 4.62,  1.55], rx: 0.210, rUp: 0.175, rDn: 0.236, e: 1.00, kx: 0.05 },
    { p: [0, 4.88,  1.655], rx: 0.200, rUp: 0.168, rDn: 0.224, e: 1.00, kx: 0.05 },
    { p: [0, 5.06,  1.745], rx: 0.188, rUp: 0.150, rDn: 0.214, e: 1.00, kx: 0.05 },
    { p: [0, 5.20,  1.845], rx: 0.170, rUp: 0.125, rDn: 0.212, e: 1.00, kx: 0.08 },
    { p: [0, 5.26,  2.000], rx: 0.158, rUp: 0.115, rDn: 0.205, e: 0.95, kx: 0.14 },
    { p: [0, 5.245, 2.170], rx: 0.110, rUp: 0.088, rDn: 0.158, e: 0.95, kx: 0.18 },
    { p: [0, 5.215, 2.350], rx: 0.094, rUp: 0.072, rDn: 0.112, e: 0.95, kx: 0.12 },
    { p: [0, 5.175, 2.490], rx: 0.086, rUp: 0.060, rDn: 0.084, e: 0.95, kx: 0.05 },
    { p: [0, 5.155, 2.556], rx: 0.055, rUp: 0.040, rDn: 0.050, e: 0.95, kx: 0.0 }
  ];

  /* Front leg: shoulder -> elbow -> carpus -> fetlock -> hoof.
     rUp faces forward (+Z-ish), rDn backwards. */
  const FRONT_KEYS = [
    { p: [0.300, 3.080, 0.900], rx: 0.205, rUp: 0.170, rDn: 0.245 },
    { p: [0.300, 2.950, 0.880], rx: 0.215, rUp: 0.175, rDn: 0.265 }, // P0
    { p: [0.302, 2.620, 0.840], rx: 0.195, rUp: 0.160, rDn: 0.265 },
    { p: [0.305, 2.300, 0.800], rx: 0.165, rUp: 0.140, rDn: 0.205 },
    { p: [0.310, 2.000, 0.780], rx: 0.132, rUp: 0.122, rDn: 0.150 }, // P1
    { p: [0.305, 1.700, 0.800], rx: 0.112, rUp: 0.112, rDn: 0.122 },
    { p: [0.298, 1.360, 0.820], rx: 0.096, rUp: 0.098, rDn: 0.096 },
    { p: [0.290, 1.050, 0.840], rx: 0.086, rUp: 0.090, rDn: 0.098 }, // P2
    { p: [0.285, 0.800, 0.840], rx: 0.064, rUp: 0.060, rDn: 0.070 },
    { p: [0.281, 0.520, 0.840], rx: 0.058, rUp: 0.054, rDn: 0.062 },
    { p: [0.278, 0.330, 0.840], rx: 0.066, rUp: 0.062, rDn: 0.076 },
    { p: [0.275, 0.240, 0.840], rx: 0.076, rUp: 0.070, rDn: 0.084 }, // P3
    { p: [0.272, 0.140, 0.882], rx: 0.064, rUp: 0.060, rDn: 0.068 },
    { p: [0.270, 0.065, 0.914], rx: 0.058, rUp: 0.056, rDn: 0.058 }
  ];
  const FRONT_JOINTS = [1, 4, 7, 11, 13];
  const FRONT_FOOT = [0.270, 0.0, 0.930];

  const HIND_KEYS = [
    { p: [0.320, 2.820, -0.840], rx: 0.250, rUp: 0.210, rDn: 0.330 },
    { p: [0.322, 2.620, -0.920], rx: 0.262, rUp: 0.205, rDn: 0.340 }, // P0
    { p: [0.328, 2.300, -0.840], rx: 0.235, rUp: 0.200, rDn: 0.300 },
    { p: [0.332, 2.010, -0.700], rx: 0.200, rUp: 0.170, rDn: 0.245 },
    { p: [0.330, 1.780, -0.580], rx: 0.155, rUp: 0.130, rDn: 0.180 }, // P1
    { p: [0.325, 1.520, -0.680], rx: 0.135, rUp: 0.112, rDn: 0.168 },
    { p: [0.318, 1.230, -0.860], rx: 0.106, rUp: 0.090, rDn: 0.130 },
    { p: [0.310, 0.980, -1.030], rx: 0.082, rUp: 0.072, rDn: 0.112 }, // P2
    { p: [0.303, 0.700, -0.965], rx: 0.062, rUp: 0.058, rDn: 0.070 },
    { p: [0.296, 0.420, -0.950], rx: 0.058, rUp: 0.054, rDn: 0.062 },
    { p: [0.291, 0.300, -0.945], rx: 0.066, rUp: 0.062, rDn: 0.076 },
    { p: [0.290, 0.240, -0.940], rx: 0.076, rUp: 0.070, rDn: 0.084 }, // P3
    { p: [0.287, 0.140, -0.898], rx: 0.064, rUp: 0.060, rDn: 0.068 },
    { p: [0.285, 0.065, -0.866], rx: 0.058, rUp: 0.056, rDn: 0.058 }
  ];
  const HIND_JOINTS = [1, 4, 7, 11, 13];
  const HIND_FOOT = [0.285, 0.0, -0.850];

  const TAIL_KEYS = [
    { p: [0, 2.845, -1.255], rx: 0.080, rUp: 0.075, rDn: 0.080 },
    { p: [0, 2.760, -1.400], rx: 0.055, rUp: 0.052, rDn: 0.058 },
    { p: [0, 2.560, -1.510], rx: 0.042, rUp: 0.040, rDn: 0.044 },
    { p: [0, 2.300, -1.560], rx: 0.034, rUp: 0.033, rDn: 0.036 },
    { p: [0, 2.050, -1.580], rx: 0.028, rUp: 0.027, rDn: 0.029 },
    { p: [0, 1.840, -1.585], rx: 0.023, rUp: 0.022, rDn: 0.024 }
  ];

  /* --------------------------------------------------------------------- */

  function Giraffe(tex) {
    this.group = new THREE.Group();
    this.bones = [];
    this.byName = {};
    this.bindPos = {};
    this.legs = [];
    this._buildSkeleton();
    this._buildMesh(tex);
  }

  Giraffe.prototype._bone = function (name, parent, pos) {
    const b = new THREE.Bone();
    b.name = name;
    const pw = parent ? this.bindPos[parent] : V3(0, 0, 0);
    b.position.set(pos[0] - pw.x, pos[1] - pw.y, pos[2] - pw.z);
    this.bindPos[name] = V3(pos[0], pos[1], pos[2]);
    if (parent) this.byName[parent].add(b);
    this.byName[name] = b;
    b.userData.boneIndex = this.bones.length;
    this.bones.push(b);
    return b;
  };

  Giraffe.prototype.bi = function (name) { return this.byName[name].userData.boneIndex; };

  Giraffe.prototype._buildSkeleton = function () {
    for (const s of SPINE) this._bone(s[0], s[1], s[2]);
    for (const s of TAIL) this._bone(s[0], s[1], s[2]);
    this._bone('earL', 'head', [-0.150, 5.270, 1.875]);
    this._bone('earR', 'head', [0.150, 5.270, 1.875]);

    for (const side of [-1, 1]) {
      const sfx = side < 0 ? 'L' : 'R';
      // Front: a scapula bone lets the whole shoulder slide with the stride.
      this._bone('scapula' + sfx, 'chest', [side * 0.290, 3.300, 0.740]);
      const fk = FRONT_KEYS, fj = FRONT_JOINTS;
      const fpts = fj.map((i) => [side * fk[i].p[0], fk[i].p[1], fk[i].p[2]]);
      fpts[4] = [side * FRONT_FOOT[0], FRONT_FOOT[1], FRONT_FOOT[2]];
      this._bone('humerus' + sfx, 'scapula' + sfx, fpts[0]);
      this._bone('radius' + sfx, 'humerus' + sfx, fpts[1]);
      this._bone('fcannon' + sfx, 'radius' + sfx, fpts[2]);
      this._bone('fpastern' + sfx, 'fcannon' + sfx, fpts[3]);
      this.legs.push(this._legDef(side, true, fpts,
        ['humerus' + sfx, 'radius' + sfx, 'fcannon' + sfx, 'fpastern' + sfx]));

      const hk = HIND_KEYS, hj = HIND_JOINTS;
      const hpts = hj.map((i) => [side * hk[i].p[0], hk[i].p[1], hk[i].p[2]]);
      hpts[4] = [side * HIND_FOOT[0], HIND_FOOT[1], HIND_FOOT[2]];
      this._bone('femur' + sfx, 'pelvis', hpts[0]);
      this._bone('tibia' + sfx, 'femur' + sfx, hpts[1]);
      this._bone('hcannon' + sfx, 'tibia' + sfx, hpts[2]);
      this._bone('hpastern' + sfx, 'hcannon' + sfx, hpts[3]);
      this.legs.push(this._legDef(side, false, hpts,
        ['femur' + sfx, 'tibia' + sfx, 'hcannon' + sfx, 'hpastern' + sfx]));
    }

    this.root = this.byName['pelvis'];
    this.group.add(this.root);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
  };

  /* Pre-compute the planar (Y/Z) bind angles and segment lengths used by the
     analytic IK. alpha is measured from "straight down", positive forwards. */
  Giraffe.prototype._legDef = function (side, front, pts, boneNames) {
    const len = [], alpha = [];
    for (let i = 0; i < 4; i++) {
      const dy = pts[i + 1][1] - pts[i][1];
      const dz = pts[i + 1][2] - pts[i][2];
      len.push(Math.hypot(dy, dz));
      alpha.push(Math.atan2(dz, -dy));
    }
    return {
      side: side, front: front,
      boneNames: boneNames,
      bones: boneNames.map((n) => this.byName[n]),
      parent: this.byName[boneNames[0]].parent,
      hipLocal: this.byName[boneNames[0]].position.clone(),
      len: len, alpha: alpha,
      bendSign: front ? -1 : 1,
      rest: V3(pts[4][0], pts[4][1], pts[4][2]),
      name: (front ? 'F' : 'H') + (side < 0 ? 'L' : 'R')
    };
  };

  /* --------------------------------------------------------------------- */

  Giraffe.prototype._buildMesh = function (tex) {
    const B = new global.PartBuilder();
    const upY = V3(0, 1, 0), upZ = V3(0, 0, 1);
    const RADIAL_BODY = 30, RADIAL_LEG = 16;
    const BODY_SAMPLES = 190, LEG_SAMPLES = 72;

    /* --- body: arc-length lookup for the spine bones ------------------- */
    const bodySecs = global.resampleSections(BODY_KEYS, BODY_SAMPLES, upY);
    const spineNames = SPINE.map((s) => s[0]);
    const spineIdx = spineNames.map((n) => this.bi(n));
    const spineArc = spineNames.map((n) => {
      const p = this.bindPos[n];
      let best = 0, bd = 1e9;
      for (const s of bodySecs) {
        const d = s.p.distanceTo(p);
        if (d < bd) { bd = d; best = s.arc; }
      }
      return best;
    });

    function spineWeight(arc) {
      if (arc <= spineArc[0]) return [[spineIdx[0], 1]];
      for (let i = 0; i < spineArc.length - 1; i++) {
        if (arc <= spineArc[i + 1]) {
          const t = U.smoothstep(U.invLerp(spineArc[i], spineArc[i + 1], arc));
          return [[spineIdx[i], 1 - t], [spineIdx[i + 1], t]];
        }
      }
      return [[spineIdx[spineIdx.length - 1], 1]];
    }

    const _d = V3();
    const coatBody = function (sec, theta, p, c) {
      // How much the surface faces the ground decides where the coat gives way
      // to the plain cream of belly, chest and chin. Using the true surface
      // direction (not the ring angle) keeps the pattern on the front of the
      // neck, where the section frame has already rotated upright.
      _d.subVectors(p, sec.p).normalize();
      // Blend of "faces the ground" and "is on the ventral side of the section"
      // so the belly, brisket and chin go cream while the front of the neck —
      // where the section frame has tipped upright — keeps its patches.
      const down = 0.60 * -_d.y + 0.40 * -c;
      let pattern = 1 - 0.95 * U.smoothstep((down - 0.58) / 0.26);
      // Muzzle and the area around the nostrils are a pale grey-tan.
      if (p.z > 2.12 && p.y > 4.95) {
        pattern *= 1 - 0.58 * U.smoothstep((p.z - 2.14) / 0.32);
      }
      // Underside gently shadowed, dorsal line a touch deeper in colour.
      let tone = 1 - 0.13 * U.smoothstep((down - 0.2) / 0.8) + 0.03 * U.smoothstep(c);
      // Soft occlusion where the limbs plug into the trunk.
      const az = Math.abs(p.z - 0.86), hz = Math.abs(p.z + 0.88);
      if (p.y < 2.80 && (az < 0.34 || hz < 0.34)) {
        const d = Math.min(az, hz);
        tone *= 1 - 0.14 * U.smoothstep(1 - d / 0.34) * U.smoothstep((2.80 - p.y) / 0.45);
      }
      return [pattern, tone];
    };

    B.addTube(BODY_KEYS, {
      radial: RADIAL_BODY, samples: BODY_SAMPLES, refUp: upY,
      uTiles: 2, vFromPerimeter: true, vPow: 0.55, vRef: 1.55,
      material: MAT_COAT, capEnd: true,
      weight: (sec) => spineWeight(sec.arc),
      coat: coatBody
    });

    /* --- mane: a short upright ridge along the dorsal neck -------------- */
    {
      const spine = [];
      const kc = (t) => t * (BODY_KEYS.length - 1);
      const tmp = V3();
      for (const sec of bodySecs) {
        const k = kc(sec.t);
        if (k < 6.6 || k > 16.4) continue;
        const f = U.smoothstep((k - 6.6) / 1.6) * (1 - U.smoothstep((k - 15.0) / 1.4) * 0.7);
        // Short stiff bristles, so the crest is sawtoothed rather than a sail.
        const notch = 0.72 + 0.28 * Math.abs(Math.sin(sec.arc * 26));
        const h = (0.012 + 0.042 * f) * notch;
        global.ringPoint(sec, 0, tmp);
        const a = tmp.clone();
        spine.push({
          a: a, b: a.clone().addScaledVector(sec.N, h).addScaledVector(sec.T, -0.012),
          n: sec.side.clone(), arc: sec.arc
        });
      }
      B.addFin(spine, {
        material: MAT_MANE, vTiles: 6,
        weight: (s) => spineWeight(s.arc),
        coat: () => [1, 1]
      });
    }

    /* --- ossicones, ears, brow knob ------------------------------------ */
    const headIdx = this.bi('head');
    for (const side of [-1, 1]) {
      const sfx = side < 0 ? 'L' : 'R';
      // Ossicones: skin covered horn cores with a black hair tuft on top.
      const oss = [
        { p: [side * 0.068, 5.250, 1.918], rx: 0.058, rUp: 0.058, rDn: 0.058 },
        { p: [side * 0.076, 5.330, 1.908], rx: 0.050, rUp: 0.050, rDn: 0.050 },
        { p: [side * 0.086, 5.410, 1.897], rx: 0.044, rUp: 0.044, rDn: 0.044 },
        { p: [side * 0.094, 5.470, 1.889], rx: 0.045, rUp: 0.045, rDn: 0.045 }
      ];
      B.addTube(oss, {
        radial: 14, samples: 14, refUp: upZ, uTiles: 1, vFromPerimeter: true,
        material: MAT_COAT,
        weight: () => [[headIdx, 1]], coat: () => [0.08, 0.86]
      });
      const tuft = [
        { p: [side * 0.092, 5.462, 1.890], rx: 0.040, rUp: 0.040, rDn: 0.040 },
        { p: [side * 0.096, 5.494, 1.886], rx: 0.044, rUp: 0.044, rDn: 0.044 },
        { p: [side * 0.100, 5.522, 1.883], rx: 0.030, rUp: 0.030, rDn: 0.030 },
        { p: [side * 0.102, 5.538, 1.881], rx: 0.008, rUp: 0.008, rDn: 0.008 }
      ];
      B.addTube(tuft, {
        radial: 10, samples: 10, refUp: upZ, uTiles: 1, vFromPerimeter: true,
        material: MAT_MANE, capEnd: true,
        weight: () => [[headIdx, 1]], coat: () => [1, 1]
      });

      // Ears: broad near-vertical blades held out sideways. The frame here
      // has rx along the fore/aft axis (thickness) and rUp/rDn vertical.
      const earIdx = this.bi('ear' + sfx);
      const ear = [
        { p: [side * 0.135, 5.268, 1.878], rx: 0.034, rUp: 0.038, rDn: 0.038 },
        { p: [side * 0.205, 5.256, 1.860], rx: 0.019, rUp: 0.079, rDn: 0.066 },
        { p: [side * 0.285, 5.238, 1.834], rx: 0.014, rUp: 0.092, rDn: 0.074 },
        { p: [side * 0.355, 5.218, 1.810], rx: 0.010, rUp: 0.064, rDn: 0.050 },
        { p: [side * 0.404, 5.202, 1.794], rx: 0.004, rUp: 0.012, rDn: 0.010 }
      ];
      B.addTube(ear, {
        radial: 14, samples: 20, refUp: upY, uTiles: 1, vFromPerimeter: true,
        material: MAT_COAT, capEnd: true,
        weight: () => [[earIdx, 1]],
        coat: (sec, theta, p, c) => [0.30, Math.abs(c) > 0.55 ? 0.95 : 0.70]
      });
    }

    /* --- legs ----------------------------------------------------------- */
    const self = this;
    for (const leg of this.legs) {
      const srcKeys = leg.front ? FRONT_KEYS : HIND_KEYS;
      const joints = leg.front ? FRONT_JOINTS : HIND_JOINTS;
      const keys = srcKeys.map((k) => ({
        p: [leg.side * k.p[0], k.p[1], k.p[2]],
        rx: k.rx, rUp: k.rUp, rDn: k.rDn, e: 0.95
      }));
      const nk = keys.length - 1;
      const bIdx = leg.boneNames.map((n) => self.bi(n));
      const parentIdx = self.bi(leg.front ? 'scapula' + (leg.side < 0 ? 'L' : 'R') : 'pelvis');
      const hipY = leg.front ? FRONT_KEYS[1].p[1] : HIND_KEYS[1].p[1];

      const legWeight = function (sec, theta, p) {
        const kc = sec.t * nk;
        // Locate the key coordinate inside the four bone segments.
        let seg = 0, f = 0;
        if (kc <= joints[0]) { seg = 0; f = 0; }
        else if (kc >= joints[4]) { seg = 3; f = 1; }
        else {
          for (let i = 0; i < 4; i++) {
            if (kc <= joints[i + 1]) {
              seg = i; f = U.invLerp(joints[i], joints[i + 1], kc); break;
            }
          }
        }
        const out = [];
        // 50/50 blend across a narrow band at each joint, rigid in between.
        if (f < 0.16 && seg > 0) {
          const a = 0.5 * (1 - f / 0.16);
          out.push([bIdx[seg - 1], a], [bIdx[seg], 1 - a]);
        } else if (f > 0.84 && seg < 3) {
          const a = 0.5 * ((f - 0.84) / 0.16);
          out.push([bIdx[seg + 1], a], [bIdx[seg], 1 - a]);
        } else {
          out.push([bIdx[seg], 1]);
        }
        // Mass above the hip/shoulder socket stays mostly with the body.
        if (p.y > hipY) {
          const a = 0.72 * U.smoothstep((p.y - hipY) / 0.30);
          for (const o of out) o[1] *= (1 - a);
          out.push([parentIdx, a]);
        }
        return out;
      };

      B.addTube(keys, {
        radial: RADIAL_LEG, samples: LEG_SAMPLES, refUp: upZ,
        uTiles: 2, vFromPerimeter: true, vPow: 0.55, vRef: 0.62,
        material: MAT_COAT,
        weight: legWeight,
        coat: (sec, theta, p, c) => {
          // Lower legs fade to the characteristic pale cream stockings.
          const pat = U.lerp(0.06, 1.0, U.smoothstep((p.y - 0.78) / 0.72));
          const tone = 1 - 0.14 * U.smoothstep((-c - 0.2) / 0.8);
          return [pat, tone];
        }
      });

      // Hoof.
      const f3 = keys[joints[3]].p, f4 = keys[keys.length - 1].p;
      const dir = V3(f4[0] - f3[0], f4[1] - f3[1], f4[2] - f3[2]).normalize();
      const foot = V3(leg.side * (leg.front ? FRONT_FOOT : HIND_FOOT)[0],
        0, (leg.front ? FRONT_FOOT : HIND_FOOT)[2]);
      const hk = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4;
        const p = foot.clone().addScaledVector(dir, -(1 - t) * 0.145);
        const r = U.lerp(0.060, 0.084, U.smoothstep(t)) * (i === 4 ? 0.97 : 1);
        hk.push({ p: [p.x, p.y, p.z], rx: r, rUp: r * 1.04, rDn: r * 0.96, e: 0.8 });
      }
      B.addTube(hk, {
        radial: RADIAL_LEG, samples: 10, refUp: upZ, uTiles: 1,
        vFromPerimeter: true, material: MAT_HORN, capEnd: true,
        weight: () => [[bIdx[3], 1]], coat: () => [1, 1]
      });
    }

    /* --- tail ----------------------------------------------------------- */
    {
      const tailNames = ['pelvis', 'tail1', 'tail2', 'tail3'];
      const tailIdx = tailNames.map((n) => this.bi(n));
      const tailSecs = global.resampleSections(TAIL_KEYS, 40, upY);
      const tailArc = tailNames.map((n) => {
        const p = this.bindPos[n];
        let best = 0, bd = 1e9;
        for (const s of tailSecs) { const d = s.p.distanceTo(p); if (d < bd) { bd = d; best = s.arc; } }
        return best;
      });
      const tailWeight = (arc) => {
        for (let i = 0; i < tailArc.length - 1; i++) {
          if (arc <= tailArc[i + 1]) {
            const t = U.smoothstep(U.invLerp(tailArc[i], tailArc[i + 1], arc));
            return [[tailIdx[i], 1 - t], [tailIdx[i + 1], t]];
          }
        }
        return [[tailIdx[tailIdx.length - 1], 1]];
      };
      B.addTube(TAIL_KEYS, {
        radial: 14, samples: 40, refUp: upY, uTiles: 1, vFromPerimeter: true,
        material: MAT_COAT,
        weight: (sec) => tailWeight(sec.arc),
        coat: (sec, theta, p) => [U.smoothstep((p.y - 2.0) / 0.5) * 0.9, 1]
      });
      const t3 = this.bi('tail3');
      const tuft = [
        { p: [0, 1.870, -1.583], rx: 0.022, rUp: 0.022, rDn: 0.022 },
        { p: [0, 1.790, -1.586], rx: 0.048, rUp: 0.048, rDn: 0.048 },
        { p: [0, 1.650, -1.590], rx: 0.058, rUp: 0.058, rDn: 0.058 },
        { p: [0, 1.520, -1.592], rx: 0.048, rUp: 0.048, rDn: 0.048 },
        { p: [0, 1.430, -1.594], rx: 0.024, rUp: 0.024, rDn: 0.024 }
      ];
      B.addTube(tuft, {
        radial: 12, samples: 18, refUp: upZ, uTiles: 1, vFromPerimeter: true,
        material: MAT_DARK, capEnd: true,
        weight: () => [[t3, 1]], coat: () => [1, 1]
      });
      // A few loose hairs so the tuft does not read as a solid blob.
      const rnd = U.makeRandom(99);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * U.TAU + 0.3;
        const spine = [];
        for (let j = 0; j <= 6; j++) {
          const t = j / 6;
          const y = U.lerp(1.86, 1.33, t);
          const spread = 0.02 + t * (0.035 + rnd() * 0.04);
          const base = V3(Math.cos(a) * spread, y, -1.585 + Math.sin(a) * spread * 0.8);
          spine.push({
            a: base,
            b: base.clone().add(V3(Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02)),
            n: V3(-Math.sin(a), 0, Math.cos(a)), arc: 0
          });
        }
        B.addFin(spine, { material: MAT_DARK, vTiles: 1, weight: () => [[t3, 1]], coat: () => [1, 1] });
      }
    }

    /* --- assemble -------------------------------------------------------- */
    const geom = B.finish();
    const mats = [
      makeCoatMaterial(tex),
      new THREE.MeshStandardMaterial({
        color: 0x2a1c12, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({ color: 0x33302c, roughness: 0.55, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({
        color: 0x5c4026, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide
      })
    ];
    this.materials = mats;
    const mesh = new THREE.SkinnedMesh(geom, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.bind(this.skeleton);
    this.mesh = mesh;
    this.group.add(mesh);

    this._buildEyes();
  };

  Giraffe.prototype._buildEyes = function () {
    const head = this.byName['head'];
    const hp = this.bindPos['head'];
    const eyeGeo = new THREE.SphereGeometry(0.052, 20, 16);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x1a0f07, roughness: 0.14, metalness: 0.0
    });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x75512f, roughness: 0.9 });
    const lashMat = new THREE.MeshStandardMaterial({
      color: 0x2b1c10, roughness: 0.95, side: THREE.DoubleSide
    });
    const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x2a1d13, roughness: 0.55 });
    this.eyes = [];
    for (const side of [-1, 1]) {
      const p = new THREE.Vector3(side * 0.138, 5.283, 2.008).sub(hp);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.copy(p);
      eye.scale.set(0.86, 1.0, 0.94);
      head.add(eye);
      this.eyes.push(eye);

      // Fleshy lid ring sunk around the protruding globe.
      const lid = new THREE.Mesh(new THREE.TorusGeometry(0.049, 0.016, 10, 24), lidMat);
      lid.position.copy(p).addScaledVector(new THREE.Vector3(side, 0.06, 0.04), 0.016);
      lid.rotation.set(0.12, side * Math.PI / 2, side * 0.22);
      lid.scale.set(1.05, 1.0, 0.86);
      head.add(lid);

      // Giraffes have conspicuously long upper lashes.
      const lash = new THREE.Mesh(new THREE.CircleGeometry(0.085, 14, 3.5, 1.5), lashMat);
      lash.position.copy(p).addScaledVector(new THREE.Vector3(side, 0, 0), 0.024);
      lash.rotation.set(0.0, side * Math.PI / 2, side * 0.3);
      lash.scale.set(1, 0.62, 1);
      head.add(lash);

      // Nostril.
      const nos = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), nostrilMat);
      nos.position.copy(new THREE.Vector3(side * 0.058, 5.188, 2.468).sub(hp));
      nos.scale.set(0.7, 1.0, 1.5);
      head.add(nos);
    }
  };

  /* Coat shader: the texture only supplies the brown/cream reticulation. The
     per-vertex aCoat attribute decides how much of it survives (so bellies,
     stockings and muzzle turn plain cream) and adds soft occlusion. */
  function makeCoatMaterial(tex) {
    const m = new THREE.MeshStandardMaterial({
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: 0.0045,
      roughnessMap: tex.roughnessMap,
      roughness: 1.0,
      metalness: 0.0
    });
    m.onBeforeCompile = function (shader) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\nattribute vec2 aCoat;\nvarying vec2 vCoat;')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n\tvCoat = aCoat;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          '#include <common>\nvarying vec2 vCoat;')
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          'vec3 creamLin = vec3( 0.673, 0.597, 0.408 );',
          'float coatLum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );',
          'vec3 pale = creamLin * ( 0.80 + 0.55 * coatLum );',
          'diffuseColor.rgb = mix( pale, diffuseColor.rgb, vCoat.x );',
          'diffuseColor.rgb *= vCoat.y;'
        ].join('\n'));
    };
    return m;
  }

  global.Giraffe = Giraffe;
})(window);
