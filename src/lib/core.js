import * as THREE from 'three/webgpu'
import { model } from '@/lib/utils/loader'
import * as Helpers from '@/lib/utils/helpers'
import GUI from 'lil-gui'

import { add_web_camera } from '@/lib/utils/ai/connect_camera'
import * as Detect from '@/lib/utils/ai/detections'

/*
 * SIMPLIFIED CORE SYSTEM:
 * - Basic face tracking and glasses positioning
 * - Robust scaling that works across all devices and face sizes
 * - Manual Y rotation override only
 * - Ear anchoring for realistic glasses positioning
 * - No complex features or settings
 */

let camera, 
    scene,
    renderer,
    canvas

// AI
let video,
canvas_video,
ctx,
face_landmarker,
results
let mode = 'VIDEO'
let GENERAL = {
  settings: false,
}

// Variables for sunglasses positioning
let sunglassesModel = null
let sunglassesInitialized = false
let lastValidPosition = null

// Simplified settings object - only essential controls
let settings_glasses = {
  // Base scale multiplier for all scaling calculations
  baseScaleMultiplier: 3.9,
  // Manual rotation override - Y rotation only
  sunglassesRotationY: 1.25,
  // Ear anchoring controls
  earAnchored: true, // Enable full ear anchoring (temple piece sticks to ear)
  earAttachmentOffset: 0.8 // Distance from ear to front of glasses (temple piece length)
}

function init(canvas_id) {
  // NOTE: Specify a canvas which is already created in the HTML.
  canvas = document.getElementById(canvas_id)

  scene = new THREE.Scene()

  camera = Helpers.init_perspective_camera({ canvas })
  camera.position.set(0, 0, 7)

  renderer = Helpers.init_renderer({ canvas })
  
  add_lights()
  add_model()

  window.addEventListener('resize', () => on_window_resize(), false)
  GENERAL.settings ? settings() : null

  connect_ai_camera()
}

async function connect_ai_camera () {
  try {
    // NOTE: Await for camera req
    const { mesh, video_source } = await add_web_camera()
    scene.add(mesh)
    video = video_source

    // NOTE: Create secondary canvas to flip video
    canvas_video = document.createElement('canvas')
    
    ctx = canvas_video.getContext('2d')
    
    canvas_video.width = video.videoWidth
    canvas_video.height = video.videoHeight

    // NOTE: Init camera with video sizes
    camera = Helpers.init_ortografic_camera({ 
      width: video.videoWidth, 
      height: video.videoHeight
    })
    
    // Position camera properly to see both dots and sunglasses
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    
    console.log('Camera setup:', {
      position: camera.position,
      width: video.videoWidth,
      height: video.videoHeight,
      cameraType: camera.type
    })

    // NOTE: Await for face model
    face_landmarker = await Detect.faces(mode)

    is_loaded()

    // NOTE: Init animatations functions
    __RAF()

  } catch (error) {
    console.error('Error initializing application:', error)
  }
}

function is_loaded () {
  const loading = document.getElementById('loading')
  loading.style.display = 'none'
  
  // Make reset function globally accessible
  makeResetFunctionGlobal()
}

function add_model () {
  console.log('Adding sunglasses model to scene:', model)
  scene.add(model)
  
  // Store reference to sunglasses model
  sunglassesModel = model
  
  // Make sunglasses visible by default and position them in view
  if (sunglassesModel) {
    sunglassesModel.visible = true
    sunglassesModel.position.set(0, 0, 0)
    sunglassesModel.scale.setScalar(0.6)
    console.log('Sunglasses model added and made visible')
    
    // Test: Position sunglasses in a visible location for testing
    setTimeout(() => {
      if (sunglassesModel) {
        sunglassesModel.position.set(0, 0, -2)
        sunglassesModel.scale.setScalar(1.0)
        console.log('Sunglasses positioned for testing at:', sunglassesModel.position)
      }
    }, 1000)
    
  } else {
    console.error('Sunglasses model is null!')
  }
}

