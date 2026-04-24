import api from './api';
import type { AuthMeResponse, LoginResponse, RegisterResponse } from '../types';

export const authService = {
  register(email: string, password: string) {
    return api.post<RegisterResponse>('/auth/register', { email, password });
  },
  login(email: string, password: string) {
    return api.post<LoginResponse>('/auth/login', { email, password });
  },
  me() {
    return api.get<AuthMeResponse>('/auth/me');
  },
};
