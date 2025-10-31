# 研究文档：聊天模块 TanStack Query 集成

**功能**: 002-chat-tanstack-refactor
**日期**: 2025-10-18
**目的**: 解决技术上下文中的未知项，为设计阶段提供决策依据

## 研究主题

### 1. TanStack Query 与 AI SDK `useChat` 钩子的集成模式

**研究问题**: 如何将 AI SDK 的流式聊天能力与 TanStack Query 的缓存管理整合？

**决策**: 分层架构 - 数据管理和流式聊天分离

**理由**:
- **AI SDK `useChat` 钩子**专注于实时流式响应，内置消息状态管理、错误处理、加载状态等。这些能力在聊天场景中非常关键，不应被替换。
- **TanStack Query** 专注于服务器状态缓存、后台同步、乐观更新。适合管理会话列表、会话元数据、配置等持久化数据。
- **分层策略**:
  1. **会话管理层**（TanStack Query）: 管理会话列表、会话元数据（title, starred, visibility）、配置列表
  2. **消息流层**（AI SDK `useChat`）: 管理实时消息流、流式响应、消息发送
  3. **集成点**:
     - 消息发送成功后，触发 TanStack Query 缓存失效（如更新会话的最后消息时间）
     - 会话切换时，从 TanStack Query 获取会话详情，然后用历史消息初始化 `useChat`
     - 新建会话时，先通过 TanStack Mutation 创建会话，然后切换到新会话

**替代方案考虑**:
1. **完全用 TanStack Query 替换 `useChat`**:
   - ❌ 拒绝：会失去 AI SDK 的流式能力、自动重试、工具调用等高级功能
   - ❌ 需要重新实现大量已有的消息处理逻辑

2. **完全不用 TanStack Query，扩展 `useChat` 的缓存能力**:
   - ❌ 拒绝：`useChat` 不是为缓存管理设计的，会话列表、配置管理等场景会很别扭
   - ❌ 会话切换时的数据持久化需要手动实现

**实施细节**:
```typescript
// 1. 会话列表查询（TanStack Query）
function useConversations() {
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

// 2. 消息流钩子（AI SDK useChat + TanStack Query 集成）
function useChatMessages(chatId: string) {
  const queryClient = useQueryClient()

  // 使用 AI SDK 的 useChat 处理流式消息
  const chatProps = useChat({
    id: chatId,
    api: '/api/chat/stream',
    onFinish: () => {
      // 消息流结束后，失效会话缓存（更新最后消息时间等）
      queryClient.invalidateQueries({
        queryKey: conversationKeys.detail(chatId)
      })
    },
  })

  return chatProps
}

// 3. 会话创建变更（TanStack Mutation）
function useCreateConversation() {
  const queryClient = useQueryClient()
  const router = useRouter()

  return useMutation({
    mutationFn: async (payload) => {
      const res = await honoClient.api.chat.create.$post({ json: payload })
      if (!res.ok) throw new Error('Failed to create chat')
      return res.json()
    },
    onSuccess: (data) => {
      // 失效会话列表
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
      // 导航到新会话
      router.navigate({ to: `/chat/${data.chat.id}` })
    },
  })
}
```

### 2. 流式消息的缓存策略

**研究问题**: 如何缓存历史消息？是否需要将消息列表也用 TanStack Query 管理？

**决策**: 历史消息由后端持久化，前端按需获取，不单独缓存

**理由**:
- 后端已有 `getChatMessages` 查询，返回会话的所有历史消息
- 历史消息在会话详情查询时一次性获取（参考现有 API 设计）
- AI SDK `useChat` 的 `initialMessages` 参数可以用历史消息初始化
- 新消息通过 `useChat` 的实时流处理，流结束后自动持久化到后端（参考现有 `saveMess ages` 逻辑）

**替代方案考虑**:
1. **为每条消息创建单独的 TanStack Query 缓存**:
   - ❌ 拒绝：过度工程化，消息数量可能很大（100+ 轮对话）
   - ❌ 缓存失效逻辑复杂，性能开销大

2. **使用 TanStack Query 的 infinite query 分页获取消息**:
   - ❌ 拒绝：当前设计不支持分页（后端一次性返回所有消息）
   - ❌ 聊天场景通常需要完整上下文，分页加载体验不佳

**实施细节**:
```typescript
// 会话详情查询（含历史消息）
function useConversation(chatId: string) {
  return useQuery({
    queryKey: conversationKeys.detail(chatId),
    queryFn: async () => {
      const res = await honoClient.api.chat[':id'].$get({ param: { id: chatId } })
      if (!res.ok) throw new Error('Failed to fetch chat detail')
      return res.json() // 返回 { chat, messages }
    },
    staleTime: 5 * 60 * 1000, // 5 分钟
  })
}

// 在组件中使用
function ChatDetailPage({ chatId }: { chatId: string }) {
  // 1. 获取会话详情（含历史消息）
  const { data, isLoading } = useConversation(chatId)

  // 2. 用历史消息初始化 AI SDK useChat
  const chatProps = useChat({
    id: chatId,
    initialMessages: data?.messages ?? [],
    // ... 其他配置
  })

  return <ChatInterface {...chatProps} />
}
```

### 3. 会话管理操作的乐观更新

**研究问题**: 重命名、固定、删除等快速操作如何实现乐观更新？

