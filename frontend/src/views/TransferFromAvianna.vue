<template>
  <div class="transfer-avianna">
    <header class="header">
      <div class="header-left">
        <button @click="goBack" class="back-btn">← Назад</button>
        <h1>🔄 Перенос тура из Avianna в Pazl Tours</h1>
      </div>
      <button @click="logout" class="logout-btn">Выйти</button>
    </header>

    <main class="main">
      <!-- Форма ввода данных -->
      <div v-if="!result" class="form-section">
        <div class="form-container">
          <h2>Данные для миграции</h2>
          <p class="description">
            Введите данные для доступа к обоим аккаунтам и название тура, который нужно перенести
          </p>

          <div class="form-grid">
            <!-- Avianna -->
            <div class="form-column">
              <h3>🐦 Avianna</h3>
              <div class="form-group">
                <label>Email</label>
                <input
                    v-model="form.aviannaEmail"
                    type="email"
                    placeholder="email@avianna24.ru"
                    :disabled="loading"
                />
              </div>
              <div class="form-group">
                <label>Пароль</label>
                <input
                    v-model="form.aviannaPassword"
                    type="password"
                    placeholder="••••••••"
                    :disabled="loading"
                />
              </div>
            </div>

            <!-- Pazl Tours -->
            <div class="form-column">
              <h3>🏢 Pazl Tours</h3>
              <div class="form-group">
                <label>Email</label>
                <input
                    v-model="form.pazlEmail"
                    type="email"
                    placeholder="email@pazltours.online"
                    :disabled="loading"
                />
              </div>
              <div class="form-group">
                <label>Пароль</label>
                <input
                    v-model="form.pazlPassword"
                    type="password"
                    placeholder="••••••••"
                    :disabled="loading"
                />
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>Название тура в Avianna</label>
            <input
                v-model="form.tourName"
                type="text"
                placeholder="Например: Тур в Москву"
                :disabled="loading"
            />
          </div>

          <div class="actions">
            <button
                @click="startMigration"
                class="start-btn"
                :disabled="loading || !isFormValid"
            >
              <span v-if="loading" class="spinner"></span>
              {{ loading ? 'Миграция...' : '🚀 Начать миграцию' }}
            </button>
          </div>

          <div v-if="error" class="error-message">
            ❌ {{ error }}
          </div>
        </div>
      </div>

      <!-- Результаты миграции -->
      <div v-if="result" class="results-section">
        <div class="results-header">
          <h2>✅ Маппинг выполнен успешно</h2>
          <p class="result-message">{{ result.message }}</p>
        </div>

        <!-- Статистика -->
        <div class="stats-container">
          <div class="stat-card total">
            <div class="stat-value">{{ result.stats.total }}</div>
            <div class="stat-label">Всего сущностей</div>
          </div>
          <div class="stat-card exists">
            <div class="stat-value">{{ result.stats.totalExists }}</div>
            <div class="stat-label">Найдено в Pazl</div>
          </div>
          <div class="stat-card create">
            <div class="stat-value">{{ result.stats.totalToCreate }}</div>
            <div class="stat-label">Требуется создать</div>
          </div>
        </div>

        <!-- Детали маппинга -->
        <div class="mappings-detail">
          <h3>Детали маппинга</h3>

          <div v-for="(items, category) in result.mappings" :key="category" class="mapping-category">
            <div v-if="items.length > 0" class="category-section">
              <h4 class="category-title">
                {{ getCategoryName(category) }}
                <span class="badge">{{ items.length }}</span>
              </h4>

              <div class="mapping-items">
                <div
                    v-for="item in items"
                    :key="`${item.source_id}-${item.source_name}`"
                    class="mapping-item"
                    :class="{ 'needs-creation': item.needs_creation }"
                >
                  <div class="item-name">{{ item.source_name }}</div>
                  <div class="item-status">
                    <span v-if="!item.needs_creation" class="found">
                      ✅ Найден: {{ item.pazl_name }}
                    </span>
                    <span v-else class="not-found">
                      ⚠️ Требуется создание
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Кнопки действий -->
        <div class="results-actions">
          <button @click="resetForm" class="new-migration-btn">
            🔄 Новая миграция
          </button>
          <button @click="goBack" class="back-btn">
            ← На главную
          </button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import apiService from '@/services/api.service';
import type { MigrationResult } from '@/types';

const router = useRouter();

const loading = ref(false);
const error = ref('');
const result = ref<MigrationResult | null>(null);

const form = ref({
  aviannaEmail: '',
  aviannaPassword: '',
  pazlEmail: '',
  pazlPassword: '',
  tourName: ''
});

