// Main Three.js variables
let scene, camera, renderer, giraffe, clock;
let ground;

// Body parts references for animation
let neck, head, frontLegs = [], backLegs = [];

init();
animate();

function init() {
    // Create scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87CEEB, 15, 30);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 15);
    camera.lookAt(0, 4, 0);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);
    
    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x90EE90,
        roughness: 0.9,
    });
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Add some simple trees for reference
    for (let i = 0; i < 20; i++) {
        const tree = createTree();
        tree.position.x = (Math.random() - 0.5) * 40;
        tree.position.z = (Math.random() - 0.5) * 40;
        tree.position.y = 0;
        scene.add(tree);
    }
    
    // Create the giraffe
    createGiraffe();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
    
    // Initialize clock for animation
    clock = new THREE.Clock();
}

function createGiraffe() {
    giraffe = new THREE.Group();
    
    // Body (torso)
    const bodyGeometry = new THREE.CylinderGeometry(1.2, 1.5, 4, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffcc66,
        roughness: 0.7 
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    giraffe.add(body);
    
    // Chest spot
    const chestSpotGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const chestSpotMaterial = new THREE.MeshStandardMaterial({ color: 0xaa5500 });
    const chestSpot = new THREE.Mesh(chestSpotGeometry, chestSpotMaterial);
    chestSpot.position.x = 1.8;
    chestSpot.castShadow = true;
    body.add(chestSpot);
    
    // Neck
    const neckGroup = new THREE.Group();
    neckGroup.position.x = -2.5;
    
    const neckGeometry = new THREE.CylinderGeometry(0.6, 0.7, 4, 6);
    const neckMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffcc66,
        roughness: 0.7 
    });
    neck = new THREE.Mesh(neckGeometry, neckMaterial);
    neck.rotation.z = -0.2;
    neck.position.x = 1.5;
    neck.castShadow = true;
    neckGroup.add(neck);
    
    // Head
    const headGroup = new THREE.Group();
    headGroup.position.x = 3.2;
    headGroup.position.y = 0.3;
    headGroup.rotation.z = 0.3;
    
    // Main head
    const headGeometry = new THREE.BoxGeometry(1.2, 1, 1);
    const headMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffcc66,
        roughness: 0.7 
    });
    head = new THREE.Mesh(headGeometry, headMaterial);
    head.castShadow = true;
    headGroup.add(head);
    
    // Snout
    const snoutGeometry = new THREE.BoxGeometry(0.8, 0.5, 0.6);
    const snoutMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xe6b858,
        roughness: 0.7 
    });
    const snout = new THREE.Mesh(snoutGeometry, snoutMaterial);
    snout.position.x = 0.8;
    snout.position.y = -0.1;
    snout.castShadow = true;
    headGroup.add(snout);
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(0.5, 0.2, 0.3);
    headGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.5, 0.2, -0.3);
    headGroup.add(rightEye);
    
    // Horns (ossicones)
    const hornGeometry = new THREE.CylinderGeometry(0.1, 0.05, 0.8, 6);
    const hornMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc66 });
    
    const leftHorn = new THREE.Mesh(hornGeometry, hornMaterial);
    leftHorn.position.set(-0.2, 0.4, 0.3);
    leftHorn.rotation.z = -0.2;
    leftHorn.castShadow = true;
    headGroup.add(leftHorn);
    
    const rightHorn = new THREE.Mesh(hornGeometry, hornMaterial);
    rightHorn.position.set(-0.2, 0.4, -0.3);
    rightHorn.rotation.z = -0.2;
    rightHorn.castShadow = true;
    headGroup.add(rightHorn);
    
    // Ears
    const earGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.2);
    const earMaterial = new THREE.MeshStandardMaterial({ color: 0xe6b858 });
    
    const leftEar = new THREE.Mesh(earGeometry, earMaterial);
    leftEar.position.set(-0.4, 0, 0.5);
    leftEar.rotation.z = 0.3;
    headGroup.add(leftEar);
    
    const rightEar = new THREE.Mesh(earGeometry, earMaterial);
    rightEar.position.set(-0.4, 0, -0.5);
    rightEar.rotation.z = -0.3;
    headGroup.add(rightEar);
    
    neckGroup.add(headGroup);
    giraffe.add(neckGroup);
    
    // Legs
    const legGeometry = new THREE.CylinderGeometry(0.3, 0.35, 3, 8);
    const legMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffcc66,
        roughness: 0.7 
    });
    
    // Front legs
    const frontLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
    frontLeftLeg.position.set(1, -2.5, 0.8);
    frontLeftLeg.castShadow = true;
    giraffe.add(frontLeftLeg);
    frontLegs.push(frontLeftLeg);
    
    const frontRightLeg = new THREE.Mesh(legGeometry, legMaterial);
    frontRightLeg.position.set(1, -2.5, -0.8);
    frontRightLeg.castShadow = true;
    giraffe.add(frontRightLeg);
    frontLegs.push(frontRightLeg);
    
    // Back legs
    const backLeftLeg = new THREE.Mesh(legGeometry, legMaterial);
    backLeftLeg.position.set(-1, -2.5, 0.8);
    backLeftLeg.castShadow = true;
    giraffe.add(backLeftLeg);
    backLegs.push(backLeftLeg);
    
    const backRightLeg = new THREE.Mesh(legGeometry, legMaterial);
    backRightLeg.position.set(-1, -2.5, -0.8);
    backRightLeg.castShadow = true;
    giraffe.add(backRightLeg);
    backLegs.push(backRightLeg);
    
    // Feet
    const footGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
    const footMaterial = new THREE.MeshStandardMaterial({ color: 0xaa5500 });
    
    for (let leg of [...frontLegs, ...backLegs]) {
        const foot = new THREE.Mesh(footGeometry, footMaterial);
        foot.position.y = -1.5;
        foot.castShadow = true;
        leg.add(foot);
    }
    
    // Tail
    const tailGroup = new THREE.Group();
    tailGroup.position.set(-1.8, 0, 0);
    
    const tailGeometry = new THREE.CylinderGeometry(0.1, 0.15, 2, 6);
    const tailMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffcc66,
        roughness: 0.7 
    });
    const tail = new THREE.Mesh(tailGeometry, tailMaterial);
    tail.rotation.z = 0.5;
    tail.position.x = -0.8;
    tail.castShadow = true;
    tailGroup.add(tail);
    
    // Tail tuft
    const tuftGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const tuftMaterial = new THREE.MeshStandardMaterial({ color: 0xaa5500 });
    const tuft = new THREE.Mesh(tuftGeometry, tuftMaterial);
    tuft.position.set(-1.7, -0.2, 0);
    tailGroup.add(tuft);
    
    giraffe.add(tailGroup);
    
    // Spots on body
    createSpots(giraffe);
    
    scene.add(giraffe);
    giraffe.position.y = 2;
}

