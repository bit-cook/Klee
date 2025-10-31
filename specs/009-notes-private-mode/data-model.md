# Data Model: Notes Private Mode

**Feature**: Notes Private Mode
**Date**: 2025-10-23
**Status**: Complete

本文档定义 Notes Private Mode 的数据模型，包括 SQLite 表结构、LanceDB 向量表、实体关系和验证规则。

---

## Entity-Relationship Diagram

```
┌─────────────────────┐
│   LocalNote         │
│ ─────────────────── │
│ id (PK)             │
│ title               │
│ content             │
│ starred             │
│ createdAt           │
│ updatedAt           │
└──────────┬──────────┘
           │ 1
           │
           │ owns
           │
           │ 1
┌──────────▼──────────────────────┐
│  LanceDB Table                  │
│  note_{noteId}                  │
│ ─────────────────────────────── │
│  Records: NoteVectorRecord[]    │
│  - id: {noteId}_chunk_{index}   │
│  - content: string              │
│  - embedding: number[768]       │
└─────────────────────────────────┘

┌─────────────────────┐
│ LocalChatSession    │
│ ─────────────────── │
│ id (PK)             │
│ availableNoteIds    │◀───── references (JSON array)
│ ...                 │
└─────────────────────┘
```

**关系说明**:
- 一个笔记 (`LocalNote`) 拥有一个 LanceDB 向量表 (`note_{noteId}`)
- 一个聊天会话 (`LocalChatSession`) 可以关联多个笔记（通过 `availableNoteIds` JSON 数组）
- 删除笔记时，级联删除对应的向量表

---

## 1. LocalNote Entity

### SQLite Table Definition

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,              -- UUID, 应用层生成
  title TEXT NOT NULL,              -- 笔记标题 (1-200 字符)
  content TEXT NOT NULL,            -- 笔记内容 (Markdown/HTML)
  starred INTEGER NOT NULL DEFAULT 0, -- 星标状态 (0=false, 1=true)
  created_at INTEGER NOT NULL,      -- Unix timestamp (毫秒)
  updated_at INTEGER NOT NULL       -- Unix timestamp (毫秒)
);

CREATE INDEX notes_starred_updated_at_idx ON notes (starred, updated_at);
```

### TypeScript Schema (Drizzle ORM)

```typescript
// client/src/main/local/db/schema.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod'

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

### Field Specifications

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID (v4), 渲染进程生成 |
| `title` | TEXT | NOT NULL, 1-200 chars | 笔记标题 |
| `content` | TEXT | NOT NULL | 笔记内容 (Markdown/HTML), 默认空字符串 |
| `starred` | INTEGER | NOT NULL, DEFAULT 0 | 布尔值: 0=false, 1=true |
| `createdAt` | INTEGER | NOT NULL | Unix timestamp (毫秒), 创建时生成 |
| `updatedAt` | INTEGER | NOT NULL | Unix timestamp (毫秒), 每次更新时更新 |

### Validation Rules

1. **Title**:
   - 必填 (创建时)
   - 长度: 1-200 字符
   - 错误消息: "Title is required" / "Title too long"

2. **Content**:
   - 可选 (默认空字符串)
   - 无最大长度限制（SQLite TEXT 类型支持 ~1GB）
   - 实际限制: 100,000 字符 (应用层强制，见 Assumptions)

3. **Starred**:
   - 布尔值 (0 或 1)
   - 默认: false (0)

4. **Timestamps**:
   - Unix timestamp (毫秒)
   - 自动管理: `createdAt` 在创建时设置，`updatedAt` 在每次更新时更新

### State Transitions

笔记实体的状态转换：

```
[创建] → [未星标, 未嵌入]
   ↓
[星标] ↔ [取消星标]  (starred: true ↔ false)
   ↓
[编辑] → [updatedAt 更新]
   ↓
[嵌入] → [LanceDB 表创建, 向量存储]
   ↓
[删除] → [SQLite 记录删除, LanceDB 表删除]
```

---

