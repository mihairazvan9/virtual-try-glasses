// import * as THREE from 'three'
import * as THREE from 'three/webgpu'

function lerp (a, b, t) {
  return a * (1 - t) + b * t
}
function range (a, b) {
  let r = Math.random()
  return a * r + b * (1 - r)
}

function debounce(func, delay) {
  let timeoutId;
  return function() {
    const context = this
    const args = arguments
    const event = args[0]
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      func.apply(context, [event, ...args])
    }, delay)
  }
}

export { THREE, range, debounce, lerp }