function createSpots(parent) {
    const spotGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const spotMaterial = new THREE.MeshStandardMaterial({ color: 0xaa5500 });
    
    // Generate random spots on the body
    for (let i = 0; i < 15; i++) {
        const spot = new THREE.Mesh(spotGeometry, spotMaterial);
        
        // Random position on body
        spot.position.x = (Math.random() - 0.5) * 3;
        spot.position.y = (Math.random() - 0.5) * 2;
        spot.position.z = (Math.random() - 0.5) * 1;
        
        // Random scale
        const scale = 0.5 + Math.random() * 0.8;
        spot.scale.set(scale, scale, scale);
        
        parent.add(spot);
    }
}

function createTree() {
    const tree = new THREE.Group();
    
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 3, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    tree.add(trunk);
    
    // Leaves
    const leavesGeometry = new THREE.SphereGeometry(2, 6, 6);
    const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2E8B57 });
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.position.y = 4;
    leaves.castShadow = true;
    tree.add(leaves);
    
    return tree;
}

function animateGiraffe() {
    const time = clock.getElapsedTime();
    
    // Walking motion - legs moving in opposite pairs
    const walkSpeed = 3;
    const legSwing = 0.3;
    
    // Front left and back right legs move together
    frontLegs[0].rotation.z = Math.sin(time * walkSpeed) * legSwing;
    backLegs[1].rotation.z = Math.sin(time * walkSpeed) * legSwing;
    
    // Front right and back left legs move together (opposite phase)
    frontLegs[1].rotation.z = Math.sin(time * walkSpeed + Math.PI) * legSwing;
    backLegs[0].rotation.z = Math.sin(time * walkSpeed + Math.PI) * legSwing;
    
    // Head bobbing
    const headBob = Math.sin(time * walkSpeed * 2) * 0.05;
    head.rotation.z = 0.3 + headBob;
    
    // Neck movement
    neck.rotation.z = -0.2 + headBob * 0.5;
    
    // Tail swaying
    giraffe.children[giraffe.children.length - 1].rotation.y = Math.sin(time * 2) * 0.2;
    
    // Move giraffe forward
    giraffe.position.z -= 0.05;
    
    // Rotate slightly for natural movement
    giraffe.rotation.y = Math.sin(time * 0.5) * 0.1;
    
    // Loop the giraffe's path
    if (giraffe.position.z < -20) {
        giraffe.position.z = 10;
    }
    
    // Camera follows giraffe
    camera.position.x = giraffe.position.x - 10;
    camera.position.y = giraffe.position.y + 3;
    camera.position.z = giraffe.position.z;
    camera.lookAt(giraffe.position.x, giraffe.position.y + 2, giraffe.position.z);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    if (giraffe) {
        animateGiraffe();
    }
    
    renderer.render(scene, camera);
}