import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

// Basic setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 10;
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xeeeeee);
document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
const light = new THREE.AmbientLight(0x404040);
scene.add(light);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(1, 1, 1).normalize();
scene.add(directionalLight);
const loader = new STLLoader();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const sprites = [];
let boneMeshes = {};
let isPlacementMode = false;
const placedSprites = [];
let draggedSpriteName = null;
let activeTransformControl = null;

let placedAnnotations = new Set();
const requiredAnnotations = new Set([
  'Hip Center', 'Femur Proximal Canal', 'Femur Distal Canal', 
  'Medial Epicondyle', 'Lateral Epicondyle', 
  'Distal Medial Pt', 'Distal Lateral Pt',
  'Posterior Medial Pt', 'Posterior Lateral Pt'
]);
function createLine(start, end, color = 0x000000) {
  const material = new THREE.LineBasicMaterial({ color: color });
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  return line;
}

function checkAllAnnotationsPlaced() {
  const allPlaced = [...requiredAnnotations].every(annotation => placedAnnotations.has(annotation));
  const updateButton = document.getElementById('updateButton');
  updateButton.disabled = !allPlaced;
  if (allPlaced) {
    updateButton.style.backgroundColor = '#4CAF50';  // Green color when enabled
    updateButton.style.color = 'white';
  } else {
    updateButton.style.backgroundColor = '#cccccc';  // Gray color when disabled
    updateButton.style.color = '#666666';
  }
}

function createAxes() {
  const hipCenter = placedSprites.find(sprite => sprite.userData.name === 'Hip Center').position;
  const femurCenter = new THREE.Vector3(0, 0, 0); // Assume femur center is at origin
  const femurProximalCanal = placedSprites.find(sprite => sprite.userData.name === 'Femur Proximal Canal').position;
  const femurDistalCanal = placedSprites.find(sprite => sprite.userData.name === 'Femur Distal Canal').position;
  const medialEpicondyle = placedSprites.find(sprite => sprite.userData.name === 'Medial Epicondyle').position;
  const lateralEpicondyle = placedSprites.find(sprite => sprite.userData.name === 'Lateral Epicondyle').position;
  const posteriorMedialPt = placedSprites.find(sprite => sprite.userData.name === 'Posterior Medial Pt').position;
  const posteriorLateralPt = placedSprites.find(sprite => sprite.userData.name === 'Posterior Lateral Pt').position;

  // Create lines
  createLine(femurCenter, hipCenter, 0xff0000); // Mechanical Axis (red)
  createLine(femurProximalCanal, femurDistalCanal, 0x00ff00); // Anatomical Axis (green)
  createLine(medialEpicondyle, lateralEpicondyle, 0x0000ff); // TEA-Trans epicondyle Axis (blue)
  createLine(posteriorMedialPt, posteriorLateralPt, 0xffff00); // PCA- Posterior Condyle Axis (yellow)
}

function initializeDragAndDrop() {
  document.querySelectorAll('#sprite-table td[data-name]').forEach(cell => {
    cell.draggable = true;
    cell.addEventListener('dragstart', (event) => {
      if (isPlacementMode) {
        draggedSpriteName = event.target.dataset.name;
        event.target.style.opacity = '0.5';
      }
    });

    cell.addEventListener('dragend', (event) => {
      event.target.style.opacity = '1';
    });
  });
}

function createPlacedSprite(position, name, index) {
  const sprite = createSpriteButton(
    index.toString(),
    null,
    'placed',
    name,
    index
  );
  sprite.position.copy(position);
  sprite.scale.set(0.1, 0.1, 0);
  scene.add(sprite);
  placedSprites.push(sprite);

  // Create TransformControls for the sprite
  const spriteTransformControl = new TransformControls(camera, renderer.domElement);
  spriteTransformControl.attach(sprite);
  spriteTransformControl.setMode('translate');
  spriteTransformControl.enabled = isPlacementMode;
  scene.add(spriteTransformControl);
  sprite.userData.transformControl = spriteTransformControl;

  spriteTransformControl.addEventListener('mouseDown', () => {
    controls.enabled = false;

    // Deactivate the previously active TransformControls
    if (activeTransformControl && activeTransformControl !== spriteTransformControl) {
      activeTransformControl.enabled = false;
    }

    // Set the new active TransformControls
    activeTransformControl = spriteTransformControl;
    activeTransformControl.enabled = true;
  });

  spriteTransformControl.addEventListener('mouseUp', () => {
    controls.enabled = true;
  });

  placedAnnotations.add(name);
  checkAllAnnotationsPlaced();

  return sprite;
}

