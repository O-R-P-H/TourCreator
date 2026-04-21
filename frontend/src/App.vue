<template>
  <div id="app" class="dark-theme">
    <router-view />
  </div>
</template>

<script setup lang="ts">
// App component
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background: #0f0f0f;
  min-height: 100vh;
}

.dark-theme {
  min-height: 100vh;
  background: #0f0f0f;
  color: #e0e0e0;
}

#app {
  min-height: 100vh;
}
</style>