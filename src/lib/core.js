import * as THREE from 'three/webgpu'
import { model } from '@/lib/utils/loader'
import * as Helpers from '@/lib/utils/helpers'
import GUI from 'lil-gui'

import { add_web_camera } from '@/lib/utils/ai/connect_camera'
import * as Detect from '@/lib/utils/ai/detections'

/*
 * IMPROVED MVP SYSTEM:
 * - MediaPipe Face Landmarker with facialTransformationMatrix for head pose
 * - Three.js scene layered on top of video
 * - Glasses anchored to head with proper positioning and rotation
 * - Smoothing for position, rotation, and scale
 * - Scale based on interpupillary distance
 */

// ---------- config ----------
const VIDEO_W = 1280, VIDEO_H = 720;
const SMOOTHING = { pos: 0.35, rot: 0.35, scale: 0.35 }; // [0..1], higher = snappier
const TARGET_FPS = 60;

let camera, scene, renderer, canvas

// AI
let video, canvas_video, ctx, face_landmarker, results
let mode = 'VIDEO'
let lastTs = -1

// Glasses and anchor
let sunglassesModel = null
let anchor = null
let fitted = false

// Settings
let settings_glasses = {
  baseScaleMultiplier: 1.3,
  manualRotationY: 0,
  // Local offsets of the glasses relative to the head anchor (in orthographic world units)
  offsetX: 0,
  offsetY: 0,
  offsetZ: -68,
  depthOffset: 100, // Depth offset for glasses positioning
  // Scale method: 'ipd' (interpupillary distance) or 'bbox' (face bounding box)
  scaleMethod: 'bbox',
  smoothing: { ...SMOOTHING }
}

// Smoothing helpers
class SmoothedVec3 {
  constructor(x=0,y=0,z=0){ this.v = new THREE.Vector3(x,y,z); }
  to(target, alpha){ 
    this.v.set( 
      this.lerp(this.v.x, target.x, alpha),
      this.lerp(this.v.y, target.y, alpha),
      this.lerp(this.v.z, target.z, alpha) 
    ); 
  }
  lerp(a, b, t) { return a + (b - a) * t; }
}

class SmoothedQuat {
  constructor(){ this.q = new THREE.Quaternion(); }
  to(target, alpha){ this.q.slerp(target, alpha); }
}

class SmoothedScalar {
  constructor(s=1){ this.s = s; }
  to(target, alpha){ this.s = this.lerp(this.s, target, alpha); }
  lerp(a, b, t) { return a + (b - a) * t; }
}

const smoothPos = new SmoothedVec3(0,0,0);
const smoothRot = new SmoothedQuat();
const smoothScale = new SmoothedScalar(1);

// Indices for key points (MediaPipe FaceMesh canonical)
const IDX_RIGHT_OUTER = 33;   // right eye outer
const IDX_LEFT_OUTER  = 263;  // left eye outer
const IDX_NOSE_TIP    = 4;    // nose tip

// Temporary objects for calculations
const tmpMatrix = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

// Correction from MediaPipe head frame to three.js
const correction = new THREE.Quaternion()
  .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0))); // flip Yaw 180°

function init(canvas_id) {
  canvas = document.getElementById(canvas_id)
  
  scene = new THREE.Scene()
  
  camera = Helpers.init_perspective_camera({ canvas })
  camera.position.set(0, 0, 1.8)
  
  renderer = Helpers.init_renderer({ canvas })
  
  add_lights()
  add_model()
  
  window.addEventListener('resize', () => on_window_resize(), false)
  
  // Initialize settings GUI
  settings()
  
  connect_ai_camera()
}

async function connect_ai_camera () {
  try {
    const { mesh, video_source } = await add_web_camera()
    scene.add(mesh)
    video = video_source

    // Create secondary canvas to flip video
    canvas_video = document.createElement('canvas')
    ctx = canvas_video.getContext('2d')
    
    canvas_video.width = video.videoWidth
    canvas_video.height = video.videoHeight

    // Update camera for video dimensions
    camera = Helpers.init_ortografic_camera({ 
      width: video.videoWidth, 
      height: video.videoHeight
    })
    
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    
    console.log('Camera setup:', {
      position: camera.position,
      width: video.videoWidth,
      height: video.videoHeight,
      cameraType: camera.type
    })

    // Initialize face landmarker
    face_landmarker = await Detect.faces(mode)

    is_loaded()
    __RAF()

  } catch (error) {
    console.error('Error initializing application:', error)
  }
}

