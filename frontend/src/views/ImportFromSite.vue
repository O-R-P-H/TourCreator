<template>
  <div class="import-from-site">
    <header class="header">
      <div class="header-left">
        <button @click="goBack" class="back-btn">← Назад</button>
        <h1>🌐 Импорт тура с внешнего сайта</h1>
      </div>
      <button @click="logout" class="logout-btn">Выйти</button>
    </header>

    <main class="main">
      <!-- Шаг 1: Ввод URL -->
      <div v-if="currentStep === 1" class="step-section">
        <div class="step-container">
          <h2>Шаг 1: Укажите ссылку на тур</h2>
          <p class="step-desc">Введите URL страницы с описанием тура для парсинга</p>

          <div class="url-input-group">
            <input
                v-model="url"
                type="url"
                placeholder="https://example.com/tour"
                class="url-input"
                :disabled="loading"
                @keyup.enter="parseUrl"
            />
            <button
                @click="parseUrl"
                class="parse-btn"
                :disabled="loading || !url.trim()"
            >
              <span v-if="loading" class="spinner"></span>
              {{ loading ? 'Загрузка...' : '🔍 Загрузить' }}
            </button>
          </div>

          <div v-if="parseError" class="error-block">
            <div class="error-header">❌ Ошибка</div>
            <div class="error-message">{{ parseError }}</div>
          </div>

          <div class="examples">
            <h4>Примеры страниц:</h4>
            <ul>
              <li>Страница тура на сайте туроператора</li>
              <li>Лендинг с описанием тура</li>
              <li>Страница с программой, отелями и ценами</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Шаг 2: Сопоставление блоков -->
      <div v-if="currentStep === 2 && parsedData" class="step-section">
        <div class="step-container wide">
          <div class="step-header">
            <div>
              <h2>Шаг 2: Сопоставьте блоки с сущностями</h2>
              <p class="step-desc">
                Страница: <a :href="parsedData.url" target="_blank">{{ parsedData.title }}</a>
              </p>
            </div>
            <div class="step-actions">
              <span class="badge">Блоков: {{ parsedData.blocks.length }}</span>
              <span class="badge matched">Сопоставлено: {{ matchedCount }}</span>
            </div>
          </div>

          <div class="blocks-grid">
            <div
                v-for="block in parsedData.blocks"
                :key="block.id"
                class="block-card"
                :class="{
                  'block-matched': getMatchedType(block.id),
                  'block-hotel': getMatchedType(block.id) === 'hotel',
                  'block-transport': getMatchedType(block.id) === 'transport',
                  'block-service': getMatchedType(block.id) === 'service',
                  'block-day': getMatchedType(block.id) === 'day',
                  'block-info': getMatchedType(block.id) === 'tour_info',
                }"
            >
              <div class="block-header">
                <span class="block-id">{{ block.id }}</span>
                <span class="block-auto-type" :class="'type-' + block.type">
                  {{ getTypeLabel(block.type) }}
                </span>
              </div>

              <div class="block-title">{{ block.title }}</div>

              <div class="block-content" v-if="!expandedBlocks.has(block.id)">
                {{ block.content.substring(0, 200) }}
                <button
                    v-if="block.content.length > 200"
                    @click="toggleBlock(block.id)"
                    class="expand-btn"
                >
                  ...развернуть
                </button>
              </div>
              <div class="block-content expanded" v-else>
                {{ block.content }}
                <button @click="toggleBlock(block.id)" class="expand-btn">свернуть</button>
              </div>

              <div class="block-match">
                <label>Сопоставить как:</label>
                <select
                    v-model="matchMap[block.id]"
                    @change="onMatchChange(block.id, $event)"
                    class="match-select"
                >
                  <option value="">— Не сопоставлено —</option>
                  <option value="tour_info">📋 Информация о туре</option>
                  <option value="hotel">🏨 Отель</option>
                  <option value="transport">🚌 Транспорт</option>
                  <option value="service">🛠️ Услуга</option>
                  <option value="day">📅 День программы</option>
                  <option value="price">💰 Цена</option>
                </select>

                <!-- Доп. поле для названия -->
                <input
                    v-if="matchMap[block.id]"
                    v-model="matchNames[block.id]"
                    type="text"
                    :placeholder="getPlaceholder(matchMap[block.id])"
                    class="match-name-input"
                />
              </div>
            </div>
          </div>

          <div class="step-footer">
            <button @click="currentStep = 1" class="back-step-btn">← Назад</button>
            <button
                @click="goToCreate"
                class="next-step-btn"
                :disabled="matchedCount === 0"
            >
              Далее: Создать тур в Pazl →
            </button>
          </div>
        </div>
      </div>

      <!-- Шаг 3: Создание тура -->
      <div v-if="currentStep === 3" class="step-section">
        <div class="step-container">
          <h2>Шаг 3: Создание тура в Pazl Tours</h2>
          <p class="step-desc">Введите данные для входа в Pazl и запустите создание</p>

          <div v-if="!migrationStarted && !result" class="pazl-form">
            <div class="form-group">
              <label>Email Pazl Tours</label>
              <input v-model="pazlEmail" type="email" placeholder="email@pazltours.online" :disabled="loading" />
            </div>
            <div class="form-group">
              <label>Пароль Pazl Tours</label>
              <input v-model="pazlPassword" type="password" placeholder="••••••••" :disabled="loading" />
            </div>
            <button
                @click="startMigration"
                class="start-btn"
                :disabled="loading || !pazlEmail || !pazlPassword"
            >
              <span v-if="loading" class="spinner"></span>
              {{ loading ? 'Создание...' : '🚀 Создать тур в Pazl' }}
            </button>
          </div>

          <!-- Прогресс -->
          <div v-if="migrationStarted && !result" class="progress-container">
            <h3>🔄 Идёт создание...</h3>
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
                  <span v-if="step.status === 'completed'">✅</span>
                  <span v-else-if="step.status === 'active'"><span class="mini-spinner"></span></span>
                  <span v-else-if="step.status === 'error'">❌</span>
                  <span v-else>⏳</span>
                </div>
                <div class="step-content">
                  <div class="step-title">{{ step.title }}</div>
                  <div v-if="step.message" class="step-message">{{ step.message }}</div>
                </div>
              </div>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
            </div>
            <div class="progress-text">{{ progressPercent }}%</div>
          </div>

          <!-- Результат -->
          <div v-if="result" class="result-container">
            <div :class="result.success ? 'result-success' : 'result-error'">
              {{ result.success ? '✅ Данные подготовлены!' : '❌ Ошибка' }}
            </div>
            <p class="result-message">{{ result.message }}</p>

            <div v-if="result.stats" class="stats-row">
              <div class="stat-item">
                <div class="stat-value">{{ result.stats.total }}</div>
                <div class="stat-label">Всего сущностей</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ result.stats.hotels }}</div>
                <div class="stat-label">Отелей</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ result.stats.transports }}</div>
                <div class="stat-label">Транспорта</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ result.stats.services }}</div>
                <div class="stat-label">Услуг</div>
              </div>
            </div>

            <button @click="resetAll" class="reset-btn">🔄 Новый импорт</button>
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
import { config } from '@/config';

