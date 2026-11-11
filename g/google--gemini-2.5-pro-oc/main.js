// Basic scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 15);
camera.lookAt(0, 5, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Ground
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22 }); // Forest green
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function createGiraffe() {
    const giraffe = new THREE.Group();

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(2, 5, 1.5);
    const torsoMaterial = new THREE.MeshStandardMaterial({ color: 0xFFC107 });
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.position.y = 3.5;
    torso.castShadow = true;
    giraffe.add(torso);

    // Neck
    const neckGeometry = new THREE.BoxGeometry(0.75, 6, 0.75);
    const neckMaterial = new THREE.MeshStandardMaterial({ color: 0xFFC107 });
    const neck = new THREE.Mesh(neckGeometry, neckMaterial);
    neck.position.set(0, 7, -1);
    neck.rotation.x = Math.PI / 4;
    neck.castShadow = true;
    giraffe.add(neck);

    // Head
    const headGeometry = new THREE.BoxGeometry(1, 1, 1.5);
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xFFC107 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(0, 9.5, -0.5);
    head.castShadow = true;
    giraffe.add(head);

    function createLeg(x, z) {
        const leg = new THREE.Group();
        leg.position.set(x, 2, z);

        const legGroup = new THREE.Group();
        legGroup.position.y = 2.5;
        leg.add(legGroup);

        const upperLegGeometry = new THREE.BoxGeometry(0.5, 2.5, 0.5);
        const legMaterial = new THREE.MeshStandardMaterial({ color: 0xD2691E });
        const upperLeg = new THREE.Mesh(upperLegGeometry, legMaterial);
        upperLeg.position.y = -1.25;
        upperLeg.castShadow = true;
        legGroup.add(upperLeg);
        
        const lowerLeg = upperLeg.clone();
        lowerLeg.position.y = -3.75;
        legGroup.add(lowerLeg);
        
        return {leg: leg, legGroup: legGroup};
    }

    const frontLeftLegParts = createLeg(-0.75, 2);
    giraffe.add(frontLeftLegParts.leg);

    const frontRightLegParts = createLeg(0.75, 2);
    giraffe.add(frontRightLegParts.leg);

    const backLeftLegParts = createLeg(-0.75, -2);
    giraffe.add(backLeftLegParts.leg);

    const backRightLegParts = createLeg(0.75, -2);
    giraffe.add(backRightLegParts.leg);

    giraffe.frontLeftLeg = frontLeftLegParts.legGroup;
    giraffe.frontRightLeg = frontRightLegParts.legGroup;
    giraffe.backLeftLeg = backLeftLegParts.legGroup;
    giraffe.backRightLeg = backRightLegParts.legGroup;

    return giraffe;
}

const giraffe = createGiraffe();
scene.add(giraffe);


// Render loop
function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.001;
    const walkSpeed = 1;
    const walkAngle = Math.sin(time * walkSpeed * 5) * 0.4;

    giraffe.frontLeftLeg.rotation.x = walkAngle;
    giraffe.backRightLeg.rotation.x = walkAngle;
    giraffe.frontRightLeg.rotation.x = -walkAngle;
    giraffe.backLeftLeg.rotation.x = -walkAngle;

    giraffe.position.z += walkSpeed * 0.05;
    if (giraffe.position.z > 50) {
        giraffe.position.z = -50;
    }

    renderer.render(scene, camera);
}

animate();
