import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();

// Sky gradient background
const skyColor = 0x87CEEB;
const horizonColor = 0xE6F3FF;
scene.background = new THREE.Color(skyColor);
scene.fog = new THREE.Fog(horizonColor, 50, 200);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(15, 8, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(2.5, 3, -1.5);
controls.minDistance = 5;
controls.maxDistance = 40;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e6, 0.8);
sunLight.position.set(50, 50, 30);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
scene.add(sunLight);

// Visual sun in the sky
const sunGeometry = new THREE.SphereGeometry(3, 16, 16);
const sunMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffff00,
    fog: false 
});
const sun = new THREE.Mesh(sunGeometry, sunMaterial);
sun.position.set(50, 40, 30);
scene.add(sun);

// Sun glow
const glowGeometry = new THREE.SphereGeometry(4.5, 16, 16);
const glowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffdd44,
    transparent: true,
    opacity: 0.3,
    fog: false
});
const glow = new THREE.Mesh(glowGeometry, glowMaterial);
glow.position.set(50, 40, 30);
scene.add(glow);

// Ground with variation
const groundGeometry = new THREE.PlaneGeometry(200, 200, 50, 50);
const vertices = groundGeometry.attributes.position;
for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i);
    const z = vertices.getZ(i);
    // Add subtle terrain variation
    const height = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 0.3;
    vertices.setZ(i, height);
}
groundGeometry.computeVertexNormals();

const groundMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x8B7355,
    side: THREE.DoubleSide 
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Add dirt patches
for (let i = 0; i < 10; i++) {
    const patchGeometry = new THREE.CircleGeometry(2 + Math.random() * 3, 16);
    const patchMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x6B5344,
        transparent: true,
        opacity: 0.6
    });
    const patch = new THREE.Mesh(patchGeometry, patchMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(
        (Math.random() - 0.5) * 80,
        0.02,
        (Math.random() - 0.5) * 80
    );
    patch.receiveShadow = true;
    scene.add(patch);
}

// Add some grass texture variation with multiple layers
for (let i = 0; i < 3; i++) {
    const grassGeometry = new THREE.PlaneGeometry(200, 200, 20, 20);
    const vertices = grassGeometry.attributes.position;
    for (let j = 0; j < vertices.count; j++) {
        vertices.setY(j, Math.random() * 0.1);
    }
    grassGeometry.computeVertexNormals();
    
    const grassMaterial = new THREE.MeshLambertMaterial({ 
        color: i === 0 ? 0x9ACD32 : (i === 1 ? 0x7CB342 : 0x8BC34A),
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide 
    });
    const grass = new THREE.Mesh(grassGeometry, grassMaterial);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = 0.01 + i * 0.005;
    grass.receiveShadow = true;
    scene.add(grass);
}

// Trees for environment - Acacia-style trees
function createTree(x, z, isAcacia = false) {
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 8);
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.set(x, 2, z);
    trunk.castShadow = true;
    scene.add(trunk);

    if (isAcacia) {
        // Flat-topped acacia tree
        const foliageGeometry = new THREE.CylinderGeometry(3, 1.5, 2, 8);
        const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x3A5F0B });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(x, 5, z);
        foliage.castShadow = true;
        scene.add(foliage);
        
        // Add some branches
        for (let i = 0; i < 3; i++) {
            const branchGeometry = new THREE.CylinderGeometry(0.15, 0.15, 2, 6);
            const branch = new THREE.Mesh(branchGeometry, trunkMaterial);
            const angle = (i / 3) * Math.PI * 2;
            branch.position.set(
                x + Math.cos(angle) * 1.5,
                4.5,
                z + Math.sin(angle) * 1.5
            );
            branch.rotation.z = Math.cos(angle) * 0.5;
            branch.rotation.x = Math.sin(angle) * 0.5;
            branch.castShadow = true;
            scene.add(branch);
        }
    } else {
        // Regular tree
        const foliageGeometry = new THREE.SphereGeometry(2, 8, 8);
        const foliageMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(x, 5, z);
        foliage.castShadow = true;
        foliage.scale.set(1, 1.2, 1);
        scene.add(foliage);
    }
}

