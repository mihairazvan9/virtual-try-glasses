import * as THREE from 'three/webgpu'
import { TextureLoader } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'

import { init } from '@/lib/core.js'

// NOTE: Core
let model
let women 
let modelLoaded = false

function loader (canvas_id) {
  // NOTE: Init Loading Manager
  // This like JS Promises
  // We use Loading Manager to be able to display the load percentage
  const loading_manager =  new THREE.LoadingManager()

  const texture_loader = new TextureLoader(loading_manager)

  texture_loader.load(new URL('@/assets/women.jpg', import.meta.url).href, (t) => {
    women = t
  })

  const draco_loader = new DRACOLoader()

  // Set the decoder path
  draco_loader.setDecoderPath(new URL('@/lib/draco', import.meta.url).href)
  draco_loader.setDecoderConfig({ type: 'js' })
  
  // NOTE: Init GLTF Loader & set decoder
  const loader = new GLTFLoader(loading_manager)
  loader.setDRACOLoader(draco_loader)

  // Load sunglasses model
  loader.load(
    new URL('@/assets/scene.glb', import.meta.url).href, 
    (gltfScene) => {
      model = gltfScene.scene
      modelLoaded = true
      console.log('Sunglasses model loaded successfully:', model)
      
      // If loading manager is already done, initialize now
      if (loading_manager.manager === undefined) {
        init(canvas_id)
      }
    },
    (progress) => {
      console.log('Loading sunglasses model:', progress)
    },
    (error) => {
      console.error('Error loading sunglasses model:', error)
      // Still initialize even if model fails to load
      if (loading_manager.manager === undefined) {
        init(canvas_id)
      }
    }
  )

  // NOTE: Start canvas settings
  loading_manager.onLoad = function () {
    // Only initialize if model is loaded or if there was an error
    if (modelLoaded || !model) {
      init(canvas_id)
    }
  }
}

export { loader, women, model }