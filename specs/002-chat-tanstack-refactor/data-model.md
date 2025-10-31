# 数据模型：聊天模块

**功能**: 002-chat-tanstack-refactor
**日期**: 2025-10-18
**来源**: 从功能规格和现有数据库模式提取

## 概述

本文档描述聊天模块涉及的核心实体、关系和状态管理。数据模型分为两层：
1. **服务器持久化层**：数据库表结构（已存在，不修改）
2. **客户端缓存层**：TanStack Query 管理的数据结构（本次重构重点）

## 核心实体

### 1. Conversation (会话)

**用途**: 代表一次完整的对话上下文，包含多轮消息交互

**属性**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string (UUID) | ✅ | 唯一标识符 |
| userId | string | ✅ | 所属用户ID（多租户隔离） |
| title | string | ✅ | 会话标题（默认 "New Chat"） |
| starred | boolean | ✅ | 是否收藏/固定 |
| visibility | enum | ✅ | 可见性（private/public/workspace） |
| model | string | ✅ | 使用的AI模型（如 "qwen3-30b-a3b-instruct-2507"） |
| systemPrompt | string? | ❌ | 系统提示词（可选） |
| webSearchEnabled | boolean | ✅ | 是否启用网页搜索 |
| chatConfigId | string? | ❌ | 关联的聊天配置ID（可选） |
| createdAt | DateTime | ✅ | 创建时间 |
| updatedAt | DateTime | ✅ | 最后更新时间 |

**关系**:
- `belongs_to` User (通过 userId)
- `has_many` Message
- `belongs_to` ChatConfig (通过 chatConfigId, 可选)

**状态转换**:
```
[创建] → [active] → [可选：更新 title/starred/visibility] → [删除]
                  ↓
            [发送消息] ← [接收AI响应]
```

**验证规则**:
- `title`: 非空字符串
- `model`: 必须在 VALID_MODELS 列表中
- `visibility`: 必须是 private/public/workspace 之一

### 2. Message (消息)

**用途**: 单条对话内容，可以是用户问题或AI回答

**属性**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string (UUID) | ✅ | 唯一标识符 |
| chatId | string | ✅ | 所属会话ID |
| role | enum | ✅ | 消息角色（user/assistant/system） |
| parts | JSON Array | ✅ | 消息内容部分（AI SDK UIMessage格式） |
| createdAt | DateTime | ✅ | 创建时间 |

**parts 结构** (来自 AI SDK):
```typescript
type MessagePart = {
  type: 'text' | 'tool-call' | 'tool-result' | ...
  text?: string
  toolCallId?: string
  toolName?: string
  result?: any
  // ... 其他AI SDK定义的字段
}
```

**关系**:
- `belongs_to` Conversation (通过 chatId)

**状态转换**:
```
[用户输入] → [创建 user message] → [发送到AI]
                                    ↓
                      [流式生成] → [assistant message] → [持久化]
```

### 3. ChatConfig (聊天配置)

**用途**: 预定义的聊天配置模板，包含AI设置和关联的知识库

**属性**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string (UUID) | ✅ | 唯一标识符 |
| userId | string | ✅ | 所属用户ID |
| name | string | ✅ | 配置名称 |
| description | string? | ❌ | 配置描述（可选） |
| model | string | ✅ | 默认AI模型 |
| systemPrompt | string? | ❌ | 默认系统提示词 |
| webSearchEnabled | boolean | ✅ | 是否启用网页搜索 |
| createdAt | DateTime | ✅ | 创建时间 |
| updatedAt | DateTime | ✅ | 最后更新时间 |

**关系**:
- `belongs_to` User (通过 userId)
- `has_many` Conversation
- `has_many` KnowledgeBase (through ChatConfigKnowledgeBase)

**状态转换**:
```
[创建] → [active] → [可选：更新/关联知识库] → [删除]
                                         ↓
                                 [创建新会话时使用]
```

### 4. ChatConfigKnowledgeBase (配置-知识库关联)

**用途**: 多对多关联表，连接聊天配置和知识库

**属性**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string (UUID) | ✅ | 唯一标识符 |
| chatConfigId | string | ✅ | 聊天配置ID |
| knowledgeBaseId | string | ✅ | 知识库ID |
| createdAt | DateTime | ✅ | 创建时间 |

**关系**:
- `belongs_to` ChatConfig
- `belongs_to` KnowledgeBase

## 客户端数据结构

### TanStack Query 缓存数据类型

#### 1. 会话列表查询数据
```typescript
type ConversationsListData = {
  chats: Array<{
    id: string
    title: string
    starred: boolean
    visibility: 'private' | 'public' | 'workspace'
    model: string
    webSearchEnabled: boolean
    createdAt: string
    updatedAt: string
    chatConfig: {
      id: string
      name: string
    } | null
  }>
}
```

#### 2. 会话详情查询数据
```typescript
type ConversationDetailData = {
  chat: {
    id: string
    userId: string
    title: string
    starred: boolean
    visibility: 'private' | 'public' | 'workspace'
    model: string
    systemPrompt: string | null
    webSearchEnabled: boolean
    chatConfigId: string | null
    createdAt: string
    updatedAt: string
  }
  messages: Array<{
    id: string
    chatId: string
    role: 'user' | 'assistant' | 'system'
    parts: MessagePart[]
    createdAt: string
  }>
}
```

