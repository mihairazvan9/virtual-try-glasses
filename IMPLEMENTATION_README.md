# Improved MediaPipe + Three.js Glasses Try-On Implementation

This implementation follows the MVP approach outlined in your requirements, providing a robust foundation for virtual glasses try-on with real-time head pose tracking.

## 🎯 MVP Goals Achieved

✅ **Live webcam → MediaPipe Face Landmarker → facialTransformationMatrix for head pose**  
✅ **Three.js scene layered on top of video**  
✅ **Glasses model (GLTF) anchored to head**  
✅ **Position: fixed head point (bridge between eyes)**  
✅ **Rotation: from MediaPipe's head transform → smoothed quaternion**  
✅ **Scale: from head size (interpupillary distance)**  
✅ **Smoothing: One-Euro (or simple lerp/slerp) for pos/rot/scale**  

## 🏗️ Architecture Overview

### Core Components

1. **MediaPipe Face Landmarker** - Provides facial transformation matrices and landmarks
2. **Three.js Scene** - Renders glasses model with proper head tracking
3. **Smoothing System** - Reduces jitter and provides stable tracking
4. **Anchor System** - Glasses are children of a head anchor for natural movement

### Key Features

- **Head Pose Tracking**: Uses `facialTransformationMatrixes` for accurate 3D head pose
- **Smart Scaling**: Automatically adjusts glasses size based on interpupillary distance
- **Smooth Movement**: Exponential smoothing for position, rotation, and scale
- **Proper Anchoring**: Glasses stay fixed to head during all movements (pitch, yaw, roll)

## 📁 File Structure

```
src/
├── lib/
│   ├── core.js                    # Main implementation (improved)
│   ├── utils/
│   │   ├── ai/
│   │   │   └── detections.js      # MediaPipe configuration
│   │   └── loader.js              # Model loading
│   └── components/
│       └── Preview3D.vue          # Vue component
├── test-glasses.html              # Standalone test page
└── test-app.js                    # Test implementation
```

## 🚀 Implementation Details

### 1. MediaPipe Configuration

```javascript
const face_landmarker = await FaceLandmarker.createFromOptions(fileset, {
  baseOptions: {
    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    delegate: 'GPU'
  },
  runningMode: 'VIDEO',
  numFaces: 1,
  outputFaceBlendshapes: false,
  outputFacialTransformationMatrixes: true, // ← Key for head pose
  outputFaceLandmarks: true
});
```

### 2. Head Pose Extraction

```javascript
// Extract pose from transformation matrix
const m = results.facialTransformationMatrixes[0].data;
tmpMatrix.fromArray(m);
tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale);

// Apply correction for coordinate system alignment
tmpQuat.multiply(correction);
```

### 3. Smoothing System

```javascript
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
```

### 4. Scale Calculation

```javascript
function ipdToModelScale(ipd) {
  const min = 0.08, max = 0.18; // expected IPD band
  const t = THREE.MathUtils.clamp((ipd - min) / (max - min), 0, 1);
  return THREE.MathUtils.lerp(0.85, 1.35, t) * settings_glasses.baseScaleMultiplier;
}
```

## 🎮 Usage

### In Vue Component

```vue
<template>
  <canvas id="preview-3D"></canvas>
</template>

<script setup>
import { loader } from '@/lib/utils/loader.js'
loader('preview-3D')
</script>
```

### Standalone Test

1. Open `test-glasses.html` in a web browser
2. Allow camera access
3. Move your head to see glasses follow naturally
4. Check console for settings GUI

## ⚙️ Configuration

### Smoothing Settings

```javascript
const SMOOTHING = { 
  pos: 0.35,    // Position smoothing (0.1 = snappy, 0.9 = very smooth)
  rot: 0.35,    // Rotation smoothing
  scale: 0.35   // Scale smoothing
};
```

### Manual Overrides

- **Base Scale Multiplier**: Adjust overall glasses size
- **Manual Y Rotation**: Fine-tune glasses orientation
- **Smoothing Controls**: Adjust tracking responsiveness

## 🔧 Troubleshooting

### Common Issues

1. **Glasses appear mirrored/rotated**
   - Adjust the `correction` quaternion in `core.js`
   - Try different Euler angles: `(0, Math.PI, 0)`, `(Math.PI, 0, 0)`, etc.

2. **Jittery movement**
   - Increase smoothing values (closer to 0.9)
   - Check camera stability and lighting

3. **Glasses too big/small**
   - Adjust `baseScaleMultiplier` in settings
   - Tune `ipdToModelScale` function constants

4. **Performance issues**
   - Reduce video resolution
   - Use `delegate: 'CPU'` instead of 'GPU'

### Debug Features

- **Axes Helper**: Shows head anchor orientation
- **Console Logging**: Detailed tracking information
- **Settings GUI**: Real-time parameter adjustment

## 🚀 Next Steps

### Potential Improvements

1. **One-Euro Filter**: Replace simple smoothing with advanced filtering
2. **Multiple Glasses**: Support for different models and styles
3. **Face Morphing**: Blend glasses with facial features
4. **AR Features**: Add virtual try-on effects

### Performance Optimizations

1. **WebGL2**: Upgrade to modern graphics API
2. **Instancing**: Render multiple glasses efficiently
3. **LOD System**: Different detail levels based on distance
4. **Worker Threads**: Move detection to background

## 📚 Technical Notes

### MediaPipe Coordinate System

- **Input**: Normalized device coordinates (0-1)
- **Output**: 3D transformation matrices
- **Coordinate System**: Right-handed, Y-up

### Three.js Integration

- **Camera**: Orthographic for video overlay, Perspective for 3D
- **Rendering**: WebGPU renderer for modern performance
- **Materials**: PBR materials with proper lighting

### Browser Compatibility

- **Required**: WebGL2, MediaDevices API, ES6 modules
- **Recommended**: Chrome 90+, Firefox 88+, Safari 14+
- **Mobile**: iOS 14+, Android Chrome 90+

## 🤝 Contributing

This implementation provides a solid foundation. Feel free to:

1. Adjust smoothing parameters for your use case
2. Modify the correction quaternion for your glasses models
3. Add additional tracking features
4. Optimize for your specific performance requirements

## 📄 License

This implementation is based on the MVP requirements and MediaPipe/Three.js best practices. Use according to your project's licensing requirements.

