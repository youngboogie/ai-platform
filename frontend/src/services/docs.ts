import api from './api';
import type { DocumentItem } from '../types';

export const docsService = {
  getDocs() {
    return api.get<DocumentItem[]>('/docs');
  },
  upload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<DocumentItem>('/docs/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  deleteDoc(id: string) {
    return api.delete<{ message: string }>(`/docs/${id}`);
  },
};
