# IPC API 契约：Private Mode 知识库模块

**功能分支**: `007-private-knowledge-base`
**创建日期**: 2025-10-22
**关联文档**: [plan.md](../plan.md) | [data-model.md](../data-model.md)

## 概述

本文档定义 Private Mode 知识库模块的 Electron IPC API 契约，包括所有 IPC 通道、请求/响应格式、以及与 Cloud Mode RPC 接口的对应关系。

**设计原则**:
1. **类型安全**: 所有 IPC handlers 使用 Zod schema 验证输入
2. **返回格式一致**: 与 Cloud Mode RPC 接口保持一致，便于 UI 复用
3. **错误处理**: 统一的错误响应格式
4. **性能考虑**: 文件上传使用异步处理 + 进度通知

---

## IPC 通道列表

| 通道名称 | 描述 | 对应 Cloud Mode 端点 |
|---------|------|---------------------|
| `knowledge-base:list` | 获取所有知识库列表 | `GET /api/knowledgebase` |
| `knowledge-base:create` | 创建知识库 | `POST /api/knowledgebase` |
| `knowledge-base:get` | 获取知识库详情和文件列表 | `GET /api/knowledgebase/:id` |
| `knowledge-base:update` | 更新知识库信息 | `PUT /api/knowledgebase/:id` |
| `knowledge-base:delete` | 删除知识库 | `DELETE /api/knowledgebase/:id` |
| `knowledge-base:toggle-star` | 切换星标状态 | `PUT /api/knowledgebase/:id` (starred) |
| `knowledge-base:upload-file` | 上传文件到知识库 | `POST /api/knowledgebase/:id/files` |
| `knowledge-base:delete-file` | 删除知识库中的文件 | `DELETE /api/knowledgebase/:id/files/:fileId` |
| `knowledge-base:search` | 向量相似度搜索 | *(内部使用，嵌入到聊天流程)* |

---

## API 详细定义

### 1. knowledge-base:list

**描述**: 获取所有知识库列表

**请求参数**: 无

**响应格式**:
```typescript
{
  knowledgeBases: KnowledgeBase[]
}

interface KnowledgeBase {
  id: string
  name: string
  description: string | null
  starred: boolean
  createdAt: Date
  updatedAt: Date
}
```

**示例响应**:
```json
{
  "knowledgeBases": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "AI 研究论文集",
      "description": "收集 2023-2024 年的 AI 相关论文",
      "starred": true,
      "createdAt": "2024-10-22T10:00:00.000Z",
      "updatedAt": "2024-10-22T10:00:00.000Z"
    }
  ]
}
```

**Cloud Mode 对应**:
```typescript
// Cloud Mode RPC
const res = await honoClient.api.knowledgebase.$get()
const data = await res.json()  // { knowledgeBases: [...] }
```

**实现示例**:
```typescript
// Electron 主进程
ipcMain.handle('knowledge-base:list', async () => {
  const knowledgeBases = await db.select().from(knowledgeBasesTable)
  return { knowledgeBases }
})

// 渲染进程调用
const { knowledgeBases } = await window.api.knowledgeBase.list()
```

---

### 2. knowledge-base:create

**描述**: 创建新的知识库

**请求参数**:
```typescript
{
  name: string          // 必填，1-200 字符
  description?: string  // 可选，最大 1000 字符
}
```

**Zod 验证 Schema**:
```typescript
const createKnowledgeBaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name too long"),
  description: z.string().max(1000, "Description too long").optional(),
})
```

**响应格式**:
```typescript
{
  knowledgeBase: KnowledgeBase
}
```

**示例请求**:
```json
{
  "name": "AI 研究论文集",
  "description": "收集 2023-2024 年的 AI 相关论文"
}
```

**示例响应**:
```json
{
  "knowledgeBase": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "AI 研究论文集",
    "description": "收集 2023-2024 年的 AI 相关论文",
    "starred": false,
    "createdAt": "2024-10-22T10:00:00.000Z",
    "updatedAt": "2024-10-22T10:00:00.000Z"
  }
}
```

**错误响应**:
```typescript
{
  error: string  // 错误消息，如 "Name is required"
}
```

**实现示例**:
```typescript
// Electron 主进程
ipcMain.handle('knowledge-base:create', async (event, input) => {
  // 验证输入
  const validated = createKnowledgeBaseSchema.parse(input)

  // 创建知识库
  const [knowledgeBase] = await db.insert(knowledgeBasesTable)
    .values({
      id: crypto.randomUUID(),
      name: validated.name,
      description: validated.description,
      starred: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  // 创建 LanceDB 向量表
  await vectorDb.createTable(`kb_${knowledgeBase.id}`, [])

  return { knowledgeBase }
})
```

---

### 3. knowledge-base:get

**描述**: 获取知识库详情和文件列表

