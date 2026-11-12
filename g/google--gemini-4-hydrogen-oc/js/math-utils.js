(function (global) {
  'use strict';

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

  function hash2(ix, iz) {
    let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function valueNoise2D(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);

    const a = hash2(ix, iz);
    const b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1);
    const d = hash2(ix + 1, iz + 1);

    return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
  }

  function fbm2D(x, z, octaves) {
    let val = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      val += amp * valueNoise2D(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return val / norm;
  }

  /**
   * Deterministic savanna terrain height (meters) at world (x, z).
   * Gently rolling near the center walking arena, rising subtly toward distant hills.
   */
  function getTerrainHeight(x, z) {
    const broad = (fbm2D(x * 0.022 + 13.4, z * 0.022 - 7.1, 4) - 0.5) * 1.45;
    const medium = (fbm2D(x * 0.075 - 4.2, z * 0.075 + 9.8, 3) - 0.5) * 0.28;
    const micro = (valueNoise2D(x * 0.45, z * 0.45) - 0.5) * 0.035;

    const r = Math.hypot(x, z);
    const outerRise = smoothstep(32, 95, r) * (2.6 + fbm2D(x * 0.035 + 31, z * 0.035 - 19, 3) * 4.5);

    // Subtle flattened walking loop around radius ~14m so strides look crisp yet organic
    const loopDist = Math.abs(r - 14.0);
    const pathBlend = smoothstep(0.0, 6.0, loopDist);
    return (broad * (0.35 + 0.65 * pathBlend)) + medium * (0.55 + 0.45 * pathBlend) + micro + outerRise;
  }

  function getTerrainNormal(x, z, out) {
    const eps = 0.15;
    const hL = getTerrainHeight(x - eps, z);
    const hR = getTerrainHeight(x + eps, z);
    const hD = getTerrainHeight(x, z - eps);
    const hU = getTerrainHeight(x, z + eps);
    const nx = hL - hR;
    const ny = 2.0 * eps;
    const nz = hD - hU;
    const len = Math.hypot(nx, ny, nz) || 1;
    out.set(nx / len, ny / len, nz / len);
    return out;
  }

  /**
   * Analytic 2-bone IK solver with soft hyper-extension damping.
   * Places `outMid` at the joint between bone1 (len1) and bone2 (len2),
   * bending toward `poleDir` (world-space vector).
   */
  const _dir = new THREE.Vector3();
  const _poleProj = new THREE.Vector3();
  const _perp = new THREE.Vector3();

  function solveTwoBoneIK(rootPos, targetPos, len1, len2, poleDir, outMid, outClampedTarget) {
    _dir.subVectors(targetPos, rootPos);
    let dist = _dir.length();
    if (dist < 1e-5) {
      _dir.set(0, -1, 0);
      dist = 1e-5;
    } else {
      _dir.multiplyScalar(1 / dist);
    }

    const minReach = Math.abs(len1 - len2) + 0.03;
    const maxReachHard = (len1 + len2) - 0.006;
    const softZone = 0.08;
    const softStart = maxReachHard - softZone;

    let effDist = dist;
    if (effDist > softStart) {
      const over = effDist - softStart;
      effDist = softStart + softZone * (1 - Math.exp(-over / softZone));
    }
    effDist = clamp(effDist, minReach, maxReachHard);

    if (outClampedTarget) {
      outClampedTarget.copy(rootPos).addScaledVector(_dir, effDist);
    }

    // Law of cosines for distance along _dir from rootPos
    const cosA = clamp((len1 * len1 + effDist * effDist - len2 * len2) / (2 * len1 * effDist), -1, 1);
    const along = len1 * cosA;
    const height = Math.sqrt(Math.max(0, len1 * len1 - along * along));

    // Orthogonalize poleDir against _dir
    _poleProj.copy(poleDir);
    const dot = _poleProj.dot(_dir);
    _poleProj.addScaledVector(_dir, -dot);
    if (_poleProj.lengthSq() < 1e-6) {
      _perp.set(0, 0, 1).cross(_dir);
      if (_perp.lengthSq() < 1e-6) _perp.set(1, 0, 0).cross(_dir);
      _poleProj.copy(_perp);
    }
    _poleProj.normalize();

    outMid.copy(rootPos)
      .addScaledVector(_dir, along)
      .addScaledVector(_poleProj, height);

    return effDist;
  }

  global.GiraffeMath = {
    mulberry32,
    hash2,
    smoothstep,
    lerp,
    clamp,
    valueNoise2D,
    fbm2D,
    getTerrainHeight,
    getTerrainNormal,
    solveTwoBoneIK,
  };
})(window);