#### 3. 配置列表查询数据
```typescript
type ChatConfigsListData = {
  chatConfigs: Array<{
    id: string
    name: string
    description: string | null
    model: string
    systemPrompt: string | null
    webSearchEnabled: boolean
    createdAt: string
    updatedAt: string
  }>
}
```

#### 4. 配置详情查询数据
```typescript
type ChatConfigDetailData = {
  chatConfig: {
    id: string
    userId: string
    name: string
    description: string | null
    model: string
    systemPrompt: string | null
    webSearchEnabled: boolean
    createdAt: string
    updatedAt: string
  }
  knowledgeBases: Array<{
    id: string
    name: string
    description: string | null
    // ... 其他知识库字段
  }>
}
```

## 数据流

### 1. 会话创建流程

```
用户点击"New Chat"
    ↓
前端：调用 useCreateConversation mutation
    ↓
后端：createChatSession (创建会话记录)
    ↓
前端：TanStack Query 失效会话列表缓存
    ↓
前端：导航到新会话详情页
    ↓
前端：初始化 AI SDK useChat（空消息列表）
```

### 2. 消息发送流程

```
用户输入消息 → 点击发送
    ↓
AI SDK useChat: 添加 user message 到本地状态（乐观更新）
    ↓
发送 POST /api/chat/stream
    ↓
后端：
  1. 保存 user message 到数据库
  2. 如果有 knowledgeBaseIds，调用 findRelevantContent 检索知识
  3. 调用 streamText 生成 AI 响应
  4. 流式返回响应
    ↓
前端：
  1. AI SDK useChat 实时显示流式内容
  2. 流结束后，触发 onFinish 回调
  3. 失效会话详情缓存（更新 updatedAt）
```

### 3. 会话更新流程（乐观更新）

```
用户重命名会话
    ↓
前端：调用 useUpdateConversation mutation
    ↓
TanStack Query onMutate:
  1. 取消进行中的查询
  2. 保存旧数据（用于回滚）
  3. 立即更新列表和详情缓存（乐观更新）
    ↓
UI 立即显示新标题（< 16ms）
    ↓
后端：updateChatSession
    ↓
成功：
  TanStack Query onSettled → 失效缓存 → 获取最新数据
失败：
  TanStack Query onError → 回滚到旧数据 → 显示错误消息
```

### 4. 会话切换流程

```
用户点击侧边栏会话项
    ↓
前端：导航到 /chat/:chatId
    ↓
调用 useConversation(chatId) 查询
    ↓
TanStack Query:
  - 如果有缓存且未陈旧：立即返回（< 50ms）
  - 如果陈旧或无缓存：后台获取数据
    ↓
获取到数据后：
  - 初始化 AI SDK useChat，传入 initialMessages
  - 滚动到聊天历史底部
  - 准备接受新消息输入
```

## 缓存失效策略

### 失效触发点

| 操作 | 失效的查询键 | 说明 |
|------|-------------|------|
| 创建会话 | `conversationKeys.lists()` | 新会话需出现在列表中 |
| 更新会话 | `conversationKeys.detail(id)`, `conversationKeys.lists()` | 同步列表和详情 |
| 删除会话 | `conversationKeys.lists()`, `conversationKeys.detail(id)` | 从列表中移除 |
| 发送消息 | `conversationKeys.detail(chatId)` | 更新最后消息时间 |
| 创建配置 | `chatConfigKeys.lists()` | 新配置需出现在列表中 |
| 更新配置 | `chatConfigKeys.detail(id)`, `chatConfigKeys.lists()` | 同步列表和详情 |
| 设置配置知识库 | `chatConfigKeys.detail(id)` | 更新关联的知识库 |

### 后台同步

- **窗口焦点**: 所有查询在窗口重新获得焦点时自动重新获取（`refetchOnWindowFocus: true`）
- **网络恢复**: 网络重连后自动重新获取（`refetchOnReconnect: true`）
- **定时刷新**: 会话列表每 2 分钟后台刷新，会话详情每 5 分钟后台刷新

## 类型安全

所有类型从 Hono RPC 自动推导：

```typescript
// ✅ 推荐：使用 Hono RPC 类型推导
import type { InferRequestType, InferResponseType } from 'hono/client'
import { honoClient } from '@/lib/hono-client'

type CreateChatRequest = InferRequestType<typeof honoClient.api.chat.create['$post']>['json']
type GetChatsResponse = InferResponseType<typeof honoClient.api.chat.$get>

// ❌ 避免：手动定义类型（会导致类型漂移）
// type CreateChatRequest = { title: string, model: string, ... }
```

## 数据迁移考虑

**本次重构不涉及数据迁移**:
- 数据库模式保持不变
- 后端 API 保持不变
- 只是前端数据管理层的重构（从直接 RPC 调用改为 TanStack Query）

**向后兼容性**:
- 现有会话数据无需修改
- 现有 API 端点继续工作
- 可以逐步迁移 UI 组件，旧的 useChatRPC 和新的 TanStack Query 钩子可以共存
