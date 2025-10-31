# Chat API 契约

**功能**: 002-chat-tanstack-refactor
**日期**: 2025-10-18
**说明**: 本文档描述聊天模块的 API 端点，这些端点已存在于后端，前端将通过 TanStack Query 调用

## 重要说明

**本次重构不修改后端 API**。此文档仅记录现有 API 契约，供前端 TanStack Query 钩子使用。

所有 API 类型通过 Hono RPC 自动推导，**不需要手动定义**。

## 认证

所有端点需要认证。使用 `requireAuth` 中间件，通过 Supabase JWT token 验证用户身份。

```
Authorization: Bearer <supabase_jwt_token>
```

## 端点列表

### 1. 获取会话列表

**端点**: `GET /api/chat`

**用途**: 获取当前用户的所有聊天会话列表

**请求**:
- Headers: Authorization
- Query: 无
- Body: 无

**响应**:
```json
{
  "chats": [
    {
      "id": "uuid",
      "title": "string",
      "starred": true,
      "visibility": "private",
      "model": "qwen3-30b-a3b-instruct-2507",
      "webSearchEnabled": false,
      "createdAt": "2025-01-18T10:00:00Z",
      "updatedAt": "2025-01-18T12:00:00Z",
      "chatConfig": {
        "id": "uuid",
        "name": "string"
      } | null
    }
  ]
}
```

**状态码**:
- 200: 成功
- 401: 未认证
- 500: 服务器错误

**前端使用**:
```typescript
// client/src/hooks/queries/useConversations.ts
queryFn: async () => {
  const res = await honoClient.api.chat.$get()
  if (!res.ok) throw new Error('Failed to fetch chats')
  return res.json() // 类型自动推导
}
```

---

### 2. 获取会话详情

**端点**: `GET /api/chat/:id`

**用途**: 获取单个会话的详情和消息列表

**请求**:
- Headers: Authorization
- Params: `id` (UUID)
- Body: 无

**响应**:
```json
{
  "chat": {
    "id": "uuid",
    "userId": "uuid",
    "title": "string",
    "starred": false,
    "visibility": "private",
    "model": "qwen3-30b-a3b-instruct-2507",
    "systemPrompt": "string" | null,
    "webSearchEnabled": false,
    "chatConfigId": "uuid" | null,
    "createdAt": "2025-01-18T10:00:00Z",
    "updatedAt": "2025-01-18T12:00:00Z"
  },
  "messages": [
    {
      "id": "uuid",
      "chatId": "uuid",
      "role": "user" | "assistant" | "system",
      "parts": [
        {
          "type": "text",
          "text": "Hello, how are you?"
        }
      ],
      "createdAt": "2025-01-18T10:01:00Z"
    }
  ]
}
```

**状态码**:
- 200: 成功
- 401: 未认证
- 404: 会话不存在或无权访问
- 500: 服务器错误

**前端使用**:
```typescript
// client/src/hooks/queries/useConversation.ts
queryFn: async () => {
  const res = await honoClient.api.chat[':id'].$get({ param: { id: chatId } })
  if (!res.ok) throw new Error('Failed to fetch chat detail')
  return res.json()
}
```

---

### 3. 创建会话

**端点**: `POST /api/chat/create`

**用途**: 创建新的聊天会话（可选：同时发送第一条消息）

**请求**:
```json
{
  "id": "uuid",
  "message": {
    "id": "uuid",
    "role": "user",
    "parts": [{ "type": "text", "text": "Hello" }]
  },
  "model": "qwen3-30b-a3b-instruct-2507",
  "systemPrompt": "string" | undefined,
  "webSearch": false | undefined,
  "knowledgeBaseIds": ["uuid"] | undefined,
  "chatConfigId": "uuid" | undefined
}
```

**响应**:
```json
{
  "chat": {
    "id": "uuid",
    "userId": "uuid",
    "title": "New Chat",
    "starred": false,
    "visibility": "private",
    "model": "qwen3-30b-a3b-instruct-2507",
    "systemPrompt": null,
    "webSearchEnabled": false,
    "chatConfigId": null,
    "createdAt": "2025-01-18T10:00:00Z",
    "updatedAt": "2025-01-18T10:00:00Z"
  }
}
```

