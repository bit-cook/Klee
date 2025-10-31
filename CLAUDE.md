# klee Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-10-18

## Active Technologies
- TanStack Query v4.29.14 (客户端数据缓存和状态管理)
- TanStack Router v1.132.41 (路由管理)
- Hono v4.9.12 (RPC 客户端类型安全)
- React 18.3.1
- TypeScript 5.4.2 (前端) / 5.8.3 (后端)
- Electron (桌面应用框架)
- PostgreSQL (via Drizzle ORM, 云端部署) (004-marketplace-sharing)
- PostgreSQL (via Drizzle ORM, 云端部署) + Supabase Storage (文件存储) (005-marketplace-sharing-refactor)
- **electron-ollama** (Private Mode 本地 AI, 006-private-mode)
- **SQLite** (Private Mode 本地数据存储, 006-private-mode)
- **LanceDB** (Private Mode 向量存储, 计划中)
- TypeScript 5.4.2 (client) / 5.8.3 (server) (008-specify-scripts-bash)
- TypeScript 5.4.2 (client) / 5.8.3 (server), Node.js 20+ (009-notes-private-mode)

## Project Structure
```
client/                           # 前端 Electron + React 应用
├── electron/                     # Electron 主进程
│   ├── main/
│   │   └── index.ts              # 应用入口,初始化 OllamaManager
│   ├── services/
│   │   └── ollama-manager.ts     # Ollama 管理器 (检测+启动 electron-ollama)
│   └── ipc/
│       └── mode-handlers.ts      # 模式切换 IPC 处理器
├── src/                          # React 渲染进程
│   ├── hooks/                    # 按功能模块组织的自定义钩子
│   │   ├── chat/                 # 聊天模块
│   │   │   ├── queries/          # 聊天查询钩子（只读）
│   │   │   ├── mutations/        # 聊天变更钩子（写入）
│   │   │   └── useChatLogic.ts   # 聊天业务逻辑
│   │   ├── knowledge-base/       # 知识库模块
│   │   │   ├── queries/          # 知识库查询钩子
│   │   │   ├── mutations/        # 知识库变更钩子
│   │   │   └── useKnowledgeBaseRPC.ts
│   │   ├── note/                 # 笔记模块
│   │   │   └── useNoteRPC.ts
│   │   ├── agent/                # 代理模块
│   │   │   └── useAgentAPI.ts
│   │   ├── mode/                 # Private Mode 钩子
│   │   │   └── useOllamaSource.ts # Ollama 状态监听
│   │   ├── common/               # 通用钩子
│   │   │   ├── use-mobile.tsx
│   │   │   └── useActiveNavItem.ts
│   │   └── README.md             # Hooks 组织结构说明
│   ├── contexts/
│   │   └── ModeContext.tsx       # 模式状态管理 (cloud/private)
│   ├── components/
│   │   ├── mode/                 # Private Mode 组件
│   │   │   ├── OllamaDownloadProgress.tsx  # Ollama 下载进度 UI
│   │   │   └── PrivateModeErrorBoundary.tsx
│   │   └── layout/sidebar-left/
│   │       └── ModeToggle.tsx    # Cloud/Private 模式切换器
│   ├── config/
│   │   └── local.config.ts       # Private Mode 配置
│   ├── lib/
│   │   ├── query-client.ts       # TanStack Query 客户端全局配置
│   │   ├── queryKeys.ts          # 查询键工厂函数（knowledgeBaseKeys, conversationKeys, chatConfigKeys）
│   │   └── hono-client.ts        # Hono RPC 客户端
│   ├── routes/                   # TanStack Router 路由（使用 loader 预加载数据）
│   └── App.tsx                   # 应用根组件

server/                           # 后端 Hono API
└── src/
    ├── routes/                   # API 路由（导出类型供 RPC 使用）
    └── db/                       # 数据库模式和查询
```

## Commands
```bash
# 开发
npm run dev                       # 启动开发服务器

# 构建
npm run build                     # 构建生产版本（先构建 server，再构建 client）

# 类型检查
npx tsc --noEmit                  # 检查 TypeScript 类型错误
```

## Code Style

### TanStack Query 使用规范

#### 1. 查询钩子（Query Hooks）- 用于读取数据

