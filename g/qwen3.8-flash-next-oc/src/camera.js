/* camera.js — dependency-free orbit controls (mouse + touch), damped. */
(function (G) {
  'use strict';

  function MiniOrbit(camera, dom, target) {
    var self = this;
    this.camera = camera;
    this.target = target.clone();
    this.theta = 1.42;                 // azimuth
    this.phi = 1.32;                   // polar (from +Y)
    this.radius = 9.5;
    var dTheta = this.theta, dPhi = this.phi, dRadius = this.radius;
    var tgtX = this.target.x, tgtY = this.target.y;
    var MIN_PHI = 0.18, MAX_PHI = 1.55, MIN_R = 3.5, MAX_R = 40;
    var dragging = false, lastX = 0, lastY = 0, pinch = 0;

    function down(x, y) { dragging = true; lastX = x; lastY = y; }
    function move(x, y) {
      if (!dragging) return;
      dTheta -= (x - lastX) * 0.006;
      dPhi = G.clamp(dPhi - (y - lastY) * 0.005, MIN_PHI, MAX_PHI);
      lastX = x; lastY = y;
    }
    function up() { dragging = false; }

    dom.addEventListener('mousedown', function (e) { down(e.clientX, e.clientY); });
    window.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
    window.addEventListener('mouseup', up);
    dom.addEventListener('wheel', function (e) {
      e.preventDefault();
      dRadius = G.clamp(dRadius * Math.exp(e.deltaY * 0.001), MIN_R, MAX_R);
    }, { passive: false });
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    dom.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) down(e.touches[0].clientX, e.touches[0].clientY);
      else if (e.touches.length === 2) {
        pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    dom.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY);
      else if (e.touches.length === 2) {
        var p = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
        dRadius = G.clamp(dRadius * (pinch / p), MIN_R, MAX_R);
        pinch = p;
      }
    }, { passive: false });
    dom.addEventListener('touchend', up);

    this.presets = [
      { theta: 1.42, phi: 1.32, radius: 9.5, tx: 0, ty: 2.35 },      // side
      { theta: 0.55, phi: 1.28, radius: 8.5, tx: 0.4, ty: 2.6 },     // front three-quarter
      { theta: 1.55, phi: 1.52, radius: 12.0, tx: 0, ty: 2.2 },      // low & long
      { theta: 2.55, phi: 1.05, radius: 11.0, tx: 0, ty: 2.6 },      // high rear
      { theta: 1.25, phi: 1.38, radius: 4.2, tx: 2.35, ty: 3.7 }     // head close-up
    ];
    this.preset = 0;
    function applyPreset(p, snap) {
      dTheta = p.theta; dPhi = p.phi; dRadius = p.radius;
      tgtX = p.tx; tgtY = p.ty;
      if (snap) { self.theta = dTheta; self.phi = dPhi; self.radius = dRadius;
                  self.target.x = tgtX; self.target.y = tgtY; }
    }
    this.nextPreset = function () {
      self.preset = (self.preset + 1) % self.presets.length;
      applyPreset(self.presets[self.preset], false);
    };
    this.snap = function (i) {
      self.preset = ((i % self.presets.length) + self.presets.length) % self.presets.length;
      applyPreset(self.presets[self.preset], true);
    };

    this.update = function (dt) {
      var k = 1 - Math.exp(-8 * dt);
      this.theta += (dTheta - this.theta) * k;
      this.phi += (dPhi - this.phi) * k;
      this.radius += (dRadius - this.radius) * k;
      this.target.x += (tgtX - this.target.x) * k;
      this.target.y += (tgtY - this.target.y) * k;
      var s = Math.sin(this.phi);
      this.camera.position.set(
        this.target.x + this.radius * s * Math.cos(this.theta),
        this.target.y + this.radius * Math.cos(this.phi),
        this.target.z + this.radius * s * Math.sin(this.theta)
      );
      this.camera.lookAt(this.target);
    };
  }

  G.MiniOrbit = MiniOrbit;
})(window.G);
