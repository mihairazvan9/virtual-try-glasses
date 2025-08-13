import { FaceLandmarker, FilesetResolver } from "https://unpkg.com/@mediapipe/tasks-vision/vision_bundle.mjs";

// ---------- config ----------
const VIDEO_W = 1280, VIDEO_H = 720;
const SMOOTHING = { pos: 0.35, rot: 0.35, scale: 0.35 }; // [0..1], higher = snappier
const TARGET_FPS = 60;

// ---------- dom ----------
const video = document.getElementById("video");
const canvas = document.getElementById("three");
const loading = document.getElementById("loading");

// ---------- camera ----------
async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: "user", 
        width: { ideal: VIDEO_W }, 
        height: { ideal: VIDEO_H } 
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    // make sure dimensions are set
    await new Promise(r => video.onloadedmetadata ? (video.onloadedmetadata = r) : setTimeout(r, 200));
    console.log('Camera initialized:', video.videoWidth, 'x', video.videoHeight);
  } catch (error) {
    console.error('Error initializing camera:', error);
    loading.textContent = 'Camera error: ' + error.message;
  }
}

// ---------- three.js scene ----------
let scene, renderer, camera, anchor, glasses;

function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

  scene = new THREE.Scene();

  // camera that matches the video plane (simple perspective)
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(0, 0, 1.8);

  const light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.position.set(0, 1, 2);
  scene.add(light, new THREE.AmbientLight(0xffffff, 0.6));

  // anchor: the node we'll directly pose from MediaPipe (then kids for offsets)
  anchor = new THREE.Object3D();
  scene.add(anchor);

  // optional: debug head axis
  anchor.add(new THREE.AxesHelper(0.2));

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

async function loadGlasses(url = "/src/assets/sun_glasses.glb") {
  try {
    const loader = new THREE.GLTFLoader();
    const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
    glasses = gltf.scene;
    glasses.traverse(o => { 
      if (o.isMesh) { 
        o.frustumCulled = false; 
        o.castShadow = o.receiveShadow = true; 
      }
    });
    anchor.add(glasses);

    // initial offsets to sit on nose bridge; tune these for your model
    glasses.position.set(0, 0.02, 0.02);   // forward a bit, up a bit
    glasses.rotation.set(0, 0, 0);
    glasses.scale.setScalar(1.0);
    
    console.log('Glasses model loaded successfully');
  } catch (error) {
    console.error('Error loading glasses model:', error);
    // Create a simple cube as fallback
    const geometry = new THREE.BoxGeometry(0.1, 0.05, 0.3);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.7 });
    glasses = new THREE.Mesh(geometry, material);
    anchor.add(glasses);
    glasses.position.set(0, 0.02, 0.02);
    console.log('Using fallback cube glasses');
  }
}

// ---------- mediapipe face landmarker ----------
let faceLandmarker;
let lastTs = -1;

async function initFace() {
  try {
    const fileset = await FilesetResolver.forVisionTasks(
      // path to wasm assets (CDN ok)
      "https://unpkg.com/@mediapipe/tasks-vision/wasm"
    );

    faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
      },
      numFaces: 1,
      runningMode: "VIDEO",
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true, // <-- we use this for head pose
      outputFaceLandmarks: true // also handy for scale/anchor
    });
    
    console.log('Face landmarker initialized');
  } catch (error) {
    console.error('Error initializing face landmarker:', error);
    loading.textContent = 'Face detection error: ' + error.message;
  }
}

// ---------- pose/scale extraction + smoothing ----------
// simple exponential smoothing helpers (good enough for MVP)
function lerp(a, b, t) { return a + (b - a) * t; }

class SmoothedVec3 {
  constructor(x=0,y=0,z=0){ this.v = new THREE.Vector3(x,y,z); }
  to(target, alpha){ this.v.set( lerp(this.v.x, target.x, alpha),
                                 lerp(this.v.y, target.y, alpha),
                                 lerp(this.v.z, target.z, alpha) ); }
}
class SmoothedQuat {
  constructor(){ this.q = new THREE.Quaternion(); }
  to(target, alpha){ this.q.slerp(target, alpha); }
}
class SmoothedScalar {
  constructor(s=1){ this.s = s; }
  to(target, alpha){ this.s = lerp(this.s, target, alpha); }
}

const smoothPos = new SmoothedVec3(0,0,0);
const smoothRot = new SmoothedQuat();
const smoothScale = new SmoothedScalar(1);

// indices for outer eye corners (MediaPipe FaceMesh canonical)
const IDX_RIGHT_OUTER = 33;  // right eye outer
const IDX_LEFT_OUTER  = 263; // left eye outer

// compute distance between outer eye corners in normalized video space
function interpupillaryDistance(landmarks) {
  const a = landmarks[IDX_LEFT_OUTER];
  const b = landmarks[IDX_RIGHT_OUTER];
  if (!a || !b) return 1;
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy); // normalized [0..~0.2]
}

// map normalized [0..1] video coords into a head-relative scale for your model
function ipdToModelScale(ipd) {
  // tune these mapping constants per your glasses model
  // When the face is close (ipd grows), make the glasses bigger.
  const min = 0.08, max = 0.18; // expected IPD band in normalized coords
  const t = THREE.MathUtils.clamp((ipd - min) / (max - min), 0, 1);
  return THREE.MathUtils.lerp(0.85, 1.35, t);
}

// ---------- per-frame loop (video → face → pose → three) ----------
const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

// Correction from MediaPipe head frame to three.js.
// MediaPipe uses a right-handed camera coords; often you need a small fix.
// Start with identity; if glasses are rotated 90° or mirrored, tweak here.
const correction = new THREE.Quaternion() // rotate to align model with head
  .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0))); // example: flip Yaw 180°

async function tick() {
  const now = performance.now();
  if (lastTs < 0) lastTs = now;

  try {
    // run the model at video frametimestamps for better sync
    const res = faceLandmarker.detectForVideo(video, now);

    if (res && res.facialTransformationMatrixes && res.facialTransformationMatrixes.length) {
      // 1) pose from transformation matrix
      const m = res.facialTransformationMatrixes[0].data; // 16 floats
      tmpMatrix.fromArray(m); // if orientation seems off: try tmpMatrix.transpose()
      tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale);

      // apply correction (aligns your model's forward/up with head)
      tmpQuat.multiply(correction);

      // 2) scale from IPD (overrides matrix scale for model fit)
      let scale = 1.0;
      if (res.faceLandmarks?.[0]) {
        scale = ipdToModelScale(interpupillaryDistance(res.faceLandmarks[0]));
      }

      // 3) smooth
      smoothPos.to(tmpPos, SMOOTHING.pos);
      smoothRot.to(tmpQuat, SMOOTHING.rot);
      smoothScale.to(scale, SMOOTHING.scale);

      // 4) apply to anchor + child offsets
      anchor.position.copy(smoothPos.v);
      anchor.quaternion.copy(smoothRot.q);
      anchor.scale.setScalar(smoothScale.s);
    }

  } catch (error) {
    console.error('Error in detection loop:', error);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------- bootstrap everything ----------
(async function main(){
  try {
    await initCamera();
    initThree();
    await loadGlasses();
    await initFace();
    
    loading.style.display = 'none';
    requestAnimationFrame(tick);
    
    console.log('System initialized successfully!');
  } catch (error) {
    console.error('Error in main:', error);
    loading.textContent = 'Initialization error: ' + error.message;
  }
})();