// Robust scaling function that works across all devices
function calculateRobustScale(eyeDistance, videoWidth, videoHeight) {
  // Base scale from settings
  let finalScale = settings_glasses.baseScaleMultiplier || 2.4
  
  // 1. DEVICE-ADAPTIVE SCALING: Adjust based on screen/video dimensions
  // Standard reference: 640x480 = scale 1.0
  const standardWidth = 640
  const standardHeight = 480
  
  // Calculate scale factors for width and height
  const widthScale = videoWidth / standardWidth
  const heightScale = videoHeight / standardHeight
  
  // Use the smaller scale factor to prevent glasses from being too large
  const deviceScale = Math.min(widthScale, heightScale)
  
  // Apply device scaling with smart limits
  const deviceScaleFactor = Math.max(0.3, Math.min(2.5, deviceScale))
  finalScale *= deviceScaleFactor
  
  // 2. FACE-PROPORTIONAL SCALING: Adjust based on actual face measurements
  if (eyeDistance) {
    // Normalize eye distance to a reasonable range
    // Standard reference: 0.3 = scale 1.0
    const standardEyeDistance = 0.3
    const faceScaleFactor = eyeDistance / standardEyeDistance
    
    // Apply face scaling with limits
    const clampedFaceScale = Math.max(0.6, Math.min(1.8, faceScaleFactor))
    finalScale *= clampedFaceScale
  }
  
  // 3. APPLY SMART LIMITS to prevent extreme sizes
  const minScale = 0.3
  const maxScale = 5.0
  finalScale = Math.max(minScale, Math.min(maxScale, finalScale))
  
  return finalScale
}

function settings () {
  // Use the global settings object
  let gui = new GUI()

  // Sunglasses positioning controls
  let sunglassesFolder = gui.addFolder('Sunglasses Positioning')
  
  // Base scale multiplier control
  sunglassesFolder.add(settings_glasses, 'baseScaleMultiplier', 0.1, 5.0, 0.1).name('Base Scale Multiplier').onChange(function(value) {
    console.log('Base scale multiplier:', value)
    if (sunglassesModel && lastValidPosition) {
      // Recalculate scale with new multiplier
      const newScale = calculateRobustScale(
        lastValidPosition.eyeDistance || 0.3, 
        video ? video.videoWidth : 640, 
        video ? video.videoHeight : 480
      )
      sunglassesModel.scale.setScalar(newScale)
    }
  })
  
  // Manual rotation override - Y rotation only
  let manualRotationFolder = gui.addFolder('Manual Rotation Override')
  manualRotationFolder.add(settings_glasses, 'sunglassesRotationY', -Math.PI, Math.PI, 0.1).name('Rotation Y').onChange(function(value) {
    console.log('Manual Y rotation:', value)
  })
  
  // Ear anchoring controls
  let earAnchoringFolder = gui.addFolder('Ear Anchoring')
  earAnchoringFolder.add(settings_glasses, 'earAnchored').name('Ear Anchored').onChange(function(value) {
    console.log('Ear anchoring:', value ? 'enabled' : 'disabled')
  })
  
  earAnchoringFolder.add(settings_glasses, 'earAttachmentOffset', 0.1, 2.0, 0.1).name('Ear Attachment Offset').onChange(function(value) {
    console.log('Ear attachment offset:', value)
  })
  
  manualRotationFolder.open()
  earAnchoringFolder.open()
  sunglassesFolder.open()
}

function add_lights () {
  const light = new THREE.AmbientLight(0x404040, 1)
  scene.add(light)
  
  // Add directional light for better visibility
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(0, 1, 1)
  scene.add(directionalLight)
}

// Make reset function globally accessible for demo page
function makeResetFunctionGlobal() {
  if (typeof window !== 'undefined') {
    console.log('Reset function made globally accessible')
  }
}

