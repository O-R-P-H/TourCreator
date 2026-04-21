<template>
  <div class="tour-creator">
    <div v-if="!isLoggedIn">
      <LoginForm @login-success="handleLoginSuccess" />
    </div>

    <div v-else class="creator-form">
      <div class="header">
        <h2>Создание тура</h2>
        <button @click="logout" class="logout-btn">Выйти</button>
      </div>

      <form @submit.prevent="handleCreateTour">
        <div class="form-group">
          <label for="tourName">Название тура</label>
          <input
              id="tourName"
              v-model="tourName"
              type="text"
              placeholder="Введите название тура"
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
              placeholder="Введите ID города"
              required
              :disabled="isProcessing"
          />
        </div>

        <button type="submit" :disabled="isProcessing || !tourName || !cityId">
          {{ isProcessing ? 'Создание...' : 'Создать тур' }}
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
import { ref, onUnmounted } from 'vue';
import LoginForm from './LoginForm.vue';
import StatusLog from './StatusLog.vue';
import ApiService from '../services/api.service';
import type { LoginResponse, TourStatus } from '../types';

const isLoggedIn = ref(false);
const isProcessing = ref(false);
const sessionId = ref('');
const tourName = ref('');
const cityId = ref<number>(1105);
const logs = ref<string[]>([]);
const currentStatus = ref<TourStatus | null>(null);
const tourUrl = ref('');
const xsrfToken = ref('');
const userEmail = ref('');
const userPassword = ref('');

let eventSource: EventSource | null = null;
let pollInterval: NodeJS.Timeout | null = null;

const handleLoginSuccess = (data: LoginResponse, email: string, password: string) => {
  sessionId.value = data.sessionId;
  xsrfToken.value = data.xsrfToken;
  userEmail.value = email;
  userPassword.value = password;
  isLoggedIn.value = true;
  logs.value = [`✅ Успешный вход. Session ID: ${data.sessionId}`];
};

const logout = () => {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  isLoggedIn.value = false;
  isProcessing.value = false;
  sessionId.value = '';
  xsrfToken.value = '';
  userEmail.value = '';
  userPassword.value = '';
  logs.value = [];
  currentStatus.value = null;
  tourUrl.value = '';
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
    if (!userEmail.value || !userPassword.value) {
      throw new Error('Данные для входа не найдены');
    }

    await ApiService.createTour({
      sessionId: sessionId.value,
      tourName: tourName.value,
      cityId: cityId.value,
      email: userEmail.value,
      password: userPassword.value
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
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.creator-form {
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

h2 {
  color: #333;
  margin: 0;
}

.logout-btn {
  padding: 8px 16px;
  background: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.logout-btn:hover {
  background: #d32f2f;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 5px;
  color: #666;
  font-size: 14px;
}

input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
}

input:focus {
  outline: none;
  border-color: #4CAF50;
}

button[type="submit"] {
  width: 100%;
  padding: 12px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

button[type="submit"]:hover:not(:disabled) {
  background: #45a049;
}

button[type="submit"]:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>