<script setup>
  import { loader } from '@/lib/utils/loader.js'

  loader('preview-3D')
</script>

<template>
  <canvas id="preview-3D"></canvas>

</template>

<style>
  #preview-3D {
    /* position: absolute; */
    width: 100% !important;
    height: 100% !important;
    /* z-index: -1; */
  }
</style>
