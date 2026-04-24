import axios, { AxiosError } from 'axios';
import { TOKEN_STORAGE_KEY } from '../constants';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      if (!['/login', '/register'].includes(window.location.pathname)) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export const extractErrorMessage = (error: unknown): string => {
  if (!(error instanceof AxiosError)) {
    return '请求失败，请稍后重试';
  }

  const data = error.response?.data as
    | { message?: string | string[]; error?: string }
    | undefined;

  if (Array.isArray(data?.message)) {
    return data.message.join('; ');
  }

  if (typeof data?.message === 'string') {
    return data.message;
  }

  if (typeof data?.error === 'string') {
    return data.error;
  }

  if (typeof error.message === 'string') {
    return error.message;
  }

  return '请求失败，请稍后重试';
};

export default api;
