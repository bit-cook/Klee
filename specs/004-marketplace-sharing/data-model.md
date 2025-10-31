# 数据模型：市场商店分享功能

**功能**: 004-marketplace-sharing
**日期**: 2025-10-19

## 概述

本功能扩展现有的 `chatConfigs` 和 `knowledgeBases` 表，添加市场分享相关字段，无需创建新表。所有数据模型基于 Drizzle ORM schema 定义。

## 实体关系图

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│  chatConfigs    │────┬───→│ chatConfigKB (关联表) │←───┬────│ knowledgeBases  │
│                 │    │    └──────────────────────┘    │    │                 │
│ + avatar        │    │                                │    │ + isPublic      │
│ + isPublic      │    │    ┌──────────────────────┐    │    │ + shareSlug     │
│ + shareSlug     │    └───→│  knowledgeBaseFiles  │←───┘    └─────────────────┘
│ + sourceShareSlug│         └──────────────────────┘
└─────────────────┘
       │
       │ userId (多租户隔离)
       ↓
  ┌─────────┐
  │  users  │ (Supabase Auth - 外部)
  └─────────┘
```

## 表结构变更

### chatConfigs (扩展)

**新增字段**:

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| `avatar` | `TEXT` | `NULL` | Agent 头像，支持 emoji 或图片 URL |
| `isPublic` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | 是否分享到市场 |
| `shareSlug` | `VARCHAR(64)` | `UNIQUE, NULL` | 唯一分享标识符，用于公开链接 |
| `sourceShareSlug` | `VARCHAR(64)` | `NULL` | 安装来源的 shareSlug，用于追溯和防重复安装 |

**索引**:
```sql
CREATE INDEX chat_configs_is_public_idx ON chat_configs(is_public) WHERE is_public = TRUE;
CREATE INDEX chat_configs_share_slug_idx ON chat_configs(share_slug);
CREATE INDEX chat_configs_source_share_slug_idx ON chat_configs(source_share_slug);
```

**Drizzle Schema 扩展**:
```typescript
// server/db/schema.ts
export const chatConfigs = pgTable(
  "chat_configs",
  {
    // ... 现有字段
    avatar: text("avatar"),
    isPublic: boolean("is_public").notNull().default(false),
    shareSlug: varchar("share_slug", { length: 64 }),
    sourceShareSlug: varchar("source_share_slug", { length: 64 }),
  },
  (table) => [
    // ... 现有索引
    index("chat_configs_is_public_idx").on(table.isPublic).where(eq(table.isPublic, true)),
    index("chat_configs_share_slug_idx").on(table.shareSlug),
    index("chat_configs_source_share_slug_idx").on(table.sourceShareSlug),
    unique("chat_configs_share_slug_unique").on(table.shareSlug),
  ]
)
```

**Zod Validation Schema**:
```typescript
// 使用 drizzle-zod 自动生成
export const insertChatConfigSchema = createInsertSchema(chatConfigs, {
  name: (schema) => schema.min(1).max(80),
  avatar: (schema) => schema.max(500).optional(),
  shareSlug: (schema) => schema.max(64).optional(),
  sourceShareSlug: (schema) => schema.max(64).optional(),
})