**位置**: `client/src/hooks/queries/`

**何时使用**:
- 获取服务器数据（GET 请求）
- 需要自动缓存和后台刷新的场景
- 需要加载状态和错误处理的场景

**示例**:
```typescript
// hooks/queries/useKnowledgeBases.ts
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'

export function useKnowledgeBases() {
  return useQuery({
    queryKey: knowledgeBaseKeys.lists(),
    queryFn: async () => {
      const res = await honoClient.api.knowledgebase.$get()
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json() // 类型自动从 Hono RPC 推断
    },
    staleTime: 2 * 60 * 1000, // 2 分钟陈旧时间
  })
}
```

**组件中使用**:
```typescript
const { data, isLoading, error } = useKnowledgeBases()

if (isLoading) return <div>Loading...</div>
if (error) return <div>Error: {error.message}</div>
if (!data) return null

return data.knowledgeBases.map(kb => <div key={kb.id}>{kb.name}</div>)
```

#### 2. 变更钩子（Mutation Hooks）- 用于修改数据

**位置**: `client/src/hooks/mutations/`

**何时使用**:
- 创建、更新、删除数据（POST/PUT/DELETE 请求）
- 需要乐观更新的场景
- 需要自动失效缓存的场景

**示例（带乐观更新）**:
```typescript
// hooks/mutations/useUpdateKnowledgeBase.ts
export function useUpdateKnowledgeBase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await honoClient.api.knowledgebase[':id'].$put({
        param: { id },
        json: data,
      })
      if (!res.ok) throw new Error('Update failed')
      return res.json()
    },
    // 乐观更新：立即更新 UI
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.detail(id) })
      const previousData = queryClient.getQueryData(knowledgeBaseKeys.detail(id))
      queryClient.setQueryData(knowledgeBaseKeys.detail(id), (old) => ({ ...old, ...data }))
      return { previousData }
    },
    // 失败时回滚
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(knowledgeBaseKeys.detail(variables.id), context.previousData)
      }
    },
    // 成功后失效缓存
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(variables.id) })
    },
  })
}
```

**组件中使用**:
```typescript
const updateMutation = useUpdateKnowledgeBase()

const handleUpdate = () => {
  updateMutation.mutate(
    { id: '123', data: { starred: true } },
    {
      onSuccess: () => toast.success('Updated'),
      onError: (error) => toast.error(error.message),
    }
  )
}
```

#### 3. 查询键命名约定

**位置**: `client/src/lib/queryKeys.ts`

**层级结构**:
```typescript
export const knowledgeBaseKeys = {
  all: ['knowledgeBases'] as const,                    // 一级：根键
  lists: () => [...knowledgeBaseKeys.all, 'list'] as const,     // 二级：列表
  details: () => [...knowledgeBaseKeys.all, 'detail'] as const, // 二级：详情
  detail: (id: string) => [...knowledgeBaseKeys.details(), id] as const,
}
```

**失效策略**:
```typescript
// 失效所有知识库查询
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all })

// 仅失效列表查询
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists() })

// 仅失效特定详情
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail('123') })
```

#### 4. 缓存策略配置

**全局配置** (`client/src/lib/query-client.ts`):
```typescript
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 分钟陈旧时间
      cacheTime: 10 * 60 * 1000,       // 10 分钟缓存时间
      retry: 3,                        // 失败重试 3 次
      refetchOnWindowFocus: true,      // 窗口焦点时重新获取
      refetchOnReconnect: true,        // 网络重连时重新获取
    },
  },
})
```

**特定查询覆盖**:
- 列表查询: `staleTime: 2 * 60 * 1000` (2 分钟)
- 详情查询: 使用全局默认 (5 分钟)
- 文件列表: `staleTime: 1 * 60 * 1000` (1 分钟)

#### 5. 类型安全链

**端到端类型推断**（零手动类型定义）:
```
数据库模式 (schema.ts)
  ↓ drizzle-zod
Zod 验证器
  ↓ Hono API
Hono RPC 类型
  ↓ InferResponseType
客户端 RPC 返回类型
  ↓ TanStack Query
useQuery/useMutation 返回类型
  ↓ React
组件 props 类型
```

