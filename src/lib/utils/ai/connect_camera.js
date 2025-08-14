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
      // Ensure the video dimensions are available
      const texture = new THREE.VideoTexture(video_source)
      texture.colorSpace = THREE.SRGBColorSpace

      // const aspectRatio = video_source.videoWidth / video_source.videoHeight
      // const geometry = new THREE.PlaneGeometry(1 * aspectRatio, 1)
      const geometry = new THREE.PlaneGeometry(
        video_source.videoWidth,
        video_source.videoHeight
      )

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.rotation.y = Math.PI 
      resolve({ mesh, video_source })
      
    })
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {

      let constraints = {
        video: {
          width: { min: 414, ideal: 414, max: 414 },
          height: { min: 660, ideal: 660, max: 660 },
          // width: { min: 1024, ideal: 1280, max: 1280 },
          // height: { min: 576, ideal: 720, max: 720 },
          frameRate: 30,
          facingMode: 'user', // environment
        },
      }

      if (isMobile()) {
        constraints = {
          video: {
            width: { min: 1024, ideal: 1280, max: 1280 },
            height: { min: 576, ideal: 720, max: 720 },
            // width: { min: 414, ideal: 414, max: 414 },
            // height: { min: 660, ideal: 660, max: 660 },
            facingMode: 'user',
          },
        }
      }

      navigator.mediaDevices.getUserMedia(constraints)

        .then(stream => {
          video_source.srcObject = stream
          // video_source.play()
          video_source.play()
            // .then(() => {
            //     console.log('Video playing! ')
            // })
            // .catch((error) => {
            //   console.log('Error playing video: ', error)
            // })
          video_source.style.transform = 'scaleX(-1)';
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