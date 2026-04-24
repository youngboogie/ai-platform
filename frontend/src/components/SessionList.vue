<script setup lang="ts">
import type { ChatSession } from '../types';

const props = defineProps<{
  sessions: ChatSession[];
  activeSessionId: string;
  loading: boolean;
  deletingSessionId: string;
}>();

const emit = defineEmits<{
  (e: 'create-session'): void;
  (e: 'select-session', id: string): void;
  (e: 'delete-session', id: string): void;
}>();

const formatTime = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

const onDelete = (event: MouseEvent, id: string) => {
  event.stopPropagation();
  emit('delete-session', id);
};
</script>

<template>
  <section class="session-panel card fade-in">
    <header class="panel-header">
      <h2>历史会话</h2>
      <button class="btn btn-secondary" @click="emit('create-session')" :disabled="loading">
        新建会话
      </button>
    </header>

    <div v-if="loading" class="status">会话加载中...</div>
    <div v-else-if="props.sessions.length === 0" class="status">暂无会话，先新建一个。</div>
    <ul v-else class="session-list">
      <li
        v-for="item in props.sessions"
        :key="item.id"
        :class="['session-item', { active: item.id === props.activeSessionId }]"
        @click="emit('select-session', item.id)"
      >
        <div class="session-main">
          <p class="title">{{ item.title || "New Chat" }}</p>
          <p class="time">{{ formatTime(item.updatedAt) }}</p>
        </div>
        <button
          class="delete-btn"
          :disabled="props.deletingSessionId === item.id"
          @click="onDelete($event, item.id)"
        >
          {{ props.deletingSessionId === item.id ? "删除中" : "删除" }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.session-panel {
  padding: 16px;
  min-height: 280px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.status {
  color: var(--muted);
  font-size: 14px;
}

.session-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.session-item {
  border: 1px solid #dce5f8;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
  background: #f9fbff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.session-main {
  min-width: 0;
}

.session-item:hover {
  background: #edf4ff;
  transform: translateY(-1px);
}

.session-item.active {
  border-color: #4b80f0;
  background: #eaf2ff;
}

.title {
  margin: 0;
  font-weight: 600;
}

.time {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.delete-btn {
  border: none;
  background: #ffe7eb;
  color: #b3263f;
  border-radius: 8px;
  padding: 6px 9px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.delete-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
</style>