**重要**:
- ✅ 依赖 Hono RPC 类型推断，不要手动定义类型
- ✅ 使用 `InferRequestType` 和 `InferResponseType` 工具类型
- ✅ 确保 server 先构建（`npm run build`）生成类型
- ❌ 避免 `any` 或手动类型断言

#### 6. 调试工具

**TanStack Query DevTools**:
```typescript
// 已在 App.tsx 中启用
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

<ReactQueryDevtools initialIsOpen={false} />
```

**使用方法**:
- 开发环境自动显示浮动图标
- 点击图标查看所有查询状态
- 检查缓存数据和查询键
- 手动触发重新获取或失效

#### 7. 错误处理

**网络错误**: 自动重试（全局配置）
**业务错误**: 在 `onError` 中处理
**乐观更新失败**: 自动回滚

```typescript
mutation.mutate(data, {
  onError: (error) => {
    // 1. 乐观更新已自动回滚
    // 2. 显示错误消息
    toast.error(error.message)
    // 3. 记录错误
    console.error('Mutation failed:', error)
  }
})
```

## 聊天模块特定说明

### TanStack Router Loader + TanStack Query 混合架构

聊天模块采用**混合架构**以确保最佳用户体验：

```typescript
// 使用 TanStack Router Loader 预加载数据
export const Route = createFileRoute('/_authenticated/chat/$chatId')({
  loader: async ({ params }) => {
    const res = await honoClient.api.chat[':id'].$get({ param: { id: params.chatId } })

    // 404 表示新会话，返回空数据
    if (res.status === 404) {
      return { messages: [], chat: undefined }
    }

    return await res.json()
  },
  component: RouteComponent,
})

// 组件中使用 loader 数据（确保渲染前数据就绪）
function RouteComponent() {
  const { messages, chat } = Route.useLoaderData()

  // messages 已经预加载，无空白闪烁
  const { handleSubmit, ... } = useChatLogic({
    chatId,
    initialMessages: messages,  // 直接使用预加载数据
    ...
  })
}
```

**关键设计决策**：
- ✅ **Loader 预加载**：确保切换聊天时数据在渲染前就绪，避免空白闪烁
- ✅ **TanStack Query 缓存管理**：后台刷新、缓存失效、乐观更新
- ✅ **AI SDK 流式响应**：保持原有的聊天逻辑，不干扰实时消息流

### 缓存失效策略

聊天模块使用**手动缓存失效**而非自动失效：

```typescript
// 在 useChatLogic 中，消息发送成功后失效会话列表
return sendPromise.then(() => {
  emitChatUpdated()
  // 失效会话列表缓存，使侧边栏更新
  queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
})
```

**不在流式响应结束后失效缓存**：
- ❌ 不在 `onFinish` 中失效会话详情缓存（会导致不必要的网络请求）
- ✅ AI SDK 已管理消息状态，TanStack Query 只负责初始加载

### 聊天会话查询钩子使用

```typescript
// ❌ 错误：纯 useQuery 会导致空白闪烁
function ChatDetail() {
  const { data, isLoading } = useConversation(chatId)

  if (isLoading) return <div>Loading...</div>  // 切换时显示 loading

  return <ChatUI messages={data.messages} />
}

// ✅ 正确：使用 Loader 预加载
export const Route = createFileRoute('/_authenticated/chat/$chatId')({
  loader: async ({ params }) => {
    // 数据在路由切换前就加载好
    const res = await honoClient.api.chat[':id'].$get(...)
    return await res.json()
  },
  component: () => {
    const data = Route.useLoaderData()  // 数据已就绪
    return <ChatUI messages={data.messages} />
  }
})
```

## Private Mode 特定说明

### 架构概述

Private Mode 允许用户在**完全离线**的环境下使用 klee,所有数据和 AI 推理都在本地进行。

**核心特性**:
1. **自动 Ollama 管理**: 检测系统 Ollama → 若不存在则自动下载 electron-ollama
2. **完全离线运行**: 无需网络连接
3. **数据隔离**: Cloud 和 Private 模式数据完全分离
4. **流畅切换**: 用户可以在两种模式间自由切换

### Ollama 初始化流程

