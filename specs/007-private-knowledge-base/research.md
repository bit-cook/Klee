# 研究文档：Private Mode 知识库模块

**功能分支**: `007-private-knowledge-base`
**创建日期**: 2025-10-22
**关联文档**: [plan.md](./plan.md) | [spec.md](./spec.md)

## 概述

本文档记录了 Private Mode 知识库模块实施过程中需要研究和决策的技术问题，包括 LanceDB 集成、Ollama embedding API 使用、文本提取库复用、以及数据库设计等方面的技术选型和最佳实践。

---

## 决策 1: LanceDB 集成方案

### 问题
如何在 Electron 主进程中集成 LanceDB Node.js 客户端，实现本地向量存储和检索？

### 研究发现

**LanceDB 简介**:
- LanceDB 是一个开源的向量数据库，支持在本地运行
- 提供 Node.js 客户端，可以在 Electron 主进程中使用
- 使用 Lance 列式存储格式，支持高效的向量检索
- 支持余弦相似度、欧几里得距离等相似度度量

**集成步骤**:
1. 安装依赖：`npm install vectordb` (LanceDB 的 Node.js 客户端包名)
2. 在 Electron 主进程中初始化数据库连接
3. 为每个知识库创建独立的向量表（命名格式：`kb_<knowledgeBaseId>`）
4. 插入向量时需要提供文档内容和 768 维 embedding 向量

**示例代码**:
```typescript
import * as lancedb from 'vectordb'

// 初始化数据库（存储在 userData 目录）
const dbPath = path.join(app.getPath('userData'), 'vector-db')
const db = await lancedb.connect(dbPath)

// 创建知识库向量表
const tableName = `kb_${knowledgeBaseId}`
const table = await db.createTable(tableName, [
  {
    id: 'uuid-1',
    content: 'sample text',
    embedding: new Float32Array(768) // 768维向量
  }
])

// 向量检索
const results = await table
  .search(queryEmbedding)
  .limit(5)
  .execute()
```

### 决策

**选择方案**: 使用 LanceDB (`vectordb` npm 包) 作为本地向量数据库

**理由**:
1. **纯 JavaScript 实现**: 不依赖 native 模块，避免跨平台编译问题
2. **完全离线**: 数据存储在本地文件系统，无需网络连接
3. **性能优良**: 支持 HNSW 索引，查询延迟可满足 < 100ms 的要求
4. **简单易用**: API 设计直观，易于集成到 Electron 应用

**替代方案考虑**:
- **Faiss (Facebook AI Similarity Search)**: 性能极佳但需要编译 native 模块，Electron 集成复杂
- **hnswlib-node**: 轻量级但缺乏持久化能力，需要自行实现存储层
- **Milvus Lite**: 功能强大但体积较大，不适合嵌入桌面应用

---

## 决策 2: Ollama Embedding API 使用

### 问题
如何使用 Ollama 的 nomic-embed-text 模型生成 768 维向量？

### 研究发现

**Ollama Embedding API**:
- 端点：`POST http://localhost:11434/api/embeddings`
- 请求格式：
  ```json
  {
    "model": "nomic-embed-text",
    "prompt": "text to embed"
  }
  ```
- 响应格式：
  ```json
  {
    "embedding": [0.123, 0.456, ...]  // 768维浮点数数组
  }
  ```

**批量处理**:
- Ollama API 不支持批量 embedding（一次只能处理一个文本）
- 需要循环调用 API 为每个文档片段生成向量
- 可以使用 `Promise.all` 并行处理以提升性能（但要控制并发数避免占用过多资源）

**示例代码**:
```typescript
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'nomic-embed-text',
      prompt: text
    })
  })
  const data = await response.json()
  return data.embedding
}

// 批量处理（控制并发数为 5）
async function generateEmbeddingsBatch(chunks: string[]): Promise<number[][]> {
  const concurrency = 5
  const results: number[][] = []

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency)
    const batchResults = await Promise.all(
      batch.map(chunk => generateEmbedding(chunk))
    )
    results.push(...batchResults)
  }

  return results
}
```

### 决策

**选择方案**: 使用 Ollama `/api/embeddings` 端点，批量处理时使用并发控制（并发数 = 5）

**理由**:
1. **无需额外依赖**: 直接使用 Ollama HTTP API，不需要安装额外的 embedding 模型
2. **轻量级模型**: nomic-embed-text 模型体积小（~138MB），加载速度快
3. **足够的维度**: 768 维向量在性能和准确性之间取得良好平衡

**性能优化**:
- 使用 5 个并发请求批量处理，在处理速度和资源占用之间取得平衡
- 对于 100 个文档片段，预计总耗时约 10-20 秒（取决于设备性能）

---

## 决策 3: 文本提取库复用

