// The giraffe: procedural model builder + walking animation.
//
// Model is built along the local axes:
//   +Z : forward (walking direction)
//   +Y : up
//   +X : left side of the animal
// The animation function drives a joint hierarchy (legs, neck, head, tail).




const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- skeleton
const DIMS = {
  shoulderY: 3.28,
  hipY: 3.34,
  shoulderZ: 1.18,
  hipZ: -1.32,
  legLen: 3.24,          // hip to ground
  neckStart: V3(0, 3.85, 1.42),
  neckEnd: V3(0, 6.42, 2.16),
  headLen: 1.12,
  bodyLen: 3.1,
};

function limbSegment(rTop, rBot, len, radial = 14) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, radial, 1, true);
  geo.translate(0, -len / 2, 0); // origin at the joint, hangs down
  return toAtlasUV(geo, ATLAS.LEG);
}

function legTube(spineFn, opts = {}) {
  const geo = tubeAlong(spineFn, opts);
  // leg strip spans the v band [0.06, 0.44]; zoom in (smaller patches) and
  // stay clear of the seam blend at the strip edges
  tubeAtlasUV(geo, ATLAS.LEG, { uvShift: 0.18, vScale: 0.28, vOff: 0.11, vFlip: true });
  return geo;
}

function hoofGeometry(r, h) {
  const geo = new THREE.CylinderGeometry(r * 1.02, r * 0.86, h, 14, 1, false);
  geo.translate(0, -h / 2, 0);
  return toAtlasUV(geo, ATLAS.HOOF);
}

// A solid body "cap": a scaled sphere sampled from the body atlas patch so the
// patch pattern lines up seamlessly with the spine tube around it.
// UVs are mapped inside the safe area of the patch (no clamping at edges).
function bodyLobe(rx, ry, rz, uPos, vPos, uvScale = 1) {
  const geo = new THREE.SphereGeometry(1, 20, 16);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const patch = ATLAS.BODY;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    pos.setXYZ(i, x * rx, y * ry, z * rz);
    // x,y,z are unit-sphere coordinates here; approximate the spine tube flow:
    // u ~ world Z, v ~ around-the-body angle, kept inside the patch
    const u = 0.5 + (z * 0.22 + (uPos - 0.5)) / uvScale;
    const v = 0.75 + (0.11 * x + 0.28 * y + (vPos - 0.75)) / uvScale;
    uv.setXY(i,
      patch.u0 + (patch.u1 - patch.u0) * u,
      patch.v0 + (patch.v1 - patch.v0) * v);
  }
  uv.needsUpdate = true;
  return geo;
}

// Build one leg. Root group at the hip/shoulder; groups pivot at joints.
function buildLeg(mat, { upperLen, lowerLen, pasternLen, rUpper, rMid, rLower, rPastern, hoofR, hoofH }) {
  const root = new THREE.Group();

  const upper = new THREE.Mesh(legTube((t) => V3(0, -t * upperLen, 0), {
    steps: 12, radial: 16, capStart: true,
    radiusFn: (t) => rUpper + (rMid - rUpper) * t,
  }), mat);
  root.add(upper);

  const knee = new THREE.Group();
  knee.position.y = -upperLen;
  root.add(knee);

  const lower = new THREE.Mesh(legTube((t) => V3(0, -t * lowerLen, 0), {
    steps: 12, radial: 14,
    radiusFn: (t) => rMid + (rLower - rMid) * t,
  }), mat);
  knee.add(lower);

  const ankle = new THREE.Group();
  ankle.position.y = -lowerLen;
  knee.add(ankle);

  const pastern = new THREE.Mesh(legTube((t) => V3(0, -t * pasternLen, 0), {
    steps: 8, radial: 12,
    radiusFn: (t) => rLower + (rPastern - rLower) * t,
  }), mat);
  ankle.add(pastern);

  const hoof = new THREE.Mesh(hoofGeometry(hoofR, hoofH), mat);
  hoof.position.y = -pasternLen + hoofH * 0.5;
  ankle.add(hoof);

  // knee cap bump for a less mechanical silhouette
  const cap = new THREE.Mesh(new THREE.SphereGeometry(rMid * 0.92, 12, 10), mat);
  cap.position.set(0, 0, rMid * 0.16);
  cap.scale.set(0.95, 1.1, 0.75);
  toAtlasUV(cap.geometry, ATLAS.LEG);
  knee.add(cap);

  return { root, knee, ankle, hoof };
}

