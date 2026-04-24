import api from './api';
import type { ChatMessage, ChatSendResponse, ChatSession } from '../types';

export const chatService = {
  createSession() {
    return api.post<ChatSession>('/chat/sessions');
  },
  deleteSession(sessionId: string) {
    return api.delete<{ message: string }>(`/chat/sessions/${sessionId}`);
  },
  getSessions() {
    return api.get<ChatSession[]>('/chat/sessions');
  },
  getMessages(sessionId: string) {
    return api.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);
  },
  sendMessage(payload: { message: string; sessionId: string }) {
    return api.post<ChatSendResponse>('/chat/send', payload);
  },
};