// Place some trees - mix of regular and acacia
createTree(-15, -10, true);
createTree(-12, 8, false);
createTree(18, -5, true);
createTree(20, 12, false);
createTree(-18, 15, true);
createTree(10, -15, false);
createTree(-20, -8, true);
createTree(15, 18, false);
createTree(-8, 20, true);
createTree(25, -12, true);

// Add some rocks
function createRock(x, z, scale) {
    const rockGeometry = new THREE.DodecahedronGeometry(0.5, 0);
    const rockMaterial = new THREE.MeshLambertMaterial({ color: 0x696969 });
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(x, 0.3 * scale, z);
    rock.scale.set(scale, scale * 0.6, scale);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
}

createRock(5, 8, 1.2);
createRock(-8, -5, 0.8);
createRock(12, 3, 1.5);
createRock(-3, 12, 1.0);
createRock(8, -8, 0.9);

// Add grass clumps
function createGrassClump(x, z) {
    const clumpGroup = new THREE.Group();
    const grassMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x4CAF50,
        side: THREE.DoubleSide
    });
    
    for (let i = 0; i < 15; i++) {
        const bladeGeometry = new THREE.PlaneGeometry(0.1, 0.5);
        const blade = new THREE.Mesh(bladeGeometry, grassMaterial);
        blade.position.set(
            (Math.random() - 0.5) * 0.5,
            0.25,
            (Math.random() - 0.5) * 0.5
        );
        blade.rotation.y = Math.random() * Math.PI;
        blade.rotation.x = (Math.random() - 0.5) * 0.3;
        clumpGroup.add(blade);
    }
    
    clumpGroup.position.set(x, 0, z);
    scene.add(clumpGroup);
}

// Scatter grass clumps
for (let i = 0; i < 30; i++) {
    createGrassClump(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40
    );
}

// Add distant hills
const hillGeometry = new THREE.SphereGeometry(20, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
const hillMaterial = new THREE.MeshLambertMaterial({ 
    color: 0x6B8E23,
    flatShading: true 
});

function createHill(x, z, scaleX, scaleZ) {
    const hill = new THREE.Mesh(hillGeometry, hillMaterial);
    hill.position.set(x, 0, z);
    hill.scale.set(scaleX, 1, scaleZ);
    hill.receiveShadow = true;
    scene.add(hill);
}

createHill(-50, -40, 1.5, 1.2);
createHill(60, -30, 1.8, 1.5);
createHill(-40, 50, 1.3, 1.6);
createHill(50, 45, 1.6, 1.4);

// Add clouds
function createCloud(x, y, z) {
    const cloudGroup = new THREE.Group();
    const cloudMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
    });
    
    // Multiple spheres to form a cloud
    for (let i = 0; i < 5; i++) {
        const size = 2 + Math.random() * 2;
        const cloudPart = new THREE.Mesh(
            new THREE.SphereGeometry(size, 8, 8),
            cloudMaterial
        );
        cloudPart.position.set(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 4
        );
        cloudGroup.add(cloudPart);
    }
    
    cloudGroup.position.set(x, y, z);
    scene.add(cloudGroup);
    return cloudGroup;
}

const clouds = [];
clouds.push(createCloud(-30, 25, -40));
clouds.push(createCloud(40, 30, -50));
clouds.push(createCloud(-20, 28, 30));
clouds.push(createCloud(35, 27, 40));
clouds.push(createCloud(0, 32, -60));

// Add birds
class Bird {
    constructor(x, y, z) {
        this.group = new THREE.Group();
        
        const bodyGeometry = new THREE.SphereGeometry(0.2, 6, 6);
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.scale.set(1, 0.8, 1.5);
        this.group.add(body);
        
        // Wings
        const wingGeometry = new THREE.BoxGeometry(0.8, 0.05, 0.3);
        this.leftWing = new THREE.Mesh(wingGeometry, bodyMaterial);
        this.leftWing.position.set(-0.4, 0, 0);
        this.group.add(this.leftWing);
        
        this.rightWing = new THREE.Mesh(wingGeometry, bodyMaterial);
        this.rightWing.position.set(0.4, 0, 0);
        this.group.add(this.rightWing);
        
        this.group.position.set(x, y, z);
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0.3 + Math.random() * 0.2;
        this.radius = 20 + Math.random() * 15;
        this.height = y;
        this.flapSpeed = 8 + Math.random() * 4;
        
        scene.add(this.group);
    }
    
