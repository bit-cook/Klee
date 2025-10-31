# IPC Contract: Note Handlers

**Feature**: Notes Private Mode
**Date**: 2025-10-23
**Status**: Complete

本文档定义 Private Mode 笔记功能的 IPC 通道、请求/响应格式和错误处理规范。

---

## IPC Channel Registry

### Command Channels (Renderer → Main)

```typescript
export const DB_CHANNELS = {
  GET_NOTES: 'db:notes:list',              // 获取笔记列表
  GET_NOTE: 'db:notes:get',                // 获取单个笔记
  CREATE_NOTE: 'db:notes:create',          // 创建笔记
  UPDATE_NOTE: 'db:notes:update',          // 更新笔记
  DELETE_NOTE: 'db:notes:delete',          // 删除笔记
  EMBED_NOTE: 'db:notes:embed',            // 生成 embeddings
  SEARCH_NOTES: 'db:notes:search',         // RAG 向量搜索
} as const
```

### Event Channels (Main → Renderer)

```typescript
export const NOTE_EVENT_CHANNELS = {
  EMBEDDING_PROGRESS: 'db:notes:embedding-progress',  // Embedding 进度更新
  EMBEDDING_COMPLETE: 'db:notes:embedding-complete',  // Embedding 完成
  EMBEDDING_FAILED: 'db:notes:embedding-failed',      // Embedding 失败
} as const
```

---

## 1. GET_NOTES - 获取笔记列表

### Channel

`db:notes:list`

### Request

```typescript
interface GetNotesRequest {
  // Empty - 获取所有笔记
}
```

### Response

```typescript
interface GetNotesResponse {
  success: boolean
  data?: LocalNote[]
  error?: string
}

interface LocalNote {
  id: string
  title: string
  content: string
  starred: boolean
  createdAt: Date        // Parsed from Unix timestamp
  updatedAt: Date        // Parsed from Unix timestamp
}
```

### Usage Example

```typescript
// Renderer (前端)
const result = await window.api.note.list()

if (result.success) {
  console.log('Notes:', result.data)
} else {
  console.error('Error:', result.error)
}

// Main (IPC Handler)
ipcMain.handle('db:notes:list', async () => {
  try {
    const notes = await noteQueries.getNotes()
    return { success: true, data: notes }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

### Error Codes

| Error Message | Cause | 处理方式 |
|---------------|-------|---------|
| `"Database not initialized"` | SQLite 数据库未初始化 | 调用 `initializeDatabase()` |
| `"Failed to query notes"` | SQLite 查询失败 | 检查数据库连接和表结构 |

---

## 2. GET_NOTE - 获取单个笔记

### Channel

`db:notes:get`

### Request

```typescript
interface GetNoteRequest {
  noteId: string  // UUID
}
```

### Response

```typescript
interface GetNoteResponse {
  success: boolean
  data?: LocalNote
  error?: string
}
```

### Usage Example

```typescript
// Renderer
const result = await window.api.note.get({ noteId: 'note-123' })

