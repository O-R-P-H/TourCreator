<template>
  <div class="login-page">
    <div class="login-container">
      <div class="login-header">
        <h1>🚀 Tour Creator</h1>
        <p>Войдите в систему для продолжения</p>
      </div>

      <LoginForm @login-success="handleLoginSuccess" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import LoginForm from '../components/LoginForm.vue';
import type { LoginResponse } from '../types';

const router = useRouter();

const handleLoginSuccess = (data: LoginResponse, email: string, password: string) => {
  localStorage.setItem('isLoggedIn', 'true');
  localStorage.setItem('sessionId', data.sessionId);
  localStorage.setItem('xsrfToken', data.xsrfToken);
  localStorage.setItem('userEmail', email);
  localStorage.setItem('userPassword', password);

  router.push('/');
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
  padding: 20px;
}

.login-container {
  width: 100%;
  max-width: 450px;
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h1 {
  font-size: 32px;
  color: #ffffff;
  margin-bottom: 10px;
}

.login-header p {
  color: #888;
  font-size: 14px;
}
</style>