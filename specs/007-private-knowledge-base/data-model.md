# 数据模型：Private Mode 知识库模块

**功能分支**: `007-private-knowledge-base`
**创建日期**: 2025-10-22
**关联文档**: [plan.md](./plan.md) | [spec.md](./spec.md) | [research.md](./research.md)

## 概述

本文档定义 Private Mode 知识库模块的完整数据模型，包括 SQLite 数据库 schema、LanceDB 向量表结构、以及与 Cloud Mode 的字段映射关系。

**设计原则**:
1. **字段严格匹配**: 与 Cloud Mode PostgreSQL schema 保持一致（去除分享相关字段）
2. **类型安全**: 使用 Drizzle ORM 确保端到端类型安全
3. **数据完整性**: 使用外键约束和级联删除确保数据一致性
4. **隔离性**: Cloud Mode 和 Private Mode 数据完全隔离（不同的数据库文件）

---

## SQLite Schema

### 表 1: knowledge_bases（知识库）

**用途**: 存储知识库的元数据

**字段定义**:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const knowledgeBases = sqliteTable("knowledge_bases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  starred: integer("starred", { mode: 'boolean' }).notNull().default(false),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).notNull()
    .$defaultFn(() => new Date()),
})
```

**字段说明**:

| 字段 | 类型 | 约束 | 说明 | Cloud Mode 对应字段 |
|-----|------|------|------|-------------------|
| `id` | TEXT | PRIMARY KEY | 知识库唯一标识 (UUID) | `id` (uuid) |
| `name` | TEXT | NOT NULL | 知识库名称 | `name` (text) |
| `description` | TEXT | - | 知识库描述（可选） | `description` (text) |
| `starred` | INTEGER (boolean) | NOT NULL, DEFAULT 0 | 是否星标 | `starred` (boolean) |
| `createdAt` | INTEGER (timestamp) | NOT NULL | 创建时间 (UNIX 时间戳) | `created_at` (timestamp with timezone) |
| `updatedAt` | INTEGER (timestamp) | NOT NULL | 更新时间 (UNIX 时间戳) | `updated_at` (timestamp with timezone) |

**去除的字段** (Cloud Mode 中存在但 Private Mode 不需要):

| 字段 | 类型 | 原因 |
|-----|------|------|
| `userId` | uuid | Private Mode 为单用户模式，无需用户隔离 |
| `isPublic` | boolean | 无分享功能，所有知识库都是私有的 |
| `shareSlug` | varchar(64) | 无分享功能，不需要分享标识符 |

**索引**:
- `PRIMARY KEY (id)`: 主键索引
- `INDEX idx_starred_created_at (starred, created_at)`: 支持按星标和时间排序查询

**示例数据**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "AI 研究论文集",
  "description": "收集 2023-2024 年的 AI 相关论文",
  "starred": true,
  "createdAt": 1729564800000,
  "updatedAt": 1729564800000
}
```

---

### 表 2: knowledge_base_files（知识库文件）

**用途**: 存储上传到知识库的文件元数据

**字段定义**:

```typescript
export const knowledgeBaseFiles = sqliteTable("knowledge_base_files", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  knowledgeBaseId: text("knowledge_base_id").notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  fileType: text("file_type"),
  storagePath: text("storage_path"),
  contentText: text("content_text"),
  status: text("status").notNull().default("processing"),
  createdAt: integer("created_at", { mode: 'timestamp' }).notNull()
    .$defaultFn(() => new Date()),
})
```

**字段说明**:

| 字段 | 类型 | 约束 | 说明 | Cloud Mode 对应字段 |
|-----|------|------|------|-------------------|
| `id` | TEXT | PRIMARY KEY | 文件唯一标识 (UUID) | `id` (uuid) |
| `knowledgeBaseId` | TEXT | NOT NULL, FOREIGN KEY | 所属知识库ID，级联删除 | `knowledge_base_id` (uuid) |
| `fileName` | TEXT | NOT NULL | 文件名 | `file_name` (text) |
| `fileSize` | INTEGER | NOT NULL | 文件大小（字节） | `file_size` (bigint) |
| `fileType` | TEXT | - | MIME 类型（如 application/pdf） | `file_type` (varchar(50)) |
| `storagePath` | TEXT | - | 本地文件路径（相对于 userData） | `storage_path` (text) |
| `contentText` | TEXT | - | 提取的文本内容 | `content_text` (text) |
| `status` | TEXT | NOT NULL, DEFAULT 'processing' | 处理状态: processing/completed/failed | `status` (varchar(20)) |
| `createdAt` | INTEGER (timestamp) | NOT NULL | 上传时间 (UNIX 时间戳) | `created_at` (timestamp with timezone) |

