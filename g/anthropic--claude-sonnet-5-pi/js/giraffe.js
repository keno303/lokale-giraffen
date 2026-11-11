/* giraffe.js
 * Procedural low/medium-poly giraffe built from primitive geometries,
 * with a hand-tuned walk-cycle animation (no skinning / bones needed).
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------
  // Reticulated-giraffe hide texture, generated procedurally on a
  // canvas so the model needs no external image assets.
  // ---------------------------------------------------------------
  function buildHideTexture() {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // cream background (the thin "net" lines of a giraffe's coat)
    ctx.fillStyle = '#e4c58f';
    ctx.fillRect(0, 0, size, size);

    // Build a Voronoi-ish patchwork of rounded polygon blotches by
    // scattering points and growing organic blobs around them.
    const rng = mulberry32(1337);
    const points = [];
    const cell = 72;
    for (let y = -cell; y < size + cell; y += cell) {
      for (let x = -cell; x < size + cell; x += cell) {
        points.push({
          x: x + (rng() - 0.5) * cell * 0.9,
          y: y + (rng() - 0.5) * cell * 0.9,
          r: cell * (0.34 + rng() * 0.18)
        });
      }
    }

    const browns = ['#8a5a2b', '#9c6530', '#7c4e24', '#875324'];

    points.forEach((p) => {
      ctx.fillStyle = browns[Math.floor(rng() * browns.length)];
      drawBlob(ctx, p.x, p.y, p.r, rng);
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  function drawBlob(ctx, cx, cy, radius, rng) {
    const pts = 10;
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = radius * (0.72 + rng() * 0.45);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------
  // Helper to build a tapered leg segment that looks less like a
  // bare cylinder (slightly bulged in the middle).
  // ---------------------------------------------------------------
  function makeLegMesh(length, rTop, rBottom, material) {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, length, 10, 1, false);
    geo.translate(0, -length / 2, 0);
    return new THREE.Mesh(geo, material);
  }

  function makeJoint(radius, material) {
    const geo = new THREE.SphereGeometry(radius, 10, 8);
    return new THREE.Mesh(geo, material);
  }

  // ---------------------------------------------------------------
  // Main factory
  // ---------------------------------------------------------------
  function createGiraffe() {
    const hideTex = buildHideTexture();
    hideTex.repeat.set(2, 2);

    const hideMat = new THREE.MeshStandardMaterial({
      map: hideTex,
      roughness: 0.85,
      metalness: 0.02
    });
    const hideMatLegs = new THREE.MeshStandardMaterial({
      map: hideTex,
      roughness: 0.85,
      metalness: 0.02
    });
    hideMatLegs.map = hideTex.clone();
    hideMatLegs.map.repeat.set(1, 2.4);
    hideMatLegs.map.needsUpdate = true;

    const hoofMat = new THREE.MeshStandardMaterial({
      color: 0x2c2117,
      roughness: 0.6
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x4a3420,
      roughness: 0.7
    });
    const creamMat = new THREE.MeshStandardMaterial({
      color: 0xe8d1a0,
      roughness: 0.8
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x120d08,
      roughness: 0.3,
      metalness: 0.1
    });
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0x8b6f4e,
      roughness: 0.6
    });

    const root = new THREE.Group();
    root.name = 'giraffeRoot';

    // ---- proportions -------------------------------------------------
    const upperLegLen = 1.35;
    const lowerLegLen = 1.3;
    const hoofHeight = 0.16;
    const legTopY = upperLegLen + lowerLegLen + hoofHeight; // height of hip/shoulder pivots

    const torsoLength = 2.7;
    const bodyY = legTopY + 0.42; // torso sits a bit above leg tops

    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = bodyY;
    root.add(bodyGroup);

    // ---- torso --------------------------------------------------------
    // Built as a lathed profile (radius vs. position along the length
    // axis) so we get a proper tapered barrel shape -- fuller at the
    // chest/shoulders, slimmer toward the rump -- instead of a plain
    // scaled sphere. The lathe revolves around Y, so we build the
    // profile along Y then rotate the whole mesh so Y becomes the
    // fore/aft (local +X) axis.
    const torsoProfile = [
      new THREE.Vector2(0.30, 0.00),   // rump (tail end)
      new THREE.Vector2(0.40, 0.14),
      new THREE.Vector2(0.47, 0.34),
      new THREE.Vector2(0.50, 0.55),   // widest point, mid-back/belly
      new THREE.Vector2(0.49, 0.74),
      new THREE.Vector2(0.44, 0.90),
      new THREE.Vector2(0.37, 1.00)    // chest (front end, narrows toward neck base)
    ].map((v) => new THREE.Vector2(v.x, v.y * torsoLength));
    const torsoGeo = new THREE.LatheGeometry(torsoProfile, 20);
    // rotateZ(-90deg) maps the lathe's Y (length) axis onto +X directly,
    // i.e. rump (y=0) -> x=0, chest (y=torsoLength) -> x=torsoLength,
    // with no front/back flip; then recenter so x spans +/- torsoLength/2.
    torsoGeo.rotateZ(-Math.PI / 2);
    torsoGeo.translate(-torsoLength * 0.5, 0, 0);
    // flatten the belly slightly and raise the back midline a touch so
    // the cross-section reads as a body rather than a perfect tube
    squashTorso(torsoGeo);
    const torso = new THREE.Mesh(torsoGeo, hideMat);
    torso.position.set(torsoLength * 0.02, 0.06, 0);
    torso.rotation.z = -0.045; // chest slightly higher than rump
    bodyGroup.add(torso);

    // shoulder/withers bulge where the neck base meets the body
    const withersGeo = new THREE.SphereGeometry(0.4, 12, 10);
    const withers = new THREE.Mesh(withersGeo, hideMat);
    withers.position.set(torsoLength * 0.46, 0.34, 0);
    withers.scale.set(0.8, 0.85, 0.82);
    bodyGroup.add(withers);

    // rump cap, rounds off the lathe's rear a bit more naturally
    const rumpGeo = new THREE.SphereGeometry(0.3, 12, 10);
    const rump = new THREE.Mesh(rumpGeo, hideMat);
    rump.position.set(-torsoLength * 0.49, 0.03, 0);
    rump.scale.set(0.6, 0.95, 0.95);
    bodyGroup.add(rump);

    // ---- legs -----------------------------------------------------------
    function buildLeg(x, z, front) {
      const pivot = new THREE.Group();
      pivot.position.set(x, -bodyY + legTopY, z);
      bodyGroup.add(pivot);

      const upperRTop = front ? 0.165 : 0.16;
      const upper = makeLegMesh(upperLegLen, upperRTop, 0.12, hideMatLegs);
      pivot.add(upper);

      const kneeJoint = makeJoint(0.125, hideMatLegs);
      kneeJoint.position.y = -upperLegLen;
      pivot.add(kneeJoint);

      const kneePivot = new THREE.Group();
      kneePivot.position.y = -upperLegLen;
      pivot.add(kneePivot);

      const lower = makeLegMesh(lowerLegLen, 0.115, 0.085, hideMatLegs);
      kneePivot.add(lower);

      const ankleJoint = makeJoint(0.09, darkMat);
      ankleJoint.position.y = -lowerLegLen;
      kneePivot.add(ankleJoint);

      const hoofGeo = new THREE.CylinderGeometry(0.1, 0.09, hoofHeight, 8);
      const hoof = new THREE.Mesh(hoofGeo, hoofMat);
      hoof.position.y = -lowerLegLen - hoofHeight / 2;
      kneePivot.add(hoof);

      return { pivot, kneePivot };
    }

    const legSpreadX = torsoLength * 0.37;
    const legSpreadZ = 0.3;

    const legFL = buildLeg(legSpreadX, legSpreadZ, true);
    const legFR = buildLeg(legSpreadX, -legSpreadZ, true);
    const legHL = buildLeg(-legSpreadX, legSpreadZ, false);
    const legHR = buildLeg(-legSpreadX, -legSpreadZ, false);

    // ---- neck + head -----------------------------------------------------
    const neckPivot = new THREE.Group();
    neckPivot.position.set(torsoLength * 0.52, 0.42, 0);
    neckPivot.rotation.z = -1.15; // lean neck forward/up
    bodyGroup.add(neckPivot);

    const neckLength = 2.75;
    const neckGeo = new THREE.CylinderGeometry(0.2, 0.34, neckLength, 12, 3);
    neckGeo.translate(0, neckLength / 2, 0);
    // bend the neck slightly using vertex displacement for a natural S-curve
    bendCylinder(neckGeo, neckLength, 0.22);
    const neck = new THREE.Mesh(neckGeo, hideMat);
    neckPivot.add(neck);

    // mane strip along the back of the neck -- a thin crest hugging the
    // neck's taper rather than a thick floating slab.
    const maneGeo = new THREE.BoxGeometry(0.045, neckLength * 0.9, 0.09);
    maneGeo.translate(0, neckLength * 0.5, 0);
    const mane = new THREE.Mesh(maneGeo, darkMat);
    mane.position.z = -0.25;
    neckPivot.add(mane);

    const headPivot = new THREE.Group();
    headPivot.position.y = neckLength + 0.05;
    neckPivot.add(headPivot);
    headPivot.rotation.z = 1.0; // compensate neck tilt to bring head to roughly-horizontal

    // skull
    const skullGeo = new THREE.SphereGeometry(0.26, 14, 10);
    skullGeo.scale(1.15, 0.85, 0.78);
    const skull = new THREE.Mesh(skullGeo, hideMat);
    headPivot.add(skull);

    // muzzle / snout
    const muzzleGeo = new THREE.CylinderGeometry(0.12, 0.155, 0.42, 10);
    muzzleGeo.rotateZ(Math.PI / 2);
    muzzleGeo.translate(0.42, -0.05, 0);
    const muzzle = new THREE.Mesh(muzzleGeo, creamMat);
    headPivot.add(muzzle);

    const noseGeo = new THREE.SphereGeometry(0.1, 10, 8);
    const nose = new THREE.Mesh(noseGeo, darkMat);
    nose.position.set(0.63, -0.08, 0);
    nose.scale.set(1, 0.8, 0.9);
    headPivot.add(nose);

    // eyes -- set into the sides of the skull, roughly level with the
    // bridge of the muzzle.
    [1, -1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), eyeMat);
      eye.position.set(0.14, 0.03, side * 0.235);
      headPivot.add(eye);
      const brow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), hideMat);
      brow.position.set(0.12, 0.09, side * 0.22);
      brow.scale.set(1, 0.5, 0.8);
      headPivot.add(brow);
    });

    // ears -- small flattened ovals sticking out to the sides, below
    // the ossicones.
    [1, -1].forEach((side) => {
      const earGeo = new THREE.SphereGeometry(0.1, 10, 8);
      earGeo.scale(1, 0.55, 1.7);
      const ear = new THREE.Mesh(earGeo, hideMat);
      ear.position.set(-0.07, 0.1, side * 0.3);
      ear.rotation.z = side * 0.35;
      ear.rotation.y = side * 0.55;
      headPivot.add(ear);
    });

    // ossicones (the little horn-knobs on top of a giraffe's head)
    [1, -1].forEach((side) => {
      const hornGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.26, 8);
      hornGeo.translate(0, 0.13, 0);
      const horn = new THREE.Mesh(hornGeo, hornMat);
      horn.position.set(-0.02, 0.24, side * 0.1);
      headPivot.add(horn);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), darkMat);
      tip.position.set(-0.02, 0.38, side * 0.1);
      headPivot.add(tip);
    });

    // ---- tail --------------------------------------------------------
    const tailPivot = new THREE.Group();
    tailPivot.position.set(-torsoLength * 0.52, 0.1, 0);
    tailPivot.rotation.z = Math.PI * 0.62;
    bodyGroup.add(tailPivot);

    const tailLen = 1.3;
    const tailGeo = new THREE.CylinderGeometry(0.06, 0.025, tailLen, 8);
    tailGeo.translate(0, tailLen / 2, 0);
    const tail = new THREE.Mesh(tailGeo, hideMat);
    tailPivot.add(tail);

    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), darkMat);
    tuft.position.y = tailLen + 0.04;
    tuft.scale.set(0.8, 1.3, 0.8);
    tailPivot.add(tuft);

    // ---------------------------------------------------------------
    // Animation state + update function
    // ---------------------------------------------------------------
    const legs = [
      { ...legFL, phase: 0, front: true },
      { ...legFR, phase: Math.PI, front: true },
      { ...legHL, phase: 0, front: false },
      { ...legHR, phase: Math.PI, front: false }
    ];

    const HIP_SWING = 0.5;      // max fore/aft swing angle (radians)
    const KNEE_BEND = 0.85;     // max knee flex angle
    const WALK_FREQ = 2.1;      // cycle speed

    let cycleT = 0;

    function update(dt, speedMul) {
      speedMul = speedMul === undefined ? 1 : speedMul;
      cycleT += dt * WALK_FREQ * speedMul;

      legs.forEach((leg) => {
        const theta = cycleT + leg.phase;
        const s = Math.sin(theta);
        const hip = HIP_SWING * s;
        // knee bends mostly while the leg is swinging forward (the
        // "catch up" half of the cycle), stays near-straight on the
        // ground-contact / propulsion half.
        const swingLift = Math.max(0, Math.sin(theta - 0.9));
        const knee = KNEE_BEND * swingLift;

        leg.pivot.rotation.x = hip * (leg.front ? 1 : 1.05);
        leg.kneePivot.rotation.x = -knee;
      });

      // gentle vertical bob + slight body roll/pitch tied to the gait
      const bob = Math.abs(Math.sin(cycleT)) * 0.045;
      bodyGroup.position.y = bodyY + bob;
      bodyGroup.rotation.z = Math.sin(cycleT) * 0.015;
      bodyGroup.rotation.x = Math.sin(cycleT * 2) * 0.008;

      // head/neck counter-bob + idle sway for life-like motion
      neckPivot.rotation.x = Math.sin(cycleT * 0.5) * 0.03;
      headPivot.rotation.x = Math.sin(cycleT * 0.5 + 0.6) * 0.05 - 0.02;

      // tail swish, slower & independent
      tailPivot.rotation.x = Math.sin(cycleT * 0.8) * 0.18;
      tailPivot.rotation.y = Math.sin(cycleT * 0.8 + 1.0) * 0.12;
    }

    function resetPose() {
      legs.forEach((leg) => {
        leg.pivot.rotation.x = 0;
        leg.kneePivot.rotation.x = 0;
      });
      bodyGroup.rotation.set(0, 0, 0);
      bodyGroup.position.y = bodyY;
      neckPivot.rotation.x = 0;
      headPivot.rotation.x = 0;
      tailPivot.rotation.x = 0;
      tailPivot.rotation.y = 0;
      cycleT = 0;
    }

    return {
      root,
      update,
      resetPose,
      bodyGroup,
      neckPivot,
      headPivot,
      legs
    };
  }

  // Flattens the belly and slightly raises the back ridge of the
  // torso's lathed geometry, so its cross-section reads as an
  // animal's barrel-shaped body rather than a perfect circular tube.
  function squashTorso(geo) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y < 0) {
        pos.setY(i, y * 0.82); // flatten belly
      } else {
        pos.setY(i, y * 1.06); // slightly raised back ridge
      }
      pos.setZ(i, z * 0.96);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // Slightly bend a vertical cylinder's geometry along +X with height t
  // to fake a natural neck curve (S-ish shape) without needing bones.
  function bendCylinder(geo, height, amount) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp(y / height, 0, 1);
      const bend = Math.sin(t * Math.PI * 0.75) * amount * t;
      pos.setX(i, pos.getX(i) + bend);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  global.GiraffeFactory = { createGiraffe };
})(window);
