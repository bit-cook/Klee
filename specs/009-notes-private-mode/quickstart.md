# Quick Start: Notes Private Mode

**Feature**: Notes Private Mode
**Date**: 2025-10-23
**Audience**: 开发者

本文档提供 Notes Private Mode 功能的快速实施指南，包括关键文件清单、实施顺序和测试方法。

---

## 实施概览

**总时长**: 约 8-12 小时
**关键文件数**: 15 个（新增 7 个，修改 8 个）
**依赖功能**: Private Mode Knowledge Base (已完成)

---

## 实施顺序

### Phase 1: 数据层 (2-3 小时)

#### 1.1 SQLite Schema 定义

**文件**: `client/src/main/local/db/schema.ts`

```typescript
// 添加到文件末尾

// ==================== Notes（笔记）====================

/**
 * 本地笔记表 - 存储 Private Mode 下的笔记
 *
 * 对应 Cloud Mode 的 notes 表
 * Private Mode 简化：移除了 userId（单用户模式）
 */
export const localNotes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    starred: integer('starred', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('notes_starred_updated_at_idx').on(table.starred, table.updatedAt)
  ]
)

// 类型导出
export type LocalNote = InferSelectModel<typeof localNotes>
export type NewLocalNote = InferInsertModel<typeof localNotes>

// Zod 验证器
export const insertLocalNoteSchema = createInsertSchema(localNotes, {
  title: (schema) => schema.min(1, 'Title is required').max(200, 'Title too long'),
  content: (schema) => schema.optional().default(''),
}).omit({
  createdAt: true,
  updatedAt: true,
})

export const updateLocalNoteSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  starred: z.boolean().optional(),
})
```

**参考**: `server/db/schema.ts` (lines 396-441, Cloud Mode notes 表)

---

#### 1.2 数据库初始化

**文件**: `client/src/main/local/db/init-db.ts`

在 `initializeDatabase` 函数中添加 notes 表创建 SQL：

```typescript
export async function initializeDatabase(db: Database) {
  db.exec(`
    -- ... 现有表 ...

    -- 笔记表
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      starred INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS notes_starred_updated_at_idx
    ON notes (starred, updated_at);
  `)
}
```

---

#### 1.3 数据库查询函数

**文件**: `client/src/main/local/db/queries/notes.ts` (新建)

```typescript
/**
 * Private Mode 笔记查询函数
 *
 * 参考: server/db/queries/note.ts (Cloud Mode)
 */

import type { Database } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, desc } from 'drizzle-orm'
import { localNotes, type LocalNote, type NewLocalNote } from '../schema'
import { v4 as uuidv4 } from 'uuid'

let db: ReturnType<typeof drizzle> | null = null

export function setDatabase(database: Database) {
  db = drizzle(database, { schema: { localNotes } })
}

// 获取所有笔记
export async function getNotes(): Promise<LocalNote[]> {
  if (!db) throw new Error('Database not initialized')

  return await db
    .select()
    .from(localNotes)
    .orderBy(desc(localNotes.updatedAt))
}

// 获取单个笔记
export async function getNote(noteId: string): Promise<LocalNote | undefined> {
  if (!db) throw new Error('Database not initialized')

  const results = await db
    .select()
    .from(localNotes)
    .where(eq(localNotes.id, noteId))
    .limit(1)

  return results[0]
}

// 创建笔记
export async function createNote(data: Omit<NewLocalNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<LocalNote> {
  if (!db) throw new Error('Database not initialized')

  const now = new Date()
  const newNote: NewLocalNote = {
    id: uuidv4(),
    ...data,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(localNotes).values(newNote)

  return newNote as LocalNote
}

// 更新笔记
export async function updateNote(
  noteId: string,
  data: Partial<Pick<NewLocalNote, 'title' | 'content' | 'starred'>>
): Promise<LocalNote | undefined> {
  if (!db) throw new Error('Database not initialized')

  await db
    .update(localNotes)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(localNotes.id, noteId))

  return await getNote(noteId)
}

// 删除笔记
export async function deleteNote(noteId: string): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  await db.delete(localNotes).where(eq(localNotes.id, noteId))
}
```

**参考**: `client/src/main/local/db/queries/knowledge-base.ts` (结构相同)

---

### Phase 2: IPC 层 (2-3 小时)

#### 2.1 Embedding 服务

**文件**: `client/src/main/local/services/note-embedding-service.ts` (新建)

