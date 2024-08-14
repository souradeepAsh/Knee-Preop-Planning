import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75, 
  window.innerWidth / window.innerHeight, 
  0.1, 
  1000);
camera.position.set(0, 5, 20);
camera.lookAt(0, 0, 0);
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
// const loader = new STLLoader();
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
let varusValgus = 3;
let flexionExtension = 3;
let distalMedialResection = 10;
let lines = [];
let mechanicalAxisPlane = null;
let projectedLines = [];
let varusValgusPlane = null;
let flexionExtensionPlane = null;
let greenLines = [];
let lateralLine = null;
let distalMedialPlane = null;
let distalResectionPlane = null;
let isResectionVisible = false;

let distalMedialDistanceLine, distalLateralDistanceLine;
let distalMedialDistanceLabel, distalLateralDistanceLabel;


// Line from Distal Medial Pt to Distal Lateral Pt...
function updateDistanceLine(line, start, end, type) {
  if (!line) { // Checking if Line is Present or not
    line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([start, end]),
      new THREE.LineBasicMaterial({ color: 0x000000 })
    );
    scene.add(line);
    if (type === 'medial') {
      distalMedialDistanceLine = line;
    } else {
      distalLateralDistanceLine = line;
    }
  } else {
    line.geometry.setFromPoints([start, end]);
    line.geometry.attributes.position.needsUpdate = true; // Update in next render
  }
}
function updateDistanceLines() {
  if (!distalResectionPlane) return;

  const distalMedialPt = placedSprites.find(sprite => sprite.userData.name === 'Distal Medial Pt').position;
  const distalLateralPt = placedSprites.find(sprite => sprite.userData.name === 'Distal Lateral Pt').position;

  const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(distalResectionPlane.quaternion);
  // const planeConstant = distalResectionPlane.position.dot(planeNormal);

  // Calculate intersection points
  const medialIntersection = new THREE.Vector3();
  const lateralIntersection = new THREE.Vector3();

  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, distalResectionPlane.position);
  plane.intersectLine(new THREE.Line3(distalMedialPt, distalMedialPt.clone().add(planeNormal)), medialIntersection);
  plane.intersectLine(new THREE.Line3(distalLateralPt, distalLateralPt.clone().add(planeNormal)), lateralIntersection);

  // Update or create distance lines
  updateDistanceLine(distalMedialDistanceLine, distalMedialPt, medialIntersection, 'medial');
  updateDistanceLine(distalLateralDistanceLine, distalLateralPt, lateralIntersection, 'lateral');

  // Calculate distances
  const medialDistance = distalMedialPt.distanceTo(medialIntersection) * 1000; // Convert to mm
  const lateralDistance = distalLateralPt.distanceTo(lateralIntersection) * 1000; // Convert to mm

  // Update or create distance labels
  updateDistanceLabel(distalMedialDistanceLabel, medialDistance, medialIntersection, 'medial');
  updateDistanceLabel(distalLateralDistanceLabel, lateralDistance, lateralIntersection, 'lateral');

  // Update HTML elements
  document.getElementById('medialDistance').textContent = `${medialDistance.toFixed(1)} mm`;
  document.getElementById('lateralDistance').textContent = `${lateralDistance.toFixed(1)} mm`;
}
function createTextSprite(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  context.font = 'Bold 24px Arial';
  context.fillStyle = 'black';
  context.fillText(text, 0, 24);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.1, 0.05, 1);
  return sprite;
}
function updateDistanceLabel(label, distance, position, type) {
  const roundedDistance = Math.round(distance * 10) / 10;
  const labelText = `${roundedDistance.toFixed(1)} mm`;

  if (!label) {
    label = createTextSprite(labelText);
    scene.add(label);
    if (type === 'medial') {
      distalMedialDistanceLabel = label;
    } else {
      distalLateralDistanceLabel = label;
    }
  } else {
    updateTextSprite(label, labelText);
  }

  label.position.copy(position);
}
function updateTextSprite(sprite, newText) {
  const canvas = sprite.material.map.image;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = 'Bold 24px Arial';
  context.fillStyle = 'black';
  context.fillText(newText, 0, 24);
  sprite.material.map.needsUpdate = true;
}