const router = useRouter();

// Состояние
const currentStep = ref(1);
const url = ref('');
const loading = ref(false);
const parseError = ref('');
const parsedData = ref<any>(null);
const matchMap = ref<Record<string, string>>({});
const matchNames = ref<Record<string, string>>({});
const expandedBlocks = ref(new Set<string>());
const pazlEmail = ref('');
const pazlPassword = ref('');
const migrationStarted = ref(false);
const result = ref<any>(null);
const progressPercent = ref(0);

interface Step {
  title: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  message: string;
}

const steps = reactive<Step[]>([
  { title: 'Вход в Pazl Tours', status: 'pending', message: '' },
  { title: 'Формирование данных', status: 'pending', message: '' },
]);

// Вычисляемые
const matchedCount = computed(() => {
  return Object.values(matchMap.value).filter(v => v).length;
});

// Методы
function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    hotel: '🏨 Отель',
    transport: '🚌 Транспорт',
    service: '🛠️ Услуга',
    day: '📅 Программа',
    price: '💰 Цены',
    info: '📋 Инфо',
    program: '📅 Программа',
    included: '✅ Включено',
    unknown: '❓ Неизвестно',
  };
  return labels[type] || type;
}

function getMatchedType(blockId: string): string {
  return matchMap.value[blockId] || '';
}

function getPlaceholder(entityType: string): string {
  const placeholders: Record<string, string> = {
    hotel: 'Название отеля',
    transport: 'Название транспорта',
    service: 'Название услуги',
    day: 'Название дня',
    price: 'Название тарифа',
    tour_info: 'Название тура',
  };
  return placeholders[entityType] || 'Название';
}

function toggleBlock(blockId: string) {
  if (expandedBlocks.value.has(blockId)) {
    expandedBlocks.value.delete(blockId);
  } else {
    expandedBlocks.value.add(blockId);
  }
}

function onMatchChange(blockId: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (!value) {
    delete matchNames.value[blockId];
  }
}