    animate(time) {
        // Circular flight path
        this.angle += 0.005 * this.speed;
        this.group.position.x = Math.cos(this.angle) * this.radius;
        this.group.position.z = Math.sin(this.angle) * this.radius;
        this.group.position.y = this.height + Math.sin(time * 0.5) * 2;
        
        // Face direction of travel
        this.group.rotation.y = this.angle + Math.PI / 2;
        
        // Flap wings
        const flap = Math.sin(time * this.flapSpeed) * 0.5;
        this.leftWing.rotation.z = flap;
        this.rightWing.rotation.z = -flap;
    }
}

const birds = [];
for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const radius = 25 + Math.random() * 10;
    birds.push(new Bird(
        Math.cos(angle) * radius,
        15 + Math.random() * 8,
        Math.sin(angle) * radius
    ));
}

// Add ambient particles (dust motes, insects)
const particleCount = 100;
const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(particleCount * 3);
const particleVelocities = [];

for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 40;
    particlePositions[i * 3 + 1] = Math.random() * 15;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    
    particleVelocities.push({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.01,
        z: (Math.random() - 0.5) * 0.02
    });
}

particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
const particleMaterial = new THREE.PointsMaterial({ 
    color: 0xffffff,
    size: 0.1,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true
});
const particles = new THREE.Points(particleGeometry, particleMaterial);
scene.add(particles);