function togglePlacementMode(sprite) {
  isPlacementMode = !isPlacementMode;
  const color = isPlacementMode ? "rgb(0, 0, 0)" : "rgb(169, 169, 169)";
  sprite.userData.drawButton(color);
  sprite.userData.texture.needsUpdate = true;

  // Update all sprites
  sprites.forEach(placedSprite => {
    if (placedSprite.userData.transformControl) {
      placedSprite.userData.transformControl.enabled = isPlacementMode;
      placedSprite.userData.transformControl.showX = isPlacementMode;
      placedSprite.userData.transformControl.showY = isPlacementMode;
      placedSprite.userData.transformControl.showZ = isPlacementMode;

      // Reset the active control if the placement mode is turned off
      if (!isPlacementMode && activeTransformControl && activeTransformControl === placedSprite.userData.transformControl) {
        activeTransformControl = null;
      }
    }
  });

  // Enable/disable draggable table cells
  const tableCells = document.querySelectorAll('#sprite-table td[data-name]');
  tableCells.forEach(cell => {
    cell.draggable = isPlacementMode;
  });

  // Ensure that controls are correctly updated
  if (activeTransformControl) {
    activeTransformControl.update();
  }
}

function createSpriteButton(text, onClick, boneName, annotationText, index) {
  const size = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;

  const x = size / 2; 
  const y = size / 2;
  const radius = size / 2 - 4;

  function drawButton(color) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgb(255, 255, 255)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.font = "32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
  }

  drawButton("rgb(169, 169, 169)"); // Default color

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(material);

  // Create annotation element
  const annotation = document.createElement('div');
  annotation.className = 'annotation';
  annotation.dataset.index = index;
  annotation.innerHTML = `
    <div class="circleMark" data-index="${index}">${text}</div>`;

  sprite.userData = { 
    text, 
    onClick, 
    active: false, 
    drawButton, 
    texture, 
    boneName,
    annotationElement: annotation,
    isPlacedSprite: false
  };

  sprite.onClick = () => {
    if (text === '0') {
      togglePlacementMode(sprite);
    } else if (isPlacementMode || sprite.userData.isPlacedSprite) {
      // Do nothing when in placement mode or for placed sprites
      return;
    } else {
      sprite.userData.active = !sprite.userData.active;
      const color = sprite.userData.active ? "rgb(0, 0, 0)" : "rgb(169, 169, 169)";
      sprite.userData.drawButton(color);
      sprite.userData.texture.needsUpdate = true;
      
      annotation.classList.toggle('active', sprite.userData.active);
      annotation.querySelector('.circleMark').classList.toggle('active', sprite.userData.active);

      const boneMesh = boneMeshes[sprite.userData.boneName];
      if (boneMesh) {
        boneMesh.material.color.set(sprite.userData.active ? 0xff0000 : 0x76b5c5);
      }
    }

    if (sprite.userData.onClick) sprite.userData.onClick();
  };

  sprites.push(sprite);
  return sprite;
}

function addButtonsToModel(mesh, annotations, boneName) {
  annotations.forEach((annotation, index) => {
    const sprite = createSpriteButton(
      annotation.text, 
      annotation.onClick, 
      boneName,
      annotation.annotationText,
      index
    );
    const worldPosition = new THREE.Vector3();
    mesh.localToWorld(worldPosition.set(annotation.position.x, annotation.position.y, annotation.position.z));
    sprite.position.copy(worldPosition);
    sprite.scale.set(0.15, 0.15, 0);
    scene.add(sprite);
  });
}

function loadModel(url, name, position, scale, rotation, color, annotations) {
  return new Promise((resolve, reject) => {
    loader.load(url, function (geometry) {
      console.log(`${name} model loaded`);
      const material = new THREE.MeshPhongMaterial({ color: color });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position.x, position.y, position.z);
      mesh.scale.set(scale.x, scale.y, scale.z);
      mesh.rotation.set(rotation.x, rotation.y, rotation.z);
      scene.add(mesh);
      
      boneMeshes[name] = mesh;
      
      addButtonsToModel(mesh, annotations, name);
      resolve(mesh);
    }, undefined, function (error) {
      console.error(`Error loading ${name} model:`, error);
      reject(error);
    });
  });
}

