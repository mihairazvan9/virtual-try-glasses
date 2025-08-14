<script setup>
  import { loader } from '@/lib/utils/loader.js'

  loader('preview-3D')
</script>

<template>
  <canvas id="preview-3D"></canvas>
</template>

<style>
  #preview-3D {
    /* Ensure the canvas fills its container and maintains aspect ratio */
    width: 100% !important;
    height: 100% !important;
    display: block;
    /* Remove conflicting properties that might interfere with video display */
    object-fit: cover;
    max-width: 100%;
    max-height: 100%;
  }
</style>
