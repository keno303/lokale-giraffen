/* ==========================================================================
   skin.js — three things:
     1. GIR.Deform  re-bends a loft every frame (spine flexion, neck curve,
        head bob) using rigid per-ring transforms, which also rotates the
        stored rest normals, so lighting stays correct with no renormalising.
     2. GIR.Spine   authoring helper: relative bend/yaw/twist per ring.
     3. GIR.Mat     the material set, including the coat shader that mixes
        the reticulated pattern towards pale cream using the aFade attribute
        (belly, throat, inner thighs, white stockings on the lower legs).
   ========================================================================== */
(function (GIR) {
  'use strict';

  /* ------------------------------------------------------------- Deform -- */
  var D = {};
  GIR.Deform = D;
  var tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4();
  var tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

  D.create = function (geo) {
    var loft = geo.userData.loft;
    if (!loft) throw new Error('Deform.create: geometry is not a loft');
    var m = loft.centres.length;
    var bases = [], i, j;
    for (i = 0; i < m; i++) {
      var b = loft.bases[i];                     /* rows: a, b, n */
      var mat = new THREE.Matrix4();
      mat.makeBasis(new THREE.Vector3(b[0][0], b[0][1], b[0][2]),
                    new THREE.Vector3(b[1][0], b[1][1], b[1][2]),
                    new THREE.Vector3(b[2][0], b[2][1], b[2][2]));
      bases.push(mat);
    }
    var pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
    var rowLen = loft.seg + 1;
    var lc = new Float32Array(pos.length), ln = new Float32Array(nor.length);
    for (i = 0; i < m; i++) {
      var inv = bases[i].clone().transpose();
      var c = loft.centres[i];
      for (j = 0; j < rowLen; j++) {
        var k = (i * rowLen + j) * 3;
        tmpV.set(pos[k] - c[0], pos[k + 1] - c[1], pos[k + 2] - c[2]).applyMatrix4(inv);
        lc[k] = tmpV.x; lc[k + 1] = tmpV.y; lc[k + 2] = tmpV.z;
        tmpV2.set(nor[k], nor[k + 1], nor[k + 2]).applyMatrix4(inv);
        ln[k] = tmpV2.x; ln[k + 1] = tmpV2.y; ln[k + 2] = tmpV2.z;
      }
    }
    /* relative steps between neighbouring rest frames */
    var dRel = [], dPos = [], restQ = [];
    for (i = 0; i < m; i++) {
      var q = new THREE.Quaternion().setFromRotationMatrix(bases[i]);
      restQ.push(q);
      if (i > 0) {
        var prevInv = bases[i - 1].clone().transpose();
        var rel = tmpM.copy(prevInv).multiply(bases[i]);
        dRel.push(new THREE.Quaternion().setFromRotationMatrix(rel));
        var c0 = loft.centres[i - 1], c1 = loft.centres[i];
        dPos.push(new THREE.Vector3(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]).applyMatrix4(prevInv));
      }
    }
    return {
      geo: geo, rings: m, rowLen: rowLen, centres: loft.centres,
      lc: lc, ln: ln, dRel: dRel, dPos: dPos, restQ: restQ,
      qp: new Array(m), pp: new Array(m),
      basePos: null,               /* optional [x,y,z] offset of ring 0 */
      dirty: false
    };
  };

  /* extra: array of THREE.Quaternion (relative rotation per ring, ring 0 =
     root rotation) — pass null to restore the rest pose.  scaleArr: optional
     per-ring uniform scale (breathing). */
  D.apply = function (def, extra, scaleArr) {
    var m = def.rings, i, j;
    var pos = def.geo.attributes.position.array, nor = def.geo.attributes.normal.array;
    var qcur = def.qp, pcur = def.pp;
    for (i = 0; i < m; i++) {
      if (!qcur[i]) { qcur[i] = new THREE.Quaternion(); pcur[i] = new THREE.Vector3(); }
    }
    /* ring 0 */
    var c0 = def.centres[0];
    var bp = def.basePos;
    pcur[0].set(bp ? c0[0] + bp[0] : c0[0], bp ? c0[1] + bp[1] : c0[1], bp ? c0[2] + bp[2] : c0[2]);
    if (extra && extra[0]) qcur[0].copy(def.restQ[0]).multiply(extra[0]);
    else qcur[0].copy(def.restQ[0]);
    for (i = 1; i < m; i++) {
      pcur[i].copy(pcur[i - 1]).add(tmpV.copy(def.dPos[i - 1]).applyQuaternion(qcur[i - 1]));
      qcur[i].copy(qcur[i - 1]).multiply(def.dRel[i - 1]);
      if (extra && extra[i]) qcur[i].multiply(extra[i]);
    }
    var rl = def.rowLen, lc = def.lc, ln = def.ln;
    var sh = def.scaleHint, bw = def.breathW;
    for (i = 0; i < m; i++) {
      var c = pcur[i], q = qcur[i];
      var sc = scaleArr ? scaleArr[i] : 1;
      if (sh && sh !== 1 && sc === 1) sc = 1 + (sh - 1) * (bw ? bw[i] : 1);
      tmpM.makeRotationFromQuaternion(q);
      for (j = 0; j < rl; j++) {
        var k = (i * rl + j) * 3;
        tmpV.set(lc[k] * sc, lc[k + 1] * sc, lc[k + 2] * sc).applyMatrix4(tmpM);
        pos[k] = c.x + tmpV.x; pos[k + 1] = c.y + tmpV.y; pos[k + 2] = c.z + tmpV.z;
        tmpV2.set(ln[k], ln[k + 1], ln[k + 2]).applyMatrix4(tmpM);
        nor[k] = tmpV2.x; nor[k + 1] = tmpV2.y; nor[k + 2] = tmpV2.z;
      }
    }
    def.geo.attributes.position.needsUpdate = true;
    def.geo.attributes.normal.needsUpdate = true;
    def.geo.boundingSphere && def.geo.computeBoundingSphere();
    return def;
  };

  /* world-space position + orientation of ring `i` after the last apply() —
     used to park the head joint at the end of a bending neck. */
  D.tip = function (def, i) {
    return { p: def.pp[i].clone(), q: def.qp[i].clone() };
  };

  /* -------------------------------------------------------------- Spine -- */
  /* Holds a relative rotation per ring.  Ring i's rotation is the *extra*
     bend added between ring i-1 and ring i, so totals accumulate:
     a neck with 20 rings and -8 degrees distributed adds up to -8 degrees. */
  GIR.Spine = function (count) {
    var sp = {
      count: count,
      pitch: new Float32Array(count),   /* + = distal end tips up            */
      yaw: new Float32Array(count),     /* + = distal end swings to the right */
      roll: new Float32Array(count),    /* torsion about the spine           */
      extra: new Array(count)
    };
    for (var i = 0; i < count; i++) sp.extra[i] = new THREE.Quaternion();
    /* distribute totals across the rings using a weight profile */
    sp.bend = function (totalPitch, totalYaw, totalRoll, weights, rootExtra) {
      var sum = 0, i;
      for (i = 0; i < count; i++) sum += weights[i];
      for (i = 0; i < count; i++) {
        var w = weights[i] / (sum || 1);
        sp.pitch[i] = totalPitch * w + (i === 0 ? (rootExtra || 0) : 0);
        sp.yaw[i] = totalYaw * w;
        sp.roll[i] = totalRoll * w;
      }
      return sp;
    };
    /* add a per-ring delta on top of the current profile (joint play etc.) */
    sp.add = function (dPitch, dYaw, dRoll) {
      for (var i = 0; i < count; i++) {
        sp.pitch[i] += dPitch[i]; sp.yaw[i] += dYaw[i]; sp.roll[i] += dRoll[i];
      }
      return sp;
    };
    sp.build = function () {
      var e = new THREE.Euler();
      for (var i = 0; i < count; i++) {
        e.set(sp.pitch[i], sp.yaw[i], sp.roll[i], 'XYZ');
        sp.extra[i].setFromEuler(e);
      }
      return sp.extra;
    };
    return sp;
  };

  /* smooth bend weight: 0 until `a`, ramping to 1 at `b`, along 0..1 */
  GIR.rampWeights = function (count, a, b) {
    var w = new Float32Array(count), i;
    for (i = 0; i < count; i++) {
      var t = i / (count - 1);
      w[i] = GIR.smoothstep(a, b, t);
    }
    return w;
  };
  GIR.bandWeights = function (count, a, b, sharp) {
    var w = new Float32Array(count), i;
    for (i = 0; i < count; i++) {
      var t = i / (count - 1);
      w[i] = Math.pow(GIR.hump(GIR.smoothstep(a - 0.001, b + 0.001, t)), sharp || 1);
      if (w[i] < 1e-4) w[i] = 1e-4;
    }
    return w;
  };

  /* ----------------------------------------------------------------- Mat -- */
  var M = {};
  GIR.Mat = M;
  M.PALE = new THREE.Color(0.93, 0.90, 0.82);

  function injectFade(mat) {
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uPale = { value: M.PALE };
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nattribute float aFade;\nvarying float vFadeA;');
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvFadeA = aFade;');
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\nvarying float vFadeA;\nuniform vec3 uPale;');
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, uPale, clamp(vFadeA,0.0,1.0));');
    };
    /* make sure three recompiles when we need it */
    mat.customProgramCacheKey = function () { return 'gir-fade'; };
    return mat;
  }

  M.coat = function (tex, opts) {
    opts = opts || {};
    var mat = new THREE.MeshStandardMaterial({
      map: tex.map,
      bumpMap: tex.bump,
      bumpScale: opts.bump === undefined ? 0.012 : opts.bump,
      roughness: opts.rough === undefined ? 0.86 : opts.rough,
      metalness: 0.0,
      color: opts.color === undefined ? 0xffffff : opts.color,
      side: THREE.FrontSide
    });
    return injectFade(mat);
  };
  /* short hair parts: mane, tail switch, ossicone tufts, ear fringes */
  M.hair = function (tex, color, rough) {
    return new THREE.MeshStandardMaterial({
      map: tex, color: color === undefined ? 0x6b4224 : color,
      roughness: rough === undefined ? 0.95 : rough, metalness: 0
    });
  };
  M.leather = function (tex, color, rough) {
    var m = new THREE.MeshStandardMaterial({
      map: tex, color: color === undefined ? 0x4b3129 : color,
      roughness: rough === undefined ? 0.62 : rough, metalness: 0
    });
    return injectFade(m);
  };
  M.hoof = function (color) {
    return new THREE.MeshStandardMaterial({
      color: color === undefined ? 0x2e211b : color, roughness: 0.42, metalness: 0.02
    });
  };
  M.eye = function () {
    return new THREE.MeshStandardMaterial({ color: 0x140d09, roughness: 0.12, metalness: 0.0 });
  };
  M.white = function (c) {
    return new THREE.MeshStandardMaterial({ color: c === undefined ? 0xe8e0cf : c, roughness: 0.9 });
  };

})(window.GIR);