export const updateChatConfigSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  avatar: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  shareSlug: z.string().max(64).optional(),
  // 其他可更新字段...
})
```

---

### knowledgeBases (扩展)

**新增字段**:

| 字段 | 类型 | 约束 | 描述 |
|------|------|------|------|
| `isPublic` | `BOOLEAN` | `NOT NULL DEFAULT FALSE` | 是否分享到市场 |
| `shareSlug` | `VARCHAR(64)` | `UNIQUE, NULL` | 唯一分享标识符 |

**索引**:
```sql
CREATE INDEX knowledge_bases_is_public_idx ON knowledge_bases(is_public) WHERE is_public = TRUE;
CREATE INDEX knowledge_bases_share_slug_idx ON knowledge_bases(share_slug);
```

**Drizzle Schema 扩展**:
```typescript
// server/db/schema.ts
export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    // ... 现有字段
    isPublic: boolean("is_public").notNull().default(false),
    shareSlug: varchar("share_slug", { length: 64 }),
  },
  (table) => [
    // ... 现有索引
    index("knowledge_bases_is_public_idx").on(table.isPublic).where(eq(table.isPublic, true)),
    index("knowledge_bases_share_slug_idx").on(table.shareSlug),
    unique("knowledge_bases_share_slug_unique").on(table.shareSlug),
  ]
)
```

**Zod Validation Schema**:
```typescript
export const updateKnowledgeBaseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  starred: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  shareSlug: z.string().max(64).optional(),
})
```

---

## 数据完整性规则

### 唯一性约束

1. **shareSlug 全局唯一**: `chatConfigs.shareSlug` 和 `knowledgeBases.shareSlug` 各自唯一，使用数据库 UNIQUE 约束
2. **安装防重复**: 检查 `(userId, sourceShareSlug)` 组合，防止同一用户重复安装同一 Agent

### 级联规则

1. **Agent 删除**:
   - 用户删除自己的 ChatConfig → 不影响其他用户已安装的副本（因为是独立记录）
   - 取消分享（isPublic = false）→ 新用户无法安装，已安装的不受影响

2. **知识库删除**:
   - 用户删除自己的知识库 → chatConfigKnowledgeBases 关联记录级联删除（CASCADE）
   - 取消分享 → 已引用该知识库的 Agent 仍保留关联，但需在 UI 显示"知识库不可用"

3. **用户删除**:
   - Supabase Auth 用户删除 → 所有 chatConfigs 和 knowledgeBases 记录应级联删除（需在数据库层配置）

### 状态转换

```
┌─────────────┐  分享操作      ┌─────────────┐
│  Private    │───────────────→│   Public    │
│ ChatConfig  │                │ ChatConfig  │
│             │←───────────────│             │
└─────────────┘  取消分享      └─────────────┘
                                      │
                                      │ 安装操作
                                      ↓
                              ┌─────────────┐
                              │  Installed  │
                              │ ChatConfig  │
                              │ (Private)   │
                              └─────────────┘
```

**状态字段**:
- `isPublic = false`: 私有（默认）
- `isPublic = true, shareSlug != null`: 已分享到市场
- `sourceShareSlug != null`: 从市场安装的副本

---

## 查询模式

### 市场列表查询（公开 Agent）

```typescript
// server/db/queries/marketplace.ts
export const getPublicAgents = async (
  page: number = 1,
  search?: string
) => {
  const limit = 20
  const offset = (page - 1) * limit

  let query = db
    .select({
      id: chatConfigs.id,
      avatar: chatConfigs.avatar,
      name: chatConfigs.name,
      systemPrompt: chatConfigs.systemPrompt,
      defaultModel: chatConfigs.defaultModel,
      shareSlug: chatConfigs.shareSlug,
      userId: chatConfigs.userId,
      updatedAt: chatConfigs.updatedAt,
    })
    .from(chatConfigs)
    .where(eq(chatConfigs.isPublic, true))
    .orderBy(desc(chatConfigs.updatedAt))
    .limit(limit)
    .offset(offset)

  if (search) {
    query = query.where(
      or(
        ilike(chatConfigs.name, `%${search}%`),
        ilike(chatConfigs.systemPrompt, `%${search}%`)
      )
    )
  }

  return await query
}
```

### Agent 详情查询（包含知识库）

```typescript
export const getAgentByShareSlug = async (shareSlug: string) => {
  const [agent] = await db
    .select()
    .from(chatConfigs)
    .where(
      and(
        eq(chatConfigs.shareSlug, shareSlug),
        eq(chatConfigs.isPublic, true)
      )
    )
    .limit(1)

  if (!agent) return null

  // 查询关联的知识库
  const knowledgeBases = await db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
      isPublic: knowledgeBases.isPublic,
    })
    .from(chatConfigKnowledgeBases)
    .innerJoin(
      knowledgeBases,
      eq(chatConfigKnowledgeBases.knowledgeBaseId, knowledgeBases.id)
    )
    .where(eq(chatConfigKnowledgeBases.chatConfigId, agent.id))

  return { ...agent, knowledgeBases }
}
```

### 用户可访问的知识库（私有 + 公开）

```typescript
export const getAccessibleKnowledgeBases = async (userId: string) => {
  return await db
    .select()
    .from(knowledgeBases)
    .where(
      or(
        eq(knowledgeBases.userId, userId),
        eq(knowledgeBases.isPublic, true)
      )
    )
    .orderBy(desc(knowledgeBases.updatedAt))
}
```

### 检查是否已安装

```typescript
export const checkAgentInstalled = async (
  userId: string,
  sourceShareSlug: string
): Promise<boolean> => {
  const [existing] = await db
    .select({ id: chatConfigs.id })
    .from(chatConfigs)
    .where(
      and(
        eq(chatConfigs.userId, userId),
        eq(chatConfigs.sourceShareSlug, sourceShareSlug)
      )
    )
    .limit(1)

  return !!existing
}
```

---

## 迁移脚本

### 生成迁移

```bash
# 修改 schema.ts 后运行
npx drizzle-kit generate
```

### 执行迁移

```bash
# 推送到 Supabase 数据库
npx drizzle-kit push
```

### 验证迁移

迁移执行后，直接在 Supabase Dashboard 中验证：
1. 打开 Supabase 项目控制台
2. 进入 Table Editor
3. 检查 `chat_configs` 和 `knowledge_bases` 表是否包含新字段
4. 验证索引是否正确创建

### SQL 迁移内容（预期）

```sql
-- Migration: Add marketplace sharing fields
-- Generated: 2025-10-19

