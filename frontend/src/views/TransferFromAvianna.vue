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
      <!-- Форма -->
      <div v-if="!migrationStarted && !result" class="form-section">
        <div class="form-container">
          <h2>Данные для миграции</h2>
          <p class="description">
            Введите данные для доступа к обоим аккаунтам и название тура для переноса
          </p>

          <div class="info-box">
            <h4>📋 Процесс миграции:</h4>
            <ol>
              <li>🔐 Вход в Avianna</li>
              <li>🔍 Поиск и загрузка тура</li>
              <li>🔐 Вход в Pazl Tours</li>
              <li>🔍 Поиск соответствий</li>
              <li>🔨 Создание недостающих сущностей</li>
              <li>🎯 Создание тура в Pazl Tours</li>
            </ol>
          </div>

          <div class="form-grid">
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

          <div v-if="error" class="error-block">
            <div class="error-header">❌ Ошибка</div>
            <div class="error-message">{{ error }}</div>
          </div>
        </div>
      </div>

      <!-- Прогресс миграции (SSE) -->
      <div v-if="migrationStarted && !result" class="progress-section">
        <div class="progress-container">
          <h2>🔄 Идёт миграция...</h2>
          <p class="progress-subtitle">Пожалуйста, не закрывайте страницу</p>

          <div class="steps-list">
            <div
                v-for="(step, index) in steps"
                :key="index"
                class="step-item"
                :class="{
                'step-active': step.status === 'active',
                'step-completed': step.status === 'completed',
                'step-error': step.status === 'error'
              }"
            >
              <div class="step-indicator">
                <span v-if="step.status === 'completed'" class="step-icon">✅</span>
                <span v-else-if="step.status === 'active'" class="step-icon">
                  <span class="mini-spinner"></span>
                </span>
                <span v-else-if="step.status === 'error'" class="step-icon">❌</span>
                <span v-else class="step-icon">⏳</span>
              </div>
              <div class="step-content">
                <div class="step-title">{{ step.title }}</div>
                <div v-if="step.message" class="step-message">{{ step.message }}</div>
                <div v-if="step.status === 'error' && step.error" class="step-error-msg">
                  {{ step.error }}
                </div>
              </div>
            </div>
          </div>

          <div class="progress-bar-container">
            <div class="progress-bar">
              <div
                  class="progress-fill"
                  :style="{ width: progressPercent + '%' }"
              ></div>
            </div>
            <div class="progress-text">{{ progressPercent }}%</div>
          </div>

          <div v-if="hasError" class="error-actions">
            <button @click="resetForm" class="reset-btn">🔄 Вернуться к форме</button>
          </div>
        </div>
      </div>

      <!-- Результаты -->
      <div v-if="result" class="results-section">
        <div class="results-container">
          <div class="results-header">
            <h2 :class="result.tourCreated ? 'success' : 'warning'">
              {{ result.tourCreated ? '✅ Тур успешно создан!' : '⚠️ Миграция завершена с предупреждениями' }}
            </h2>
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
              <div class="stat-label">Требовалось создать</div>
            </div>
            <div class="stat-card created">
              <div class="stat-value">{{ result.stats.created }}</div>
              <div class="stat-label">Успешно создано</div>
            </div>
          </div>

          <!-- Статус создания -->
          <div v-if="result.stats.totalToCreate > 0" class="creation-status" :class="result.stats.created === result.stats.totalToCreate ? 'all-created' : 'partial-created'">
            <span v-if="result.stats.created === result.stats.totalToCreate">✅ Все необходимые сущности успешно созданы</span>
            <span v-else-if="result.stats.created > 0">⚠️ Создано {{ result.stats.created }} из {{ result.stats.totalToCreate }} сущностей</span>
            <span v-else>ℹ️ Сущности не были созданы (возможно они уже существуют)</span>
          </div>

          <!-- Созданные сущности -->
          <div v-if="result.createdEntities && result.createdEntities.length > 0" class="section-block">
            <h3>🆕 Созданные сущности ({{ result.createdEntities.length }})</h3>
            <div class="entities-grid">
              <div
                  v-for="(entity, index) in result.createdEntities"
                  :key="`${entity.type}_${entity.pazl_id}_${index}`"
                  class="entity-card"
              >
                <div class="entity-type">{{ getEntityTypeLabel(entity.type) }}</div>
                <div class="entity-name">{{ entity.source_name }}</div>
                <div class="entity-id">ID в Pazl: {{ entity.pazl_id }}</div>
              </div>
            </div>
          </div>

          <!-- Детали маппинга -->
          <div class="section-block">
            <h3>
              📊 Детали маппинга
              <span class="section-badge">Найдено: {{ result.stats.totalExists }}</span>
              <span v-if="result.stats.totalToCreate > 0" class="section-badge warning">Создано: {{ result.stats.totalToCreate }}</span>
            </h3>

            <div class="mappings-detail">
              <div
                  v-for="(items, category) in result.mappings"
                  :key="category"
                  class="mapping-category"
              >
                <div v-if="items && items.length > 0" class="category-section">
                  <h4 class="category-title">
                    {{ getCategoryName(String(category)) }}
                    <span class="badge">{{ items.length }}</span>
                    <span v-if="items && getCategoryStats(items).toCreate > 0" class="badge warning">
                      ⚠️ {{ getCategoryStats(items).toCreate }}
                    </span>
                    <span v-if="items && getCategoryStats(items).toCreate === 0 && items.length > 0" class="badge success">
                      ✓
                    </span>
                  </h4>

                  <div class="mapping-items">
                    <div
                        v-for="(item, itemIndex) in items"
                        :key="`${item.source_id}_${item.source_name}_${itemIndex}`"
                        class="mapping-item"
                        :class="{ 'needs-creation': item.needs_creation, 'is-found': !item.needs_creation }"
                    >
                      <div class="item-name">{{ item.source_name }}</div>
                      <div class="item-status">
                        <span v-if="!item.needs_creation" class="found">
                          ✅ {{ item.pazl_name }} (ID: {{ item.pazl_id }})
                        </span>
                        <span v-else class="not-found">
                          ⚠️ Не найден, требуется создание
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Данные тура -->
          <div v-if="result.tourData" class="section-block">
            <h3>🎯 Данные тура</h3>
            <div class="tour-info">
              <div class="tour-info-item">
                <span class="label">Название:</span>
                <span class="value">{{ result.tourData.name }}</span>
              </div>
              <div class="tour-info-item">
                <span class="label">ID в Avianna:</span>
                <span class="value">{{ result.tourData.id }}</span>
              </div>
              <div class="tour-info-item">
                <span class="label">Статус создания:</span>
                <span class="value" :class="result.tourCreated ? 'text-success' : 'text-warning'">
                  {{ result.tourCreated ? '✅ Успешно создан в Pazl Tours' : '❌ Не создан' }}
                </span>
              </div>
            </div>
          </div>

          <!-- Кнопки -->
          <div class="results-actions">
            <button @click="resetForm" class="new-migration-btn">
              🔄 Новая миграция
            </button>
            <button @click="goBack" class="back-btn-secondary">
              ← На главную
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import apiService from '@/services/api.service';
import type { MigrationResultData, MappedEntity } from '@/types';

