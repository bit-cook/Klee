# Data Model: Marketplace Private Mode

**Date**: 2025-10-23
**Feature**: Marketplace Private Mode - 本地开源大模型管理
**Status**: Phase 1 Design

## 概述

本文档定义 Marketplace Private Mode 功能的数据模型，包括模型元数据、下载任务和配置文件结构。由于本功能为纯前端实现（直接调用 Ollama API），无需数据库 schema，所有数据模型为 TypeScript 类型定义。

---

## 1. 核心实体

### 1.1 LocalLLMModel - 本地大模型元数据

**用途**: 描述一个可下载或已安装的 Ollama 开源大模型的完整信息。

**位置**: `client/src/renderer/src/config/models.ts`

\`\`\`typescript
/**
 * 本地开源大模型配置
 * 
 * 用于 marketplace 中 "Local LLMs" 标签页展示
 */
export interface LocalLLMModel {
  /** 显示名称（用户可见） */
  name: string

  /** Ollama 模型 ID（如 'llama3:8b'） */
  model: string

  /** 提供者（如 'Meta', 'Mistral AI'） */
  provider: string

  /** 模型大小（GB） */
  size: number

  /** GPU 最低要求（如 '4GB VRAM', 'None'） */
  minGPU: string

  /** 最后更新日期（ISO 8601 格式） */
  updatedAt: string

  /** 是否已弃用 */
  deprecated?: boolean

  /** 模型描述（可选） */
  description?: string

  /** 推荐标签（可选，如 'Recommended', 'Popular'） */
  tags?: string[]
}

/**
 * 本地开源大模型列表配置
 * 
 * 只有在此列表中的模型才会在 marketplace 中显示
 */
export const localLLMModels: LocalLLMModel[] = [
  {
    name: 'Llama 3.2 1B',
    model: 'llama3.2:1b',
    provider: 'Meta',
    size: 1.3,
    minGPU: 'None',
    updatedAt: '2024-09-25',
    description: 'Ultra-lightweight, Meta official, best compatibility',
    tags: ['Recommended', 'Fastest'],
  },
  {
    name: 'Llama 3.2 3B',
    model: 'llama3.2:3b',
    provider: 'Meta',
    size: 2.0,
    minGPU: 'None',
    updatedAt: '2024-09-25',
    description: 'Lightweight, good balance of speed and quality',
    tags: ['Recommended'],
  },
  {
    name: 'Llama 3 8B',
    model: 'llama3:8b',
    provider: 'Meta',
    size: 4.7,
    minGPU: 'None',
    updatedAt: '2024-05-15',
    description: 'Fast and versatile, great for most tasks',
    tags: ['Popular'],
  },
  {
    name: 'Qwen 2.5 0.5B',
    model: 'qwen2.5:0.5b',
    provider: 'Alibaba',
    size: 0.4,
    minGPU: 'None',
    updatedAt: '2024-11-20',
    description: 'Ultra-lightweight, extremely fast, great for quick responses',
    tags: ['Fastest'],
  },
  {
    name: 'Mistral 7B',
    model: 'mistral:7b',
    provider: 'Mistral AI',
    size: 4.1,
    minGPU: 'None',
    updatedAt: '2024-03-15',
    description: 'Efficient and fast, good balance',
  },
  {
    name: 'Gemma 2B',
    model: 'gemma:2b',
    provider: 'Google',
    size: 1.7,
    minGPU: 'None',
    updatedAt: '2024-02-21',
    description: 'Lightweight model for quick responses',
  },
  {
    name: 'Gemma 7B',
    model: 'gemma:7b',
    provider: 'Google',
    size: 5.0,
    minGPU: '4GB VRAM',
    updatedAt: '2024-02-21',
    description: 'Balanced performance and speed',
  },
  {
    name: 'CodeLlama 7B',
    model: 'codellama:7b',
    provider: 'Meta',
    size: 3.8,
    minGPU: 'None',
    updatedAt: '2023-08-24',
    description: 'Optimized for coding tasks',
    tags: ['Coding'],
  },
  {
    name: 'Phi-3 Mini',
    model: 'phi3:mini',
    provider: 'Microsoft',
    size: 2.3,
    minGPU: 'None',
    updatedAt: '2024-04-23',
    description: 'Smallest model, very fast',
  },
  {
    name: 'Nomic Embed Text',
    model: 'nomic-embed-text',
    provider: 'Nomic AI',
    size: 0.3,
    minGPU: 'None',
    updatedAt: '2024-02-01',
    description: 'Embedding model for RAG',
    tags: ['Embedding'],
  },
]
\`\`\`

**扩展字段（运行时计算）**:
\`\`\`typescript
/**
 * 运行时扩展的模型信息
 * 
 * 结合 Ollama API 返回的安装状态和使用统计
 */
export interface LocalLLMModelWithStatus extends LocalLLMModel {
  /** 下载状态 */
  downloadStatus: 'available' | 'downloading' | 'installed'

  /** 是否被聊天会话使用 */
  inUse: boolean

  /** 使用次数（被多少个会话使用） */
  usageCount: number

  /** 实际安装大小（GB，来自 Ollama API） */
  installedSize?: number

  /** 安装日期（来自 Ollama API） */
  installedAt?: string
}
\`\`\`

---

### 1.2 DownloadTask - 模型下载任务

**用途**: 追踪单个模型的下载状态和进度。

**位置**: `client/src/renderer/src/hooks/ollama-models/mutations/useDownloadModel.ts`

\`\`\`typescript
/**
 * Ollama 下载进度
 * 
 * 来自 Ollama API `/api/pull` 的 NDJSON 响应
 */
export interface OllamaDownloadProgress {
  /** 当前状态 */
  status: 'pulling manifest' | 'downloading digestname' | 
          'verifying sha256 digest' | 'writing manifest' | 
          'removing any unused layers' | 'success'

  /** 当前下载的 blob digest（可选） */
  digest?: string

  /** 总字节数 */
  total?: number

  /** 已下载字节数 */
  completed?: number

  /** 进度百分比（0-100） */
  percent: number
}

/**
 * 下载任务状态
 */
export type DownloadStatus = 
  | 'idle'        // 未开始
  | 'queued'      // 队列中等待
  | 'downloading' // 下载中
  | 'paused'      // 已暂停（实际上是已取消，UI 显示为暂停）
  | 'completed'   // 已完成
  | 'error'       // 错误
  | 'cancelled'   // 已取消

/**
 * 下载任务
 */
export interface DownloadTask {
  /** 模型 ID（如 'llama3:8b'） */
  modelId: string

  /** 模型显示名称 */
  modelName: string

  /** 任务状态 */
  status: DownloadStatus

  /** 下载进度（如果正在下载） */
  progress: OllamaDownloadProgress | null

  /** 错误消息（如果失败） */
  error?: string

  /** 队列位置（如果在队列中） */
  queuePosition?: number

  /** 下载速度（bytes/s，计算值） */
  speed?: number

  /** 预计剩余时间（秒，计算值） */
  estimatedTimeRemaining?: number

  /** 任务创建时间 */
  createdAt: Date

  /** 最后更新时间 */
  updatedAt: Date
}
\`\`\`

**速度和剩余时间计算**:
\`\`\`typescript
/**
 * 计算下载速度和剩余时间
 */
interface SpeedCalculator {
  samples: Array<{ timestamp: number; completed: number }>
  maxSamples: number
}

function calculateSpeed(calculator: SpeedCalculator): {
  speed: number // bytes/s
  estimatedTimeRemaining: number // seconds
} {
  const { samples } = calculator
  
  if (samples.length < 2) {
    return { speed: 0, estimatedTimeRemaining: 0 }
  }
  
  // 使用最近 10 个样本计算平均速度
  const recent = samples.slice(-10)
  const first = recent[0]
  const last = recent[recent.length - 1]
  
  const timeDelta = (last.timestamp - first.timestamp) / 1000 // 秒
  const bytesDelta = last.completed - first.completed
  
  const speed = timeDelta > 0 ? bytesDelta / timeDelta : 0
  
  // 计算剩余时间
  const remaining = last.total - last.completed
  const estimatedTimeRemaining = speed > 0 ? remaining / speed : 0
  
  return { speed, estimatedTimeRemaining }
}
\`\`\`

---

### 1.3 ModelConfig - 统一模型配置

**用途**: 统一管理本地模型和云端模型配置。

**位置**: `client/src/renderer/src/config/models.ts`

\`\`\`typescript
/**
 * 统一模型配置
 * 
 * 包含本地开源模型和云端模型的配置
 */
export interface ModelConfig {
  /** 配置文件版本（用于后续迁移） */
  version: string

  /** 本地开源模型列表 */
  localModels: LocalLLMModel[]

  /** 云端模���列表 */
  cloudModels: Array<{
    name: string
    value: string
  }>
}

/**
 * 导出统一配置
 */
export const modelConfig: ModelConfig = {
  version: '1.0.0',
  localModels: localLLMModels,
  cloudModels: llmModels, // 现有的云端模型配置
}
\`\`\`

---

## 2. 辅助类型

### 2.1 磁盘空间信息

**用途**: 显示 Ollama 模型目录所在磁盘的空间信息。

**位置**: `client/src/main/local/services/disk-space-manager.ts`

\`\`\`typescript
/**
 * 磁盘空间信息
 */
export interface DiskSpaceInfo {
  /** 总空间（字节） */
  totalBytes: number

  /** 可用空间（字节，考虑权限） */
  availableBytes: number

  /** 空闲空间（字节） */
  freeBytes: number

  /** 已用空间（字节） */
  usedBytes: number

  /** 使用百分比（0-100） */
  percentUsed: number

  /** 格式化的总空间（如 "500 GB"） */
  totalFormatted: string

  /** 格式化的可用空间 */
  availableFormatted: string

  /** 格式化的空闲空间 */
  freeFormatted: string

  /** 格式化的已用空间 */
  usedFormatted: string
}
\`\`\`

### 2.2 模型使用统计

**用途**: 追踪哪些聊天会话正在使用哪些模型。

**位置**: `client/src/main/local/db/queries/models.ts`

\`\`\`typescript
/**
 * 使用特定模型的聊天会话信息
 */
export interface ChatSessionUsingModel {
  /** 会话 ID */
  id: string

  /** 会话标题 */
  title: string

  /** 会话创建时间 */
  createdAt: Date
}

/**
 * 模型使用统计
 */
export type ModelUsageStats = Record<string, number> // { 'llama3:8b': 3, 'mistral:7b': 1 }
\`\`\`

### 2.3 模型删除结果

**用途**: 描述模型删除操作的结果。

**位置**: `client/src/main/local/services/ollama-model-manager.ts`

\`\`\`typescript
/**
 * 模型删除失败原因
 */
export type ModelDeleteFailureReason = 
  | 'in_use'        // 被聊天会话使用
  | 'not_found'     // 模型不存在
  | 'ollama_error'  // Ollama API 错误
  | 'unknown'       // 未知错误

/**
 * 模型删除结果
 */
export interface ModelDeleteResult {
  /** 是否成功 */
  success: boolean

  /** 错误消息（如果失败） */
  error?: string

  /** 失败原因（如果失败） */
  reason?: ModelDeleteFailureReason

  /** 使用该模型的会话列表（如果失败原因是 in_use） */
  sessionsUsingModel?: ChatSessionUsingModel[]
}
\`\`\`

---

## 3. Ollama API 响应类型

### 3.1 `/api/tags` - 模型列表响应

\`\`\`typescript
/**
 * Ollama 已安装模型信息
 */
export interface OllamaModel {
  /** 模型名称（如 'llama3:8b'） */
  name: string

  /** 模型 ID（通常与 name 相同） */
  model: string

  /** 最后修改时间（ISO 8601） */
  modified_at: string

  /** 模型大小（字节） */
  size: number

  /** 模型 digest（SHA256） */
  digest: string

  /** 模型详细信息 */
  details: {
    parent_model: string
    format: string
    family: string
    families: string[]
    parameter_size: string
    quantization_level: string
  }
}

/**
 * `/api/tags` 响应
 */
export interface OllamaTagsResponse {
  models: OllamaModel[]
}
\`\`\`

### 3.2 `/api/pull` - 下载进度响应（NDJSON）

\`\`\`typescript
/**
 * Ollama Pull 进度事件
 * 
 * 每行一个 JSON 对象（NDJSON 格式）
 */
export interface OllamaPullProgressEvent {
  status: string
  digest?: string
  total?: number
  completed?: number
}
\`\`\`

### 3.3 `/api/delete` - 删除响应

\`\`\`typescript
/**
 * `/api/delete` 成功响应
 */
export interface OllamaDeleteResponse {
  // 空对象
}

/**
 * `/api/delete` 错误响应
 */
export interface OllamaDeleteErrorResponse {
  error: string // 如 "model 'llama3:8b' is in use"
}
\`\`\`

---

## 4. 数据流图

### 4.1 模型列表加载

\`\`\`
配置文件 (models.ts)
    ↓
localLLMModels[]
    ↓
Ollama API /api/tags
    ↓
installedModels[]
    ↓
合并状态
    ↓
LocalLLMModelWithStatus[]
    ↓
Marketplace UI
\`\`\`

### 4.2 模型下载

\`\`\`
用户点击 Download
    ↓
DownloadTask (status: queued)
    ↓
p-queue 调度
    ↓
DownloadTask (status: downloading)
    ↓
Ollama API /api/pull (NDJSON 流)
    ↓
OllamaDownloadProgress 更新
    ↓
DownloadTask (progress 更新)
    ↓
DownloadTask (status: completed)
    ↓
刷新模型列表
\`\`\`

### 4.3 模型删除

\`\`\`
用户点击 Delete
    ↓
查询 SQLite (isModelInUse)
    ↓
如果被使用 → 显示警告对话框
    ↓
如果未使用 → 用户确认
    ↓
Ollama API DELETE /api/delete
    ↓
ModelDeleteResult
    ↓
刷新模型列表 + 磁盘空间
\`\`\`

---

## 5. 数据持久化

### 5.1 配置文件（静态）

**文件**: `client/src/renderer/src/config/models.ts`
**类型**: TypeScript 对象（编译时）
**更新**: 手动编辑代码，重新构建应用

### 5.2 下载任务（运行时）

**存储**: React State（内存）
**生命周期**: 应用运行期间
**持久化**: ❌ 不持久化（应用重启后清空）

**未来扩展**: 可选地持久化到 localStorage，实现断点续传提示。

### 5.3 模型使用统计（数据库）

**数据库**: SQLite（Private Mode）
**表**: `local_chat_sessions`
**字段**: `model` (text)
**查询**: 按 `model` 聚合统计

---

## 6. 类型安全链

### 6.1 配置 → UI

\`\`\`typescript
// 配置文件定义
export const localLLMModels: LocalLLMModel[] = [...]

// Hook 中使用
const { data: models } = useAvailableModels()
// models 类型: LocalLLMModelWithStatus[]

// UI 组件中使用
<LocalLLMCard model={model} />
// model 参数类型: LocalLLMModelWithStatus
\`\`\`

### 6.2 Ollama API → 类型

\`\`\`typescript
// API 响应
const response = await fetch('http://localhost:11434/api/tags')
const data: OllamaTagsResponse = await response.json()

// 转换为应用类型
const installedModels: Set<string> = new Set(
  data.models.map(m => m.name)
)
\`\`\`

### 6.3 数据库 → 类型

\`\`\`typescript
// Drizzle 查询
const sessions = await db
  .select({
    id: localChatSessions.id,
    title: localChatSessions.title,
    createdAt: localChatSessions.createdAt,
  })
  .from(localChatSessions)
  .where(eq(localChatSessions.model, modelId))

// sessions 类型自动推断: ChatSessionUsingModel[]
\`\`\`

---

## 7. 验证规则

### 7.1 模型配置验证

\`\`\`typescript
/**
 * 验证模型配置是否合法
 */
export function validateModelConfig(model: LocalLLMModel): string | null {
  if (!model.name || model.name.trim().length === 0) {
    return 'Model name is required'
  }
  
  if (!model.model || !model.model.match(/^[a-z0-9.-]+:[a-z0-9]+$/)) {
    return 'Invalid model ID format (expected: "name:version")'
  }
  
  if (model.size <= 0) {
    return 'Model size must be positive'
  }
  
  if (!model.provider || model.provider.trim().length === 0) {
    return 'Provider is required'
  }
  
  // 验证日期格式
  if (!model.updatedAt.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return 'Invalid date format (expected: YYYY-MM-DD)'
  }
  
  return null // 验证通过
}

// 在应用启动时验证所有配置
localLLMModels.forEach(model => {
  const error = validateModelConfig(model)
  if (error) {
    console.error(\`[Model Config] Invalid model \${model.model}: \${error}\`)
  }
})
\`\`\`

### 7.2 下载前验证

\`\`\`typescript
/**
 * 验证是否可以下载模型
 */
export function canDownloadModel(
  model: LocalLLMModel,
  diskSpace: DiskSpaceInfo,
  activeDownloads: number
): { canDownload: boolean; reason?: string } {
  // 检查磁盘空间（留 1GB 缓冲）
  const requiredSpace = model.size * 1024 * 1024 * 1024 + 1024 * 1024 * 1024
  if (diskSpace.availableBytes < requiredSpace) {
    return {
      canDownload: false,
      reason: \`Insufficient disk space. Required: \${formatBytes(requiredSpace)}\`,
    }
  }
  
  // 检查并发限制
  if (activeDownloads >= 2) {
    return {
      canDownload: false,
      reason: 'Maximum 2 concurrent downloads. Please wait for current downloads to complete.',
    }
  }
  
  return { canDownload: true }
}
\`\`\`

---

**数据模型版本**: 1.0.0  
**下一步**: 生成 API 契约（contracts/ollama-api.yaml）
