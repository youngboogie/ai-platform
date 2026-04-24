<script setup lang="ts">
import type { DocumentItem } from '../types';

const props = defineProps<{
  docs: DocumentItem[];
  loading: boolean;
  uploading: boolean;
}>();

const emit = defineEmits<{
  (e: 'refresh'): void;
  (e: 'upload', file: File): void;
  (e: 'delete-doc', id: string): void;
}>();

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  emit('upload', file);
  input.value = '';
};

const formatTime = (date: string) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
</script>

<template>
  <section class="docs-panel card fade-in">
    <header class="panel-header">
      <h2>文档库</h2>
      <button class="btn btn-secondary" @click="emit('refresh')" :disabled="loading || uploading">
        刷新
      </button>
    </header>

    <label class="upload-box">
      <input
        type="file"
        accept=".pdf,.txt,.md,.csv,.docx"
        :disabled="uploading"
        @change="onFileChange"
      />
      <span>{{ uploading ? "上传处理中..." : "点击上传文档（pdf/txt/md/csv/docx）" }}</span>
    </label>

    <div v-if="loading" class="status">文档加载中...</div>
    <div v-else-if="props.docs.length === 0" class="status">暂无文档，先上传一个文件。</div>

    <ul v-else class="doc-list">
      <li v-for="doc in props.docs" :key="doc.id" class="doc-item">
        <div class="doc-main">
          <p class="name">{{ doc.fileName }}</p>
          <p class="meta">
            {{ formatTime(doc.createdAt) }}
            <template v-if="doc._count"> · chunk 数 {{ doc._count.chunks }}</template>
          </p>
        </div>
        <button class="btn btn-danger" @click="emit('delete-doc', doc.id)">删除</button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.docs-panel {
  padding: 16px;
  min-height: 280px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

h2 {
  margin: 0;
  font-size: 18px;
}

.upload-box {
  display: grid;
  gap: 6px;
  margin-bottom: 14px;
  background: #eef5ff;
  border: 1px dashed #97b6f3;
  border-radius: 12px;
  padding: 12px;
  color: #2d4f97;
  font-size: 13px;
  cursor: pointer;
}

.upload-box input {
  font-size: 13px;
}

.status {
  color: var(--muted);
  font-size: 14px;
}

.doc-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}

.doc-item {
  border: 1px solid #dce5f8;
  border-radius: 12px;
  background: #f9fbff;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.doc-main {
  min-width: 0;
}

.name {
  margin: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
