// Procedural walking gait for the giraffe rig.
//
// Giraffes walk in a "lateral sequence" gait (same order as other
// ungulates): LH, LF, RH, RF.  Each foot follows a duty-factor cycle
// (stance: foot planted, moving backwards relative to the body;
//  swing: foot lifted, moving forward).  The legs are two-bone chains
// (femur + tibia with the ankle/hoof hanging below), solved analytically
// with a slight backward knee bend for the front legs and a forward
// ("hocked") bend for the hind legs, like a real giraffe.
(function () {
	'use strict';

	const TAU = Math.PI * 2;

	// phase offsets of the lateral-sequence walk (fraction of the cycle)
	const GAIT = {
		backL: 0.00,
		frontL: 0.25,
		backR: 0.50,
		frontR: 0.75
	};

	// two-bone IK in the sagittal (x/y) plane.
	// origin: hip position in body space (Vector3-like {x,y,z})
	// targetX/targetY: desired foot position (body space)
	// sign: -1 = knee bends backwards (front legs), +1 = knee bends forwards (hind legs)
	function legIK( hipY, targetX, targetY, L1, L2, sign, out ) {
		const dx = targetX, dy = targetY - hipY;
		let dist = Math.sqrt( dx * dx + dy * dy );
		const maxReach = ( L1 + L2 ) * 0.995;
		if ( dist > maxReach ) dist = maxReach;
		if ( dist < Math.abs( L1 - L2 ) + 1e-4 ) dist = Math.abs( L1 - L2 ) + 1e-4;

		// angle of the hip->foot line, measured from straight down
		const baseAngle = Math.atan2( dx, -dy );
		const cosA = ( L1 * L1 + dist * dist - L2 * L2 ) / ( 2 * L1 * dist );
		const a = Math.acos( Math.max( -1, Math.min( 1, cosA ) ) );
		const thighAngle = baseAngle + sign * a;   // femur
		const cosB = ( L1 * L1 + L2 * L2 - dist * dist ) / ( 2 * L1 * L2 );
		const b = Math.acos( Math.max( -1, Math.min( 1, cosB ) ) );
		const shinAngle = thighAngle - sign * ( Math.PI - b ); // tibia relative

		out.thigh = thighAngle;    // rotation about z (positive = swing forward)
		out.shin = shinAngle - thighAngle;
		out.ankle = -( shinAngle ) - 0.10;   // keep the hoof roughly parallel to the ground
		return out;
	}

	function smoothstep( x ) {
		x = Math.max( 0, Math.min( 1, x ) );
		return x * x * ( 3 - 2 * x );
	}

	function createGait( rig, config ) {
		const P = rig.props;
		const cfg = Object.assign( {
			duty: 0.62,           // fraction of the cycle the foot is on the ground
			stride: 1.42,         // metres travelled per full cycle
			standHeight: 2.62,    // shoulder height
			hoofBaseY: 0.33
		}, config || {} );

		const L1 = P.upperLeg, L2 = P.lowerLeg;
		const legList = [
			{ key: 'frontL', leg: rig.legs.frontL, phase: GAIT.frontL, sign: -1, z: 0.235, x: 0.80, front: true },
			{ key: 'frontR', leg: rig.legs.frontR, phase: GAIT.frontR, sign: -1, z: -0.235, x: 0.80, front: true },
			{ key: 'backL', leg: rig.legs.backL, phase: GAIT.backL, sign: 1, z: 0.225, x: -0.92, front: false },
			{ key: 'backR', leg: rig.legs.backR, phase: GAIT.backR, sign: 1, z: -0.225, x: -0.92, front: false }
		];

		const ik = { thigh: 0, shin: 0, ankle: 0 };
		let gaitPhase = 0;

		// per-foot ground height memory (for a little foot "roll")
		const footY = { frontL: 0, frontR: 0, backL: 0, backR: 0 };

		function update( dt, speed, time ) {
			if ( speed < 0.02 ) speed = 0.02;
			const cycleFreq = speed / cfg.stride;     // cycles per second
			gaitPhase = ( gaitPhase + dt * cycleFreq ) % 1;

			for ( const L of legList ) {
				const raw = ( gaitPhase + L.phase ) % 1;

				// foot target in body space (x: fore/aft, y: height)
				let tx, ty;
				const A = cfg.stride * 0.5;
				if ( raw < cfg.duty ) {
					// stance: planted on the ground, body moves forward over it
					const u = raw / cfg.duty;
					tx = A * ( 1 - 2 * smoothstep( u * 0.5 + 0.0 ) );
					ty = cfg.hoofBaseY;
					// tiny weight-bearing dip
					ty += 0.012 * Math.sin( u * Math.PI );
				} else {
					// swing: foot lifts and swings forward
					const u = ( raw - cfg.duty ) / ( 1 - cfg.duty );
					tx = A * ( -1 + 2 * smoothstep( u ) );
					const lift = Math.sin( Math.PI * u );
					ty = cfg.hoofBaseY + 0.30 * lift + 0.05 * lift * lift;
				}
				footY[ L.key ] = ty;

				// IK: hip is at (hipX, hipY); target is (hipX + tx, ty).
				// tx is scaled down so the foot stays under the body (the giraffe
				// walks in place; the ground scrolls beneath it via the camera).
				legIK( L.leg.hip.position.y, tx * 0.35, ty, L1, L2, L.sign, ik );

				// gentle lateral stabilisation
				const sway = 0.035 * Math.sin( gaitPhase * TAU + L.phase * TAU );

				L.leg.hip.rotation.z = ik.thigh;
				L.leg.hip.rotation.x = sway * ( L.front ? 1 : -1 );
				L.leg.knee.rotation.z = ik.shin;
				L.leg.ankle.rotation.z = ik.ankle;

				// fetlock/hoof micro-roll through the step
				const roll = raw < cfg.duty
					? ( raw / cfg.duty )
					: ( 1 - ( raw - cfg.duty ) / ( 1 - cfg.duty ) );
				L.leg.hoof.rotation.z = ( roll - 0.5 ) * 0.42;
			}

			// ---- body motion -----------------------------------------------
			// vertical: two bounces per stride (front + back contacts)
			const bob = 0.026 + speed * 0.010;
			const y = bob * ( 0.5 - 0.5 * Math.cos( 2 * TAU * gaitPhase * 2 ) )
				+ 0.018 * Math.sin( TAU * gaitPhase * 2 + 1.2 );
			rig.torso.position.y = cfg.standHeight + y;

			// pitch: rocking of the torso, synchronized with the leg phases
			rig.torso.rotation.z = -0.010 + 0.013 * Math.sin( TAU * gaitPhase * 2 + 0.6 );
			rig.torso.rotation.x = 0.010 * Math.sin( TAU * gaitPhase + 0.3 );

			// neck: counter-sway + gentle pumping
			rig.neck.rotation.z = -0.36
				+ 0.028 * Math.sin( TAU * gaitPhase * 2 + 1.9 )
				+ 0.014 * Math.sin( TAU * gaitPhase );
			rig.neck.rotation.x = 0.020 * Math.sin( TAU * gaitPhase * 2 + 0.4 );

			// head: dampened counter-rotation (keeps the head steady like a gimbal)
			rig.headAnchor.rotation.z = -0.045 * Math.sin( TAU * gaitPhase * 2 + 1.9 )
				+ 0.02 * Math.sin( TAU * gaitPhase + 0.7 );
			rig.headAnchor.rotation.x = -0.028 * Math.sin( TAU * gaitPhase * 2 + 0.4 );

			// tail: sways with the body rhythm
			rig.tailAnchor.rotation.z = -0.34 + 0.13 * Math.sin( TAU * gaitPhase + 1.1 );
			rig.tailAnchor.rotation.x = 0.17 * Math.sin( TAU * gaitPhase * 2 + 0.8 );
			rig.tail.rotation.x = 0.10 * Math.sin( TAU * gaitPhase + 2.2 );
			rig.tail.rotation.z = 0.20 * Math.sin( TAU * gaitPhase * 1.5 + 1.0 );
		}

		function setPhase( p ) { gaitPhase = p % 1; }
		function getPhase() { return gaitPhase; }

		return { update: update, setPhase: setPhase, getPhase: getPhase, config: cfg };
	}

	window.GIRAFFE_GAIT = {
		createGait: createGait,
		legIK: legIK,
		GAIT: GAIT
	};
})();