**状态码**:
- 201: 创建成功
- 400: 请求参数无效
- 401: 未认证
- 500: 服务器错误

**前端使用**:
```typescript
// client/src/hooks/mutations/useCreateConversation.ts
mutationFn: async (payload) => {
  const res = await honoClient.api.chat.create.$post({ json: payload })
  if (!res.ok) throw new Error('Failed to create chat')
  return res.json()
}
```

---

### 4. 更新会话

**端点**: `PUT /api/chat/:id`

**用途**: 更新会话元数据（标题、收藏状态、可见性等）

**请求**:
```json
{
  "title": "string" | undefined,
  "starred": true | undefined,
  "visibility": "private" | "public" | "workspace" | undefined
}
```

**响应**:
```json
{
  "chat": {
    "id": "uuid",
    "userId": "uuid",
    "title": "Updated Title",
    "starred": true,
    "visibility": "private",
    "model": "qwen3-30b-a3b-instruct-2507",
    "systemPrompt": null,
    "webSearchEnabled": false,
    "chatConfigId": null,
    "createdAt": "2025-01-18T10:00:00Z",
    "updatedAt": "2025-01-18T12:30:00Z"
  }
}
```

**状态码**:
- 200: 更新成功
- 400: 请求参数无效
- 401: 未认证
- 404: 会话不存在或无权访问
- 500: 服务器错误

**前端使用**:
```typescript
// client/src/hooks/mutations/useUpdateConversation.ts
mutationFn: async ({ id, data }) => {
  const res = await honoClient.api.chat[':id'].$put({
    param: { id },
    json: data,
  })
  if (!res.ok) throw new Error('Failed to update chat')
  return res.json()
}
```

---

### 5. 删除会话

**端点**: `DELETE /api/chat/:id`

**用途**: 删除会话（级联删除所有消息）

**请求**:
- Headers: Authorization
- Params: `id` (UUID)
- Body: 无

**响应**:
```json
{
  "message": "Chat deleted successfully"
}
```

**状态码**:
- 200: 删除成功
- 401: 未认证
- 404: 会话不存在或无权访问
- 500: 服务器错误

**前端使用**:
```typescript
// client/src/hooks/mutations/useDeleteConversation.ts
mutationFn: async (chatId) => {
  const res = await honoClient.api.chat[':id'].$delete({ param: { id: chatId } })
  if (!res.ok) throw new Error('Failed to delete chat')
  return res.json()
}
```

---

### 6. 流式聊天（AI 响应）

**端点**: `POST /api/chat/stream`

**用途**: 发送消息并接收 AI 流式响应

**说明**: 此端点由 AI SDK 的 `useChat` 钩子自动调用，不需要手动使用 TanStack Query

**请求**:
```json
{
  "id": "uuid",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "parts": [{ "type": "text", "text": "Hello" }]
    }
  ],
  "model": "qwen3-30b-a3b-instruct-2507",
  "systemPrompt": "string" | undefined,
  "webSearch": false | undefined,
  "knowledgeBaseIds": ["uuid"] | undefined
}
```

**响应**: Server-Sent Events (SSE) stream

**前端使用**:
```typescript
// AI SDK useChat 自动处理，不需要 TanStack Query
const chatProps = useChat({
  api: '/api/chat/stream',
  id: chatId,
  initialMessages: [...],
  body: {
    model,
    systemPrompt,
    webSearch,
    knowledgeBaseIds,
  },
})
```

---

## 聊天配置端点

### 7. 获取配置列表

**端点**: `GET /api/chat-configs`

**用途**: 获取当前用户的所有聊天配置

**请求**:
- Headers: Authorization
- Query: 无
- Body: 无

**响应**:
```json
{
  "chatConfigs": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string" | null,
      "model": "qwen3-30b-a3b-instruct-2507",
      "systemPrompt": "string" | null,
      "webSearchEnabled": false,
      "createdAt": "2025-01-18T10:00:00Z",
      "updatedAt": "2025-01-18T12:00:00Z"
    }
  ]
}
```

**状态码**:
- 200: 成功
- 401: 未认证
- 500: 服务器错误

---

### 8. 获取配置详情

**端点**: `GET /api/chat-configs/:id`

**用途**: 获取配置详情和关联的知识库

**请求**:
- Headers: Authorization
- Params: `id` (UUID)
- Body: 无

