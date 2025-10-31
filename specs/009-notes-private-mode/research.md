# Research: Notes Private Mode

**Feature**: Notes Private Mode
**Date**: 2025-10-23
**Status**: Complete

本文档记录了 Notes Private Mode 功能的技术研究决策，包括数据库设计、Embedding 策略、IPC 架构和缓存管理。

---

## 1. SQLite Schema 设计 - 对齐 Cloud Mode

### Decision

在 `client/src/main/local/db/schema.ts` 中添加 `localNotes` 表，字段与 Cloud Mode `notes` 表完全对应（仅移除 `userId`）：

```typescript
export const localNotes = sqliteTable(
  'notes',  // 表名与 Cloud Mode 一致
  {
    id: text('id').primaryKey(),                      // UUID
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
```

### Rationale

1. **字段对齐**: 与 Cloud Mode `notes` 表完全一致，便于未来数据迁移和代码复用
2. **单用户简化**: 移除 `userId` 字段（Private Mode 单用户模式）
3. **索引优化**: 按 `starred` 和 `updatedAt` 复合索引，支持快速分组查询（Starred/Recent）
4. **类型安全**: 使用 drizzle-orm 自动推导 `LocalNote` 和 `NewLocalNote` 类型

### Alternatives Considered

- **添加 userId 字段保持完全一致**: 拒绝理由 - Private Mode 设计为单用户，额外字段增加复杂度且无实际用途
- **使用 JSON 存储笔记内容**: 拒绝理由 - TEXT 类型足够存储 Markdown/HTML，JSON 解析增加开销
- **移除 starred 字段**: 拒绝理由 - 星标功能是核心需求，用户需要快速访问重要笔记

---

## 2. LanceDB 向量表设计

### Decision

为每个笔记创建独立的 LanceDB 向量表，命名规则为 `note_{noteId}`：

```typescript
// 向量记录结构
interface NoteVectorRecord {
  id: string          // 格式: {noteId}_chunk_{index}
  content: string     // 文本块内容
  embedding: number[] // 768 维向量 (nomic-embed-text)
}

// 表操作
vectorDbManager.createTable(`note_${noteId}`)
vectorDbManager.addRecords(`note_${noteId}`, records)
vectorDbManager.dropTable(`note_${noteId}`)  // 删除笔记时
```

### Rationale

1. **隔离性**: 每个笔记独立一张表，删除笔记时直接 drop 表，无需逐条删除记录
2. **一致性**: 与 Knowledge Base 的 `kb_{knowledgeBaseId}` 命名保持一致
3. **性能**: 小表查询速度快于大表过滤，避免向量表膨胀
4. **简化管理**: 表级别管理比记录级别管理更简单，减少孤立数据风险

### Alternatives Considered

- **单一向量表 + noteId 字段**: 拒绝理由 - 需要手动过滤和清理，增加孤立数据风险，且查询性能下降
- **嵌入到 SQLite BLOB 字段**: 拒绝理由 - SQLite 不支持高效向量搜索，LanceDB 是专业向量数据库

---

## 3. Embedding 分块策略

### Decision

复用 Knowledge Base 的分块配置（`local.config.ts`）：

```typescript
EMBEDDING_CONFIG = {
  DEFAULT_MODEL: 'nomic-embed-text',  // 768 维
  CHUNK_CONFIG: {
    MAX_CHUNK_SIZE: 1000,      // 每块 1000 字符
    CHUNK_OVERLAP: 200,         // 重叠 200 字符
  }
}
```

**分块算法**:
```typescript
function splitIntoChunks(text: string): string[] {
  const chunks: string[] = []
  let startIndex = 0

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + MAX_CHUNK_SIZE, text.length)
    chunks.push(text.slice(startIndex, endIndex))
    startIndex += (MAX_CHUNK_SIZE - CHUNK_OVERLAP)  // 重叠滑动
  }

  return chunks
}
```

### Rationale

1. **上下文保留**: 200 字符重叠确保跨块的语义连贯性
2. **模型限制**: nomic-embed-text 适合处理中等长度文本（~1000 字符）
3. **检索质量**: 更小的块提高检索精确度，避免无关内容干扰
4. **配置复用**: 与 Knowledge Base 保持一致，降低维护成本

### Alternatives Considered

- **按段落分块**: 拒绝理由 - 段落长度不可控，可能超出模型限制或过短导致语义不完整
- **不重叠分块**: 拒绝理由 - 跨块边界的语义会丢失，影响检索准确性
- **更大的块大小 (2000+)**: 拒绝理由 - 块过大导致检索结果包含过多无关信息，降低 RAG 质量

---

## 4. IPC 架构设计

### Decision

在 `client/src/main/ipc/note-handlers.ts` 中注册 IPC 通道，遵循 Knowledge Base 的模式：