// Visibility thing....
function updateResectionVisibility() {
  if (!distalResectionPlane) return;

  const resectionPlaneNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(distalResectionPlane.quaternion);
  const resectionPlaneConstant = distalResectionPlane.position.dot(resectionPlaneNormal);
  const clippingPlane = new THREE.Plane(resectionPlaneNormal, -resectionPlaneConstant);

  Object.values(boneMeshes).forEach(mesh => {
    if (isResectionVisible) {
      mesh.material.clippingPlanes = [clippingPlane];
    } else {
      mesh.material.clippingPlanes = [];
    }
    mesh.material.needsUpdate = true;
  });

  renderer.localClippingEnabled = true;
}

// Button Value change for Planes
function updateControlValues() {
  document.querySelector('.control-group:nth-child(1) .value').textContent = `${varusValgus}°`;
  document.querySelector('.control-group:nth-child(2) .value').textContent = `${flexionExtension}°`;
  document.querySelector('.control-group:nth-child(3) .value').textContent = `${distalMedialResection} mm`;
}

// Sky Blue Plane Varus/Valgus Plane....................
function updateVarusValgusPlane() {
  if (varusValgusPlane) {
    scene.remove(varusValgusPlane);
    if (lateralLine) {
      scene.remove(lateralLine);
      lateralLine = null;
    }
  }

  if (!mechanicalAxisPlane || projectedLines.length < 2) {
    console.log("Mechanical axis plane or anterior line not created yet");
    return;
  }

  const femurCenter = new THREE.Vector3(0, 0, 0); 
  const anteriorLine = projectedLines[1]; // Assuming the anterior line is the second projected line

  // Get the direction of the anterior line
  const anteriorDirection = new THREE.Vector3().subVectors(
    new THREE.Vector3().fromArray(anteriorLine.geometry.attributes.position.array, 3),
    new THREE.Vector3().fromArray(anteriorLine.geometry.attributes.position.array, 0)
  ).normalize();

  // varus/valgus plane
  const planeGeometry = new THREE.PlaneGeometry(mechanicalAxisPlane.geometry.parameters.width, mechanicalAxisPlane.geometry.parameters.height);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5
  });
  varusValgusPlane = new THREE.Mesh(planeGeometry, planeMaterial);

  // Position and rotate the plane
  varusValgusPlane.position.copy(femurCenter);
  varusValgusPlane.quaternion.copy(mechanicalAxisPlane.quaternion);
  varusValgusPlane.rotateY(THREE.MathUtils.degToRad(varusValgus));
  scene.add(varusValgusPlane);


  // Create lateral line (perpendicular to anterior line)
  const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(varusValgusPlane.quaternion);
  const lateralDirection = new THREE.Vector3().crossVectors(anteriorDirection, planeNormal).normalize();
  const lateralEnd = new THREE.Vector3().addVectors(femurCenter, lateralDirection.multiplyScalar(10));

  const lateralGeometry = new THREE.BufferGeometry().setFromPoints([femurCenter, lateralEnd]);
  const lateralMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Green color
  lateralLine = new THREE.Line(lateralGeometry, lateralMaterial);
  scene.add(lateralLine);

    // Adding another plane on top of it
    updateFlexionExtensionPlane();
}

// Pink plane Flexion/Extension Plane........................
function updateFlexionExtensionPlane() {
  if (flexionExtensionPlane) {
    scene.remove(flexionExtensionPlane);
    if (flexionExtensionPlane.userData.associatedLines) {
      flexionExtensionPlane.userData.associatedLines.forEach(line => scene.remove(line));
    }
  }

  if (!varusValgusPlane) {
    console.log("Varus/Valgus plane not created yet");
    return;
  }

  const femurCenter = new THREE.Vector3(0, 0, 0);

  // Create the flexion/extension plane with the same size as varusValgusPlane
  const planeGeometry = new THREE.PlaneGeometry(
    varusValgusPlane.geometry.parameters.width,
    varusValgusPlane.geometry.parameters.height
  );
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5
  });
  flexionExtensionPlane = new THREE.Mesh(planeGeometry, planeMaterial);

  // Position and rotate the plane
  flexionExtensionPlane.position.copy(femurCenter);
  flexionExtensionPlane.quaternion.copy(varusValgusPlane.quaternion);
  
  // Get the lateral direction from varusValgusPlane
  const lateralDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(varusValgusPlane.quaternion);
  
  // Rotate around the lateral direction
  flexionExtensionPlane.rotateOnWorldAxis(lateralDirection, THREE.MathUtils.degToRad(flexionExtension));
  
  scene.add(flexionExtensionPlane);

  // Create a line to represent the flexion/extension axis
  const axisLength = varusValgusPlane.geometry.parameters.width / 2;
  const axisStart = new THREE.Vector3(-axisLength, 0, 0);
  const axisEnd = new THREE.Vector3(axisLength, 0, 0);
  const axisGeometry = new THREE.BufferGeometry().setFromPoints([axisStart, axisEnd]);
  const axisMaterial = new THREE.LineBasicMaterial({ color: 0xff00ff }); // Purple color
  const axisLine = new THREE.Line(axisGeometry, axisMaterial);
  flexionExtensionPlane.add(axisLine);

  console.log("Flexion/Extension plane updated:", flexionExtension);

  // Update the Distal Medial Plane
  updateDistalMedialPlane();
}

