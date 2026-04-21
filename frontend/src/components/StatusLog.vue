<template>
  <div class="status-log">
    <h3>Статус выполнения</h3>

    <div v-if="status" class="status-info">
      <div class="status-badge" :class="status.status">
        Статус: {{ getStatusText(status.status) }}
      </div>
      <div class="step-info">
        Текущий шаг: {{ getStepText(status.step) }}
      </div>
      <div v-if="status.transportId" class="id-info">
        🚌 Транспорт ID: {{ status.transportId }}
      </div>
      <div v-if="status.hotelId" class="id-info">
        🏨 Отель ID: {{ status.hotelId }}
      </div>
      <div v-if="status.tourId" class="id-info">
        🎯 Тур ID: {{ status.tourId }}
      </div>
      <div v-if="tourUrl" class="tour-link">
        <a :href="tourUrl" target="_blank">🔗 Открыть тур в админке</a>
      </div>
      <div v-if="status.error" class="error">
        ❌ Ошибка: {{ status.error }}
      </div>
    </div>

    <div class="logs-container">
      <div class="logs-header">
        <span>Логи выполнения</span>
        <button @click="clearLogs" class="clear-btn">Очистить</button>
      </div>
      <div class="logs" ref="logsContainer">
        <div v-for="(log, index) in logs" :key="index" class="log-entry">
          {{ log }}
        </div>
        <div v-if="logs.length === 0" class="log-entry placeholder">
          Логи появятся здесь...
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { TourStatus } from '../types';

const props = defineProps<{
  logs: string[];
  status: TourStatus | null;
  tourUrl: string;
}>();

const emit = defineEmits<{
  (e: 'clear-logs'): void;
}>();

const logsContainer = ref<HTMLElement>();

const getStatusText = (status: string): string => {
  const texts: Record<string, string> = {
    'pending': 'Ожидание',
    'processing': 'Выполняется',
    'completed': 'Завершено',
    'failed': 'Ошибка'
  };
  return texts[status] || status;
};

const getStepText = (step: string): string => {
  const texts: Record<string, string> = {
    'login': 'Вход в систему',
    'transport': 'Создание транспорта',
    'hotel': 'Создание отеля',
    'tour': 'Создание тура',
    'done': 'Завершено'
  };
  return texts[step] || step;
};

const clearLogs = () => {
  emit('clear-logs');
};

watch(() => props.logs.length, async () => {
  await nextTick();
  if (logsContainer.value) {
    logsContainer.value.scrollTop = logsContainer.value.scrollHeight;
  }
});
</script>

<style scoped>
.status-log {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
}

h3 {
  margin-bottom: 15px;
  color: #333;
}

.status-info {
  background: white;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 15px;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 10px;
}

.status-badge.pending {
  background: #ffc107;
  color: #856404;
}

.status-badge.processing {
  background: #17a2b8;
  color: white;
}

.status-badge.completed {
  background: #28a745;
  color: white;
}

.status-badge.failed {
  background: #dc3545;
  color: white;
}

.step-info {
  margin-bottom: 8px;
  color: #666;
}

.id-info {
  margin-bottom: 5px;
  color: #333;
  font-family: monospace;
}

.tour-link {
  margin-top: 10px;
}

.tour-link a {
  color: #4CAF50;
  text-decoration: none;
  font-weight: bold;
}

.tour-link a:hover {
  text-decoration: underline;
}

.error {
  margin-top: 10px;
  padding: 10px;
  background: #ffebee;
  color: #c62828;
  border-radius: 4px;
}

.logs-container {
  background: white;
  border-radius: 6px;
  overflow: hidden;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: #e0e0e0;
  font-weight: bold;
}

.clear-btn {
  padding: 4px 12px;
  background: #757575;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.clear-btn:hover {
  background: #616161;
}

.logs {
  max-height: 300px;
  overflow-y: auto;
  padding: 10px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  background: #1e1e1e;
  color: #d4d4d4;
}

.log-entry {
  padding: 3px 0;
  border-bottom: 1px solid #333;
  word-wrap: break-word;
}

.log-entry.placeholder {
  color: #888;
  font-style: italic;
}
</style>