const router = useRouter();

const loading = ref(false);
const error = ref('');
const migrationStarted = ref(false);
const result = ref<MigrationResultData | null>(null);
const progressPercent = ref(0);

interface Step {
  title: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message: string;
  error?: string;
}

const steps = reactive<Step[]>([
  { title: 'Вход в Avianna', status: 'pending', message: '' },
  { title: 'Поиск и загрузка тура', status: 'pending', message: '' },
  { title: 'Вход в Pazl Tours', status: 'pending', message: '' },
  { title: 'Поиск соответствий', status: 'pending', message: '' },
  { title: 'Создание недостающих сущностей', status: 'pending', message: '' },
  { title: 'Создание тура в Pazl Tours', status: 'pending', message: '' },
]);

const hasError = computed(() => {
  return steps.some(step => step.status === 'error');
});

const form = ref({
  aviannaEmail: '',
  aviannaPassword: '',
  pazlEmail: '',
  pazlPassword: '',
  tourName: ''
});

const isFormValid = computed(() => {
  return !!(form.value.aviannaEmail &&
      form.value.aviannaPassword &&
      form.value.pazlEmail &&
      form.value.pazlPassword &&
      form.value.tourName);
});

const categoryNames: Record<string, string> = {
  cities: '🏙️ Города',
  transportations: '🚌 Типы транспорта',
  transports: '🚗 Транспортные маршруты',
  hotel_meals: '🍽️ Питание в отелях',
  hotel_accommodations: '🏨 Размещение',
  hotel_infrastructure_types: '🏗️ Типы инфраструктуры',
  hotel_infrastructures: '🏢 Инфраструктура отелей',
  room_types: '🛏️ Типы номеров',
  room_places: '📍 Места в номерах',
  room_descriptions: '📝 Описания номеров',
  room_services: '🛠️ Сервисы номеров',
  room_equipments: '🔧 Оборудование номеров',
  room_furnitures: '🪑 Мебель номеров',
  room_bathrooms: '🚿 Ванные комнаты',
  hotels: '🏨 Отели',
  tour_categories: '📂 Категории туров',
  tour_services: '🛠️ Услуги туров',
  catalog_sections: '📑 Разделы каталога'
};

