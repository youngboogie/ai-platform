<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authService } from '../services/auth';
import { extractErrorMessage } from '../services/api';
import { useAuthStore } from '../stores/auth';

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const form = reactive({
  email: '',
  password: '',
});

const loading = ref(false);
const errorMessage = ref('');

const submit = async () => {
  loading.value = true;
  errorMessage.value = '';
  try {
    const loginRes = await authService.login(form.email, form.password);
    authStore.setToken(loginRes.data.token);
    await authStore.fetchProfile();
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/workspace';
    await router.replace(redirect);
  } catch (error) {
    errorMessage.value = extractErrorMessage(error);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="auth-page">
    <section class="auth-card card fade-in">
      <p class="label">AI Platform</p>
      <h1>登录控制台</h1>
      <p class="subtitle">登录后可进行会话管理、历史追踪与文档问答。</p>

      <form class="auth-form" @submit.prevent="submit">
        <label>
          <span>邮箱</span>
          <input v-model.trim="form.email" required type="email" placeholder="name@example.com" />
        </label>

        <label>
          <span>密码</span>
          <input
            v-model.trim="form.password"
            required
            minlength="6"
            type="password"
            placeholder="请输入密码"
          />
        </label>

        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <button class="btn btn-primary" type="submit" :disabled="loading">
          {{ loading ? "登录中..." : "登录" }}
        </button>
      </form>

      <p class="tips">
        还没有账号？
        <RouterLink to="/register">去注册</RouterLink>
      </p>
    </section>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.auth-card {
  width: min(460px, 100%);
  padding: 32px;
}

.label {
  display: inline-block;
  background: #e8f0ff;
  color: #2455c0;
  border-radius: 999px;
  padding: 4px 10px;
  margin: 0 0 14px;
  font-size: 12px;
  font-weight: 600;
}

h1 {
  margin: 0;
  font-size: 28px;
}

.subtitle {
  color: var(--muted);
  margin: 10px 0 26px;
}

.auth-form {
  display: grid;
  gap: 14px;
}

label {
  display: grid;
  gap: 8px;
  font-size: 14px;
  color: #344154;
}

input {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}

input:focus {
  outline: 2px solid rgba(37, 99, 235, 0.2);
  border-color: #7aa3fa;
}

.error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}

.tips {
  margin: 16px 0 0;
  color: var(--muted);
}
</style>