function is_loaded () {
  const loading = document.getElementById('loading')
  if (loading) loading.style.display = 'none'
  
  makeResetFunctionGlobal()
}

function add_model () {
  console.log('Adding sunglasses model to scene:', model)
  
  // Create anchor for head tracking
  anchor = new THREE.Object3D()
  scene.add(anchor)
  
  // Add sunglasses as child of anchor
  sunglassesModel = model
  if (sunglassesModel) {
    anchor.add(sunglassesModel)
    sunglassesModel.visible = true
    sunglassesModel.position.set(0, 0.02, 0.02) // forward a bit, up a bit
    sunglassesModel.rotation.set(0, 0, 0)
    sunglassesModel.scale.setScalar(1.0)
    
    console.log('Sunglasses model added and anchored')
  } else {
    console.error('Sunglasses model is null!')
  }
}

// Compute distance between outer eye corners in normalized video space
function interpupillaryDistance(landmarks) {
  const a = landmarks[IDX_LEFT_OUTER];
  const b = landmarks[IDX_RIGHT_OUTER];
  if (!a || !b) return 1;
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy); // normalized [0..~0.2]
}

// Map normalized [0..1] video coords into a head-relative scale for your model
function ipdToModelScale(ipd) {
  // tune these mapping constants per your glasses model
  // When the face is close (ipd grows), make the glasses bigger.
  const min = 0.08, max = 0.18; // expected IPD band in normalized coords
  const t = THREE.MathUtils.clamp((ipd - min) / (max - min), 0, 1);
  return THREE.MathUtils.lerp(0.85, 1.35, t) * settings_glasses.baseScaleMultiplier;
}

