<template>
  <div class="tour-creator">
    <div class="creator-form">
      <div class="form-header">
        <h2>Параметры тура</h2>
        <p>Заполните данные для создания тура</p>
      </div>

      <form @submit.prevent="handleCreateTour">
        <div class="form-group">
          <label for="tourName">Название тура</label>
          <input
              id="tourName"
              v-model="tourName"
              type="text"
              placeholder="Например: Тур в Москву"
              required
              :disabled="isProcessing"
          />
        </div>

        <div class="form-group">
          <label for="cityId">ID города</label>
          <input
              id="cityId"
              v-model.number="cityId"
              type="number"
              placeholder="1105"
              required
              :disabled="isProcessing"
          />
          <small class="hint">По умолчанию: 1105 (Москва)</small>
        </div>

        <button type="submit" :disabled="isProcessing || !tourName || !cityId" class="submit-btn">
          <span v-if="!isProcessing">🚀 Создать тур</span>
          <span v-else>⏳ Создание...</span>
        </button>
      </form>

      <StatusLog
          :logs="logs"
          :status="currentStatus"
          :tour-url="tourUrl"
          @clear-logs="logs = []"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted } from 'vue';
import StatusLog from './StatusLog.vue';
import ApiService from '../services/api.service';
import type { TourStatus } from '../types';

const isProcessing = ref(false);
const sessionId = ref('');
const tourName = ref('');
const cityId = ref<number>(1105);
const logs = ref<string[]>([]);
const currentStatus = ref<TourStatus | null>(null);
const tourUrl = ref('');

let eventSource: EventSource | null = null;
let pollInterval: NodeJS.Timeout | null = null;

onMounted(() => {
  sessionId.value = localStorage.getItem('sessionId') || '';
});

const logout = () => {
  localStorage.clear();
  window.location.href = '/login';
};

const startPolling = () => {
  logs.value.push('🔄 Переключение на режим опроса...');

  pollInterval = setInterval(async () => {
    if (!isProcessing.value) {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      return;
    }

    try {
      const status = await ApiService.getTourStatus(sessionId.value);
      currentStatus.value = status;

      if (status.log) {
        logs.value = status.log;
      }

      if (status.status === 'completed' && status.tourId) {
        tourUrl.value = `https://manager.pazltours.online/tours/${status.tourId}/edit`;
        logs.value.push('🎉 Тур успешно создан!');
        isProcessing.value = false;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } else if (status.status === 'failed') {
        logs.value.push(`❌ Ошибка: ${status.error || 'Неизвестная ошибка'}`);
        isProcessing.value = false;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    } catch (error: any) {
      console.error('Ошибка опроса:', error);
    }
  }, 2000);
};

const handleCreateTour = async () => {
  isProcessing.value = true;
  logs.value = [];
  currentStatus.value = null;
  tourUrl.value = '';

  try {
    const userEmail = localStorage.getItem('userEmail') || '';
    const userPassword = localStorage.getItem('userPassword') || '';

    if (!userEmail || !userPassword) {
      throw new Error('Данные для входа не найдены');
    }

    await ApiService.createTour({
      sessionId: sessionId.value,
      tourName: tourName.value,
      cityId: cityId.value,
      email: userEmail,
      password: userPassword
    });

    logs.value.push('🚀 Процесс создания тура запущен');
    logs.value.push('📡 Подключение к серверу для получения обновлений...');

    if (eventSource) {
      eventSource.close();
    }

    eventSource = ApiService.createEventSource(sessionId.value);

    eventSource.onopen = () => {
      logs.value.push('✅ Подключение установлено');
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'log') {
          logs.value.push(data.data.message);
        } else if (data.type === 'status') {
          currentStatus.value = data.data;

          if (data.data.status === 'completed' && data.data.tourId) {
            tourUrl.value = `https://manager.pazltours.online/tours/${data.data.tourId}/edit`;
            logs.value.push('🎉 Тур успешно создан!');
            isProcessing.value = false;
            if (eventSource) {
              eventSource.close();
              eventSource = null;
            }
          } else if (data.data.status === 'failed') {
            logs.value.push(`❌ Ошибка: ${data.data.error || 'Неизвестная ошибка'}`);
            isProcessing.value = false;
            if (eventSource) {
              eventSource.close();
              eventSource = null;
            }
          }
        }
      } catch (error) {
        console.error('Ошибка обработки сообщения:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Ошибка EventSource:', error);
      logs.value.push('⚠️ Проблема с подключением. Пробуем переподключиться...');

      setTimeout(() => {
        if (isProcessing.value && eventSource?.readyState === EventSource.CLOSED) {
          startPolling();
        }
      }, 3000);
    };

  } catch (error: any) {
    logs.value.push(`❌ Ошибка: ${error.message}`);
    isProcessing.value = false;
  }
};

onUnmounted(() => {
  if (eventSource) {
    eventSource.close();
  }
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});
</script>

<style scoped>
.tour-creator {
  max-width: 900px;
  margin: 0 auto;
}

.creator-form {
  background: #1e1e1e;
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border: 1px solid #333;
}

.form-header {
  margin-bottom: 30px;
}

.form-header h2 {
  color: #ffffff;
  font-size: 24px;
  margin-bottom: 8px;
}

.form-header p {
  color: #888;
  font-size: 14px;
}

.form-group {
  margin-bottom: 24px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #aaa;
  font-size: 14px;
  font-weight: 500;
}

input {
  width: 100%;
  padding: 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  font-size: 14px;
  color: #fff;
  box-sizing: border-box;
  transition: border-color 0.3s;
}

input:focus {
  outline: none;
  border-color: #4CAF50;
}

input::placeholder {
  color: #666;
}

input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  display: block;
  margin-top: 6px;
  color: #666;
  font-size: 12px;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-bottom: 30px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.submit-btn:disabled {
  background: #444;
  cursor: not-allowed;
  transform: none;
}
</style>