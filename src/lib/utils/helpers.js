import { THREE } from '../utils/utils'

import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

function init_perspective_camera ({ canvas }) {
  // NOTE: Camera params.
  const fov = 45
  const near_plane = 1
  const far_plane = 300

  const camera = new THREE.PerspectiveCamera(
    fov,
    canvas.offsetWidth / canvas.offsetHeight,
    near_plane,
    far_plane
  )
  return camera
}

function init_ortografic_camera ({ 
  width = 414,
  height = 522
 }) {

  // NOTE: Camera params.
  const near_plane = -1000
  const far_plane = 1000

  // Calculate aspect ratio to ensure proper scaling
  const aspectRatio = width / height
  
  // Set up orthographic camera bounds to properly view the video plane
  // The video plane will be centered at (0,0,0) with the given dimensions
  const camera = new THREE.OrthographicCamera(
    -width / 2,    // left
    width / 2,     // right
    height / 2,    // top
    -height / 2,   // bottom
    near_plane, 
    far_plane
  )

  // Store the aspect ratio for potential adjustments
  camera.aspectRatio = aspectRatio
  camera.userData = { originalWidth: width, originalHeight: height }

  return camera

}

function init_renderer ({ canvas }) {
  const renderer = new THREE.WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true
  })

  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.physicallyCorrectLights = true
  renderer.setClearColor(0x000000)

  return renderer
}

function directional_light ({ 
    color = 0xFFFFFF, 
    mapSize = 512, 
    intensity = 1,
    castShadow = false,
    sceneSize = 10
  }) 
{
  const light = new THREE.DirectionalLight(color, intensity)
  light.castShadow = castShadow
  light.shadow.mapSize.width = mapSize   // 16384, 4096 // Default is 512
  light.shadow.mapSize.height = mapSize  // 16384, 4096 // Default is 512
  light.shadow.camera.near = 0.05        // Default is 0.5
  light.shadow.camera.far = 500          // Default is 500
  light.shadow.camera.left = -sceneSize        // Adjust based on your scene size
  light.shadow.camera.right = sceneSize        // Adjust based on your scene size
  light.shadow.camera.top = sceneSize          // Adjust based on your scene size
  light.shadow.camera.bottom = -sceneSize      // Adjust based on your scene size
  light.shadow.bias= -0.0005             // Small = quality
  light.shadow.radius = 1                // Bigger = soft edge

  return light
}

function directional_light_helper (light, size = 1) {
  return new THREE.DirectionalLightHelper(light, size)
}

function init_orbit_controls ({camera, renderer}) {
  // NOTE: Set orbit controls params
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.movementSpeed = 150
  controls.rotateSpeed = 0.2
  controls.enableZoom = true
  controls.enablePan = true
  controls.lookSpeed = 0.1
  controls.enableDamping = true
  // controls.dampingFactor = 0.005
  controls.minDistance = 1

  const minPolarAngle = 60 * (Math.PI / 180); // 30 degrees in radians
  const maxPolarAngle = 120 * (Math.PI / 180); // 150 degrees in radians

  // Limit vertical rotation between 30 degrees and 150 degrees
  controls.minPolarAngle = minPolarAngle;
  controls.maxPolarAngle = maxPolarAngle;

  return controls
}

export {
  init_perspective_camera,
  init_renderer,
  init_orbit_controls,
  directional_light,
  directional_light_helper,
  init_ortografic_camera
}