// Giraffe class
class Giraffe {
    constructor() {
        this.group = new THREE.Group();
        this.walkCycle = 0;
        this.walkSpeed = 0.02;
        
        // Materials
        this.bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xDAA520,
            roughness: 0.8,
            metalness: 0.1
        });
        
        this.spotMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x8B4513,
            roughness: 0.9,
            metalness: 0.1
        });
        
        this.createBody();
        this.createLegs();
        this.createNeck();
        this.createHead();
        this.createTail();
        this.addSpots();
        
        scene.add(this.group);
    }
    
    createBody() {
        // Main body - more realistic proportions
        const bodyGeometry = new THREE.BoxGeometry(2.5, 2, 4);
        const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
        body.position.set(0, 4.5, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        this.body = body;
        this.group.add(body);
        
        // Chest (front body wider)
        const chestGeometry = new THREE.BoxGeometry(2.8, 2.2, 2);
        const chest = new THREE.Mesh(chestGeometry, this.bodyMaterial);
        chest.position.set(0, 4.6, -1.8);
        chest.castShadow = true;
        chest.receiveShadow = true;
        this.group.add(chest);
        
        // Rump
        const rumpGeometry = new THREE.BoxGeometry(2.2, 1.8, 1.5);
        const rump = new THREE.Mesh(rumpGeometry, this.bodyMaterial);
        rump.position.set(0, 4.4, 1.8);
        rump.castShadow = true;
        this.group.add(rump);
    }
    
    createLegs() {
        this.legs = [];
        
        // Leg positions: front-left, front-right, back-left, back-right
        const legPositions = [
            { x: -0.9, z: -1.5 },  // front-left
            { x: 0.9, z: -1.5 },   // front-right
            { x: -0.8, z: 1.5 },   // back-left
            { x: 0.8, z: 1.5 }     // back-right
        ];
        
        legPositions.forEach((pos, index) => {
            const legGroup = new THREE.Group();
            
            // Upper leg
            const upperLegGeometry = new THREE.CylinderGeometry(0.25, 0.28, 2.5, 8);
            const upperLeg = new THREE.Mesh(upperLegGeometry, this.bodyMaterial);
            upperLeg.position.y = -1.25;
            upperLeg.castShadow = true;
            legGroup.add(upperLeg);
            
            // Knee joint
            const kneeGeometry = new THREE.SphereGeometry(0.3, 8, 8);
            const knee = new THREE.Mesh(kneeGeometry, this.bodyMaterial);
            knee.position.y = -2.5;
            knee.castShadow = true;
            legGroup.add(knee);
            
            // Lower leg
            const lowerLegGeometry = new THREE.CylinderGeometry(0.2, 0.22, 2.5, 8);
            const lowerLeg = new THREE.Mesh(lowerLegGeometry, this.bodyMaterial);
            lowerLeg.position.y = -3.75;
            lowerLeg.castShadow = true;
            legGroup.add(lowerLeg);
            
            // Hoof
            const hoofGeometry = new THREE.CylinderGeometry(0.25, 0.2, 0.3, 8);
            const hoof = new THREE.Mesh(hoofGeometry, this.spotMaterial);
            hoof.position.y = -5.15;
            hoof.castShadow = true;
            legGroup.add(hoof);
            
            legGroup.position.set(pos.x, 4.5, pos.z);
            this.legs.push(legGroup);
            this.group.add(legGroup);
        });
    }
    
    createNeck() {
        const neckGroup = new THREE.Group();
        
        // Neck segments for smooth bending
        const neckSegments = 5;
        const segmentHeight = 1.2;
        this.neckSegments = [];
        
        for (let i = 0; i < neckSegments; i++) {
            const radius = 0.45 - (i * 0.03);
            const segmentGeometry = new THREE.CylinderGeometry(
                radius - 0.05, radius, segmentHeight, 8
            );
            const segment = new THREE.Mesh(segmentGeometry, this.bodyMaterial);
            segment.position.y = i * segmentHeight + segmentHeight / 2;
            segment.castShadow = true;
            segment.receiveShadow = true;
            neckGroup.add(segment);
            this.neckSegments.push(segment);
        }
        
        // Neck base thicker
        const neckBaseGeometry = new THREE.CylinderGeometry(0.55, 0.65, 0.8, 8);
        const neckBase = new THREE.Mesh(neckBaseGeometry, this.bodyMaterial);
        neckBase.position.y = -0.4;
        neckBase.castShadow = true;
        neckGroup.add(neckBase);
        
        neckGroup.position.set(0, 5.5, -1.8);
        neckGroup.rotation.x = -0.3; // Angle forward
        this.neck = neckGroup;
        this.group.add(neckGroup);
        
        // Add mane along the neck
        this.createMane(neckGroup);
    }
    
    createHead() {
        const headGroup = new THREE.Group();
        
        // Main head
        const headGeometry = new THREE.BoxGeometry(0.8, 1, 1.2);
        const head = new THREE.Mesh(headGeometry, this.bodyMaterial);
        head.castShadow = true;
        headGroup.add(head);
        
        // Snout
        const snoutGeometry = new THREE.BoxGeometry(0.7, 0.6, 0.8);
        const snout = new THREE.Mesh(snoutGeometry, this.bodyMaterial);
        snout.position.set(0, -0.3, 0.8);
        snout.castShadow = true;
        headGroup.add(snout);
        
        // Ears
        const earGeometry = new THREE.ConeGeometry(0.2, 0.6, 6);
        
        this.leftEar = new THREE.Mesh(earGeometry, this.bodyMaterial);
        this.leftEar.position.set(-0.4, 0.5, 0);
        this.leftEar.rotation.z = -0.3;
        this.leftEar.castShadow = true;
        headGroup.add(this.leftEar);
        
        this.rightEar = new THREE.Mesh(earGeometry, this.bodyMaterial);
        this.rightEar.position.set(0.4, 0.5, 0);
        this.rightEar.rotation.z = 0.3;
        this.rightEar.castShadow = true;
        headGroup.add(this.rightEar);
        
        // Ossicones (horn-like protrusions)
        const ossiconeGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.6, 6);
        
        const leftOssicone = new THREE.Mesh(ossiconeGeometry, this.spotMaterial);
        leftOssicone.position.set(-0.25, 0.7, -0.1);
        leftOssicone.castShadow = true;
        headGroup.add(leftOssicone);
        
        const rightOssicone = new THREE.Mesh(ossiconeGeometry, this.spotMaterial);
        rightOssicone.position.set(0.25, 0.7, -0.1);
        rightOssicone.castShadow = true;
        headGroup.add(rightOssicone);
        
        // Eyes
        const eyeGeometry = new THREE.SphereGeometry(0.12, 8, 8);
        const eyeMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x000000,
            roughness: 0.2,
            metalness: 0.8
        });
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.35, 0.2, 0.5);
        headGroup.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.35, 0.2, 0.5);
        headGroup.add(rightEye);
        
        // Eye highlights for more life
        const highlightGeometry = new THREE.SphereGeometry(0.05, 6, 6);
        const highlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        const leftHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
        leftHighlight.position.set(-0.32, 0.25, 0.6);
        headGroup.add(leftHighlight);
        
        const rightHighlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
        rightHighlight.position.set(0.38, 0.25, 0.6);
        headGroup.add(rightHighlight);
        
        // Nostrils
        const nostrilGeometry = new THREE.SphereGeometry(0.08, 8, 8);
        const nostrilMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3020 });
        
        const leftNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial);
        leftNostril.position.set(-0.2, -0.2, 1.15);
        leftNostril.scale.z = 0.5;
        headGroup.add(leftNostril);
        
        const rightNostril = new THREE.Mesh(nostrilGeometry, nostrilMaterial);
        rightNostril.position.set(0.2, -0.2, 1.15);
        rightNostril.scale.z = 0.5;
        headGroup.add(rightNostril);
        
        headGroup.position.y = 6;
        headGroup.rotation.x = 0.2;
        this.head = headGroup;
        this.neck.add(headGroup);
    }
    
    createMane(neckGroup) {
        // Giraffe mane - short, stiff hairs along neck
        const maneSegments = 12;
        this.maneHairs = [];
        
        for (let i = 0; i < maneSegments; i++) {
            const hairGeometry = new THREE.CylinderGeometry(0.04, 0.02, 0.4, 4);
            const hair = new THREE.Mesh(hairGeometry, this.spotMaterial);
            
            const yPos = (i / maneSegments) * 5 + 0.5;
            hair.position.set(0, yPos, -0.15);
            hair.rotation.x = -0.2 + (Math.random() - 0.5) * 0.1;
            hair.rotation.z = (Math.random() - 0.5) * 0.2;
            hair.castShadow = true;
            
            neckGroup.add(hair);
            this.maneHairs.push(hair);
        }
    }
    
    createTail() {
        const tailGroup = new THREE.Group();
        
        // Tail segments
        const tailSegments = 3;
        for (let i = 0; i < tailSegments; i++) {
            const radius = 0.12 - (i * 0.02);
            const segmentGeometry = new THREE.CylinderGeometry(
                radius - 0.02, radius, 0.6, 6
            );
            const segment = new THREE.Mesh(segmentGeometry, this.bodyMaterial);
            segment.position.y = -i * 0.6 - 0.3;
            segment.rotation.x = i * 0.2;
            segment.castShadow = true;
            tailGroup.add(segment);
        }
        
        // Tail tuft
        const tuftGeometry = new THREE.SphereGeometry(0.25, 8, 8);
        const tuft = new THREE.Mesh(tuftGeometry, this.spotMaterial);
        tuft.position.y = -2;
        tuft.scale.set(0.6, 1, 0.6);
        tuft.castShadow = true;
        tailGroup.add(tuft);
        
        tailGroup.position.set(0, 5.5, 2.5);
        tailGroup.rotation.x = 0.5;
        this.tail = tailGroup;
        this.group.add(tailGroup);
    }
    
    addSpots() {
        // Add spot patterns to body - more realistic giraffe spots
        const addSpotToSurface = (x, y, z, rotation, size) => {
            const spotGeometry = new THREE.CircleGeometry(size, 6);
            const spot = new THREE.Mesh(spotGeometry, this.spotMaterial);
            spot.position.set(x, y, z);
            spot.rotation.set(rotation[0], rotation[1], rotation[2]);
            this.group.add(spot);
        };
        
        // Body spots - left side
        addSpotToSurface(-1.28, 5.2, -0.5, [0, 0.3, Math.PI/2], 0.35);
        addSpotToSurface(-1.25, 4.8, 0.5, [0, 0.2, Math.PI/2], 0.3);
        addSpotToSurface(-1.3, 4.2, 1.2, [0, 0.5, Math.PI/2], 0.4);
        addSpotToSurface(-1.27, 5.0, -1.0, [0, -0.4, Math.PI/2], 0.32);
        addSpotToSurface(-1.29, 4.5, -1.8, [0, 0.6, Math.PI/2], 0.38);
        addSpotToSurface(-1.26, 5.3, 1.5, [0, -0.3, Math.PI/2], 0.28);
        addSpotToSurface(-1.4, 5.5, -2.2, [0, 0.2, Math.PI/2], 0.35);
        addSpotToSurface(-1.35, 4.0, 0.0, [0, -0.1, Math.PI/2], 0.33);
        
        // Body spots - right side
        addSpotToSurface(1.28, 5.2, -0.5, [0, -0.3, -Math.PI/2], 0.35);
        addSpotToSurface(1.25, 4.8, 0.5, [0, -0.2, -Math.PI/2], 0.3);
        addSpotToSurface(1.3, 4.2, 1.2, [0, -0.5, -Math.PI/2], 0.4);
        addSpotToSurface(1.27, 5.0, -1.0, [0, 0.4, -Math.PI/2], 0.32);
        addSpotToSurface(1.29, 4.5, -1.8, [0, -0.6, -Math.PI/2], 0.38);
        addSpotToSurface(1.26, 5.3, 1.5, [0, 0.3, -Math.PI/2], 0.28);
        addSpotToSurface(1.4, 5.5, -2.2, [0, -0.2, -Math.PI/2], 0.35);
        addSpotToSurface(1.35, 4.0, 0.0, [0, 0.1, -Math.PI/2], 0.33);
        
        // Top spots
        addSpotToSurface(0, 5.52, 0, [Math.PI/2, 0, 0], 0.3);
        addSpotToSurface(0.5, 5.5, 0.8, [Math.PI/2, 0, 0], 0.35);
        addSpotToSurface(-0.4, 5.48, -0.7, [Math.PI/2, 0, 0], 0.28);
        addSpotToSurface(0.3, 5.5, -1.5, [Math.PI/2, 0, 0], 0.32);
        
        // Neck spots
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const height = (i % 3) * 1.2 + 6.5;
            const radius = 0.38;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const size = 0.15 + Math.random() * 0.1;
            
            const spotGeometry = new THREE.CircleGeometry(size, 6);
            const spot = new THREE.Mesh(spotGeometry, this.spotMaterial);
            spot.position.set(x, height, z);
            spot.lookAt(0, height, 0);
            this.neck.add(spot);
        }
        
        // Leg spots
        this.legs.forEach((leg, legIndex) => {
            for (let i = 0; i < 5; i++) {
                const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
                const height = -0.5 - i * 0.8;
                const radius = 0.26;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                const size = 0.12 + Math.random() * 0.08;
                
                const spotGeometry = new THREE.CircleGeometry(size, 5);
                const spot = new THREE.Mesh(spotGeometry, this.spotMaterial);
                spot.position.set(x, height, z);
                spot.lookAt(0, height, 0);
                leg.add(spot);
            }
        });
    }
    
    animate(time) {
        this.walkCycle += this.walkSpeed;
        
        // Realistic giraffe walk: uses a pacing gait
        // Both legs on one side move forward, then both on the other side
        // This is unique to giraffes!
        
        const legSwing = Math.PI / 5; // 36 degrees max swing
        const kneeFlexion = 0.15;
        
        // Calculate walk phase for each side
        const leftPhase = Math.sin(this.walkCycle);
        const rightPhase = Math.sin(this.walkCycle + Math.PI);
        
        // Front-left (index 0) - moves with back-left
        const fl_swing = leftPhase * legSwing;
        this.legs[0].rotation.x = fl_swing;
        // Add knee flexion when leg is lifted (forward swing)
        if (leftPhase > 0) {
            this.legs[0].children[2].rotation.x = leftPhase * kneeFlexion;
        } else {
            this.legs[0].children[2].rotation.x = 0;
        }
        
        // Front-right (index 1) - moves with back-right
        const fr_swing = rightPhase * legSwing;
        this.legs[1].rotation.x = fr_swing;
        if (rightPhase > 0) {
            this.legs[1].children[2].rotation.x = rightPhase * kneeFlexion;
        } else {
            this.legs[1].children[2].rotation.x = 0;
        }
        
        // Back-left (index 2) - moves with front-left
        this.legs[2].rotation.x = fl_swing * 0.9; // Slightly less swing
        if (leftPhase > 0) {
            this.legs[2].children[2].rotation.x = leftPhase * kneeFlexion * 0.8;
        } else {
            this.legs[2].children[2].rotation.x = 0;
        }
        
        // Back-right (index 3) - moves with front-right
        this.legs[3].rotation.x = fr_swing * 0.9;
        if (rightPhase > 0) {
            this.legs[3].children[2].rotation.x = rightPhase * kneeFlexion * 0.8;
        } else {
            this.legs[3].children[2].rotation.x = 0;
        }
        
        // Body bob (more pronounced)
        const bobAmount = 0.2;
        this.group.position.y = Math.abs(Math.sin(this.walkCycle * 2)) * bobAmount;
        
        // Body sway (side to side with the pacing gait)
        const swayAmount = 0.08;
        this.body.rotation.z = Math.sin(this.walkCycle) * swayAmount;
        
        // Neck sway - more fluid motion
        this.neck.rotation.z = Math.sin(this.walkCycle * 0.7) * 0.06;
        this.neck.rotation.y = Math.sin(this.walkCycle * 0.5) * 0.08;
        
        // Individual neck segment movement for more fluid motion
        this.neckSegments.forEach((segment, i) => {
            const factor = (i + 1) / this.neckSegments.length;
            segment.rotation.z = Math.sin(this.walkCycle * 0.7 + i * 0.2) * 0.02 * factor;
        });
        
        // Animate mane hairs
        if (this.maneHairs) {
            this.maneHairs.forEach((hair, i) => {
                hair.rotation.x = -0.2 + Math.sin(this.walkCycle * 2 + i * 0.3) * 0.08;
            });
        }
        
        // Head bob - more natural
        this.head.rotation.x = 0.2 + Math.sin(this.walkCycle * 1.5) * 0.08;
        this.head.rotation.y = Math.sin(this.walkCycle * 0.6) * 0.05;
        
        // Ear twitching (occasional)
        if (this.leftEar && this.rightEar) {
            const earTwitch = Math.sin(this.walkCycle * 3.5) * 0.15;
            this.leftEar.rotation.x = earTwitch;
            this.rightEar.rotation.x = Math.sin(this.walkCycle * 3.7) * 0.15;
        }
        
        // Tail sway - more energetic
        this.tail.rotation.y = Math.sin(this.walkCycle * 1.3) * 0.4;
        this.tail.rotation.z = Math.sin(this.walkCycle * 1.3 + 0.5) * 0.25;
        
        // Move forward in a circle (or figure-8 for variety)
        const walkRadius = this.radius || 8;
        const walkAngle = this.walkCycle * 0.15;
        
        if (this.pathType === 'figure8') {
            // Figure-8 pattern
            this.group.position.x = Math.sin(walkAngle * 2) * walkRadius;
            this.group.position.z = Math.sin(walkAngle) * walkRadius;
            // Calculate direction for rotation
            const dx = Math.cos(walkAngle * 2) * 2;
            const dz = Math.cos(walkAngle);
            this.group.rotation.y = Math.atan2(dx, dz);
        } else {
            // Simple circle
            this.group.position.x = Math.sin(walkAngle) * walkRadius + (this.offsetX || 0);
            this.group.position.z = Math.cos(walkAngle) * walkRadius + (this.offsetZ || 0);
            this.group.rotation.y = walkAngle + Math.PI;
        }
    }
}