const entityTypeLabels: Record<string, string> = {
  city: '🏙️ Город',
  tour_category: '📁 Категория',
  hotel_meal: '🍽️ Питание',
  hotel_infrastructure_type: '🏗️ Тип инфраструктуры',
  hotel_infrastructure: '🏢 Инфраструктура',
  tour_service: '🛠️ Услуга тура',
  transport: '🚌 Транспорт',
  hotel: '🏨 Гостиница'
};

function getCategoryName(key: string): string {
  return categoryNames[key] || key;
}

function getEntityTypeLabel(type: string): string {
  return entityTypeLabels[type] || type;
}

function getCategoryStats(items: MappedEntity[]): { toCreate: number; exists: number } {
  if (!items || !Array.isArray(items)) {
    return { toCreate: 0, exists: 0 };
  }
  const toCreate = items.filter((i) => i.needs_creation).length;
  const exists = items.filter((i) => !i.needs_creation).length;
  return { toCreate, exists };
}

function updateProgress(): void {
  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const totalSteps = steps.length;
  progressPercent.value = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
}

function updateStep(stepIndex: number, status: Step['status'], message: string, errMsg?: string): void {
  if (stepIndex >= 0 && stepIndex < steps.length) {
    const step = steps[stepIndex];
    if (step) {
      step.status = status;
      step.message = message;
      if (errMsg) {
        step.error = errMsg;
      }
    }
  }
  updateProgress();
}

function resetSteps(): void {
  steps.forEach(step => {
    step.status = 'pending';
    step.message = '';
    step.error = '';
  });
  updateProgress();
}

