(function () {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
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

  // Fast deterministic 3D hash & value noise
  function hash3(ix, iy, iz) {
    let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177);
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function noise3D(x, y, z) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);

    const n000 = hash3(ix, iy, iz);
    const n100 = hash3(ix + 1, iy, iz);
    const n010 = hash3(ix, iy + 1, iz);
    const n110 = hash3(ix + 1, iy + 1, iz);
    const n001 = hash3(ix, iy, iz + 1);
    const n101 = hash3(ix + 1, iy, iz + 1);
    const n011 = hash3(ix, iy + 1, iz + 1);
    const n111 = hash3(ix + 1, iy + 1, iz + 1);

    const nx00 = n000 + (n100 - n000) * ux;
    const nx10 = n010 + (n110 - n010) * ux;
    const nx01 = n001 + (n101 - n001) * ux;
    const nx11 = n011 + (n111 - n011) * ux;

    const nxy0 = nx00 + (nx10 - nx00) * uy;
    const nxy1 = nx01 + (nx11 - nx01) * uy;

    return (nxy0 + (nxy1 - nxy0) * uz) * 2.0 - 1.0;
  }

  function fbm3D(x, y, z, octaves) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1.0;
    let norm = 0;
    const count = octaves || 4;
    for (let i = 0; i < count; i++) {
      sum += amp * noise3D(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / (norm || 1);
  }

  function fbm2D(x, z, octaves) {
    return fbm3D(x, 13.7, z, octaves);
  }

  // Monotone-safe Catmull-Rom scalar interpolation across non-uniform stations s
  function sampleStationCurve(stations, propName, s, defaultVal) {
    const n = stations.length;
    if (n === 0) return defaultVal !== undefined ? defaultVal : 0;
    const getVal = (idx) => {
      const v = stations[idx][propName];
      return v !== undefined ? v : (defaultVal !== undefined ? defaultVal : 0);
    };
    if (s <= stations[0].s) return getVal(0);
    if (s >= stations[n - 1].s) return getVal(n - 1);

    let i = 0;
    while (i < n - 2 && s > stations[i + 1].s) i++;

    const s0 = stations[i].s;
    const s1 = stations[i + 1].s;
    const h = Math.max(1e-6, s1 - s0);
    const t = clamp((s - s0) / h, 0, 1);

    const y0 = getVal(i);
    const y1 = getVal(i + 1);

    // Compute Fritsch-Carlson monotone slopes so anatomical profiles never ring/overshoot
    const secant = (y1 - y0) / h;
    let m0 = secant;
    let m1 = secant;

    if (i > 0) {
      const hPrev = Math.max(1e-6, s0 - stations[i - 1].s);
      const secPrev = (y0 - getVal(i - 1)) / hPrev;
      m0 = secPrev * secant <= 0 ? 0 : 0.5 * (secPrev + secant);
    }
    if (i + 2 < n) {
      const hNext = Math.max(1e-6, stations[i + 2].s - s1);
      const secNext = (getVal(i + 2) - y1) / hNext;
      m1 = secant * secNext <= 0 ? 0 : 0.5 * (secant + secNext);
    }

    // Clamp slopes for strict monotonicity
    if (Math.abs(secant) < 1e-8) {
      m0 = 0;
      m1 = 0;
    } else {
      const alpha = m0 / secant;
      const beta = m1 / secant;
      const magSq = alpha * alpha + beta * beta;
      if (magSq > 9) {
        const tau = 3 / Math.sqrt(magSq);
        m0 = tau * alpha * secant;
        m1 = tau * beta * secant;
      }
    }

    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
  }

  /**
   * Softly clamped reach distance so two-bone IK never snaps violently near straight-leg extension.
   */
  function softClampReach(dist, minDist, maxDist, softZone) {
    if (dist < minDist) return minDist;
    const startSoft = maxDist - softZone;
    if (dist <= startSoft || softZone <= 1e-5) {
      return Math.min(dist, maxDist);
    }
    const excess = dist - startSoft;
    return startSoft + softZone * (1.0 - Math.exp(-excess / softZone));
  }

  const _vAB = new THREE.Vector3();
  const _vDir = new THREE.Vector3();
  const _vPoleProj = new THREE.Vector3();
  const _vSide = new THREE.Vector3();

  /**
   * Exact analytical 3D Two-Bone IK solver.
   * Given rootPos (A), targetPos (C), upper length L1, lower length L2, and poleVector (bend direction),
   * writes the solved middle joint world position into outMidPos (B) and clamped end into outEndPos.
   */
  function solveTwoBoneIK(rootPos, targetPos, L1, L2, poleDir, outMidPos, outEndPos) {
    _vDir.subVectors(targetPos, rootPos);
    const rawDist = _vDir.length();
    if (rawDist < 1e-6) {
      _vDir.set(0, -1, 0);
    } else {
      _vDir.divideScalar(rawDist);
    }

    const minReach = Math.abs(L1 - L2) + 0.008;
    const maxReach = (L1 + L2) - 0.003;
    const reach = softClampReach(rawDist, minReach, maxReach, 0.025);

    if (outEndPos) {
      outEndPos.copy(rootPos).addScaledVector(_vDir, reach);
    }

    // Project poleDir perpendicular to _vDir
    _vPoleProj.copy(poleDir).addScaledVector(_vDir, -poleDir.dot(_vDir));
    if (_vPoleProj.lengthSq() < 1e-6) {
      _vSide.set(1, 0, 0);
      _vPoleProj.crossVectors(_vDir, _vSide);
      if (_vPoleProj.lengthSq() < 1e-6) _vPoleProj.set(0, 0, 1);
    }
    _vPoleProj.normalize();

    // Law of cosines: L2^2 = L1^2 + reach^2 - 2 * L1 * reach * cos(alpha)
    const cosAlpha = clamp((L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach), -1, 1);
    const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

    outMidPos
      .copy(rootPos)
      .addScaledVector(_vDir, L1 * cosAlpha)
      .addScaledVector(_vPoleProj, L1 * sinAlpha);

    return outMidPos;
  }

  const _mRot = new THREE.Matrix4();
  const _yAxis = new THREE.Vector3();
  const _xAxis = new THREE.Vector3();
  const _zAxis = new THREE.Vector3();

  /**
   * Builds a world rotation quaternion where +Y points from startPos to endPos,
   * and +Z aligns as closely as possible with forwardHint (twist-free limb orientation).
   */
  function computeLimbWorldQuaternion(startPos, endPos, forwardHint, outQuat) {
    _yAxis.subVectors(endPos, startPos);
    if (_yAxis.lengthSq() < 1e-8) _yAxis.set(0, -1, 0);
    _yAxis.normalize();

    _xAxis.crossVectors(_yAxis, forwardHint);
    if (_xAxis.lengthSq() < 1e-8) {
      _xAxis.set(1, 0, 0);
    } else {
      _xAxis.normalize();
    }
    _zAxis.crossVectors(_xAxis, _yAxis).normalize();

    _mRot.makeBasis(_xAxis, _yAxis, _zAxis);
    outQuat.setFromRotationMatrix(_mRot);
    return outQuat;
  }

  window.GiraffeMath = {
    mulberry32,
    clamp,
    lerp,
    smoothstep,
    smootherstep,
    hash3,
    noise3D,
    fbm3D,
    fbm2D,
    sampleStationCurve,
    solveTwoBoneIK,
    computeLimbWorldQuaternion
  };
})();