// Alternative scaling using face bounding box dimensions (better for mobile)
function bboxToModelScale(landmarks) {
  if (!landmarks || landmarks.length < 2) return 1.0;
  
  // Find the bounding box of all face landmarks
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  
  for (let i = 0; i < landmarks.length; i++) {
    const point = landmarks[i];
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  
  // Calculate face width and height in normalized coordinates
  const faceWidth = maxX - minX;
  const faceHeight = maxY - minY;
  
  // Use the larger dimension for scaling (more stable)
  const faceSize = Math.max(faceWidth, faceHeight);
  
  // Map face size to model scale
  // Smaller face (farther from camera) = larger glasses
  // Larger face (closer to camera) = smaller glasses
  const minSize = 0.3, maxSize = 0.8; // expected face size range
  const t = THREE.MathUtils.clamp((faceSize - minSize) / (maxSize - minSize), 0, 1);
  
  // Invert the scale: closer face = smaller glasses
  const invertedT = 1 - t;
  return THREE.MathUtils.lerp(0.7, 1.4, invertedT) * settings_glasses.baseScaleMultiplier;
}

// Compute nose target position on the video plane in world coords
function updateGlassesPosition(landmarks) {
  if (!landmarks || !camera) return null;

  const left = landmarks[IDX_LEFT_OUTER];
  const right = landmarks[IDX_RIGHT_OUTER];
  if (!left || !right) return null;

  // Anchor at approximate nose bridge: midpoint between outer eye corners, nudged downward by a fraction of IPD
  const cx = (left.x + right.x) / 2;
  const cy = (left.y + right.y) / 2;
  const ipd = interpupillaryDistance(landmarks);
  const nx = cx;
  const ny = cy + ipd * 0.14; // tune: slightly below eye line toward the bridge

  // Map normalized image coords to world coords on the video plane (orthographic space)
  const worldX = (nx - 0.5) * (video?.videoWidth || canvas?.offsetWidth || 1);
  const worldY = (0.5 - ny) * (video?.videoHeight || canvas?.offsetHeight || 1);

  return new THREE.Vector3(worldX, worldY, 0);
}

function add_lights () {
  const light = new THREE.AmbientLight(0x404040, 1)
  scene.add(light)
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(0, 1, 1)
  scene.add(directionalLight)
}

function makeResetFunctionGlobal() {
  if (typeof window !== 'undefined') {
    console.log('Reset function made globally accessible')
  }
}

function settings () {
  let gui = new GUI()

  let sunglassesFolder = gui.addFolder('Sunglasses Positioning')
  
  sunglassesFolder.add(settings_glasses, 'baseScaleMultiplier', 0.1, 5.0, 0.1).name('Base Scale Multiplier')
  sunglassesFolder.add(settings_glasses, 'scaleMethod', ['ipd', 'bbox']).name('Scale Method')
  sunglassesFolder.add(settings_glasses, 'offsetX', -200, 200, 1).name('Offset X (px)')
  sunglassesFolder.add(settings_glasses, 'offsetY', -200, 200, 1).name('Offset Y (px)')
  sunglassesFolder.add(settings_glasses, 'offsetZ', -100, 100, 1).name('Offset Z')
  sunglassesFolder.add(settings_glasses, 'depthOffset', -100, 100, 1).name('Depth Offset')
  
  let smoothingFolder = gui.addFolder('Smoothing')
  smoothingFolder.add(settings_glasses.smoothing, 'pos', 0.1, 0.9, 0.05).name('Position Smoothing')
  smoothingFolder.add(settings_glasses.smoothing, 'rot', 0.1, 0.9, 0.05).name('Rotation Smoothing')
  smoothingFolder.add(settings_glasses.smoothing, 'scale', 0.1, 0.9, 0.05).name('Scale Smoothing')
  
  let manualFolder = gui.addFolder('Manual Override')
  manualFolder.add(settings_glasses, 'manualRotationY', -Math.PI, Math.PI, 0.1).name('Manual Y Rotation')
  
  sunglassesFolder.open()
  smoothingFolder.open()
  manualFolder.open()
}

async function __RAF () {
  const current_time = performance.now()
  if (lastTs < 0) lastTs = current_time

  try {
    if (mode === 'VIDEO') {
      ctx.save()
      ctx.clearRect(0, 0, canvas_video.width, canvas_video.height)
      ctx.translate(canvas_video.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, canvas_video.width, canvas_video.height)

      // Run the model at video frametimestamps for better sync
      results = await face_landmarker.detectForVideo(canvas_video, current_time)
      ctx.restore()
    }

    if (results && results.facialTransformationMatrixes && results.facialTransformationMatrixes.length) {
      // 1) pose from transformation matrix
      const m = results.facialTransformationMatrixes[0].data; // 16 floats
      tmpMatrix.fromArray(m);
      tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale);
      // apply correction (aligns your model's forward/up with head)
      tmpQuat.multiply(correction);

      // 2) scale from selected method (overrides matrix scale for model fit) and anchor position from 2D nose target
      let scale = 1.0;
      if (results.faceLandmarks?.[0]) {
        if (settings_glasses.scaleMethod === 'bbox') {
          scale = bboxToModelScale(results.faceLandmarks[0]);
        } else {
          scale = ipdToModelScale(interpupillaryDistance(results.faceLandmarks[0]));
        }
        // Compute nose target on video plane and drive anchor position with smoothing
        const targetNose = updateGlassesPosition(results.faceLandmarks[0]);
        if (targetNose) {
          smoothPos.to(targetNose, settings_glasses.smoothing.pos);
          anchor.position.copy(smoothPos.v);
        }
      }

      // 3) smooth rotation and scale; position already handled by nose target
      smoothRot.to(tmpQuat, settings_glasses.smoothing.rot);
      smoothScale.to(scale, settings_glasses.smoothing.scale);

      // 4) apply to anchor + child offsets
      anchor.quaternion.copy(smoothRot.q);
      anchor.scale.setScalar(smoothScale.s);
      
      // Apply manual Y rotation override
      if (sunglassesModel) {
        // Apply local offsets so the frame can be aligned to ears and nose
        sunglassesModel.position.set(
          settings_glasses.offsetX,
          settings_glasses.offsetY,
          settings_glasses.offsetZ + settings_glasses.depthOffset
        );
        sunglassesModel.rotation.y = settings_glasses.manualRotationY;
      }
    }

  } catch (error) {
    console.error('Error detecting face landmarks:', error)
  }

  render()
  requestAnimationFrame(__RAF)
}

function render () {
  renderer.renderAsync(scene, camera);
}

function on_window_resize() {
  camera.aspect = canvas.offsetWidth / canvas.offsetHeight
  camera.updateProjectionMatrix()
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight)
}

export { init, scene, camera, renderer, canvas, makeResetFunctionGlobal }