```typescript
/**
 * 笔记 Embedding 服务
 *
 * 参考: file-processor.ts (Knowledge Base 文件处理逻辑)
 */

import { embeddingService } from './embedding-service'
import { vectorDbManager } from './vector-db-manager'
import * as noteQueries from '../db/queries/notes'

// 全局串行队列
let embeddingQueue: Promise<any> = Promise.resolve()

// 分块函数
function splitIntoChunks(text: string, maxSize = 1000, overlap = 200): string[] {
  const chunks: string[] = []
  let startIndex = 0

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + maxSize, text.length)
    chunks.push(text.slice(startIndex, endIndex))
    startIndex += (maxSize - overlap)
  }

  return chunks
}

// 生成笔记 embeddings
export async function embedNote(
  noteId: string,
  onProgress?: (progress: { percent: number; message: string }) => void
): Promise<{ success: boolean; chunksCount: number; textLength: number }> {
  // 加入全局队列
  embeddingQueue = embeddingQueue.then(async () => {
    try {
      // 1. 获取笔记
      const note = await noteQueries.getNote(noteId)
      if (!note) {
        throw new Error('Note not found')
      }

      // 2. 分块
      const chunks = splitIntoChunks(note.content)

      // 3. 生成 embeddings (串行)
      const embeddings = await embeddingService.generateEmbeddingsBatchWithRetry(
        chunks,
        { delayBetweenRequests: 1000 },
        (progress) => {
          onProgress?.({
            percent: progress.percent,
            message: `Embedding chunk ${progress.current}/${progress.total}`,
          })
        }
      )

      // 4. 创建向量表
      const tableName = `note_${noteId}`
      await vectorDbManager.createTable(tableName)

      // 5. 存储向量
      const records = chunks.map((chunk, i) => ({
        id: `${noteId}_chunk_${i}`,
        content: chunk,
        embedding: embeddings[i],
      }))

      await vectorDbManager.addRecords(tableName, records)

      return {
        success: true,
        chunksCount: chunks.length,
        textLength: note.content.length,
      }
    } catch (error) {
      console.error('[NoteEmbedding] Error:', error)
      throw error
    }
  })

  return embeddingQueue
}

// RAG 搜索
export async function searchNotes(
  query: string,
  noteIds: string[],
  limit = 5
): Promise<Array<{
  content: string
  similarity: number
  sourceType: 'note'
  sourceId: string
  sourceName: string
}>> {
  // 1. 生成查询向量
  const queryEmbedding = await embeddingService.generateEmbedding(query)

  // 2. 并行搜索
  const searchPromises = noteIds.map(async (noteId) => {
    const tableName = `note_${noteId}`

    // 检查表是否存在
    const tableExists = await vectorDbManager.tableExists(tableName)
    if (!tableExists) return []

    // 搜索
    const results = await vectorDbManager.search(tableName, queryEmbedding, limit)

    // 附加元数据
    const note = await noteQueries.getNote(noteId)
    return results.map(r => ({
      content: r.content,
      similarity: 1 - r._distance,
      sourceType: 'note' as const,
      sourceId: noteId,
      sourceName: note?.title || 'Untitled',
    }))
  })

  // 3. 合并排序
  const allResults = (await Promise.all(searchPromises)).flat()
  return allResults
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}
```

**参考**: `client/src/main/local/services/file-processor.ts` (embedding 流程)

---

#### 2.2 IPC Handlers

**文件**: `client/src/main/ipc/note-handlers.ts` (新建)

