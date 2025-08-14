<script setup>
import Preview3D from './components/Preview3D.vue'
import { ref, onMounted, onUnmounted } from 'vue'

const showOrientationPrompt = ref(false)

const checkOrientation = () => {
  if (window.innerWidth <= 575) { // Mobile breakpoint
    // On mobile, prefer portrait mode (show prompt when in landscape)
    showOrientationPrompt.value = window.innerWidth > window.innerHeight
  } else {
    showOrientationPrompt.value = false
  }
}

onMounted(() => {
  checkOrientation()
  window.addEventListener('resize', checkOrientation)
  window.addEventListener('orientationchange', checkOrientation)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkOrientation)
  window.removeEventListener('orientationchange', checkOrientation)
})
</script>

<template>
  <main>
    <div class="wrapper">
      <div class="wrapper-canvas">
        <Preview3D />
      </div>
      
      <!-- Portrait orientation prompt for mobile -->
      <div class="orientation-prompt" v-if="showOrientationPrompt">
        <div class="prompt-content">
          <div class="phone-icon">📱</div>
          <p>Please rotate your device to portrait mode for the best experience</p>
          <div class="rotate-arrow">↻</div>
        </div>
      </div>
    </div>
    <img id="loading" src="@/assets/loading.gif" alt="Virtual-try makeup">
  </main>
</template>

<style lang="scss">

  *, body {
    margin: 0;
    padding: 0;
  }

  .wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100dvw;
    height: 100dvh;
    background-color: #212121;
    overflow: hidden;

    .wrapper-canvas {
      border-radius: 16px;
      overflow: hidden;
      // Use portrait aspect ratio (9:16) for both mobile and desktop
      aspect-ratio: 9 / 16; // Portrait video aspect ratio
      width: 100%;
      height: 100%;
      max-width: 100vw;
      max-height: 100vh;
      // Center the canvas within the container
      display: flex;
      align-items: center;
      justify-content: center;
      // Ensure the container can accommodate exact video dimensions
      min-width: 360px;
      min-height: 640px;
    }
  }

  #loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  @media screen and (min-width: 576px) {
    .wrapper {
      .wrapper-canvas {
        border-radius: 16px;
        overflow: hidden;
        // For desktop, use the same portrait dimensions as mobile for consistency
        width: 360px;
        height: 640px; // 9:16 portrait aspect ratio (same as mobile)
        max-width: 360px;
        max-height: 640px;
        // Center the canvas within the container
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }
  }

  // Mobile-specific adjustments
  @media screen and (max-width: 575px) {
    .wrapper {
      .wrapper-canvas {
        // On mobile, use portrait orientation with viewport dimensions
        width: 100vw;
        height: 177.78vw; // 16:9 portrait aspect ratio (16/9 = 1.778)
        border-radius: 0; // Remove border radius on mobile for full-screen experience
        max-width: 100vw;
        max-height: 100vh;
        // Ensure portrait orientation on mobile
        min-height: 177.78vw;
      }
    }
  }

  // Force portrait orientation on mobile devices (preferred)
  @media screen and (max-width: 575px) and (orientation: landscape) {
    .wrapper {
      .wrapper-canvas {
        // When in landscape mode on mobile, adjust to encourage portrait
        width: 56.25vh; // Use viewport height as width
        height: 100vh; // Maintain 16:9 portrait aspect ratio
        transform: rotate(90deg); // Rotate to portrait
        transform-origin: center center;
      }
    }
  }

  // Portrait orientation on mobile (preferred)
  @media screen and (max-width: 575px) and (orientation: portrait) {
    .wrapper {
      .wrapper-canvas {
        // Perfect portrait mode on mobile
        width: 100vw;
        height: 177.78vw;
        transform: none; // No rotation needed
      }
    }
  }

  // Ensure the canvas element itself maintains aspect ratio
  #preview-3D {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover; /* Maintain aspect ratio and fill container */
    display: block;
  }

  // Orientation prompt styles
  .orientation-prompt {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(10px);
  }

  .prompt-content {
    text-align: center;
    color: white;
    padding: 2rem;
    max-width: 300px;
  }

  .phone-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
    animation: bounce 2s infinite;
  }

  .prompt-content p {
    font-size: 1.2rem;
    margin-bottom: 1rem;
    line-height: 1.4;
  }

  .rotate-arrow {
    font-size: 3rem;
    animation: rotate 2s infinite;
    color: #4CAF50;
  }

  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {
      transform: translateY(0);
    }
    40% {
      transform: translateY(-10px);
    }
    60% {
      transform: translateY(-5px);
    }
  }

  @keyframes rotate {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

</style>
