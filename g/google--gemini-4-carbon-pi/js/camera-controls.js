(function () {
  'use strict';

  const GS = (window.GiraffeSim = window.GiraffeSim || {});
  const M = GS.Math;

  const CAMERA_PRESETS = {
    hero: {
      label: 'Hero 3/4',
      azimuth: 0.98,       // Sunlit front-left 3/4 wildlife documentary framing
      polar: 1.49,
      distance: 9.8,       // Full 5.05m giraffe + foreground sandy hoofprints + headroom!
      targetOffset: [0, 2.52, 0.35],
      fov: 38
    },
    side: {
      label: 'Side Gait',
      azimuth: 1.5708,     // Pure 90-deg lateral biomechanical gait study
      polar: 1.52,
      distance: 11.4,
      targetOffset: [0, 2.52, 0.32],
      fov: 33
    },
    front: {
      label: 'Front Walk',
      azimuth: 0.22,
      polar: 1.50,
      distance: 10.6,
      targetOffset: [0, 2.54, 0.35],
      fov: 36
    },
    low: {
      label: 'Majestic Low',
      azimuth: 1.06,
      polar: 1.66,         // Dramatic low savannah grass perspective looking up at 5m silhouette
      distance: 9.6,
      targetOffset: [0, 2.58, 0.35],
      fov: 40
    },
    head: {
      label: 'Head Macro',
      azimuth: 0.98,
      polar: 1.48,
      distance: 1.48,
      targetOffset: [0, 4.58, 1.70],
      fov: 34
    },
    hooves: {
      label: 'Hooves & IK',
      azimuth: 1.24,
      polar: 1.45,
      distance: 2.85,
      targetOffset: [0, 0.68, 0.05],
      fov: 36
    },
    wide: {
      label: 'Savannah Wide',
      azimuth: 1.16,
      polar: 1.46,
      distance: 16.5,
      targetOffset: [0, 2.75, 1.10],
      fov: 40
    }
  };

  class TrackingOrbitCamera {
    constructor(camera, domElement, groundHeightFn) {
      this.camera = camera;
      this.domElement = domElement;
      this.groundHeightFn = groundHeightFn || function () { return 0; };

      const p = CAMERA_PRESETS.hero;
      this.azimuth = p.azimuth;
      this.polar = p.polar;
      this.distance = p.distance;
      this.fov = p.fov;

      this.targetAzimuth = p.azimuth;
      this.targetPolar = p.polar;
      this.targetDistance = p.distance;
      this.targetFov = p.fov;

      this.localOffset = new THREE.Vector3().fromArray(p.targetOffset);
      this.targetLocalOffset = new THREE.Vector3().fromArray(p.targetOffset);

      this.smoothedAnchor = new THREE.Vector3(0, 0, 0);
      this.smoothedYaw = 0;
      this.initialized = false;
      this.autoTurntable = false;
      this.activePreset = 'hero';

      this._lookTarget = new THREE.Vector3();
      this._pointerDown = false;
      this._panMode = false;
      this._lastX = 0;
      this._lastY = 0;
      this._pinchDist = 0;

      this._bindEvents();
    }

    setPreset(key, instant) {
      const p = CAMERA_PRESETS[key];
      if (!p) return;
      this.activePreset = key;
      // Shortest angular path for azimuth transition
      const diff = ((p.azimuth - this.targetAzimuth + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.targetAzimuth = this.targetAzimuth + diff;
      this.targetPolar = p.polar;
      this.targetDistance = p.distance;
      this.targetFov = p.fov;
      this.targetLocalOffset.fromArray(p.targetOffset);

      if (instant) {
        this.azimuth = this.targetAzimuth;
        this.polar = this.targetPolar;
        this.distance = this.targetDistance;
        this.fov = this.targetFov;
        this.localOffset.copy(this.targetLocalOffset);
        this.camera.fov = this.fov;
        this.camera.updateProjectionMatrix();
      }
    }

    _bindEvents() {
      const el = this.domElement;

      el.addEventListener('contextmenu', (e) => e.preventDefault());

      el.addEventListener('pointerdown', (e) => {
        this._pointerDown = true;
        this._panMode = e.button === 2 || e.button === 1 || e.shiftKey;
        this._lastX = e.clientX;
        this._lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
      });

      el.addEventListener('pointermove', (e) => {
        if (!this._pointerDown) return;
        const dx = e.clientX - this._lastX;
        const dy = e.clientY - this._lastY;
        this._lastX = e.clientX;
        this._lastY = e.clientY;

        if (this._panMode || e.shiftKey) {
          const panScale = this.distance * 0.0014;
          this.targetLocalOffset.y = M.clamp(this.targetLocalOffset.y + dy * panScale, 0.2, 5.2);
          const cosA = Math.cos(this.azimuth);
          const sinA = Math.sin(this.azimuth);
          this.targetLocalOffset.z = M.clamp(this.targetLocalOffset.z + dx * sinA * panScale, -3.5, 3.5);
          this.targetLocalOffset.x = M.clamp(this.targetLocalOffset.x - dx * cosA * panScale, -2.5, 2.5);
        } else {
          this.targetAzimuth -= dx * 0.0065;
          this.targetPolar = M.clamp(this.targetPolar - dy * 0.0055, 0.22, 1.82);
        }
      });

      const endPointer = () => {
        this._pointerDown = false;
      };
      el.addEventListener('pointerup', endPointer);
      el.addEventListener('pointercancel', endPointer);

      el.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          const zoomFactor = Math.exp(e.deltaY * 0.0011);
          this.targetDistance = M.clamp(this.targetDistance * zoomFactor, 0.65, 26.0);
        },
        { passive: false }
      );

      el.addEventListener('dblclick', () => {
        this.setPreset(this.activePreset, false);
      });

      el.addEventListener(
        'touchstart',
        (e) => {
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            this._pinchDist = Math.hypot(dx, dy);
          }
        },
        { passive: true }
      );

      el.addEventListener(
        'touchmove',
        (e) => {
          if (e.touches.length === 2 && this._pinchDist > 0) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const d = Math.hypot(dx, dy);
            const scale = this._pinchDist / Math.max(10, d);
            this.targetDistance = M.clamp(this.targetDistance * scale, 0.65, 26.0);
            this._pinchDist = d;
          }
        },
        { passive: true }
      );
    }

    update(dt, giraffeWorldPos, giraffeYaw) {
      if (!this.initialized) {
        this.smoothedAnchor.copy(giraffeWorldPos);
        this.smoothedYaw = giraffeYaw;
        this.initialized = true;
      } else {
        // Track Z tightly so walking giraffe never drifts, damp X/Y & Yaw smoothly so stride sway stays cinematic!
        this.smoothedAnchor.x = M.damp(this.smoothedAnchor.x, giraffeWorldPos.x, 5.5, dt);
        this.smoothedAnchor.y = M.damp(this.smoothedAnchor.y, giraffeWorldPos.y, 6.5, dt);
        this.smoothedAnchor.z = M.damp(this.smoothedAnchor.z, giraffeWorldPos.z, 18.0, dt);
        this.smoothedYaw = M.damp(this.smoothedYaw, giraffeYaw, 4.0, dt);
      }

      if (this.autoTurntable && !this._pointerDown) {
        this.targetAzimuth += dt * 0.18;
      }

      this.azimuth = M.damp(this.azimuth, this.targetAzimuth, 8.5, dt);
      this.polar = M.damp(this.polar, this.targetPolar, 8.5, dt);
      this.distance = M.damp(this.distance, this.targetDistance, 8.5, dt);
      this.localOffset.x = M.damp(this.localOffset.x, this.targetLocalOffset.x, 7.5, dt);
      this.localOffset.y = M.damp(this.localOffset.y, this.targetLocalOffset.y, 7.5, dt);
      this.localOffset.z = M.damp(this.localOffset.z, this.targetLocalOffset.z, 7.5, dt);

      if (Math.abs(this.fov - this.targetFov) > 0.01) {
        this.fov = M.damp(this.fov, this.targetFov, 7.5, dt);
        this.camera.fov = this.fov;
        this.camera.updateProjectionMatrix();
      }

      const cosY = Math.cos(this.smoothedYaw);
      const sinY = Math.sin(this.smoothedYaw);

      this._lookTarget.set(
        this.smoothedAnchor.x + this.localOffset.x * cosY + this.localOffset.z * sinY,
        this.smoothedAnchor.y + this.localOffset.y,
        this.smoothedAnchor.z - this.localOffset.x * sinY + this.localOffset.z * cosY
      );

      const totalAz = this.smoothedYaw + this.azimuth;
      const sinP = Math.sin(this.polar);
      const cosP = Math.cos(this.polar);

      let camX = this._lookTarget.x + this.distance * sinP * Math.sin(totalAz);
      let camY = this._lookTarget.y + this.distance * cosP;
      let camZ = this._lookTarget.z + this.distance * sinP * Math.cos(totalAz);

      const minGroundY = this.groundHeightFn(camX, camZ) + 0.18;
      if (camY < minGroundY) camY = minGroundY;

      this.camera.position.set(camX, camY, camZ);
      this.camera.lookAt(this._lookTarget);
    }
  }

  GS.Camera = {
    CAMERA_PRESETS,
    TrackingOrbitCamera
  };
})();