// Deep Blue Plane Distal Media Plane........................
function updateDistalMedialPlane() {
  if (distalMedialPlane) {
    scene.remove(distalMedialPlane);
  }

  if (!flexionExtensionPlane) {
    console.log("Flexion/Extension plane not created yet");
    return;
  }

  const distalMedialPt = placedSprites.find(sprite => sprite.userData.name === 'Distal Medial Pt').position;
  const distalLateralPt = placedSprites.find(sprite => sprite.userData.name === 'Distal Lateral Pt').position;

  // Calculate the center point between distal medial and lateral points
  const centerPoint = new THREE.Vector3().addVectors(distalMedialPt, distalLateralPt).multiplyScalar(0.5);

  // Create the distal medial plane
  const planeGeometry = new THREE.PlaneGeometry(
    flexionExtensionPlane.geometry.parameters.width,
    flexionExtensionPlane.geometry.parameters.height
  );
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0x00008B, // Deep Blue
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5
  });
  distalMedialPlane = new THREE.Mesh(planeGeometry, planeMaterial);
  distalMedialPlane.position.copy(centerPoint);
  distalMedialPlane.quaternion.copy(flexionExtensionPlane.quaternion);

  scene.add(distalMedialPlane);

  updateDistalResectionPlane();

  console.log("Distal Medial Plane created:", distalMedialPlane);
}

// Distal Resection Plane.......................
function updateDistalResectionPlane() {
  if (distalResectionPlane) {
    scene.remove(distalResectionPlane);
  }

  if (!distalMedialPlane) {
    console.log("Distal Medial plane not created yet");
    return;
  }

  const planeGeometry = new THREE.PlaneGeometry(
    distalMedialPlane.geometry.parameters.width,
    distalMedialPlane.geometry.parameters.height
  );
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: 0x4B0082, // Indigo
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5
  });
  distalResectionPlane = new THREE.Mesh(planeGeometry, planeMaterial);
  distalResectionPlane.quaternion.copy(distalMedialPlane.quaternion);
  const planeNormal  = new THREE.Vector3(0, 0, 1).applyQuaternion(distalMedialPlane.quaternion);
  const distalMedialResectionInMeters = distalMedialResection / 1000;
  distalResectionPlane.position.copy(distalMedialPlane.position).add(planeNormal.multiplyScalar(distalMedialResectionInMeters));

  scene.add(distalResectionPlane);

  updateResectionVisibility();
  updateDistanceLines();

  console.log("Distal Resection Plane created:", distalResectionPlane);
}



// Plane Creation Button
function enableCreatePlaneButton() {
  const createPlaneButton = document.getElementById('createPlaneButton');
  createPlaneButton.disabled = false;
  createPlaneButton.style.backgroundColor = '#4CAF50';
  createPlaneButton.style.color = 'white';
  // console.log("Create Plane button enabled");
}



// Create TEA Line on the Plane
function projectTEAOntoPlane(plane, medialEpicondyle, lateralEpicondyle) {
  const planeNormal = plane.normal;
  const planePoint = plane.position;

  const projectedMedial = projectPointOntoPlane(medialEpicondyle, planeNormal, planePoint);
  const projectedLateral = projectPointOntoPlane(lateralEpicondyle, planeNormal, planePoint);

  // Create a line geometry using the projected points
  const geometry = new THREE.BufferGeometry().setFromPoints([projectedMedial, projectedLateral]);
  const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
  const projectedTEALine = new THREE.Line(geometry, material);
  scene.add(projectedTEALine);

  // console.log("Projected TEA line created on plane:", projectedTEALine);
  // console.log("Projected Medial Point:", projectedMedial);
  // console.log("Projected Lateral Point:", projectedLateral);

  // console.log("Projected TEA line created on plane:", projectedTEALine);
  return projectedTEALine;
}
function projectPointOntoPlane(point, planeNormal, planePoint) {
  const v = new THREE.Vector3().subVectors(point, planePoint);
  const distance = v.dot(planeNormal);
  return new THREE.Vector3().copy(point).sub(planeNormal.clone().multiplyScalar(distance));
}



