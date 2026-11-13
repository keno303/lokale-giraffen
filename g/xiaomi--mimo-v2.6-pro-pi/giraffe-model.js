// Giraffe anatomy: a hierarchical rig of named joints (Object3D groups) with
// procedural meshes attached.  All geometry is generated with a "rounded
// convex hull of spheres" technique: sample ellipsoids/spheres, compute their
// convex hull and push the vertices outward along the radial direction by
// ~1.5-2%, which yields soft, organic, smoothly rounded bodies instead of
// faceted hulls.
//
// Units are metres.  An adult giraffe is ~5.2 m tall at the ossicones and
// stands ~2.6 m at the shoulder; the rig is built at exactly those
// proportions, with the world origin between the front feet.
(function () {
	'use strict';

	const V3 = THREE.Vector3;

	// ------------------------------------------------------------------
	// geometry helpers
	// ------------------------------------------------------------------

	function roundedHullGeometry( points, inflate, uvScale ) {
		const geo = new THREE.ConvexGeometry( points );
		const pos = geo.attributes.position;
		const v = new V3();
		const centroid = new V3();
		for ( let i = 0; i < pos.count; i ++ ) centroid.add( v.fromBufferAttribute( pos, i ) );
		centroid.divideScalar( pos.count );
		for ( let i = 0; i < pos.count; i ++ ) {
			v.fromBufferAttribute( pos, i );
			const d = v.clone().sub( centroid );
			v.addScaledVector( d, inflate );
			pos.setXYZ( i, v.x, v.y, v.z );
		}
		pos.needsUpdate = true;
		geo.computeVertexNormals();

		// box-projection UVs: project each vertex onto the plane perpendicular
		// to its dominant normal axis, so textures wrap the body without the
		// degenerate UVs ConvexGeometry ships with.
		const s = uvScale !== undefined ? uvScale : 0.28;
		const nrm = geo.attributes.normal;
		const uvs = new Float32Array( pos.count * 2 );
		for ( let i = 0; i < pos.count; i ++ ) {
			const x = pos.getX( i ), y = pos.getY( i ), z = pos.getZ( i );
			const nx = Math.abs( nrm.getX( i ) ), ny = Math.abs( nrm.getY( i ) ), nz = Math.abs( nrm.getZ( i ) );
			let u, w;
			if ( nx >= ny && nx >= nz ) { u = z; w = y; }
			else if ( ny >= nz ) { u = x; w = z; }
			else { u = x; w = y; }
			uvs[ i * 2 ] = u * s;
			uvs[ i * 2 + 1 ] = w * s;
		}
		geo.setAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );
		return geo;
	}

	// A "blob": union of overlapping ellipsoids, sampled to a point cloud and
	// then skinned by a rounded convex hull.  Everything in local coordinates.
	function blobGeometry( ellipsoids, opts ) {
		opts = opts || {};
		const inflate = opts.inflate !== undefined ? opts.inflate : 0.022;
		const density = opts.density !== undefined ? opts.density : 26;
		const pts = [];
		const tmp = new V3();
		for ( const e of ellipsoids ) {
			const c = e.center, r = e.radius;
			const n = Math.max( 26, Math.round( density * ( 0.7 + ( r.x + r.y + r.z ) ) ) );
			for ( let i = 0; i < n; i ++ ) {
				// uniform-ish point on unit sphere (fibonacci)
				const y = 1 - ( i / ( n - 1 ) ) * 2;
				const rad = Math.sqrt( Math.max( 0, 1 - y * y ) );
				const theta = Math.PI * ( 1 + Math.sqrt( 5 ) ) * i;
				tmp.set( Math.cos( theta ) * rad * r.x, y * r.y, Math.sin( theta ) * rad * r.z );
				pts.push( new V3( c.x + tmp.x, c.y + tmp.y, c.z + tmp.z ) );
			}
		}
		return roundedHullGeometry( pts, inflate, opts.uvScale );
	}

	function mesh( geo, mat, castShadow ) {
		const m = new THREE.Mesh( geo, mat );
		m.castShadow = castShadow !== false;
		m.receiveShadow = true;
		return m;
	}

	// tapered tube along a polyline of {p: Vector3, r: radius}
	function taperedTubeGeometry( spine, radialSegs, capEnds ) {
		radialSegs = radialSegs || 10;
		const n = spine.length;
		const positions = [];
		const normals = [];
		const uvs = [];
		const indices = [];

		const tangents = [];
		for ( let i = 0; i < n; i ++ ) {
			const a = spine[ Math.max( 0, i - 1 ) ].p, b = spine[ Math.min( n - 1, i + 1 ) ].p;
			tangents.push( new V3().subVectors( b, a ).normalize() );
		}
		// parallel transport frames
		let normal = new V3( 0, 0, 1 );
		if ( Math.abs( tangents[ 0 ].dot( normal ) ) > 0.9 ) normal.set( 1, 0, 0 );
		normal.projectOnPlane( tangents[ 0 ] ).normalize();
		const binormal = new V3();

		for ( let i = 0; i < n; i ++ ) {
			const t = tangents[ i ];
			normal.projectOnPlane( t ).normalize();
			binormal.crossVectors( t, normal ).normalize();
			const p = spine[ i ].p, r = spine[ i ].r;
			for ( let j = 0; j <= radialSegs; j ++ ) {
				const a = ( j / radialSegs ) * Math.PI * 2;
				const nx = Math.cos( a ), ny = Math.sin( a );
				const px = p.x + ( normal.x * nx + binormal.x * ny ) * r;
				const py = p.y + ( normal.y * nx + binormal.y * ny ) * r;
				const pz = p.z + ( normal.z * nx + binormal.z * ny ) * r;
				positions.push( px, py, pz );
				const nx2 = normal.x * nx + binormal.x * ny;
				const ny2 = normal.y * nx + binormal.y * ny;
				const nz2 = normal.z * nx + binormal.z * ny;
				normals.push( nx2, ny2, nz2 );
				uvs.push( j / radialSegs, i / ( n - 1 ) );
			}
		}
		for ( let i = 0; i < n - 1; i ++ ) {
			for ( let j = 0; j < radialSegs; j ++ ) {
				const a = i * ( radialSegs + 1 ) + j;
				const b = a + radialSegs + 1;
				indices.push( a, b, a + 1, b, b + 1, a + 1 );
			}
		}

		const geo = new THREE.BufferGeometry();
		geo.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
		geo.setAttribute( 'normal', new THREE.Float32BufferAttribute( normals, 3 ) );
		geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
		geo.setIndex( indices );
		return geo;
	}

	// ------------------------------------------------------------------
	// proportions (metres)
	// ------------------------------------------------------------------
	const P = {
		groundY: 0,
		shoulderY: 2.62,
		hipY: 2.66,
		bodyLen: 2.05,          // shoulder -> hip along x
		chestDepth: 0.78,
		chestWidth: 0.62,
		neckBaseY: 2.95,
		neckBaseX: 0.92,
		neckLen: 2.05,
		neckLean: -0.36,        // radians, forward lean from vertical (negative = forward)
		headLen: 0.72,
		upperLeg: 1.32,
		lowerLeg: 1.28
	};

	// ------------------------------------------------------------------
	// leg builder: returns { group, joints }
	// ------------------------------------------------------------------
	function buildLeg( mats, cfg ) {
		// cfg: {front: bool, x, z, radiusScale, phaseOffset}
		const leg = new THREE.Group();
		leg.position.set( cfg.x, 0, cfg.z );

		const rs = cfg.radiusScale || 1;
		const upperLen = P.upperLeg, lowerLen = P.lowerLeg;

		const hip = new THREE.Group();
		hip.position.y = cfg.hipY;
		leg.add( hip );

		// upper leg (femur + heavy shoulder/haunch muscle)
		const upperGeo = blobGeometry( [
			{ center: new V3( 0, 0.02, 0 ), radius: new V3( 0.255 * rs, 0.34 * rs, 0.265 * rs ) },
			{ center: new V3( 0, -0.16, 0 ), radius: new V3( 0.215 * rs, 0.30 * rs, 0.225 * rs ) },
			{ center: new V3( 0.015, -0.48, 0.01 ), radius: new V3( 0.158 * rs, 0.32 * rs, 0.168 * rs ) },
			{ center: new V3( 0, -0.82, 0 ), radius: new V3( 0.118, 0.30, 0.128 ) },
			{ center: new V3( 0, -1.08, 0 ), radius: new V3( 0.102, 0.22, 0.112 ) }
		], { inflate: 0.018, density: 130, uvScale: 1.15 } );
		hip.add( mesh( upperGeo, mats.body ) );

		const knee = new THREE.Group();
		knee.position.y = -upperLen;
		hip.add( knee );

		// lower leg (tibia): slim, slightly angled
		const lowerGeo = blobGeometry( [
			{ center: new V3( 0, 0.02, 0 ), radius: new V3( 0.108 * rs, 0.14, 0.114 * rs ) },
			{ center: new V3( 0, -0.32, 0.012 ), radius: new V3( 0.080, 0.30, 0.085 ) },
			{ center: new V3( 0.005, -0.72, 0.02 ), radius: new V3( 0.066, 0.30, 0.070 ) },
			{ center: new V3( 0.01, -1.04, 0.028 ), radius: new V3( 0.058, 0.22, 0.062 ) }
		], { inflate: 0.02, density: 120, uvScale: 1.3 } );
		knee.add( mesh( lowerGeo, mats.leg ) );

		const ankle = new THREE.Group();
		ankle.position.set( 0, -lowerLen, 0.02 );
		knee.add( ankle );

		// fetlock joint + pastern
		const fetGeo = blobGeometry( [
			{ center: new V3( 0, 0.02, 0 ), radius: new V3( 0.075, 0.085, 0.078 ) },
			{ center: new V3( 0.005, -0.13, 0.015 ), radius: new V3( 0.062, 0.10, 0.062 ) }
		], { inflate: 0.025, density: 90, uvScale: 1.6 } );
		ankle.add( mesh( fetGeo, mats.leg ) );

		const hoof = new THREE.Group();
		hoof.position.set( 0, -0.24, 0.03 );
		ankle.add( hoof );

		const hoofGeo = blobGeometry( [
			{ center: new V3( 0, -0.06, 0.005 ), radius: new V3( 0.082, 0.075, 0.095 ) },
			{ center: new V3( 0, -0.125, 0.02 ), radius: new V3( 0.088, 0.055, 0.105 ) }
		], { inflate: 0.015, density: 90, uvScale: 1.6 } );
		const hoofMesh = mesh( hoofGeo, mats.hoof );
		hoof.add( hoofMesh );

		// two subtle cloven-hoof grooves
		for ( const s of [ -1, 1 ] ) {
			const groove = new THREE.Mesh( new THREE.BoxGeometry( 0.012, 0.11, 0.13 ), mats.hoofDark );
			groove.position.set( s * 0.012, -0.115, 0.045 );
			groove.rotation.x = -0.25;
			groove.castShadow = false;
			hoof.add( groove );
		}

		// knee cap / wrist bump
		const kneeBump = new THREE.Mesh( new THREE.SphereGeometry( 0.082 * rs, 12, 10 ), mats.leg );
		kneeBump.position.set( 0, -0.02, 0.06 );
		kneeBump.castShadow = true;
		knee.add( kneeBump );

		return {
			group: leg,
			hip: hip,
			knee: knee,
			ankle: ankle,
			hoof: hoof,
			phaseOffset: cfg.phaseOffset || 0
		};
	}

	// ------------------------------------------------------------------
	// head
	// ------------------------------------------------------------------
	function buildHead( mats ) {
		const head = new THREE.Group();

		// skull + muzzle
		const skullGeo = blobGeometry( [
			{ center: new V3( 0, 0, 0 ), radius: new V3( 0.138, 0.152, 0.146 ) },        // cranium
			{ center: new V3( 0, -0.05, 0.155 ), radius: new V3( 0.112, 0.122, 0.150 ) }, // face
			{ center: new V3( 0, -0.115, 0.315 ), radius: new V3( 0.092, 0.098, 0.160 ) },// muzzle
			{ center: new V3( 0, -0.135, 0.44 ), radius: new V3( 0.082, 0.082, 0.10 ) }   // nose
		], { inflate: 0.018, density: 150, uvScale: 1.25 } );
		head.add( mesh( skullGeo, mats.head ) );

		// lower jaw
		const jawGeo = blobGeometry( [
			{ center: new V3( 0, -0.17, 0.13 ), radius: new V3( 0.082, 0.072, 0.115 ) },
			{ center: new V3( 0, -0.205, 0.31 ), radius: new V3( 0.072, 0.068, 0.125 ) }
		], { inflate: 0.02, density: 120, uvScale: 1.3 } );
		head.add( mesh( jawGeo, mats.head ) );

		// lips / chin tuft
		const lip = new THREE.Mesh( new THREE.SphereGeometry( 0.072, 12, 10 ), mats.muzzle );
		lip.position.set( 0, -0.235, 0.45 );
		lip.scale.set( 1.15, 0.75, 1.0 );
		lip.castShadow = true;
		head.add( lip );

		// nostrils
		for ( const s of [ -1, 1 ] ) {
			const n = new THREE.Mesh( new THREE.SphereGeometry( 0.023, 8, 8 ), mats.dark );
			n.position.set( s * 0.052, -0.135, 0.525 );
			n.scale.set( 1, 1.4, 0.6 );
			head.add( n );
		}

		// eyes (bulging, on the sides) + lids + brow
		for ( const s of [ -1, 1 ] ) {
			const socket = new THREE.Mesh( new THREE.SphereGeometry( 0.072, 12, 10 ), mats.head );
			socket.position.set( s * 0.118, 0.012, 0.145 );
			socket.scale.set( 1, 1, 1 );
			socket.castShadow = true;
			head.add( socket );

			const eye = new THREE.Mesh( new THREE.SphereGeometry( 0.041, 14, 12 ), mats.eye );
			eye.position.set( s * 0.155, 0.018, 0.185 );
			eye.scale.set( 0.72, 1, 1 );
			head.add( eye );

			const pupil = new THREE.Mesh( new THREE.SphereGeometry( 0.021, 10, 8 ), mats.dark );
			pupil.position.set( s * 0.183, 0.020, 0.203 );
			pupil.scale.set( 0.5, 1, 1 );
			head.add( pupil );

			// upper eyelid ridge
			const lid = new THREE.Mesh( new THREE.TorusGeometry( 0.052, 0.014, 8, 14, Math.PI ), mats.head );
			lid.position.set( s * 0.15, 0.045, 0.185 );
			lid.rotation.set( Math.PI / 2, 0, s * -0.35 );
			head.add( lid );

			// brow ridge
			const brow = new THREE.Mesh( new THREE.SphereGeometry( 0.055, 10, 8 ), mats.head );
			brow.position.set( s * 0.115, 0.085, 0.135 );
			brow.scale.set( 1.15, 0.55, 1.1 );
			brow.castShadow = true;
			head.add( brow );

			// lashes: tiny dark spike
			const lash = new THREE.Mesh( new THREE.ConeGeometry( 0.012, 0.055, 6 ), mats.dark );
			lash.position.set( s * 0.175, 0.062, 0.205 );
			lash.rotation.set( 1.2, 0, s * 0.5 );
			head.add( lash );
		}

		// ossicones (horns): bone core with dark tufted tip
		for ( const s of [ -1, 1 ] ) {
			const oss = new THREE.Group();
			oss.position.set( s * 0.082, 0.145, 0.028 );
			oss.rotation.set( -0.12, 0, s * 0.12 );
			const stalk = new THREE.Mesh( new THREE.CylinderGeometry( 0.028, 0.036, 0.17, 10 ), mats.head );
			stalk.position.y = 0.085;
			stalk.castShadow = true;
			oss.add( stalk );
			const knob = new THREE.Mesh( new THREE.SphereGeometry( 0.042, 10, 8 ), mats.ossiconeTip );
			knob.position.y = 0.185;
			knob.castShadow = true;
			oss.add( knob );
			head.add( oss );
		}

		// ears: flattened tapered ellipsoids on short pivots
		for ( const s of [ -1, 1 ] ) {
			const earPivot = new THREE.Group();
			earPivot.position.set( s * 0.148, 0.115, -0.055 );
			earPivot.rotation.set( 0.15, s * 0.75, s * -0.55 );
			const earGeo = blobGeometry( [
				{ center: new V3( 0, 0, 0 ), radius: new V3( 0.042, 0.052, 0.024 ) },
				{ center: new V3( 0, 0.095, 0 ), radius: new V3( 0.050, 0.058, 0.020 ) },
				{ center: new V3( 0, 0.175, 0 ), radius: new V3( 0.032, 0.048, 0.015 ) }
			], { inflate: 0.025, density: 90, uvScale: 1.6 } );
			const ear = new THREE.Mesh( earGeo, mats.head );
			ear.castShadow = true;
			earPivot.add( ear );
			const inner = new THREE.Mesh( new THREE.SphereGeometry( 0.035, 8, 8 ), mats.earInner );
			inner.position.set( 0, 0.11, 0.012 );
			inner.scale.set( 1.15, 1.9, 0.4 );
			earPivot.add( inner );
			head.add( earPivot );
			head.userData[ 'ear' + ( s < 0 ? 'L' : 'R' ) ] = earPivot;
		}

		// cheek / jaw wattle (small skin flap under the chin, giraffes have one)
		const wattle = new THREE.Mesh( new THREE.SphereGeometry( 0.045, 8, 8 ), mats.head );
		wattle.position.set( 0, -0.30, 0.13 );
		wattle.scale.set( 0.8, 1.5, 0.8 );
		wattle.castShadow = true;
		head.add( wattle );

		return head;
	}

	// ------------------------------------------------------------------
	// mane: a strip of small dark wedges along the back of the neck
	// ------------------------------------------------------------------
	function buildMane( mats, segments ) {
		const mane = new THREE.Group();
		const n = segments || 22;
		for ( let i = 0; i < n; i ++ ) {
			const t = i / ( n - 1 );
			const h = 0.11 * ( 1 - t * 0.72 );
			const wedge = new THREE.Mesh( new THREE.ConeGeometry( h * 0.72, h * 1.75, 5 ), mats.mane );
			wedge.position.set( 0, 0.02 + t * 0.02, -0.02 );
			wedge.rotation.x = -1.15 - t * 0.35;
			wedge.castShadow = true;
			wedge.userData.t = t;
			mane.add( wedge );
		}
		return mane;
	}

	// ------------------------------------------------------------------
	// tail: thin tapering tube with a dark tuft
	// ------------------------------------------------------------------
	function buildTail( mats ) {
		const tail = new THREE.Group();
		const spine = [];
		const N = 14;
		for ( let i = 0; i < N; i ++ ) {
			const t = i / ( N - 1 );
			spine.push( {
				p: new V3( 0, -t * 1.28, -Math.sin( t * 1.15 ) * 0.16 ),
				r: 0.072 * ( 1 - t * 0.55 )
			} );
		}
		const tube = new THREE.Mesh( taperedTubeGeometry( spine, 9 ), mats.tail );
		tube.castShadow = true;
		tail.add( tube );

		// tuft
		const tuft = new THREE.Group();
		tuft.position.set( 0, -1.30, -0.155 );
		for ( let i = 0; i < 14; i ++ ) {
			const a = ( i / 14 ) * Math.PI * 2;
			const len = 0.30 + ( i % 3 ) * 0.055;
			const strand = new THREE.Mesh( new THREE.ConeGeometry( 0.022, len, 5 ), mats.mane );
			strand.position.set( Math.cos( a ) * 0.035, -len * 0.32, Math.sin( a ) * 0.035 );
			strand.rotation.set( Math.PI + Math.cos( a ) * 0.28, 0, Math.sin( a ) * 0.28 );
			strand.castShadow = true;
			tuft.add( strand );
		}
		tail.add( tuft );
		tail.userData.tuft = tuft;
		return tail;
	}

	// ------------------------------------------------------------------
	// main builder
	// ------------------------------------------------------------------
	function buildGiraffe( THREE, mats, textures ) {
		const root = new THREE.Group();
		root.name = 'giraffe';

		// ---- torso ----------------------------------------------------
		const torso = new THREE.Group();
		torso.position.y = P.shoulderY;
		root.add( torso );

		const bodyGeo = blobGeometry( [
			// chest / shoulders (deep at the front)
			{ center: new V3( 0.82, 0.10, 0 ), radius: new V3( 0.42, 0.44, 0.335 ) },
			{ center: new V3( 0.52, -0.12, 0 ), radius: new V3( 0.42, 0.42, 0.335 ) },
			// barrel
			{ center: new V3( 0.16, -0.06, 0 ), radius: new V3( 0.50, 0.43, 0.35 ) },
			{ center: new V3( -0.46, -0.08, 0 ), radius: new V3( 0.48, 0.43, 0.34 ) },
			// hips / rump
			{ center: new V3( -1.06, -0.04, 0 ), radius: new V3( 0.42, 0.45, 0.34 ) },
			// belly tuck
			{ center: new V3( -0.14, -0.40, 0 ), radius: new V3( 0.40, 0.17, 0.25 ) },
			// withers
			{ center: new V3( 0.70, 0.34, 0 ), radius: new V3( 0.27, 0.17, 0.22 ) }
		], { inflate: 0.012, density: 240, uvScale: 0.42 } );
		const torsoMesh = mesh( bodyGeo, mats.body );
		torso.add( torsoMesh );

		// ---- neck ------------------------------------------------------
		const neck = new THREE.Group();
		neck.position.set( P.neckBaseX, 0.42, 0 );
		neck.rotation.z = P.neckLean;
		torso.add( neck );

		const neckSpine = [];
		const NK = 11;
		for ( let i = 0; i < NK; i ++ ) {
			const t = i / ( NK - 1 );
			neckSpine.push( {
				p: new V3( Math.sin( t * 0.42 ) * 0.10, t * P.neckLen, 0 ),
				r: 0.265 - t * 0.148
			} );
		}
		const neckMesh = new THREE.Mesh( taperedTubeGeometry( neckSpine, 14 ), mats.neck );
		neckMesh.castShadow = true;
		neckMesh.receiveShadow = true;
		neck.add( neckMesh );

		// neck base blending blob (hides the seam with the torso)
		const neckBlend = new THREE.Mesh( new THREE.SphereGeometry( 0.27, 16, 12 ), mats.body );
		neckBlend.position.set( -0.02, 0.12, 0 );
		neckBlend.scale.set( 1.12, 1.35, 1.02 );
		neckBlend.castShadow = true;
		neck.add( neckBlend );

		// mane along the back edge of the neck
		const mane = buildMane( mats, 24 );
		for ( let i = 0; i < mane.children.length; i ++ ) {
			const t = mane.children[ i ].userData.t;
			mane.children[ i ].position.set(
				Math.sin( t * 0.42 ) * 0.10 - ( 0.265 - t * 0.148 ) * 0.94,
				t * P.neckLen + 0.055,
				0
			);
		}
		neck.add( mane );

		// ---- head ------------------------------------------------------
		const headAnchor = new THREE.Group();
		headAnchor.position.set( Math.sin( 0.42 ) * 0.10, P.neckLen + 0.02, 0 );
		neck.add( headAnchor );

		const head = buildHead( mats );
		head.position.set( 0, 0.02, 0 );
		// neck leans ~21 deg forward; the head pitches back so the muzzle
		// points forward and slightly down, like a real giraffe in motion
		head.rotation.x = -1.37;
		head.rotation.z = -0.14;
		headAnchor.add( head );

		// ---- legs ------------------------------------------------------
		const legs = {};
		const legDefs = [
			{ key: 'frontL', front: true, x: 0.80, z: 0.235, hipY: P.shoulderY - 0.06, radiusScale: 1.05, phaseOffset: 0 },
			{ key: 'frontR', front: true, x: 0.80, z: -0.235, hipY: P.shoulderY - 0.06, radiusScale: 1.05, phaseOffset: Math.PI },
			{ key: 'backL', front: false, x: -0.92, z: 0.225, hipY: P.hipY - 0.08, radiusScale: 1.14, phaseOffset: Math.PI },
			{ key: 'backR', front: false, x: -0.92, z: -0.225, hipY: P.hipY - 0.08, radiusScale: 1.14, phaseOffset: 0 }
		];
		for ( const d of legDefs ) {
			const l = buildLeg( mats, d );
			root.add( l.group );
			legs[ d.key ] = l;
		}

		// ---- tail -------------------------------------------------------
		const tailAnchor = new THREE.Group();
		tailAnchor.position.set( -1.46, 0.34, 0 );
		tailAnchor.rotation.z = -0.34;
		torso.add( tailAnchor );
		const tail = buildTail( mats );
		tailAnchor.add( tail );

		return {
			root: root,
			torso: torso,
			torsoMesh: torsoMesh,
			neckMesh: neckMesh,
			headGroup: head,
			neck: neck,
			mane: mane,
			headAnchor: headAnchor,
			head: head,
			legs: legs,
			tailAnchor: tailAnchor,
			tail: tail,
			props: P
		};
	}

	window.GIRAFFE_ANATOMY = {
		buildGiraffe: buildGiraffe,
		blobGeometry: blobGeometry,
		taperedTubeGeometry: taperedTubeGeometry,
		proportions: P
	};
})();
