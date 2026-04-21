<template>
  <div class="simple-create">
    <header class="header">
      <div class="header-left">
        <button @click="goBack" class="back-btn">← Назад</button>
        <h1>⚡ Упрощенное создание тура</h1>
      </div>
      <button @click="logout" class="logout-btn">Выйти</button>
    </header>

    <main class="main">
      <TourCreator />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import TourCreator from '../components/TourCreator.vue';

const router = useRouter();

const goBack = () => {
  router.push('/');
};

const logout = () => {
  localStorage.clear();
  router.push('/login');
};
</script>

<style scoped>
.simple-create {
  min-height: 100vh;
  background: #0f0f0f;
}

.header {
  background: #1a1a1a;
  padding: 20px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #333;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.back-btn {
  padding: 8px 16px;
  background: transparent;
  color: #aaa;
  border: 1px solid #444;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
}

.back-btn:hover {
  background: #2a2a2a;
  color: #fff;
  border-color: #666;
}

.header h1 {
  color: #ffffff;
  font-size: 20px;
}

.logout-btn {
  padding: 8px 20px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: background 0.3s;
}

.logout-btn:hover {
  background: #c82333;
}

.main {
  padding: 40px;
}
</style>