async function parseUrl() {
  if (!url.value.trim()) return;

  loading.value = true;
  parseError.value = '';
  parsedData.value = null;

  try {
    const response = await fetch(`${config.apiUrl}/api/external/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.value.trim() }),
      credentials: 'include',
    });

    const data = await response.json();

    if (!data.success) {
      parseError.value = data.error || 'Ошибка парсинга';
      return;
    }

    parsedData.value = data.data;
    currentStep.value = 2;

    // Авто-сопоставление по типам
    if (parsedData.value.blocks) {
      for (const block of parsedData.value.blocks) {
        if (block.type === 'hotel') matchMap.value[block.id] = 'hotel';
        else if (block.type === 'transport') matchMap.value[block.id] = 'transport';
        else if (block.type === 'service') matchMap.value[block.id] = 'service';
        else if (block.type === 'day' || block.type === 'program') matchMap.value[block.id] = 'day';
      }
    }

  } catch (err: any) {
    parseError.value = err.message || 'Ошибка соединения';
  } finally {
    loading.value = false;
  }
}

function goToCreate() {
  currentStep.value = 3;
}

async function startMigration() {
  if (!pazlEmail.value || !pazlPassword.value) return;

  loading.value = true;
  migrationStarted.value = true;
  result.value = null;
  progressPercent.value = 0;
  steps.forEach(s => { s.status = 'pending'; s.message = ''; });

  // Формируем matchedEntities
  const matchedEntities = Object.entries(matchMap.value)
      .filter(([_, type]) => type)
      .map(([blockId, entityType]) => ({
        blockId,
        entityType,
        name: matchNames.value[blockId] || parsedData.value.blocks.find((b: any) => b.id === blockId)?.title || '',
        data: parsedData.value.blocks.find((b: any) => b.id === blockId)?.content || '',
      }));

  try {
    const response = await fetch(`${config.apiUrl}/api/external/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parsedData: parsedData.value,
        matchedEntities,
        pazlEmail: pazlEmail.value,
        pazlPassword: pazlPassword.value,
      }),
      credentials: 'include',
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Ошибка создания');
    }

    const { sessionId } = data.data;

    // Подключаемся к SSE
    const streamUrl = `${config.apiUrl}/api/external/stream/${sessionId}`;
    const eventSource = new EventSource(streamUrl, { withCredentials: true });

    eventSource.addEventListener('step', (event: Event) => {
      const msgEvent = event as MessageEvent;
      const stepData = JSON.parse(msgEvent.data);
      if (stepData.step !== undefined && steps[stepData.step]) {
        steps[stepData.step].status = stepData.status;
        steps[stepData.step].message = stepData.message;
      }
      const completed = steps.filter(s => s.status === 'completed').length;
      progressPercent.value = Math.round((completed / steps.length) * 100);
    });

    eventSource.addEventListener('result', (event: Event) => {
      const msgEvent = event as MessageEvent;
      const resultData = JSON.parse(msgEvent.data);
      result.value = resultData.data || resultData;
      progressPercent.value = 100;
      loading.value = false;
      eventSource.close();
    });

    eventSource.addEventListener('error', (event: Event) => {
      const msgEvent = event as MessageEvent;
      const errorData = JSON.parse(msgEvent.data);
      parseError.value = errorData.message || 'Ошибка';
      loading.value = false;
      eventSource.close();
    });

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        loading.value = false;
      }
    };

  } catch (err: any) {
    parseError.value = err.message || 'Ошибка создания';
    loading.value = false;
    migrationStarted.value = false;
  }
}

function resetAll() {
  currentStep.value = 1;
  url.value = '';
  parsedData.value = null;
  matchMap.value = {};
  matchNames.value = {};
  expandedBlocks.value = new Set();
  pazlEmail.value = '';
  pazlPassword.value = '';
  migrationStarted.value = false;
  result.value = null;
  parseError.value = '';
  progressPercent.value = 0;
  steps.forEach(s => { s.status = 'pending'; s.message = ''; });
}

function goBack() {
  router.push('/');
}

function logout() {
  localStorage.clear();
  router.push('/login');
}
</script>

