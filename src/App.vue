<script setup>
import Preview3D from './components/Preview3D.vue'
</script>

<template>


  <main>
    <div class="wrapper">
      <div class="wrapper-canvas">
        <Preview3D />
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
    align-content: center;
    width: 100dvw;
    height: 100dvh;
    background-color: #212121;

    .wrapper-canvas {
      border-radius: 16px;
      overflow: hidden;
      width: 100%;
      height: 100%;
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

      // display: flex;
      // justify-content: center;
      // align-content: center;
      // width: 100dvw;

      .wrapper-canvas {
        border-radius: 16px;
        overflow: hidden;
        max-width: 414px;
        height: 660px;
      }
    }
  }


</style>
