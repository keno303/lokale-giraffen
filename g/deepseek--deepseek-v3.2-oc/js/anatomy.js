/* ==========================================================================
   anatomy.js — measurements for an adult reticulated giraffe (bull).
   All numbers are METRES in the animal's own frame:
        +X = forward (nose), +Y = up, -Z = the animal's LEFT side.
   Reference target: 3.3 m at the withers, ~5.0 m to the ossicone tips,
   ~2.6 m leg column, 1.85 m neck, 80 cm head.

   The standing skeleton is authored as joint *positions*; bone lengths are
   derived from them, so the rest pose is guaranteed reachable by the IK.
   ========================================================================== */
(function (GIR) {
  'use strict';
  var A = {};
  GIR.Anat = A;

  /* monotone-ish Catmull-Rom through scalar control points (for profiles) */
  A.spline1 = function (xs, ys, x) {
    var n = xs.length, i;
    if (!n || !ys.length) return 0;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[ys.length - 1];
    for (i = 1; i < n; i++) if (x <= xs[i]) break;
    var t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    var g = function (k) { var v = ys[GIR.clamp(k, 0, ys.length - 1)]; return v === undefined ? ys[ys.length - 1] : v; };
    var p0 = g(i - 2), p1 = g(i - 1), p2 = g(i), p3 = g(i + 1);
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };

  /* --------------------------------------------------------------- spine -- */
  /* dorsal/ventral silhouette of the barrel.  Note the withers are clearly
     higher than the croup — that front-heavy slope is a giraffe signature. */
  A.torsoStations = [
    /* x      top    bottom  halfW  sq    fade   fadeV  */
    [-2.02, 2.42, 2.22, 0.20, 2.4, 0.05, 0.10],
    [-1.86, 2.60, 2.16, 0.28, 2.6, 0.02, 0.18],
    [-1.55, 2.80, 2.08, 0.38, 2.8, 0.00, 0.30],
    [-1.20, 2.93, 2.02, 0.455, 2.9, 0.00, 0.42],
    [-0.80, 2.99, 1.94, 0.495, 2.9, 0.00, 0.50],
    [-0.30, 3.03, 1.885, 0.515, 2.8, 0.00, 0.55],
    [0.25, 3.09, 1.885, 0.510, 2.7, 0.00, 0.55],
    [0.72, 3.17, 1.93, 0.480, 2.6, 0.00, 0.52],
    [1.05, 3.30, 2.03, 0.435, 2.5, 0.00, 0.45],
    [1.30, 3.31, 2.16, 0.385, 2.4, 0.00, 0.38],
    [1.50, 3.24, 2.32, 0.335, 2.3, 0.00, 0.34],
    [1.66, 3.14, 2.46, 0.290, 2.2, 0.00, 0.30]
  ];

  /* ---------------------------------------------------------- neck (21) -- */
  /* Spine of the neck: steep at the base, easing forward at the atlas.
     `r` entries: [along 0..1, halfWidth, dorsal, ventral, roundness, fadeV] */
  A.neckSpine = [
    [0.00, [1.50, 3.22, 2.34]],   /* starts inside the barrel at the withers */
    [0.30, [1.72, 3.62, 2.86]],
    [0.62, [1.92, 4.10, 3.44]],
    [0.86, [2.06, 4.48, 3.86]],
    [1.00, [2.15, 4.78, 4.14]]    /* atlas / head pivot */
  ];
  A.neckProfile = [
    /* t,   w,    hi,   lo,   sq,  fadeV */
    [0.00, 0.335, 0.34, 0.40, 2.3, 0.30],
    [0.10, 0.315, 0.325, 0.40, 2.3, 0.38],
    [0.30, 0.278, 0.30, 0.375, 2.3, 0.46],
    [0.52, 0.245, 0.272, 0.345, 2.3, 0.52],
    [0.72, 0.212, 0.245, 0.310, 2.2, 0.55],
    [0.88, 0.188, 0.218, 0.280, 2.2, 0.50],
    [1.00, 0.172, 0.200, 0.258, 2.1, 0.42]
  ];

  /* ------------------------------------------------------------- head  -- */
  /* Built in head-local space: +X forward along the face, +Y up (skull
     dome), origin at the atlas joint.  Length atlas -> lips ~ 0.80 m. */
  A.headProfile = [
    /* x,     w,    hi,    lo,   sq,  fade */
    [-0.20, 0.176, 0.205, 0.250, 2.2, 0.18],
    [-0.06, 0.192, 0.235, 0.232, 2.3, 0.14],
    [0.06, 0.207, 0.252, 0.222, 2.4, 0.10],
    [0.20, 0.202, 0.246, 0.216, 2.5, 0.10],
    [0.32, 0.180, 0.215, 0.206, 2.5, 0.16],
    [0.42, 0.163, 0.182, 0.198, 2.6, 0.26],
    [0.52, 0.158, 0.160, 0.200, 2.7, 0.42],
    [0.60, 0.163, 0.150, 0.208, 2.8, 0.55]
  ];
  A.muzzleProfile = [
    /* x,     w,    hi,    lo */
    [0.545, 0.160, 0.163, 0.203],
    [0.640, 0.166, 0.150, 0.212],
    [0.715, 0.152, 0.132, 0.200],
    [0.765, 0.128, 0.108, 0.166],
    [0.790, 0.098, 0.082, 0.128]
  ];
  A.jawProfile = [
    [0.40, 0.132, 0.055, 0.132],
    [0.55, 0.142, 0.050, 0.150],
    [0.68, 0.136, 0.042, 0.146],
    [0.76, 0.108, 0.032, 0.112]
  ];

  /* ------------------------------------------------------ skeleton joints - */
  /* z is the *lateral* offset magnitude; left limbs use -z. */
  A.joints = {
    withers: [1.05, 3.30, 0],
    croup: [-1.20, 2.93, 0],
    neckRoot: [1.44, 3.16, 0],
    headRoot: [2.15, 4.78, 0],
    tailRoot: [-2.00, 2.44, 0],

    shoulder: [1.02, 2.46, 0.255],   /* glenoid */
    elbow: [0.78, 2.00, 0.275],
    carpus: [0.86, 1.16, 0.262],
    fetlockF: [0.93, 0.37, 0.250],
    toeF: [1.06, 0.0, 0.250],

    hip: [-1.20, 2.34, 0.245],       /* acetabulum */
    stifle: [-1.44, 1.72, 0.262],
    hock: [-1.72, 0.96, 0.248],
    fetlockH: [-1.55, 0.40, 0.240],
    toeH: [-1.44, 0.0, 0.240]
  };

  /* limb segment radii: [rStart, rEnd] with asymmetry for the tendon side */
  A.limbRadii = {
    fore: {
      upper: [0.150, 0.120],
      fore: [0.132, 0.098],
      cannon: [0.098, 0.077],
      foot: [0.085, 0.075]
    },
    hind: {
      upper: [0.192, 0.150],
      fore: [0.150, 0.104],
      cannon: [0.104, 0.080],
      foot: [0.088, 0.076]
    }
  };

  /* ------------------------------------------------------------- helpers -- */
  A.dist = function (a, b) {
    var dx = (a[0] || 0) - (b[0] || 0), dy = (a[1] || 0) - (b[1] || 0), dz = (a[2] || 0) - (b[2] || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  /* vertical drop between two joints: the effective bone length in the
     sagittal plane (what the planar IK works with) */
  A.drop = function (a, b) { return A.dist(a, b); };

  A.legLengths = function () {
    var j = A.joints;
    return {
      fore: [A.drop(j.shoulder, j.elbow), A.drop(j.elbow, j.carpus), A.drop(j.carpus, j.fetlockF), A.drop(j.fetlockF, j.toeF)],
      hind: [A.drop(j.hip, j.stifle), A.drop(j.stifle, j.hock), A.drop(j.hock, j.fetlockH), A.drop(j.fetlockH, j.toeH)]
    };
  };

  /* joint flexion limits in degrees: [min, max] where positive = the natural
     flexion direction of that joint (see gait.js for the sign convention) */
  A.limits = {
    fore: {
      /* protraction of the humerus: + = foot forward */
      root: [-42, 34],
      elbow: [-14, 62],      /* + = forearm swings caudal */
      carpus: [-8, 92],      /* + = cannon folds back ("knock-kneed" lift) */
      fetlock: [-16, 52]     /* + = heel lifts, toe stays down */
    },
    hind: {
      root: [-38, 40],
      knee: [-16, 78],       /* stifle */
      hock: [-10, 88],
      fetlock: [-16, 52]
    }
  };

  /* preferred mid-flexion the solver relaxes towards — keeps the limb from
     looking locked-out even when the target alone would not decide it */
  A.priors = {
    fore: { root: 2, elbow: 12, carpus: 16, fetlock: 6 },
    hind: { root: 4, knee: 16, hock: 20, fetlock: 6 }
  };

  /* contact x offsets of each hoof at mid-stance, relative to its own root.
     These are the *authored* skeleton's own values, so the stand pose is
     reproduced exactly (toe x minus joint x). */
  A.nominalContact = {
    fore: +(A.joints.toeF[0] - A.joints.shoulder[0]).toFixed(3),
    hind: +(A.joints.toeH[0] - A.joints.hip[0]).toFixed(3)
  };

})(window.GIR);
