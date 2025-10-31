# Data Model: Private Mode

**Feature**: 006-private-mode
**生成日期**: 2025-10-20
**目的**: 定义 Private Mode 的本地数据存储结构

---

## 数据存储架构

Private Mode 使用 **SQLite** 作为本地数据库，**LanceDB** 作为向量数据库，数据完全存储在用户设备的 `userData` 目录。

### 存储位置

```
userData/                           # Electron 应用数据目录
├── rafa-private.db                # SQLite 数据库（对话、知识库元数据）
├── rafa-cloud.db                  # Cloud Mode 数据库（完全隔离）
├── vector-db/                     # LanceDB 向量数据库目录
│   ├── kb_<id>/                   # 每个知识库一个独立的 LanceDB table
│   └── ...
└── ollama/                        # Ollama 内嵌版本（仅在系统无 Ollama 时使用）
    ├── bin/                       # Ollama 可执行文件
    │   ├── ollama                 # macOS/Linux
    │   └── ollama.exe             # Windows
    └── models/                    # 下载的开源模型（如果使用内嵌版本）
        ├── llama3:8b/
        └── nomic-embed-text/
```

**各平台 userData 路径**:
- **macOS**: `~/Library/Application Support/Rafa/`
- **Windows**: `C:\Users\<用户名>\AppData\Roaming\Rafa\`
- **Linux**: `~/.config/Rafa/`

### Ollama 来源策略

Rafa 采用**智能检测**策略：

| 场景 | Ollama 位置 | 模型位置 | 磁盘占用 |
|------|------------|---------|---------|
| **用户已安装系统 Ollama** | 系统 (`/usr/local/bin/ollama`) | 系统 (`~/.ollama/models/`) | 0 MB (复用) |
| **用户未安装 Ollama** | 内嵌 (`userData/ollama/bin/`) | 内嵌 (`userData/ollama/models/`) | ~500MB (服务) + 模型大小 |

**优势**:
- ✅ 避免端口冲突（检测 localhost:11434）
- ✅ 节省磁盘空间（复用系统模型库）
- ✅ 不影响用户系统 Ollama（精确进程管理）

---

## SQLite Schema（Drizzle ORM）

### 1. Local Conversations（本地对话）

**表名**: `conversations`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| title | TEXT | NOT NULL | 对话标题 |
| modelId | TEXT | NOT NULL | 使用的本地模型 ID（如 'llama3:8b'） |
| createdAt | INTEGER | NOT NULL | 创建时间戳（Unix timestamp） |
| updatedAt | INTEGER | NOT NULL | 更新时间戳 |

**索引**:
- `idx_conversations_created_at` ON `createdAt DESC`

**关系**:
- 一对多: `conversations` → `messages`

---

### 2. Local Messages（本地消息）

**表名**: `messages`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| conversationId | TEXT | NOT NULL, FK | 关联的对话 ID |
| role | TEXT | NOT NULL | 'user' 或 'assistant' |
| content | TEXT | NOT NULL | 消息内容 |
| timestamp | INTEGER | NOT NULL | 消息时间戳 |

**外键**:
- `conversationId` REFERENCES `conversations(id)` ON DELETE CASCADE

**索引**:
- `idx_messages_conversation_timestamp` ON `(conversationId, timestamp)`

---

### 3. Local Knowledge Bases（本地知识库）

**表名**: `knowledge_bases`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| name | TEXT | NOT NULL | 知识库名称 |
| description | TEXT | NULL | 知识库描述 |
| embeddingModel | TEXT | NOT NULL | 使用的嵌入模型（如 'nomic-embed-text'） |
| createdAt | INTEGER | NOT NULL | 创建时间戳 |

**关系**:
- 一对多: `knowledge_bases` → `documents`

---

### 4. Local Documents（本地文档）

**表名**: `documents`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | UUID |
| knowledgeBaseId | TEXT | NOT NULL, FK | 关联的知识库 ID |
| fileName | TEXT | NOT NULL | 文件名 |
| filePath | TEXT | NOT NULL | 本地文件系统路径 |
| fileSize | INTEGER | NOT NULL | 文件大小（字节） |
| chunkCount | INTEGER | NOT NULL | 向量化片段数量 |
| uploadedAt | INTEGER | NOT NULL | 上传时间戳 |

**外键**:
- `knowledgeBaseId` REFERENCES `knowledge_bases(id)` ON DELETE CASCADE

**索引**:
- `idx_documents_kb_id` ON `knowledgeBaseId`

---

### 5. Local Models（本地模型配置）

**表名**: `models`

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PRIMARY KEY | 模型 ID（如 'llama3:8b'） |
| name | TEXT | NOT NULL | 显示名称 |
| size | INTEGER | NOT NULL | 模型大小（字节） |
| family | TEXT | NOT NULL | 模型家族（如 'llama'） |
| parameter_size | TEXT | NOT NULL | 参数大小（如 '8B'） |
| quantization | TEXT | NOT NULL | 量化级别（如 'Q4_0'） |
| downloadedAt | INTEGER | NOT NULL | 下载完成时间 |
| lastUsedAt | INTEGER | NULL | 最后使用时间 |

**索引**:
- `idx_models_last_used` ON `lastUsedAt DESC`

---

## LanceDB 向量数据 Schema

### Vector Table Schema（每个知识库一个 table）

**Table 命名**: `kb_<knowledgeBaseId>`

| 字段 | 类型 | 维度 | 说明 |
|------|------|------|------|
| id | STRING | - | 片段 ID（UUID） |
| embedding | VECTOR | 768 | 文本嵌入向量（Nomic Embed 模型） |
| text | STRING | - | 原始文本片段 |
| documentId | STRING | - | 关联的文档 ID |
| chunkIndex | INT | - | 片段在文档中的索引 |
| metadata | JSON | - | 额外元数据（文件名、页码等） |
| timestamp | TIMESTAMP | - | 向量化时间 |

**索引配置**:
```typescript
{
  type: 'ivf_pq',
  num_partitions: 256,
  num_sub_vectors: 96
}
```

---

## 状态转换

### 对话生命周期

```
[创建] → [活跃] → [归档]
         ↓
      [删除]（级联删除所有消息）
