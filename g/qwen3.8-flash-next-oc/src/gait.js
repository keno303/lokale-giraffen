/* gait.js — four-beat lateral-sequence walk (how giraffes actually move)
 * with two-bone IK that locks stance hooves to the ground: no foot slide. */
(function (G) {
  'use strict';

  var DUTY_S = 0.37;      // swing fraction of the cycle
  // footfall order RH -> RF -> LH -> LF, front following its own hindlimb
  var PHASE = { RR: 0.00, FR: 0.12, RL: 0.50, FL: 0.62 };

  var tmpTarget = new THREE.Vector3();
  var tmpV = new THREE.Vector3();

  G.Gait = {
    create: function (rig) {
      return {
        t: 0, rig: rig,
        rand: G.rng(777),
        twitch: 2.2, twitchEar: 0, twitchT: 1,
        lookT: 4.0, lookHold: 0, lookYaw: 0
      };
    },

    // giraffe walk: slow deliberate cycle, ~2.5-3.5 s at walking speeds
    cycleTime: function (v) { return G.clamp(3.45 - 0.42 * v, 2.6, 4.2); },

    update: function (st, rig, v, dt) {
      var T = this.cycleTime(v);
      st.t += dt;
      var u = G.fract(st.t / T);                 // global cycle phase (RH = 0)
      var spd = G.clamp(v / 0.8, 0, 1.25);       // gait amplitude fades out at 0
      var S = v * T * (1 - DUTY_S);              // stride length
      var L = 0.04 + 0.10 * v;                   // hoof lift height
      var dims = rig.dims, l1 = dims.upper, l2 = dims.lower;

      /* ---------- body: bob, lateral roll, slight pitch ---------- */
      var bob = 0.030 * spd * Math.sin(4 * Math.PI * u + 0.9);
      var roll = 0.028 * spd * Math.sin(2 * Math.PI * u + 0.6);
      var pitchB = 0.012 * spd * Math.sin(4 * Math.PI * u + 2.2);
      rig.body.position.y = bob;
      rig.body.rotation.x = roll;
      rig.body.rotation.z = pitchB;
      rig.body.updateMatrixWorld(true);

      // breathing
      var br = Math.sin(2 * Math.PI * 0.28 * st.t);
      rig.torso.scale.set(1, 1 + 0.008 * br, 1 + 0.013 * br);

      /* ---------- legs ---------- */
      for (var name in PHASE) {
        var leg = rig.legs[name];
        var front = leg.front;
        var lu = G.fract(st.t / T - PHASE[name]);

        var ax, liftY, pitchOff;
        if (lu < DUTY_S) {                        // ---- swing: reach forward ----
          var q = lu / DUTY_S;
          ax = -S / 2 + S * G.smoothstep2(q);
          liftY = L * Math.sin(Math.PI * q) * spd;
          pitchOff = (-0.18 * Math.sin(Math.PI * q)
                    - 0.12 * (1 - G.smoothstep(q / 0.3))) * spd;
        } else {                                  // ---- stance: hoof parked ----
          ax = S / 2 - v * T * (lu - DUTY_S);
          liftY = 0;
          pitchOff = -0.12 * spd * G.smoothstep((lu - 0.88) / 0.12); // toe-off
        }

        // ground point under the moving body, in hip-local space (exact)
        var hip = leg.hip;
        hip.getWorldPosition(tmpV);
        tmpTarget.set(tmpV.x + ax, liftY, tmpV.z);
        hip.worldToLocal(tmpTarget);
        var fx = tmpTarget.x, fy = tmpTarget.y;

        // ---- two-bone IK in the sagittal plane ----
        var d = Math.min(Math.max(Math.hypot(fx, fy), l1 - l2 + 0.2), l1 + l2 - 0.02);
        var a1 = Math.atan2(fx, -fy);
        var cph = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
        var phi = Math.acos(G.clamp(cph, -1, 1));
        var bend = front ? 1 : -1;                // carpus fwd, hock aft
        var th1 = a1 + bend * phi;
        var kx = l1 * Math.sin(th1), ky = -l1 * Math.cos(th1);
        var th2 = Math.atan2(fx - kx, -(fy - ky));
        hip.rotation.z = th1;
        leg.knee.rotation.z = th2 - th1;
        leg.ankle.rotation.z = -th2 + pitchOff;
      }

      /* ---------- neck, head, ears ---------- */
      var neckSwing = 0.09 * spd * Math.sin(4 * Math.PI * u + 0.6)
                    + 0.02 * Math.sin(2 * Math.PI * 0.11 * st.t + 1.0);
      rig.neckPivot.rotation.z = 0.14 + neckSwing;
      rig.headPivot.rotation.z = -0.18 - 0.62 * neckSwing
                               + 0.02 * spd * Math.sin(4 * Math.PI * u + 1.8);

      // occasional look-around, plus a small step-rhythm head sway
      st.lookT -= dt;
      if (st.lookT <= 0 && st.lookHold <= 0) {
        st.lookHold = 1.2 + st.rand() * 1.6;
        st.lookT = 5 + st.rand() * 6;
        st.lookYaw = (st.rand() - 0.5) * 0.5;
      }
      if (st.lookHold > 0) st.lookHold -= dt;
      var wantYaw = (st.lookHold > 0 ? st.lookYaw : 0)
                  + 0.05 * spd * Math.sin(2 * Math.PI * u + 2.2);
      rig.headPivot.rotation.y += (wantYaw - rig.headPivot.rotation.y) * Math.min(1, 3 * dt);

      // ear twitches
      st.twitch -= dt;
      if (st.twitch <= 0) {
        st.twitch = 1.6 + st.rand() * 3.2;
        st.twitchEar = st.rand() < 0.5 ? 0 : 1;
        st.twitchT = 0;
      }
      var twitchAmp = 0;
      if (st.twitchT < 0.35) {
        st.twitchT += dt;
        twitchAmp = 0.4 * Math.sin(st.twitchT * 38) * (1 - st.twitchT / 0.35);
      }
      for (var e = 0; e < 2; e++) {
        var flap = 0.09 * Math.sin(2 * Math.PI * (0.47 + 0.13 * e) * st.t + 1.3 * e);
        rig.ears[e].rotation.x = flap + (e === st.twitchEar ? twitchAmp : 0);
      }

      /* ---------- tail ---------- */
      var swayL = Math.sin(2 * Math.PI * 0.31 * st.t + 0.8);          // slow swish
      var stepL = Math.sin(2 * Math.PI * u + 1.2) * spd;              // step sway
      rig.tailPivot.rotation.x = 0.10 * swayL + 0.06 * stepL;
      rig.tailPivot.rotation.z = -0.30 + 0.09 * spd * Math.sin(4 * Math.PI * u + 2.5);
      rig.tail2Pivot.rotation.x = 0.30 * Math.sin(2 * Math.PI * 0.31 * st.t - 0.5)
                                + 0.12 * stepL;
      rig.tail2Pivot.rotation.z = -0.35;

      return u;
    },

    // world position of a hoof, for dust emission (main.js)
    hoofPos: function (rig, name) {
      return rig.legs[name].ankle.localToWorld(new THREE.Vector3(0.155, -0.30, 0));
    }
  };
})(window.G);
