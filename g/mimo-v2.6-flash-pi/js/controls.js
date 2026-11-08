'use strict';
/* Minimal orbit camera with damping, pan, zoom, auto-orbit and view presets. */
class OrbitCam {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 3, 0);
    this.goalTarget = new THREE.Vector3(0, 3, 0);
    this.theta = 1.05; this.goalTheta = 1.05;     // azimuth (from +Z towards +X)
    this.phi = 1.30; this.goalPhi = 1.30;          // polar (0 = straight up)
    this.radius = 14; this.goalRadius = 14;
    this.minR = 2.2; this.maxR = 70;
    this.minPhi = 0.25; this.maxPhi = 1.52;
    this.autoRotate = false;
    this.autoSpeed = 0.055;
    this.dragging = false;
    this.panning = false;
    this.followFn = null;
    this.followLerp = 6.0;
    this.colliders = [];
    this.ray = new THREE.Raycaster();
    this._dir = new THREE.Vector3();
    this.bind();
  }

  bind() {
    const dom = this.dom;
    let lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => {
      dom.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.panning = (e.button === 2 || e.shiftKey);
      lx = e.clientX; ly = e.clientY;
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (this.panning) {
        const s = this.goalRadius * 0.0016;
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
        this.goalTarget.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
      } else {
        this.goalTheta -= dx * 0.0055;
        this.goalPhi = U.clamp(this.goalPhi - dy * 0.0055, this.minPhi, this.maxPhi);
      }
    });
    const up = (e) => { this.dragging = false; this.panning = false; };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.goalRadius = U.clamp(this.goalRadius * Math.exp(e.deltaY * 0.0011), this.minR, this.maxR);
    }, { passive: false });
  }

  /* preset: dirFn gives the horizontal viewing direction (unit-ish) */
  setPreset(p, heading) {
    const h = heading || new THREE.Vector3(1, 0, 0);
    const side = new THREE.Vector3(-h.z, 0, h.x);
    const dir = new THREE.Vector3();
    let r = 12, phi = 1.32, targetY = 2.9, head = false;
    switch (p) {
      case 'side': dir.copy(side); r = 11.5; break;
      case 'front34': dir.copy(h).multiplyScalar(Math.cos(0.7)).addScaledVector(side, Math.sin(0.7)); r = 10.5; break;
      case 'rear': dir.copy(h).multiplyScalar(-1); r = 12; break;
      case 'head': dir.copy(h).multiplyScalar(0.55).addScaledVector(side, 0.84); r = 4.4; phi = 1.38; head = true; break;
      case 'wide': dir.copy(side).multiplyScalar(0.6).addScaledVector(h, -0.8); r = 26; phi = 1.36; break;
      case 'low': dir.copy(side); r = 9; phi = 1.50; targetY = 1.6; break;
      default: dir.copy(side);
    }
    this.goalTheta = Math.atan2(dir.x, dir.z);
    this.goalPhi = phi;
    this.goalRadius = r;
    this.preset = p;
    this.targetY = targetY;
    this.useHead = head;
  }

  update(dt) {
    if (this.followFn) {
      const t = this.followFn(!!this.useHead);
      if (t) this.goalTarget.copy(t);
    }
    if (this.autoRotate && !this.dragging) this.goalTheta += this.autoSpeed * dt;
    const k = 1 - Math.exp(-dt * 7.5);
    this.theta += (this.goalTheta - this.theta) * k;
    this.phi += (this.goalPhi - this.phi) * k;
    this.radius += (this.goalRadius - this.radius) * k;
    this.target.lerp(this.goalTarget, 1 - Math.exp(-dt * this.followLerp));

    const sp = Math.sin(this.phi), cp = Math.cos(this.phi);
    this.camera.position.set(
      this.target.x + this.radius * sp * Math.sin(this.theta),
      this.target.y + this.radius * cp,
      this.target.z + this.radius * sp * Math.cos(this.theta)
    );
    // don't let tree trunks / rocks get between the target and the lens
    if (this.colliders.length && !this.dragging) {
      this._dir.subVectors(this.camera.position, this.target);
      const dist = this._dir.length();
      this._dir.multiplyScalar(1 / dist);
      this.ray.set(this.target, this._dir);
      this.ray.far = dist;
      const hits = this.ray.intersectObjects(this.colliders, false);
      if (hits.length) {
        const d = Math.max(1.6, hits[0].distance - 0.7);
        this.camera.position.copy(this.target).addScaledVector(this._dir, d);
      }
    }
    this.camera.lookAt(this.target);
  }
}