// Create multiple giraffes for a more realistic scene
const giraffes = [];

const mainGiraffe = new Giraffe();
mainGiraffe.group.position.set(0, 0, 0);
mainGiraffe.walkSpeed = 0.02;
mainGiraffe.radius = 8;
mainGiraffe.pathType = 'circle';
mainGiraffe.offsetX = 0;
mainGiraffe.offsetZ = 0;
giraffes.push(mainGiraffe);

// Add a second giraffe with figure-8 path
const giraffe2 = new Giraffe();
giraffe2.group.position.set(5, 0, -3);
giraffe2.group.rotation.y = Math.PI / 4;
giraffe2.walkSpeed = 0.018;
giraffe2.walkCycle = Math.PI; // Start at different phase
giraffe2.radius = 6;
giraffe2.pathType = 'figure8';
giraffes.push(giraffe2);

// Add a baby giraffe (smaller)
const babyGiraffe = new Giraffe();
babyGiraffe.group.scale.set(0.6, 0.6, 0.6);
babyGiraffe.group.position.set(-3, 0, 2);
babyGiraffe.walkSpeed = 0.025; // Faster walk
babyGiraffe.walkCycle = Math.PI / 2;
babyGiraffe.radius = 5;
babyGiraffe.pathType = 'circle';
babyGiraffe.offsetX = -3;
babyGiraffe.offsetZ = 2;
giraffes.push(babyGiraffe);

