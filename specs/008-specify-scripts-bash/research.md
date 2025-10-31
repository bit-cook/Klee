# Research Report: Marketplace Private Mode - 技术研究与决策

**Date**: 2025-10-23
**Feature**: Marketplace Private Mode - 本地开源大模型管理
**Status**: Phase 0 Complete

## 执行摘要

本研究报告为 Marketplace Private Mode 功能提供完整的技术决策依据，涵盖 Ollama API 集成、TanStack Query 流式下载、磁盘空间检测和模型删除安全性。所有研究任务已完成，关键决策已明确。

---

## 1. Ollama API 集成研究

### 1.1 已验证的 API 端点

#### `/api/tags` - 列出已安装模型

**请求**:
\`\`\`bash
GET http://localhost:11434/api/tags
\`\`\`

**响应**:
\`\`\`json
{
  "models": [
    {
      "name": "llama3:8b",
      "model": "llama3:8b",
      "modified_at": "2024-05-15T10:30:00Z",
      "size": 4661224320,
      "digest": "sha256:1234567890abcdef",
      "details": {
        "parent_model": "",
        "format": "gguf",
        "family": "llama",
        "families": ["llama"],
        "parameter_size": "8B",
        "quantization_level": "Q4_0"
      }
    }
  ]
}
\`\`\`

**项目中现有实现**:
\`\`\`typescript
// client/src/renderer/src/lib/ollama-client.ts
export async function getInstalledModels() {
  const response = await fetch('http://localhost:11434/api/tags')
  const data = await response.json()
  return data.models || []
}
\`\`\`

#### `/api/pull` - 下载模型（NDJSON 流式响应）

**请求**:
\`\`\`bash
POST http://localhost:11434/api/pull
Content-Type: application/json

{
  "name": "llama3:8b",
  "stream": true
}
\`\`\`

**响应（NDJSON 流）**:
\`\`\`json
{"status":"pulling manifest"}
{"status":"downloading digestname","digest":"sha256:abc123","total":4661224320,"completed":1048576}
{"status":"downloading digestname","digest":"sha256:abc123","total":4661224320,"completed":10485760}
...
{"status":"verifying sha256 digest"}
{"status":"writing manifest"}
{"status":"removing any unused layers"}
{"status":"success"}
\`\`\`

**关键字段**:
- `status`: 当前状态（`pulling manifest` / `downloading digestname` / `verifying sha256 digest` / `writing manifest` / `success`）
- `total`: 总字节数
- `completed`: 已下载字节数
- `digest`: 当前下载的 blob SHA256

#### `/api/delete` - 删除模型

**请求**:
\`\`\`bash
DELETE http://localhost:11434/api/delete
Content-Type: application/json

{
  "name": "llama3:8b"
}
\`\`\`

**成功响应**:
\`\`\`json
{}
\`\`\`

**错误响应**:
\`\`\`json
{
  "error": "model 'llama3:8b' is in use"
}
\`\`\`

**Ollama JS SDK (v0.6.0)**:
\`\`\`typescript
import { Ollama } from 'ollama'

const ollama = new Ollama({ host: 'http://localhost:11434' })

// 删除模型
await ollama.delete({ model: 'llama3:8b' })
\`\`\`

### 1.2 暂停/继续下载机制

**研究结论**: Ollama API **不支持** HTTP Range Requests，因此：

❌ **无法实现真正的暂停/继续**（断点续传）
✅ **可以实现取消后重新开始**

**推荐方案**: 使用 AbortController 取消下载，UI 显示"暂停"按钮实际执行取消操作。

**实现示例**:
\`\`\`typescript
const controller = new AbortController()

fetch('http://localhost:11434/api/pull', {
  method: 'POST',
  body: JSON.stringify({ name: modelName, stream: true }),
  signal: controller.signal,
})

// 用户点击"暂停"
controller.abort() // 取消下载

// 用户点击"继续"
// 重新开始下载（从头开始，非断点续传）
\`\`\`

**用户体验优化**:
- UI 文案明确说明："Pausing will cancel the download. Continue will restart from the beginning."
- 显示警告：大文件下载建议一次完成

### 1.3 重复下载检测机制

**方案**: 在下载前查询 `/api/tags`，过滤已安装的模型。

**实现**:
\`\`\`typescript
// 1. 获取已安装模型列表
const installedModels = await getInstalledModels()
const installedModelNames = new Set(installedModels.map(m => m.name))

// 2. 过滤配置文件中的模型列表
const availableModels = localLLMModels.filter(
  model => !installedModelNames.has(model.model)
)

// 3. 在 UI 中显示"已安装"状态
const modelStatus = installedModelNames.has(model.model) 
  ? 'installed' 
  : 'available'
\`\`\`

**关键点**:
- electron-ollama 和系统 Ollama 共享相同的模型存储路径（`~/.ollama/models`），因此 `/api/tags` 会返回所有已安装模型
- 无需额外检测逻辑，直接查询 API 即可

---

## 2. TanStack Query 流式下载集成

### 2.1 核心方案：useMutation + React State

**结论**: TanStack Query v4 的 `useMutation` 不支持流式数据，必须结合 React State 实现实时进度更新。

**完整实现**:
\`\`\`typescript
import { useMutation } from '@tanstack/react-query'
import { useState, useCallback, useRef } from 'react'

export function useDownloadOllamaModel() {
  const [progress, setProgress] = useState<OllamaDownloadProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const mutation = useMutation({
    mutationFn: async (modelName: string) => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        await pullOllamaModel(
          modelName,
          (p) => setProgress(p), // 实时更新进度
          controller.signal
        )
      } finally {
        abortControllerRef.current = null
      }
    },

    onSuccess: () => {
      setProgress({ status: 'success', percent: 100 })
    },

    onError: () => {
      setProgress(null)
    },
  })

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
    setProgress(null)
  }, [])

  return {
    download: mutation.mutate,
    isDownloading: mutation.isLoading,
    progress,
    cancel,
  }
}
\`\`\`

### 2.2 NDJSON 流式解析

**实现**:
\`\`\`typescript
async function pullOllamaModel(
  modelName: string,
  onProgress: (progress: OllamaDownloadProgress) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('http://localhost:11434/api/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
    signal,
  })

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      const data = JSON.parse(line)

      onProgress({
        status: data.status,
        completed: data.completed || 0,
        total: data.total || 0,
        percent: data.total ? Math.round((data.completed / data.total) * 100) : 0,
      })
    }
  }
}
\`\`\`

### 2.3 并发下载限制

**推荐方案**: 使用 `p-queue` 库（最多 2 个并发）

**安装**:
\`\`\`bash
npm install p-queue
\`\`\`

**实现**:
\`\`\`typescript
import PQueue from 'p-queue'

const downloadQueue = new PQueue({ concurrency: 2 })

export function useOllamaDownloadQueue() {
  const mutation = useMutation({
    mutationFn: async (modelName: string) => {
      await downloadQueue.add(async () => {
        await pullOllamaModel(modelName, onProgress, signal)
      })
    },
  })

  return {
    download: mutation.mutate,
    activeCount: downloadQueue.pending,
    queueSize: downloadQueue.size,
  }
}
\`\`\`

**备选方案**: 自定义队列（无外部依赖）

\`\`\`typescript
class DownloadQueue {
  private queue: Array<() => Promise<void>> = []
  private running = 0
  private readonly concurrency: number

  constructor(concurrency: number) {
    this.concurrency = concurrency
  }

  async add(fn: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          await fn()
          resolve()
        } catch (error) {
          reject(error)
        } finally {
          this.running--
          this.process()
        }
      }

      this.queue.push(task)
      this.process()
    })
  }

  private process() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift()
      if (task) {
        this.running++
        task()
      }
    }
  }
}
\`\`\`

**决策**: 使用 `p-queue`（成熟、可靠、社区验证）

---

## 3. 磁盘空间检测

### 3.1 推荐方案：Node.js 原生 API

**项目环境**: Node.js v22.14.0，完全支持 `fs.statfs()` API（v19.6+ 可用）

**实现（主进程）**:
\`\`\`typescript
import { statfsSync } from 'fs'
import { app } from 'electron'

export function getOllamaDiskSpace() {
  const ollamaPath = path.join(app.getPath('userData'), 'ollama', 'models')
  const stats = statfsSync(ollamaPath)

  const totalBytes = stats.blocks * stats.bsize
  const freeBytes = stats.bfree * stats.bsize
  const availableBytes = stats.bavail * stats.bsize

  return {
    totalBytes,
    freeBytes,
    availableBytes,
    usedBytes: totalBytes - freeBytes,
    percentUsed: ((totalBytes - freeBytes) / totalBytes) * 100,
  }
}
\`\`\`

**IPC 集成**:
\`\`\`typescript
// 主进程
ipcMain.handle('disk-space:get', async () => {
  return { success: true, data: getOllamaDiskSpace() }
})

// 前端
const { data: diskSpace } = useQuery({
  queryKey: ['disk-space', 'ollama'],
  queryFn: async () => {
    const result = await window.api.diskSpace.get()
    return result.data
  },
  staleTime: 30 * 1000,
  refetchInterval: 60 * 1000,
})
\`\`\`

### 3.2 下载前磁盘检查

**实现**:
\`\`\`typescript
export function useDownloadOllamaModel() {
  const { data: diskSpace } = useDiskSpace()

  const mutation = useMutation({
    mutationFn: async (model: { name: string; size: number }) => {
      // 检查磁盘空间（留 1GB 缓冲）
      const requiredSpace = model.size + 1024 * 1024 * 1024
      
      if (diskSpace && diskSpace.availableBytes < requiredSpace) {
        throw new Error(
          \`Insufficient disk space. Required: \${formatBytes(requiredSpace)}, Available: \${diskSpace.availableFormatted}\`
        )
      }

      await pullOllamaModel(model.name, onProgress, signal)
    },

    onError: (error) => {
      if (error.message.includes('Insufficient disk space')) {
        toast.error('Not enough disk space', {
          description: error.message,
        })
      }
    },
  })
}
\`\`\`

---

## 4. 模型删除安全性

### 4.1 模型使用检测

**数据源**: SQLite 本地数据库（Private Mode）

**Schema**:
\`\`\`typescript
// client/src/main/local/db/schema.ts
export const localChatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  model: text('model').notNull(), // 👈 模型 ID
  // ... 其他字段
})
\`\`\`

**查询实现**:
\`\`\`typescript
// client/src/main/local/db/queries/models.ts
export async function isModelInUse(
  db: ReturnType<typeof drizzle>,
  modelId: string
): Promise<boolean> {
  const sessions = await db
    .select({ id: localChatSessions.id })
    .from(localChatSessions)
    .where(eq(localChatSessions.model, modelId))
    .limit(1)
  
  return sessions.length > 0
}
\`\`\`

**IPC 处理器**:
\`\`\`typescript
ipcMain.handle('model:check-in-use', async (event, modelId: string) => {
  const db = dbManager.getDb()
  const inUse = await isModelInUse(db, modelId)
  return { success: true, data: { inUse } }
})
\`\`\`

### 4.2 安全删除流程

**完整流程**:
\`\`\`typescript
// 主进程
export async function deleteModel(
  modelId: string,
  force: boolean = false
): Promise<ModelDeleteResult> {
  // 1. 检查模型是否被使用
  if (!force) {
    const db = dbManager.getDb()
    const inUse = await isModelInUse(db, modelId)
    
    if (inUse) {
      const sessions = await getSessionsUsingModel(db, modelId)
      return {
        success: false,
        reason: 'in_use',
        error: \`Model is used by \${sessions.length} session(s)\`,
        sessionsUsingModel: sessions,
      }
    }
  }
  
  // 2. 调用 Ollama API 删除
  try {
    await ollama.delete({ model: modelId })
    return { success: true }
  } catch (error) {
    // 3. 解析错误
    if (error.message.includes('model is in use')) {
      return {
        success: false,
        reason: 'in_use',
        error: 'Model is currently running in Ollama',
      }
    }
    throw error
  }
}
\`\`\`

**前端 Mutation**:
\`\`\`typescript
export function useDeleteModel() {
  return useMutation({
    mutationFn: async ({ modelId }: { modelId: string }) => {
      const result = await window.api.model.delete(modelId)
      
      if (!result.success) {
        throw new Error(JSON.stringify(result.data))
      }
      
      return result.data
    },
    
    onError: (error) => {
      const errorData = JSON.parse(error.message)
      
      if (errorData.reason === 'in_use') {
        toast.error('Cannot delete model', {
          description: \`Used by \${errorData.sessionsUsingModel.length} session(s)\`,
        })
      }
    },
    
    onSuccess: () => {
      queryClient.invalidateQueries(['local-models'])
      queryClient.invalidateQueries(['disk-space'])
    },
  })
}
\`\`\`

### 4.3 Ollama 删除行为

**智能层管理**:
- Ollama 使用 **内容寻址存储**（Content-Addressable Storage）
- 多个模型可以共享相同的 blob（如基础层）
- 删除模型只会删除该模型独有的 blob
- 共享 blob 在所有引用模型都被删除后才会删除

**示例**:
\`\`\`bash
# llama3:8b 和 llama3:70b 共享基础层（3.7GB）
# llama3:8b 独有层：1GB
# llama3:70b 独有层：36GB

ollama rm llama3:8b
# 只释放 1GB 空间（独有层）
# 3.7GB 基础层仍被 llama3:70b 引用

ollama rm llama3:70b
# 释放 36GB（独有层） + 3.7GB（基础层） = 39.7GB
\`\`\`

**影响**:
- 删除确认对话框显示的"将释放的空间"是**估算值**
- 实际释放的空间可能更少（如果有共享层）
- UI 文案需要说明："This will free up approximately X GB"

---

## 5. 技术决策汇总

### 5.1 关键决策

| 领域 | 决策 | 理由 |
|------|------|------|
| **流式下载** | useMutation + React State | v4 不支持流式数据，需手动管理进度 |
| **并发控制** | p-queue (concurrency: 2) | 成熟、可靠，避免 Ollama 过载 |
| **暂停/继续** | 取消后重新开始（无断点续传） | Ollama API 不支持 Range Requests |
| **磁盘检测** | Node.js 原生 `statfs()` | v22 完全支持，无需第三方库 |
| **模型检测** | 查询 SQLite 数据库 | 唯一可靠的数据源（Private Mode） |
| **删除安全** | 多层检查（数据库 + Ollama） | 防止删除正在使用的模型 |
| **Electron 架构** | Renderer 直接调用 Ollama API | 简单、高效、与现有代码一致 |

### 5.2 依赖项

**需要安装**:
\`\`\`bash
npm install p-queue
\`\`\`

**已存在**:
- `ollama@0.6.0`
- `@tanstack/react-query@4.29.14`
- `better-sqlite3@12.4.1`
- `drizzle-orm@0.44.6`

### 5.3 文件结构

**新增文件**:
\`\`\`
client/src/
├── main/
│   ├── ipc/
│   │   ├── disk-space-handlers.ts       # ✨ 新增
│   │   └── model-handlers.ts            # ✨ 新增
│   └── local/
│       ├── db/queries/
│       │   └── models.ts                # ✨ 新增
│       └── services/
│           ├── disk-space-manager.ts    # ✨ 新增
│           └── ollama-model-manager.ts  # ✨ 新增
│
└── renderer/src/
    ├── lib/
    │   └── ollama-client.ts             # 🔄 扩展
    │
    └── hooks/
        ├── ollama-models/
        │   ├── queries/
        │   │   ├── useInstalledModels.ts    # ✨ 新增
        │   │   └── useAvailableModels.ts    # ✨ 新增
        │   └── mutations/
        │       ├── useDownloadModel.ts      # ✨ 新增
        │       └── useDeleteModel.ts        # ✨ 新增
        │
        └── mode/
            ├── useDiskSpace.ts              # ✨ 新增
            └── useModelUsage.ts             # ✨ 新增
\`\`\`

---

## 6. 风险与缓解

### 6.1 已识别风险

| 风险 | 严重程度 | 缓解措施 |
|------|---------|---------|
| Ollama 服务未运行 | 高 | 集成现有的 OllamaManager 检测逻辑 |
| 网络中断导致下载失败 | 中 | 自动重试 + 用户手动重试按钮 |
| 磁盘空间不足 | 中 | 下载前检查 + 实时监控 |
| 删除正在使用的模型 | 高 | 多层检查 + 用户确认对话框 |
| 并发下载过多 | 低 | p-queue 限制并发数为 2 |
| 模型共享层误删 | 低 | Ollama 自动管理，无需额外处理 |

### 6.2 性能考虑

**查询频率**:
- 模型列表：staleTime 2 分钟，按需失效
- 磁盘空间：staleTime 30 秒，每分钟自动刷新
- 模型使用：staleTime 30 秒，删除前强制刷新

**并发限制**:
- 最多 2 个模型同时下载
- 其他下载任务排队等待
- 避免 Ollama API 过载

**缓存策略**:
- 下载成功后失效 `['local-models']`
- 删除成功后失效 `['local-models']`, `['disk-space']`, `['model-usage-stats']`

---

## 7. 后续阶段

### Phase 1: 设计（下一步）

1. 生成 `data-model.md`：定义 LocalLLMModel、DownloadTask、ModelConfig 实体
2. 生成 `contracts/ollama-api.yaml`：Ollama API 规范（OpenAPI 格式）
3. 生成 `quickstart.md`：开发快速上手指南
4. 更新 Agent Context：运行 `.specify/scripts/bash/update-agent-context.sh claude`

### Phase 2: 任务分解

运行 `/speckit.tasks` 生成详细的开发任务清单。

---

**研究完成时间**: 2025-10-23  
**下一步**: Phase 1 - 设计与契约生成
