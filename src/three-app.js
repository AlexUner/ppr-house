// Простая 3D сцена для манипуляций узлами
// Ноды - это небольшие сферы, которые можно создавать,
// перемещать и удалять.

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({antialias: true});
const container = document.getElementById('threeView');
container.appendChild(renderer.domElement);
const aspect = container.clientWidth / container.clientHeight;
camera.aspect = aspect;
camera.updateProjectionMatrix();
renderer.setSize(container.clientWidth, container.clientHeight);

// управление камерой
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

camera.position.set(5, 5, 5);
controls.update();

const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeMesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({visible:false}));
scene.add(planeMesh);
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const nodes = [];
let selected = null;
let dragging = false;

function addNode(position) {
  const geometry = new THREE.SphereGeometry(0.1, 16, 16);
  const material = new THREE.MeshBasicMaterial({color: 0x2e8555});
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(position);
  scene.add(sphere);
  nodes.push(sphere);
}

function removeSelected() {
  if (!selected) return;
  scene.remove(selected);
  const i = nodes.indexOf(selected);
  if (i >= 0) nodes.splice(i, 1);
  selected = null;
}

function onPointerDown(event) {
  const rect = container.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(nodes);
  if (intersects.length) {
    selected = intersects[0].object;
    dragging = true;
  } else {
    const planeIntersects = raycaster.intersectObject(planeMesh);
    if (planeIntersects.length) {
      addNode(planeIntersects[0].point);
    }
  }
}

function onPointerMove(event) {
  if (!dragging || !selected) return;
  const rect = container.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const planeIntersect = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  if (planeIntersect) selected.position.copy(planeIntersect);
}

function onPointerUp() {
  dragging = false;
}

function onKeyDown(e) {
  if (e.key === 'Delete') {
    removeSelected();
  }
}

container.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('keydown', onKeyDown);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