// Creation of Anterior Line 
function createAnteriorLine(femurCenter, projectedTEA, length = 5) {
  // Get the direction of the projected TEA
  const teaStart = new THREE.Vector3(projectedTEA.geometry.attributes.position.array[0], 
                                     projectedTEA.geometry.attributes.position.array[1], 
                                     projectedTEA.geometry.attributes.position.array[2]);
  const teaEnd = new THREE.Vector3(projectedTEA.geometry.attributes.position.array[3], 
                                   projectedTEA.geometry.attributes.position.array[4], 
                                   projectedTEA.geometry.attributes.position.array[5]);
  const teaDirection = new THREE.Vector3().subVectors(teaEnd, teaStart).normalize();

  // Calculate the direction perpendicular to TEA (this will be in the plane)
  const perpendicularDirection = new THREE.Vector3(teaDirection.z, 0, -teaDirection.x).normalize();

  // Ensure it's pointing anteriorly (you may need to adjust this based on your coordinate system)
  if (perpendicularDirection.z < 0) {
    perpendicularDirection.negate();
  }

  // Calculate the end point of our line (10mm in the calculated direction)
  const endPoint = new THREE.Vector3().addVectors(femurCenter, perpendicularDirection.multiplyScalar(length));

  // Create the line geometry
  const geometry = new THREE.BufferGeometry().setFromPoints([femurCenter, endPoint]);
  const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 }); // Yellow color
  const anteriorLine = new THREE.Line(geometry, material);

  scene.add(anteriorLine);
  return anteriorLine;
}

function createMechanicalAxisPlane() {
  if (mechanicalAxisPlane) {
    scene.remove(mechanicalAxisPlane);
  }
  
  projectedLines.forEach(line => scene.remove(line));
  projectedLines = []; // Clear the array

  const hipCenter = placedSprites.find(sprite => sprite.userData.name === 'Hip Center').position;
  const femurCenter = new THREE.Vector3(0, 0, 0);

  const medialEpicondyle = placedSprites.find(sprite => sprite.userData.name === 'Medial Epicondyle').position;
  const lateralEpicondyle = placedSprites.find(sprite => sprite.userData.name === 'Lateral Epicondyle').position;

  const mechanicalAxis = new THREE.Vector3().subVectors(hipCenter, femurCenter).normalize();
  const planePoint = femurCenter;
  const planeSize = hipCenter.distanceTo(femurCenter) * 2;

  mechanicalAxisPlane = createPlane(mechanicalAxis, planePoint, planeSize, 0xff0000);

  const newProjectedTEALine = projectTEAOntoPlane(mechanicalAxisPlane, medialEpicondyle, lateralEpicondyle);
  projectedLines.push(newProjectedTEALine);

  const anteriorLine = createAnteriorLine(femurCenter, newProjectedTEALine);
  projectedLines.push(anteriorLine);
  
  document.querySelectorAll('#plane-controls button').forEach(button => {
    button.disabled = false;
  });

  updateVarusValgusPlane();
  
  console.log("Mechanical Axis Plane created:", mechanicalAxisPlane);
  console.log("Projected lines:", projectedLines);
  console.log("Anterior line:", anteriorLine);
}

function createPlane(normal, point, size = 1, color = 0x00ff00) {
  const planeGeometry = new THREE.PlaneGeometry(size, size);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5
  });
  const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
  
  planeMesh.position.copy(point);

  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  planeMesh.setRotationFromQuaternion(quaternion);

  planeMesh.normal = normal; // Store the normal vector
  
  scene.add(planeMesh);
  console.log("Plane added to scene:", planeMesh);
  return planeMesh;
}