// ------------------------------------------------------------------- head
function buildHead(mat) {
  const head = new THREE.Group();

  // skull + cheeks
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.30, 20, 16), mat);
  skull.scale.set(0.72, 0.98, 1.30);
  toAtlasUV(skull.geometry, ATLAS.BODY);
  head.add(skull);

  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat);
  cheek.position.set(0, -0.12, -0.18);
  cheek.scale.set(0.82, 0.9, 1.1);
  toAtlasUV(cheek.geometry, ATLAS.BODY);
  head.add(cheek);

  // tapering muzzle toward +Z
  const muzzle = new THREE.Mesh(tubeAlong((t) => V3(0, -0.06 - 0.16 * t, 0.18 + t * 0.82), {
    steps: 14, radial: 16,
    radiusFn: (t) => 0.215 - 0.075 * t * t,
    ryFactorFn: (t) => 0.88 + 0.1 * t,
    capEnd: true,
  }), mat);
  tubeAtlasUV(muzzle.geometry, ATLAS.BODY);
  head.add(muzzle);

  // dark muzzle cap + nostrils + mouth line
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), mat);
  nose.position.set(0, -0.225, 0.99);
  nose.scale.set(0.92, 0.66, 0.55);
  toAtlasUV(nose.geometry, ATLAS.MUZZLE);
  head.add(nose);

  for (const s of [-1, 1]) {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), mat);
    nostril.position.set(s * 0.075, -0.19, 1.075);
    nostril.scale.set(1, 0.75, 0.5);
    toAtlasUV(nostril.geometry, ATLAS.NOSTRIL);
    head.add(nostril);
  }

  // eyes: dark almond + glint, set on the sides of the skull
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), mat);
    eye.position.set(s * 0.218, 0.085, 0.155);
    eye.scale.set(0.55, 1.0, 1.2);
    toAtlasUV(eye.geometry, ATLAS.EYE);
    head.add(eye);

    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), mat);
    glint.position.set(s * 0.258, 0.115, 0.185);
    glint.scale.set(0.4, 1, 1);
    toAtlasUV(glint.geometry, ATLAS.EYELIGHT);
    head.add(glint);

    // upper eyelid: a sliver of skin over the eye for a soft almond shape
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), mat);
    lid.position.set(s * 0.212, 0.135, 0.15);
    lid.scale.set(0.55, 0.42, 1.25);
    toAtlasUV(lid.geometry, ATLAS.BODY);
    head.add(lid);

    // heavy brow ridge
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 8), mat);
    brow.position.set(s * 0.205, 0.19, 0.13);
    brow.scale.set(0.55, 0.42, 1.35);
    toAtlasUV(brow.geometry, ATLAS.BODY);
    head.add(brow);

    // ear
    const earPivot = new THREE.Group();
    earPivot.position.set(s * 0.215, 0.285, -0.11);
    earPivot.rotation.z = -s * 1.32;
    earPivot.rotation.y = s * 0.30;
    earPivot.rotation.x = -0.25;
    const ear = new THREE.Mesh(earGeometry(), mat);
    ear.scale.set(0.50, 0.50, 0.50);
    earPivot.add(ear);
    head.add(earPivot);
  }

  // ossicones
  for (const s of [-1, 1]) {
    const ossi = new THREE.Group();
    ossi.position.set(s * 0.115, 0.26, 0.03);
    ossi.rotation.x = -0.18;
    ossi.rotation.z = -s * 0.10;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.052, 0.34, 10), mat);
    shaft.position.y = 0.17;
    toAtlasUV(shaft.geometry, ATLAS.OSSICONE, 'polar');
    ossi.add(shaft);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), mat);
    knob.position.y = 0.355;
    toAtlasUV(knob.geometry, ATLAS.HORNKNOB);
    ossi.add(knob);
    head.add(ossi);
  }

  // tuft of hair between the ossicones
  const forelock = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.22, 8), mat);
  forelock.position.set(0, 0.36, 0.13);
  forelock.rotation.x = 0.75;
  toAtlasUV(forelock.geometry, ATLAS.MANE);
  head.add(forelock);

  return head;
}