// FPS counter
let frameCount = 0;
let lastTime = performance.now();

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now() * 0.001;
    giraffes.forEach(giraffe => {
        giraffe.animate(time);
        // Update ground shadow position
        if (giraffe.shadow) {
            giraffe.shadow.position.x = giraffe.group.position.x;
            giraffe.shadow.position.z = giraffe.group.position.z;
        }
    });
    
    // Camera keyboard controls
    const cameraSpeed = 0.2;
    if (keys['w'] || keys['arrowup']) {
        camera.position.z -= cameraSpeed;
    }
    if (keys['s'] || keys['arrowdown']) {
        camera.position.z += cameraSpeed;
    }
    if (keys['a'] || keys['arrowleft']) {
        camera.position.x -= cameraSpeed;
    }
    if (keys['d'] || keys['arrowright']) {
        camera.position.x += cameraSpeed;
    }
    if (keys['q']) {
        camera.position.y -= cameraSpeed;
    }
    if (keys['e']) {
        camera.position.y += cameraSpeed;
    }
    
    // Animate clouds slowly
    clouds.forEach((cloud, index) => {
        cloud.position.x += 0.01;
        if (cloud.position.x > 60) {
            cloud.position.x = -60;
        }
    });
    
    // Animate birds
    birds.forEach(bird => bird.animate(time));
    
    // Animate particles
    const positions = particles.geometry.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] += particleVelocities[i].x;
        positions[i * 3 + 1] += particleVelocities[i].y;
        positions[i * 3 + 2] += particleVelocities[i].z;
        
        // Wrap around
        if (positions[i * 3] > 20) positions[i * 3] = -20;
        if (positions[i * 3] < -20) positions[i * 3] = 20;
        if (positions[i * 3 + 1] > 15) positions[i * 3 + 1] = 0;
        if (positions[i * 3 + 1] < 0) positions[i * 3 + 1] = 15;
        if (positions[i * 3 + 2] > 20) positions[i * 3 + 2] = -20;
        if (positions[i * 3 + 2] < -20) positions[i * 3 + 2] = 20;
    }
    particles.geometry.attributes.position.needsUpdate = true;
    
    controls.update();
    renderer.render(scene, camera);
    
    // Update FPS
    frameCount++;
    const currentTime = performance.now();
    if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        document.getElementById('fps').textContent = fps;
        frameCount = 0;
        lastTime = currentTime;
    }
}

// Add ground shadows for giraffes
function createGroundShadow() {
    const shadowGeometry = new THREE.CircleGeometry(2, 16);
    const shadowMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x000000,
        transparent: true,
        opacity: 0.3,
        depthWrite: false
    });
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    return shadow;
}

giraffes.forEach(giraffe => {
    const shadow = createGroundShadow();
    giraffe.shadow = shadow;
    scene.add(shadow);
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Keyboard controls
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Start animation
animate();
