import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

async function faces (mode = 'VIDEO') {

  const create_face_landmarker = async () => {

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
    )
    
    const face_landmarker = await FaceLandmarker.createFromOptions(vision, {

      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: 'GPU'
      },
      runningMode: mode, 
      numFaces: 1

    })

    return face_landmarker

  }

  const face_landmarker = await create_face_landmarker()

  return face_landmarker

}

export { faces }