```typescript
// 主进程 (electron/main/index.ts)
app.whenReady().then(async () => {
  // 1. 创建窗口
  await createWindow()

  // 2. 等待窗口加载
  win.webContents.once('did-finish-load', () => {
    // 3. 初始化 OllamaManager
    ollamaManager.initialize((progress) => {
      // 发送进度事件到渲染进程
      win.webContents.send('ollama-init-progress', progress)
    }).then((result) => {
      // 发送完成事件
      win.webContents.send('ollama-ready', result)
    })
  })
})
```

**流程**:
1. 检测系统 Ollama (localhost:11434, 2秒超时)
2. 如果检测到 → 使用系统 Ollama (`source: 'system'`)
3. 如果未检测到 → 下载 electron-ollama (`source: 'embedded'`)
4. 发送 IPC 事件通知前端

### 前端集成

#### 1. 监听 Ollama 状态 (`useOllamaSource`)

```typescript
import { useOllamaSource } from '@/hooks/mode/useOllamaSource'

function MyComponent() {
  const { source, isInitializing, progress, progressMessage } = useOllamaSource()

  // source: 'none' | 'system' | 'embedded'
  // isInitializing: boolean
  // progress: 0-100
  // progressMessage: string
}
```

#### 2. 显示下载进度 (`OllamaDownloadProgress`)

已在 `App.tsx` 中集成,会自动显示在右上角:
- `source === 'none'`: "Detecting Ollama"
- `source === 'system'`: "Connecting to System Ollama"
- `source === 'embedded'`: "Downloading Ollama" + 进度条

#### 3. 模式切换 (`ModeToggle`)

```typescript
import { useMode } from '@/contexts/ModeContext'
import { useOllamaSource } from '@/hooks/mode/useOllamaSource'

function ModeToggle() {
  const { mode, setMode } = useMode()
  const { source } = useOllamaSource()

  const isOllamaAvailable = source === 'system' || source === 'embedded'

  // Private Mode 按钮在 Ollama 未就绪时禁用
  <Button
    disabled={!isOllamaAvailable}
    onClick={() => setMode('private')}
  >
    Private Mode
  </Button>
}
```

### IPC 事件

#### Main → Renderer

| 事件名 | 数据 | 触发时机 |
|--------|------|----------|
| `ollama-init-progress` | `{ percent, message, source }` | 初始化进度更新 |
| `ollama-ready` | `{ source, url }` | 初始化完成 |
| `ollama-init-failed` | `{ error }` | 初始化失败 |

### 配置文件

**`client/src/config/local.config.ts`**:

包含所有 Private Mode 相关配置:
- Ollama 配置 (URL, 端口, 超时)
- 向量数据库配置 (LanceDB, 计划中)
- 嵌入模型配置
- 文件存储配置
- 性能监控配置

### 最佳实践

1. **不要手动调用 Ollama API**: 使用 `useOllamaSource` 获取状态
2. **不要阻塞 UI**: Ollama 初始化在后台进行
3. **处理超时**: `useOllamaSource` 有 30 秒超时保护
4. **检查可用性**: 在启用 Private Mode 功能前检查 `isOllamaAvailable`

### 故障排查

**问题**: 一直显示 "Connecting to System Ollama"
- 检查控制台 `[OllamaManager]` 和 `[useOllamaSource]` 日志
- 确认窗口 `did-finish-load` 事件触发
- 30秒后会自动超时

**问题**: electron-ollama 下载失败
- 检查网络连接
- 确保至少 500MB 可用磁盘空间
- 查看下载进度和错误消息

详细文档: [docs/private-mode-architecture.md](docs/private-mode-architecture.md)

### Marketplace Private Mode - 本地模型管理

**功能**: 允许用户在 Private Mode 下浏览、下载、管理和使用 Ollama 支持的开源大模型。

#### 核心组件

**Hooks**:
- `useInstalledModels()` - 查询已安装的 Ollama 模型
- `useAvailableModels()` - 合并配置和安装状态，返回可用模型列表
- `useDownloadModel()` - 下载模型（支持暂停/继续，进度追踪）
- `useDeleteModel()` - 删除模型（包含使用检测）
- `useDiskSpace()` - 查询 Ollama 磁盘空间
- `useModelUsage(modelId)` - 检查模型是否被使用