function togglePlacementMode(sprite) {
  isPlacementMode = !isPlacementMode;
  const color = isPlacementMode ? "rgb(0, 0, 0)" : "rgb(169, 169, 169)";
  sprite.userData.drawButton(color);
  sprite.userData.texture.needsUpdate = true;

  // Update all sprites
  sprites.forEach(placedSprite => {
    if (placedSprite.userData.transformControl) {
      if (placedSprite.userData.transformControl) {
        placedSprite.userData.transformControl.enabled = false;
        placedSprite.userData.transformControl.visible = false;
      }
    }
  });

  const tableCells = document.querySelectorAll('#sprite-table td[data-name]');
  tableCells.forEach(cell => {
    cell.draggable = isPlacementMode;
  });

  if (activeTransformControl) {
    activeTransformControl.update();
  }
}



// For annotation and model loading part
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
    isPlacedSprite: false,
    name: annotationText
  };

  sprite.onClick = () => {
    if (text === '0') {
      togglePlacementMode(sprite);
    } else if (isPlacementMode || sprite.userData.isPlacedSprite) {
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
    import('three/examples/jsm/loaders/STLLoader.js').then((module) => {
      const STLLoader = module.STLLoader;

      const loader = new STLLoader();
      loader.load(url, function (geometry) {
        console.log(`${name} model loaded`);
        const material = new THREE.MeshPhongMaterial({
          color: color,
          clippingPlanes: [],
          clipShadows: true
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, position.z);
        mesh.scale.set(scale.x, scale.y, scale.z);
        mesh.rotation.set(rotation.x, rotation.y, rotation.z);
        scene.add(mesh);

        boneMeshes[name] = mesh;

        addButtonsToModel(mesh, annotations, name);
        updateResectionVisibility();
        resolve(mesh);
      }, undefined, function (error) {
        console.error(`Error loading ${name} model:`, error);
        reject(error);
      });
    }).catch(error => {
      console.error('Error importing STLLoader:', error);
      reject(error);
    });
  });
}



// Annotation Buttons 0
const annotationsForFemur = [
  { 
    position: { x: 20, y: -23, z: 20 }, 
    text: '0', 
    onClick: () => console.log('Femur button clicked'),
    annotationText: 'This is the femur bone.'
  }
];

const annotationsForTibia = [
  // { 
  //   position: { x: -20, y: 10, z: -15 }, 
  //   text: '2', 
  //   onClick: () => console.log('Tibia button clicked'),
  //   annotationText: 'This is the tibia bone.'
  // }
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


// Animate
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateAnnotations();

  if (varusValgusPlane && mechanicalAxisPlane) {
    varusValgusPlane.quaternion.copy(mechanicalAxisPlane.quaternion);
    varusValgusPlane.rotateY(THREE.MathUtils.degToRad(varusValgus));
  
  // Update the green line
  if (greenLines.length > 0) {
    const lateralLine = greenLines[0];
    const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(varusValgusPlane.quaternion);
    const anteriorDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(varusValgusPlane.quaternion);
    const lateralDirection = new THREE.Vector3().crossVectors(anteriorDirection, planeNormal).normalize();
    const femurCenter = new THREE.Vector3(0, 0, 0);
    const lateralEnd = new THREE.Vector3().addVectors(femurCenter, lateralDirection.multiplyScalar(10));
    
    lateralLine.geometry.setFromPoints([femurCenter, lateralEnd]);
    lateralLine.geometry.attributes.position.needsUpdate = true;
  }
}

  if (flexionExtensionPlane && varusValgusPlane) {
    flexionExtensionPlane.quaternion.copy(varusValgusPlane.quaternion);
    const lateralDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(varusValgusPlane.quaternion);
    flexionExtensionPlane.rotateOnWorldAxis(lateralDirection, THREE.MathUtils.degToRad(flexionExtension));

    // Update the Distal Medial Plane
    if (distalMedialPlane) {
      distalMedialPlane.quaternion.copy(flexionExtensionPlane.quaternion);
      const distalMedialPt = placedSprites.find(sprite => sprite.userData.name === 'Distal Medial Pt').position;
      const distalLateralPt = placedSprites.find(sprite => sprite.userData.name === 'Distal Lateral Pt').position;
      const centerPoint = new THREE.Vector3().addVectors(distalMedialPt, distalLateralPt).multiplyScalar(0.5);
      distalMedialPlane.position.copy(centerPoint);

      // Update the Distal Resection Plane
      if (distalResectionPlane) {
        distalResectionPlane.quaternion.copy(distalMedialPlane.quaternion);
        const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(distalMedialPlane.quaternion);
        const distalMedialResectionInMeters = distalMedialResection / 1000;
        distalResectionPlane.position.copy(distalMedialPlane.position).add(planeNormal.multiplyScalar(distalMedialResectionInMeters));

        updateResectionVisibility();
        updateDistanceLines();
      }
    }
  }

  renderer.render(scene, camera);
}


