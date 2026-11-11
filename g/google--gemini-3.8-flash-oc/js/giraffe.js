/**
 * Giraffe 3D - Anatomical Model Construction
 * Constructs a fully articulated, biologically accurate giraffe mesh hierarchy.
 */

const GiraffeModel = (function() {
  'use strict';

  function applyMetricCylindricalUVs(geometry, radius, height, unitSize = 0.45, vOffset = 0) {
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const circ = Math.PI * 2 * radius;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      let angle = Math.atan2(z, x);
      if (angle < 0) angle += Math.PI * 2;

      const u = (angle / (Math.PI * 2)) * (circ / unitSize);
      const v = vOffset + (y + height * 0.5) / unitSize;
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
  }

  function createSculptedTorso(material, unitSize = 0.48) {
    const rings = [
      { z: -0.40, y: -0.06, rx: 0.32, ry: 0.38, pinch: 1.0 }, // rump end
      { z: -0.18, y: 0.02,  rx: 0.38, ry: 0.45, pinch: 1.0 }, // hips
      { z:  0.10, y: 0.08,  rx: 0.33, ry: 0.42, pinch: 1.0 }, // flank / waist tuck
      { z:  0.42, y: 0.20,  rx: 0.38, ry: 0.50, pinch: 0.95 }, // mid ribcage
      { z:  0.75, y: 0.36,  rx: 0.43, ry: 0.60, pinch: 0.90 }, // deep chest / brisket
      { z:  1.05, y: 0.56,  rx: 0.39, ry: 0.65, pinch: 0.85 }, // shoulders
      { z:  1.32, y: 0.72,  rx: 0.31, ry: 0.54, pinch: 0.80 }, // withers crest / neck base
    ];

    const radialSegs = 24;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const indices = [];

    const totalZ = rings[rings.length - 1].z - rings[0].z;

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];

      for (let s = 0; s <= radialSegs; s++) {
        const uNorm = s / radialSegs;
        const theta = uNorm * Math.PI * 2;

        let px = Math.cos(theta) * ring.rx;
        let py = Math.sin(theta) * ring.ry + ring.y;

        // Withers crest pinch
        if (Math.sin(theta) > 0.3) {
          const pinchFactor = ring.pinch + (1 - ring.pinch) * (1 - Math.sin(theta));
          px *= pinchFactor;
        }

        const pz = ring.z;
        positions.push(px, py, pz);

        const u = uNorm * (Math.PI * 2 * ring.rx) / unitSize;
        const v = (ring.z - rings[0].z) / unitSize;
        uvs.push(u, v);
      }
    }

    for (let r = 0; r < rings.length - 1; r++) {
      for (let s = 0; s < radialSegs; s++) {
        const a = r * (radialSegs + 1) + s;
        const b = (r + 1) * (radialSegs + 1) + s;
        const c = (r + 1) * (radialSegs + 1) + (s + 1);
        const d = r * (radialSegs + 1) + (s + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Builds an organic sculpted giraffe head connecting cranium, cheeks, bridge of nose and muzzle
   */
  function createSculptedHead(material, unitSize = 0.70) {
    const rings = [
      // z, y, rx, ry, yOffset, topPinch
      { z: -0.10, rx: 0.13, ry: 0.14, yOff: 0.08, pinch: 1.0 },  // Occiput / poll
      { z:  0.04, rx: 0.16, ry: 0.16, yOff: 0.09, pinch: 0.95 }, // Crown / ear base
      { z:  0.18, rx: 0.15, ry: 0.15, yOff: 0.08, pinch: 0.88 }, // Brow / eyes
      { z:  0.32, rx: 0.11, ry: 0.12, yOff: 0.05, pinch: 0.85 }, // Nasal bridge
      { z:  0.44, rx: 0.08, ry: 0.09, yOff: 0.03, pinch: 0.90 }, // Muzzle base
      { z:  0.54, rx: 0.055, ry: 0.065, yOff: 0.02, pinch: 1.0 }, // Prehensile nose tip
    ];

    const radialSegs = 20;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const uvs = [];
    const indices = [];

    const totalZ = rings[rings.length - 1].z - rings[0].z;

    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];

      for (let s = 0; s <= radialSegs; s++) {
        const uNorm = s / radialSegs;
        const theta = uNorm * Math.PI * 2;

        let px = Math.cos(theta) * ring.rx;
        let py = Math.sin(theta) * ring.ry + ring.yOff;

        // Frontal median ridge pinch
        if (Math.sin(theta) > 0.3) {
          const pinchFactor = ring.pinch + (1 - ring.pinch) * (1 - Math.sin(theta));
          px *= pinchFactor;
        }

        const pz = ring.z;
        positions.push(px, py, pz);

        const u = uNorm * (Math.PI * 2 * ring.rx) / unitSize;
        const v = (ring.z - rings[0].z) / unitSize;
        uvs.push(u, v);
      }
    }

    for (let r = 0; r < rings.length - 1; r++) {
      for (let s = 0; s < radialSegs; s++) {
        const a = r * (radialSegs + 1) + s;
        const b = (r + 1) * (radialSegs + 1) + s;
        const c = (r + 1) * (radialSegs + 1) + (s + 1);
        const d = r * (radialSegs + 1) + (s + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  function createClovenHoof(hoofMat, legMat) {
    const hoofGrp = new THREE.Group();

    // Hoof capsule
    const capsuleGeo = new THREE.CylinderGeometry(0.065, 0.088, 0.13, 14);
    capsuleGeo.scale(0.85, 1.0, 1.25);
    const capsule = new THREE.Mesh(capsuleGeo, hoofMat);
    capsule.position.set(0, -0.065, 0.02);
    capsule.castShadow = true;
    hoofGrp.add(capsule);

    // Front center vertical cleft
    const cleftGeo = new THREE.BoxGeometry(0.015, 0.12, 0.05);
    const cleft = new THREE.Mesh(cleftGeo, new THREE.MeshBasicMaterial({ color: 0x0a0807 }));
    cleft.position.set(0, -0.065, 0.11);
    hoofGrp.add(cleft);

    // Coronary band (soft hair rim above hoof)
    const bandGeo = new THREE.TorusGeometry(0.068, 0.012, 8, 14);
    bandGeo.rotateX(Math.PI / 2);
    bandGeo.scale(0.85, 1.25, 1.0);
    const band = new THREE.Mesh(bandGeo, legMat);
    band.position.set(0, -0.005, 0.02);
    hoofGrp.add(band);

    return hoofGrp;
  }

  function createGiraffe(textures) {
    const bodyMat = new THREE.MeshStandardMaterial({
      map: textures.body.map,
      bumpMap: textures.body.bumpMap,
      bumpScale: 0.038,
      roughness: 0.70,
      metalness: 0.04
    });

    const neckMat = new THREE.MeshStandardMaterial({
      map: textures.neck.map,
      bumpMap: textures.neck.bumpMap,
      bumpScale: 0.038,
      roughness: 0.70,
      metalness: 0.04
    });

    const legMat = new THREE.MeshStandardMaterial({
      map: textures.legs.map,
      bumpMap: textures.legs.bumpMap,
      bumpScale: 0.030,
      roughness: 0.74,
      metalness: 0.04
    });

    const headMat = new THREE.MeshStandardMaterial({
      map: textures.head.map,
      bumpMap: textures.head.bumpMap,
      bumpScale: 0.022,
      roughness: 0.74,
      metalness: 0.03
    });

    const muzzleMat = new THREE.MeshStandardMaterial({
      map: textures.muzzle,
      roughness: 0.88,
      metalness: 0.02
    });

    const hoofMat = new THREE.MeshStandardMaterial({
      map: textures.hoof,
      roughness: 0.36,
      metalness: 0.18
    });

    const maneMat = new THREE.MeshStandardMaterial({
      color: 0x24140b,
      roughness: 0.94
    });

    const darkHornMat = new THREE.MeshStandardMaterial({
      color: 0x1c120c,
      roughness: 0.88
    });

    const eyeMat = new THREE.MeshStandardMaterial({
      map: textures.eye,
      roughness: 0.03,
      metalness: 0.35
    });

    const root = new THREE.Group();
    root.name = 'GiraffeRoot';

    // Pelvis Group: located at natural hip height (~2.35m off ground)
    const pelvis = new THREE.Group();
    pelvis.name = 'Pelvis';
    pelvis.position.set(0, 2.35, -0.6);
    root.add(pelvis);

    // Torso Mesh
    const torsoMesh = createSculptedTorso(bodyMat, 1.6);
    pelvis.add(torsoMesh);

    // Withers attachment node
    const withers = new THREE.Group();
    withers.name = 'Withers';
    withers.position.set(0, 0.72, 1.25);
    pelvis.add(withers);

    // -------------------------------------------------------------
    // NECK HIERARCHY (6 Articulated Cervical Segments)
    // -------------------------------------------------------------
    const neckBase = new THREE.Group();
    neckBase.name = 'NeckBase';
    neckBase.position.set(0, -0.02, 0.04);
    neckBase.rotation.x = 0.98;
    withers.add(neckBase);

    const neckSegments = [];
    let prevNeckNode = neckBase;
    const numNeckSegs = 6;
    const neckSegLen = 0.36;

    for (let i = 0; i < numNeckSegs; i++) {
      const segGrp = new THREE.Group();
      segGrp.name = `NeckSegment_${i}`;
      if (i > 0) {
        segGrp.position.set(0, neckSegLen * 0.96, 0);
      }

      const t0 = i / numNeckSegs;
      const t1 = (i + 1) / numNeckSegs;
      const rBotX = 0.25 * (1 - t0 * 0.46);
      const rBotZ = 0.29 * (1 - t0 * 0.46);
      const rTopX = 0.25 * (1 - t1 * 0.46);
      const rTopZ = 0.29 * (1 - t1 * 0.46);

      // Open-ended cylinder eliminates flat cut planes when bending
      const segGeo = new THREE.CylinderGeometry(rTopX, rBotX, neckSegLen * 1.08, 16, 1, true);
      const segVOffset = (i * neckSegLen) / 1.4;
      applyMetricCylindricalUVs(segGeo, (rTopX + rBotX) * 0.5, neckSegLen * 1.08, 1.4, segVOffset);
      segGeo.scale(1.0, 1.0, rBotZ / rBotX);

      const segMesh = new THREE.Mesh(segGeo, neckMat);
      segMesh.position.set(0, neckSegLen * 0.5, 0);
      segMesh.castShadow = true;
      segGrp.add(segMesh);

      // Concentric joint sphere for smooth seamless bending
      const jointCap = new THREE.SphereGeometry(rBotX * 0.99, 14, 12);
      applyMetricCylindricalUVs(jointCap, rBotX, rBotX * 2, 1.4, segVOffset);
      jointCap.scale(1.0, 0.85, rBotZ / rBotX);
      const jointMesh = new THREE.Mesh(jointCap, neckMat);
      jointMesh.castShadow = true;
      segGrp.add(jointMesh);

      // Stiff upright mane along the dorsal crest (negative Z local)
      const maneGeo = new THREE.BoxGeometry(0.038, neckSegLen * 1.02, 0.12);
      const maneMesh = new THREE.Mesh(maneGeo, maneMat);
      maneMesh.position.set(0, neckSegLen * 0.5, -rBotZ * 0.95);
      maneMesh.castShadow = true;
      segGrp.add(maneMesh);

      prevNeckNode.add(segGrp);
      neckSegments.push(segGrp);
      prevNeckNode = segGrp;
    }

    // -------------------------------------------------------------
    // HEAD ASSEMBLY
    // -------------------------------------------------------------
    const head = new THREE.Group();
    head.name = 'Head';
    head.position.set(0, neckSegLen, 0);
    head.rotation.x = -0.96;
    prevNeckNode.add(head);

    // Atlas ball joint between top neck segment and cranium
    const atlasJoint = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), neckMat);
    atlasJoint.scale.set(0.95, 1.0, 1.15);
    atlasJoint.position.set(0, 0.02, -0.06);
    atlasJoint.castShadow = true;
    head.add(atlasJoint);

    // Unified Sculpted Head Mesh (cranium, cheeks, forehead, nasal bridge)
    const headMesh = createSculptedHead(headMat, 0.70);
    head.add(headMesh);

    // Frontal Median Horn Bump
    const bumpGeo = new THREE.SphereGeometry(0.036, 10, 10);
    bumpGeo.scale(0.7, 1.1, 1.1);
    const bump = new THREE.Mesh(bumpGeo, headMat);
    bump.position.set(0, 0.17, 0.22);
    head.add(bump);

    // Soft prehensile velvety muzzle tip and nostril lobes
    const muzzleTip = new THREE.Group();
    muzzleTip.position.set(0, 0.02, 0.52);

    const lipGeo = new THREE.SphereGeometry(0.062, 14, 14);
    lipGeo.scale(0.78, 0.75, 1.15);
    const lip = new THREE.Mesh(lipGeo, muzzleMat);
    lip.castShadow = true;
    muzzleTip.add(lip);

    // Nostrils
    const nostrilL = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), new THREE.MeshBasicMaterial({ color: 0x0f0b08 }));
    nostrilL.scale.set(0.55, 0.9, 1.2);
    nostrilL.position.set(0.028, 0.032, 0.03);
    muzzleTip.add(nostrilL);

    const nostrilR = nostrilL.clone();
    nostrilR.position.x = -0.028;
    muzzleTip.add(nostrilR);

    // Lower jaw & chin (smoothly tapered beneath muzzle)
    const chinGeo = new THREE.CylinderGeometry(0.045, 0.065, 0.22, 12);
    chinGeo.rotateX(-Math.PI / 2);
    chinGeo.scale(0.75, 0.65, 1.0);
    const chin = new THREE.Mesh(chinGeo, muzzleMat);
    chin.position.set(0, -0.045, -0.08);
    muzzleTip.add(chin);

    head.add(muzzleTip);

    // Eyes with subtle eyelids and dark eyeliner rim
    function createEyeAssembly(side) {
      const eyeGrp = new THREE.Group();
      eyeGrp.position.set(side * 0.145, 0.10, 0.18);

      // Dark eyelid rim
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.036, 0.007, 8, 16),
        new THREE.MeshBasicMaterial({ color: 0x120c08 })
      );
      rim.rotation.y = side * 0.35 + Math.PI / 2;
      eyeGrp.add(rim);

      // Large soulful glossy eye
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 16), eyeMat);
      eye.scale.set(0.65, 1.0, 1.0);
      eye.rotation.y = side * 0.35;
      eyeGrp.add(eye);

      return eyeGrp;
    }
    head.add(createEyeAssembly(1));
    head.add(createEyeAssembly(-1));

    // Ossicones (Horns)
    function createOssicone(side) {
      const hornGrp = new THREE.Group();
      hornGrp.position.set(side * 0.075, 0.21, 0.02);
      hornGrp.rotation.z = -side * 0.14;
      hornGrp.rotation.x = -0.20;

      const shaftGeo = new THREE.CylinderGeometry(0.022, 0.028, 0.22, 10);
      applyMetricCylindricalUVs(shaftGeo, 0.025, 0.22, 0.2);
      const shaft = new THREE.Mesh(shaftGeo, headMat);
      shaft.position.y = 0.11;
      shaft.castShadow = true;
      hornGrp.add(shaft);

      const knobGeo = new THREE.SphereGeometry(0.038, 10, 10);
      knobGeo.scale(0.9, 1.25, 0.9);
      const knob = new THREE.Mesh(knobGeo, darkHornMat);
      knob.position.y = 0.22;
      knob.castShadow = true;
      hornGrp.add(knob);

      return hornGrp;
    }
    head.add(createOssicone(1));
    head.add(createOssicone(-1));

    // Large Leaf-Shaped Ears
    const earLeft = new THREE.Group();
    const earRight = new THREE.Group();
    function setupEar(earGrp, side) {
      earGrp.name = side > 0 ? 'Ear_L' : 'Ear_R';
      earGrp.position.set(side * 0.13, 0.15, -0.06);
      earGrp.rotation.z = -side * 0.55;
      earGrp.rotation.x = -0.22;
      earGrp.rotation.y = side * 0.35;

      const earGeo = new THREE.ConeGeometry(0.08, 0.30, 10);
      applyMetricCylindricalUVs(earGeo, 0.08, 0.30, 0.2);
      earGeo.scale(0.3, 1.0, 1.2);
      const earMesh = new THREE.Mesh(earGeo, headMat);
      earMesh.position.y = 0.15;
      earMesh.castShadow = true;
      earGrp.add(earMesh);
    }
    setupEar(earLeft, 1);
    setupEar(earRight, -1);
    head.add(earLeft);
    head.add(earRight);

    // -------------------------------------------------------------
    // TAIL
    // -------------------------------------------------------------
    const tailBase = new THREE.Group();
    tailBase.name = 'TailBase';
    tailBase.position.set(0, 0.05, -0.34);
    tailBase.rotation.x = 0.25;
    pelvis.add(tailBase);

    const tailSegments = [];
    let prevTailNode = tailBase;
    for (let i = 0; i < 5; i++) {
      const tSeg = new THREE.Group();
      tSeg.name = `TailSeg_${i}`;
      tSeg.position.set(0, -0.20, 0);

      const rTop = 0.032 - i * 0.0035;
      const rBot = 0.028 - i * 0.0035;
      const tGeo = new THREE.CylinderGeometry(rTop, rBot, 0.22, 8);
      const tMesh = new THREE.Mesh(tGeo, bodyMat);
      tMesh.position.y = -0.11;
      tMesh.castShadow = true;
      tSeg.add(tMesh);

      prevTailNode.add(tSeg);
      tailSegments.push(tSeg);
      prevTailNode = tSeg;
    }

    const tuftGeo = new THREE.ConeGeometry(0.08, 0.40, 10);
    tuftGeo.rotateX(Math.PI);
    const tailTuft = new THREE.Mesh(tuftGeo, darkHornMat);
    tailTuft.position.set(0, -0.24, 0);
    tailTuft.castShadow = true;
    prevTailNode.add(tailTuft);

    // -------------------------------------------------------------
    // FORELIMBS (Front Legs)
    // -------------------------------------------------------------
    function buildForelimb(side) {
      const shoulder = new THREE.Group();
      shoulder.name = side > 0 ? 'Shoulder_LF' : 'Shoulder_RF';
      shoulder.position.set(side * 0.32, 0.32, 1.10);

      // Scapula blade / shoulder contour
      const scapulaGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.46, 12);
      applyMetricCylindricalUVs(scapulaGeo, 0.14, 0.46, 1.2);
      scapulaGeo.scale(0.55, 1.0, 1.15);
      const scapula = new THREE.Mesh(scapulaGeo, legMat);
      scapula.position.set(side * 0.02, -0.22, -0.05);
      scapula.rotation.x = -0.18;
      scapula.castShadow = true;
      shoulder.add(scapula);

      // Upper arm (humerus)
      const upperArm = new THREE.Group();
      upperArm.name = side > 0 ? 'UpperArm_LF' : 'UpperArm_RF';
      upperArm.position.set(0, -0.38, -0.06);
      upperArm.rotation.x = 0.20;
      shoulder.add(upperArm);

      const humerusGeo = new THREE.CylinderGeometry(0.11, 0.085, 0.55, 12);
      applyMetricCylindricalUVs(humerusGeo, 0.10, 0.55, 1.2, 0.0);
      humerusGeo.scale(0.9, 1.0, 1.15);
      const humerus = new THREE.Mesh(humerusGeo, legMat);
      humerus.position.y = -0.27;
      humerus.castShadow = true;
      upperArm.add(humerus);

      // Rounded elbow with olecranon projection
      const elbowGeo = new THREE.SphereGeometry(0.08, 10, 10);
      applyMetricCylindricalUVs(elbowGeo, 0.08, 0.16, 1.2, 0.45);
      elbowGeo.scale(0.9, 1.1, 1.3);
      const elbowMesh = new THREE.Mesh(elbowGeo, legMat);
      elbowMesh.position.set(0, -0.54, -0.04);
      elbowMesh.castShadow = true;
      upperArm.add(elbowMesh);

      // Forearm (Radius / Ulna)
      const forearm = new THREE.Group();
      forearm.name = side > 0 ? 'Forearm_LF' : 'Forearm_RF';
      forearm.position.set(0, -0.55, 0);
      forearm.rotation.x = -0.20;
      upperArm.add(forearm);

      const radiusGeo = new THREE.CylinderGeometry(0.085, 0.065, 0.82, 12);
      applyMetricCylindricalUVs(radiusGeo, 0.075, 0.82, 1.2, 0.55 / 1.2);
      const radius = new THREE.Mesh(radiusGeo, legMat);
      radius.position.y = -0.41;
      radius.castShadow = true;
      forearm.add(radius);

      // Carpus ("Knee" joint)
      const knee = new THREE.Group();
      knee.name = side > 0 ? 'Knee_LF' : 'Knee_RF';
      knee.position.y = -0.82;
      const carpusGeo = new THREE.SphereGeometry(0.08, 10, 10);
      applyMetricCylindricalUVs(carpusGeo, 0.08, 0.16, 1.2, (0.55 + 0.78) / 1.2);
      carpusGeo.scale(0.85, 1.1, 1.1);
      const carpus = new THREE.Mesh(carpusGeo, legMat);
      carpus.castShadow = true;
      knee.add(carpus);
      forearm.add(knee);

      // Cannon Bone (Metacarpus)
      const cannon = new THREE.Group();
      cannon.name = side > 0 ? 'Cannon_LF' : 'Cannon_RF';
      const cannonGeo = new THREE.CylinderGeometry(0.062, 0.05, 0.90, 10);
      applyMetricCylindricalUVs(cannonGeo, 0.056, 0.90, 1.2, (0.55 + 0.82) / 1.2);
      const cannonMesh = new THREE.Mesh(cannonGeo, legMat);
      cannonMesh.position.y = -0.45;
      cannonMesh.castShadow = true;
      cannon.add(cannonMesh);
      knee.add(cannon);

      // Fetlock Joint
      const fetlock = new THREE.Group();
      fetlock.name = side > 0 ? 'Fetlock_LF' : 'Fetlock_RF';
      fetlock.position.y = -0.90;
      const fetlockMesh = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 8), legMat);
      fetlockMesh.castShadow = true;
      fetlock.add(fetlockMesh);
      cannon.add(fetlock);

      // Pastern
      const pastern = new THREE.Group();
      pastern.name = side > 0 ? 'Pastern_LF' : 'Pastern_RF';
      pastern.rotation.x = 0.14;
      const pasternGeo = new THREE.CylinderGeometry(0.05, 0.055, 0.14, 8);
      const pasternMesh = new THREE.Mesh(pasternGeo, legMat);
      pasternMesh.position.y = -0.07;
      pasternMesh.castShadow = true;
      pastern.add(pasternMesh);

      // Cloven Hoof
      const hoof = createClovenHoof(hoofMat, legMat);
      hoof.position.set(0, -0.08, 0.01);
      pastern.add(hoof);

      fetlock.add(pastern);

      return { shoulder, upperArm, forearm, knee, cannon, fetlock, pastern, hoof };
    }

    // -------------------------------------------------------------
    // HINDLIMBS (Back Legs)
    // -------------------------------------------------------------
    function buildHindlimb(side) {
      const hip = new THREE.Group();
      hip.name = side > 0 ? 'Hip_LH' : 'Hip_RH';
      hip.position.set(side * 0.28, 0.0, -0.15);

      // Thigh / Femur
      const thigh = new THREE.Group();
      thigh.name = side > 0 ? 'Thigh_LH' : 'Thigh_RH';
      thigh.rotation.x = -0.28;
      hip.add(thigh);

      const femurGeo = new THREE.CylinderGeometry(0.14, 0.095, 0.74, 12);
      applyMetricCylindricalUVs(femurGeo, 0.12, 0.74, 1.2, 0.0);
      femurGeo.scale(0.85, 1.0, 1.2);
      const femur = new THREE.Mesh(femurGeo, legMat);
      femur.position.y = -0.37;
      femur.castShadow = true;
      thigh.add(femur);

      // Stifle Joint (True Knee)
      const stifle = new THREE.Group();
      stifle.name = side > 0 ? 'Stifle_LH' : 'Stifle_RH';
      stifle.position.y = -0.74;
      const stifleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), legMat);
      applyMetricCylindricalUVs(stifleMesh.geometry, 0.09, 0.18, 1.2, 0.65 / 1.2);
      stifleMesh.castShadow = true;
      stifle.add(stifleMesh);
      thigh.add(stifle);

      // Shank / Gaskin (Tibia)
      const shank = new THREE.Group();
      shank.name = side > 0 ? 'Shank_LH' : 'Shank_RH';
      shank.rotation.x = 0.48;
      stifle.add(shank);

      const tibiaGeo = new THREE.CylinderGeometry(0.09, 0.065, 0.70, 10);
      applyMetricCylindricalUVs(tibiaGeo, 0.078, 0.70, 1.2, 0.74 / 1.2);
      tibiaGeo.scale(0.85, 1.0, 1.1);
      const tibia = new THREE.Mesh(tibiaGeo, legMat);
      tibia.position.y = -0.35;
      tibia.castShadow = true;
      shank.add(tibia);

      // Hock Joint (Calcaneus heel)
      const hock = new THREE.Group();
      hock.name = side > 0 ? 'Hock_LH' : 'Hock_RH';
      hock.position.y = -0.70;
      const hockGeo = new THREE.SphereGeometry(0.085, 10, 10);
      applyMetricCylindricalUVs(hockGeo, 0.085, 0.17, 1.2, (0.74 + 0.66) / 1.2);
      hockGeo.scale(0.85, 1.25, 1.45);
      const hockMesh = new THREE.Mesh(hockGeo, legMat);
      hockMesh.position.z = -0.04;
      hockMesh.castShadow = true;
      hock.add(hockMesh);
      shank.add(hock);

      // Lower Cannon (Metatarsus)
      const cannon = new THREE.Group();
      cannon.name = side > 0 ? 'Cannon_LH' : 'Cannon_RH';
      cannon.rotation.x = -0.20;
      hock.add(cannon);

      const metatarsusGeo = new THREE.CylinderGeometry(0.058, 0.048, 0.88, 10);
      applyMetricCylindricalUVs(metatarsusGeo, 0.053, 0.88, 1.2, (0.74 + 0.70) / 1.2);
      const metatarsus = new THREE.Mesh(metatarsusGeo, legMat);
      metatarsus.position.y = -0.44;
      metatarsus.castShadow = true;
      cannon.add(metatarsus);

      // Fetlock
      const fetlock = new THREE.Group();
      fetlock.name = side > 0 ? 'Fetlock_LH' : 'Fetlock_RH';
      fetlock.position.y = -0.88;
      const fetlockMesh = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 8), legMat);
      fetlockMesh.castShadow = true;
      fetlock.add(fetlockMesh);
      cannon.add(fetlock);

      // Pastern & Hoof
      const pastern = new THREE.Group();
      pastern.name = side > 0 ? 'Pastern_LH' : 'Pastern_RH';
      pastern.rotation.x = 0.12;
      const pasternGeo = new THREE.CylinderGeometry(0.048, 0.054, 0.13, 8);
      const pasternMesh = new THREE.Mesh(pasternGeo, legMat);
      pasternMesh.position.y = -0.065;
      pasternMesh.castShadow = true;
      pastern.add(pasternMesh);

      const hoof = createClovenHoof(hoofMat, legMat);
      hoof.position.set(0, -0.08, 0.01);
      pastern.add(hoof);

      fetlock.add(pastern);

      return { hip, thigh, stifle, shank, hock, cannon, fetlock, pastern, hoof };
    }

    const legLF = buildForelimb(1);
    const legRF = buildForelimb(-1);
    pelvis.add(legLF.shoulder);
    pelvis.add(legRF.shoulder);

    const legLH = buildHindlimb(1);
    const legRH = buildHindlimb(-1);
    pelvis.add(legLH.hip);
    pelvis.add(legRH.hip);

    return {
      root,
      pelvis,
      withers,
      neckBase,
      neckSegments,
      head,
      earLeft,
      earRight,
      tailBase,
      tailSegments,
      legs: {
        LF: legLF,
        RF: legRF,
        LH: legLH,
        RH: legRH
      },
      materials: [bodyMat, neckMat, legMat, headMat, muzzleMat, hoofMat, maneMat, darkHornMat, eyeMat]
    };
  }

  return {
    createGiraffe
  };
})();