## 2. NoteVectorRecord Entity (LanceDB)

### Table Naming Convention

每个笔记对应一个独立的 LanceDB 向量表：
- 表名: `note_{noteId}`
- 示例: `note_550e8400-e29b-41d4-a716-446655440000`

### Vector Record Structure

```typescript
// client/src/main/local/services/vector-db-manager.ts
interface NoteVectorRecord {
  id: string          // 格式: {noteId}_chunk_{index}
  content: string     // 文本块内容 (最大 1000 字符)
  embedding: number[] // 768 维向量 (nomic-embed-text)
}
```

### Field Specifications

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识符, 格式: `{noteId}_chunk_{0,1,2,...}` |
| `content` | string | 笔记内容的文本块 (分块大小: 1000 字符, 重叠: 200 字符) |
| `embedding` | number[] | 768 维向量 (nomic-embed-text 模型生成) |

### Example

```typescript
// 笔记 ID: 550e8400-e29b-41d4-a716-446655440000
// 笔记内容: "This is a long note content..." (2500 字符)

// 分块后的向量记录:
const records: NoteVectorRecord[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000_chunk_0',
    content: 'This is a long note content...',  // 前 1000 字符
    embedding: [0.123, -0.456, ...],              // 768 维向量
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440000_chunk_1',
    content: '...note content continues...',     // 字符 800-1800 (重叠 200)
    embedding: [0.789, -0.012, ...],
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440000_chunk_2',
    content: '...final chunk',                   // 字符 1600-2500
    embedding: [-0.345, 0.678, ...],
  },
]
```

---

## 3. LocalChatSession Entity (关联关系)

### Relevant Fields

```typescript
// client/src/main/local/db/schema.ts
export const localChatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  // ... other fields
  availableNoteIds: text('available_note_ids').notNull().default('[]'),
})
```

### Field Specification

| 字段 | 类型 | 说明 |
|------|------|------|
| `availableNoteIds` | TEXT (JSON) | 笔记 ID 数组, 格式: `["uuid1","uuid2",...]` |

### Validation Rules

```typescript
export const updateLocalChatSessionSchema = z.object({
  availableNoteIds: z.array(z.string().uuid()).optional(),
  // ... other fields
})
```

### Example

```json
{
  "id": "chat-123",
  "title": "Project Discussion",
  "availableNoteIds": "[\"note-456\",\"note-789\"]",
  "availableKnowledgeBaseIds": "[\"kb-001\"]"
}
```

**说明**: 聊天会话可以同时关联笔记和知识库，RAG 搜索时同时检索两者。

---

## 4. Data Integrity Rules

### Foreign Key Constraints

**SQLite 外键配置**:
```sql
PRAGMA foreign_keys = ON;
```

**注意**: 由于 `availableNoteIds` 是 JSON 数组，无法使用外键约束。应用层需要处理以下情况：
- 删除笔记时，不自动更新聊天会话的 `availableNoteIds`
- RAG 搜索时，跳过不存在的笔记 ID

### Cascade Deletion Rules

| 操作 | 影响 |
|------|------|
| 删除笔记 (`LocalNote`) | 1. SQLite 记录删除<br>2. LanceDB 向量表删除 (`DROP TABLE note_{noteId}`)<br>3. 聊天会话的 `availableNoteIds` **不自动更新** |
| 删除聊天会话 | 笔记不受影响 |

### Uniqueness Constraints

- `LocalNote.id`: PRIMARY KEY (唯一)
- `NoteVectorRecord.id`: LanceDB 自动保证唯一性

### Indexing Strategy

```sql
-- 星标和更新时间复合索引 (支持分组查询)
CREATE INDEX notes_starred_updated_at_idx ON notes (starred, updated_at);
```

**查询优化**:
- 快速查询星标笔记: `WHERE starred = 1 ORDER BY updated_at DESC`
- 快速查询最近笔记: `WHERE starred = 0 ORDER BY updated_at DESC`

---

## 5. Data Migration Notes

### 从 Cloud Mode 迁移到 Private Mode

