let scene, camera, renderer, controls;
let giraffe, body, neck, head;
let frontLeftLeg, frontRightLeg, backLeftLeg, backRightLeg;
let mixer;

function createSpottedMaterial() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');

    context.fillStyle = '#f0e68c'; // Base khaki color
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw some random spots
    context.fillStyle = '#8b4513'; // Brown for spots
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = 5 + Math.random() * 5;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    return new THREE.MeshLambertMaterial({ map: texture });
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // OrbitControls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = Math.PI / 2;

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Brown ground
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    giraffe = new THREE.Group();
    giraffe.position.y = -0.75; // Adjust giraffe's overall height
    scene.add(giraffe);

    const spottedMaterial = createSpottedMaterial();

    // Giraffe Body
    const bodyGeometry = new THREE.BoxGeometry(1.5, 1, 3);
    body = new THREE.Mesh(bodyGeometry, spottedMaterial);
    body.position.y = 1.5;
    giraffe.add(body);

    // Giraffe Neck (child of body)
    const neckGeometry = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
    neck = new THREE.Mesh(neckGeometry, spottedMaterial);
    neck.position.set(0, 2, -1); // Relative to body
    neck.rotation.x = -Math.PI / 8; // Slightly angled forward
    body.add(neck);

    // Giraffe Head (child of neck)
    const headGeometry = new THREE.BoxGeometry(0.7, 0.7, 1);
    head = new THREE.Mesh(headGeometry, spottedMaterial);
    head.position.set(0, 2, -0.5); // Relative to neck
    head.rotation.x = -Math.PI / 10;
    neck.add(head);

    // Giraffe Ears (child of head)
    const earGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.1);
    const earMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Brown ears

    const leftEar = new THREE.Mesh(earGeometry, earMaterial);
    leftEar.position.set(-0.3, 0.4, 0);
    head.add(leftEar);

    const rightEar = new THREE.Mesh(earGeometry, earMaterial);
    rightEar.position.set(0.3, 0.4, 0);
    head.add(rightEar);

    // Giraffe Horns (Ossicones) (child of head)
    const hornGeometry = new THREE.CylinderGeometry(0.08, 0.15, 0.5, 8);
    const hornMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 }); // Brown horns

    const leftHorn = new THREE.Mesh(hornGeometry, hornMaterial);
    leftHorn.position.set(-0.2, 0.7, -0.2);
    head.add(leftHorn);

    const rightHorn = new THREE.Mesh(hornGeometry, hornMaterial);
    rightHorn.position.set(0.2, 0.7, -0.2);
    head.add(rightHorn);

    // Giraffe Legs (children of body)
    const legGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2.5, 8);
    const legMaterial = spottedMaterial;

    frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
    frontLeftLeg.position.set(-0.5, -0.75, 1); // Relative to body
    body.add(frontLeftLeg);

    frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
    frontRightLeg.position.set(0.5, -0.75, 1); // Relative to body
    body.add(frontRightLeg);

    backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
    backLeftLeg.position.set(-0.5, -0.75, -1); // Relative to body
    body.add(backLeftLeg);

    backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
    backRightLeg.position.set(0.5, -0.75, -1); // Relative to body
    body.add(backRightLeg);

    camera.position.set(0, 5, 10);
    camera.lookAt(0, 2, 0);

    let clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        controls.update(); // only required if controls.enableDamping is set to true

        let delta = clock.getDelta();
        const elapsedTime = clock.elapsedTime;

        // Simple leg animation
        const legSwingAngle = Math.sin(elapsedTime * 5) * 0.2;
        frontLeftLeg.rotation.x = legSwingAngle;
        backRightLeg.rotation.x = legSwingAngle;
        frontRightLeg.rotation.x = -legSwingAngle;
        backLeftLeg.rotation.x = -legSwingAngle;

        // Head bob animation
        head.position.y = 2 + Math.sin(elapsedTime * 3) * 0.05; // Relative to neck

        // Giraffe movement
        giraffe.position.z -= 0.05; // Move forward

        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

init();