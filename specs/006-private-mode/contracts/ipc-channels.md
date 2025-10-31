# IPC Channels: Private Mode

**Feature**: 006-private-mode
**生成日期**: 2025-10-20
**目的**: 定义 Electron 主进程与渲染进程之间的 IPC 通信契约

---

## 通道命名规范

格式: `<domain>:<action>`

示例:
- `mode:switch` - 模式切换
- `ollama:pull-model` - 下载模型
- `vector:embed-documents` - 向量化文档

---

## 1. Mode Management（模式管理）

### `mode:switch`
**方向**: Renderer → Main
**类型**: Send (单向)
**参数**:
```typescript
{ mode: 'cloud' | 'private' }
```
**返回**: 无
**说明**: 切换运行模式，主进程切换数据库连接

### `mode:get-current`
**方向**: Renderer → Main
**类型**: Invoke (双向)
**参数**: 无
**返回**:
```typescript
{ mode: 'cloud' | 'private' }
```

---

## 2. Ollama Management（Ollama 管理）

### `ollama:pull-model`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{ modelName: string }
```
**返回**:
```typescript
{ success: boolean; error?: string }
```
**事件流**: `ollama:pull-progress`

### `ollama:pull-progress` (Event)
**方向**: Main → Renderer
**类型**: Send (事件)
**数据**:
```typescript
{
  status: string
  digest: string
  total: number
  completed: number
}
```

### `ollama:list-models`
**方向**: Renderer → Main
**类型**: Invoke
**参数**: 无
**返回**:
```typescript
Array<{
  name: string
  size: number
  modified_at: string
  digest: string
  details: {
    family: string
    parameter_size: string
    quantization_level: string
  }
}>
```

### `ollama:delete-model`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{ modelName: string }
```
**返回**:
```typescript
{ success: boolean; error?: string }
```

### `ollama:chat`
**方向**: Renderer → Main
**类型**: Invoke (流式通过事件)
**参数**:
```typescript
{
  model: string
  messages: Array<{ role: 'user' | 'assistant', content: string }>
  conversationId: string
}
```
**事件流**: `ollama:chat-stream`
**返回**:
```typescript
{ success: boolean; error?: string }
```

### `ollama:chat-stream` (Event)
**方向**: Main → Renderer
**类型**: Send (流式事件)
**数据**:
```typescript
{
  conversationId: string
  delta: string  // 增量文本
  done: boolean
}
```

---

## 3. Vector DB Management（向量数据库管理）

### `vector:embed-documents`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{
  knowledgeBaseId: string
  documents: Array<{
    id: string
    text: string
    metadata: any
  }>
}
```
**返回**:
```typescript
{ success: boolean; count: number; error?: string }
```
**事件流**: `vector:embed-progress`

### `vector:embed-progress` (Event)
**方向**: Main → Renderer
**类型**: Send (事件)
**数据**:
```typescript
{
  knowledgeBaseId: string
  current: number
  total: number
  status: string
}
```

### `vector:search`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{
  knowledgeBaseId: string
  query: string
  limit?: number  // default: 10
}
```
**返回**:
```typescript
{
  success: boolean
  results: Array<{
    id: string
    text: string
    score: number
    metadata: any
  }>
  error?: string
}
```

### `vector:delete-kb`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{ knowledgeBaseId: string }
```
**返回**:
```typescript
{ success: boolean; error?: string }
```

---

## 4. Local Database Operations（本地数据库操作）

### `db:create-conversation`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{
  title: string
  modelId: string
}
```
**返回**:
```typescript
{
  success: boolean
  conversation?: {
    id: string
    title: string
    modelId: string
    createdAt: number
  }
  error?: string
}
```

### `db:get-conversations`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{ limit?: number; offset?: number }
```
**返回**:
```typescript
Array<{
  id: string
  title: string
  modelId: string
  createdAt: number
  updatedAt: number
  messageCount: number
}>
```

### `db:get-messages`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{ conversationId: string }
```
**返回**:
```typescript
Array<{
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}>
```

### `db:delete-conversation`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{ conversationId: string }
```
**返回**:
```typescript
{ success: boolean; error?: string }
```

### `db:create-knowledge-base`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{
  name: string
  description?: string
  embeddingModel: string
}
```
**返回**:
```typescript
{
  success: boolean
  knowledgeBase?: {
    id: string
    name: string
    embeddingModel: string
    createdAt: number
  }
  error?: string
}
```

### `db:upload-document`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{
  knowledgeBaseId: string
  filePath: string  // 用户选择的文件路径
}
```
**返回**:
```typescript
{
  success: boolean
  document?: {
    id: string
    fileName: string
    fileSize: number
  }
  error?: string
}
```

---

## 5. File System Operations（文件系统操作）

### `fs:select-file`
**方向**: Renderer → Main
**类型**: Invoke
**参数**:
```typescript
{
  filters: Array<{ name: string; extensions: string[] }>
  properties?: Array<'openFile' | 'multiSelections'>
}
```
**返回**:
```typescript
{
  filePaths: string[]
  canceled: boolean
}
```

### `fs:get-user-data-path`
**方向**: Renderer → Main
**类型**: Invoke
**参数**: 无
**返回**:
```typescript
{ path: string }
```

---

## 错误处理规范

所有 IPC 调用应遵循统一的错误响应格式：

```typescript
interface IPCError {
  success: false
  error: string  // 用户可读的错误消息（英文）
  code?: string  // 错误代码（用于客户端特殊处理）
  details?: any  // 额外调试信息
}
```

### 常见错误代码

- `OLLAMA_NOT_RUNNING`: Ollama 服务未运行
- `MODEL_NOT_FOUND`: 模型不存在
- `DB_CONNECTION_ERROR`: 数据库连接失败
- `VECTOR_EMBEDDING_FAILED`: 向量化失败
- `FILE_NOT_FOUND`: 文件不存在
- `PERMISSION_DENIED`: 权限拒绝

---

## 安全考虑

1. **路径验证**: 所有文件路径需验证，防止路径遍历攻击
2. **参数校验**: 主进程必须验证所有参数（不信任渲染进程）
3. **速率限制**: 防止渲染进程恶意频繁调用
4. **错误消息**: 不泄露敏感系统信息

---

## 类型定义位置

所有 IPC 类型定义应集中管理：

`client/src/types/ipc.ts` - 渲染进程使用的类型
`client/electron/types/ipc.ts` - 主进程使用的类型

确保两端类型同步，使用共享类型文件或代码生成工具。

---

## 示例：渲染进程调用

```typescript
// 客户端代码示例
const pullModel = async (modelName: string) => {
  // 监听进度事件
  window.electron.ipcRenderer.on('ollama:pull-progress', (data) => {
    const progress = (data.completed / data.total) * 100
    setDownloadProgress(progress)
  })

  // 发起下载
  const result = await window.electron.ipcRenderer.invoke('ollama:pull-model', { modelName })

  if (!result.success) {
    toast.error(result.error)
  }
}
```

---

## 总结

Private Mode 的 IPC 通道设计原则：

1. **类型安全**: 所有参数和返回值都有明确的 TypeScript 类型
2. **错误处理**: 统一的错误响应格式
3. **流式支持**: 长时间操作（下载、向量化）通过事件流实时反馈进度
4. **安全验证**: 主进程验证所有输入，防止恶意调用

总计定义 **20+ IPC 通道**，覆盖模式切换、Ollama 管理、向量数据库、本地数据库和文件系统操作。
