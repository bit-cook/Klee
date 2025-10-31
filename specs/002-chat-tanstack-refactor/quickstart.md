# 快速开始指南：聊天模块 TanStack Query 集成

**功能**: 002-chat-tanstack-refactor
**日期**: 2025-10-18
**目标读者**: 实施此功能的开发者

## 概述

本指南将帮助您快速上手聊天模块的 TanStack Query 集成。按照以下步骤，您将能够：
1. 理解新的数据层架构
2. 创建查询和变更钩子
3. 在组件中使用新钩子
4. 处理流式消息和缓存失效

## 前置条件

- 已阅读 [research.md](./research.md) 了解技术决策
- 已阅读 [data-model.md](./data-model.md) 了解数据结构
- 熟悉 TanStack Query v4 基本概念
- 熟悉 AI SDK (@ai-sdk/react) 基本用法

## 架构速览

```
┌─────────────────────────────────────────────────────┐
│                   UI Components                     │
│  (chat-list.tsx, chat.$chatId.tsx, etc.)          │
└────────────┬────────────────────────┬───────────────┘
             │                        │
             ├─ 会话管理              ├─ 消息流
             ↓                        ↓
┌────────────────────┐   ┌────────────────────────────┐
│  TanStack Query    │   │  AI SDK useChat            │
│  Hooks             │   │  Hook                      │
│  ├─ useConversations│   │  ├─ messages              │
│  ├─ useConversation │   │  ├─ input                 │
│  ├─ useUpdateConv.  │   │  ├─ handleSubmit          │
│  └─ useDeleteConv.  │   │  └─ isLoading             │
└────────┬───────────┘   └────────────┬───────────────┘
         │                            │
         ├─ 缓存 + 乐观更新           ├─ 实时流
         ↓                            ↓
┌─────────────────────────────────────────────────────┐
│            Hono RPC Client (hono-client.ts)         │
│            (端到端类型安全)                         │
└────────────────────────┬────────────────────────────┘
                         │
                         ↓
┌─────────────────────────────────────────────────────┐
│              Backend API (Hono Server)              │
│  GET /api/chat, POST /api/chat/create, etc.        │
│  POST /api/chat/stream (SSE for AI responses)      │
└─────────────────────────────────────────────────────┘
```

## 步骤 1: 扩展查询键工厂

**文件**: `client/src/lib/queryKeys.ts`

在现有文件中添加聊天相关的查询键：

```typescript
// 现有的 knowledgeBaseKeys...

// 新增：会话查询键
export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  details: () => [...conversationKeys.all, 'detail'] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
}

// 新增：聊天配置查询键
export const chatConfigKeys = {
  all: ['chatConfigs'] as const,
  lists: () => [...chatConfigKeys.all, 'list'] as const,
  details: () => [...chatConfigKeys.all, 'detail'] as const,
  detail: (id: string) => [...chatConfigKeys.details(), id] as const,
}
```

## 步骤 2: 创建查询钩子

### 2.1 会话列表查询

**文件**: `client/src/hooks/queries/useConversations.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'

/**
 * 获取当前用户的所有聊天会话列表
 */
export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: async () => {
      const res = await honoClient.api.chat.$get()
      if (!res.ok) throw new Error('Failed to fetch chats')
      return res.json()
    },
    staleTime: 2 * 60 * 1000, // 2 分钟
  })
}
```

### 2.2 会话详情查询

**文件**: `client/src/hooks/queries/useConversation.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'

/**
 * 获取单个会话的详情和消息历史
 */
export function useConversation(chatId: string) {
  return useQuery({
    queryKey: conversationKeys.detail(chatId),
    queryFn: async () => {
      const res = await honoClient.api.chat[':id'].$get({ param: { id: chatId } })
      if (!res.ok) throw new Error('Failed to fetch chat detail')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 分钟
    enabled: !!chatId, // 仅在 chatId 存在时查询
  })
}
```

## 步骤 3: 创建变更钩子

### 3.1 创建会话

**文件**: `client/src/hooks/mutations/useCreateConversation.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'
import type { InferRequestType } from 'hono/client'

export function useCreateConversation() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (
      payload: InferRequestType<typeof honoClient.api.chat.create['$post']>['json']
    ) => {
      const res = await honoClient.api.chat.create.$post({ json: payload })
      if (!res.ok) throw new Error('Failed to create chat session')
      return res.json()
    },
    onSuccess: (data) => {
      // 失效会话列表缓存
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
      // 导航到新会话
      router.navigate({ to: `/chat/${data.chat.id}` })
    },
  })
}
```

### 3.2 更新会话（带乐观更新）

