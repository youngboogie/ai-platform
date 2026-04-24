<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ChatMessage } from '../types';

const props = defineProps<{
  messages: ChatMessage[];
  sending: boolean;
  activeSessionId: string;
}>();

const emit = defineEmits<{
  (e: 'send', message: string): void;
}>();

const draft = ref('');

const canSend = computed(
  () => Boolean(props.activeSessionId) && Boolean(draft.value.trim()) && !props.sending,
);

const handleSend = () => {
  if (!canSend.value) return;
  emit('send', draft.value.trim());
  draft.value = '';
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
};

const formatTime = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
</script>

<template>
  <section class="chat-panel card fade-in">
    <header class="panel-header">
      <h2>对话区</h2>
      <p class="subtitle" v-if="activeSessionId">会话 ID：{{ activeSessionId }}</p>
      <p class="subtitle" v-else>请先创建会话</p>
    </header>

    <div class="messages">
      <div v-if="!messages.length" class="empty-tip">发送第一条消息开始对话。</div>
      <article
        v-for="msg in messages"
        :key="msg.id"
        :class="['message', msg.role === 'user' ? 'user' : 'assistant']"
      >
        <p class="meta">
          <span>{{ msg.role === "user" ? "你" : "AI 助手" }}</span>
          <time>{{ formatTime(msg.createdAt) }}</time>
        </p>
        <p class="content">{{ msg.content }}</p>

        <ul v-if="msg.metadata?.sources?.length" class="sources">
          <li v-for="(source, index) in msg.metadata.sources" :key="`${msg.id}-src-${index}`">
            {{ source.fileName || "未知文档" }}
            <template v-if="source.searchType"> · {{ source.searchType }}</template>
            <template v-if="typeof source.similarity === 'number'">
              · 相似度 {{ source.similarity.toFixed(3) }}
            </template>
          </li>
        </ul>
      </article>
    </div>

    <footer class="composer">
      <textarea
        v-model="draft"
        :disabled="sending || !activeSessionId"
        rows="3"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        @keydown="handleKeydown"
      />
      <button class="btn btn-primary" :disabled="!canSend" @click="handleSend">
        {{ sending ? "发送中..." : "发送" }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.chat-panel {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 620px;
  padding: 16px;
}

.panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

.messages {
  overflow: auto;
  display: grid;
  align-content: start;
  gap: 12px;
  padding-right: 4px;
}

.empty-tip {
  color: var(--muted);
  font-size: 14px;
}

.message {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #deebff;
}

.message.user {
  background: #eaf2ff;
  justify-self: end;
  width: min(88%, 680px);
}

.message.assistant {
  background: #fff9f1;
  border-color: #ffe3bf;
  width: min(92%, 760px);
}

.meta {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  display: flex;
  justify-content: space-between;
}

.content {
  margin: 8px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.sources {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #4d5f7f;
}

.sources li {
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.75);
}

.composer {
  margin-top: 12px;
  display: grid;
  gap: 10px;
}

textarea {
  resize: vertical;
  min-height: 84px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

textarea:focus {
  outline: 2px solid rgba(37, 99, 235, 0.2);
}
</style>