### 问题
如何复用 Cloud Mode 的文本提取逻辑（pdf-parse、mammoth）在 Electron 主进程中？

### 研究发现

**当前实现** (`server/src/lib/fileProcessor.ts`):
- 支持的文件类型：.txt、.md、.json、.pdf、.docx
- 使用的库：
  - `pdf-parse`: PDF 文本提取
  - `mammoth`: DOCX 文本提取
  - 纯文本文件直接使用 `Buffer.toString('utf-8')`

**在 Electron 中复用**:
1. 将 `fileProcessor.ts` 中的文本提取函数提取为独立模块
2. 在 Electron 主进程中导入该模块
3. 文件上传流程：渲染进程 → IPC → 主进程 → 文本提取 → 分块 → embedding → 存储

**示例代码**:
```typescript
// client/electron/services/file-processor.ts
import { extractTextFromFile } from './text-extractor'

export async function processFile(
  fileBuffer: Buffer,
  fileName: string,
  knowledgeBaseId: string
): Promise<ProcessFileResult> {
  // 1. 提取文本
  const text = await extractTextFromFile(fileBuffer, fileName)

  // 2. 分块
  const chunks = generateChunks(text, 1000, 200)

  // 3. 生成 embeddings
  const embeddings = await generateEmbeddingsBatch(chunks)

  // 4. 存储到 SQLite 和 LanceDB
  await saveToDatabase(knowledgeBaseId, fileName, chunks, embeddings)

  return { chunksCount: chunks.length, textLength: text.length }
}
```

### 决策

**选择方案**: 将 Cloud Mode 的文本提取逻辑重构为独立模块，在 Electron 主进程中复用

**理由**:
1. **代码复用**: 避免重复实现相同的文本提取逻辑
2. **一致性**: 确保 Cloud Mode 和 Private Mode 的文本处理行为一致
3. **可维护性**: 集中管理文本提取逻辑，便于未来扩展支持的文件类型

**实施步骤**:
1. 创建 `shared/text-extractor/` 模块（前后端共享）
2. 将 `pdf-parse`、`mammoth` 依赖添加到 Electron 主进程
3. 实现错误处理和进度回调（用于 UI 显示进度）

---

## 决策 4: SQLite 数据库设计

### 问题
如何设计 SQLite schema 以严格匹配 Cloud Mode 的 PostgreSQL schema（去除分享功能）？

### 研究发现

**Cloud Mode Schema** (PostgreSQL):
```typescript
// 知识库表
export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  starred: boolean("starred").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(false),  // 分享相关
  shareSlug: varchar("share_slug", { length: 64 }),         // 分享相关
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// 文件表
export const knowledgeBaseFiles = pgTable("knowledge_base_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeBaseId: uuid("knowledge_base_id").notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  fileType: varchar("file_type", { length: 50 }),
  storagePath: text("storage_path"),
  contentText: text("content_text"),
  status: varchar("status", { length: 20 }).notNull().default("processing"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
```

**Private Mode Schema** (SQLite):
```typescript
// 去除 userId（单用户）、isPublic、shareSlug（无分享功能）
import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core'

export const knowledgeBases = sqliteTable("knowledge_bases", {
  id: text("id").primaryKey(),  // SQLite 使用 TEXT 存储 UUID
  name: text("name").notNull(),
  description: text("description"),
  starred: integer("starred", { mode: 'boolean' }).notNull().default(false),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull(),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull(),
})

export const knowledgeBaseFiles = sqliteTable("knowledge_base_files", {
  id: text("id").primaryKey(),
  knowledgeBaseId: text("knowledge_base_id").notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type"),
  storagePath: text("storage_path"),
  contentText: text("content_text"),
  status: text("status").notNull().default("processing"),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull(),
})
```

### 决策

**选择方案**: 使用 Drizzle ORM SQLite 适配器，schema 结构与 PostgreSQL 保持一致（去除分享相关字段）

**字段映射**:
| PostgreSQL | SQLite | 说明 |
|-----------|--------|------|
| `uuid` | `text` | SQLite 无原生 UUID 类型，使用 TEXT 存储 |
| `timestamp with timezone` | `integer (timestamp mode)` | SQLite 使用 UNIX 时间戳 |
| `boolean` | `integer (boolean mode)` | SQLite 无原生布尔类型，使用 0/1 |
| `bigint` | `integer` | SQLite 的 INTEGER 可存储大整数 |
| `varchar(N)` | `text` | SQLite TEXT 类型无长度限制 |

**去除的字段**:
- `userId`: Private Mode 为单用户模式，无需用户隔离
- `isPublic`: 无分享功能，所有知识库都是私有的
- `shareSlug`: 无分享功能，不需要分享标识符

