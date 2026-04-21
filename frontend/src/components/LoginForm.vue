<template>
  <div class="login-form">
    <h2>Вход в систему</h2>
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label for="email">Email</label>
        <input
            id="email"
            v-model="email"
            type="email"
            placeholder="Введите email"
            required
            :disabled="loading"
        />
      </div>
      <div class="form-group">
        <label for="password">Пароль</label>
        <input
            id="password"
            v-model="password"
            type="password"
            placeholder="Введите пароль"
            required
            :disabled="loading"
        />
      </div>
      <button type="submit" :disabled="loading">
        {{ loading ? 'Вход...' : 'Войти' }}
      </button>
    </form>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ApiService from '../services/api.service';
import type { LoginResponse } from '../types';

const emit = defineEmits<{
  (e: 'login-success', data: LoginResponse, email: string, password: string): void;
}>();

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

const handleSubmit = async () => {
  loading.value = true;
  error.value = '';

  try {
    const response = await ApiService.login(email.value, password.value);
    emit('login-success', response, email.value, password.value);
  } catch (err: any) {
    error.value = err.message || 'Ошибка входа';
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-form {
  padding: 40px;
  background: #1e1e1e;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border: 1px solid #333;
}

h2 {
  margin-bottom: 24px;
  color: #ffffff;
  text-align: center;
  font-size: 24px;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 8px;
  color: #aaa;
  font-size: 14px;
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

button {
  width: 100%;
  padding: 12px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.3s;
  margin-top: 10px;
}

button:hover:not(:disabled) {
  background: #45a049;
}

button:disabled {
  background: #444;
  cursor: not-allowed;
}

.error {
  margin-top: 16px;
  padding: 12px;
  background: #3a1a1a;
  color: #ff6b6b;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
  border: 1px solid #ff4444;
}
</style>