**文件**: `client/src/hooks/mutations/useUpdateConversation.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'
import type { InferRequestType } from 'hono/client'

export function useUpdateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: InferRequestType<typeof honoClient.api.chat[':id']['$put']>['json']
    }) => {
      const res = await honoClient.api.chat[':id'].$put({
        param: { id },
        json: data,
      })
      if (!res.ok) throw new Error('Failed to update chat')
      return res.json()
    },

    // 乐观更新：立即更新 UI
    onMutate: async ({ id, data }) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: conversationKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: conversationKeys.lists() })

      // 保存旧数据（用于回滚）
      const previousDetail = queryClient.getQueryData(conversationKeys.detail(id))
      const previousList = queryClient.getQueryData(conversationKeys.lists())

      // 乐观更新详情
      queryClient.setQueryData(conversationKeys.detail(id), (old: any) => ({
        ...old,
        chat: { ...old.chat, ...data },
      }))

      // 乐观更新列表
      queryClient.setQueryData(conversationKeys.lists(), (old: any) => ({
        ...old,
        chats: old.chats.map((chat: any) =>
          chat.id === id ? { ...chat, ...data } : chat
        ),
      }))

      return { previousDetail, previousList }
    },

    // 失败时回滚
    onError: (err, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(
          conversationKeys.detail(variables.id),
          context.previousDetail
        )
      }
      if (context?.previousList) {
        queryClient.setQueryData(
          conversationKeys.lists(),
          context.previousList
        )
      }
    },

    // 成功后失效缓存
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
    },
  })
}
```

### 3.3 删除会话

**文件**: `client/src/hooks/mutations/useDeleteConversation.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { honoClient } from '@/lib/hono-client'
import { conversationKeys } from '@/lib/queryKeys'

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (chatId: string) => {
      const res = await honoClient.api.chat[':id'].$delete({ param: { id: chatId } })
      if (!res.ok) throw new Error('Failed to delete chat')
      return res.json()
    },
    onSuccess: (data, chatId) => {
      // 失效会话列表
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
      // 移除详情缓存
      queryClient.removeQueries({ queryKey: conversationKeys.detail(chatId) })
      // 导航回会话列表
      router.navigate({ to: '/chat' })
    },
  })
}
```

## 步骤 4: 在组件中使用

### 4.1 会话列表页

**文件**: `client/src/routes/_authenticated/chat.index.tsx`

```typescript
import { useConversations } from '@/hooks/queries/useConversations'
import { useCreateConversation } from '@/hooks/mutations/useCreateConversation'
import { useUpdateConversation } from '@/hooks/mutations/useUpdateConversation'
import { generateUUID } from '@/lib/utils'

export default function ChatIndex() {
  // 查询会话列表
  const { data, isLoading, error } = useConversations()

  // 创建会话变更
  const createMutation = useCreateConversation()

  // 更新会话变更（用于收藏）
  const updateMutation = useUpdateConversation()

  const handleCreateChat = () => {
    createMutation.mutate({
      id: generateUUID(),
      message: {
        id: generateUUID(),
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      },
      model: 'qwen3-30b-a3b-instruct-2507',
    })
  }

  const handleToggleStar = (chatId: string, starred: boolean) => {
    // 乐观更新：UI 立即响应
    updateMutation.mutate({ id: chatId, data: { starred: !starred } })
  }

  if (isLoading) return <div>Loading chats...</div>
  if (error) return <div>Error: {error.message}</div>
  if (!data) return null

  return (
    <div>
      <button onClick={handleCreateChat}>New Chat</button>
      <ul>
        {data.chats.map((chat) => (
          <li key={chat.id}>
            <Link to={`/chat/${chat.id}`}>{chat.title}</Link>
            <button onClick={() => handleToggleStar(chat.id, chat.starred)}>
              {chat.starred ? '★' : '☆'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### 4.2 会话详情页（整合 AI SDK）

**文件**: `client/src/routes/_authenticated/chat.$chatId.tsx`

```typescript
import { useParams } from '@tanstack/react-router'
import { useChat } from '@ai-sdk/react'
import { useQueryClient } from '@tanstack/react-query'
import { useConversation } from '@/hooks/queries/useConversation'
import { conversationKeys } from '@/lib/queryKeys'