// ---------------------------------------------------------------- giraffe
// Capsule-like ear: a flattened, slightly curled leaf shape, base at y=0.
function earGeometry() {
  const geo = new THREE.SphereGeometry(1, 16, 14);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // leaf profile: narrow at the base (y=0), widest at 40%, pointed tip
    const t = (y + 1) / 2; // 0..1 along the ear
    const w = Math.sin(Math.pow(t, 0.75) * Math.PI) * (0.9 - 0.25 * t) + 0.12;
    const curl = x * x * 0.55 + Math.abs(y) * 0.10;
    pos.setXYZ(i, x * 0.30 * w, y * 0.58 + 0.02, z * 0.09 * w + curl * 0.12);
  }
  geo.translate(0, 0.58, 0);
  geo.computeVertexNormals();
  return toAtlasUV(geo, ATLAS.BODY);
}

function buildGiraffe() {
  const texture = buildGiraffeTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.88,
    metalness: 0.0,
  });

  const giraffe = new THREE.Group();

  // --- body (spine tube: hips -> shoulders), slightly barrel-shaped
  const bodyGeo = tubeAlong((t) => V3(0, 3.28 + 0.18 * Math.sin(t * Math.PI), -1.42 + t * DIMS.bodyLen), {
    steps: 30, radial: 26,
    radiusFn: (t) => 0.56 + 0.28 * Math.sin(Math.PI * Math.pow(t, 0.85)),
    ryFactorFn: (t) => 1.08,
    capStart: true, capEnd: true,
  });
  tubeAtlasUV(bodyGeo, ATLAS.BODY);
  const body = new THREE.Mesh(bodyGeo, mat);
  giraffe.add(body);

  // withers / shoulder hump
  const withers = new THREE.Mesh(bodyLobe(0.52, 0.34, 0.68, 0.20, 0.62, 1.7), mat);
  withers.position.set(0, 3.74, 1.10);
  giraffe.add(withers);

  // chest mass
  const chest = new THREE.Mesh(bodyLobe(0.50, 0.56, 0.50, 0.20, 0.72, 1.7), mat);
  chest.position.set(0, 3.28, 1.05);
  giraffe.add(chest);

  // rump
  const rump = new THREE.Mesh(bodyLobe(0.56, 0.56, 0.58, 0.50, 0.62, 1.7), mat);
  rump.position.set(0, 3.42, -1.42);
  giraffe.add(rump);

  // neck saddle: closes the gap where the tilted neck tube meets the body
  const neckSaddle = new THREE.Mesh(bodyLobe(0.44, 0.46, 0.46, 0.20, 0.62, 1.7), mat);
  neckSaddle.position.set(0, 3.85, 1.32);
  giraffe.add(neckSaddle);

  // --- neck
  const neckPivot = new THREE.Group();
  neckPivot.position.copy(DIMS.neckStart);
  giraffe.add(neckPivot);

  const neckDir = new THREE.Vector3().subVectors(DIMS.neckEnd, DIMS.neckStart);
  const neckLen = neckDir.length();
  const neckGeo = tubeAlong((t) => V3(0, t * neckLen, 0), {
    steps: 22, radial: 18,
    radiusFn: (t) => 0.34 - 0.11 * t,
    ryFactorFn: (t) => 1.02,
  });
  tubeAtlasUV(neckGeo, ATLAS.BODY);
  const neck = new THREE.Mesh(neckGeo, mat);
  neckPivot.add(neck);
  // orient the neck pivot so +Y follows the neck direction
  neckPivot.quaternion.setFromUnitVectors(V3(0, 1, 0), neckDir.clone().normalize());

  // mane along the back edge of the neck (in neck-local space)
  const maneLocal = maneGeometry(
    40,
    (t) => V3(0, 0.18 + t * (neckLen - 0.26), -0.30 + 0.13 * t),
    (t) => 0.30 - 0.06 * t,
    0.09,
  );
  const mane = new THREE.Mesh(maneLocal, mat);
  neckPivot.add(mane);

  // --- head
  const headPivot = new THREE.Group();
  headPivot.position.set(0, neckLen, 0);
  neckPivot.add(headPivot);
  const head = buildHead(mat);
  head.position.set(0, 0.16, -0.16);
  head.rotation.x = -0.52; // muzzle tilted down-forward
  headPivot.add(head);

  // --- legs
  const legSpec = {
    front: {
      upperLen: 1.58, lowerLen: 1.34, pasternLen: 0.33,
      rUpper: 0.26, rMid: 0.155, rLower: 0.115, rPastern: 0.10,
      hoofR: 0.125, hoofH: 0.16,
    },
    hind: {
      upperLen: 1.66, lowerLen: 1.36, pasternLen: 0.30,
      rUpper: 0.285, rMid: 0.165, rLower: 0.115, rPastern: 0.10,
      hoofR: 0.125, hoofH: 0.16,
    },
  };
  const legs = [];
  for (const side of [-1, 1]) {
    const front = buildLeg(mat, legSpec.front);
    front.root.position.set(side * 0.46, DIMS.shoulderY, DIMS.shoulderZ);
    giraffe.add(front.root);
    legs.push({ ...front, kind: 'front', side });

    const hind = buildLeg(mat, legSpec.hind);
    hind.root.position.set(side * 0.50, DIMS.hipY, DIMS.hipZ);
    giraffe.add(hind.root);
    legs.push({ ...hind, kind: 'hind', side });
  }

  // --- tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 3.86, -1.92);
  giraffe.add(tailPivot);
  const tailGeo = tubeAlong((t) => V3(0, -0.15 - t * 1.42, -0.16 - t * 0.30), {
    steps: 14, radial: 10,
    radiusFn: (t) => 0.075 - 0.032 * t,
    ryFactorFn: () => 1,
    capEnd: true,
  });
  tubeAtlasUV(tailGeo, ATLAS.LEG);
  tailPivot.add(new THREE.Mesh(tailGeo, mat));
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), mat);
  tuft.position.set(0, -1.62, -0.50);
  tuft.scale.set(0.75, 1.65, 0.75);
  tuft.rotation.x = 0.35;
  toAtlasUV(tuft.geometry, ATLAS.MANE);
  tailPivot.add(tuft);

  return {
    group: giraffe,
    parts: { neckPivot, headPivot, head, tailPivot, legs, body },
    material: mat,
  };
}