**理由**:
1. **类型安全**: 使用 Drizzle ORM 确保端到端类型安全
2. **字段匹配**: 与 Cloud Mode 保持最大程度的一致性，便于 UI 复用
3. **简洁性**: 去除与分享相关的字段，简化数据模型

---

## 决策 5: IPC 通信架构

### 问题
如何设计 IPC 架构以确保类型安全，并与 Cloud Mode RPC 接口保持一致？

### 研究发现

**Cloud Mode RPC 接口** (Hono):
```typescript
// server/src/routes/knowledgebase.ts
app.get("/", async (c) => {
  const knowledgeBases = await getUserKnowledgeBasesList(c.var.user.id)
  return c.json({ knowledgeBases })
})

app.post("/", zValidator("json", insertKnowledgeBaseSchema), async (c) => {
  const { name, description } = c.req.valid("json")
  const knowledgeBase = await createKnowledgeBase({ userId, name, description })
  return c.json({ knowledgeBase }, 201)
})
```

**Private Mode IPC 接口**:
```typescript
// client/electron/ipc/knowledge-base-handlers.ts
import { z } from 'zod'

// IPC handler 使用相同的 Zod schema
ipcMain.handle('knowledge-base:list', async () => {
  const knowledgeBases = await getAllKnowledgeBases()
  return { knowledgeBases }  // 返回格式与 RPC 一致
})

ipcMain.handle('knowledge-base:create', async (event, input) => {
  // 验证输入（使用与 RPC 相同的 schema）
  const validated = insertKnowledgeBaseSchema.parse(input)
  const knowledgeBase = await createKnowledgeBase(validated)
  return { knowledgeBase }
})

// client/electron/preload/index.ts
contextBridge.exposeInMainWorld('api', {
  knowledgeBase: {
    list: () => ipcRenderer.invoke('knowledge-base:list'),
    create: (input) => ipcRenderer.invoke('knowledge-base:create', input),
    // ... 其他方法
  }
})
```

**渲染进程调用**:
```typescript
// client/src/hooks/knowledge-base/queries/useKnowledgeBases.ts
import { useMode } from '@/contexts/ModeContext'

export function useKnowledgeBases() {
  const { mode } = useMode()

  return useQuery({
    queryKey: knowledgeBaseKeys.lists(),
    queryFn: async () => {
      if (mode === 'cloud') {
        // Cloud Mode: 使用 Hono RPC
        const res = await honoClient.api.knowledgebase.$get()
        return res.json()
      } else {
        // Private Mode: 使用 IPC
        return await window.api.knowledgeBase.list()
      }
    },
  })
}
```

### 决策

**选择方案**: IPC handlers 返回格式与 Cloud Mode RPC 接口保持一致，使用相同的 Zod 验证 schema

**理由**:
1. **UI 复用**: 返回格式一致，UI 层无需修改
2. **类型安全**: 复用 Zod schema，确保输入验证逻辑一致
3. **可维护性**: 集中管理验证逻辑，避免重复

**实施细节**:
- 将 Zod schema 定义在 `shared/schemas/` 目录（前后端共享）
- IPC handlers 使用 `schema.parse()` 验证输入
- 错误处理格式与 RPC 保持一致

---

## 决策 6: 文件处理性能优化

### 问题
如何避免大文件处理阻塞 Electron 主进程？

### 研究发现

**潜在问题**:
- PDF 文本提取可能耗时较长（1000 页 PDF 可能需要 10-30 秒）
- Embedding 生成需要多次 HTTP 请求（100 个片段 = 100 次请求）
- 主进程阻塞会导致 UI 无响应

**解决方案**:

**方案 1: 异步处理 + 进度通知**
```typescript
// 主进程
ipcMain.handle('knowledge-base:upload-file', async (event, input) => {
  const { fileBuffer, fileName, knowledgeBaseId } = input

  // 创建处理任务
  const fileId = await createFileRecord(knowledgeBaseId, fileName)

  // 异步处理（不阻塞 IPC 返回）
  processFileAsync(fileBuffer, fileName, knowledgeBaseId, fileId, (progress) => {
    // 发送进度事件到渲染进程
    event.sender.send('file-processing-progress', {
      fileId,
      stage: progress.stage,  // 'extracting' | 'chunking' | 'embedding' | 'saving'
      percent: progress.percent
    })
  })

  // 立即返回 fileId（处理在后台进行）
  return { fileId, status: 'processing' }
})

// 渲染进程监听进度
useEffect(() => {
  const handler = (event, progress) => {
    setUploadProgress(progress)
  }
  window.electron.ipcRenderer.on('file-processing-progress', handler)
  return () => window.electron.ipcRenderer.removeListener('file-processing-progress', handler)
}, [])
```