async function startMigration(): Promise<void> {
  if (!isFormValid.value) return;

  loading.value = true;
  error.value = '';
  migrationStarted.value = true;
  result.value = null;
  resetSteps();

  try {
    updateStep(0, 'active', 'Запуск миграции...');

    const { sessionId } = await apiService.startMigrationSession(form.value);
    console.log('Session ID:', sessionId);

    const eventSource = apiService.createMigrationEventSource(sessionId);

    eventSource.addEventListener('connected', (event: Event) => {
      const messageEvent = event as MessageEvent;
      console.log('SSE connected:', JSON.parse(messageEvent.data));
    });

    eventSource.addEventListener('step', (event: Event) => {
      const messageEvent = event as MessageEvent;
      const data = JSON.parse(messageEvent.data);
      console.log('Step event:', data);
      updateStep(data.step, data.status, data.message, data.error);
    });

    eventSource.addEventListener('error', (event: Event) => {
      const messageEvent = event as MessageEvent;
      const data = JSON.parse(messageEvent.data);
      console.error('SSE error:', data);
      error.value = data.message || 'Ошибка миграции';
      loading.value = false;
      eventSource.close();
    });

    eventSource.addEventListener('result', (event: Event) => {
      const messageEvent = event as MessageEvent;
      const data = JSON.parse(messageEvent.data);
      console.log('Result:', data);

      if (data.success && data.data) {
        const res = data.data as MigrationResultData;
        result.value = res;
        progressPercent.value = 100;

        if (res.tourCreated) {
          updateStep(5, 'completed', '✅ Тур успешно создан в Pazl Tours!');
        } else {
          updateStep(5, 'error', '❌ Тур не был создан', res.message);
        }
      }

      loading.value = false;
      eventSource.close();
    });

    eventSource.onerror = (): void => {
      console.error('SSE connection error, readyState:', eventSource.readyState);
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('SSE connection closed normally');
      } else {
        error.value = 'Потеряно соединение с сервером';
        loading.value = false;
        eventSource.close();
      }
    };

  } catch (err: any) {
    console.error('Migration start error:', err);
    error.value = err.response?.data?.error || err.message || 'Ошибка запуска миграции';
    loading.value = false;
    migrationStarted.value = false;
  }
}

function resetForm(): void {
  result.value = null;
  error.value = '';
  migrationStarted.value = false;
  resetSteps();
  form.value = {
    aviannaEmail: '',
    aviannaPassword: '',
    pazlEmail: '',
    pazlPassword: '',
    tourName: ''
  };
}

function goBack(): void {
  router.push('/');
}

function logout(): void {
  localStorage.clear();
  router.push('/login');
}
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

/* Форма */
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
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 1.5;
}

.info-box {
  background: rgba(0, 123, 255, 0.1);
  border: 1px solid rgba(0, 123, 255, 0.3);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 32px;
}

.info-box h4 {
  color: #007bff;
  margin-bottom: 8px;
  font-size: 14px;
}