**外键约束**:
- `FOREIGN KEY (knowledgeBaseId) REFERENCES knowledge_bases(id) ON DELETE CASCADE`

**索引**:
- `PRIMARY KEY (id)`: 主键索引
- `INDEX idx_kb_id (knowledge_base_id)`: 支持按知识库查询文件

**状态转换**:
```
processing  →  completed  (文件处理成功)
processing  →  failed     (文件处理失败)
```

**示例数据**:
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "knowledgeBaseId": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "attention-is-all-you-need.pdf",
  "fileSize": 2048576,
  "fileType": "application/pdf",
  "storagePath": "documents/550e8400/660e8400-attention-is-all-you-need.pdf",
  "contentText": "Abstract\nThe dominant sequence transduction models...",
  "status": "completed",
  "createdAt": 1729564850000
}
```

---

## LanceDB 向量表

### 向量表结构

**表命名规则**: `kb_{knowledgeBaseId}`
- 每个知识库对应一个独立的向量表
- 示例: `kb_550e8400-e29b-41d4-a716-446655440000`

**字段定义**:

```typescript
interface VectorRecord {
  id: string              // 向量记录唯一标识 (UUID)
  fileId: string          // 所属文件ID
  content: string         // 文档片段文本内容
  embedding: Float32Array // 768维向量 (nomic-embed-text)
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|-----|------|------|
| `id` | string | 向量记录唯一标识 (UUID) |
| `fileId` | string | 所属文件ID，用于追溯来源 |
| `content` | string | 文档片段文本内容（1000字符，200字符重叠） |
| `embedding` | Float32Array(768) | 768维浮点数向量（nomic-embed-text模型生成） |

**创建向量表示例**:

```typescript
import * as lancedb from 'vectordb'

// 连接数据库
const dbPath = path.join(app.getPath('userData'), 'vector-db')
const db = await lancedb.connect(dbPath)

// 创建知识库向量表
const tableName = `kb_${knowledgeBaseId}`
const data = [
  {
    id: crypto.randomUUID(),
    fileId: '660e8400-e29b-41d4-a716-446655440001',
    content: 'The dominant sequence transduction models are based on...',
    embedding: new Float32Array(768) // 从 Ollama 获取
  }
]

const table = await db.createTable(tableName, data)
```

**向量检索示例**:

```typescript
// 生成查询向量
const queryEmbedding = await generateEmbedding("What is attention mechanism?")

// 执行向量搜索
const results = await table
  .search(new Float32Array(queryEmbedding))
  .limit(5)
  .execute()

// 结果格式
// [
//   {
//     id: "...",
//     fileId: "...",
//     content: "...",
//     _distance: 0.15  // 余弦距离，越小越相似
//   }
// ]
```

**索引策略**:

| 向量数量 | 索引类型 | 查询时间 | 说明 |
|---------|---------|---------|------|
| < 5000 | 无索引（暴力搜索） | 5-100ms | 适用于大多数知识库 |
| >= 5000 | IVF-PQ 索引 | 10-20ms | 自动创建索引提升性能 |

---

## 本地文件系统

### 文件存储结构

**存储路径**: `{userData}/documents/{knowledgeBaseId}/{fileId}-{fileName}`

**示例路径**:
```
/Users/username/Library/Application Support/rafa/documents/
├── 550e8400-e29b-41d4-a716-446655440000/
│   ├── 660e8400-e29b-41d4-a716-446655440001-attention-is-all-you-need.pdf
│   ├── 770e8400-e29b-41d4-a716-446655440002-bert-paper.pdf
│   └── 880e8400-e29b-41d4-a716-446655440003-gpt3-paper.pdf
└── 990e8400-e29b-41d4-a716-446655440010/
    └── ...
```

**文件命名规则**:
- 格式: `{fileId}-{originalFileName}`
- 目的: 避免文件名冲突，支持相同文件名的多个文件

**存储限制**:
- 单文件最大 100MB (在 `local.config.ts` 中配置)
- 支持的文件类型: .txt, .md, .pdf, .json, .html, .csv

---

## 数据关系图

```
┌─────────────────────┐
│  knowledge_bases    │
│  ─────────────────  │
│  id (PK)            │◄──┐
│  name               │   │
│  description        │   │
│  starred            │   │
│  createdAt          │   │
│  updatedAt          │   │
└─────────────────────┘   │
                          │ 1:N
                          │
        ┌─────────────────┴──────────────┐
        │                                 │
┌──────────────────────────┐   ┌──────────────────────┐
│ knowledge_base_files     │   │ LanceDB 向量表        │
│ ──────────────────────   │   │ kb_{knowledgeBaseId} │
│ id (PK)                  │   │ ────────────────────  │
│ knowledgeBaseId (FK) ────┼───┤ id                   │
│ fileName                 │   │ fileId               │
│ fileSize                 │   │ content              │
│ fileType                 │   │ embedding (768维)     │
│ storagePath              │   └──────────────────────┘
│ contentText              │
│ status                   │
│ createdAt                │
└──────────────────────────┘
        │
        │ 1:1
        ▼
┌─────────────────────────┐
│ 本地文件系统             │
│ {userData}/documents/   │
│ {knowledgeBaseId}/      │
│ {fileId}-{fileName}     │
└─────────────────────────┘
```

---

## Drizzle ORM 类型定义

### 自动生成的类型

```typescript
// 从 schema 自动推断
export type KnowledgeBase = InferSelectModel<typeof knowledgeBases>
export type NewKnowledgeBase = InferInsertModel<typeof knowledgeBases>
export type UpdateKnowledgeBase = Partial<Omit<NewKnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>>

export type KnowledgeBaseFile = InferSelectModel<typeof knowledgeBaseFiles>
export type NewKnowledgeBaseFile = InferInsertModel<typeof knowledgeBaseFiles>

// 示例类型
// KnowledgeBase = {
//   id: string
//   name: string
//   description: string | null
//   starred: boolean
//   createdAt: Date
//   updatedAt: Date
// }
```

### Zod 验证 Schema

```typescript
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'

// 自动从 Drizzle schema 生成
export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBases, {
  name: (schema) => schema.min(1, "Name is required").max(200, "Name too long"),
  description: (schema) => schema.max(1000, "Description too long").optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})

export const updateKnowledgeBaseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  starred: z.boolean().optional(),
})

export const selectKnowledgeBaseSchema = createSelectSchema(knowledgeBases)
```

---

## 数据迁移

### 初始化 SQLite 数据库

```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

// 创建数据库连接
const dbPath = path.join(app.getPath('userData'), 'private.db')
const sqlite = new Database(dbPath)
const db = drizzle(sqlite)

// 执行迁移
await migrate(db, { migrationsFolder: './drizzle/migrations' })
```

### Migration SQL 示例

```sql
-- 001_create_knowledge_bases.sql
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  starred INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_kb_starred_created_at ON knowledge_bases(starred, created_at);

-- 002_create_knowledge_base_files.sql
CREATE TABLE IF NOT EXISTS knowledge_base_files (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT,
  storage_path TEXT,
  content_text TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (knowledge_base_id)
    REFERENCES knowledge_bases(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_kb_files_kb_id ON knowledge_base_files(knowledge_base_id);
```

---

## 数据完整性

### 级联删除

删除知识库时的级联操作:

1. **SQLite 级联删除**: 自动删除 `knowledge_base_files` 表中的文件记录
   ```sql
   FOREIGN KEY (knowledge_base_id)
     REFERENCES knowledge_bases(id)
     ON DELETE CASCADE
   ```

2. **LanceDB 向量表删除**: 在应用层手动删除向量表
   ```typescript
   await db.dropTable(`kb_${knowledgeBaseId}`)
   ```

3. **本地文件删除**: 在应用层手动删除文件目录
   ```typescript
   await fs.rm(path.join(documentsPath, knowledgeBaseId), { recursive: true })
   ```

### 事务保证

删除知识库的完整流程（确保原子性）:

```typescript
async function deleteKnowledgeBase(knowledgeBaseId: string) {
  try {
    // 1. 删除 SQLite 记录（自动级联删除文件记录）
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, knowledgeBaseId))

    // 2. 删除 LanceDB 向量表
    await vectorDb.dropTable(`kb_${knowledgeBaseId}`)

    // 3. 删除本地文件
    const documentsPath = path.join(app.getPath('userData'), 'documents')
    await fs.rm(path.join(documentsPath, knowledgeBaseId), { recursive: true })

  } catch (error) {
    // 如果任何步骤失败，需要手动清理
    console.error('Failed to delete knowledge base:', error)
    throw error
  }
}
```

---

## 与 Cloud Mode 的字段映射

### knowledge_bases 表

| Private Mode (SQLite) | Cloud Mode (PostgreSQL) | 映射说明 |
|----------------------|------------------------|---------|
| `id: TEXT` | `id: uuid` | UUID 字符串 |
| `name: TEXT` | `name: text` | 完全一致 |
| `description: TEXT` | `description: text` | 完全一致 |
| `starred: INTEGER (boolean)` | `starred: boolean` | 0/1 映射到 false/true |
| `createdAt: INTEGER (timestamp)` | `created_at: timestamp with timezone` | UNIX 时间戳转 Date |
| `updatedAt: INTEGER (timestamp)` | `updated_at: timestamp with timezone` | UNIX 时间戳转 Date |
| *(无)* | `userId: uuid` | Private Mode 单用户，无此字段 |
| *(无)* | `isPublic: boolean` | Private Mode 无分享，无此字段 |
| *(无)* | `shareSlug: varchar(64)` | Private Mode 无分享，无此字段 |

### knowledge_base_files 表

| Private Mode (SQLite) | Cloud Mode (PostgreSQL) | 映射说明 |
|----------------------|------------------------|---------|
| `id: TEXT` | `id: uuid` | UUID 字符串 |
| `knowledgeBaseId: TEXT` | `knowledge_base_id: uuid` | UUID 字符串 |
| `fileName: TEXT` | `file_name: text` | 完全一致 |
| `fileSize: INTEGER` | `file_size: bigint` | SQLite INTEGER 可存储大整数 |
| `fileType: TEXT` | `file_type: varchar(50)` | MIME 类型字符串 |
| `storagePath: TEXT` | `storage_path: text` | 路径格式不同（本地 vs Supabase） |
| `contentText: TEXT` | `content_text: text` | 完全一致 |
| `status: TEXT` | `status: varchar(20)` | processing/completed/failed |
| `createdAt: INTEGER (timestamp)` | `created_at: timestamp with timezone` | UNIX 时间戳转 Date |

---

## 数据验证规则

### knowledge_bases

| 字段 | 验证规则 |
|-----|---------|
| `name` | 必填，1-200 字符 |
| `description` | 可选，最大 1000 字符 |
| `starred` | 布尔值 (true/false) |

### knowledge_base_files

| 字段 | 验证规则 |
|-----|---------|
| `fileName` | 必填，非空字符串 |
| `fileSize` | 必填，正整数，最大 100MB (104857600 字节) |
| `fileType` | 可选，有效的 MIME 类型 |
| `status` | 必填，枚举值: processing/completed/failed |

---

## 性能优化

### 索引策略

```sql
-- 知识库表
CREATE INDEX idx_kb_starred_created_at ON knowledge_bases(starred DESC, created_at DESC);

-- 文件表
CREATE INDEX idx_kb_files_kb_id ON knowledge_base_files(knowledge_base_id);
CREATE INDEX idx_kb_files_status ON knowledge_base_files(status);
```

### 查询优化

```typescript
// ✅ 使用索引查询（按星标和时间排序）
const kbs = await db.select()
  .from(knowledgeBases)
  .orderBy(desc(knowledgeBases.starred), desc(knowledgeBases.createdAt))

// ✅ 使用索引查询（按知识库ID获取文件）
const files = await db.select()
  .from(knowledgeBaseFiles)
  .where(eq(knowledgeBaseFiles.knowledgeBaseId, knowledgeBaseId))

// ❌ 避免全表扫描
const kbs = await db.select()
  .from(knowledgeBases)
  .where(like(knowledgeBases.name, '%keyword%'))  // 不走索引
```

---

## 总结

本数据模型设计遵循以下原则:

1. **✅ 字段严格匹配**: 与 Cloud Mode 保持一致，确保 UI 层无缝复用
2. **✅ 类型安全**: 使用 Drizzle ORM 和 Zod 实现端到端类型安全
3. **✅ 数据完整性**: 外键约束 + 级联删除确保数据一致性
4. **✅ 隔离性**: 独立的 SQLite 文件，与 Cloud Mode 数据完全隔离
5. **✅ 性能优化**: 合理的索引设计，满足查询性能要求

下一步将在 Phase 1 中定义 IPC 契约（`contracts/`）和快速开始指南（`quickstart.md`）。
