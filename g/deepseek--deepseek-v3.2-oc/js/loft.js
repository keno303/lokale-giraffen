/* ==========================================================================
   loft.js — the geometry workhorse.  Nearly everything organic is a loft:
   a stack of superellipse sections swept along a spine, with
   parallel-transported frames and METRIC u/v coordinates.

   Metric UVs are what lets one coat texture wrap a 1 m-deep chest and a
   9 cm cannon bone and still keep the patches ~0.27 m wide everywhere.

   Ring authoring fields
     x,y,z       section centre
     w           half width  along the section's "side" axis a
     hi, lo      half size   along  b / -b     (dorsal / ventral)
     sq          roundness:  2 = ellipse, 3.4 = boxy
     off         shift of the section centre along b
     fade        base coat-fade (0 = fully patterned, 1 = pale skin)
     fadeV       extra fade on the ventral half (belly / throat)
     fadeD       extra fade on the dorsal half
     axis, side  optional explicit frame directions

   Frame convention:  b = a x n   (n = along the spine)
     torso / neck / head  side = [0,0,1]  ->  a = lateral, b = dorsal
     limb segments        n = [0,-1,0]    ->  a = lateral, b = cranial
   The per-vertex `aFade` attribute is consumed by Skin.material(), which
   mixes the patterned diffuse colour towards pale cream — belly, inner
   thighs and the white "stockings" of the lower legs.

   The builder also records enough rest data (ring index per vertex, ring
   centres and bases) for Deform.js to re-bend the surface every frame.
   ========================================================================== */
