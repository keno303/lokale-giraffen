// giraffe.js

let scene, camera, renderer, giraffe, mixer, clock, controls;

function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true }); // Enable antialiasing
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x87ceeb, 1); // Sky blue background
    document.body.appendChild(renderer.domElement);

    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // An animation loop is required when damping is enabled
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI / 2;

    clock = new THREE.Clock();

    // Basic light
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    camera.position.z = 5;

    createGiraffe();
    animate();
}

function createGiraffe() {
    const giraffeMaterial = new THREE.MeshPhongMaterial({ color: 0xffa07a }); // Light reddish-brown

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshPhongMaterial({ color: 0x8b4513, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    scene.add(ground);

    // Body
    const bodyGeometry = new THREE.BoxGeometry(1.5, 0.8, 0.5);
    const body = new THREE.Mesh(bodyGeometry, giraffeMaterial);
    body.position.y = 0.5; // Lift it slightly above the ground

    giraffe = new THREE.Group();
    giraffe.add(body);

    // Neck
    const neckGeometry = new THREE.BoxGeometry(0.3, 2, 0.3);
    const neck = new THREE.Mesh(neckGeometry, giraffeMaterial);
    neck.position.y = 1.0; // Position relative to body
    neck.position.z = 0.1;
    body.add(neck); // Add neck to body group

    // Head
    const headGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.6);
    const head = new THREE.Mesh(headGeometry, giraffeMaterial);
    head.position.y = 1.1; // Position relative to neck
    head.position.z = 0.1;
    neck.add(head);

    // Horns (ossicones)
    const hornGeometry = new THREE.CylinderGeometry(0.05, 0.1, 0.3, 8);
    const hornMaterial = new THREE.MeshPhongMaterial({ color: 0x8b4513 }); // Brown

    const horn1 = new THREE.Mesh(hornGeometry, hornMaterial);
    horn1.position.set(-0.15, 0.3, -0.2); // Relative to head
    head.add(horn1);

    const horn2 = new THREE.Mesh(hornGeometry, hornMaterial);
    horn2.position.set(0.15, 0.3, -0.2); // Relative to head
    head.add(horn2);

    // Ears
    const earGeometry = new THREE.ConeGeometry(0.1, 0.2, 4);
    const earMaterial = new THREE.MeshPhongMaterial({ color: 0xffa07a });

    const ear1 = new THREE.Mesh(earGeometry, earMaterial);
    ear1.rotation.z = Math.PI / 2; // Rotate to point outwards
    ear1.position.set(-0.25, 0.15, -0.2);
    head.add(ear1);

    const ear2 = new THREE.Mesh(earGeometry, earMaterial);
    ear2.rotation.z = -Math.PI / 2; // Rotate to point outwards
    ear2.position.set(0.25, 0.15, -0.2);
    head.add(ear2);


    // Legs (front and back pairs)
    const legGeometry = new THREE.BoxGeometry(0.2, 1.2, 0.2);

    const frontLeftLeg = new THREE.Mesh(legGeometry, giraffeMaterial);
    frontLeftLeg.position.set(-0.5, -0.6, 0.2);
    body.add(frontLeftLeg);

    const frontRightLeg = new THREE.Mesh(legGeometry, giraffeMaterial);
    frontRightLeg.position.set(0.5, -0.6, 0.2);
    body.add(frontRightLeg);

    const backLeftLeg = new THREE.Mesh(legGeometry, giraffeMaterial);
    backLeftLeg.position.set(-0.5, -0.6, -0.2);
    body.add(backLeftLeg);

    const backRightLeg = new THREE.Mesh(legGeometry, giraffeMaterial);
    backRightLeg.position.set(0.5, -0.6, -0.2);
    body.add(backRightLeg);

    scene.add(giraffe);

    // Store references to legs for animation
    giraffe.frontLeftLeg = frontLeftLeg;
    giraffe.frontRightLeg = frontRightLeg;
    giraffe.backLeftLeg = backLeftLeg;
    giraffe.backRightLeg = backRightLeg;
    giraffe.neck = neck;
}

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    updateGiraffeAnimation(delta);
    controls.update(); // only required if controls.enableDamping is set to true

    renderer.render(scene, camera);
}

function updateGiraffeAnimation(delta) {
    const walkSpeed = 5;
    const legSwingAngle = Math.PI / 6; // 30 degrees

    // Simple alternating leg movement
    giraffe.frontLeftLeg.rotation.x = Math.sin(clock.elapsedTime * walkSpeed) * legSwingAngle;
    giraffe.backRightLeg.rotation.x = Math.sin(clock.elapsedTime * walkSpeed) * legSwingAngle;

    giraffe.frontRightLeg.rotation.x = Math.sin(clock.elapsedTime * walkSpeed + Math.PI) * legSwingAngle; // Opposite phase
    giraffe.backLeftLeg.rotation.x = Math.sin(clock.elapsedTime * walkSpeed + Math.PI) * legSwingAngle; // Opposite phase

    // Move the entire giraffe forward
    giraffe.position.x += 0.01; // Adjust speed as needed
    if (giraffe.position.x > 10) {
        giraffe.position.x = -10; // Reset position if it goes too far
    }

    // Neck bobbing (simple)
    giraffe.neck.rotation.x = Math.sin(clock.elapsedTime * walkSpeed * 0.5) * (Math.PI / 32);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();