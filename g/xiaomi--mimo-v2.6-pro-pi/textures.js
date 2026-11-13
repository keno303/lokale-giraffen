// Procedural coat pattern + environment textures for the giraffe scene.
// All textures are generated at runtime on <canvas> (works offline from file://).
(function () {
	'use strict';

	// ---- deterministic PRNG (mulberry32) ---------------------------------
	function mulberry32( seed ) {
		let a = seed >>> 0;
		return function () {
			a |= 0; a = ( a + 0x6D2B79F5 ) | 0;
			let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
			t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
			return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
		};
	}

	function makeCanvas( w, h ) {
		const c = document.createElement( 'canvas' );
		c.width = w; c.height = h;
		return c;
	}

	function texFromCanvas( THREE, canvas, opts ) {
		const t = new THREE.CanvasTexture( canvas );
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.colorSpace = THREE.SRGBColorSpace;
		t.anisotropy = ( opts && opts.anisotropy ) || 8;
		if ( opts && opts.repeat ) t.repeat.set( opts.repeat[ 0 ], opts.repeat[ 1 ] );
		t.needsUpdate = true;
		return t;
	}

	// ---- giraffe coat ----------------------------------------------------
	// Irregular rounded polygons ("patches") on a warm cream background.
	// The patch map is used both as the base colour map and (inverted) as a
	// roughness map, so the dark patches are slightly glossier than the cream
	// fur between them - like a real coat catching the light.
	function drawPatchField( ctx, W, H, opts ) {
		const rnd = mulberry32( opts.seed );
		const cell = opts.cell;              // patch spacing in px
		const jitter = cell * 0.42;
		const cols = Math.ceil( W / cell ) + 2;
		const rows = Math.ceil( H / cell ) + 2;

		ctx.fillStyle = opts.cream;
		ctx.fillRect( 0, 0, W, H );

		// soft cream mottling so the background is not flat
		for ( let i = 0; i < 220; i ++ ) {
			const x = rnd() * W, y = rnd() * H, r = 20 + rnd() * 70;
			const g = ctx.createRadialGradient( x, y, 0, x, y, r );
			const tone = rnd() < 0.5 ? 'rgba(255,246,224,0.35)' : 'rgba(214,186,140,0.22)';
			g.addColorStop( 0, tone );
			g.addColorStop( 1, 'rgba(0,0,0,0)' );
			ctx.fillStyle = g;
			ctx.fillRect( x - r, y - r, r * 2, r * 2 );
		}

		for ( let gy = -1; gy < rows; gy ++ ) {
			for ( let gx = -1; gx < cols; gx ++ ) {
				const cx = gx * cell + ( rnd() - 0.5 ) * jitter * 2 + ( gy % 2 ? cell * 0.5 : 0 );
				const cy = gy * cell + ( rnd() - 0.5 ) * jitter * 2;
				if ( rnd() > opts.fill ) continue;

				const baseR = cell * ( 0.56 + rnd() * 0.10 );
				const verts = 5 + Math.floor( rnd() * 4 );
				const rot = rnd() * Math.PI * 2;

				// patch body: angular polygon (reticulated giraffe), with
				// straight-ish edges and small per-corner jitter
				ctx.beginPath();
				for ( let k = 0; k < verts; k ++ ) {
					const a = rot + ( k / verts ) * Math.PI * 2 + ( rnd() - 0.5 ) * 0.35;
					const rr = baseR * ( 0.82 + rnd() * 0.38 );
					const x = cx + Math.cos( a ) * rr * 1.10;
					const y = cy + Math.sin( a ) * rr * 0.95;
					if ( k === 0 ) ctx.moveTo( x, y ); else ctx.lineTo( x, y );
				}
				ctx.closePath();

				const shade = rnd();
				if ( shade < 0.28 ) ctx.fillStyle = opts.patchDark;
				else if ( shade < 0.62 ) ctx.fillStyle = opts.patch;
				else ctx.fillStyle = opts.patchLight;
				ctx.fill();

				// thin darker rim -> patches read as crisply separated
				ctx.lineWidth = Math.max( 1, cell * 0.016 );
				ctx.strokeStyle = opts.rim;
				ctx.stroke();

				// inner shading for volume
				const g = ctx.createRadialGradient( cx - baseR * 0.3, cy - baseR * 0.3, baseR * 0.1, cx, cy, baseR * 1.25 );
				g.addColorStop( 0, 'rgba(255,220,180,0.16)' );
				g.addColorStop( 1, 'rgba(60,26,10,0.18)' );
				ctx.fillStyle = g;
				ctx.fill();
			}
		}

		// sparse hair speckle
		ctx.globalAlpha = 0.10;
		for ( let i = 0; i < W * H / 260; i ++ ) {
			const x = rnd() * W, y = rnd() * H;
			ctx.fillStyle = rnd() < 0.5 ? '#3a2210' : '#fff4dd';
			ctx.fillRect( x, y, 1 + rnd() * 2, 1 + rnd() * 2 );
		}
		ctx.globalAlpha = 1;
	}

	function giraffeCoatTextures( THREE, seed ) {
		const W = 1024, H = 1024;
		const body = makeCanvas( W, H );
		drawPatchField( body.getContext( '2d' ), W, H, {
			seed: seed, cell: 132, fill: 0.985,
			cream: '#efdcac',
			patchLight: '#c97c2c', patch: '#a45c1c', patchDark: '#6f3a12',
			rim: 'rgba(58,28,10,0.55)'
		} );

		// neck & legs: smaller patches
		const fine = makeCanvas( 512, 512 );
		drawPatchField( fine.getContext( '2d' ), 512, 512, {
			seed: seed + 77, cell: 76, fill: 0.975,
			cream: '#f1dfa8',
			patchLight: '#c4782a', patch: '#9c5719', patchDark: '#6b3610',
			rim: 'rgba(58,28,10,0.5)'
		} );

		// head: tiny, faint patches
		const head = makeCanvas( 512, 512 );
		const hctx = head.getContext( '2d' );
		hctx.fillStyle = '#e9d3ab';
		hctx.fillRect( 0, 0, 512, 512 );
		drawPatchField( hctx, 512, 512, {
			seed: seed + 913, cell: 66, fill: 0.82,
			cream: '#e9d3ab',
			patchLight: '#d2a76c', patch: '#c1925a', patchDark: '#a97c48',
			rim: 'rgba(90,55,25,0.35)'
		} );

		// roughness map derived from the body canvas: dark patches glossier
		const rough = makeCanvas( 256, 256 );
		const rctx = rough.getContext( '2d' );
		rctx.drawImage( body, 0, 0, 256, 256 );
		const img = rctx.getImageData( 0, 0, 256, 256 );
		for ( let i = 0; i < img.data.length; i += 4 ) {
			const lum = ( img.data[ i ] * 0.3 + img.data[ i + 1 ] * 0.55 + img.data[ i + 2 ] * 0.15 ) / 255;
			const v = Math.round( 255 * ( 0.52 + lum * 0.42 ) );   // lighter (cream) -> rougher
			img.data[ i ] = img.data[ i + 1 ] = img.data[ i + 2 ] = v;
			img.data[ i + 3 ] = 255;
		}
		rctx.putImageData( img, 0, 0 );

		return {
			body: texFromCanvas( THREE, body, { repeat: [ 1, 1 ] } ),
			fine: texFromCanvas( THREE, fine, { repeat: [ 1, 1 ] } ),
			head: texFromCanvas( THREE, head, { repeat: [ 1, 1 ] } ),
			rough: ( function () {
				const t = new THREE.CanvasTexture( rough );
				t.wrapS = t.wrapT = THREE.RepeatWrapping;
				return t;
			} )()
		};
	}

	// ---- ground: dry savanna grass ---------------------------------------
	function savannaGroundTexture( THREE, seed ) {
		const S = 1024;
		const c = makeCanvas( S, S );
		const ctx = c.getContext( '2d' );
		const rnd = mulberry32( seed );

		ctx.fillStyle = '#bfa268';
		ctx.fillRect( 0, 0, S, S );

		for ( let i = 0; i < 900; i ++ ) {
			const x = rnd() * S, y = rnd() * S, r = 12 + rnd() * 90;
			const g = ctx.createRadialGradient( x, y, 0, x, y, r );
			const pick = rnd();
			const col = pick < 0.34 ? 'rgba(176,150,92,0.5)'
				: pick < 0.68 ? 'rgba(212,186,124,0.45)'
					: 'rgba(146,120,72,0.4)';
			g.addColorStop( 0, col );
			g.addColorStop( 1, 'rgba(0,0,0,0)' );
			ctx.fillStyle = g;
			ctx.fillRect( x - r, y - r, r * 2, r * 2 );
		}

		// grass blade strokes
		ctx.lineWidth = 1.4;
		for ( let i = 0; i < 5200; i ++ ) {
			const x = rnd() * S, y = rnd() * S;
			const len = 6 + rnd() * 16;
			const a = rnd() * Math.PI * 2;
			const t = rnd();
			ctx.strokeStyle = t < 0.33 ? 'rgba(222,196,128,0.5)'
				: t < 0.66 ? 'rgba(150,122,66,0.55)'
					: 'rgba(102,84,44,0.5)';
			ctx.beginPath();
			ctx.moveTo( x, y );
			ctx.quadraticCurveTo( x + Math.cos( a ) * len * 0.5, y + Math.sin( a ) * len * 0.5 - 2,
				x + Math.cos( a ) * len, y + Math.sin( a ) * len );
			ctx.stroke();
		}

		// small stones
		for ( let i = 0; i < 180; i ++ ) {
			const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 4;
			ctx.fillStyle = rnd() < 0.5 ? 'rgba(126,110,80,0.8)' : 'rgba(214,196,156,0.7)';
			ctx.beginPath();
			ctx.ellipse( x, y, r, r * 0.7, rnd() * Math.PI, 0, Math.PI * 2 );
			ctx.fill();
		}

		const t = new THREE.CanvasTexture( c );
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.colorSpace = THREE.SRGBColorSpace;
		t.repeat.set( 26, 26 );
		t.anisotropy = 8;
		return t;
	}

	// ---- sky gradient -----------------------------------------------------
	function skyTexture( THREE ) {
		const c = makeCanvas( 8, 256 );
		const ctx = c.getContext( '2d' );
		const g = ctx.createLinearGradient( 0, 0, 0, 256 );
		g.addColorStop( 0.0, '#2f6fb4' );
		g.addColorStop( 0.38, '#8cc0e6' );
		g.addColorStop( 0.62, '#d9e8ef' );
		g.addColorStop( 0.8, '#f0e2c2' );
		g.addColorStop( 1.0, '#e8d3a6' );
		ctx.fillStyle = g;
		ctx.fillRect( 0, 0, 8, 256 );
		const t = new THREE.CanvasTexture( c );
		t.colorSpace = THREE.SRGBColorSpace;
		t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
		return t;
	}

	window.GIRAFFE_TEXTURES = {
		giraffeCoatTextures: giraffeCoatTextures,
		savannaGroundTexture: savannaGroundTexture,
		skyTexture: skyTexture
	};
})();