.info-box ol {
  color: #aaa;
  font-size: 13px;
  padding-left: 20px;
  line-height: 1.8;
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

/* Ошибки */
.error-block {
  margin-top: 24px;
  padding: 16px;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 8px;
}

.error-header {
  color: #dc3545;
  font-weight: 600;
  font-size: 16px;
  margin-bottom: 8px;
}

.error-message {
  color: #ff6b6b;
  font-size: 14px;
  line-height: 1.5;
}

/* Прогресс */
.progress-section {
  max-width: 700px;
  margin: 0 auto;
}

.progress-container {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 40px;
}

.progress-container h2 {
  color: #ffffff;
  font-size: 24px;
  margin-bottom: 8px;
  text-align: center;
}

.progress-subtitle {
  color: #888;
  font-size: 14px;
  text-align: center;
  margin-bottom: 32px;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  background: #0f0f0f;
  border: 1px solid #333;
  transition: all 0.3s;
}

.step-item.step-active {
  border-color: #007bff;
  background: rgba(0, 123, 255, 0.05);
}

.step-item.step-completed {
  border-color: #28a745;
  background: rgba(40, 167, 69, 0.05);
}

.step-item.step-error {
  border-color: #dc3545;
  background: rgba(220, 53, 69, 0.05);
}

.step-indicator {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step-icon {
  font-size: 20px;
}

.mini-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 3px solid rgba(0, 123, 255, 0.3);
  border-top-color: #007bff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.step-content {
  flex: 1;
}

.step-title {
  color: #fff;
  font-size: 15px;
  font-weight: 500;
}

.step-message {
  color: #888;
  font-size: 13px;
  margin-top: 4px;
}

.step-error-msg {
  color: #dc3545;
  font-size: 12px;
  margin-top: 4px;
  padding: 8px;
  background: rgba(220, 53, 69, 0.1);
  border-radius: 4px;
  word-break: break-word;
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007bff, #28a745);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.progress-text {
  color: #aaa;
  font-size: 14px;
  font-weight: 600;
  min-width: 40px;
}

.error-actions {
  text-align: center;
}

.reset-btn {
  padding: 10px 24px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.3s;
}

.reset-btn:hover {
  background: #c82333;
}

/* Результаты */
.results-section {
  max-width: 1200px;
  margin: 0 auto;
}

.results-container {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 40px;
}

.results-header {
  text-align: center;
  margin-bottom: 40px;
}

.results-header h2 {
  font-size: 28px;
  margin-bottom: 12px;
}

.results-header h2.success {
  color: #28a745;
}

.results-header h2.warning {
  color: #ffc107;
}

.result-message {
  color: #888;
  font-size: 16px;
}

.creation-status {
  text-align: center;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 32px;
  font-size: 14px;
}

.creation-status.all-created {
  background: rgba(40, 167, 69, 0.1);
  border: 1px solid rgba(40, 167, 69, 0.3);
  color: #28a745;
}

.creation-status.partial-created {
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  color: #ffc107;
}

.stats-container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: #0f0f0f;
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
.stat-card.created .stat-value { color: #17a2b8; }

.section-block {
  margin-bottom: 32px;
}

.section-block h3 {
  color: #ffffff;
  font-size: 20px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.section-badge {
  background: #333;
  color: #aaa;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: normal;
}

.section-badge.warning {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

.entities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.entity-card {
  background: #0f0f0f;
  border: 1px solid #28a745;
  border-radius: 8px;
  padding: 12px;
}

.entity-type {
  color: #28a745;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}

.entity-name {
  color: #fff;
  font-size: 14px;
  margin-bottom: 4px;
  word-break: break-word;
}

.entity-id {
  color: #888;
  font-size: 12px;
}

.mappings-detail {
  max-height: 600px;
  overflow-y: auto;
}

.mapping-category {
  margin-bottom: 16px;
}

.category-title {
  color: #aaa;
  font-size: 16px;
  margin-bottom: 8px;
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

.badge.warning {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

.badge.success {
  background: rgba(40, 167, 69, 0.2);
  color: #28a745;
}

.mapping-items {
  display: grid;
  gap: 6px;
}

.mapping-item {
  background: #0f0f0f;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mapping-item.needs-creation {
  border-color: rgba(255, 193, 7, 0.3);
  background: rgba(255, 193, 7, 0.05);
}

.mapping-item.is-found {
  border-color: rgba(40, 167, 69, 0.2);
}

.item-name {
  color: #fff;
  font-size: 13px;
  word-break: break-word;
}

.item-status {
  font-size: 12px;
  flex-shrink: 0;
  margin-left: 12px;
}

.found {
  color: #28a745;
}

.not-found {
  color: #ffc107;
}

.tour-info {
  background: #0f0f0f;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
}

.tour-info-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #222;
}

.tour-info-item:last-child {
  border-bottom: none;
}

.tour-info-item .label {
  color: #888;
  font-size: 14px;
  min-width: 140px;
}

.tour-info-item .value {
  color: #fff;
  font-size: 14px;
}

.tour-info-item .text-success {
  color: #28a745;
}

.tour-info-item .text-warning {
  color: #dc3545;
}

.results-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 40px;
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

.back-btn-secondary {
  padding: 12px 32px;
  background: transparent;
  color: #aaa;
  border: 1px solid #444;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
}

.back-btn-secondary:hover {
  background: #2a2a2a;
  color: #fff;
  border-color: #666;
}

/* Скроллбар */
.mappings-detail::-webkit-scrollbar {
  width: 6px;
}

.mappings-detail::-webkit-scrollbar-track {
  background: #0f0f0f;
  border-radius: 3px;
}

.mappings-detail::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

.mappings-detail::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Адаптивность */
@media (max-width: 768px) {
  .stats-container {
    grid-template-columns: repeat(2, 1fr);
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .entities-grid {
    grid-template-columns: 1fr;
  }

  .results-actions {
    flex-direction: column;
  }
}
</style>
