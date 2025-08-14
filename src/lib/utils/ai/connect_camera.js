import * as THREE from 'three/webgpu'

let stream

async function add_web_camera() {

  const video_source = document.createElement('video')
  video_source.setAttribute('id', 'video')
  video_source.style.display = 'none'
  video_source.setAttribute('autoplay', true)
  video_source.setAttribute('muted', true)
  video_source.setAttribute('playsinline', true)
  document.body.appendChild(video_source)

  return new Promise((resolve, reject) => {

    video_source.addEventListener('loadedmetadata', function() {
      console.log('Video metadata loaded:', {
        videoWidth: video_source.videoWidth,
        videoHeight: video_source.videoHeight,
        readyState: video_source.readyState
      })
      
      // Ensure the video dimensions are available
      const texture = new THREE.VideoTexture(video_source)
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.format = THREE.RGBAFormat
      
      console.log('Created video texture:', {
        texture: texture,
        video: video_source,
        videoReady: video_source.readyState,
        videoWidth: video_source.videoWidth,
        videoHeight: video_source.videoHeight
      })

      const geometry = new THREE.PlaneGeometry(
        video_source.videoWidth,
        video_source.videoHeight
      )

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        alphaTest: 0.1
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.y = Math.PI
      
      console.log('Created video mesh:', {
        geometry: geometry.parameters,
        material: material,
        mesh: mesh,
        texture: texture,
        videoElement: video_source
      })
      
      resolve({ mesh, video_source })
      
    })
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {

      // Use consistent portrait aspect ratio for both mobile and desktop
      // 9:16 portrait aspect ratio (better for selfie-style apps on all devices)
      const targetAspectRatio = 9 / 16 // Portrait aspect ratio
      const baseWidth = 360
      const baseHeight = Math.round(baseWidth / targetAspectRatio) // 640
      
      let constraints = {
        video: {
          width: { min: baseWidth * 0.5, ideal: baseWidth, max: baseWidth * 1.5 },
          height: { min: baseHeight * 0.5, ideal: baseHeight, max: baseHeight * 1.5 },
          frameRate: 30,
          facingMode: 'user',
        },
      }

      // For mobile, use the same portrait constraints as desktop
      if (isMobile()) {
        // Mobile devices use the same portrait dimensions as desktop
        // This ensures consistent experience across all devices
        const mobileWidth = 360
        const mobileHeight = Math.round(mobileWidth / targetAspectRatio) // 640
        
        constraints = {
          video: {
            width: { min: mobileWidth * 0.5, ideal: mobileWidth, max: mobileWidth * 1.5 },
            height: { min: mobileHeight * 0.5, ideal: mobileHeight, max: mobileHeight * 1.5 },
            facingMode: 'user',
          },
        }
      }

      navigator.mediaDevices.getUserMedia(constraints)

        .then(stream => {
          video_source.srcObject = stream
          video_source.style.transform = 'scaleX(-1)';
          
          // Ensure video plays and is visible
          video_source.play().then(() => {
            console.log('Video started playing successfully')
            console.log('Video element:', {
              srcObject: video_source.srcObject,
              readyState: video_source.readyState,
              videoWidth: video_source.videoWidth,
              videoHeight: video_source.videoHeight,
              paused: video_source.paused,
              currentTime: video_source.currentTime
            })
            
            // Test: Make video element visible temporarily for debugging
            video_source.style.display = 'block'
            video_source.style.position = 'absolute'
            video_source.style.top = '10px'
            video_source.style.left = '10px'
            video_source.style.width = '200px'
            video_source.style.height = '150px'
            video_source.style.zIndex = '9999'
            video_source.style.border = '2px solid red'
            
            // Remove the test styling after 5 seconds
            setTimeout(() => {
              video_source.style.display = 'none'
              video_source.style.position = ''
              video_source.style.top = ''
              video_source.style.left = ''
              video_source.style.width = ''
              video_source.style.height = ''
              video_source.style.zIndex = ''
              video_source.style.border = ''
            }, 5000)
            
          }).catch(error => {
            console.error('Error playing video:', error)
          })
        })

        .catch(error => {
          console.error('Unable to access the camera/webcam.', error)
          reject(error)
        })

    } else {
      reject(new Error('MediaDevices interface not available.'))

    }

  })

}

function stop_web_camera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
    stream = null
  }

  const video_source = document.getElementById('video')

  if (video_source) {
    video_source.pause()
    video_source.srcObject = null
    video_source.remove()
  }
}

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export {
  add_web_camera,
  stop_web_camera
}