function position_sunglasses_on_eyes(landmarks) {
  if (!sunglassesModel || !landmarks || landmarks.length < 468) {
    // Don't hide sunglasses if no landmarks, just keep them in current position
    if (sunglassesModel && !sunglassesModel.visible) {
      console.log('Making sunglasses visible (no landmarks detected)')
      sunglassesModel.visible = true
    }
    return
  }

  try {
    // MediaPipe face landmarks for eyes (approximate indices)
    // Left eye center (average of left eye landmarks)
    const leftEyeLandmarks = [
      landmarks[33],  // Left eye left corner
      landmarks[7],   // Left eye top
      landmarks[163], // Left eye bottom
      landmarks[144], // Left eye right corner
      landmarks[145], // Left eye inner corner
      landmarks[153], // Left eye outer corner
    ]
    
    // Right eye center (average of right eye landmarks)
    const rightEyeLandmarks = [
      landmarks[362], // Right eye left corner
      landmarks[382], // Right eye top
      landmarks[381], // Right eye bottom
      landmarks[374], // Right eye right corner
      landmarks[373], // Right eye inner corner
      landmarks[380], // Right eye outer corner
    ]
    
    // Validate that we have valid eye landmarks
    if (!leftEyeLandmarks.every(lm => lm && typeof lm.x === 'number') || 
        !rightEyeLandmarks.every(lm => lm && typeof lm.x === 'number')) {
      console.warn('Invalid eye landmarks detected')
      return
    }
    
    // Calculate eye centers
    const leftEyeCenter = {
      x: leftEyeLandmarks.reduce((sum, lm) => sum + lm.x, 0) / leftEyeLandmarks.length,
      y: leftEyeLandmarks.reduce((sum, lm) => sum + lm.y, 0) / leftEyeLandmarks.length,
      z: leftEyeLandmarks.reduce((sum, lm) => sum + lm.z, 0) / leftEyeLandmarks.length
    }
    
    const rightEyeCenter = {
      x: rightEyeLandmarks.reduce((sum, lm) => sum + lm.x, 0) / rightEyeLandmarks.length,
      y: rightEyeLandmarks.reduce((sum, lm) => sum + lm.y, 0) / rightEyeLandmarks.length,
      z: rightEyeLandmarks.reduce((sum, lm) => sum + lm.z, 0) / rightEyeLandmarks.length
    }
    
    // Calculate center point between eyes
    const centerX = (leftEyeCenter.x + rightEyeCenter.x) / 2
    const centerY = (leftEyeCenter.y + rightEyeCenter.y) / 2
    const centerZ = (leftEyeCenter.z + rightEyeCenter.z) / 2
    
    // Calculate eye distance for scaling
    const eyeDistance = Math.sqrt(
      Math.pow(rightEyeCenter.x - leftEyeCenter.x, 2) +
      Math.pow(rightEyeCenter.y - leftEyeCenter.y, 2)
    )
    
    // Validate eye distance (should be reasonable)
    if (eyeDistance < 0.1 || eyeDistance > 0.5) {
      console.warn('Eye distance out of reasonable range:', eyeDistance)
      return
    }
    
    // Calculate head rotation angle (tilt) - but we won't use this for sunglasses rotation
    // to keep them fixed on the head during up/down movement
    const headTilt = -Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x)
    
    // Calculate head yaw (left-right rotation) using nose bridge
    const noseBridge = landmarks[168] // Nose bridge landmark
    let headYaw = 0
    if (noseBridge && typeof noseBridge.z === 'number' && typeof noseBridge.x === 'number') {
      headYaw = Math.atan2(noseBridge.z - centerZ, noseBridge.x - centerX)
    }
    
    // Calculate natural Z-axis rotation (roll) based ONLY on iris alignment
    // Use specific iris landmarks for accurate roll calculation
    const leftIris = landmarks[468]  // Left iris center
    const rightIris = landmarks[473] // Right iris center
    
    let naturalRoll = 0
    if (leftIris && rightIris && 
        typeof leftIris.x === 'number' && typeof leftIris.y === 'number' &&
        typeof rightIris.x === 'number' && typeof rightIris.y === 'number') {
      
      // Calculate the angle of the line between irises relative to horizontal
      // This gives us the natural roll rotation of the head
      const irisDeltaX = rightIris.x - leftIris.x
      const irisDeltaY = rightIris.y - leftIris.y
      
      // Calculate roll angle in NDC coordinates (0-1 range)
      // In NDC: (0,0) is top-left, (1,1) is bottom-right
      // We want the angle relative to horizontal (X-axis)
      naturalRoll = Math.atan2(irisDeltaY, irisDeltaX)
      
      // Adjust for NDC coordinate system where Y increases downward
      // This ensures proper roll calculation relative to horizontal
      naturalRoll = -naturalRoll
      
    } else {
      // If iris landmarks are not available, don't calculate roll
      console.log('Iris landmarks not available, roll rotation disabled')
      naturalRoll = 0
    }
    
    // Simple rotation calculations - no complex natural rotation system
    let autoYaw = headYaw
    let autoPitch = headTilt
    let autoRoll = naturalRoll
    
    // Use ear landmarks for more stable positioning (less affected by facial expressions)
    // Left ear: landmark 234, Right ear: landmark 454
    const leftEar = landmarks[234]
    const rightEar = landmarks[454]
    
         // Use main ear landmarks and nose center for positioning
     const noseCenter = landmarks[197] // Nose center for glasses positioning
    
    // Calculate ear-based center for more stable positioning
    let stableCenterX = centerX
    let stableCenterY = centerY
    
    if (leftEar && rightEar && typeof leftEar.x === 'number' && typeof rightEar.x === 'number') {
      // Use ears for horizontal positioning (more stable than eyes)
      stableCenterX = (leftEar.x + rightEar.x) / 2
      // Keep vertical positioning from eyes (more natural for glasses)
      stableCenterY = centerY
    }
    
    // Use nose center for final positioning if available
    if (noseCenter && typeof noseCenter.x === 'number' && typeof noseCenter.y === 'number') {
      stableCenterX = noseCenter.x
      stableCenterY = noseCenter.y
    }
    
    // Convert MediaPipe coordinates (0-1) to Three.js scene coordinates
    // MediaPipe coordinates: (0,0) is top-left, (1,1) is bottom-right
    // Three.js coordinates: (-width/2, height/2) is top-left, (width/2, -height/2) is bottom-right
    const sceneX = (stableCenterX - 0.5) * video.videoWidth
    const sceneY = (0.5 - stableCenterY) * video.videoHeight
    
    // Simple depth calculation - no complex features
    let sceneZ = centerZ * 20 - 2
    const finalDepthOffset = 1 // Fixed depth offset
    
         // Calculate robust scale that works across all devices
     const robustScale = calculateRobustScale(eyeDistance, video.videoWidth, video.videoHeight)
    
         // Store valid position for debugging
     lastValidPosition = {
       x: sceneX,
       y: sceneY,
       z: sceneZ - finalDepthOffset,
       scale: robustScale, // Use robust scale
       eyeDistance: eyeDistance, // Store eye distance for scaling recalculation
       tilt: headTilt,
       yaw: headYaw,
       naturalRoll: naturalRoll,
       autoYaw: autoYaw,
       autoPitch: autoPitch,
       autoRoll: autoRoll
     }
    
    // Position sunglasses with stable depth
    sunglassesModel.position.set(
      sceneX,
      sceneY,
      sceneZ - finalDepthOffset
    )
    
         // Scale sunglasses using robust scaling system
     sunglassesModel.scale.setScalar(robustScale)
    
    // Only Y rotation from manual override is used
    const manualRotationY = settings_glasses ? settings_glasses.sunglassesRotationY : 0
    
         // Apply ear-anchored positioning and rotation if enabled
     if (settings_glasses.earAnchored && leftEar && rightEar && noseCenter) {
       // Use the 3-point system: left ear, right ear, and nose
       // Calculate center between ears for horizontal positioning
       const earCenterX = (leftEar.x + rightEar.x) / 2
       const earCenterY = (leftEar.y + rightEar.y) / 2
       const earCenterZ = (leftEar.z + rightEar.z) / 2
       
       // Use nose center for vertical positioning (more natural for glasses)
       const finalCenterX = noseCenter.x
       const finalCenterY = noseCenter.y
       const finalCenterZ = noseCenter.z
       
       // Convert to scene coordinates
       const earSceneX = (earCenterX - 0.5) * video.videoWidth
       const earSceneY = (0.5 - earCenterY) * video.videoHeight
       const earSceneZ = earCenterZ * 20 - 2
       
       const noseSceneX = (finalCenterX - 0.5) * video.videoWidth
       const noseSceneY = (0.5 - finalCenterY) * video.videoHeight
       const noseSceneZ = finalCenterZ * 20 - 2
       
       // FULL EAR ANCHORING: Temple piece sticks to ear, front of glasses follows head movement
       const earAttachmentOffset = settings_glasses.earAttachmentOffset || 0.8
       
       // Calculate temple piece offset (how far front of glasses is from ear)
       const templeOffsetX = earAttachmentOffset * Math.cos(autoYaw) // Adjust for head yaw
       const templeOffsetZ = earAttachmentOffset * Math.sin(autoYaw) // Adjust for head yaw
       
       // Position glasses with temple piece anchored to ear point, but front follows nose
       sunglassesModel.position.set(
         earSceneX + templeOffsetX,  // Ear X + offset for front of glasses
         noseSceneY,                  // Use nose Y for vertical positioning
         earSceneZ - finalDepthOffset + templeOffsetZ // Ear Z + offset + depth
       )
       
       // Apply rotations around the ear pivot point
       sunglassesModel.rotation.x = autoPitch
       sunglassesModel.rotation.y = autoYaw + (settings_glasses.sunglassesRotationY || 0)
       sunglassesModel.rotation.z = autoRoll
       
     } else {
       // Standard positioning and rotation (no ear anchoring)
       sunglassesModel.position.set(
         sceneX,
         sceneY,
         sceneZ - finalDepthOffset
       )
       
       // Apply only Y rotation from manual override, keep other rotations natural
       sunglassesModel.rotation.x = autoPitch
       sunglassesModel.rotation.y = autoYaw + (settings_glasses.sunglassesRotationY || 0)
       sunglassesModel.rotation.z = autoRoll
     }
    
    // Make sunglasses visible
    sunglassesModel.visible = true
    
    if (!sunglassesInitialized) {
      sunglassesInitialized = true
      console.log('Sunglasses positioned on eyes')
    }
    
  } catch (error) {
    console.error('Error positioning sunglasses:', error)
  }
}

function init_draw(landmarks) {
  // Position sunglasses on eyes
  position_sunglasses_on_eyes(landmarks)
}

async function __RAF () {
  const current_time = performance.now()
    try {

      if (mode === 'VIDEO') {
        ctx.scale(-1, 1)
        ctx.drawImage(video, -canvas_video.width, 0, canvas_video.width, canvas_video.height)

        results = await face_landmarker.detectForVideo(canvas_video, current_time)
        ctx.restore()
      }

      if (results.faceLandmarks && results.faceLandmarks[0]) {
        init_draw(results.faceLandmarks[0])
      } else {
        console.log('No face landmarks detected')
        // Don't hide sunglasses when no face is detected, just keep them visible
        if (sunglassesModel && !sunglassesModel.visible) {
          console.log('Making sunglasses visible (no face detected)')
          sunglassesModel.visible = true
        }
      }

    } catch (error) {
      console.error('Error detecting face landmarks:', error)
      // Don't hide sunglasses on error, keep them visible
      if (sunglassesModel && !sunglassesModel.visible) {
        console.log('Making sunglasses visible (error occurred)')
        sunglassesModel.visible = true
      }
    } finally {
      // Continue animation loop
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