```typescript
// IPC 通道定义
const DB_CHANNELS = {
  GET_NOTES: 'db:notes:list',
  GET_NOTE: 'db:notes:get',
  CREATE_NOTE: 'db:notes:create',
  UPDATE_NOTE: 'db:notes:update',
  DELETE_NOTE: 'db:notes:delete',
  EMBED_NOTE: 'db:notes:embed',
}

// IPC 进度事件
const PROGRESS_CHANNELS = {
  NOTE_EMBEDDING_PROGRESS: 'db:notes:embedding-progress',
  NOTE_EMBEDDING_COMPLETE: 'db:notes:embedding-complete',
  NOTE_EMBEDDING_FAILED: 'db:notes:embedding-failed',
}

// 请求/响应类型
interface GetNotesRequest { /* empty */ }
interface GetNotesResponse {
  success: boolean
  data: LocalNote[]
}

interface EmbedNoteRequest {
  noteId: string
}
interface EmbedNoteResponse {
  success: boolean
  data?: { chunksCount: number, textLength: number }
  error?: string
}
```

### Rationale

1. **统一命名**: `db:notes:*` 前缀与 `db:knowledge-base:*` 保持一致
2. **类型安全**: 明确的请求/响应接口，避免运行时错误
3. **进度反馈**: 异步操作（embedding）通过事件通道报告进度
4. **错误处理**: 统一的 `{ success, data?, error? }` 响应格式

### Alternatives Considered

- **直接在渲染进程操作 SQLite**: 拒绝理由 - 违反 Electron 安全模型，且无法使用主进程的 Node.js API (如 LanceDB)
- **使用 tRPC 替代 IPC**: 拒绝理由 - Private Mode 无需网络通信，IPC 更轻量且符合 Electron 最佳实践

---

## 5. 前端 Hooks 模式感知策略

### Decision

在现有 hooks 中添加模式判断逻辑，而非创建独立的 Private Mode hooks：

```typescript
// client/src/renderer/src/hooks/note/queries/useNotes.ts
import { useMode } from '@/contexts/ModeContext'

export function useNotes() {
  const { mode } = useMode()

  return useQuery({
    queryKey: noteKeys.lists(mode),  // 查询键包含模式
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

### Rationale

1. **代码复用**: 避免重复的 hook 逻辑（缓存策略、错误处理、乐观更新）
2. **组件透明**: UI 组件无需关心模式，仅调用 `useNotes()`
3. **缓存隔离**: 查询键包含 `mode` 参数，确保 Cloud 和 Private 数据不混淆
4. **类型统一**: 两种模式返回相同的数据结构，简化类型推导

### Alternatives Considered

- **创建独立的 usePrivateNotes hook**: 拒绝理由 - 导致代码重复，且组件需要根据模式选择不同 hook
- **使用 hook 参数传递模式**: 拒绝理由 - `useMode()` Context 更符合 React 设计模式，避免 prop drilling

---

## 6. RAG 搜索集成

### Decision

在 Private Mode 聊天中，复用 Knowledge Base 的 RAG 搜索流程：

```typescript
// client/src/main/ipc/note-handlers.ts
async function handleNoteSearch(query: string, noteIds: string[], limit: number) {
  // 1. 生成查询向量
  const queryEmbedding = await embeddingService.generateEmbedding(query)

  // 2. 在多个笔记向量表中搜索
  const searchPromises = noteIds.map(async (noteId) => {
    const tableName = `note_${noteId}`
    const results = await vectorDbManager.search(tableName, queryEmbedding, limit)

    // 3. 附加笔记元数据
    const note = await noteQueries.getNote(noteId)
    return results.map(r => ({
      content: r.content,
      similarity: 1 - r._distance,  // 余弦距离转相似度
      sourceType: 'note',
      sourceId: noteId,
      sourceName: note?.title || 'Untitled',
    }))
  })

  // 4. 合并并排序结果
  const allResults = (await Promise.all(searchPromises)).flat()
  return allResults
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}
```

### Rationale

1. **并行搜索**: 使用 `Promise.all` 同时搜索多个笔记表，提高性能
2. **相似度排序**: 按余弦相似度全局排序，确保返回最相关的内容
3. **元数据丰富**: 返回笔记标题和 ID，便于在 UI 中显示来源
4. **与 KB 一致**: 搜索结果格式与 Knowledge Base 完全一致，便于统一处理

### Alternatives Considered

- **串行搜索**: 拒绝理由 - 性能差，用户关联多个笔记时延迟明显
- **仅搜索第一个笔记**: 拒绝理由 - 违背用户期望，用户关联多个笔记是为了综合检索

---

## 7. 缓存失效策略

### Decision

遵循 Cloud Mode Notes 的缓存失效模式，并添加模式隔离：

```typescript
// 查询键工厂函数
export const noteKeys = {
  all: (mode: 'cloud' | 'private') => ['notes', mode] as const,
  lists: (mode: 'cloud' | 'private') => [...noteKeys.all(mode), 'list'] as const,
  details: (mode: 'cloud' | 'private') => [...noteKeys.all(mode), 'detail'] as const,
  detail: (id: string, mode: 'cloud' | 'private') =>
    [...noteKeys.details(mode), id] as const,
}