// update button color change
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

// For annotation
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

  // spriteTransformControl.enabled = isPlacementMode;
  spriteTransformControl.enabled = false; // Disable by default
  spriteTransformControl.visible = false; // Hide by default
  scene.add(spriteTransformControl);
  sprite.userData.transformControl = spriteTransformControl;

  spriteTransformControl.addEventListener('mouseDown', () => {
    controls.enabled = false;
  });

  spriteTransformControl.addEventListener('mouseUp', () => {
    controls.enabled = true;
  });

  //...............................
  sprite.userData.transformControl.addEventListener('change', () => {
    if (name === 'Distal Medial Pt' || name === 'Distal Lateral Pt') {
      updateDistanceLines();
    }
  });
  //................................

  sprite.userData.onClick = () => {
    if (isPlacementMode) {
      // Hide all other transform controls
      placedSprites.forEach(s => {
        if (s !== sprite && s.userData.transformControl) {
          s.userData.transformControl.visible = false;
          s.userData.transformControl.enabled = false;
        }
      });

      // Show and enable this sprite's transform control
      spriteTransformControl.visible = true;
      spriteTransformControl.enabled = true;
    }
  };

  placedAnnotations.add(name);
  checkAllAnnotationsPlaced();

  return sprite;
}


function createLine(start, end, color = 0xffffff, linewidth = 6) {
  const material = new THREE.LineBasicMaterial({ color: color, linewidth: linewidth });
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  return line;
}
function removeLines() {
  lines.forEach(line => scene.remove(line));
  lines = []; // Clear the array
}

// Axes / Line creation for one Point to another
function createAxes() {
   removeLines();

  const hipCenter = placedSprites.find(sprite => sprite.userData.name === 'Hip Center').position;
  const femurCenter = new THREE.Vector3(0, 0, 0); // Assume femur center is at origin

  const femurProximalCanal = placedSprites.find(sprite => sprite.userData.name === 'Femur Proximal Canal').position;
  const femurDistalCanal = placedSprites.find(sprite => sprite.userData.name === 'Femur Distal Canal').position;

  const medialEpicondyle = placedSprites.find(sprite => sprite.userData.name === 'Medial Epicondyle').position;
  const lateralEpicondyle = placedSprites.find(sprite => sprite.userData.name === 'Lateral Epicondyle').position;

  const posteriorMedialPt = placedSprites.find(sprite => sprite.userData.name === 'Posterior Medial Pt').position;
  const posteriorLateralPt = placedSprites.find(sprite => sprite.userData.name === 'Posterior Lateral Pt').position;

  // Create new lines
  lines.push(createLine(femurCenter, hipCenter, 0xff0000, 5)); // Mechanical Axis (red)
  lines.push(createLine(femurProximalCanal, femurDistalCanal, 0x00ff00, 5)); // Anatomical Axis (green)
  lines.push(createLine(medialEpicondyle, lateralEpicondyle, 0x0000ff, 5)); // TEA-Trans epicondyle Axis (blue)
  lines.push(createLine(posteriorMedialPt, posteriorLateralPt, 0xffff00, 5)); // PCA- Posterior Condyle Axis (yellow)

  enableCreatePlaneButton();
}

// Drag and Drop from the UI............................
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

function initializeScene() {
  console.log('All models loaded');
  animate();
  initializeDragAndDrop();
  updateToggleButtonStyle();
}

// Toggle Button
function updateToggleButtonStyle() {
  const toggleButton = document.getElementById('resectionToggle');
  if (isResectionVisible) {
    toggleButton.classList.add('active');
    toggleButton.textContent = 'On';
  } else {
    toggleButton.classList.remove('active');
    toggleButton.textContent = 'Off';
  }
}


// Dynamic loading of models
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
  initializeScene();
}).catch(error => {
  console.error('Error loading models:', error);
});