**请求参数**:
```typescript
{
  id: string  // 知识库 ID (UUID)
}
```

**响应格式**:
```typescript
{
  knowledgeBase: KnowledgeBase
  files: KnowledgeBaseFile[]
}

interface KnowledgeBaseFile {
  id: string
  knowledgeBaseId: string
  fileName: string
  fileSize: number
  fileType: string | null
  storagePath: string | null
  status: 'processing' | 'completed' | 'failed'
  createdAt: Date
}
```

**示例响应**:
```json
{
  "knowledgeBase": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "AI 研究论文集",
    "description": "收集 2023-2024 年的 AI 相关论文",
    "starred": true,
    "createdAt": "2024-10-22T10:00:00.000Z",
    "updatedAt": "2024-10-22T10:00:00.000Z"
  },
  "files": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "knowledgeBaseId": "550e8400-e29b-41d4-a716-446655440000",
      "fileName": "attention-is-all-you-need.pdf",
      "fileSize": 2048576,
      "fileType": "application/pdf",
      "storagePath": "documents/550e8400/660e8400-attention-is-all-you-need.pdf",
      "status": "completed",
      "createdAt": "2024-10-22T10:05:00.000Z"
    }
  ]
}
```

**错误响应** (404):
```json
{
  "error": "Knowledge base not found"
}
```

---

### 4. knowledge-base:update

**描述**: 更新知识库信息（名称、描述、星标状态）

**请求参数**:
```typescript
{
  id: string            // 必填，知识库 ID
  name?: string         // 可选，1-200 字符
  description?: string  // 可选，最大 1000 字符
  starred?: boolean     // 可选，星标状态
}
```

**Zod 验证 Schema**:
```typescript
const updateKnowledgeBaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  starred: z.boolean().optional(),
})
```

**响应格式**:
```typescript
{
  knowledgeBase: KnowledgeBase
}
```

**示例请求**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "starred": true
}
```

---

### 5. knowledge-base:delete

**描述**: 删除知识库（级联删除所有关联数据）

**请求参数**:
```typescript
{
  id: string  // 知识库 ID (UUID)
}
```

**响应格式**:
```typescript
{
  success: boolean
}
```

**示例响应**:
```json
{
  "success": true
}
```

**错误响应** (404):
```json
{
  "error": "Knowledge base not found"
}
```

**级联删除流程**:
1. 删除 SQLite `knowledge_bases` 记录（自动级联删除 `knowledge_base_files`）
2. 删除 LanceDB 向量表 `kb_{knowledgeBaseId}`
3. 删除本地文件目录 `documents/{knowledgeBaseId}/`

**实现示例**:
```typescript
ipcMain.handle('knowledge-base:delete', async (event, { id }) => {
  try {
    // 1. 删除 SQLite 记录
    const [deleted] = await db.delete(knowledgeBasesTable)
      .where(eq(knowledgeBasesTable.id, id))
      .returning()

    if (!deleted) {
      throw new Error('Knowledge base not found')
    }

    // 2. 删除 LanceDB 向量表
    await vectorDb.dropTable(`kb_${id}`)

    // 3. 删除本地文件
    const documentsPath = path.join(app.getPath('userData'), 'documents')
    await fs.rm(path.join(documentsPath, id), { recursive: true })

    return { success: true }
  } catch (error) {
    return { error: error.message }
  }
})
```

---

### 6. knowledge-base:toggle-star

**描述**: 切换知识库的星标状态

**请求参数**:
```typescript
{
  id: string      // 知识库 ID
  starred: boolean  // 新的星标状态
}
```

**响应格式**:
```typescript
{
  knowledgeBase: KnowledgeBase
}
```

---

### 7. knowledge-base:upload-file

**描述**: 上传文件到知识库并处理（文本提取 → 分块 → embedding → 存储）

**请求参数**:
```typescript
{
  knowledgeBaseId: string  // 知识库 ID
  fileBuffer: ArrayBuffer  // 文件二进制数据
  fileName: string         // 文件名
  fileSize: number         // 文件大小（字节）
}
```

**响应格式** (立即返回):
```typescript
{
  fileId: string         // 文件 ID
  status: 'processing'   // 初始状态
}
```

**进度通知事件**: `file-processing-progress`
```typescript
{
  fileId: string
  stage: 'extracting' | 'chunking' | 'embedding' | 'saving' | 'completed'
  percent: number  // 0-100
  message?: string
}
```

**示例流程**:
```typescript
// 渲染进程上传文件
const fileBuffer = await file.arrayBuffer()
const { fileId } = await window.api.knowledgeBase.uploadFile({
  knowledgeBaseId,
  fileBuffer,
  fileName: file.name,
  fileSize: file.size,
})

