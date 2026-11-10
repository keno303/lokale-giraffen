/* ------------------------------------------------------------------
 * controls.js -- minimal orbit / pan / zoom camera rig.
 * Written from scratch (no examples/js dependency) so the page needs
 * nothing but three.min.js and works from file://.
 * ------------------------------------------------------------------ */
(function (root, factory) {
  var api = factory(root.THREE);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CAM = api;
})(typeof self !== 'undefined' ? self : globalThis, function (THREE) {
  'use strict';

  function Orbit(camera, domElement, opts) {
    opts = opts || {};
    var self = this;
    this.camera = camera;
    this.dom = domElement;
    this.target = opts.target ? opts.target.clone() : new THREE.Vector3(0, 2.3, 0);
    this.minDistance = opts.minDistance || 2.5;
    this.maxDistance = opts.maxDistance || 42;
    this.minPolar = opts.minPolar || 0.12;
    this.maxPolar = opts.maxPolar || Math.PI * 0.495;
    this.autoRotate = opts.autoRotate !== false;
    this.autoRotateSpeed = opts.autoRotateSpeed || 0.055;
    this.enabled = true;

    var dist = opts.distance || 13;
    var azimuth = opts.azimuth === undefined ? 0.72 : opts.azimuth;
    var polar = opts.polar === undefined ? 1.24 : opts.polar;

    var _t = {
      dist: dist, az: azimuth, po: polar,
      tx: this.target.x, ty: this.target.y, tz: this.target.z
    };
    this.state = _t;

    var dragging = 0, lastX = 0, lastY = 0;
    var velAz = 0, velPo = 0;
    var pinch = 0;

    function onDown(e) {
      if (!self.enabled) return;
      var isRight = e.button === 2 || e.shiftKey;
      dragging = isRight ? 2 : 1;
      lastX = e.clientX; lastY = e.clientY;
      self.autoRotate = false;
      domElement.setPointerCapture && domElement.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (!dragging || !self.enabled) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (dragging === 1) {
        _t.az -= dx * 0.0055;
        _t.po = clamp(_t.po - dy * 0.0045, self.minPolar, self.maxPolar);
        velAz = -dx * 0.0055;
      } else {
        var s = _t.dist * 0.0016;
        var right = new THREE.Vector3(-Math.sin(_t.az), 0, Math.cos(_t.az));
        var fwd = new THREE.Vector3(Math.cos(_t.az), 0, Math.sin(_t.az));
        _t.tx -= (right.x * dx + fwd.x * dy * 0.6) * s;
        _t.tz -= (right.z * dx + fwd.z * dy * 0.6) * s;
        _t.ty += dy * s;
      }
    }
    function onUp(e) {
      dragging = 0;
      domElement.releasePointerCapture && e.pointerId !== undefined &&
        domElement.releasePointerCapture(e.pointerId);
    }
    function onWheel(e) {
      if (!self.enabled) return;
      e.preventDefault();
      var k = Math.exp(e.deltaY * 0.0012);
      _t.dist = clamp(_t.dist * k, self.minDistance, self.maxDistance);
    }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

    domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    domElement.addEventListener('wheel', onWheel, { passive: false });
    domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // touch pinch
    var touches = {};
    domElement.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        pinch = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    domElement.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && pinch) {
        var d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        _t.dist = clamp(_t.dist * (pinch / d), self.minDistance, self.maxDistance);
        pinch = d;
        self.autoRotate = false;
      }
    }, { passive: true });
    domElement.addEventListener('touchend', function () { pinch = 0; }, { passive: true });

    this.update = function (dt) {
      if (self.autoRotate) _t.az += self.autoRotateSpeed * dt;
      _t.az += velAz;
      velAz *= 0.90;
      if (Math.abs(velAz) < 1e-5) velAz = 0;

      var sp = Math.sin(_t.po), cp = Math.cos(_t.po);
      var x = _t.tx + _t.dist * sp * Math.cos(_t.az);
      var y = _t.ty + _t.dist * cp;
      var z = _t.tz + _t.dist * sp * Math.sin(_t.az);
      camera.position.set(x, y, z);
      camera.lookAt(_t.tx, _t.ty, _t.tz);
    };

    this.setTarget = function (v) { _t.tx = v.x; _t.ty = v.y; _t.tz = v.z; };
    this.setDistance = function (d) { _t.dist = clamp(d, self.minDistance, self.maxDistance); };
    this.setAngles = function (a, p) {
      if (a !== undefined) _t.az = a;
      if (p !== undefined) _t.po = clamp(p, self.minPolar, self.maxPolar);
    };
    this.reset = function () {
      _t.dist = dist; _t.az = azimuth; _t.po = polar;
      _t.tx = self.target.x; _t.ty = self.target.y; _t.tz = self.target.z;
    };
    this.update(0);
  }

  return { Orbit: Orbit };
});
