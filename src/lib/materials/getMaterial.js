import * as THREE from 'three/webgpu'
import { 
  mx_noise_float, 
  color, 
  cross, 
  dot, 
  float, 
  transformNormalToView, 
  positionLocal, 
  sign,
  step, 
  Fn, 
  uniform, 
  varying, 
  vec2, 
  vec3,
  vec4,
  uv,
  texture,
  attribute,
  pow,
  mix,
  div,
  floor,
  Loop        
} from 'three/tsl'

export default function getMaterial () {
  let material = new THREE.NodeMaterial({
    wireframe: false,
  })

  const fragment_color = Fn(() => {
    
      return vec4(1, 0, 0, 1.)
  })

  material.colorNode = fragment_color()
  return material
}