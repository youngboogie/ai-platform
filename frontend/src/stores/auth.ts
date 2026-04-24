import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { UserProfile } from '../types';
import { TOKEN_STORAGE_KEY } from '../constants';
import { authService } from '../services/auth';

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem(TOKEN_STORAGE_KEY) || '');
  const user = ref<UserProfile | null>(null);
  const loadingProfile = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value));

  const setToken = (nextToken: string) => {
    token.value = nextToken;
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
  };

  const clearAuth = () => {
    token.value = '';
    user.value = null;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  };

  const fetchProfile = async () => {
    if (!token.value) {
      user.value = null;
      return null;
    }

    loadingProfile.value = true;
    try {
      const res = await authService.me();
      user.value = res.data.user;
      return user.value;
    } finally {
      loadingProfile.value = false;
    }
  };

  return {
    token,
    user,
    loadingProfile,
    isAuthenticated,
    setToken,
    clearAuth,
    fetchProfile,
  };
});