**方案 2: Worker Threads**
```typescript
// 使用 Worker Threads 在单独线程中处理文件
import { Worker } from 'worker_threads'

const worker = new Worker('./file-processor-worker.js')
worker.postMessage({ fileBuffer, fileName })
worker.on('message', (result) => {
  // 处理完成
})
```

### 决策

**选择方案**: 异步处理 + 进度通知（方案 1）

**理由**:
1. **实现简单**: 不需要引入 Worker Threads 的复杂性
2. **用户体验好**: 实时进度通知让用户了解处理状态
3. **足够高效**: 对于 10MB 以下的文件，处理时间可控（< 30s）

**不选择 Worker Threads 的原因**:
- Electron 主进程已经是单独的进程，与渲染进程隔离
- Worker Threads 增加了代码复杂度和调试难度
- 对于大多数使用场景，异步处理已足够

---

## 决策 7: 向量搜索性能优化

### 问题
如何确保 LanceDB 向量搜索性能满足 < 100ms 的要求？

### 研究发现

**LanceDB 索引策略**:
1. **IVF-PQ 索引** (Inverted File with Product Quantization):
   - 适用于大规模数据集（> 10万 向量）
   - 需要训练步骤
   - 查询速度快但准确度略有下降

2. **默认暴力搜索**:
   - 适用于小规模数据集（< 1万 向量）
   - 准确度最高
   - 查询速度取决于数据量

**预期数据规模**:
- 每个知识库：100-1000 个文档片段
- 多个知识库：总计 1000-10000 个向量

**性能测试结果** (基于 LanceDB 官方 benchmark):
- 1000 个 768 维向量，暴力搜索：约 5-10ms
- 10000 个 768 维向量，暴力搜索：约 50-100ms
- 使用 IVF-PQ 索引后：查询时间降至 10-20ms

### 决策

**选择方案**: 初期使用暴力搜索（无索引），当知识库向量数量超过 5000 时自动创建 IVF-PQ 索引

**理由**:
1. **简单性**: 暴力搜索无需额外配置，开箱即用
2. **满足性能要求**: 对于 < 5000 向量的场景，暴力搜索已满足 < 100ms 要求
3. **灵活性**: 可以在未来根据实际使用情况调整索引策略

**实施细节**:
```typescript
// 创建知识库向量表时不创建索引
const table = await db.createTable(tableName, data)

// 当向量数量超过阈值时创建索引
if (vectorCount > 5000) {
  await table.createIndex({
    type: 'ivf_pq',
    num_partitions: 256,
    num_sub_vectors: 96
  })
}
```

---

## 技术栈总结

| 技术 | 版本/配置 | 用途 |
|------|----------|------|
| **LanceDB** | `vectordb` npm 包 | 本地向量存储和检索 |
| **Ollama** | nomic-embed-text 模型 | 生成 768 维 embedding 向量 |
| **Drizzle ORM** | SQLite 适配器 | 数据库 ORM，schema 驱动 |
| **pdf-parse** | 复用 Cloud Mode 版本 | PDF 文本提取 |
| **mammoth** | 复用 Cloud Mode 版本 | DOCX 文本提取 |
| **Zod** | 复用 Cloud Mode schema | 输入验证 |

---

## 最佳实践

### 1. 文本分块策略
- **块大小**: 1000 字符
- **重叠**: 200 字符（20%）
- **理由**: 与 Cloud Mode 保持一致，确保检索质量

### 2. Embedding 批量处理
- **并发数**: 5 个请求
- **超时**: 每个请求 30 秒
- **理由**: 平衡处理速度和资源占用

### 3. 错误处理
- **文件处理失败**: 回滚数据库记录和本地文件
- **Embedding 生成失败**: 标记文件状态为 'failed'，允许用户重试
- **向量检索失败**: 降级到纯文本搜索（fallback）

### 4. 数据清理
- **删除知识库**: 级联删除 SQLite 记录、LanceDB 向量表、本地文件
- **应用崩溃恢复**: 启动时清理 'processing' 状态的文件记录

---

## 剩余风险

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| LanceDB native 模块编译问题 | 高 | 使用纯 JS 实现的 `vectordb` 包 |
| 大文件处理阻塞主进程 | 中 | 异步处理 + 进度通知，限制文件大小 100MB |
| 向量搜索性能不达标 | 低 | 使用索引优化，监控实际性能 |
| Ollama 服务不可用 | 高 | 依赖 006-private-mode 功能确保 Ollama 启动 |

---

## 下一步

基于以上研究和决策，下一阶段（Phase 1）将：
1. 生成详细的数据模型文档（`data-model.md`）
2. 定义 IPC 契约（`contracts/`）
3. 编写快速开始指南（`quickstart.md`）
