(function (global) {
  'use strict';

  const G = (global.GiraffeApp = global.GiraffeApp || {});
  const THREE = global.THREE;

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function smootherstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function damp(a, b, lambda, dt) {
    return lerp(a, b, 1 - Math.exp(-lambda * dt));
  }

  // Deterministic hash / value noise for terrain, grass, and procedural geometry
  function hash2(x, y) {
    const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return h - Math.floor(h);
  }

  function hash3(x, y, z) {
    const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
    return h - Math.floor(h);
  }

  function noise2(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
  }

  function fbm2(x, y, octaves = 4) {
    let value = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
      value += amp * (noise2(x * freq, y * freq) * 2 - 1);
      freq *= 2.03;
      amp *= 0.5;
    }
    return value;
  }

  // Gentle savannah undulations; mostly flat near origin for clean inspection
  function groundHeight(x, z) {
    const dist = Math.hypot(x, z);
    const centerFlatten = smoothstep(4.0, 18.0, dist);
    const largeHills = Math.sin(x * 0.045) * Math.cos(z * 0.04) * 0.65 +
      Math.sin((x + z) * 0.028) * 0.45;
    const micro = fbm2(x * 0.09 + 11.3, z * 0.09 - 7.1, 3) * 0.18;
    return (largeHills + micro) * centerFlatten;
  }

  function groundNormal(x, z, out = new THREE.Vector3()) {
    const eps = 0.15;
    const hL = groundHeight(x - eps, z);
    const hR = groundHeight(x + eps, z);
    const hD = groundHeight(x, z - eps);
    const hU = groundHeight(x, z + eps);
    return out.set(hL - hR, 2 * eps, hD - hU).normalize();
  }

  // Analytical 2-bone IK solver:
  // Given joint A, target C, lengths L1 (A->B) and L2 (B->C), and pole hint vector P,
  // computes mid-joint B (stored in outMid) and optionally clamped end C' (stored in outEnd).
  const _d = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _perp = new THREE.Vector3();
  const _fallback = new THREE.Vector3();

  function solveTwoBoneIK(A, C, L1, L2, poleDir, outMid, outEnd) {
    _d.subVectors(C, A);
    const rawDist = _d.length();
    if (rawDist < 1e-6) {
      _dir.set(0, -1, 0);
    } else {
      _dir.copy(_d).divideScalar(rawDist);
    }

    const minDist = Math.abs(L1 - L2) + 0.005;
    const maxDist = L1 + L2 - 0.004;
    const dist = clamp(rawDist, minDist, maxDist);

    const cosAlpha = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const sinAlpha = Math.sqrt(Math.max(0, 1 - cosAlpha * cosAlpha));

    // Orthogonalize poleDir against _dir
    const dotP = poleDir.dot(_dir);
    _perp.copy(poleDir).addScaledVector(_dir, -dotP);
    if (_perp.lengthSq() < 1e-8) {
      _fallback.set(1, 0, 0);
      _perp.crossVectors(_fallback, _dir);
      if (_perp.lengthSq() < 1e-8) {
        _perp.set(0, 0, 1);
      }
    }
    _perp.normalize();

    outMid
      .copy(A)
      .addScaledVector(_dir, L1 * cosAlpha)
      .addScaledVector(_perp, L1 * sinAlpha);

    if (outEnd) {
      outEnd.copy(A).addScaledVector(_dir, dist);
    }
    return dist;
  }

  // Evaluate a smooth piecewise cubic / Catmull-Rom curve for anatomical profiles
  function catmullRomValue(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  // Sample sorted [{t, ...}] keyframe table with Catmull-Rom or linear interpolation
  function sampleProfile(keys, t, fields) {
    if (t <= keys[0].t) {
      const res = {};
      for (const f of fields) res[f] = keys[0][f];
      return res;
    }
    const last = keys.length - 1;
    if (t >= keys[last].t) {
      const res = {};
      for (const f of fields) res[f] = keys[last][f];
      return res;
    }
    let idx = 0;
    for (let i = 0; i < last; i++) {
      if (t >= keys[i].t && t <= keys[i + 1].t) {
        idx = i;
        break;
      }
    }
    const k0 = keys[Math.max(0, idx - 1)];
    const k1 = keys[idx];
    const k2 = keys[idx + 1];
    const k3 = keys[Math.min(last, idx + 2)];
    const span = k2.t - k1.t;
    const u = span > 1e-6 ? (t - k1.t) / span : 0;

    const res = {};
    for (const f of fields) {
      res[f] = catmullRomValue(k0[f], k1[f], k2[f], k3[f], u);
    }
    return res;
  }

  G.MathUtils = {
    clamp,
    lerp,
    smoothstep,
    smootherstep,
    damp,
    hash2,
    hash3,
    noise2,
    fbm2,
    groundHeight,
    groundNormal,
    solveTwoBoneIK,
    sampleProfile
  };
})(window);
