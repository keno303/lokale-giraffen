/* Small self contained orbit camera: drag to rotate, right-drag or two
   fingers to pan, wheel or pinch to dolly. Critically damped-ish smoothing. */
(function (global) {
  'use strict';

  const U = global.GU;

  function OrbitCam(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 3.0, 0);
    this.goal = { target: this.target.clone(), dist: 16, theta: 0.7, phi: 1.26 };
    this.dist = 16; this.theta = 0.7; this.phi = 1.26;
    this.enabled = true;
    this.minPhi = 0.22; this.maxPhi = 1.54;
    this.minDist = 2.5; this.maxDist = 160;
    this._pointers = new Map();
    this._mode = null;
    this._last = { x: 0, y: 0, d: 0 };
    this._bind();
  }

  OrbitCam.prototype._bind = function () {
    const dom = this.dom;
    const self = this;
    dom.style.touchAction = 'none';
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    dom.addEventListener('pointerdown', function (e) {
      dom.setPointerCapture(e.pointerId);
      self._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (self._pointers.size === 1) {
        self._mode = (e.button === 2 || e.button === 1 || e.shiftKey) ? 'pan' : 'rotate';
        self._last.x = e.clientX; self._last.y = e.clientY;
      } else if (self._pointers.size === 2) {
        self._mode = 'pinch';
        const p = [...self._pointers.values()];
        self._last.d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        self._last.x = (p[0].x + p[1].x) / 2;
        self._last.y = (p[0].y + p[1].y) / 2;
      }
    });

    dom.addEventListener('pointermove', function (e) {
      if (!self._pointers.has(e.pointerId) || !self.enabled) return;
      self._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (self._mode === 'rotate') {
        const dx = e.clientX - self._last.x, dy = e.clientY - self._last.y;
        self._last.x = e.clientX; self._last.y = e.clientY;
        self.goal.theta -= dx * 0.0062;
        self.goal.phi = U.clamp(self.goal.phi - dy * 0.0055, self.minPhi, self.maxPhi);
      } else if (self._mode === 'pan') {
        const dx = e.clientX - self._last.x, dy = e.clientY - self._last.y;
        self._last.x = e.clientX; self._last.y = e.clientY;
        self._pan(dx, dy);
      } else if (self._mode === 'pinch') {
        const p = [...self._pointers.values()];
        if (p.length < 2) return;
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const cx = (p[0].x + p[1].x) / 2, cy = (p[0].y + p[1].y) / 2;
        if (self._last.d > 0) {
          self.goal.dist = U.clamp(self.goal.dist * (self._last.d / d), self.minDist, self.maxDist);
        }
        self._pan(cx - self._last.x, cy - self._last.y);
        self._last.d = d; self._last.x = cx; self._last.y = cy;
      }
    });

    const up = function (e) {
      self._pointers.delete(e.pointerId);
      self._mode = self._pointers.size === 1 ? 'rotate' : null;
      if (self._pointers.size === 1) {
        const p = [...self._pointers.values()][0];
        self._last.x = p.x; self._last.y = p.y;
      }
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);

    dom.addEventListener('wheel', function (e) {
      if (!self.enabled) return;
      e.preventDefault();
      const k = Math.exp(U.clamp(e.deltaY, -140, 140) * 0.0014);
      self.goal.dist = U.clamp(self.goal.dist * k, self.minDist, self.maxDist);
    }, { passive: false });
  };

  OrbitCam.prototype._pan = function (dx, dy) {
    const scale = this.dist * 0.0017;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.goal.target.addScaledVector(right, -dx * scale);
    this.goal.target.addScaledVector(up, dy * scale);
    this.goal.target.y = Math.max(this.goal.target.y, 0.2);
  };

  OrbitCam.prototype.frame = function (target, dist, theta, phi) {
    if (target) this.goal.target.copy(target);
    if (dist !== undefined) this.goal.dist = dist;
    if (theta !== undefined) this.goal.theta = theta;
    if (phi !== undefined) this.goal.phi = phi;
  };

  /* Jump straight to the goal, skipping the damping (used by deep links). */
  OrbitCam.prototype.snap = function () {
    this.target.copy(this.goal.target);
    this.dist = this.goal.dist;
    this.theta = this.goal.theta;
    this.phi = this.goal.phi;
    this.update(0);
  };

  OrbitCam.prototype.update = function (dt) {
    const k = 1 - Math.pow(0.0016, dt);
    this.target.lerp(this.goal.target, k);
    this.dist = U.lerp(this.dist, this.goal.dist, k);
    this.theta = U.lerp(this.theta, this.goal.theta, k);
    this.phi = U.lerp(this.phi, this.goal.phi, k);

    const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    const p = new THREE.Vector3(
      this.target.x + this.dist * sp * Math.sin(this.theta),
      this.target.y + this.dist * cp,
      this.target.z + this.dist * sp * Math.cos(this.theta)
    );
    p.y = Math.max(p.y, 0.35);
    this.camera.position.copy(p);
    this.camera.lookAt(this.target);
  };

  global.OrbitCam = OrbitCam;
})(window);