const isFormValid = computed(() => {
  return form.value.aviannaEmail &&
      form.value.aviannaPassword &&
      form.value.pazlEmail &&
      form.value.pazlPassword &&
      form.value.tourName;
});

const categoryNames: Record<string, string> = {
  cities: '🏙️ Города',
  transportations: '🚌 Транспортировки',
  transports: '🚗 Транспорт',
  hotel_meals: '🍽️ Питание в отелях',
  hotel_accommodations: '🏨 Размещение',
  hotel_infrastructure_types: '🏗️ Типы инфраструктуры',
  hotel_infrastructures: '🏢 Инфраструктура',
  room_types: '🛏️ Типы номеров',
  room_places: '📍 Размещение в номерах',
  room_descriptions: '📝 Описания номеров',
  hotels: '🏨 Отели',
  tour_categories: '📂 Категории туров',
  tour_services: '🛠️ Услуги туров',
  catalog_sections: '📑 Разделы каталога'
};

const getCategoryName = (key: string): string => {
  return categoryNames[key] || key;
};

const startMigration = async () => {
  if (!isFormValid.value) return;

  loading.value = true;
  error.value = '';

  try {
    const response = await apiService.startMigration(form.value);

    if (response.data) {
      result.value = response.data;
    }
  } catch (err: any) {
    error.value = err.message || 'Произошла ошибка при миграции';
    console.error('Migration error:', err);
  } finally {
    loading.value = false;
  }
};

const resetForm = () => {
  result.value = null;
  error.value = '';
  form.value = {
    aviannaEmail: '',
    aviannaPassword: '',
    pazlEmail: '',
    pazlPassword: '',
    tourName: ''
  };
};

const goBack = () => {
  router.push('/');
};

const logout = () => {
  localStorage.clear();
  router.push('/login');
};
</script>

<style scoped>
.transfer-avianna {
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
  min-height: calc(100vh - 81px);
  padding: 40px;
}

.form-section {
  max-width: 1000px;
  margin: 0 auto;
}

.form-container {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 40px;
}

.form-container h2 {
  color: #ffffff;
  font-size: 24px;
  margin-bottom: 12px;
}

.description {
  color: #888;
  margin-bottom: 32px;
  font-size: 14px;
  line-height: 1.5;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-bottom: 32px;
}

.form-column h3 {
  color: #aaa;
  font-size: 18px;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid #333;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  color: #aaa;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 12px;
  background: #0f0f0f;
  border: 1px solid #444;
  border-radius: 8px;
  color: #ffffff;
  font-size: 14px;
  transition: border-color 0.3s;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #007bff;
}

.form-group input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.actions {
  margin-top: 32px;
}

.start-btn {
  width: 100%;
  padding: 14px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.start-btn:hover:not(:disabled) {
  background: #218838;
}

.start-btn:disabled {
  background: #666;
  cursor: not-allowed;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-message {
  margin-top: 20px;
  padding: 12px;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 8px;
  color: #dc3545;
  font-size: 14px;
}

/* Results styles */
.results-section {
  max-width: 1200px;
  margin: 0 auto;
}

.results-header {
  text-align: center;
  margin-bottom: 40px;
}

.results-header h2 {
  color: #28a745;
  font-size: 28px;
  margin-bottom: 12px;
}

.result-message {
  color: #888;
  font-size: 16px;
}

.stats-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
}

.stat-value {
  font-size: 36px;
  font-weight: bold;
  margin-bottom: 8px;
}

.stat-label {
  color: #888;
  font-size: 14px;
}

.stat-card.total .stat-value { color: #007bff; }
.stat-card.exists .stat-value { color: #28a745; }
.stat-card.create .stat-value { color: #ffc107; }

.mappings-detail {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 32px;
  margin-bottom: 32px;
}

.mappings-detail h3 {
  color: #ffffff;
  font-size: 20px;
  margin-bottom: 24px;
}

.category-section {
  margin-bottom: 24px;
}

.category-title {
  color: #aaa;
  font-size: 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  background: #333;
  color: #aaa;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.mapping-items {
  display: grid;
  gap: 8px;
}

.mapping-item {
  background: #0f0f0f;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mapping-item.needs-creation {
  border-color: rgba(255, 193, 7, 0.3);
  background: rgba(255, 193, 7, 0.05);
}

.item-name {
  color: #fff;
  font-size: 14px;
}

.item-status {
  font-size: 13px;
}

.found {
  color: #28a745;
}

.not-found {
  color: #ffc107;
}

.results-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.new-migration-btn {
  padding: 12px 32px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.new-migration-btn:hover {
  background: #0056b3;
}
</style>