**响应**:
```json
{
  "chatConfig": {
    "id": "uuid",
    "userId": "uuid",
    "name": "string",
    "description": "string" | null,
    "model": "qwen3-30b-a3b-instruct-2507",
    "systemPrompt": "string" | null,
    "webSearchEnabled": false,
    "createdAt": "2025-01-18T10:00:00Z",
    "updatedAt": "2025-01-18T12:00:00Z"
  },
  "knowledgeBases": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string" | null
    }
  ]
}
```

**状态码**:
- 200: 成功
- 401: 未认证
- 404: 配置不存在或无权访问
- 500: 服务器错误

---

### 9. 创建配置

**端点**: `POST /api/chat-configs`

**请求**:
```json
{
  "name": "string",
  "description": "string" | undefined,
  "model": "qwen3-30b-a3b-instruct-2507",
  "systemPrompt": "string" | undefined,
  "webSearchEnabled": false
}
```

**响应**:
```json
{
  "chatConfig": {
    "id": "uuid",
    "userId": "uuid",
    "name": "string",
    "description": null,
    "model": "qwen3-30b-a3b-instruct-2507",
    "systemPrompt": null,
    "webSearchEnabled": false,
    "createdAt": "2025-01-18T10:00:00Z",
    "updatedAt": "2025-01-18T10:00:00Z"
  }
}
```

---

### 10. 更新配置

**端点**: `PUT /api/chat-configs/:id`

**请求**:
```json
{
  "name": "string" | undefined,
  "description": "string" | undefined,
  "model": "string" | undefined,
  "systemPrompt": "string" | undefined,
  "webSearchEnabled": boolean | undefined
}
```

**响应**:
```json
{
  "chatConfig": {
    "id": "uuid",
    "userId": "uuid",
    "name": "Updated Name",
    "description": "Updated Description",
    "model": "qwen3-30b-a3b-instruct-2507",
    "systemPrompt": "You are a helpful assistant",
    "webSearchEnabled": true,
    "createdAt": "2025-01-18T10:00:00Z",
    "updatedAt": "2025-01-18T12:30:00Z"
  }
}
```

---

### 11. 删除配置

**端点**: `DELETE /api/chat-configs/:id`

**响应**:
```json
{
  "message": "Chat config deleted successfully"
}
```

---

### 12. 设置配置关联的知识库

**端点**: `PUT /api/chat-configs/:id/knowledge-bases`

**请求**:
```json
{
  "knowledgeBaseIds": ["uuid1", "uuid2"]
}
```

**响应**:
```json
{
  "message": "Knowledge bases updated successfully",
  "knowledgeBaseIds": ["uuid1", "uuid2"]
}
```

---

## 类型安全使用示例

```typescript
// ✅ 推荐：使用 Hono RPC 类型推导
import { honoClient } from '@/lib/hono-client'
import type { InferRequestType, InferResponseType } from 'hono/client'

// 自动推导请求类型
type CreateChatRequest = InferRequestType<
  typeof honoClient.api.chat.create['$post']
>['json']

// 自动推导响应类型
type GetChatsResponse = InferResponseType<
  typeof honoClient.api.chat.$get
>

// 在 mutation 中使用
const createMutation = useMutation({
  mutationFn: async (payload: CreateChatRequest) => {
    const res = await honoClient.api.chat.create.$post({ json: payload })
    if (!res.ok) throw new Error('Failed to create chat')
    return res.json() // 返回类型自动推导
  },
})
```

## 错误处理

所有端点遵循统一的错误格式：

```json
{
  "error": "Error message description"
}
```

前端应该：
1. 捕获错误并显示用户友好的消息
2. 使用 TanStack Query 的重试机制（失败自动重试 3 次）
3. 对于乐观更新，失败时自动回滚

```typescript
// 示例：错误处理
const mutation = useMutation({
  mutationFn: ...,
  onError: (error) => {
    // 显示错误提示
    toast.error(error.message)
    // 自动回滚已在 TanStack Query 的 onMutate 中处理
  },
})
```

## 缓存失效规则

参考 [data-model.md](../data-model.md) 的"缓存失效策略"部分。

## 版本控制

当前 API 版本：v1 (无版本前缀)

未来版本升级时，将使用 `/api/v2/chat` 等前缀。