**字段映射** (Cloud Mode `notes` → Private Mode `localNotes`):

| Cloud Mode 字段 | Private Mode 字段 | 处理方式 |
|-----------------|-------------------|----------|
| `id` | `id` | 直接复制 |
| `userId` | (移除) | 单用户模式，无需此字段 |
| `title` | `title` | 直接复制 |
| `content` | `content` | 直接复制 |
| `starred` | `starred` | 直接复制 |
| `createdAt` | `createdAt` | 转换: PostgreSQL timestamp → Unix timestamp (毫秒) |
| `updatedAt` | `updatedAt` | 转换: PostgreSQL timestamp → Unix timestamp (毫秒) |

**Embeddings 迁移**:
- Cloud Mode: PostgreSQL `noteEmbeddings` 表 (1536 维向量)
- Private Mode: LanceDB `note_{noteId}` 表 (768 维向量)
- **不兼容**: 向量维度不同，需要重新生成 embeddings

### 从 Private Mode 迁移到 Cloud Mode

逆向映射，增加 `userId` 字段（需要用户提供）。

---

## 6. Type System Overview

### Type Hierarchy

```
└── LocalNote (InferSelectModel<typeof localNotes>)
    ├── NewLocalNote (InferInsertModel<typeof localNotes>)
    │   └── insertLocalNoteSchema (Zod validator)
    └── UpdateLocalNote
        └── updateLocalNoteSchema (Zod validator)

└── NoteVectorRecord (interface)
    └── Used in vectorDbManager.addRecords()

└── LocalChatSession
    └── availableNoteIds: string[] (parsed from JSON TEXT)
```

### Type Safety Guarantees

1. **Schema → Types**: drizzle-orm 自动推导 `LocalNote` 类型
2. **Schema → Validators**: drizzle-zod 自动生成 Zod 验证器
3. **No Manual Types**: 禁止手动定义重复类型

---

## 7. Example CRUD Operations

### Create

```typescript
import { v4 as uuidv4 } from 'uuid'
import { localNotes, insertLocalNoteSchema } from '@/db/schema'

const newNote = {
  id: uuidv4(),
  title: 'My First Note',
  content: '# Hello World\n\nThis is my first note.',
  starred: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// 验证
const validatedNote = insertLocalNoteSchema.parse(newNote)

// 插入
await db.insert(localNotes).values(validatedNote)
```

### Read

```typescript
// 查询所有笔记
const allNotes = await db.select().from(localNotes)

// 查询星标笔记
const starredNotes = await db
  .select()
  .from(localNotes)
  .where(eq(localNotes.starred, true))
  .orderBy(desc(localNotes.updatedAt))

// 查询单个笔记
const note = await db
  .select()
  .from(localNotes)
  .where(eq(localNotes.id, noteId))
  .limit(1)
```

### Update

```typescript
import { updateLocalNoteSchema } from '@/db/schema'

const updates = {
  title: 'Updated Title',
  updatedAt: new Date(),
}

// 验证
const validatedUpdates = updateLocalNoteSchema.parse(updates)

// 更新
await db
  .update(localNotes)
  .set(validatedUpdates)
  .where(eq(localNotes.id, noteId))
```

### Delete

```typescript
// 删除 SQLite 记录
await db.delete(localNotes).where(eq(localNotes.id, noteId))

// 删除 LanceDB 向量表
await vectorDbManager.dropTable(`note_${noteId}`)
```

---

## Summary

数据模型已完成定义，核心特性：

1. **类型安全**: 使用 drizzle-orm + drizzle-zod 自动生成类型和验证器
2. **对齐 Cloud Mode**: 字段名和结构与 Cloud Mode 完全一致（仅移除 `userId`）
3. **向量隔离**: 每个笔记独立的 LanceDB 向量表
4. **级联删除**: 笔记删除时自动清理向量数据
5. **索引优化**: 复合索引支持高效分组查询

下一步: 生成 IPC 契约定义 (contracts/note-ipc.md)。