// ----------------------------------------------------------------- gait
// Walk cycle: lateral-sequence footfall (LH, LF, RH, RF), 4-beat walk.
// Hoof targets are computed in body space with a planted stance phase, and a
// 2-link IK solve keeps the hooves planted without sliding.
const WALK = {
  cycle: 2.0,           // seconds per stride cycle at speed 1
  strideSpeed: 1.15,    // m/s of forward travel at speed 1 (matches main.js)
  duty: 0.62,           // fraction of the cycle a foot is planted
  swingHeight: 0.34,    // hoof lift during swing (m)
  hoofY: 0.09,          // hoof center height when planted (m)
  bodyBob: 0.05,
  bodyPitch: 0.016,
  neckSway: 0.035,
  neckBob: 0.020,
  headBob: 0.045,
  headYaw: 0.055,
  tailSway: 0.22,
};

// per-leg linkage lengths (hip->knee, knee->hoof)
const LINKS = {
  front: { L1: 1.58, L2: 1.67 },
  hind: { L1: 1.66, L2: 1.66 },
};

function makeAnimator(parts) {
  const { neckPivot, headPivot, tailPivot, legs } = parts;
  const baseNeckQuat = neckPivot.quaternion.clone();
  const baseHeadRot = headPivot.rotation.clone();

  // lateral sequence: LH 0, LF 0.25, RH 0.5, RF 0.75
  const phaseOf = (leg) => {
    if (leg.kind === 'hind') return leg.side < 0 ? 0.0 : 0.5;
    return leg.side < 0 ? 0.25 : 0.75;
  };
  for (const leg of legs) {
    leg.phase = phaseOf(leg);
    leg.links = LINKS[leg.kind];
    leg.hipY = leg.root.position.y;
    leg.hipZ = leg.root.position.z;
  }

  // hoof trajectory in body space, relative to the hip, for cycle phase p
  const half = WALK.duty * WALK.strideSpeed * WALK.cycle / 2;
  function footTarget(p, out) {
    if (p < WALK.duty) {
      const u = p / WALK.duty;
      out.y = WALK.hoofY + 0.015 * Math.sin(Math.PI * u);
      out.z = half - 2 * half * u;
    } else {
      const u = (p - WALK.duty) / (1 - WALK.duty);
      const ez = u * u * (3 - 2 * u); // smoothstep
      out.y = WALK.hoofY + WALK.swingHeight * Math.pow(Math.sin(Math.PI * u), 1.2);
      out.z = -half + 2 * half * ez;
    }
    return out;
  }

  // 2-link IK in the sagittal plane; returns joint rotations about X
  function solveIK(hipY, hipZ, ty, tz, L1, L2, out) {
    const dy = ty - hipY, dz = tz - hipZ;
    let d = Math.hypot(dy, dz);
    const dMax = (L1 + L2) * 0.995;
    const dMin = Math.abs(L1 - L2) + 0.15;
    d = Math.min(dMax, Math.max(dMin, d));
    const alpha = Math.atan2(-dz, -dy);
    const b = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const c = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
    out.root = alpha - b;      // femur: knee apex forward
    out.knee = Math.PI - c;    // lower leg swings backward
    return out;
  }

  const tmp = { y: 0, z: 0 };
  const ik = { root: 0, knee: 0 };

  return function animate(time, speed = 1) {
    const w = (time * speed) / WALK.cycle;
    const tau = Math.PI * 2;

    for (const leg of legs) {
      const p = (w + leg.phase) % 1;
      footTarget(p, tmp);
      solveIK(leg.hipY, leg.hipZ, tmp.y, leg.hipZ + tmp.z,
        leg.links.L1, leg.links.L2, ik);

      leg.root.rotation.x = ik.root;
      leg.knee.rotation.x = ik.knee;
      // keep the hoof roughly level with the ground
      leg.ankle.rotation.x = -(ik.root + ik.knee) * 0.92;
      // slight lateral splay keeps feet under the body
      leg.root.rotation.z = leg.side * 0.03 * (1 + 0.25 * Math.sin(tau * (w + leg.phase)));
    }

    // body bob & pitch ride on the inner model group (the walker group in
    // main.js owns forward travel, so it is left untouched)
    const bodyRoot = parts.body;
    bodyRoot.position.y = WALK.bodyBob * Math.sin(tau * w * 2 + 0.6);
    bodyRoot.rotation.x = WALK.bodyPitch * Math.sin(tau * w + 1.2);
    bodyRoot.rotation.z = 0.012 * Math.sin(tau * w);

    // neck & head secondary motion
    const q = new THREE.Quaternion();
    q.setFromEuler(new THREE.Euler(
      WALK.neckBob * Math.sin(tau * w * 2 + 2.0),
      WALK.neckSway * Math.sin(tau * w + 0.4),
      WALK.neckSway * 0.6 * Math.sin(tau * w + 1.9),
    ));
    neckPivot.quaternion.copy(baseNeckQuat).multiply(q);

    headPivot.rotation.set(
      baseHeadRot.x + WALK.headBob * Math.sin(tau * w * 2 + 3.1),
      baseHeadRot.y + WALK.headYaw * Math.sin(tau * w + 1.1),
      baseHeadRot.z + WALK.headBob * 0.5 * Math.sin(tau * w * 2 + 0.2),
    );

    // tail flicks
    tailPivot.rotation.x = 0.10 * Math.sin(tau * w + 2.2);
    tailPivot.rotation.z = WALK.tailSway * Math.sin(tau * w * 0.5 + 1.0)
      + 0.06 * Math.sin(tau * w * 2);
  };
}