```typescript
/**
 * 笔记 IPC 处理器
 *
 * 参考: knowledge-base-handlers.ts
 */

import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import * as noteQueries from '../local/db/queries/notes'
import { vectorDbManager } from '../local/services/vector-db-manager'
import { embedNote, searchNotes } from '../local/services/note-embedding-service'
import { insertLocalNoteSchema, updateLocalNoteSchema } from '../local/db/schema'
import { z } from 'zod'

const DB_CHANNELS = {
  GET_NOTES: 'db:notes:list',
  GET_NOTE: 'db:notes:get',
  CREATE_NOTE: 'db:notes:create',
  UPDATE_NOTE: 'db:notes:update',
  DELETE_NOTE: 'db:notes:delete',
  EMBED_NOTE: 'db:notes:embed',
  SEARCH_NOTES: 'db:notes:search',
} as const

export function registerNoteHandlers() {
  // 获取笔记列表
  ipcMain.handle(DB_CHANNELS.GET_NOTES, async () => {
    try {
      const notes = await noteQueries.getNotes()
      return { success: true, data: notes }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 获取单个笔记
  ipcMain.handle(DB_CHANNELS.GET_NOTE, async (_, request: { noteId: string }) => {
    try {
      const note = await noteQueries.getNote(request.noteId)
      if (!note) {
        return { success: false, error: 'Note not found' }
      }
      return { success: true, data: note }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 创建笔记
  ipcMain.handle(DB_CHANNELS.CREATE_NOTE, async (_, request: any) => {
    try {
      const validated = insertLocalNoteSchema.parse(request)
      const note = await noteQueries.createNote(validated)
      return { success: true, data: note }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return { success: false, error: error.errors[0].message }
      }
      return { success: false, error: error.message }
    }
  })

  // 更新笔记
  ipcMain.handle(DB_CHANNELS.UPDATE_NOTE, async (_, request: { noteId: string; data: any }) => {
    try {
      const validated = updateLocalNoteSchema.parse(request.data)
      const note = await noteQueries.updateNote(request.noteId, validated)
      if (!note) {
        return { success: false, error: 'Note not found' }
      }
      return { success: true, data: note }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 删除笔记
  ipcMain.handle(DB_CHANNELS.DELETE_NOTE, async (_, request: { noteId: string }) => {
    try {
      await noteQueries.deleteNote(request.noteId)

      // 删除向量表 (如果存在)
      try {
        await vectorDbManager.dropTable(`note_${request.noteId}`)
      } catch {
        // 表可能不存在，忽略
      }

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 生成 embeddings
  ipcMain.handle(DB_CHANNELS.EMBED_NOTE, async (event, request: { noteId: string }) => {
    try {
      const result = await embedNote(request.noteId, (progress) => {
        event.sender.send('db:notes:embedding-progress', {
          noteId: request.noteId,
          percent: progress.percent,
          message: progress.message,
        })
      })

      event.sender.send('db:notes:embedding-complete', {
        noteId: request.noteId,
        chunksCount: result.chunksCount,
      })

      return { success: true, data: result }
    } catch (error: any) {
      event.sender.send('db:notes:embedding-failed', {
        noteId: request.noteId,
        error: error.message,
      })

      return { success: false, error: error.message }
    }
  })

  // RAG 搜索
  ipcMain.handle(DB_CHANNELS.SEARCH_NOTES, async (_, request: { query: string; noteIds: string[]; limit?: number }) => {
    try {
      const results = await searchNotes(request.query, request.noteIds, request.limit)
      return { success: true, data: results }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
```

**参考**: `client/src/main/ipc/knowledge-base-handlers.ts`

---

#### 2.3 Preload API

**文件**: `client/src/main/preload/index.ts` (修改)

在 `exposeInMainWorld` 中添加 note API：

```typescript
contextBridge.exposeInMainWorld('api', {
  // ... 现有 API ...
  note: {
    list: () => ipcRenderer.invoke('db:notes:list'),
    get: (request: { noteId: string }) => ipcRenderer.invoke('db:notes:get', request),
    create: (request: any) => ipcRenderer.invoke('db:notes:create', request),
    update: (request: { noteId: string; data: any }) => ipcRenderer.invoke('db:notes:update', request),
    delete: (request: { noteId: string }) => ipcRenderer.invoke('db:notes:delete', request),
    embed: (request: { noteId: string }) => ipcRenderer.invoke('db:notes:embed', request),
    search: (request: { query: string; noteIds: string[]; limit?: number }) =>
      ipcRenderer.invoke('db:notes:search', request),

    onEmbeddingProgress: (callback: (event: any) => void) => {
      ipcRenderer.on('db:notes:embedding-progress', (_, event) => callback(event))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-progress')
    },
    onEmbeddingComplete: (callback: (event: any) => void) => {
      ipcRenderer.on('db:notes:embedding-complete', (_, event) => callback(event))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-complete')
    },
    onEmbeddingFailed: (callback: (event: any) => void) => {
      ipcRenderer.on('db:notes:embedding-failed', (_, event) => callback(event))
      return () => ipcRenderer.removeAllListeners('db:notes:embedding-failed')
    },
  },
})
```

---

### Phase 3: 前端层 (4-6 小时)

#### 3.1 Query Hooks

**文件**: `client/src/renderer/src/hooks/note/queries/useNotes.ts` (修改)

```typescript
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { noteKeys } from '@/lib/queryKeys'
import { useMode } from '@/contexts/ModeContext'

export function useNotes() {
  const { mode } = useMode()

  return useQuery({
    queryKey: noteKeys.lists(mode),
    queryFn: async () => {
      if (mode === 'cloud') {
        const res = await honoClient.api.note.$get()
        if (!res.ok) throw new Error('Failed to fetch notes')
        return await res.json()
      } else {
        // Private Mode
        const result = await window.api.note.list()
        if (!result.success) throw new Error(result.error || 'Failed to fetch notes')
        return { notes: result.data }
      }
    },
    staleTime: 2 * 60 * 1000,
  })
}
```

**文件**: `client/src/renderer/src/hooks/note/queries/useNote.ts` (修改)

类似修改，添加 Private Mode 分支。

---

#### 3.2 Mutation Hooks

**文件**: `client/src/renderer/src/hooks/note/mutations/useCreateNote.ts` (修改)

**文件**: `client/src/renderer/src/hooks/note/mutations/useUpdateNote.ts` (修改)

