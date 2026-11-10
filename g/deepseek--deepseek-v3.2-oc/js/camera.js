/* ==========================================================================
   camera.js — a small hand-rolled orbit camera (no examples/ deps, because
   three.min.js is the only vendored file).

   Conventions: the giraffe faces +X and stands at the origin, so azimuth 0
   places the camera on -Z (a clean left-side elevation view).
   ========================================================================== */
(function (GIR) {
  'use strict';
  var C = {};
  GIR.CameraRig = C;

  /* az/pol in radians, dist in metres, target [x,y,z] */
  C.presets = {
    side:     { az: 0.00, pol: 1.40, dist: 10.5, tgt: [0.55, 2.30, 0], fov: 32 },
    quarter:  { az: -0.62, pol: 1.36, dist: 11.0, tgt: [0.60, 2.35, 0], fov: 34 },
    front:    { az: -1.45, pol: 1.44, dist: 9.5, tgt: [1.00, 2.60, 0], fov: 36 },
    rear:     { az: 1.50, pol: 1.42, dist: 10.0, tgt: [0.40, 2.40, 0], fov: 36 },
    low:      { az: -0.30, pol: 1.63, dist: 9.0, tgt: [0.60, 2.10, 0], fov: 30 },
    hero:     { az: -0.95, pol: 1.28, dist: 8.2, tgt: [0.75, 2.90, 0], fov: 28 },
    head:     { az: -0.95, pol: 1.40, dist: 3.4, tgt: [2.00, 4.35, 0], fov: 34 },
    hooves:   { az: -0.35, pol: 1.50, dist: 4.6, tgt: [0.30, 1.05, 0], fov: 38 },
    top:      { az: 0.00, pol: 0.30, dist: 15.0, tgt: [0.10, 0.60, 0], fov: 40 },
    wide:     { az: -0.45, pol: 1.35, dist: 17.0, tgt: [0.30, 2.40, 0], fov: 42 }
  };

  C.create = function (camera, dom, opt) {
    opt = opt || {};
    var p = C.presets[opt.preset || 'quarter'];
    var st = {
      az: p.az, pol: p.pol, dist: p.dist,
      vAz: 0, vPol: 0, vDist: 0,
      tgt: new THREE.Vector3(p.tgt[0], p.tgt[1], p.tgt[2]),
      tgtGoal: new THREE.Vector3(p.tgt[0], p.tgt[1], p.tgt[2]),
      fov: p.fov,
      minDist: 1.6, maxDist: 40, minPol: 0.16, maxPol: 1.63,
      drag: 0.0055, auto: !!opt.auto, autoSpeed: 0.045, idle: 0,
      enabled: true
    };
    var cur = { az: st.az, pol: st.pol, dist: st.dist };
    var pointers = {};
    var lastPinch = 0;

    function onDown(e) {
      if (!st.enabled) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY, btn: e.button };
      st.idle = 0;
      if (dom.setPointerCapture) { try { dom.setPointerCapture(e.pointerId); } catch (err) {} }
    }
    function onMove(e) {
      var pt = pointers[e.pointerId];
      if (!pt || !st.enabled) return;
      var dx = e.clientX - pt.x, dy = e.clientY - pt.y;
      pt.x = e.clientX; pt.y = e.clientY;
      var ids = Object.keys(pointers);
      if (ids.length >= 2) {
        /* two pointers: pinch zoom + vertical pan */
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch > 0) st.vDist += (lastPinch - dist) * 0.03;
        lastPinch = dist;
        return;
      }
      if (pt.btn === 2 || e.shiftKey) {
        /* pan the pivot along the view plane */
        var right = new THREE.Vector3(Math.cos(st.az), 0, -Math.sin(st.az));
        var up = new THREE.Vector3(0, 1, 0);
        var k = st.dist * 0.0016;
        st.tgtGoal.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
        st.tgtGoal.y = GIR.clamp(st.tgtGoal.y, 0.2, 6);
      } else {
        st.vAz -= dx * st.drag;
        st.vPol -= dy * st.drag;
      }
      st.idle = 0;
    }
    function onUp(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) lastPinch = 0;
    }
    function onWheel(e) {
      if (!st.enabled) return;
      e.preventDefault();
      st.vDist += GIR.clamp(e.deltaY, -120, 120) * st.dist * 0.0011;
      st.idle = 0;
    }

    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    var api = {
      state: st,
      camera: camera,
      setPreset: function (name, snap) {
        var q = C.presets[name];
        if (!q) return;
        st.tgtGoal.set(q.tgt[0], q.tgt[1], q.tgt[2]);
        st.fov = q.fov;
        if (snap) {
          st.az = cur.az = q.az; st.pol = cur.pol = q.pol; st.dist = cur.dist = q.dist;
          st.vAz = st.vPol = st.vDist = 0;
        } else {
          /* shortest way around */
          var d = GIR.mod(q.az - st.az + Math.PI, GIR.TAU) - Math.PI;
          st.az += d; st.pol = q.pol; st.dist = q.dist;
          st.vAz = st.vPol = st.vDist = 0;
        }
        api.name = name;
      },
      setAuto: function (on) { st.auto = on; },
      focus: function (x, y, z) { st.tgtGoal.set(x, y, z); },
      nudge: function (dAz, dPol, dDist) {
        st.vAz += dAz; st.vPol += dPol; st.vDist += dDist; st.idle = 0;
      },
      update: function (dt) {
        st.idle += dt;
        if (st.auto && st.idle > 2.2) {
          st.vAz -= st.autoSpeed * dt * (1 - Math.min(1, (st.idle - 2.2) / 1.5) * 0.0);
        }
        var k = Math.min(1, dt * 7.5);
        st.az += st.vAz * k;
        st.pol = GIR.clamp(st.pol + st.vPol * k, st.minPol, st.maxPol);
        st.dist = GIR.clamp(st.dist + st.vDist * k, st.minDist, st.maxDist);
        st.vAz *= Math.pow(0.86, dt * 60);
        st.vPol *= Math.pow(0.86, dt * 60);
        st.vDist *= Math.pow(0.80, dt * 60);
        if (Math.abs(st.vAz) < 1e-5) st.vAz = 0;

        st.tgt.lerp(st.tgtGoal, Math.min(1, dt * 3.4));
        cur.az = st.az; cur.pol = st.pol; cur.dist = st.dist;

        var sp = Math.sin(st.pol), cp = Math.cos(st.pol);
        camera.position.set(
          st.tgt.x - st.dist * sp * Math.sin(st.az),
          st.tgt.y + st.dist * cp,
          st.tgt.z - st.dist * sp * Math.cos(st.az));
        camera.up.set(0, 1, 0);
        camera.lookAt(st.tgt);
        if (Math.abs(camera.fov - st.fov) > 0.01) {
          camera.fov += (st.fov - camera.fov) * Math.min(1, dt * 5);
          camera.updateProjectionMatrix();
        }
        api.target = st.tgt;
      },
      info: function () {
        return {
          az: +GIR.fmt(GIR.mod(st.az, GIR.TAU) / GIR.DEG, 1),
          elev: +GIR.fmt((Math.PI / 2 - st.pol) / GIR.DEG, 1),
          dist: +GIR.fmt(st.dist, 2),
          target: [+GIR.fmt(st.tgt.x, 2), +GIR.fmt(st.tgt.y, 2), +GIR.fmt(st.tgt.z, 2)]
        };
      },
      dispose: function () {
        dom.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('wheel', onWheel);
      }
    };
    api.setPreset(opt.preset || 'quarter', true);
    return api;
  };

})(window.GIR);