// Buttons for Toggle Plane in ThreeJs................................................................
document.getElementById('mechanicalAxisPlaneToggle').addEventListener('click', togglePlaneVisibility);
document.getElementById('varusValgusPlaneToggle').addEventListener('click', togglePlaneVisibility);
document.getElementById('flexionExtensionPlaneToggle').addEventListener('click', togglePlaneVisibility);
document.getElementById('distalMedialPlaneToggle').addEventListener('click', togglePlaneVisibility);
document.getElementById('distalResectionPlaneToggle').addEventListener('click', togglePlaneVisibility);
function togglePlaneVisibility(event) {
  const button = event.target;
  const planeName = button.id.replace('Toggle', '');
  let plane;

  switch(planeName) {
    case 'mechanicalAxisPlane':
      plane = mechanicalAxisPlane;
      break;
    case 'varusValgusPlane':
      plane = varusValgusPlane;
      break;
    case 'flexionExtensionPlane':
      plane = flexionExtensionPlane;
      break;
    case 'distalMedialPlane':
      plane = distalMedialPlane;
      break;
    case 'distalResectionPlane':
      plane = distalResectionPlane;
      break;
  }

  if (plane) {
    plane.visible = !plane.visible;
    button.classList.toggle('inactive', !plane.visible);
  }
}
//....................................................................................................

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

document.getElementById('createPlaneButton').addEventListener('click', () => {
  console.log("Create Plane button clicked");
  createMechanicalAxisPlane();
});

document.getElementById('updateButton').addEventListener('click', () => {
  if ([...requiredAnnotations].every(annotation => placedAnnotations.has(annotation))) {
    createAxes();
  } else {
    console.log('Not all required annotations have been placed.');
  }
});

document.getElementById('resectionToggle').addEventListener('click', () => {
  isResectionVisible = !isResectionVisible;
  updateResectionVisibility();
  updateToggleButtonStyle();
});

document.querySelectorAll('.control-group').forEach((group, index) => {
  const decrement = group.querySelector('.decrement');
  const increment = group.querySelector('.increment');

  if (decrement && increment) {
    decrement.addEventListener('click', () => {
      switch(index) {
        case 0:
          varusValgus = Math.max(varusValgus - 1, -10);
          if (varusValgusPlane) updateVarusValgusPlane();
          break;
        case 1:
          flexionExtension = Math.max(flexionExtension - 1, -15);
          if (flexionExtensionPlane) updateFlexionExtensionPlane();
          break;
        case 2:
          distalMedialResection = Math.max(distalMedialResection - 1, 0);
          updateDistalResectionPlane();
          break;
      }
      updateControlValues();
    });

    increment.addEventListener('click', () => {
      switch(index) {
        case 0:
          varusValgus = Math.min(varusValgus + 1, 10);
          if (varusValgusPlane) updateVarusValgusPlane();
          break;
        case 1:
          flexionExtension = Math.min(flexionExtension + 1, 15);
          if (flexionExtensionPlane) updateFlexionExtensionPlane();
          break;
        case 2:
          distalMedialResection = Math.min(distalMedialResection + 1, 50);
          updateDistalResectionPlane();
          break;
      }
      updateControlValues();
    });
  }
});

window.addEventListener('click', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // raycaster.updateMatrix();
  raycaster.setFromCamera(mouse, camera);
  const spriteIntersects = raycaster.intersectObjects(sprites);
  const modelIntersects = raycaster.intersectObjects(Object.values(boneMeshes));

  if (spriteIntersects.length > 0) {
    const sprite = spriteIntersects[0].object;
    sprite.onClick();
    if (sprite.userData.onClick) {
      sprite.userData.onClick();
    }
  } else if (isPlacementMode && modelIntersects.length > 0 && draggedSpriteName) {
    const intersectionPoint = modelIntersects[0].point;
    const draggedCell = document.querySelector(`#sprite-table td[data-name="${draggedSpriteName}"]`);
    const index = parseInt(draggedCell.previousElementSibling.dataset.index);
    // createSpawnedSpriteButton(intersectionPoint, draggedSpriteName, index);
    createPlacedSprite(intersectionPoint, draggedSpriteName, index);

    // Disable the dragged cell
    if (draggedCell) {
      draggedCell.draggable = false;
      draggedCell.style.color = 'gray';
    }
    draggedSpriteName = null;

    checkAllAnnotationsPlaced();

    placedSprites.forEach(s => {
      if (s.userData.transformControl) {
        s.userData.transformControl.visible = false;
        s.userData.transformControl.enabled = false;
      }
    });
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