-- Add fields to chat_configs
ALTER TABLE chat_configs
ADD COLUMN avatar TEXT,
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN share_slug VARCHAR(64) UNIQUE,
ADD COLUMN source_share_slug VARCHAR(64);

-- Add fields to knowledge_bases
ALTER TABLE knowledge_bases
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN share_slug VARCHAR(64) UNIQUE;

-- Create indexes for performance
CREATE INDEX chat_configs_is_public_idx
ON chat_configs(is_public)
WHERE is_public = TRUE;

CREATE INDEX chat_configs_share_slug_idx
ON chat_configs(share_slug);

CREATE INDEX chat_configs_source_share_slug_idx
ON chat_configs(source_share_slug);

CREATE INDEX knowledge_bases_is_public_idx
ON knowledge_bases(is_public)
WHERE is_public = TRUE;

CREATE INDEX knowledge_bases_share_slug_idx
ON knowledge_bases(share_slug);

-- Add comments for documentation
COMMENT ON COLUMN chat_configs.avatar IS 'Agent avatar: emoji or image URL';
COMMENT ON COLUMN chat_configs.is_public IS 'Whether the agent is shared to marketplace';
COMMENT ON COLUMN chat_configs.share_slug IS 'Unique slug for public marketplace links';
COMMENT ON COLUMN chat_configs.source_share_slug IS 'Source slug if installed from marketplace';

COMMENT ON COLUMN knowledge_bases.is_public IS 'Whether the knowledge base is shared to marketplace';
COMMENT ON COLUMN knowledge_bases.share_slug IS 'Unique slug for public marketplace links';
```

---

## 数据验证规则

### Avatar 验证

```typescript
const avatarSchema = z.string()
  .max(500, "Avatar too long")
  .refine(
    (val) => {
      // 允许 emoji
      const emojiRegex = /^[\p{Emoji}]+$/u
      if (emojiRegex.test(val)) return true

      // 允许 HTTP(S) URL
      try {
        const url = new URL(val)
        return url.protocol === 'http:' || url.protocol === 'https:'
      } catch {
        return false
      }
    },
    "Avatar must be an emoji or valid image URL"
  )
  .optional()
```

### ShareSlug 验证

```typescript
const shareSlugSchema = z.string()
  .length(10, "Share slug must be 10 characters")
  .regex(/^[a-zA-Z0-9_-]+$/, "Share slug contains invalid characters")
```

---

## 性能考量

### 索引策略

1. **部分索引**: `WHERE is_public = TRUE` 只索引公开项，减少索引大小和维护成本
2. **覆盖索引**: 考虑为常用查询创建覆盖索引（包含所有 SELECT 字段），避免回表

### 查询优化

1. **分页**: 使用 `LIMIT + OFFSET`，前端使用无限滚动或分页器
2. **搜索**: 当前使用 `ILIKE`，如果搜索负载高，考虑添加 pg_trgm 扩展实现模糊搜索
3. **缓存**: TanStack Query 在前端缓存 2 分钟，减少数据库查询

### 预期性能指标

- 市场列表查询（20 条）: < 50ms
- Agent 详情查询（含知识库）: < 100ms
- 安装操作（事务）: < 200ms
- 搜索查询（ILIKE）: < 150ms

---

## 安全考虑

### 多租户隔离

- 所有私有数据查询必须包含 `WHERE userId = $currentUserId`
- 公开数据访问仅允许读取，禁止修改
- shareSlug 查询使用 `AND isPublic = TRUE` 双重验证

### SQL 注入防护

- 所有查询使用 Drizzle ORM 参数化查询
- 搜索关键词使用 prepared statements
- 禁止拼接 SQL 字符串

### 数据泄露防护

- 公开 API 不返回 userId（仅返回 author 名称）
- shareSlug 使用加密随机生成，不可枚举
- 敏感字段（如 email）永不暴露在公开 API