**决策**: 使用 TanStack Mutation 的 `onMutate` + `onError` 回滚模式

**理由**:
- TanStack Query 内置乐观更新支持，API 设计符合聊天场景
- 可以同时更新列表和详情缓存，确保 UI 一致性
- 失败时自动回滚，无需手动管理状态

**实施细节**:
```typescript
function useUpdateConversation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await honoClient.api.chat[':id'].$put({
        param: { id },
        json: data,
      })
      if (!res.ok) throw new Error('Failed to update chat')
      return res.json()
    },

    // 乐观更新：立即更新 UI
    onMutate: async ({ id, data }) => {
      // 取消正在进行的查询，避免覆盖乐观更新
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

    // 成功后失效缓存（获取最新数据）
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
    },
  })
}
```

### 4. 知识库集成与工具调用

**研究问题**: 如何优化知识库选择和 AI 工具调用？

**决策**: 保留现有 ChatContext 的知识库选择状态，服务器端处理工具调用

**理由**:
- ChatContext 当前用于管理 UI 状态（selectedKnowledgeBaseIds），这是合理的用途
- 知识库检索通过后端 AI SDK 的工具调用实现（参考 server/src/routes/chat.ts 中的 `findRelevantContent`）
- 前端只需在发送消息时传递 `knowledgeBaseIds` 参数即可

**实施细节**:
```typescript
// ChatContext 保持简化（仅 UI 状态）
type ChatContextType = {
  selectedKnowledgeBaseIds: string[]
  setSelectedKnowledgeBaseIds: (ids: string[]) => void
}

// 消息发送时包含知识库 ID
function ChatPromptInput() {
  const { selectedKnowledgeBaseIds } = useChatContext()
  const chatProps = useChat({
    body: {
      knowledgeBaseIds: selectedKnowledgeBaseIds, // 传递给后端
    },
  })

  return <PromptInput {...chatProps} />
}

// 后端已有的工具调用逻辑保持不变（server/src/routes/chat.ts）
```

### 5. 查询键命名约定

**研究问题**: 如何组织聊天相关的查询键？

**决策**: 使用分层命名，参考知识库模块的模式

**实施细节**:
```typescript
// client/src/lib/queryKeys.ts (扩展现有文件)

export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  details: () => [...conversationKeys.all, 'detail'] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
}

export const chatConfigKeys = {
  all: ['chatConfigs'] as const,
  lists: () => [...chatConfigKeys.all, 'list'] as const,
  details: () => [...chatConfigKeys.all, 'detail'] as const,
  detail: (id: string) => [...chatConfigKeys.details(), id] as const,
}

// 失效策略示例
queryClient.invalidateQueries({ queryKey: conversationKeys.all }) // 失效所有会话相关查询
queryClient.invalidateQueries({ queryKey: conversationKeys.lists() }) // 仅失效列表
queryClient.invalidateQueries({ queryKey: conversationKeys.detail('123') }) // 仅失效特定详情
```

### 6. 缓存时间配置

**研究问题**: 不同数据类型的最佳缓存策略是什么？

**决策**: 分级缓存策略

**配置**:
- **会话列表**: `staleTime: 2 * 60 * 1000` (2 分钟) - 频繁访问，需要较新数据
- **会话详情**: `staleTime: 5 * 60 * 1000` (5 分钟) - 访问后不常变化
- **配置列表**: `staleTime: 5 * 60 * 1000` (5 分钟) - 不常修改
- **全局默认**: `cacheTime: 10 * 60 * 1000` (10 分钟) - 参考知识库模块

**理由**:
- 会话列表可能被多个组件同时使用（侧边栏 + 主列表），需要较短陈旧时间
- 会话详情在用户查看后不太会立即改变（除非用户手动编辑）
- 配置很少修改，可以使用较长缓存时间

## 决策总结

| 主题 | 决策 | 关键技术 |
|------|------|---------|
| 架构模式 | 分层架构：TanStack Query 管理持久化数据，AI SDK `useChat` 管理消息流 | TanStack Query + AI SDK React |
| 消息缓存 | 历史消息通过会话详情查询获取，实时消息由 `useChat` 管理 | 会话详情查询 + `initialMessages` |
| 乐观更新 | 使用 `onMutate` + `onError` 回滚模式 | TanStack Mutation |
| 知识库集成 | 保留 ChatContext UI 状态，后端处理工具调用 | 现有架构 |
| 查询键 | 分层命名：`conversations.lists()`, `conversations.detail(id)` | 查询键工厂 |
| 缓存策略 | 列表 2min，详情 5min，全局缓存 10min | staleTime + cacheTime |

## 参考资料

1. **TanStack Query 文档**: https://tanstack.com/query/v4/docs/react/overview
2. **AI SDK React 文档**: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
3. **知识库模块实现**: `/Users/wei/Coding/rafa/specs/001-kb-tanstack-refactor/`
4. **现有聊天实现**:
   - `client/src/hooks/useChatRPC.ts`
   - `client/src/hooks/useChatLogic.ts`
   - `server/src/routes/chat.ts`

## 后续步骤

研究完成，进入 Phase 1: 设计与契约
- 生成数据模型文档（data-model.md）
- 定义 API 契约（contracts/）
- 编写快速开始指南（quickstart.md）