```

### 知识库生命周期

```
[创建] → [上传文档] → [向量化中] → [就绪]
         ↓                          ↓
      [删除文档]                  [对话引用]
                                   ↓
                                [删除]（级联删除文档和向量）
```

### 模型生命周期

```
[市场浏览] → [下载中] → [已安装] → [使用中]
                        ↓
                     [删除]
```

---

## 数据验证规则

### 对话
- `title`: 非空，最大 200 字符
- `modelId`: 必须在已安装模型列表中

### 消息
- `role`: 仅允许 'user' 或 'assistant'
- `content`: 非空，最大 100,000 字符

### 知识库
- `name`: 非空，最大 100 字符
- `embeddingModel`: 必须在支持的嵌入模型列表中

### 文档
- `fileName`: 非空，符合文件名规范
- `filePath`: 绝对路径，文件必须存在
- `fileSize`: > 0，< 100MB（单文件限制）

---

## 数据完整性

### 级联删除规则

- **删除对话** → 自动删除所有关联消息
- **删除知识库** → 自动删除所有关联文档 + LanceDB 向量表
- **删除文档** → 保留知识库，更新向量表（移除相关向量）

### 事务保证

所有写操作使用 SQLite 事务确保原子性：

```typescript
// 示例：删除知识库的事务操作
db.transaction(() => {
  // 1. 删除 SQLite 中的文档记录
  db.delete(documents).where(eq(documents.knowledgeBaseId, kbId))

  // 2. 删除知识库记录
  db.delete(knowledgeBases).where(eq(knowledgeBases.id, kbId))

  // 3. 删除 LanceDB 向量表（外部操作，需单独处理）
  await lanceDB.dropTable(`kb_${kbId}`)
})
```

---

## 性能考虑

### 索引策略
- 对话列表按 `createdAt DESC` 排序 → 索引
- 消息查询按 `conversationId + timestamp` → 复合索引
- 文档查询按 `knowledgeBaseId` → 索引

### 向量搜索优化
- 使用 IVF-PQ 索引加速搜索
- 默认 top-k = 10，可调整
- 向量维度 = 768（Nomic Embed 标准）

### 存储优化
- SQLite WAL 模式启用（并发读写）
- LanceDB 使用磁盘存储（减少内存占用）
- 定期 VACUUM（压缩数据库文件）

---

## 迁移与备份

### 数据备份
用户可以直接备份 `userData` 目录：
- `rafa-private.db` → SQLite 数据库文件
- `vector-db/` → 向量数据目录
- `documents/` → 原始文档文件（如需保留）

### Cloud ↔ Private 数据隔离
- Cloud Mode 数据: `rafa-cloud.db`（仅云端模式可访问）
- Private Mode 数据: `rafa-private.db`（仅私有模式可访问）
- **不支持自动迁移**（FR-013），用户可手动导出/导入

---

## 实体关系图（ERD）

```
Conversations (1) ──< Messages (N)

Knowledge Bases (1) ──< Documents (N)
                  │
                  └──< LanceDB Vectors (N)

Models (独立表，无外键关联)
```

---

## Drizzle ORM Schema 代码

完整的 schema 定义位于：`client/db/schema-local.ts`

关键代码片段：

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const localConversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  modelId: text('model_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const localMessages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => localConversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
})

// ... (其他表定义见完整文件)
```

---

## 总结

Private Mode 数据模型设计原则：

1. **完全本地化**: 所有数据存储在用户设备，零云端依赖
2. **数据隔离**: 独立的 SQLite 文件，与 Cloud Mode 完全隔离
3. **级联删除**: 确保数据一致性，无孤立记录
4. **性能优化**: 合理的索引策略和向量搜索配置
5. **可备份性**: 用户可轻松备份整个数据目录

准备进入 API Contracts 设计（Electron IPC）。
