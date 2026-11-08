'use strict';
/*
 * Analytic-ish IK for a 3 segment limb (shoulder -> elbow -> knee -> fetlock).
 *
 * The limb shape is defined by relative joint angles beta[] at full compression
 * (f = 1).  A single scalar f is bisected so that the chain reaches the target
 * distance, then the whole chain is rotated so its end lands exactly on the
 * target while bending towards `pole`.
 */
const IK = (() => {
  const DOWN = new THREE.Vector3(0, -1, 0);
  const _w = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3();
  const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3(), _c = new THREE.Vector3();
  const dirA = new THREE.Vector3(), dirB = new THREE.Vector3(), dirC = new THREE.Vector3();
  const endV = new THREE.Vector3();

  function rotAbout(v, axis, ang, out) {
    out.copy(v).applyAxisAngle(axis, ang);
    return out;
  }

  /* canonical chain (base = straight down) for a given f */
  function canonicalEnd(L, beta, w0, f) {
    const a = L[0], b = L[1], c = L[2];
    const a1 = f * beta[0], a2 = f * beta[1], a3 = f * beta[2];
    dirA.copy(DOWN).applyAxisAngle(w0, a1);
    dirB.copy(dirA).applyAxisAngle(w0, a2);
    dirC.copy(dirB).applyAxisAngle(w0, a3);
    endV.set(0, 0, 0)
      .addScaledVector(dirA, a)
      .addScaledVector(dirB, b)
      .addScaledVector(dirC, c);
    return endV;
  }

  /**
   * @param S start joint (shoulder), @param T target (fetlock)
   * @param L [len1,len2,len3], @param beta [b1,b2,b3] radians at f=1
   * @param pole direction the limb bends towards (only its component ⟂ S->T matters)
   * @param out array of 4 reusable THREE.Vector3, returns out[3] (reached end)
   */
  function solve3(S, T, L, beta, pole, out, fMin, fMax) {
    fMin = fMin === undefined ? 0 : fMin;
    fMax = fMax === undefined ? 1.75 : fMax;
    out[0].copy(S);
    const d = _v.subVectors(T, S).length();
    const Lmax = L[0] + L[1] + L[2];

    // bend axis in the canonical frame
    _p.copy(pole);
    _p.addScaledVector(DOWN, -_p.dot(DOWN));
    if (_p.lengthSq() < 1e-9) _p.set(-1, 0, 0);
    _p.normalize();
    const w0 = _w.crossVectors(DOWN, _p).normalize();

    let f;
    if (d >= Lmax * 0.9999) {
      f = 0;
    } else {
      // bisect f so |end(f)| == d  (reach decreases as f grows)
      let lo = fMin, hi = fMax;
      let eHi = canonicalEnd(L, beta, w0, hi).length();
      if (eHi >= d) { f = hi; }
      else {
        let eLo = canonicalEnd(L, beta, w0, lo).length();
        if (eLo <= d) { f = lo; }
        else {
          for (let it = 0; it < 26; it++) {
            const mid = 0.5 * (lo + hi);
            const em = canonicalEnd(L, beta, w0, mid).length();
            if (em > d) lo = mid; else hi = mid;
          }
          f = 0.5 * (lo + hi);
        }
      }
    }

    canonicalEnd(L, beta, w0, f); // sets dirA/dirB/dirC/endV
    _e.copy(endV);
    if (_e.lengthSq() < 1e-9) _e.copy(DOWN);
    _e.normalize();

    // target frame
    _v.subVectors(T, S).normalize();                 // u
    _p.copy(pole);
    _p.addScaledVector(_v, -_p.dot(_v));
    if (_p.lengthSq() < 1e-9) { _p.set(1, 0, 0).addScaledVector(_v, -_v.x); }
    _p.normalize();
    const w = _c.crossVectors(_v, _p).normalize();

    const c1 = _e.clone().cross(w0).normalize();  // e x w0  (unit, ⟂ both)
    const c2 = _v.clone().cross(w).normalize();
    _m1.makeBasis(_e, w0, c1);
    _m2.makeBasis(_v, w, c2);
    _q.setFromRotationMatrix(_m2.multiply(_m1.transpose()));

    out[1].copy(out[0]).addScaledVector(dirA.applyQuaternion(_q), L[0]);
    out[2].copy(out[1]).addScaledVector(dirB.applyQuaternion(_q), L[1]);
    out[3].copy(out[2]).addScaledVector(dirC.applyQuaternion(_q), L[2]);
    return out;
  }

  return { solve3 };
})();
