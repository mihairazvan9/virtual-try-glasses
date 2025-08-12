import * as THREE from 'three/webgpu'
import { model } from '@/lib/utils/loader'
import * as Helpers from '@/lib/utils/helpers'
import GUI from 'lil-gui'

import { add_web_camera } from '@/lib/utils/ai/connect_camera'
import * as Detect from '@/lib/utils/ai/detections'

/*
 * ROLL CALCULATION SYSTEM:
 * - Uses ONLY iris landmarks (468: left iris, 473: right iris)
 * - Calculates roll angle from the line between irises relative to horizontal
 * - Properly handles NDC coordinates (0-1 range, Y increases downward)
 * - Applies negative sign to correct for NDC coordinate system
 * - No fallback to eye centers - roll is disabled if iris landmarks unavailable
 * 
 * ROLL COMPENSATION SYSTEM:
 * - Prevents glasses from moving up/down during roll rotation
 * - Applies Y-axis compensation based on roll angle and model size
 * - Configurable strength (0 = no compensation, 1 = full compensation)
 * - Only activates when significant roll is detected (> 0.01 radians)
 * - Keeps glasses centered during head tilt for natural appearance
 * 
 * DYNAMIC SCALING SYSTEM:
 * - Automatically adjusts glasses size based on device and face characteristics
 * - Device-adaptive scaling: Adjusts based on screen/video dimensions
 * - Face-proportional scaling: Adjusts based on actual face measurements
 * - Smart limits: Prevents glasses from being too small or too large
 * - Works across different devices, screen sizes, and face proportions
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

  // Global settings object
  let settings_glasses = {
    // Sunglasses positioning controls
    sunglassesScale: 2.5,
    sunglassesDepth: 1, // Reduced from 3 to bring glasses closer
    sunglassesVisible: true,
    // Sunglasses rotation controls
    sunglassesRotationX: 0,
    sunglassesRotationY: 1.25,
    sunglassesRotationZ: 0,
    // Depth stabilization controls
    depthSmoothing: 0.3, // Controls how smooth Z changes are (0 = no smoothing, 1 = full smoothing)
    stableDepth: true,   // Enable/disable depth stabilization
    // Dynamic depth controls
    dynamicDepthEnabled: true, // Enable/disable dynamic depth adjustment based on head rotation
    dynamicDepthStrength: 0.7, // How much the depth changes with head rotation (0 = no change, 1 = full change)
    // Natural rotation controls - NEW IMPROVED SYSTEM
    naturalRotationEnabled: true, // Enable all natural rotations (pitch, yaw, roll)
    pitchRotationStrength: 0.8, // How much pitch rotation to apply (0 = none, 1 = full)
    yawRotationStrength: 1.0,   // How much yaw rotation to apply (0 = none, 1 = full)
    rollRotationStrength: 1.0,  // How much roll rotation to apply (0 = none, 1 = full)
    // Rotation smoothing for natural movement
    pitchSmoothing: 0.4, // Smoothing for pitch changes (0 = no smoothing, 1 = full smoothing)
    yawSmoothing: 0.3,  // Smoothing for yaw changes
    rollSmoothing: 0.4, // Smoothing for roll changes
    // Advanced rotation behavior
    pivotBasedRotation: true, // Enable pivot-based rotation around ear points for more stable X-axis rotation
    // Roll compensation to prevent glasses from moving up/down during roll
    rollCompensationEnabled: true, // Enable roll compensation to keep glasses centered
    rollCompensationStrength: 0.3, // How much compensation to apply (0 = none, 1 = full)
    // Ear anchoring controls
    earAnchored: true, // Enable full ear anchoring (temple piece sticks to ear)
    earAttachmentOffset: 0.8, // Distance from ear to front of glasses (temple piece length)
    // DYNAMIC SCALING SYSTEM - NEW FEATURE
    dynamicScalingEnabled: true, // Enable automatic scaling based on device and face size
    deviceAdaptiveScaling: true, // Scale based on screen dimensions
    faceProportionalScaling: true, // Scale based on actual face measurements
    minScale: 0.5, // Minimum scale factor (prevents glasses from being too small)
    maxScale: 3.0, // Maximum scale factor (prevents glasses from being too large)
    baseScaleMultiplier: 1.5, // Base multiplier for all scaling calculations
    debugMode: false
  }


function init(canvas_id) {
  // NOTE: Specify a canvas which is already created in the HTML.
  canvas = document.getElementById(canvas_id)

  scene = new THREE.Scene()

  camera = Helpers.init_perspective_camera({ canvas })
  camera.position.set(0, 0, 7)
  // camera.lookAt(0, 0, 0)

  renderer = Helpers.init_renderer({ canvas })
  


  add_lights()
  add_model()

  window.addEventListener('resize', () => on_window_resize(), false)
  GENERAL.settings ? settings() : null

  connect_ai_camera()
  
  // Start the animation loop
  // animate()
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
  // const ui = [...document.getElementsByClassName('editor-ui')]
  loading.style.display = 'none'
  // ui[0].style.display = 'flex'
  // ui[1].style.display = 'flex'

  // crate_material()
  // Draw.create_canvas_for_shape()
  
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
        // debug_sunglasses_status()
      }
    }, 1000)
    
  } else {
    console.error('Sunglasses model is null!')
  }
}

// NEW FUNCTION: Calculate dynamic scaling based on device and face characteristics
function calculateDynamicScale(eyeDistance, videoWidth, videoHeight) {
  if (!settings_glasses || !settings_glasses.dynamicScalingEnabled) {
    return settings_glasses ? settings_glasses.sunglassesScale : 0.6
  }
  
  let finalScale = settings_glasses.baseScaleMultiplier || 1.0
  
  // 1. DEVICE-ADAPTIVE SCALING: Adjust based on screen/video dimensions
  if (settings_glasses.deviceAdaptiveScaling) {
    // Calculate device scale factor based on video dimensions
    // Standard reference: 640x480 = scale 1.0
    const standardWidth = 640
    const standardHeight = 480
    
    // Calculate scale factors for width and height
    const widthScale = videoWidth / standardWidth
    const heightScale = videoHeight / standardHeight
    
    // Use the smaller scale factor to prevent glasses from being too large
    const deviceScale = Math.min(widthScale, heightScale)
    
    // Apply device scaling with limits
    const deviceScaleFactor = Math.max(0.5, Math.min(2.0, deviceScale))
    finalScale *= deviceScaleFactor
    
    if (settings_glasses.debugMode) {
      console.log('Device scaling:', {
        videoWidth, videoHeight,
        widthScale: widthScale.toFixed(3),
        heightScale: heightScale.toFixed(3),
        deviceScale: deviceScale.toFixed(3),
        deviceScaleFactor: deviceScaleFactor.toFixed(3)
      })
    }
  }
  
  // 2. FACE-PROPORTIONAL SCALING: Adjust based on actual face measurements
  if (settings_glasses.faceProportionalScaling && eyeDistance) {
    // Normalize eye distance to a reasonable range
    // Standard reference: 0.3 = scale 1.0
    const standardEyeDistance = 0.3
    const faceScaleFactor = eyeDistance / standardEyeDistance
    
    // Apply face scaling with limits
    const clampedFaceScale = Math.max(0.7, Math.min(1.5, faceScaleFactor))
    finalScale *= clampedFaceScale
    
    if (settings_glasses.debugMode) {
      console.log('Face scaling:', {
        eyeDistance: eyeDistance.toFixed(4),
        standardEyeDistance,
        faceScaleFactor: faceScaleFactor.toFixed(3),
        clampedFaceScale: clampedFaceScale.toFixed(3)
      })
    }
  }
  
  // 3. APPLY MIN/MAX LIMITS
  const minScale = settings_glasses.minScale || 0.5
  const maxScale = settings_glasses.maxScale || 3.0
  finalScale = Math.max(minScale, Math.min(maxScale, finalScale))
  
  // 4. APPLY BASE SCALE FROM SETTINGS
  finalScale *= (settings_glasses.sunglassesScale || 0.6)
  
  if (settings_glasses.debugMode) {
    console.log('Final dynamic scale calculation:', {
      baseScale: settings_glasses.sunglassesScale,
      finalScale: finalScale.toFixed(3),
      minScale, maxScale,
      deviceAdaptive: settings_glasses.deviceAdaptiveScaling,
      faceProportional: settings_glasses.faceProportionalScaling
    })
  }
  
  return finalScale
}




function settings () {
  // Use the global settings object
  let gui = new GUI()

  // Sunglasses positioning controls
  let sunglassesFolder = gui.addFolder('Sunglasses Positioning')
  // Dynamic scaling controls
  let scalingFolder = sunglassesFolder.addFolder('Dynamic Scaling')
  scalingFolder.add(settings_glasses, 'dynamicScalingEnabled').name('Enable Dynamic Scaling').onChange(function(value) {
    console.log('Dynamic scaling:', value ? 'enabled' : 'disabled')
  })
  
  scalingFolder.add(settings_glasses, 'deviceAdaptiveScaling').name('Device Adaptive').onChange(function(value) {
    console.log('Device adaptive scaling:', value ? 'enabled' : 'disabled')
  })
  
  scalingFolder.add(settings_glasses, 'faceProportionalScaling').name('Face Proportional').onChange(function(value) {
    console.log('Face proportional scaling:', value ? 'enabled' : 'disabled')
  })
  
  scalingFolder.add(settings_glasses, 'baseScaleMultiplier', 0.1, 3.0, 0.1).name('Base Multiplier').onChange(function(value) {
    console.log('Base scale multiplier:', value)
  })
  
  scalingFolder.add(settings_glasses, 'minScale', 0.1, 2.0, 0.1).name('Min Scale').onChange(function(value) {
    console.log('Minimum scale:', value)
  })
  
  scalingFolder.add(settings_glasses, 'maxScale', 1.0, 5.0, 0.1).name('Max Scale').onChange(function(value) {
    console.log('Maximum scale:', value)
  })
  
  scalingFolder.open()
  
  sunglassesFolder.add(settings_glasses, 'sunglassesScale', 0.1, 5.0, 0.1).name('Base Scale').onChange(function(value) {
    if (sunglassesModel) {
      // Update scale if sunglasses are visible
      if (sunglassesModel.visible && lastValidPosition) {
        // Recalculate dynamic scale with new base scale
        const newDynamicScale = calculateDynamicScale(
          lastValidPosition.eyeDistance || 0.3, 
          video ? video.videoWidth : 640, 
          video ? video.videoHeight : 480
        )
        sunglassesModel.scale.setScalar(newDynamicScale)
      }
    }
  })
  
  sunglassesFolder.add(settings_glasses, 'sunglassesDepth', -10, 10, 0.5).name('Depth Offset').onChange(function(value) {
    if (sunglassesModel && lastValidPosition) {
      sunglassesModel.position.z = lastValidPosition.z + (lastValidPosition.z - (lastValidPosition.z - 3)) + value
    }
  })
  
  // Depth stabilization controls
  let depthFolder = sunglassesFolder.addFolder('Depth Stabilization')
  depthFolder.add(settings_glasses, 'stableDepth').name('Enable Stabilization').onChange(function(value) {
    console.log('Depth stabilization:', value ? 'enabled' : 'disabled')
  })
  
  depthFolder.add(settings_glasses, 'depthSmoothing', 0, 1, 0.05).name('Smoothing Factor').onChange(function(value) {
    console.log('Depth smoothing factor:', value)
  })
  
      // Dynamic depth controls
    depthFolder.add(settings_glasses, 'dynamicDepthEnabled').name('Dynamic Depth').onChange(function(value) {
      console.log('Dynamic depth adjustment:', value ? 'enabled' : 'disabled')
    })
    
    depthFolder.add(settings_glasses, 'dynamicDepthStrength', 0, 1, 0.1).name('Dynamic Strength').onChange(function(value) {
      console.log('Dynamic depth strength:', value)
    })
    
    // Advanced rotation behavior
    
    depthFolder.add(settings_glasses, 'pivotBasedRotation').name('Pivot Rotation').onChange(function(value) {
      console.log('Pivot-based rotation:', value ? 'enabled' : 'disabled')
    })
    
    // Roll compensation controls
    depthFolder.add(settings_glasses, 'rollCompensationEnabled').name('Roll Compensation').onChange(function(value) {
      console.log('Roll compensation:', value ? 'enabled' : 'disabled')
    })
    
    depthFolder.add(settings_glasses, 'rollCompensationStrength', 0, 1, 0.05).name('Roll Compensation Strength').onChange(function(value) {
      console.log('Roll compensation strength:', value)
    })
    
    depthFolder.add(settings_glasses, 'earAttachmentOffset', 0.1, 2.0, 0.1).name('Ear Attachment Offset').onChange(function(value) {
      console.log('Ear attachment offset:', value)
    })
    
    depthFolder.add(settings_glasses, 'earAnchored').name('Ear Anchored').onChange(function(value) {
      console.log('Ear anchoring:', value ? 'enabled' : 'disabled')
    })
    
    // Natural rotation controls - NEW IMPROVED SYSTEM
    let rotationFolder = sunglassesFolder.addFolder('Natural Rotation System')
    rotationFolder.add(settings_glasses, 'naturalRotationEnabled').name('Enable Natural Rotation').onChange(function(value) {
      console.log('Natural rotation system:', value ? 'enabled' : 'disabled')
    })
    
    rotationFolder.add(settings_glasses, 'pitchRotationStrength', 0, 2, 0.1).name('Pitch Strength (X)').onChange(function(value) {
      console.log('Pitch rotation strength:', value)
    })
    
    rotationFolder.add(settings_glasses, 'yawRotationStrength', 0, 2, 0.1).name('Yaw Strength (Y)').onChange(function(value) {
      console.log('Yaw rotation strength:', value)
    })
    
    rotationFolder.add(settings_glasses, 'rollRotationStrength', 0, 2, 0.1).name('Roll Strength (Z)').onChange(function(value) {
      console.log('Roll rotation strength:', value)
    })
    
    // Rotation smoothing controls
    let smoothingFolder = rotationFolder.addFolder('Rotation Smoothing')
    smoothingFolder.add(settings_glasses, 'pitchSmoothing', 0, 1, 0.05).name('Pitch Smoothing').onChange(function(value) {
      console.log('Pitch smoothing factor:', value)
    })
    
    smoothingFolder.add(settings_glasses, 'yawSmoothing', 0, 1, 0.05).name('Yaw Smoothing').onChange(function(value) {
      console.log('Yaw smoothing factor:', value)
    })
    
    smoothingFolder.add(settings_glasses, 'rollSmoothing', 0, 1, 0.05).name('Roll Smoothing').onChange(function(value) {
      console.log('Roll smoothing factor:', value)
    })
    
    rotationFolder.open()
    smoothingFolder.open()
    
    depthFolder.open()
  
  sunglassesFolder.add(settings_glasses, 'sunglassesVisible').name('Visible').onChange(function(value) {
    if (sunglassesModel) {
      sunglassesModel.visible = value
    }
  })
  
  // Manual rotation controls
  let manualRotationFolder = gui.addFolder('Manual Rotation Override')
  manualRotationFolder.add(settings_glasses, 'sunglassesRotationX', -Math.PI, Math.PI, 0.1).name('Rotation X').onChange(function(value) {
    if (sunglassesModel) {
      sunglassesModel.rotation.x = value
    }
  })
  
  manualRotationFolder.add(settings_glasses, 'sunglassesRotationY', -Math.PI, Math.PI, 0.1).name('Rotation Y').onChange(function(value) {
    if (sunglassesModel) {
      sunglassesModel.rotation.y = value
    }
  })
  
  manualRotationFolder.add(settings_glasses, 'sunglassesRotationZ', -Math.PI, Math.PI, 0.1).name('Rotation Z').onChange(function(value) {
    if (sunglassesModel) {
      sunglassesModel.rotation.z = value
    }
  })
  
  manualRotationFolder.open()
  
  sunglassesFolder.add(settings_glasses, 'debugMode').name('Debug Mode').onChange(function(value) {
    // Toggle debug information
    if (value) {
      console.log('Debug mode enabled')
      console.log('Last valid position:', lastValidPosition)
      console.log('Sunglasses model:', sunglassesModel)
    }
  })
  


    
    sunglassesFolder.open()
}

function add_lights () {
  const light = new THREE.AmbientLight(0x404040, 1) // Changed from black to gray
  scene.add(light)
  
  // Add directional light for better visibility
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(0, 1, 1)
  scene.add(directionalLight)
}




  // Make reset function globally accessible for demo page
  function makeResetFunctionGlobal() {
    if (typeof window !== 'undefined') {
      // window.resetSunglassesPosition = reset_sunglasses_position
      // window.togglePivotRotation = toggle_pivot_rotation
      // window.toggleEarAnchoring = toggle_ear_anchoring
      console.log('Reset, pivot, and ear anchoring functions made globally accessible')
      
      // Add test function for roll calculation
      window.testRollCalculation = function() {
        console.log('Testing roll calculation with sample iris coordinates...')
        
        // Test case 1: Horizontal eyes (no roll)
        const test1 = {
          leftIris: { x: 0.3, y: 0.5 },
          rightIris: { x: 0.7, y: 0.5 }
        }
        const roll1 = -Math.atan2(test1.rightIris.y - test1.leftIris.y, test1.rightIris.x - test1.leftIris.x)
        console.log('Test 1 - Horizontal eyes:', {
          left: test1.leftIris,
          right: test1.rightIris,
          rollRad: roll1.toFixed(4),
          rollDeg: (roll1 * 180 / Math.PI).toFixed(2)
        })
        
        // Test case 2: Tilted eyes (positive roll)
        const test2 = {
          leftIris: { x: 0.3, y: 0.4 },
          rightIris: { x: 0.7, y: 0.6 }
        }
        const roll2 = -Math.atan2(test2.rightIris.y - test2.leftIris.y, test2.rightIris.x - test2.leftIris.x)
        console.log('Test 2 - Tilted eyes (positive roll):', {
          left: test2.leftIris,
          right: test2.rightIris,
          rollRad: roll2.toFixed(4),
          rollDeg: (roll2 * 180 / Math.PI).toFixed(2)
        })
        
        // Test case 3: Tilted eyes (negative roll)
        const test3 = {
          leftIris: { x: 0.3, y: 0.6 },
          rightIris: { x: 0.7, y: 0.4 }
        }
        const roll3 = -Math.atan2(test3.rightIris.y - test3.leftIris.y, test3.rightIris.x - test3.leftIris.x)
        console.log('Test 3 - Tilted eyes (negative roll):', {
          left: test3.leftIris,
          right: test3.rightIris,
          rollRad: roll3.toFixed(4),
          rollDeg: (roll3 * 180 / Math.PI).toFixed(2)
        })
      }
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
    // This function now uses ear landmarks for more stable positioning
    // and only applies automatic pitch rotation if explicitly enabled
    // to keep sunglasses naturally fixed on the head during up/down movement

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
      
      // console.log('Using iris landmarks for roll calculation')
      
    } else {
      // If iris landmarks are not available, don't calculate roll
      console.log('Iris landmarks not available, roll rotation disabled')
      naturalRoll = 0
    }
    
    // Apply smoothing to prevent jittery roll changes
    if (lastValidPosition && lastValidPosition.naturalRoll !== undefined) {
      const rollSmoothing = settings_glasses ? settings_glasses.rollSmoothing : 0.3
      naturalRoll = lastValidPosition.naturalRoll + (naturalRoll - lastValidPosition.naturalRoll) * rollSmoothing
    }
    
    // Apply natural roll strength setting
    if (settings_glasses && settings_glasses.rollRotationStrength !== undefined) {
      naturalRoll *= settings_glasses.rollRotationStrength
    }
    
    // Initialize automatic rotation variables early to avoid reference errors
    let autoYaw = 0
    let autoPitch = 0
    let autoRoll = 0
    
    // Calculate automatic rotations from face detection using new natural rotation system
    if (settings_glasses && settings_glasses.naturalRotationEnabled) {
      // Apply natural yaw rotation (left-right head movement)
      autoYaw = headYaw * (settings_glasses.yawRotationStrength || 1.0)
      
      // Apply natural pitch rotation (up-down head movement)
      autoPitch = headTilt * (settings_glasses.pitchRotationStrength || 0.8)
      
      // Apply natural roll rotation (head tilt)
      autoRoll = naturalRoll * (settings_glasses.rollRotationStrength || 1.0)
      
      // Apply smoothing to all rotations for natural movement
      if (lastValidPosition) {
        if (lastValidPosition.autoYaw !== undefined) {
          const yawSmoothing = settings_glasses.yawSmoothing || 0.3
          autoYaw = lastValidPosition.autoYaw + (autoYaw - lastValidPosition.autoYaw) * yawSmoothing
        }
        
        if (lastValidPosition.autoPitch !== undefined) {
          const pitchSmoothing = settings_glasses.pitchSmoothing || 0.4
          autoPitch = lastValidPosition.autoPitch + (autoPitch - lastValidPosition.autoPitch) * pitchSmoothing
        }
        
        if (lastValidPosition.autoRoll !== undefined) {
          const rollSmoothing = settings_glasses.rollSmoothing || 0.4
          autoRoll = lastValidPosition.autoRoll + (autoRoll - lastValidPosition.autoRoll) * rollSmoothing
        }
      }
    }
    
    // Debug logging for roll calculation
    if (settings_glasses && settings_glasses.debugMode) {
      console.log('Roll calculation debug:', {
        naturalRollRad: naturalRoll.toFixed(4),
        naturalRollDeg: (naturalRoll * 180 / Math.PI).toFixed(2),
        usingIris: leftIris && rightIris,
        leftIris: leftIris ? { 
          x: leftIris.x.toFixed(4), 
          y: leftIris.y.toFixed(4) 
        } : null,
        rightIris: rightIris ? { 
          x: rightIris.x.toFixed(4), 
          y: rightIris.y.toFixed(4) 
        } : null,
        irisDeltaX: leftIris && rightIris ? (rightIris.x - leftIris.x).toFixed(4) : null,
        irisDeltaY: leftIris && rightIris ? (rightIris.y - leftIris.y).toFixed(4) : null,
        coordinateSystem: 'NDC (0-1 range, Y increases downward)'
      })
    }
    
    // Use ear landmarks for more stable positioning (less affected by facial expressions)
    // Left ear: landmark 234, Right ear: landmark 454
    const leftEar = landmarks[234]
    const rightEar = landmarks[454]
    
    // Use specific ear landmarks for pivot rotation (162 and 389) and nose for center
    const leftEarPivot = landmarks[127]  // Left ear pivot point
    const rightEarPivot = landmarks[356] // Right ear pivot point
    const noseCenter = landmarks[197] // 6      // Nose center for glasses positioning
    
    // Calculate ear-based center for more stable positioning
    let stableCenterX = centerX
    let stableCenterY = centerY
    
    if (leftEar && rightEar && typeof leftEar.x === 'number' && typeof rightEar.x === 'number') {
      // Use ears for horizontal positioning (more stable than eyes)
      stableCenterX = (leftEar.x + rightEar.x) / 2
      // Keep vertical positioning from eyes (more natural for glasses)
      stableCenterY = centerY
    }
    
    // Calculate pivot point for X-axis rotation (around ear)
    let pivotPoint = null
    if (leftEarPivot && rightEarPivot && typeof leftEarPivot.x === 'number' && typeof rightEarPivot.x === 'number') {
      // Use the ear pivot points for rotation center
      pivotPoint = {
        x: (leftEarPivot.x + rightEarPivot.x) / 2,
        y: (leftEarPivot.y + rightEarPivot.y) / 2,
        z: (leftEarPivot.z + rightEarPivot.z) / 2
      }
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
    
    // Calculate dynamic depth based on head rotation to keep sunglasses at natural distance
    // When head rotates, adjust Z position to maintain consistent distance from eyes
    let sceneZ
    
    // Base Z position from face landmarks
    const baseZ = centerZ * 20 - 2
    
    // Calculate head rotation magnitude (how much the head is turned)
    const headRotationMagnitude = Math.abs(headYaw) + Math.abs(headTilt)
    
    // Dynamic depth adjustment based on head rotation
    // When head rotates more, bring sunglasses closer to maintain natural appearance
    
    if (settings_glasses && settings_glasses.stableDepth) {
      // If we have a previous valid position, use it to smooth Z changes
      if (lastValidPosition && Math.abs(lastValidPosition.z - baseZ) < 10) {
        // Smooth Z changes to prevent jumping
        const targetZ = baseZ
        const currentZ = lastValidPosition.z
        const smoothingFactor = settings_glasses.depthSmoothing || 0.3
        sceneZ = currentZ + (targetZ - currentZ) * smoothingFactor
      } else {
        // First time or large change, use direct calculation
        sceneZ = baseZ
      }
    } else {
      // No stabilization, use direct calculation
      sceneZ = baseZ
    }
    
    // Use GUI settings for scale and depth
    const baseScale = settings_glasses ? settings_glasses.sunglassesScale : 0.6
    const baseDepthOffset = settings_glasses ? settings_glasses.sunglassesDepth : 1
    
    // Calculate dynamic scale based on device and face characteristics
    const dynamicScale = calculateDynamicScale(eyeDistance, video.videoWidth, video.videoHeight)
    
    // Calculate dynamic depth offset based on head rotation
    // More rotation = closer to eyes (smaller Z offset)
    let finalDepthOffset = baseDepthOffset
    
    if (settings_glasses && settings_glasses.dynamicDepthEnabled) {
      const rotationFactor = Math.min(headRotationMagnitude * 2, 1) // Cap at 1.0
      const dynamicDepthOffset = baseDepthOffset * (1 - rotationFactor * settings_glasses.dynamicDepthStrength)
      
      // Ensure minimum distance for safety
      finalDepthOffset = Math.max(dynamicDepthOffset, 0.3)
    }
    
    // Store valid position for debugging
    lastValidPosition = {
      x: sceneX,
      y: sceneY,
      z: sceneZ - finalDepthOffset,
      scale: dynamicScale, // Use dynamic scale instead of fixed calculation
      eyeDistance: eyeDistance, // Store eye distance for dynamic scaling recalculation
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
    
    // Scale sunglasses using dynamic scaling system
    sunglassesModel.scale.setScalar(dynamicScale)
    
    // Apply manual rotation adjustments from GUI settings
    const manualRotationX = settings_glasses ? settings_glasses.sunglassesRotationX : 0
    const manualRotationY = settings_glasses ? settings_glasses.sunglassesRotationY : 0
    const manualRotationZ = settings_glasses ? settings_glasses.sunglassesRotationZ : 0
    
    // Apply pivot-based rotation to prevent glasses from moving up/down during roll
    // Always use pivot rotation for roll to keep glasses centered
    if (settings_glasses && settings_glasses.pivotBasedRotation && pivotPoint) {
      // Calculate pivot point in scene coordinates
      const pivotSceneX = (pivotPoint.x - 0.5) * video.videoWidth
      const pivotSceneY = (0.5 - pivotPoint.y) * video.videoHeight
      const pivotSceneZ = pivotPoint.z * 20 - 2
      
      if (settings_glasses && settings_glasses.earAnchored) {
        // FULL EAR ANCHORING: Temple piece sticks to ear, front of glasses follows head movement
        const earAttachmentOffset = settings_glasses ? settings_glasses.earAttachmentOffset : 0.8
        
        // Calculate temple piece offset (how far front of glasses is from ear)
        const templeOffsetX = earAttachmentOffset * Math.cos(autoYaw) // Adjust for head yaw
        const templeOffsetZ = earAttachmentOffset * Math.sin(autoYaw) // Adjust for head yaw
        
        // Position glasses with temple piece anchored to ear point
        sunglassesModel.position.set(
          pivotSceneX + templeOffsetX,  // Ear X + offset for front of glasses
          pivotSceneY,                   // Keep Y at ear level
          pivotSceneZ - finalDepthOffset + templeOffsetZ // Ear Z + offset + depth
        )
        
        // Apply rotations around the ear pivot point
        sunglassesModel.rotation.x = autoPitch + manualRotationX
        sunglassesModel.rotation.y = autoYaw + manualRotationY
        sunglassesModel.rotation.z = autoRoll + manualRotationZ
        
      } else {
        // PIVOT ROTATION ONLY: Rotate around ear but keep center positioning
        // Position glasses at center, but rotate around ear pivot
        sunglassesModel.position.set(
          sceneX,
          sceneY,
          sceneZ - finalDepthOffset
        )
        
        // Apply rotations around the ear pivot point
        sunglassesModel.rotation.x = autoPitch + manualRotationX
        sunglassesModel.rotation.y = autoYaw + manualRotationY
        sunglassesModel.rotation.z = autoRoll + manualRotationZ
      }
      
    } else {
      // IMPROVED STANDARD POSITIONING: Use center point as pivot for roll rotation
      // This prevents glasses from moving up/down during roll rotation
      
      // First, position glasses at the center point
      sunglassesModel.position.set(
        sceneX,
        sceneY,
        sceneZ - finalDepthOffset
      )
      
      // Apply rotations with proper pivot handling
      sunglassesModel.rotation.x = autoPitch + manualRotationX
      sunglassesModel.rotation.y = autoYaw + manualRotationY
      sunglassesModel.rotation.z = autoRoll + manualRotationZ
      
      // CRITICAL FIX: Compensate for roll rotation to prevent Y-axis movement
      // When rolling, we need to adjust position to keep glasses centered
      if (settings_glasses && settings_glasses.rollCompensationEnabled && Math.abs(autoRoll) > 0.01) {
        // Calculate compensation based on roll angle and model size
        const modelHeight = sunglassesModel.scale.y * 0.5 // Approximate model height
        const compensationStrength = settings_glasses.rollCompensationStrength || 0.3
        const rollCompensationY = Math.sin(autoRoll) * modelHeight * compensationStrength
        
        // Apply compensation to keep glasses centered during roll
        sunglassesModel.position.y = sceneY - rollCompensationY
        
        if (settings_glasses.debugMode) {
          console.log('Roll compensation applied:', {
            autoRoll: autoRoll.toFixed(4),
            modelHeight: modelHeight.toFixed(4),
            compensationStrength: compensationStrength,
            rollCompensationY: rollCompensationY.toFixed(4),
            finalY: sunglassesModel.position.y.toFixed(4)
          })
        }
      }
    }
    
    // Make sunglasses visible
    sunglassesModel.visible = true
    
    if (!sunglassesInitialized) {
      sunglassesInitialized = true
      console.log('Sunglasses positioned on eyes')
    }
    
    // Debug output if enabled
    if (settings_glasses && settings_glasses.debugMode) {
      console.log('Sunglasses position updated:', {
        position: sunglassesModel.position,
        scale: sunglassesModel.scale,
        rotation: sunglassesModel.rotation,
        eyeDistance: eyeDistance,
        headTilt: headTilt,
        headYaw: headYaw,
        manualRotations: { x: manualRotationX, y: manualRotationY, z: manualRotationZ },
        naturalRotation: { 
          enabled: settings_glasses ? settings_glasses.naturalRotationEnabled : false,
          pitch: { strength: settings_glasses ? settings_glasses.pitchRotationStrength : 0.8, smoothing: settings_glasses ? settings_glasses.pitchSmoothing : 0.4, calculated: autoPitch },
          yaw: { strength: settings_glasses ? settings_glasses.yawRotationStrength : 1.0, smoothing: settings_glasses ? settings_glasses.yawSmoothing : 0.3, calculated: autoYaw },
          roll: { strength: settings_glasses ? settings_glasses.rollRotationStrength : 1.0, smoothing: settings_glasses ? settings_glasses.rollSmoothing : 0.4, calculated: autoRoll }
        },
        depthInfo: { 
          sceneZ, 
          baseDepthOffset, 
          finalDepthOffset,
          headRotationMagnitude,
          dynamicDepthEnabled: settings_glasses ? settings_glasses.dynamicDepthEnabled : false,
          dynamicDepthStrength: settings_glasses ? settings_glasses.dynamicDepthStrength : 0.7,
          naturalRotationEnabled: settings_glasses ? settings_glasses.naturalRotationEnabled : false,
          pivotBasedRotation: settings_glasses ? settings_glasses.pivotBasedRotation : false,
          earAnchored: settings_glasses ? settings_glasses.earAnchored : false,
          earAttachmentOffset: settings_glasses ? settings_glasses.earAttachmentOffset : 0.8,
          pivotPoint: pivotPoint ? { x: pivotPoint.x, y: pivotPoint.y, z: pivotPoint.z } : null,
          finalZ: sceneZ - finalDepthOffset, 
          smoothing: 'enabled' 
        }
      })
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
        // console.log('Face landmarks detected:', results.faceLandmarks[0].length)
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

      // is_processing = false

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