(function (GIR) {
  'use strict';
  var L = {};
  GIR.Loft = L;
  var TAU = GIR.TAU;

  function v3(x, y, z) { return new THREE.Vector3(x || 0, y || 0, z || 0); }
  L.v3 = v3;

  /* superellipse section point; e = 2 reproduces an exact ellipse */
  function sectionPoint(c, s, w, hi, lo, sq) {
    var e = 2 / (sq || 2);
    return [Math.sign(c) * Math.pow(Math.abs(c), e) * w,
            Math.sign(s) * Math.pow(Math.abs(s), e) * (s >= 0 ? hi : lo)];
  }

  /* rough perimeter, so u can advance in real metres */
  function perimeter(w, hi, lo, sq) {
    var h = (hi + lo) * 0.5;
    var a = Math.max(w, h), b = Math.min(w, h);
    var p = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    return p * GIR.clamp((sq || 2) / 2, 1, 1.25);
  }

  function defaultSide(n) {
    var up = v3(0, 0, 1);
    if (Math.abs(n.dot(up)) > 0.92) up = v3(0, 1, 0);
    return up.cross(n).normalize();
  }

  /* --------------------------------------------------------------- build -- */
  L.build = function (rings, opts) {
    opts = opts || {};
    var seg = opts.seg || 24;
    var tile = opts.tile || 3.0;
    var capRings = opts.capRings === undefined ? 4 : opts.capRings;
    var capScale = opts.capScale === undefined ? 0.8 : opts.capScale;
    var uShift = opts.uShift || 0, vShift = opts.vShift || 0;
    var n = rings.length, i, j;

    /* normalise authoring shorthand */
    var R = [];
    for (i = 0; i < n; i++) {
      var s = rings[i];
      R.push({
        x: s.x, y: s.y, z: s.z,
        w: s.w,
        hi: s.hi === undefined ? s.w : s.hi,
        lo: s.lo === undefined ? s.w : s.lo,
        sq: s.sq === undefined ? 2 : s.sq,
        off: s.off || 0,
        fade: s.fade || 0, fadeV: s.fadeV || 0, fadeD: s.fadeD || 0,
        axis: s.axis || null, side: s.side || null
      });
    }

    /* round caps: quarter-ellipse taper past each open end.  The cap keeps
       the section's own frame orientation, so `hi` stays dorsal even at a
       tapered end (a mirrored cap would put the belly radius on the back). */
    function capList(isEnd) {
      var idx = isEnd ? n - 1 : 0;
      var r0 = R[idx];
      var sp;                                   /* spine direction (increasing index) */
      if (r0.axis) sp = v3(r0.axis[0], r0.axis[1], r0.axis[2]).normalize();
      else {
        var nb = R[isEnd ? n - 2 : 1];
        sp = isEnd ? v3(r0.x - nb.x, r0.y - nb.y, r0.z - nb.z)
                   : v3(nb.x - r0.x, nb.y - r0.y, nb.z - r0.z);
        if (sp.lengthSq() < 1e-12) sp = v3(1, 0, 0);
        sp.normalize();
      }
      var out = [];
      var mean = (r0.w + r0.hi + r0.lo) / 3 * capScale;
      for (var k = 1; k <= capRings; k++) {
        var t = k / (capRings + 1) * (Math.PI / 2);
        var sc = Math.cos(t);
        var adv = mean * Math.sin(t) * (isEnd ? 1 : -1);
        out.push({
          x: r0.x + sp.x * adv, y: r0.y + sp.y * adv, z: r0.z + sp.z * adv,
          w: Math.max(0.0015, r0.w * sc),
          hi: Math.max(0.0015, r0.hi * sc),
          lo: Math.max(0.0015, r0.lo * sc),
          sq: r0.sq, off: r0.off,
          fade: r0.fade, fadeV: r0.fadeV, fadeD: r0.fadeD,
          axis: [sp.x, sp.y, sp.z],
          side: r0.side ? [r0.side[0], r0.side[1], r0.side[2]] : null
        });
      }
      return out;
    }
    var full = [];
    if (!opts.startOpen) {
      var cs = capList(false);
      for (i = cs.length - 1; i >= 0; i--) full.push(cs[i]);   /* tip first, growing into ring 0 */
    }
    for (i = 0; i < n; i++) full.push(R[i]);
    if (!opts.endOpen) full = full.concat(capList(true));
    var m = full.length;

    /* ---- frames: axis from neighbours, side parallel-transported ---- */
    var Q = [], NN = [], AA = [], BB = [];
    for (i = 0; i < m; i++) Q.push(v3(full[i].x, full[i].y, full[i].z));
    for (i = 0; i < m; i++) {
      var axv;
      if (full[i].axis) axv = v3(full[i].axis[0], full[i].axis[1], full[i].axis[2]).normalize();
      else {
        var p0 = Q[Math.max(0, i - 1)], p1 = Q[Math.min(m - 1, i + 1)];
        axv = p1.clone().sub(p0);
        if (axv.lengthSq() < 1e-12) axv = NN.length ? NN[NN.length - 1].clone() : v3(1, 0, 0);
        axv.normalize();
      }
      NN.push(axv);
      if (full[i].side) AA.push(v3(full[i].side[0], full[i].side[1], full[i].side[2]).normalize());
      else if (i === 0) AA.push(defaultSide(axv));
      else {
        var av = AA[i - 1].clone();
        var rots = NN[i - 1].clone().cross(NN[i]);
        if (rots.lengthSq() > 1e-10) {
          av.applyAxisAngle(rots.normalize(), Math.acos(GIR.clamp(NN[i - 1].dot(NN[i]), -1, 1)));
        }
        av.sub(NN[i].clone().multiplyScalar(av.dot(NN[i])));
        if (av.lengthSq() < 1e-8) av = defaultSide(NN[i]);
        AA.push(av.normalize());
      }
      BB.push(AA[i].clone().cross(NN[i]).normalize());
    }

    /* ---- metric arc coordinates ---- */
    var per = [], cumV = [], v = 0, prev = null;
    for (i = 0; i < m; i++) {
      per.push(perimeter(full[i].w, full[i].hi, full[i].lo, full[i].sq));
      if (i > 0) v += Q[i].distanceTo(Q[i - 1]);
      cumV.push(v / tile + vShift);
    }

    /* ---- vertices ---- */
    var pos = [], uv = [], fade = [], ringId = [], rowLen = seg + 1;
    for (i = 0; i < m; i++) {
      var f = full[i];
      var cOff = BB[i].clone().multiplyScalar(f.off);
      for (j = 0; j <= seg; j++) {
        var th = j / seg * TAU;
        var cs = Math.cos(th), sn = Math.sin(th);
        var pt = sectionPoint(cs, sn, f.w, f.hi, f.lo, f.sq);
        pos.push(Q[i].x + cOff.x + AA[i].x * pt[0] + BB[i].x * pt[1],
                 Q[i].y + cOff.y + AA[i].y * pt[0] + BB[i].y * pt[1],
                 Q[i].z + cOff.z + AA[i].z * pt[0] + BB[i].z * pt[1]);
        uv.push(j / seg * per[i] / tile + uShift, cumV[i]);
        var vent = Math.max(0, -sn), dors = Math.max(0, sn);
        fade.push(GIR.clamp(f.fade + f.fadeV * Math.pow(vent, 1.35) + f.fadeD * Math.pow(dors, 1.35), 0, 1));
        ringId.push(i);
      }
    }
    var idx = [];
    for (i = 0; i < m - 1; i++) {
      for (j = 0; j < seg; j++) {
        var a = i * rowLen + j, b = a + rowLen, c = a + 1, d = b + 1;
        idx.push(a, b, c, c, b, d);
      }
    }

    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();

    /* rest data for Deform */
    var centres = [], bases = [];
    for (i = 0; i < m; i++) {
      var cO = BB[i].clone().multiplyScalar(full[i].off);
      centres.push([Q[i].x + cO.x, Q[i].y + cO.y, Q[i].z + cO.z]);
      bases.push([AA[i].toArray(), BB[i].toArray(), NN[i].toArray()]);
    }
    g.userData.loft = { ringId: ringId, centres: centres, bases: bases, seg: seg, rings: full, tile: tile };
    g.userData.parts = m;
    return g;
  };

  /* ---------------------------------------------------------------- bone -- */
  /* Straight-ish tube between two local points shaped by prof(t). */
  L.bone = function (p0, p1, prof, opts) {
    opts = opts || {};
    var samples = opts.samples || 12;
    var a = v3(p0[0], p0[1], p0[2]), b = v3(p1[0], p1[1], p1[2]);
    var len = b.distanceTo(a);
    var rings = [], i;
    for (i = 0; i <= samples; i++) {
      var t = i / samples;
      var p = prof(t, len);
      var q = a.clone().lerp(b, t);
      if (opts.curve) { var cv = opts.curve(t); q.x += cv[0]; q.y += cv[1]; q.z += cv[2]; }
      rings.push({
        x: q.x, y: q.y, z: q.z, w: p.w,
        hi: p.hi === undefined ? p.w : p.hi,
        lo: p.lo === undefined ? p.w : p.lo,
        sq: p.sq === undefined ? opts.sq : p.sq,
        off: p.off === undefined ? opts.off : p.off,
        fade: p.fade === undefined ? opts.fade : p.fade,
        fadeV: p.fadeV === undefined ? opts.fadeV : p.fadeV,
        fadeD: p.fadeD === undefined ? opts.fadeD : p.fadeD,
        axis: opts.axis, side: opts.side
      });
    }
    return L.build(rings, opts);
  };

  /* A limb segment pointing down (-Y) from a joint: the workhorse for legs.
     profile arrays are [rStart, rEnd]; `back` fattens the caudal side
     (the tendon ridge you can see through the skin on a real ungulate). */
  L.boneY = function (len, rr, opts) {
    opts = opts || {};
    var r0 = rr[0], r1 = rr[1];
    var knob = opts.knob === undefined ? 0.13 : opts.knob;
    var back = opts.back || 0;            /* caudal offset of the section centre */
    var sideBulge = opts.sideBulge || 0;
    return L.bone([0, 0, 0], [0, -len, 0], function (t) {
      var r = GIR.lerp(r0, r1, Math.pow(t, opts.taperPow || 1));
      var endKnob = knob * (Math.pow(1 - t, 2.6) + 0.55 * Math.pow(t, 2.2));
      var mid = 1 + endKnob * 0.55 + sideBulge * GIR.hump(t) * 0.4;
      var muscle = (opts.muscle || 0) * GIR.hump(GIR.clamp(t * 1.25, 0, 1));
      return {
        w: r * mid * (1 + muscle * 0.35),
        hi: r * mid * (1 + muscle * 0.2) * (1 + 0.05 * endKnob),
        lo: r * mid * (1 + back * 0.6),
        off: -back * r * (0.55 * (1 - t)),
        fade: (opts.fade === undefined ? 0 : opts.fade) + (opts.fadeEnd || 0) * Math.pow(t, opts.fadePow || 1),
        fadeV: opts.fadeV || 0, fadeD: opts.fadeD || 0,
        sq: opts.sq || 2.1
      };
    }, {
      seg: opts.seg || 18, samples: opts.samples || 12, tile: opts.tile || 3.0,
      side: opts.side || [0, 0, 1], axis: [0, -1, 0], capScale: opts.capScale,
      capRings: opts.capRings, uShift: opts.uShift, vShift: opts.vShift,
      startOpen: opts.startOpen, endOpen: opts.endOpen
    });
  };

  /* flat leaf: ears, nostril flaps, grass, tree sapling leaves */
  L.leaf = function (len, widthFn, opts) {
    opts = opts || {};
    var thick = opts.thick === undefined ? 0.02 : opts.thick;
    return L.bone([0, 0, 0], [0, len, 0], function (t) {
      var w = widthFn(t);
      return {
        w: w,
        hi: thick * (1 - 0.45 * t) * (1 + (opts.rim || 0) * GIR.smoothstep(0.55, 1, t)),
        lo: thick * (1 - 0.45 * t),
        fade: GIR.lerp(opts.fade || 0, opts.fadeEnd === undefined ? (opts.fade || 0) : opts.fadeEnd, t),
        sq: opts.sq || 2
      };
    }, {
      seg: opts.seg || 12, samples: opts.samples || 9, tile: opts.tile || 3.0,
      /* default: a flat plate whose faces point sideways (+-Z) */
      side: opts.side || [1, 0, 0], axis: [0, 1, 0], capScale: opts.capScale,
      uShift: opts.uShift, vShift: opts.vShift
    });
  };

})(window.GIR);
