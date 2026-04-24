# AI Platform Frontend (Vue3)

## 1. 技术栈

- Vue 3 + TypeScript
- Vite
- Vue Router
- Pinia
- Axios

## 2. 目录结构

```text
frontend
├─ src
│  ├─ components
│  │  ├─ ChatPanel.vue
│  │  ├─ DocsPanel.vue
│  │  └─ SessionList.vue
│  ├─ router
│  │  └─ index.ts
│  ├─ services
│  │  ├─ api.ts
│  │  ├─ auth.ts
│  │  ├─ chat.ts
│  │  └─ docs.ts
│  ├─ stores
│  │  └─ auth.ts
│  ├─ views
│  │  ├─ LoginView.vue
│  │  ├─ RegisterView.vue
│  │  └─ WorkspaceView.vue
│  ├─ types
│  │  └─ index.ts
│  ├─ App.vue
│  ├─ main.ts
│  └─ style.css
├─ .env.example
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vite.config.ts
```

## 3. 启动方式

### 3.1 启动后端（Nest）

在 `ai-platform` 目录执行：

```bash
npm run start:dev
```

默认后端地址：`http://localhost:3000`

### 3.2 启动前端（Vue）

在 `ai-platform/frontend` 目录执行：

```bash
npm install
npm run dev
```

默认前端地址：`http://localhost:5173`

## 4. 环境变量

复制 `.env.example` 为 `.env`（可选）：

```env
VITE_API_BASE=/api
```

- 开发环境默认通过 Vite 代理转发到 `http://localhost:3000`
- 若你已有网关，也可把 `VITE_API_BASE` 改成完整地址，例如 `http://localhost:3000`

## 5. 业务闭环说明

### 5.1 用户登录闭环

1. 用户注册：`POST /auth/register`
2. 注册成功后自动登录：`POST /auth/login`
3. 前端保存 JWT 到 `localStorage`
4. 获取用户信息：`GET /auth/me`
5. 路由守卫保护 `/workspace`，未登录会跳转 `/login`

### 5.2 对话管理闭环（历史会话）

1. 首次进入工作台读取会话列表：`GET /chat/sessions`
2. 无会话时自动创建：`POST /chat/sessions`
3. 删除会话：`DELETE /chat/sessions/:id`（会连带删除消息）
4. 选择会话加载历史消息：`GET /chat/sessions/:id/messages`
5. 发送消息：`POST /chat/send`
6. 发送后自动刷新会话和消息，形成“发送 -> 入库 -> 回显”的闭环

### 5.3 文档传输闭环

1. 上传文档：`POST /docs/upload`（`multipart/form-data`，字段名 `file`）
2. 刷新文档列表：`GET /docs`
3. 删除文档：`DELETE /docs/:id`
4. 删除后自动刷新列表，确保状态一致

## 6. 与后端接口映射

- 认证：
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /auth/me`
- 会话与消息：
  - `POST /chat/sessions`
  - `DELETE /chat/sessions/:id`
  - `GET /chat/sessions`
  - `GET /chat/sessions/:id/messages`
  - `POST /chat/send`
- 文档：
  - `POST /docs/upload`
  - `GET /docs`
  - `DELETE /docs/:id`

## 7. 前端当前能力

- 登录/注册/登出
- JWT 鉴权与 401 自动清理登录态
- 会话列表管理（创建、切换、历史加载）
- 会话删除（删除当前会话后自动切换到下一会话，若删空则自动新建）
- 对话发送与 AI 回复渲染
- 回复来源文档信息展示（若后端返回 `metadata.sources`）
- 文档上传、文档列表、删除文档
- 移动端与桌面端响应式布局
