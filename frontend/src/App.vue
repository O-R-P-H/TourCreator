<template>
  <div id="app">
    <header>
      <h1>🚀 Tour Creator</h1>
    </header>
    <main>
      <TourCreator />
    </main>
  </div>
</template>

<script setup lang="ts">
import TourCreator from './components/TourCreator.vue';
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

#app {
  min-height: 100vh;
}

header {
  background: rgba(255, 255, 255, 0.95);
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

header h1 {
  color: #333;
  font-size: 28px;
}

main {
  padding: 20px;
}
</style>