// 监听进度
window.electron.ipcRenderer.on('file-processing-progress', (event, progress) => {
  if (progress.fileId === fileId) {
    console.log(`Stage: ${progress.stage}, Progress: ${progress.percent}%`)
    setUploadProgress(progress)
  }
})
```

**实现示例**:
```typescript
ipcMain.handle('knowledge-base:upload-file', async (event, input) => {
  const { knowledgeBaseId, fileBuffer, fileName, fileSize } = input

  // 1. 验证文件
  if (fileSize > 100 * 1024 * 1024) {
    throw new Error('File size exceeds 100MB limit')
  }

  // 2. 创建文件记录
  const fileId = crypto.randomUUID()
  await db.insert(knowledgeBaseFilesTable).values({
    id: fileId,
    knowledgeBaseId,
    fileName,
    fileSize,
    status: 'processing',
    createdAt: new Date(),
  })

  // 3. 异步处理文件（不阻塞返回）
  processFileAsync(event.sender, fileId, knowledgeBaseId, Buffer.from(fileBuffer), fileName)

  // 4. 立即返回
  return { fileId, status: 'processing' }
})

async function processFileAsync(sender, fileId, knowledgeBaseId, fileBuffer, fileName) {
  try {
    // 发送进度: 提取文本
    sender.send('file-processing-progress', {
      fileId,
      stage: 'extracting',
      percent: 10,
    })

    const text = await extractTextFromFile(fileBuffer, fileName)

    // 发送进度: 分块
    sender.send('file-processing-progress', {
      fileId,
      stage: 'chunking',
      percent: 30,
    })

    const chunks = generateChunks(text, 1000, 200)

    // 发送进度: 生成 embeddings
    sender.send('file-processing-progress', {
      fileId,
      stage: 'embedding',
      percent: 50,
    })

    const embeddings = await generateEmbeddingsBatch(chunks, (progress) => {
      sender.send('file-processing-progress', {
        fileId,
        stage: 'embedding',
        percent: 50 + Math.floor(progress * 40),  // 50%-90%
      })
    })

    // 发送进度: 存储
    sender.send('file-processing-progress', {
      fileId,
      stage: 'saving',
      percent: 90,
    })

    // 保存到 LanceDB
    const vectorTable = await vectorDb.openTable(`kb_${knowledgeBaseId}`)
    await vectorTable.add(chunks.map((chunk, i) => ({
      id: crypto.randomUUID(),
      fileId,
      content: chunk,
      embedding: new Float32Array(embeddings[i]),
    })))

    // 保存文件到本地
    const storagePath = path.join(
      app.getPath('userData'),
      'documents',
      knowledgeBaseId,
      `${fileId}-${fileName}`
    )
    await fs.mkdir(path.dirname(storagePath), { recursive: true })
    await fs.writeFile(storagePath, fileBuffer)

    // 更新文件状态
    await db.update(knowledgeBaseFilesTable)
      .set({
        status: 'completed',
        storagePath,
        contentText: text,
      })
      .where(eq(knowledgeBaseFilesTable.id, fileId))

    // 发送进度: 完成
    sender.send('file-processing-progress', {
      fileId,
      stage: 'completed',
      percent: 100,
    })

  } catch (error) {
    // 更新状态为失败
    await db.update(knowledgeBaseFilesTable)
      .set({ status: 'failed' })
      .where(eq(knowledgeBaseFilesTable.id, fileId))

    // 发送错误事件
    sender.send('file-processing-error', {
      fileId,
      error: error.message,
    })
  }
}
```

---

### 8. knowledge-base:delete-file

**描述**: 删除知识库中的文件（级联删除向量数据和本地文件）

**请求参数**:
```typescript
{
  knowledgeBaseId: string  // 知识库 ID
  fileId: string           // 文件 ID
}
```

**响应格式**:
```typescript
{
  success: boolean
}
```

**级联删除流程**:
1. 删除 SQLite `knowledge_base_files` 记录
2. 删除 LanceDB 中该文件的所有向量记录
3. 删除本地文件

---

### 9. knowledge-base:search

**描述**: 向量相似度搜索（用于 RAG 检索）

**请求参数**:
```typescript
{
  query: string          // 用户查询文本
  knowledgeBaseIds: string[]  // 要搜索的知识库 ID 列表
  limit?: number         // 返回结果数量，默认 5
}
```

**响应格式**:
```typescript
{
  results: Array<{
    content: string      // 文档片段文本
    similarity: number   // 相似度分数 (0-1，越大越相似)
    fileId: string       // 所属文件 ID
    fileName: string     // 文件名
  }>
}
```

**实现示例**:
```typescript
ipcMain.handle('knowledge-base:search', async (event, { query, knowledgeBaseIds, limit = 5 }) => {
  // 1. 生成查询向量
  const queryEmbedding = await generateEmbedding(query)

  // 2. 在所有指定的知识库中搜索
  const allResults = []

  for (const kbId of knowledgeBaseIds) {
    const table = await vectorDb.openTable(`kb_${kbId}`)
    const results = await table
      .search(new Float32Array(queryEmbedding))
      .limit(limit)
      .execute()

    allResults.push(...results.map(r => ({
      ...r,
      similarity: 1 - r._distance,  // 转换距离为相似度
    })))
  }

  // 3. 按相似度排序并返回 top-N
  allResults.sort((a, b) => b.similarity - a.similarity)
  const topResults = allResults.slice(0, limit)

  // 4. 获取文件名
  const fileIds = [...new Set(topResults.map(r => r.fileId))]
  const files = await db.select()
    .from(knowledgeBaseFilesTable)
    .where(inArray(knowledgeBaseFilesTable.id, fileIds))

  const fileMap = new Map(files.map(f => [f.id, f.fileName]))

  return {
    results: topResults.map(r => ({
      content: r.content,
      similarity: r.similarity,
      fileId: r.fileId,
      fileName: fileMap.get(r.fileId) || 'Unknown',
    }))
  }
})
```

---

## Preload 脚本定义

**文件**: `client/electron/preload/index.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  knowledgeBase: {
    // 知识库 CRUD
    list: () => ipcRenderer.invoke('knowledge-base:list'),

    create: (input: { name: string; description?: string }) =>
      ipcRenderer.invoke('knowledge-base:create', input),

    get: (id: string) =>
      ipcRenderer.invoke('knowledge-base:get', { id }),

    update: (input: { id: string; name?: string; description?: string; starred?: boolean }) =>
      ipcRenderer.invoke('knowledge-base:update', input),

    delete: (id: string) =>
      ipcRenderer.invoke('knowledge-base:delete', { id }),

    toggleStar: (id: string, starred: boolean) =>
      ipcRenderer.invoke('knowledge-base:toggle-star', { id, starred }),

    // 文件操作
    uploadFile: (input: {
      knowledgeBaseId: string
      fileBuffer: ArrayBuffer
      fileName: string
      fileSize: number
    }) => ipcRenderer.invoke('knowledge-base:upload-file', input),

    deleteFile: (knowledgeBaseId: string, fileId: string) =>
      ipcRenderer.invoke('knowledge-base:delete-file', { knowledgeBaseId, fileId }),

    // 向量搜索
    search: (query: string, knowledgeBaseIds: string[], limit?: number) =>
      ipcRenderer.invoke('knowledge-base:search', { query, knowledgeBaseIds, limit }),
  },
})