export default function ChatDetail() {
  const { chatId } = useParams({ from: '/chat/$chatId' })
  const queryClient = useQueryClient()

  // 1. 获取会话详情（含历史消息）
  const { data, isLoading } = useConversation(chatId)

  // 2. 使用 AI SDK 管理消息流
  const chatProps = useChat({
    api: '/api/chat/stream',
    id: chatId,
    initialMessages: data?.messages ?? [],
    onFinish: () => {
      // 消息流结束后，失效会话缓存（更新最后消息时间）
      queryClient.invalidateQueries({
        queryKey: conversationKeys.detail(chatId),
      })
    },
  })

  if (isLoading) return <div>Loading chat...</div>
  if (!data) return null

  return (
    <div>
      <h1>{data.chat.title}</h1>
      <div className="messages">
        {chatProps.messages.map((message) => (
          <div key={message.id} className={message.role}>
            {message.parts.map((part, idx) =>
              part.type === 'text' ? (
                <p key={idx}>{part.text}</p>
              ) : null
            )}
          </div>
        ))}
      </div>
      <form onSubmit={chatProps.handleSubmit}>
        <input
          value={chatProps.input}
          onChange={chatProps.handleInputChange}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={chatProps.isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
```

## 步骤 5: 配置缓存策略

**确认配置**（文件已存在）：`client/src/lib/query-client.ts`

```typescript
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 分钟
      cacheTime: 10 * 60 * 1000,       // 10 分钟
      retry: 3,                        // 失败重试 3 次
      refetchOnWindowFocus: true,      // 窗口焦点时重新获取
      refetchOnReconnect: true,        // 网络重连时重新获取
    },
  },
})
```

## 常见模式

### 模式 1: 条件查询

仅在条件满足时启用查询：

```typescript
const { data } = useConversation(chatId, {
  enabled: !!chatId && isOpen, // 仅在 chatId 存在且模态框打开时查询
})
```

### 模式 2: 依赖查询

一个查询依赖另一个查询的结果：

```typescript
const { data: chat } = useConversation(chatId)
const { data: config } = useChatConfig(chat?.chatConfigId ?? '', {
  enabled: !!chat?.chatConfigId, // 仅在会话有配置ID时查询配置
})
```

### 模式 3: 手动失效缓存

在某些操作后手动触发数据刷新：

```typescript
const queryClient = useQueryClient()

// 失效所有会话相关查询
queryClient.invalidateQueries({ queryKey: conversationKeys.all })

// 失效特定会话
queryClient.invalidateQueries({ queryKey: conversationKeys.detail(chatId) })

// 立即重新获取
queryClient.refetchQueries({ queryKey: conversationKeys.lists() })
```

### 模式 4: 预取数据

在用户可能需要之前预取数据：

```typescript
const queryClient = useQueryClient()

// 鼠标悬停时预取会话详情
const handleMouseEnter = (chatId: string) => {
  queryClient.prefetchQuery({
    queryKey: conversationKeys.detail(chatId),
    queryFn: async () => {
      const res = await honoClient.api.chat[':id'].$get({ param: { id: chatId } })
      if (!res.ok) throw new Error('Failed to fetch chat detail')
      return res.json()
    },
  })
}
```

## 调试技巧

### 1. 使用 React Query DevTools

DevTools 已在 `client/src/App.tsx` 中启用：

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

<ReactQueryDevtools initialIsOpen={false} />
```

打开应用后，点击浮动图标查看：
- 所有查询的状态（loading/success/error）
- 缓存数据内容
- 查询键层级结构
- 手动触发重新获取或失效

### 2. 查看网络请求

打开浏览器开发者工具 → Network 标签：
- 查看 API 调用顺序
- 检查请求/响应数据
- 验证缓存是否生效（无重复请求）

### 3. 日志调试

在钩子中添加日志：

```typescript
export function useConversations() {
  const query = useQuery({
    queryKey: conversationKeys.lists(),
    queryFn: async () => {
      console.log('[useConversations] Fetching chats...')
      const res = await honoClient.api.chat.$get()
      console.log('[useConversations] Response:', res.status)
      if (!res.ok) throw new Error('Failed to fetch chats')
      const data = await res.json()
      console.log('[useConversations] Data:', data)
      return data
    },
    staleTime: 2 * 60 * 1000,
  })

  console.log('[useConversations] State:', query.status, query.fetchStatus)
  return query
}
```

## 下一步

1. **实施所有钩子**：参考本指南创建所有查询和变更钩子
2. **更新组件**：将现有组件从 `useChatRPC` 迁移到新钩子
3. **测试功能**：验证所有用户场景（参考 spec.md）
4. **性能优化**：使用 DevTools 检查缓存效率，调整 staleTime 配置
5. **错误处理**：为所有变更添加友好的错误提示（使用 toast）

## 参考资料

- [research.md](./research.md) - 技术决策和替代方案
- [data-model.md](./data-model.md) - 数据结构和关系
- [contracts/chat-api.md](./contracts/chat-api.md) - API 端点规范
- [TanStack Query Docs](https://tanstack.com/query/v4/docs/react/overview)
- [AI SDK React Docs](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot)