// Main
ipcMain.handle('db:notes:get', async (event, request: GetNoteRequest) => {
  try {
    const note = await noteQueries.getNote(request.noteId)
    if (!note) {
      return { success: false, error: 'Note not found' }
    }
    return { success: true, data: note }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

### Error Codes

| Error Message | Cause | 处理方式 |
|---------------|-------|---------|
| `"Note not found"` | 笔记 ID 不存在 | 显示 404 错误或重定向到列表页 |
| `"Invalid note ID"` | noteId 格式不是 UUID | 前端验证 |

---

## 3. CREATE_NOTE - 创建笔记

### Channel

`db:notes:create`

### Request

```typescript
interface CreateNoteRequest {
  id: string          // UUID, 前端生成
  title: string       // 1-200 字符
  content?: string    // 可选, 默认空字符串
}
```

### Response

```typescript
interface CreateNoteResponse {
  success: boolean
  data?: LocalNote
  error?: string
}
```

### Usage Example

```typescript
// Renderer
import { v4 as uuidv4 } from 'uuid'

const newNote = {
  id: uuidv4(),
  title: 'My Note',
  content: '# Hello',
}

const result = await window.api.note.create(newNote)

// Main
ipcMain.handle('db:notes:create', async (event, request: CreateNoteRequest) => {
  try {
    // 验证
    const validated = insertLocalNoteSchema.parse({
      ...request,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // 插入
    const note = await noteQueries.createNote(validated)
    return { success: true, data: note }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message }
    }
    return { success: false, error: error.message }
  }
})
```

### Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| `id` | UUID format | "Invalid note ID" |
| `title` | 1-200 chars | "Title is required" / "Title too long" |
| `content` | Optional | N/A |

---

## 4. UPDATE_NOTE - 更新笔记

### Channel

`db:notes:update`

### Request

```typescript
interface UpdateNoteRequest {
  noteId: string
  data: {
    title?: string     // 1-200 字符
    content?: string
    starred?: boolean
  }
}
```

### Response

```typescript
interface UpdateNoteResponse {
  success: boolean
  data?: LocalNote
  error?: string
}
```

### Usage Example

```typescript
// Renderer
const result = await window.api.note.update({
  noteId: 'note-123',
  data: {
    title: 'Updated Title',
    starred: true,
  }
})

// Main
ipcMain.handle('db:notes:update', async (event, request: UpdateNoteRequest) => {
  try {
    // 验证
    const validated = updateLocalNoteSchema.parse(request.data)

    // 更新
    const note = await noteQueries.updateNote(request.noteId, {
      ...validated,
      updatedAt: new Date(),
    })

    if (!note) {
      return { success: false, error: 'Note not found' }
    }

    return { success: true, data: note }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

### Behavior

- 仅更新提供的字段（partial update）
- `updatedAt` 自动更新
- 返回更新后的完整笔记对象

---

## 5. DELETE_NOTE - 删除笔记

### Channel

`db:notes:delete`

### Request

```typescript
interface DeleteNoteRequest {
  noteId: string
}
```

### Response

```typescript
interface DeleteNoteResponse {
  success: boolean
  error?: string
}
```

### Usage Example

```typescript
// Renderer
const result = await window.api.note.delete({ noteId: 'note-123' })

// Main
ipcMain.handle('db:notes:delete', async (event, request: DeleteNoteRequest) => {
  try {
    // 1. 删除 SQLite 记录
    await noteQueries.deleteNote(request.noteId)

    // 2. 删除 LanceDB 向量表 (如果存在)
    try {
      await vectorDbManager.dropTable(`note_${request.noteId}`)
    } catch (error) {
      // 表可能不存在（笔记未嵌入），忽略错误
      console.warn(`Vector table for note ${request.noteId} not found`)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

### Cascade Behavior

删除笔记时：
1. 删除 SQLite `notes` 表记录
2. 删除 LanceDB `note_{noteId}` 向量表（如果存在）
3. **不自动更新** `localChatSessions.availableNoteIds`（应用层处理）

---

## 6. EMBED_NOTE - 生成 Embeddings

### Channel

`db:notes:embed`

### Request

```typescript
interface EmbedNoteRequest {
  noteId: string
}
```

### Response

```typescript
interface EmbedNoteResponse {
  success: boolean
  data?: {
    chunksCount: number    // 生成的块数量
    textLength: number     // 文本总长度
  }
  error?: string
}
```

### Progress Events

```typescript
// Event: db:notes:embedding-progress
interface EmbeddingProgressEvent {
  noteId: string
  percent: number        // 0-100
  message: string        // 如 "Embedding chunk 3/10"
}

// Event: db:notes:embedding-complete
interface EmbeddingCompleteEvent {
  noteId: string
  chunksCount: number
}

// Event: db:notes:embedding-failed
interface EmbeddingFailedEvent {
  noteId: string
  error: string
}
```

### Usage Example

```typescript
// Renderer - 监听进度事件
useEffect(() => {
  const unsubProgress = window.api.note.onEmbeddingProgress?.((event) => {
    console.log(`Progress: ${event.percent}% - ${event.message}`)
  })

  const unsubComplete = window.api.note.onEmbeddingComplete?.((event) => {
    console.log(`Embedding complete: ${event.chunksCount} chunks`)
  })

  return () => {
    unsubProgress?.()
    unsubComplete?.()
  }
}, [])

// 触发嵌入
const result = await window.api.note.embed({ noteId: 'note-123' })

// Main
ipcMain.handle('db:notes:embed', async (event, request: EmbedNoteRequest) => {
  try {
    // 1. 获取笔记内容
    const note = await noteQueries.getNote(request.noteId)
    if (!note) {
      return { success: false, error: 'Note not found' }
    }

    // 2. 分块
    const chunks = splitIntoChunks(note.content)

    // 3. 生成 embeddings (串行, 带进度回调)
    const embeddings = await embeddingService.generateEmbeddingsBatchWithRetry(
      chunks,
      { delayBetweenRequests: 1000 },
      (progress) => {
        // 发送进度事件
        event.sender.send('db:notes:embedding-progress', {
          noteId: request.noteId,
          percent: progress.percent,
          message: `Embedding chunk ${progress.current}/${progress.total}`,
        })
      }
    )

    // 4. 创建向量表
    const tableName = `note_${request.noteId}`
    await vectorDbManager.createTable(tableName)

    // 5. 存储向量
    const records = chunks.map((chunk, i) => ({
      id: `${request.noteId}_chunk_${i}`,
      content: chunk,
      embedding: embeddings[i],
    }))
    await vectorDbManager.addRecords(tableName, records)

    // 6. 发送完成事件
    event.sender.send('db:notes:embedding-complete', {
      noteId: request.noteId,
      chunksCount: chunks.length,
    })

    return {
      success: true,
      data: {
        chunksCount: chunks.length,
        textLength: note.content.length,
      }
    }
  } catch (error) {
    // 发送失败事件
    event.sender.send('db:notes:embedding-failed', {
      noteId: request.noteId,
      error: error.message,
    })

    return { success: false, error: error.message }
  }
})
```

### Error Codes

| Error Message | Cause | 处理方式 |
|---------------|-------|---------|
| `"Note not found"` | noteId 不存在 | 前端验证 |
| `"Ollama not running"` | Ollama API 未响应 | 提示用户启动 Ollama |
| `"Model not found"` | nomic-embed-text 模型未安装 | 自动拉取模型 |
| `"Embedding timeout"` | 生成超时 (>30s) | 重试或降低文本长度 |

---

## 7. SEARCH_NOTES - RAG 向量搜索

### Channel

`db:notes:search`

### Request

```typescript
interface SearchNotesRequest {
  query: string         // 查询文本
  noteIds: string[]     // 搜索范围 (笔记 ID 数组)
  limit?: number        // 返回结果数量, 默认 5
}
```

### Response

```typescript
interface SearchNotesResponse {
  success: boolean
  data?: SearchResult[]
  error?: string
}

interface SearchResult {
  content: string       // 匹配的文本块
  similarity: number    // 相似度 (0-1)
  sourceType: 'note'    // 固定值
  sourceId: string      // 笔记 ID
  sourceName: string    // 笔记标题
}
```

### Usage Example

```typescript
// Renderer
const result = await window.api.note.search({
  query: 'How to use React hooks?',
  noteIds: ['note-123', 'note-456'],
  limit: 5,
})

if (result.success) {
  console.log('Found:', result.data)
  // [
  //   {
  //     content: '# React Hooks\n\nHooks are functions that...',
  //     similarity: 0.89,
  //     sourceType: 'note',
  //     sourceId: 'note-123',
  //     sourceName: 'React Guide',
  //   },
  //   ...
  // ]
}

// Main
ipcMain.handle('db:notes:search', async (event, request: SearchNotesRequest) => {
  try {
    // 1. 生成查询向量
    const queryEmbedding = await embeddingService.generateEmbedding(request.query)

    // 2. 并行搜索所有笔记
    const searchPromises = request.noteIds.map(async (noteId) => {
      const tableName = `note_${noteId}`

      // 检查表是否存在
      const tableExists = await vectorDbManager.tableExists(tableName)
      if (!tableExists) {
        return []  // 笔记未嵌入，跳过
      }

      // 搜索向量
      const results = await vectorDbManager.search(
        tableName,
        queryEmbedding,
        request.limit || 5
      )

      // 附加笔记元数据
      const note = await noteQueries.getNote(noteId)
      return results.map(r => ({
        content: r.content,
        similarity: 1 - r._distance,  // 余弦距离 → 相似度
        sourceType: 'note' as const,
        sourceId: noteId,
        sourceName: note?.title || 'Untitled',
      }))
    })

    // 3. 合并并排序结果
    const allResults = (await Promise.all(searchPromises)).flat()
    const sortedResults = allResults
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, request.limit || 5)

    return { success: true, data: sortedResults }
  } catch (error) {
    return { success: false, error: error.message }
  }
})
```

### Behavior

- 并行搜索所有指定的笔记
- 自动跳过未嵌入的笔记（无向量表）
- 按相似度全局排序，返回 top N
- 相似度阈值: > 0.7 (余弦距离 < 0.3)

---

## 8. Preload Script API

### Type Definitions

```typescript
// client/src/main/preload/index.ts
export interface NoteAPI {
  // Commands
  list: () => Promise<GetNotesResponse>
  get: (request: GetNoteRequest) => Promise<GetNoteResponse>
  create: (request: CreateNoteRequest) => Promise<CreateNoteResponse>
  update: (request: UpdateNoteRequest) => Promise<UpdateNoteResponse>
  delete: (request: DeleteNoteRequest) => Promise<DeleteNoteResponse>
  embed: (request: EmbedNoteRequest) => Promise<EmbedNoteResponse>
  search: (request: SearchNotesRequest) => Promise<SearchNotesResponse>

  // Events
  onEmbeddingProgress?: (callback: (event: EmbeddingProgressEvent) => void) => () => void
  onEmbeddingComplete?: (callback: (event: EmbeddingCompleteEvent) => void) => () => void
  onEmbeddingFailed?: (callback: (event: EmbeddingFailedEvent) => void) => () => void
}

declare global {
  interface Window {
    api: {
      note: NoteAPI
      // ... other APIs
    }
  }
}
```

### Implementation

```typescript
// client/src/main/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  note: {
    list: () => ipcRenderer.invoke('db:notes:list'),
    get: (request) => ipcRenderer.invoke('db:notes:get', request),
    create: (request) => ipcRenderer.invoke('db:notes:create', request),
    update: (request) => ipcRenderer.invoke('db:notes:update', request),
    delete: (request) => ipcRenderer.invoke('db:notes:delete', request),
    embed: (request) => ipcRenderer.invoke('db:notes:embed', request),
    search: (request) => ipcRenderer.invoke('db:notes:search', request),

    onEmbeddingProgress: (callback) => {
      ipcRenderer.on('db:notes:embedding-progress', (_, event) => callback(event))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-progress')
    },
    onEmbeddingComplete: (callback) => {
      ipcRenderer.on('db:notes:embedding-complete', (_, event) => callback(event))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-complete')
    },
    onEmbeddingFailed: (callback) => {
      ipcRenderer.on('db:notes:embedding-failed', (_, event) => callback(event))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-failed')
    },
  },
})
```

---

## 9. Error Handling Standards

### Error Response Format

所有 IPC 响应统一使用以下格式：

```typescript
interface IPCResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

### Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| **Validation Error** | "Title is required" | 前端显示验证错误，不发送请求 |
| **Not Found Error** | "Note not found" | 显示 404 页面或重定向 |
| **Database Error** | "Database not initialized" | 重试或提示用户重启应用 |
| **External API Error** | "Ollama not running" | 提示用户启动 Ollama |
| **Timeout Error** | "Embedding timeout" | 允许用户重试 |

### Retry Policy

| Operation | Retry | Reason |
|-----------|-------|--------|
| `list/get/create/update/delete` | ❌ 不重试 | 本地操作，失败即表示严重错误 |
| `embed` | ✅ 最多 3 次 | 网络请求（Ollama API），可能暂时失败 |
| `search` | ✅ 最多 3 次 | 包含 embedding 生成，可能暂时失败 |

---

## Summary

IPC 契约已完成定义，核心特性：

1. **类型安全**: 明确的请求/响应接口
2. **错误处理**: 统一的响应格式和错误分类
3. **进度反馈**: 异步操作（embedding）的实时进度事件
4. **性能优化**: 并行搜索、缓存策略
5. **与 Knowledge Base 一致**: 命名规范、错误处理、事件模式完全对齐

下一步: 生成快速入门指南 (quickstart.md)。