// 类型定义
declare global {
  interface Window {
    api: {
      knowledgeBase: {
        list: () => Promise<{ knowledgeBases: KnowledgeBase[] }>
        create: (input: CreateKnowledgeBaseInput) => Promise<{ knowledgeBase: KnowledgeBase }>
        get: (id: string) => Promise<{ knowledgeBase: KnowledgeBase; files: KnowledgeBaseFile[] }>
        update: (input: UpdateKnowledgeBaseInput) => Promise<{ knowledgeBase: KnowledgeBase }>
        delete: (id: string) => Promise<{ success: boolean }>
        toggleStar: (id: string, starred: boolean) => Promise<{ knowledgeBase: KnowledgeBase }>
        uploadFile: (input: UploadFileInput) => Promise<{ fileId: string; status: 'processing' }>
        deleteFile: (knowledgeBaseId: string, fileId: string) => Promise<{ success: boolean }>
        search: (query: string, knowledgeBaseIds: string[], limit?: number) => Promise<SearchResult>
      }
    }
  }
}
```

---

## 错误处理

### 错误响应格式

所有 IPC handlers 应返回统一的错误格式：

```typescript
{
  error: string  // 错误消息
}
```

### 常见错误码

| 错误消息 | 原因 | HTTP 等价 |
|---------|------|----------|
| `"Name is required"` | 验证失败 | 400 Bad Request |
| `"Knowledge base not found"` | 资源不存在 | 404 Not Found |
| `"File size exceeds 100MB limit"` | 文件过大 | 413 Payload Too Large |
| `"Unsupported file type"` | 不支持的文件类型 | 415 Unsupported Media Type |
| `"Failed to extract text"` | 文件处理失败 | 422 Unprocessable Entity |
| `"Internal Server Error"` | 未知错误 | 500 Internal Server Error |

---

## 总结

本 IPC API 设计遵循以下原则：

1. **✅ 类型安全**: 使用 Zod schema 验证所有输入
2. **✅ 返回格式一致**: 与 Cloud Mode RPC 接口完全一致
3. **✅ 错误处理统一**: 统一的错误响应格式
4. **✅ 性能优化**: 文件处理使用异步 + 进度通知
5. **✅ UI 复用友好**: 接口设计便于在 React hooks 中无缝切换

下一步将在 Phase 1 中生成快速开始指南（`quickstart.md`）。
