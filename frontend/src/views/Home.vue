<template>
  <div class="home">
    <header class="header">
      <h1>🚀 Tour Creator</h1>
      <button @click="logout" class="logout-btn">Выйти</button>
    </header>

    <main class="main">
      <div class="welcome-section">
        <h2>Добро пожаловать!</h2>
        <p>Выберите действие для создания тура</p>
      </div>

      <div class="actions-grid">
        <div class="action-card" @click="navigateTo('/simple-create')">
          <div class="card-icon">⚡</div>
          <h3>Упрощенное создание</h3>
          <p>Быстрое создание тура с минимальными настройками</p>
          <div class="card-badge">Рекомендуется</div>
        </div>

        <div class="action-card" @click="navigateTo('/transfer-avianna')">
          <div class="card-icon">🔄</div>
          <h3>Перенос с Avianna</h3>
          <p>Импорт туров из системы Avianna</p>
          <div class="card-badge soon">Скоро</div>
        </div>

        <div class="action-card" @click="navigateTo('/import-site')">
          <div class="card-icon">🌐</div>
          <h3>Загрузка с внешнего сайта</h3>
          <p>Импорт туров с других площадок</p>
          <div class="card-badge soon">Скоро</div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const navigateTo = (path: string) => {
  router.push(path);
};

const logout = () => {
  localStorage.clear();
  router.push('/login');
};
</script>

<style scoped>
.home {
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

.header h1 {
  color: #ffffff;
  font-size: 24px;
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
  padding: 60px 40px;
  max-width: 1200px;
  margin: 0 auto;
}

.welcome-section {
  text-align: center;
  margin-bottom: 50px;
}

.welcome-section h2 {
  color: #ffffff;
  font-size: 32px;
  margin-bottom: 10px;
}

.welcome-section p {
  color: #888;
  font-size: 16px;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 30px;
}

.action-card {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 30px;
  cursor: pointer;
  transition: all 0.3s;
  position: relative;
}

.action-card:hover {
  transform: translateY(-5px);
  border-color: #4CAF50;
  box-shadow: 0 8px 24px rgba(76, 175, 80, 0.1);
}

.card-icon {
  font-size: 48px;
  margin-bottom: 20px;
}

.action-card h3 {
  color: #ffffff;
  font-size: 20px;
  margin-bottom: 12px;
}

.action-card p {
  color: #aaa;
  font-size: 14px;
  line-height: 1.6;
}

.card-badge {
  position: absolute;
  top: 20px;
  right: 20px;
  padding: 4px 12px;
  background: #4CAF50;
  color: white;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.card-badge.soon {
  background: #ff9800;
}
</style>