**文件**: `client/src/renderer/src/hooks/note/mutations/useDeleteNote.ts` (修改)

**文件**: `client/src/renderer/src/hooks/note/mutations/useEmbedNote.ts` (修改)

所有 mutation hooks 都添加 `if (mode === 'private')` 分支，调用 `window.api.note.*()` 而非 Hono API。

**参考**: `client/src/renderer/src/hooks/knowledge-base/mutations/useCreateKnowledgeBase.ts`

---

#### 3.3 Query Keys

**文件**: `client/src/renderer/src/lib/queryKeys.ts` (修改)

```typescript
export const noteKeys = {
  all: (mode: 'cloud' | 'private') => ['notes', mode] as const,
  lists: (mode: 'cloud' | 'private') => [...noteKeys.all(mode), 'list'] as const,
  details: (mode: 'cloud' | 'private') => [...noteKeys.all(mode), 'detail'] as const,
  detail: (id: string, mode: 'cloud' | 'private') =>
    [...noteKeys.details(mode), id] as const,
}
```

---

#### 3.4 类型定义

**文件**: `client/src/renderer/src/types/local/note.ts` (新建)

```typescript
// Private Mode 笔记类型
export interface LocalNote {
  id: string
  title: string
  content: string
  starred: boolean
  createdAt: Date
  updatedAt: Date
}

// IPC 响应类型
export interface GetNotesResponse {
  success: boolean
  data?: LocalNote[]
  error?: string
}

// ... 其他响应类型 ...
```

---

### Phase 4: 聊天集成 (2 小时)

#### 4.1 聊天 Hook 更新

**文件**: `client/src/renderer/src/hooks/chat/useLocalChatLogic.ts` (修改)

在 `handleSubmit` 中添加笔记 RAG 搜索逻辑（与 Knowledge Base 搜索合并）：

```typescript
// 如果有关联的笔记，执行 RAG 检索
if (availableNoteIds.length > 0) {
  try {
    const noteSearchResult = await window.api.note.search(
      message.text,
      availableNoteIds,
      5
    )

    if (noteSearchResult.success && noteSearchResult.data) {
      // 合并笔记和知识库的搜索结果
      ragContext += noteSearchResult.data
        .map((r, i) => `[Note ${i+1}] (from ${r.sourceName})\n${r.content}`)
        .join('\n\n')
    }
  } catch (error) {
    console.error('[RAG Search - Notes] Failed:', error)
  }
}
```

---

## 测试清单

### 单元测试

- [ ] `noteQueries.createNote()` - 创建笔记并验证字段
- [ ] `noteQueries.updateNote()` - 更新笔记并验证 `updatedAt`
- [ ] `noteQueries.deleteNote()` - 删除笔记并验证不存在
- [ ] `embeddingService.generateEmbedding()` - 生成向量并验证维度
- [ ] `splitIntoChunks()` - 分块并验证重叠

### 集成测试

- [ ] 创建笔记 → Embed → 搜索 → 找到相关内容
- [ ] 删除笔记 → 验证向量表已删除
- [ ] 聊天中关联笔记 → 发送消息 → RAG 注入生效

### E2E 测试

- [ ] 切换到 Private Mode → 创建笔记 → 侧边栏显示
- [ ] 星标笔记 → 移动到 Starred 分组
- [ ] 切换到 Cloud Mode → Private 笔记不显示
- [ ] 重启应用 → Private 笔记仍然存在

---

## 调试技巧

### 查看 SQLite 数据

```bash
# 打开数据库
sqlite3 ~/Library/Application\ Support/rafa/rafa-private.db

# 查询笔记
SELECT * FROM notes;

# 查看索引
.indexes notes
```

### 查看 LanceDB 向量表

```typescript
// 在主进程日志中
const tables = await vectorDbManager.listTables()
console.log('Vector tables:', tables.filter(t => t.startsWith('note_')))
```

### 查看 IPC 通信

在渲染进程 DevTools Console 中：

```javascript
window.api.note.list().then(console.log)
```

---

## 常见问题

### Q: 笔记创建成功但侧边栏不更新？

**A**: 检查查询键是否包含 `mode` 参数：
```typescript
queryKey: noteKeys.lists(mode)  // ✅ 正确
queryKey: noteKeys.lists()       // ❌ 错误，缺少模式参数
```

### Q: Embedding 失败，错误 "Ollama not running"？

**A**: 确保 Ollama 服务已启动：
```bash
ollama list  # 检查 Ollama 是否运行
```

### Q: RAG 搜索无结果？

**A**: 检查：
1. 笔记是否已嵌入（查看 LanceDB 表）
2. 查询文本与笔记内容是否相关
3. 相似度阈值是否过高

---

## 下一步

完成实施后，运行 `/speckit.tasks` 生成详细的任务列表。
