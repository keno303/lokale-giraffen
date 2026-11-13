// Main scene: savanna environment, lighting, camera rig, giraffe, animation
// loop and UI.  Runs directly from file:// with no server and no build step.
(function () {
	'use strict';

	const canvas = document.getElementById( 'scene' );
	const statusEl = document.getElementById( 'status' );

	// ------------------------------------------------------------------
	// renderer
	// ------------------------------------------------------------------
	const renderer = new THREE.WebGLRenderer( {
		canvas: canvas,
		antialias: true,
		alpha: false,
		powerPreference: 'high-performance'
	} );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio || 1, 2 ) );
	renderer.setSize( window.innerWidth, window.innerHeight, false );
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.02;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;

	const scene = new THREE.Scene();
	scene.fog = new THREE.Fog( 0xd8d5bd, 55, 230 );

	// sky dome (gradient texture on the inside of a large sphere)
	const skyTex = GIRAFFE_TEXTURES.skyTexture( THREE );
	const sky = new THREE.Mesh(
		new THREE.SphereGeometry( 420, 32, 20 ),
		new THREE.MeshBasicMaterial( { map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false } )
	);
	scene.add( sky );

	// ------------------------------------------------------------------
	// lights
	// ------------------------------------------------------------------
	const hemi = new THREE.HemisphereLight( 0xa9c9e8, 0xc09a62, 0.62 );
	scene.add( hemi );

	const sun = new THREE.DirectionalLight( 0xfff0d2, 3.25 );
	sun.position.set( 26, 30, 18 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 2048, 2048 );
	sun.shadow.camera.near = 1;
	sun.shadow.camera.far = 110;
	const S = 16;
	sun.shadow.camera.left = -S;
	sun.shadow.camera.right = S;
	sun.shadow.camera.top = S;
	sun.shadow.camera.bottom = -S;
	sun.shadow.bias = -0.0006;
	sun.shadow.normalBias = 0.028;
	scene.add( sun );
	scene.add( sun.target );

	// warm fill from the opposite side
	const fill = new THREE.DirectionalLight( 0xffd7a8, 0.42 );
	fill.position.set( -18, 12, -22 );
	scene.add( fill );

	// ------------------------------------------------------------------
	// ground
	// ------------------------------------------------------------------
	const groundTex = GIRAFFE_TEXTURES.savannaGroundTexture( THREE, 12345 );
	const ground = new THREE.Mesh(
		new THREE.PlaneGeometry( 420, 420 ),
		new THREE.MeshStandardMaterial( {
			map: groundTex,
			roughness: 0.96,
			metalness: 0.0
		} )
	);
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	scene.add( ground );

	// ------------------------------------------------------------------
	// vegetation: instanced savanna grass tufts + scattered rocks
	// ------------------------------------------------------------------
	function addGrass() {
		const blade = new THREE.ConeGeometry( 0.055, 1.0, 4, 1 );
		blade.translate( 0, 0.5, 0 );
		const count = 1400;
		const mat = new THREE.MeshStandardMaterial( {
			color: 0xc4ab6c,
			roughness: 0.95,
			metalness: 0,
			vertexColors: true
		} );
		const inst = new THREE.InstancedMesh( blade, mat, count );
		inst.castShadow = true;
		inst.receiveShadow = true;
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const eul = new THREE.Euler();
		const v = new THREE.Vector3();
		const s = new THREE.Vector3();
		const color = new THREE.Color();
		for ( let i = 0; i < count; i ++ ) {
			// ring distribution: denser near the giraffe, sparse far away
			const r = 6 + Math.pow( Math.random(), 0.55 ) * 46;
			const a = Math.random() * Math.PI * 2;
			v.set( Math.cos( a ) * r, 0, Math.sin( a ) * r );
			eul.set( ( Math.random() - 0.5 ) * 0.35, Math.random() * Math.PI * 2, ( Math.random() - 0.5 ) * 0.35 );
			q.setFromEuler( eul );
			const h = 0.28 + Math.random() * 0.5;
			s.set( 0.7 + Math.random() * 0.9, h, 0.7 + Math.random() * 0.9 );
			m.compose( v, q, s );
			inst.setMatrixAt( i, m );
			const t = Math.random();
			color.setHSL( 0.11 + t * 0.05, 0.40 + t * 0.22, 0.52 + t * 0.22 );
			inst.setColorAt( i, color );
		}
		inst.instanceMatrix.needsUpdate = true;
		if ( inst.instanceColor ) inst.instanceColor.needsUpdate = true;
		scene.add( inst );
	}
	addGrass();

	function addRocks() {
		const rockGeo = new THREE.IcosahedronGeometry( 1, 1 );
		const pos = rockGeo.attributes.position;
		const v = new THREE.Vector3();
		for ( let i = 0; i < pos.count; i ++ ) {
			v.fromBufferAttribute( pos, i );
			const n = 0.82 + Math.random() * 0.38;
			pos.setXYZ( i, v.x * n, v.y * n * 0.72, v.z * n );
		}
		rockGeo.computeVertexNormals();
		const mat = new THREE.MeshStandardMaterial( { color: 0x9a8b6c, roughness: 0.92, metalness: 0.02 } );
		for ( let i = 0; i < 22; i ++ ) {
			const r = 9 + Math.random() * 34;
			const a = Math.random() * Math.PI * 2;
			const rock = new THREE.Mesh( rockGeo, mat );
			rock.position.set( Math.cos( a ) * r, 0.02, Math.sin( a ) * r );
			const sc = 0.22 + Math.random() * 0.75;
			rock.scale.setScalar( sc );
			rock.rotation.set( Math.random(), Math.random() * 6.28, Math.random() * 0.5 );
			rock.castShadow = true;
			rock.receiveShadow = true;
			scene.add( rock );
		}
	}
	addRocks();

	// distant hills (flat silhouettes at the horizon)
	function addHills() {
		const hillMat = new THREE.MeshBasicMaterial( { color: 0xb9b492, fog: true } );
		for ( let i = 0; i < 7; i ++ ) {
			const w = 60 + Math.random() * 90;
			const h = 6 + Math.random() * 12;
			const hill = new THREE.Mesh( new THREE.CircleGeometry( 1, 24 ), hillMat );
			hill.scale.set( w, h, 1 );
			const a = -0.9 + i * 0.42 + Math.random() * 0.12;
			const r = 150;
			hill.position.set( Math.cos( a ) * r, h * 0.22, Math.sin( a ) * r );
			hill.lookAt( 0, h * 0.5, 0 );
			scene.add( hill );
		}
	}
	addHills();

	// ------------------------------------------------------------------
	// giraffe
	// ------------------------------------------------------------------
	const coat = GIRAFFE_TEXTURES.giraffeCoatTextures( THREE, 4242 );

	const mats = {
		body: new THREE.MeshStandardMaterial( {
			map: coat.body, roughnessMap: coat.rough,
			roughness: 0.88, metalness: 0.02
		} ),
		neck: new THREE.MeshStandardMaterial( {
			map: coat.fine, roughnessMap: coat.rough,
			roughness: 0.86, metalness: 0.02
		} ),
		leg: new THREE.MeshStandardMaterial( {
			map: coat.fine, roughness: 0.9, metalness: 0.02
		} ),
		head: new THREE.MeshStandardMaterial( {
			map: coat.head, roughness: 0.82, metalness: 0.02
		} ),
		muzzle: new THREE.MeshStandardMaterial( { color: 0x8d6a4c, roughness: 0.72, metalness: 0.02 } ),
		eye: new THREE.MeshStandardMaterial( { color: 0x2b1c10, roughness: 0.16, metalness: 0.1 } ),
		dark: new THREE.MeshStandardMaterial( { color: 0x2a1b10, roughness: 0.55, metalness: 0.05 } ),
		hoof: new THREE.MeshStandardMaterial( { color: 0x4c3b2c, roughness: 0.52, metalness: 0.06 } ),
		hoofDark: new THREE.MeshStandardMaterial( { color: 0x2c2117, roughness: 0.6, metalness: 0.05 } ),
		mane: new THREE.MeshStandardMaterial( { color: 0x4a2f19, roughness: 0.85, metalness: 0.02 } ),
		tail: new THREE.MeshStandardMaterial( { map: coat.fine, roughness: 0.88 } ),
		ossiconeTip: new THREE.MeshStandardMaterial( { color: 0x3c2614, roughness: 0.75 } ),
		earInner: new THREE.MeshStandardMaterial( { color: 0x6d4a30, roughness: 0.8 } )
	};

	const rig = GIRAFFE_ANATOMY.buildGiraffe( THREE, mats, coat );
	scene.add( rig.root );

	const gait = GIRAFFE_GAIT.createGait( rig, {
		duty: 0.62,
		stride: 1.42,
		standHeight: 2.62
	} );

	// ------------------------------------------------------------------
	// dust puffs kicked up by the hooves
	// ------------------------------------------------------------------
	const dust = ( function () {
		const N = 120;
		const geo = new THREE.BufferGeometry();
		const positions = new Float32Array( N * 3 );
		const alphas = new Float32Array( N );
		const sizes = new Float32Array( N );
		geo.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
		geo.setAttribute( 'alpha', new THREE.BufferAttribute( alphas, 1 ) );
		geo.setAttribute( 'size', new THREE.BufferAttribute( sizes, 1 ) );

		const mat = new THREE.ShaderMaterial( {
			transparent: true,
			depthWrite: false,
			uniforms: {},
			vertexShader: [
				'attribute float alpha;',
				'attribute float size;',
				'varying float vAlpha;',
				'void main() {',
				'	vAlpha = alpha;',
				'	vec4 mv = modelViewMatrix * vec4( position, 1.0 );',
				'	gl_PointSize = size * ( 300.0 / -mv.z );',
				'	gl_Position = projectionMatrix * mv;',
				'}'
			].join( '\n' ),
			fragmentShader: [
				'varying float vAlpha;',
				'void main() {',
				'	vec2 d = gl_PointCoord - vec2( 0.5 );',
				'	float r = length( d );',
				'	float a = smoothstep( 0.5, 0.08, r ) * vAlpha;',
				'	if ( a < 0.01 ) discard;',
				'	gl_FragColor = vec4( 0.86, 0.78, 0.62, a );',
				'}'
			].join( '\n' )
		} );

		const points = new THREE.Points( geo, mat );
		points.frustumCulled = false;
		scene.add( points );

		const parts = [];
		for ( let i = 0; i < N; i ++ ) {
			parts.push( { life: 0, maxLife: 1, vel: new THREE.Vector3(), pos: new THREE.Vector3() } );
		}
		let cursor = 0;

		function spawn( x, y, z, strength ) {
			const p = parts[ cursor ];
			cursor = ( cursor + 1 ) % N;
			p.pos.set( x, y, z );
			p.vel.set( ( Math.random() - 0.5 ) * 0.55, 0.32 + Math.random() * 0.45, ( Math.random() - 0.5 ) * 0.55 );
			p.life = p.maxLife = 0.75 + Math.random() * 0.7;
			p.strength = strength;
		}

		function update( dt ) {
			for ( let i = 0; i < N; i ++ ) {
				const p = parts[ i ];
				if ( p.life > 0 ) {
					p.life -= dt;
					p.pos.addScaledVector( p.vel, dt );
					p.vel.multiplyScalar( 1 - dt * 1.6 );
					p.vel.y -= dt * 0.22;
				}
				const t = Math.max( 0, p.life / p.maxLife );
				positions[ i * 3 ] = p.pos.x;
				positions[ i * 3 + 1 ] = p.pos.y;
				positions[ i * 3 + 2 ] = p.pos.z;
				alphas[ i ] = t * 0.17 * ( p.strength || 1 );
				sizes[ i ] = 11 * ( 1.5 - t ) * ( p.strength || 1 );
			}
			geo.attributes.position.needsUpdate = true;
			geo.attributes.alpha.needsUpdate = true;
			geo.attributes.size.needsUpdate = true;
		}

		return { spawn: spawn, update: update };
	} )();

	// ------------------------------------------------------------------
	// camera rig (orbit, dolly, pan)
	// ------------------------------------------------------------------
	const camState = {
		theta: 0.62, phi: 1.24, radius: 15.5,
		target: new THREE.Vector3( 0, 3.0, 0 ),
		autoRotate: true
	};
	const camera = new THREE.PerspectiveCamera( 42, window.innerWidth / window.innerHeight, 0.1, 900 );
	const camTarget = camState.target.clone();

	function updateCamera() {
		const r = camState.radius;
		const sp = Math.sin( camState.phi ), cp = Math.cos( camState.phi );
		camera.position.set(
			camState.target.x + r * sp * Math.sin( camState.theta ),
			camState.target.y + r * cp,
			camState.target.z + r * sp * Math.cos( camState.theta )
		);
		camera.lookAt( camTarget );
	}

	// pointer interaction
	let dragging = false, lastX = 0, lastY = 0, twoFinger = false, pinchDist = 0;
	canvas.addEventListener( 'pointerdown', ( e ) => {
		dragging = true;
		camState.autoRotate = false;
		lastX = e.clientX; lastY = e.clientY;
		canvas.setPointerCapture( e.pointerId );
	} );
	canvas.addEventListener( 'pointermove', ( e ) => {
		if ( ! dragging ) return;
		const dx = e.clientX - lastX, dy = e.clientY - lastY;
		lastX = e.clientX; lastY = e.clientY;
		if ( e.shiftKey ) {
			// pan
			const panScale = camState.radius * 0.0016;
			const right = new THREE.Vector3().setFromMatrixColumn( camera.matrix, 0 );
			const up = new THREE.Vector3().setFromMatrixColumn( camera.matrix, 1 );
			camState.target.addScaledVector( right, -dx * panScale );
			camState.target.addScaledVector( up, dy * panScale );
			camTarget.copy( camState.target );
		} else {
			camState.theta -= dx * 0.0052;
			camState.phi = Math.max( 0.22, Math.min( 1.62, camState.phi - dy * 0.0042 ) );
		}
	} );
	canvas.addEventListener( 'pointerup', () => { dragging = false; } );
	canvas.addEventListener( 'pointercancel', () => { dragging = false; } );
	canvas.addEventListener( 'wheel', ( e ) => {
		e.preventDefault();
		camState.radius = Math.max( 4.5, Math.min( 60, camState.radius * ( 1 + e.deltaY * 0.0011 ) ) );
	}, { passive: false } );

	// touch: pinch to dolly, two-finger drag to pan
	canvas.addEventListener( 'touchstart', ( e ) => {
		if ( e.touches.length === 2 ) {
			twoFinger = true;
			pinchDist = Math.hypot(
				e.touches[ 0 ].clientX - e.touches[ 1 ].clientX,
				e.touches[ 0 ].clientY - e.touches[ 1 ].clientY );
		}
	}, { passive: true } );
	canvas.addEventListener( 'touchmove', ( e ) => {
		if ( twoFinger && e.touches.length === 2 ) {
			const d = Math.hypot(
				e.touches[ 0 ].clientX - e.touches[ 1 ].clientX,
				e.touches[ 0 ].clientY - e.touches[ 1 ].clientY );
			if ( pinchDist > 0 ) camState.radius = Math.max( 4.5, Math.min( 60, camState.radius * ( pinchDist / d ) ) );
			pinchDist = d;
			e.preventDefault();
		}
	}, { passive: false } );
	canvas.addEventListener( 'touchend', () => { twoFinger = false; }, { passive: true } );

	// ------------------------------------------------------------------
	// UI
	// ------------------------------------------------------------------
	const ui = {
		speed: document.getElementById( 'speed' ),
		speedVal: document.getElementById( 'speedVal' ),
		gait: document.getElementById( 'gait' ),
		auto: document.getElementById( 'auto' ),
		shadows: document.getElementById( 'shadows' ),
		wire: document.getElementById( 'wire' ),
		fps: document.getElementById( 'fps' ),
		reset: document.getElementById( 'reset' )
	};

	ui.speed.addEventListener( 'input', () => {
		ui.speedVal.textContent = ( +ui.speed.value ).toFixed( 1 ) + ' m/s';
	} );
	ui.gait.addEventListener( 'input', () => {
		gait.config.stride = +ui.gait.value;
		document.getElementById( 'gaitVal' ).textContent = ( +ui.gait.value ).toFixed( 2 ) + ' m';
	} );
	ui.auto.addEventListener( 'change', () => {
		camState.autoRotate = ui.auto.checked;
	} );
	ui.shadows.addEventListener( 'change', () => {
		const on = ui.shadows.checked;
		renderer.shadowMap.enabled = on;
		sun.castShadow = on;
		scene.traverse( ( o ) => { if ( o.material && o.material.needsUpdate !== undefined ) o.material.needsUpdate = true; } );
	} );
	ui.wire.addEventListener( 'change', () => {
		const on = ui.wire.checked;
		scene.traverse( ( o ) => {
			if ( o.isMesh && o.material && o.material.wireframe !== undefined ) o.material.wireframe = on;
		} );
	} );
	ui.reset.addEventListener( 'click', () => {
		camState.theta = 0.62; camState.phi = 1.24; camState.radius = 15.5;
		camState.target.set( 0, 3.0, 0 );
		camTarget.copy( camState.target );
		ui.auto.checked = true; camState.autoRotate = true;
	} );

	// keyboard shortcuts
	window.addEventListener( 'keydown', ( e ) => {
		if ( e.key === ' ' ) {
			e.preventDefault();
			ui.auto.checked = camState.autoRotate = ! camState.autoRotate;
		} else if ( e.key === 'r' || e.key === 'R' ) {
			ui.reset.click();
		} else if ( e.key === 'w' || e.key === 'W' ) {
			ui.wire.checked = ! ui.wire.checked;
			ui.wire.dispatchEvent( new Event( 'change' ) );
		} else if ( e.key === 'ArrowUp' ) {
			ui.speed.value = Math.min( 6, +ui.speed.value + 0.2 );
			ui.speed.dispatchEvent( new Event( 'input' ) );
		} else if ( e.key === 'ArrowDown' ) {
			ui.speed.value = Math.max( 0.2, +ui.speed.value - 0.2 );
			ui.speed.dispatchEvent( new Event( 'input' ) );
		}
	} );

	window.addEventListener( 'resize', () => {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( window.innerWidth, window.innerHeight, false );
	} );

	// ------------------------------------------------------------------
	// animation loop
	// ------------------------------------------------------------------
	const timer = new THREE.Timer();
	timer.connect( document );
	let elapsed = 0;
	let fpsAcc = 0, fpsCount = 0, fpsTimer = 0;
	let dustTimer = 0;

	function frame() {
		timer.update();
		const dt = Math.min( timer.getDelta(), 0.05 );
		elapsed += dt;

		const speed = +ui.speed.value;
		gait.update( dt, speed, elapsed );

		// camera auto-orbit + subtle bob
		if ( camState.autoRotate && ! dragging ) {
			camState.theta += dt * 0.055;
		}
		updateCamera();

		// dust from the planted hooves
		dustTimer += dt;
		if ( dustTimer > 0.16 && speed > 1.2 ) {
			dustTimer = 0;
			for ( const key in rig.legs ) {
				const leg = rig.legs[ key ];
				const world = new THREE.Vector3();
				leg.hoof.getWorldPosition( world );
				if ( world.y < 0.16 ) {
					dust.spawn( world.x, 0.05, world.z, Math.min( 1, speed / 5 ) * 0.85 );
				}
			}
		}
		dust.update( dt );

		// sun follows the giraffe so the shadow stays inside the shadow camera
		rig.root.getWorldPosition( sun.target.position );
		sun.position.set( sun.target.position.x + 26, 30, sun.target.position.z + 18 );
		sun.target.updateMatrixWorld();

		renderer.render( scene, camera );

		// fps meter
		fpsAcc += 1 / Math.max( dt, 1e-4 );
		fpsCount ++; fpsTimer += dt;
		if ( fpsTimer > 0.5 ) {
			ui.fps.textContent = Math.round( fpsAcc / fpsCount ) + ' fps';
			fpsAcc = 0; fpsCount = 0; fpsTimer = 0;
		}

		requestAnimationFrame( frame );
	}

	// first frame + startup status
	updateCamera();
	renderer.render( scene, camera );
	if ( statusEl ) statusEl.style.display = 'none';
	requestAnimationFrame( frame );

	// expose for debugging / automated checks
	window.__GIRAFFE__ = {
		THREE: THREE,
		camState: camState,
		camTarget: camTarget,
		renderer: renderer,
		scene: scene,
		camera: camera,
		rig: rig,
		gait: gait
	};
})();
