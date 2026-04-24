<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import SessionList from '../components/SessionList.vue';
import ChatPanel from '../components/ChatPanel.vue';
import DocsPanel from '../components/DocsPanel.vue';
import { useAuthStore } from '../stores/auth';
import { chatService } from '../services/chat';
import { docsService } from '../services/docs';
import { extractErrorMessage } from '../services/api';
import type { ChatMessage, ChatSession, DocumentItem } from '../types';

const router = useRouter();
const authStore = useAuthStore();

const sessions = ref<ChatSession[]>([]);
const activeSessionId = ref('');
const messages = ref<ChatMessage[]>([]);
const docs = ref<DocumentItem[]>([]);

const loadingSessions = ref(false);
const loadingMessages = ref(false);
const sendingMessage = ref(false);
const loadingDocs = ref(false);
const uploadingDoc = ref(false);
const deletingSessionId = ref('');
const pageError = ref('');

const loadSessions = async () => {
  loadingSessions.value = true;
  try {
    const res = await chatService.getSessions();
    sessions.value = res.data;
  } finally {
    loadingSessions.value = false;
  }
};

const loadMessages = async (sessionId: string) => {
  if (!sessionId) return;
  loadingMessages.value = true;
  try {
    const res = await chatService.getMessages(sessionId);
    messages.value = res.data;
  } finally {
    loadingMessages.value = false;
  }
};

const createSession = async () => {
  loadingSessions.value = true;
  pageError.value = '';
  try {
    const res = await chatService.createSession();
    activeSessionId.value = res.data.id;
    await loadSessions();
    await loadMessages(res.data.id);
  } catch (error) {
    pageError.value = extractErrorMessage(error);
  } finally {
    loadingSessions.value = false;
  }
};

const deleteSession = async (sessionId: string) => {
  const yes = window.confirm('确认删除这个会话吗？会话内消息将一并删除。');
  if (!yes) return;

  deletingSessionId.value = sessionId;
  pageError.value = '';
  try {
    await chatService.deleteSession(sessionId);
    await loadSessions();

    if (activeSessionId.value === sessionId) {
      if (sessions.value.length === 0) {
        activeSessionId.value = '';
        messages.value = [];
        await createSession();
        return;
      }

      activeSessionId.value = sessions.value[0].id;
      await loadMessages(activeSessionId.value);
    }
  } catch (error) {
    pageError.value = extractErrorMessage(error);
  } finally {
    deletingSessionId.value = '';
  }
};

const selectSession = async (sessionId: string) => {
  if (!sessionId || sessionId === activeSessionId.value) return;
  activeSessionId.value = sessionId;
  pageError.value = '';
  try {
    await loadMessages(sessionId);
  } catch (error) {
    pageError.value = extractErrorMessage(error);
  }
};

const sendMessage = async (message: string) => {
  if (!activeSessionId.value || !message.trim()) return;
  sendingMessage.value = true;
  pageError.value = '';
  try {
    await chatService.sendMessage({
      message,
      sessionId: activeSessionId.value,
    });
    await Promise.all([loadMessages(activeSessionId.value), loadSessions()]);
  } catch (error) {
    pageError.value = extractErrorMessage(error);
  } finally {
    sendingMessage.value = false;
  }
};

const loadDocs = async () => {
  loadingDocs.value = true;
  try {
    const res = await docsService.getDocs();
    docs.value = res.data;
  } finally {
    loadingDocs.value = false;
  }
};

const uploadDoc = async (file: File) => {
  uploadingDoc.value = true;
  pageError.value = '';
  try {
    await docsService.upload(file);
    await loadDocs();
  } catch (error) {
    pageError.value = extractErrorMessage(error);
  } finally {
    uploadingDoc.value = false;
  }
};

const deleteDoc = async (id: string) => {
  const yes = window.confirm('确认删除这个文档吗？该操作不可恢复。');
  if (!yes) return;
  pageError.value = '';
  try {
    await docsService.deleteDoc(id);
    await loadDocs();
  } catch (error) {
    pageError.value = extractErrorMessage(error);
  }
};

const logout = async () => {
  authStore.clearAuth();
  await router.replace('/login');
};

const initWorkspace = async () => {
  pageError.value = '';
  try {
    if (!authStore.user) {
      await authStore.fetchProfile();
    }
    await Promise.all([loadSessions(), loadDocs()]);
    if (!sessions.value.length) {
      await createSession();
      return;
    }

    activeSessionId.value = sessions.value[0].id;
    await loadMessages(activeSessionId.value);
  } catch (error) {
    pageError.value = extractErrorMessage(error);
  }
};

onMounted(initWorkspace);
</script>

<template>
  <div class="workspace">
    <header class="topbar card fade-in">
      <div>
        <p class="brand">AI Platform 控制台</p>
        <p class="welcome">欢迎，{{ authStore.user?.email || "用户" }}</p>
      </div>
      <button class="btn btn-secondary" @click="logout">退出登录</button>
    </header>

    <p v-if="pageError" class="global-error">{{ pageError }}</p>

    <main class="content-grid">
      <SessionList
        :sessions="sessions"
        :active-session-id="activeSessionId"
        :loading="loadingSessions"
        :deleting-session-id="deletingSessionId"
        @create-session="createSession"
        @select-session="selectSession"
        @delete-session="deleteSession"
      />

      <ChatPanel
        :messages="messages"
        :sending="sendingMessage || loadingMessages"
        :active-session-id="activeSessionId"
        @send="sendMessage"
      />

      <DocsPanel
        :docs="docs"
        :loading="loadingDocs"
        :uploading="uploadingDoc"
        @refresh="loadDocs"
        @upload="uploadDoc"
        @delete-doc="deleteDoc"
      />
    </main>
  </div>
</template>

<style scoped>
.workspace {
  padding: 18px;
  display: grid;
  gap: 14px;
}

.topbar {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brand {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.welcome {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.global-error {
  margin: 0;
  border: 1px solid #ffd6de;
  background: #ffeff2;
  color: #a52139;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
}

.content-grid {
  display: grid;
  grid-template-columns: 280px minmax(420px, 1fr) 320px;
  gap: 14px;
  align-items: start;
}

@media (max-width: 1280px) {
  .content-grid {
    grid-template-columns: 260px 1fr;
  }

  .content-grid :deep(.docs-panel) {
    grid-column: 1 / -1;
  }
}

@media (max-width: 860px) {
  .workspace {
    padding: 12px;
  }

  .topbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>