const annotationsForFemur = [
  { 
    position: { x: 20, y: -23, z: 20 }, 
    text: '0', 
    onClick: () => console.log('Femur button clicked'),
    annotationText: 'This is the femur bone.'
  }
];

const annotationsForTibia = [
  { 
    position: { x: -20, y: 10, z: -15 }, 
    text: '2', 
    onClick: () => console.log('Tibia button clicked'),
    annotationText: 'This is the tibia bone.'
  }
];

function updateAnnotations() {
  sprites.forEach((sprite) => {
    const screenPosition = sprite.position.clone().project(camera);
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = -(screenPosition.y * 0.5 - 0.5) * window.innerHeight;

    const annotation = sprite.userData.annotationElement;
    if (annotation) {
      annotation.style.left = `${x}px`;
      annotation.style.top = `${y}px`;
      annotation.style.display = screenPosition.z < 1 ? 'block' : 'none';
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateAnnotations();
  renderer.render(scene, camera);
}

function initializeScene() {
  console.log('All models loaded');
  animate();
  initializeDragAndDrop();
}

Promise.all([
  loadModel('/public/Right_Femur.stl', 'Right Femur', { x: 0, y: 0, z: 0 }, 
                                                      { x: 0.01, y: 0.01, z: 0.01 },
                                                      { x: Math.PI / -2, y: 0, z: 0 },
                                                      0x76b5c5,
                                                      annotationsForFemur),
  loadModel('/public/Right_Tibia.stl', 'Right Tibia', { x: 0.17, y: -0.15, z: 0 }, 
                                                      { x: 0.01, y: 0.01, z: 0.01 },
                                                      { x: Math.PI / -2, y: 0, z: 0 },
                                                      0xd2721e,
                                                      annotationsForTibia)
]).then(() => {
  console.log('All models loaded');
  animate();
}).catch(error => {
  console.error('Error loading models:', error);
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(sprites);

  if (intersects.length > 0) {
    renderer.domElement.style.cursor = 'pointer';
  } else {
    renderer.domElement.style.cursor = 'auto';
  }
});

document.getElementById('updateButton').addEventListener('click', () => {
  if ([...requiredAnnotations].every(annotation => placedAnnotations.has(annotation))) {
    createAxes();
  } else {
    console.log('Not all required annotations have been placed.');
  }
});

window.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const spriteIntersects = raycaster.intersectObjects(sprites);
  const modelIntersects = raycaster.intersectObjects(Object.values(boneMeshes));

  if (spriteIntersects.length > 0) {
    const sprite = spriteIntersects[0].object;
    sprite.onClick();
  } else if (isPlacementMode && modelIntersects.length > 0 && draggedSpriteName) {
    const intersectionPoint = modelIntersects[0].point;
    const draggedCell = document.querySelector(`#sprite-table td[data-name="${draggedSpriteName}"]`);
    const index = parseInt(draggedCell.previousElementSibling.dataset.index);
    createPlacedSprite(intersectionPoint, draggedSpriteName, index);

    // Disable the dragged cell
    if (draggedCell) {
      draggedCell.draggable = false;
      draggedCell.style.color = 'gray';
    }
    draggedSpriteName = null;
  }
  if (isPlacementMode && modelIntersects.length > 0 && draggedSpriteName) {
    const intersectionPoint = modelIntersects[0].point;
    const draggedCell = document.querySelector(`#sprite-table td[data-name="${draggedSpriteName}"]`);
    const index = parseInt(draggedCell.previousElementSibling.dataset.index);
    createPlacedSprite(intersectionPoint, draggedSpriteName, index);

    // Disable the dragged cell
    if (draggedCell) {
      draggedCell.draggable = false;
      draggedCell.style.color = 'gray';
    }
    draggedSpriteName = null;

    // Check if all annotations are placed
    checkAllAnnotationsPlaced();
  }
});

// Add event listeners for drag and drop
document.querySelectorAll('#sprite-table td[data-name]').forEach(cell => {
  cell.addEventListener('dragstart', (event) => {
    if (isPlacementMode) {
      draggedSpriteName = event.target.dataset.name;
      event.target.style.opacity = '0.5';
    }
  });

  cell.addEventListener('dragend', (event) => {
    event.target.style.opacity = '1';
  });
});