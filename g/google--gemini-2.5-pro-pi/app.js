// Basic Three.js setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(2, 5, 5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Ground
const groundSize = 40;
const groundGeometry = new THREE.PlaneGeometry(20, groundSize);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 });
const ground1 = new THREE.Mesh(groundGeometry, groundMaterial);
ground1.rotation.x = -Math.PI / 2;
ground1.receiveShadow = true;
scene.add(ground1);

const ground2 = new THREE.Mesh(groundGeometry, groundMaterial);
ground2.rotation.x = -Math.PI / 2;
ground2.receiveShadow = true;
ground2.position.z = -groundSize;
scene.add(ground2);

// Trees
const treeGroup = new THREE.Group();
scene.add(treeGroup);
const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x006400 });

function createTree(x, z) {
    const tree = new THREE.Group();
    
    const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2, 8);
    const trunk = new THREE.Mesh(trunkGeometry, treeMaterial);
    trunk.castShadow = true;
    trunk.position.y = 1;
    tree.add(trunk);

    const leavesGeometry = new THREE.SphereGeometry(1, 8, 8);
    const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
    leaves.castShadow = true;
    leaves.position.y = 2.5;
    tree.add(leaves);

    tree.position.set(x, 0, z);
    return tree;
}

function addTrees(group, area) {
    for (let i = 0; i < 20; i++) {
        const x = (Math.random() - 0.5) * 18;
        const z = (Math.random() - 0.5) * area;
        const tree = createTree(x, z);
        group.add(tree);
    }
}

const treeGroup1 = new THREE.Group();
addTrees(treeGroup1, groundSize);
scene.add(treeGroup1);

const treeGroup2 = new THREE.Group();
addTrees(treeGroup2, groundSize);
treeGroup2.position.z = -groundSize;
scene.add(treeGroup2);



// Giraffe group
const giraffe = new THREE.Group();
giraffe.rotation.y = Math.PI;
scene.add(giraffe);

// Giraffe materials
const giraffeMaterial = new THREE.MeshStandardMaterial({ color: 0xFFC107 });


// Torso
const torsoGeometry = new THREE.BoxGeometry(1, 1.2, 2.5);
const torso = new THREE.Mesh(torsoGeometry, giraffeMaterial);
torso.position.y = 2.2;
torso.castShadow = true;
giraffe.add(torso);

const backTorsoGeometry = new THREE.BoxGeometry(1, 1.2, 1);
const backTorso = new THREE.Mesh(backTorsoGeometry, giraffeMaterial);
backTorso.position.set(0, -0.2, 1.5);
backTorso.rotation.x = -Math.PI / 16;
torso.add(backTorso);


// Neck
const neckGeometry = new THREE.BoxGeometry(0.4, 2, 0.4);
const neck = new THREE.Mesh(neckGeometry, giraffeMaterial);
neck.position.set(0, 1, -1.0);
neck.rotation.x = Math.PI / 4;
torso.add(neck); // Attach neck to torso

// Head
const headGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.8);
const head = new THREE.Mesh(headGeometry, giraffeMaterial);
head.position.y = 1.2;
neck.add(head);

// Horns
const hornGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
const leftHorn = new THREE.Mesh(hornGeometry, giraffeMaterial);
leftHorn.position.set(-0.2, 0.3, -0.2);
head.add(leftHorn);

const rightHorn = new THREE.Mesh(hornGeometry, giraffeMaterial);
rightHorn.position.set(0.2, 0.3, -0.2);
head.add(rightHorn);

// Ears
const earGeometry = new THREE.BoxGeometry(0.1, 0.3, 0.2);
const leftEar = new THREE.Mesh(earGeometry, giraffeMaterial);
leftEar.position.set(-0.4, 0.1, -0.1);
head.add(leftEar);

const rightEar = new THREE.Mesh(earGeometry, giraffeMaterial);
rightEar.position.set(0.4, 0.1, -0.1);
head.add(rightEar);

// Snout
const snoutGeometry = new THREE.BoxGeometry(0.4, 0.3, 0.3);
const snout = new THREE.Mesh(snoutGeometry, giraffeMaterial);
snout.position.set(0, -0.15, 0.5);
head.add(snout);

// Tail
const tailGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
const tail = new THREE.Mesh(tailGeometry, giraffeMaterial);
tail.position.set(0, 0.5, 1.2);
tail.rotation.x = Math.PI / 2;
torso.add(tail);

// Legs
function createLeg() {
    const upperLegGeometry = new THREE.CylinderGeometry(0.15, 0.1, 1.2, 8);
    const upperLeg = new THREE.Mesh(upperLegGeometry, giraffeMaterial);
    upperLeg.castShadow = true;
    
    const lowerLegGeometry = new THREE.CylinderGeometry(0.1, 0.08, 1, 8);
    const lowerLeg = new THREE.Mesh(lowerLegGeometry, giraffeMaterial);
    lowerLeg.position.y = -1.0;
    
    upperLeg.add(lowerLeg);

    return upperLeg;
}

const frontLeftLeg = createLeg();
frontLeftLeg.position.set(-0.4, 0, -0.8);
const frontRightLeg = createLeg();
frontRightLeg.position.set(0.4, 0, -0.8);
const backLeftLeg = createLeg();
backLeftLeg.position.set(-0.4, 0, 0.8);
const backRightLeg = createLeg();
backRightLeg.position.set(0.4, 0, 0.8);

const legs = [frontLeftLeg, frontRightLeg, backLeftLeg, backRightLeg];

torso.add(frontLeftLeg);
torso.add(frontRightLeg);
torso.add(backLeftLeg);
torso.add(backRightLeg);


camera.position.set(4, 3, 5);
camera.lookAt(giraffe.position);

const clock = new THREE.Clock();

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    // Animate legs
    const legSwingAngle = Math.sin(time * 4) * 0.4;
    legs[0].rotation.x = legSwingAngle;
    legs[3].rotation.x = legSwingAngle;
    legs[1].rotation.x = -legSwingAngle;
    legs[2].rotation.x = -legSwingAngle;

    // Move giraffe forward
    giraffe.position.z -= delta * 1.5;

    // Bobbing motion
    giraffe.position.y = Math.sin(time * 4) * 0.1;

    // Animate neck and tail
    neck.rotation.z = Math.sin(time * 2) * 0.05;
    tail.rotation.y = Math.sin(time * 3) * 0.5;

    // Infinite world
    if (giraffe.position.z < ground1.position.z - groundSize / 2) {
        ground2.position.z = ground1.position.z - groundSize;
        treeGroup2.position.z = ground1.position.z - groundSize;
    }
    if (giraffe.position.z < ground2.position.z - groundSize / 2) {
        ground1.position.z = ground2.position.z - groundSize;
        treeGroup1.position.z = ground2.position.z - groundSize;
    }


    // Camera follow
    camera.position.z = giraffe.position.z - 5;
    camera.lookAt(giraffe.position);


    renderer.render(scene, camera);
}

animate();
