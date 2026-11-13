(function () {
  'use strict';

  const GS = (window.GiraffeSim = window.GiraffeSim || {});

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function smootherstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function damp(current, target, lambda, dt) {
    return lerp(current, target, 1 - Math.exp(-lambda * dt));
  }

  // Deterministic 3D gradient / value noise for terrain, acacias, and organic displacement
  const PERM = new Uint8Array(512);
  (function initPerm() {
    const rng = mulberry32(192837465);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  })();

  function grad3(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function noise3D(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);

    const A = PERM[X] + Y;
    const AA = PERM[A] + Z;
    const AB = PERM[A + 1] + Z;
    const B = PERM[X + 1] + Y;
    const BA = PERM[B] + Z;
    const BB = PERM[B + 1] + Z;

    return lerp(
      lerp(
        lerp(grad3(PERM[AA], x, y, z), grad3(PERM[BA], x - 1, y, z), u),
        lerp(grad3(PERM[AB], x, y - 1, z), grad3(PERM[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad3(PERM[AA + 1], x, y, z - 1), grad3(PERM[BA + 1], x - 1, y, z - 1), u),
        lerp(grad3(PERM[AB + 1], x, y - 1, z - 1), grad3(PERM[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }

  function fbm3D(x, y, z, octaves, lacunarity, gain) {
    const oct = octaves || 4;
    const lac = lacunarity || 2.03;
    const g = gain || 0.5;
    let sum = 0;
    let amp = 0.5;
    let freq = 1.0;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * noise3D(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= g;
      freq *= lac;
    }
    return sum / (norm || 1);
  }

  // Catmull-Rom interpolation on arrays of { s, ... } stations
  function sampleProfileStations(stations, s) {
    if (s <= stations[0].s) return Object.assign({}, stations[0]);
    const last = stations[stations.length - 1];
    if (s >= last.s) return Object.assign({}, last);

    let idx = 0;
    for (let i = 0; i < stations.length - 1; i++) {
      if (s >= stations[i].s && s <= stations[i + 1].s) {
        idx = i;
        break;
      }
    }
    const p0 = stations[Math.max(0, idx - 1)];
    const p1 = stations[idx];
    const p2 = stations[idx + 1];
    const p3 = stations[Math.min(stations.length - 1, idx + 2)];
    const span = Math.max(1e-6, p2.s - p1.s);
    const t = clamp((s - p1.s) / span, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;

    const out = { s };
    const keys = Object.keys(p1);
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      if (key === 's') continue;
      const v0 = p0[key] !== undefined ? p0[key] : p1[key];
      const v1 = p1[key];
      const v2 = p2[key];
      const v3 = p3[key] !== undefined ? p3[key] : p2[key];
      // Centripetal-like damped Catmull-Rom (overshoot safe for positive radii)
      const m1 = 0.5 * (v2 - v0);
      const m2 = 0.5 * (v3 - v1);
      let val =
        (2 * t3 - 3 * t2 + 1) * v1 +
        (t3 - 2 * t2 + t) * m1 +
        (-2 * t3 + 3 * t2) * v2 +
        (t3 - t2) * m2;
      if (key.startsWith('r') || key.startsWith('w') || key.startsWith('d')) {
        const minLocal = Math.min(v1, v2) * 0.85;
        const maxLocal = Math.max(v1, v2) * 1.15;
        val = clamp(val, minLocal, maxLocal);
      }
      out[key] = val;
    }
    return out;
  }

  /**
   * Analytical 2-bone IK in 3D:
   * Given root position A, target position C, segment lengths L1 = |B - A|, L2 = |C - B|,
   * and a pole direction hint `poleDir` (unit or non-zero THREE.Vector3 indicating which side B bends toward),
   * writes joint position B into `outMid` and clamped target into `outEnd`.
   */
  const _vAC = new THREE.Vector3();
  const _dirAC = new THREE.Vector3();
  const _ortho = new THREE.Vector3();

  function solveTwoBoneIK(rootPos, targetPos, L1, L2, poleDir, outMid, outEnd) {
    _vAC.subVectors(targetPos, rootPos);
    let dist = _vAC.length();
    const minDist = Math.abs(L1 - L2) + 1e-5;
    const maxDist = L1 + L2 - 1e-5;

    if (dist < 1e-5) {
      _dirAC.set(0, -1, 0);
      dist = minDist;
    } else {
      _dirAC.copy(_vAC).divideScalar(dist);
    }

    const clampedDist = clamp(dist, minDist, maxDist);
    outEnd.copy(rootPos).addScaledVector(_dirAC, clampedDist);

    // Law of cosines at root A: cos(alpha) = (L1^2 + d^2 - L2^2) / (2 * L1 * d)
    const cosAlpha = clamp(
      (L1 * L1 + clampedDist * clampedDist - L2 * L2) / (2 * L1 * clampedDist),
      -1,
      1
    );
    const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

    // Project poleDir perpendicular to _dirAC
    _ortho.copy(poleDir).addScaledVector(_dirAC, -poleDir.dot(_dirAC));
    const orthoLen = _ortho.length();
    if (orthoLen < 1e-5) {
      _ortho.set(0, 0, 1).addScaledVector(_dirAC, -_dirAC.z).normalize();
    } else {
      _ortho.divideScalar(orthoLen);
    }

    outMid
      .copy(rootPos)
      .addScaledVector(_dirAC, L1 * cosAlpha)
      .addScaledVector(_ortho, L1 * sinAlpha);
    return clampedDist;
  }

  /**
   * Coupled 3-Segment Ungulate Limb Solver:
   * Solves Root -> Joint1 (Elbow or Stifle) -> Joint2 (Carpus or Hock) -> Fetlock
   * given exact bone lengths (L1, L2, L3), prescribed distal flexion angle `flexAngle`
   * (0 = straight L2+L3 line; >0 bends Joint2 toward `poleDir2`),
   * and proximal bend direction `poleDir1` for Joint1!
   */
  const _effPole2 = new THREE.Vector3();

  function solveUngulateThreeLinkIK(
    rootPos,
    fetlockPos,
    L1,
    L2,
    L3,
    flexAngle,
    poleDir1,
    poleDir2,
    outJoint1,
    outJoint2,
    outFetlock
  ) {
    const theta = clamp(flexAngle, 0.0005, Math.PI * 0.82);
    const rootToFet = rootPos.distanceTo(fetlockPos);
    const minLeffNeeded = clamp(rootToFet - L1 + 2e-4, Math.abs(L2 - L3) + 2e-4, L2 + L3 - 2e-4);
    const rawLeff = Math.sqrt(Math.max(1e-6, L2 * L2 + L3 * L3 + 2 * L2 * L3 * Math.cos(theta)));
    const Leff = clamp(Math.max(rawLeff, minLeffNeeded), Math.abs(L2 - L3) + 2e-4, L2 + L3 - 2e-4);

    // Step 1: Solve Root -> Joint1 -> Fetlock with segment lengths L1 and Leff
    solveTwoBoneIK(rootPos, fetlockPos, L1, Leff, poleDir1, outJoint1, outFetlock);

    // Step 2: Solve Joint1 -> Joint2 -> outFetlock with segment lengths L2 and L3
    _effPole2.copy(poleDir2);
    solveTwoBoneIK(outJoint1, outFetlock, L2, L3, _effPole2, outJoint2, outFetlock);
  }

  // Second-order critically/under-damped spring for organic secondary motion
  class SpringDamper {
    constructor(initialValue, stiffness, damping) {
      this.value = initialValue || 0;
      this.velocity = 0;
      this.stiffness = stiffness || 80;
      this.damping = damping || 12;
    }
    update(target, dt, externalImpulse) {
      const h = Math.min(dt, 0.05);
      if (externalImpulse) this.velocity += externalImpulse;
      const force = (target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += force * h;
      this.value += this.velocity * h;
      return this.value;
    }
  }

  GS.Math = {
    mulberry32,
    clamp,
    lerp,
    smoothstep,
    smootherstep,
    damp,
    noise3D,
    fbm3D,
    sampleProfileStations,
    solveTwoBoneIK,
    solveUngulateThreeLinkIK,
    SpringDamper
  };
})();