**组件**:
- `LocalLLMCard` - 模型卡片（显示模型信息、下载/删除按钮）
- `ModelDownloadProgress` - 下载进度条（实时显示速度、剩余时间）
- `ModelDeleteDialog` - 删除确认对话框

**配置**:
- `client/src/renderer/src/config/models.ts` - 统一模型配置
  - `localLLMModels` - 本地模型列表（15个精选模型）
  - `llmModels` - 云端模型列表
  - `modelConfig` - 统一配置对象
  - `validateModelConfig()` - 配置验证函数

**主进程服务**:
- `client/src/main/local/services/disk-space-manager.ts` - 磁盘空间管理
- `client/src/main/local/services/ollama-model-manager.ts` - 模型删除管理
- `client/src/main/local/db/queries/models.ts` - 模型使用查询

#### 使用示例

**添加新模型到配置**:
```typescript
// 在 client/src/renderer/src/config/models.ts 中
export const localLLMModels: LocalLLMModel[] = [
  {
    name: 'Llama 3.2 1B',
    model: 'llama3.2:1b',
    provider: 'Meta',
    size: 1.3,
    minGPU: '4 GB',
    updatedAt: '2024-09-25',
    description: 'Ultra-lightweight, Meta official',
    tags: ['Recommended', 'Fastest'],
  },
  // ... 其他模型
]
```

**在聊天中使用本地模型**:
```typescript
// ChatPromptInput 自动根据模式切换模型列表
const { isPrivateMode } = useMode()
const { data: installedModels } = useInstalledModels()

const availableModels = isPrivateMode
  ? (installedModels || [])
      .filter((m) => !m.name.toLowerCase().includes('embed')) // 过滤 embedding 模型
      .map((m) => ({ name: m.name, value: m.name }))
  : llmModels
```

#### 关键设计决策

1. **模型过滤**: 聊天模型选择器会自动过滤掉 embedding 模型（包含 "embed" 关键字）
2. **并发控制**: 使用 p-queue 限制同时下载的模型数量为 2
3. **断点续传**: Ollama 支持自动断点续传，暂停后继续会从上次位置开始
4. **删除保护**: 删除前检查模型是否被聊天会话使用，避免误删
5. **磁盘空间**: 下载前自动检查可用空间，不足时阻止下载
6. **配置验证**: 应用启动时自动验证模型配置，错误时在控制台显示详细信息

#### 查询键管理

```typescript
// client/src/renderer/src/lib/queryKeys.ts
export const ollamaModelKeys = {
  all: ['ollama-models'] as const,
  lists: () => [...ollamaModelKeys.all, 'list'] as const,
  installed: () => [...ollamaModelKeys.lists(), 'installed'] as const,
  available: () => [...ollamaModelKeys.lists(), 'available'] as const,
}
```

**缓存失效策略**:
- 下载完成 → 失效 `installed()` 和 `available()`
- 删除完成 → 失效 `installed()`, `available()`, 和 `['disk-space', 'ollama']`
- 模型列表加载 → staleTime 30秒

#### UI/UX 优化

1. **Web Search**: Private Mode 下禁用（显示 Tooltip 说明）
2. **Agent 模式**: Private Mode 下显示提示而非隐藏标签
3. **模型选择器**: 无模型时禁用并显示引导信息
4. **Tooltip**: 使用 shadcn/ui Tooltip 确保禁用按钮也能显示提示

## Recent Changes
- 009-notes-private-mode: Added TypeScript 5.4.2 (client) / 5.8.3 (server), Node.js 20+
- 008-specify-scripts-bash: Added Marketplace Private Mode (本地模型管理功能)
  - 新增 hooks: useInstalledModels, useAvailableModels, useDownloadModel, useDeleteModel, useDiskSpace, useModelUsage
  - 新增组件: LocalLLMCard, ModelDownloadProgress, ModelDeleteDialog
  - 新增主进程服务: disk-space-manager, ollama-model-manager
  - 统一模型配置管理（models.ts），包含配置验证
  - 聊天集成：Private Mode 下使用本地模型，自动过滤 embedding 模型
  - UI 优化：Tooltip 提示、禁用状态说明、Agent 标签提示

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