// 缓存失效规则
// - 创建笔记: invalidate noteKeys.lists(mode)
// - 更新笔记: invalidate noteKeys.lists(mode) + noteKeys.detail(id, mode)
// - 删除笔记: invalidate noteKeys.lists(mode) + noteKeys.detail(id, mode)
// - Embed 笔记: 无需失效（向量数据不影响笔记元数据）
```

### Rationale

1. **模式隔离**: 查询键包含 `mode` 参数，Cloud 和 Private 缓存独立
2. **精确失效**: 仅失效受影响的查询，避免不必要的重新获取
3. **一致性**: 与 Cloud Mode 保持相同的失效策略，降低维护成本

### Alternatives Considered

- **失效所有笔记缓存**: 拒绝理由 - 过度失效导致不必要的网络/IPC 请求
- **不使用模式参数**: 拒绝理由 - 模式切换时可能显示错误的数据

---

## 8. Embedding 队列管理

### Decision

复用 Knowledge Base 的全局串行队列：

```typescript
// client/src/main/local/services/note-embedding-service.ts
let embeddingQueue: Promise<any> = Promise.resolve()

export async function embedNote(noteId: string) {
  // 加入全局队列
  embeddingQueue = embeddingQueue.then(async () => {
    try {
      // 1. 获取笔记内容
      const note = await noteQueries.getNote(noteId)

      // 2. 分块
      const chunks = splitIntoChunks(note.content)

      // 3. 串行生成 embeddings (1000ms 延迟)
      const embeddings = await embeddingService.generateEmbeddingsBatchWithRetry(
        chunks,
        { delayBetweenRequests: 1000 },
        (progress) => {
          mainWindow.webContents.send('db:notes:embedding-progress', {
            noteId,
            percent: progress.percent,
            message: progress.message,
          })
        }
      )

      // 4. 存储向量
      const records = chunks.map((chunk, i) => ({
        id: `${noteId}_chunk_${i}`,
        content: chunk,
        embedding: embeddings[i],
      }))

      await vectorDbManager.createTable(`note_${noteId}`)
      await vectorDbManager.addRecords(`note_${noteId}`, records)

      return { success: true, chunksCount: chunks.length }
    } catch (error) {
      mainWindow.webContents.send('db:notes:embedding-failed', {
        noteId,
        error: error.message,
      })
      throw error
    }
  })

  return embeddingQueue
}
```

### Rationale

1. **避免 GPU 崩溃**: M4 Mac Metal GPU 无法并发处理多个 embedding 请求
2. **进度反馈**: 通过 IPC 事件实时通知前端处理进度
3. **错误隔离**: 单个笔记 embedding 失败不影响队列中的其他任务
4. **资源控制**: 串行处理确保内存和 GPU 使用可控

### Alternatives Considered

- **并发处理 embeddings**: 拒绝理由 - M4 Mac Metal GPU 崩溃问题（已在 Knowledge Base 中验证）
- **前端队列管理**: 拒绝理由 - 主进程管理更可靠，且可以在后台继续处理

---

## 9. 数据库初始化和迁移

### Decision

在 `client/src/main/local/db/init-db.ts` 中添加 `notes` 表初始化：

```typescript
export async function initializeDatabase(db: Database) {
  db.exec(`
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

### Rationale

1. **幂等性**: `IF NOT EXISTS` 确保多次初始化不会失败
2. **向后兼容**: 现有数据库升级时自动创建表
3. **索引优化**: 与 schema 定义保持一致

### Alternatives Considered

- **使用 drizzle-kit migrate**: 拒绝理由 - SQLite 迁移工具过于复杂，手动 SQL 更简单直接

---

## 10. 错误处理和回滚

### Decision

参考 Knowledge Base 的错误处理模式，实现资源追踪和回滚：

```typescript
async function embedNote(noteId: string) {
  const createdTable = false

  try {
    // 创建向量表
    await vectorDbManager.createTable(`note_${noteId}`)
    createdTable = true

    // 生成 embeddings
    const embeddings = await generateEmbeddings(...)

    // 存储向量
    await vectorDbManager.addRecords(...)

    return { success: true }
  } catch (error) {
    // 回滚：删除已创建的向量表
    if (createdTable) {
      await vectorDbManager.dropTable(`note_${noteId}`)
    }
    throw error
  }
}
```

### Rationale

1. **原子性**: 失败时自动清理中间状态，避免孤立数据
2. **用户体验**: 失败不会留下无效的向量表
3. **调试友好**: 清晰的错误传播路径

### Alternatives Considered

- **忽略中间状态**: 拒绝理由 - 导致孤立数据，长期累积影响性能和存储
- **手动清理**: 拒绝理由 - 依赖用户或开发者手动清理，不可靠

---

## Summary

所有技术决策已完成，关键设计原则：

1. **对齐 Cloud Mode**: 表结构、API 格式、UI 交互完全一致
2. **复用 Knowledge Base**: Embedding、向量存储、IPC 架构完全复用
3. **模式感知**: 前端 hooks 自动根据 `useMode()` 切换逻辑
4. **性能优化**: 串行 embedding、索引优化、缓存管理
5. **错误恢复**: 资源追踪、回滚机制、进度反馈

下一步: Phase 1 - 生成数据模型和 API 契约。