<style scoped>
.import-from-site {
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

.step-section {
  max-width: 1000px;
  margin: 0 auto;
}

.step-container {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 40px;
}

.step-container.wide {
  max-width: 1400px;
}

.step-container h2 {
  color: #ffffff;
  font-size: 24px;
  margin-bottom: 12px;
}

.step-desc {
  color: #888;
  font-size: 14px;
  margin-bottom: 24px;
}

.step-desc a {
  color: #007bff;
}

.url-input-group {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.url-input {
  flex: 1;
  padding: 14px;
  background: #0f0f0f;
  border: 1px solid #444;
  border-radius: 8px;
  color: #fff;
  font-size: 16px;
}

.url-input:focus {
  outline: none;
  border-color: #007bff;
}

.parse-btn {
  padding: 14px 32px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.parse-btn:hover:not(:disabled) {
  background: #0056b3;
}

.parse-btn:disabled {
  background: #555;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-block {
  margin-top: 16px;
  padding: 16px;
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  border-radius: 8px;
}

.error-header {
  color: #dc3545;
  font-weight: 600;
  margin-bottom: 8px;
}

.error-message {
  color: #ff6b6b;
  font-size: 14px;
}

.examples {
  margin-top: 32px;
  padding: 20px;
  background: #0f0f0f;
  border-radius: 8px;
}

.examples h4 {
  color: #aaa;
  margin-bottom: 8px;
}

.examples ul {
  color: #888;
  font-size: 13px;
  padding-left: 20px;
  line-height: 1.6;
}

/* Шаг 2 */
.step-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.step-actions {
  display: flex;
  gap: 12px;
}

.badge {
  padding: 6px 14px;
  background: #333;
  color: #aaa;
  border-radius: 20px;
  font-size: 14px;
}

.badge.matched {
  background: rgba(40, 167, 69, 0.2);
  color: #28a745;
}

.blocks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
  max-height: 600px;
  overflow-y: auto;
  margin-bottom: 24px;
}

.block-card {
  background: #0f0f0f;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.3s;
}

.block-card.block-matched {
  border-color: #666;
}

.block-card.block-hotel { border-color: rgba(220, 53, 69, 0.5); }
.block-card.block-transport { border-color: rgba(0, 123, 255, 0.5); }
.block-card.block-service { border-color: rgba(255, 193, 7, 0.5); }
.block-card.block-day { border-color: rgba(40, 167, 69, 0.5); }
.block-card.block-info { border-color: rgba(23, 162, 184, 0.5); }

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.block-id {
  color: #666;
  font-size: 11px;
  font-family: monospace;
}

.block-auto-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #222;
  color: #888;
}

.type-hotel { color: #dc3545; }
.type-transport { color: #007bff; }
.type-service { color: #ffc107; }
.type-day, .type-program { color: #28a745; }
.type-price { color: #17a2b8; }
.type-info { color: #aaa; }

.block-title {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
}

.block-content {
  color: #888;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 12px;
  max-height: 100px;
  overflow: hidden;
}

.block-content.expanded {
  max-height: none;
}

.expand-btn {
  background: none;
  border: none;
  color: #007bff;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.block-match {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #222;
}

.block-match label {
  color: #aaa;
  font-size: 12px;
}

.match-select {
  padding: 8px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
}

.match-name-input {
  padding: 8px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
}

.step-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.back-step-btn {
  padding: 10px 24px;
  background: transparent;
  color: #aaa;
  border: 1px solid #444;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.next-step-btn {
  padding: 12px 32px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.next-step-btn:hover:not(:disabled) {
  background: #218838;
}

.next-step-btn:disabled {
  background: #555;
  cursor: not-allowed;
}

/* Шаг 3 */
.pazl-form {
  margin-top: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  color: #aaa;
  margin-bottom: 8px;
  font-size: 14px;
}

.form-group input {
  width: 100%;
  padding: 12px;
  background: #0f0f0f;
  border: 1px solid #444;
  border-radius: 8px;
  color: #ffffff;
  font-size: 14px;
  box-sizing: border-box;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.start-btn:disabled {
  background: #555;
  cursor: not-allowed;
}

/* Прогресс */
.progress-container {
  margin-top: 24px;
  padding: 24px;
  background: #0f0f0f;
  border-radius: 8px;
}

.progress-container h3 {
  color: #fff;
  margin-bottom: 20px;
  text-align: center;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
}

.step-item.step-active { border-color: #007bff; }
.step-item.step-completed { border-color: #28a745; }
.step-item.step-error { border-color: #dc3545; }

.step-indicator {
  font-size: 18px;
  width: 28px;
  text-align: center;
}

.mini-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(0,123,255,0.3);
  border-top-color: #007bff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.step-title {
  color: #fff;
  font-size: 14px;
}

.step-message {
  color: #888;
  font-size: 12px;
  margin-top: 2px;
}

.progress-bar {
  height: 8px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007bff, #28a745);
  border-radius: 4px;
  transition: width 0.5s;
}

.progress-text {
  color: #aaa;
  font-size: 14px;
  text-align: center;
}

/* Результат */
.result-container {
  margin-top: 24px;
  padding: 24px;
  background: #0f0f0f;
  border-radius: 8px;
  text-align: center;
}

.result-success {
  color: #28a745;
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 12px;
}

.result-error {
  color: #dc3545;
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 12px;
}

.result-message {
  color: #888;
  font-size: 14px;
  margin-bottom: 24px;
}

.stats-row {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 24px;
}

.stat-item {
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px 24px;
  text-align: center;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #007bff;
  margin-bottom: 4px;
}

.stat-label {
  color: #888;
  font-size: 12px;
}

.reset-btn {
  padding: 12px 32px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
}
</style>