# 研究文档：市场商店分享功能

**功能**: 004-marketplace-sharing
**日期**: 2025-10-19
**状态**: 已完成

## 技术决策

### 1. shareSlug 生成方案

**决策**: 使用 nanoid 生成唯一的分享链接标识符

**理由**:
- **体积小**: nanoid 压缩后仅 130 字节，而 uuid 需要 3 KB
- **安全性**: 使用硬件随机生成器，碰撞概率极低
- **URL 友好**: 默认字符集不包含特殊字符，适合用于 URL
- **性能**: 比 uuid v4 快 60%
- **可配置**: 可自定义长度和字符集，默认 21 字符已足够（碰撞概率 1% 需要 ~4 million 年产生 1000 个 ID/小时）

**考虑的替代方案**:
- **uuid v4**: 标准化但体积较大，性能较慢，URL 不友好（包含连字符）
- **自定义方案**: 基于 name + timestamp + random，但需要自行处理碰撞检测，安全性和可维护性较差

**实施细节**:
```typescript
// server/src/lib/slug-generator.ts
import { nanoid } from 'nanoid'

export function generateShareSlug(): string {
  // 使用 10 字符长度，足够唯一且 URL 简洁
  // 碰撞概率：生成 1 billion IDs 需要 ~25 years 才有 1% 碰撞概率
  return nanoid(10)
}
```

**依赖添加**: `npm install nanoid`（当前版本 5.x，约 130 bytes）

---

### 2. 测试策略

**决策**: 暂不引入自动化测试框架，依赖手动测试和类型安全

**理由**:
- 项目当前没有测试框架，引入测试需要额外的配置和学习成本
- Hono RPC + Drizzle + drizzle-zod 的组合已提供强类型安全，可以在编译时捕获大量错误
- 手动测试结合 TanStack Query DevTools 可以验证数据流和缓存行为

**手动测试策略**:
1. **类型安全验证**: 使用 `npx tsc --noEmit` 检查类型错误
2. **API 端点测试**: 使用浏览器开发工具或 Postman 手动测试每个端点
3. **UI 流程测试**: 按用户故事逐个验证（从 Chat 创建 Agent、分享、浏览市场、安装）
4. **边缘情况验证**: 手动测试空数据、重复安装、并发操作等场景
5. **TanStack Query DevTools**: 监控缓存状态、请求重复、失效逻辑

**未来改进建议**: 如果项目规模扩大，建议引入 Vitest + Testing Library 进行组件和集成测试

---

### 3. 数据库迁移方案

**决策**: 使用 Drizzle Kit 生成和执行迁移

**理由**:
- Drizzle Kit 是项目已使用的 ORM 配套工具
- 自动根据 schema 变更生成 SQL 迁移文件
- 支持回滚和版本控制
- 与现有 Drizzle ORM 工作流一致

**迁移内容**:
```sql
-- 为 chatConfigs 表添加字段
ALTER TABLE chat_configs ADD COLUMN avatar TEXT;
ALTER TABLE chat_configs ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chat_configs ADD COLUMN share_slug VARCHAR(64) UNIQUE;

-- 为 knowledgeBases 表添加字段
ALTER TABLE knowledge_bases ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE knowledge_bases ADD COLUMN share_slug VARCHAR(64) UNIQUE;

-- 创建索引以优化查询性能
CREATE INDEX chat_configs_is_public_idx ON chat_configs(is_public) WHERE is_public = TRUE;
CREATE INDEX knowledge_bases_is_public_idx ON knowledge_bases(is_public) WHERE is_public = TRUE;
CREATE INDEX chat_configs_share_slug_idx ON chat_configs(share_slug);
CREATE INDEX knowledge_bases_share_slug_idx ON knowledge_bases(share_slug);
```

**执行命令**:
```bash
# 生成迁移文件
npx drizzle-kit generate

# 执行迁移（推送到 Supabase）
npx drizzle-kit push
```

**验证迁移**:
迁移执行后，在 Supabase Dashboard 的 Table Editor 中验证表结构和索引是否正确创建。

---

### 4. Avatar 存储方案

**决策**: 使用 TEXT 类型存储头像，支持 emoji 和图片 URL 两种格式

**理由**:
- **灵活性**: 同时支持 emoji (如 "👨‍💻") 和图片 URL (如 "https://example.com/avatar.png")
- **简单性**: 无需额外的文件存储服务，直接存储文本
- **一致性**: 与现有 UI 中已使用的 emoji 头像保持一致

**验证逻辑**:
```typescript
// 使用 Zod 验证 avatar 格式
const avatarSchema = z.string().max(500).optional() // 限制最大长度防止滥用

// 前端验证逻辑（可选）
function isValidAvatar(avatar: string): boolean {
  // Emoji 检测
  const emojiRegex = /^[\p{Emoji}]+$/u
  if (emojiRegex.test(avatar)) return true

  // URL 检测
  try {
    new URL(avatar)
    return true
  } catch {
    return false
  }
}
```

**UI 实现**:
- Emoji 选择器：使用现成的 emoji picker 组件
- URL 输入：文本输入框，支持粘贴图片链接
- 预览：实时显示选择的头像

---

### 5. 市场列表性能优化

**决策**: 使用分页 + 索引 + TanStack Query 缓存优化列表加载性能

**理由**:
- **分页**: 默认每页 20 条，减少单次查询数据量
- **数据库索引**: 在 isPublic 和 shareSlug 字段创建索引，加速查询
- **部分索引**: 使用 `WHERE is_public = TRUE` 的部分索引，只索引公开项，减少索引大小
- **TanStack Query 缓存**: 2 分钟 staleTime，减少重复请求
- **搜索优化**: 使用 PostgreSQL 的 ILIKE 进行大小写不敏感搜索，考虑后续引入全文搜索（pg_trgm）

**查询示例**:
```typescript
// 市场列表查询（分页 + 搜索）
export const getPublicAgents = async (page: number, search?: string) => {
  const limit = 20
  const offset = (page - 1) * limit

  let query = db
    .select()
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

---

### 6. 知识库权限控制

**决策**: 公开知识库通过 isPublic 标记允许所有用户访问，使用 userId 和 isPublic 双重过滤

**理由**:
- **安全性**: 查询时检查 `WHERE (userId = current_user OR isPublic = TRUE)`，防止未授权访问
- **简单性**: 无需额外的权限表或复杂的 ACL 系统
- **性能**: 索引优化后查询性能可接受

**查询逻辑**:
```typescript
// 获取用户可访问的知识库（自己的 + 公开的）
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
}
```

---

### 7. Agent 安装逻辑

**决策**: 安装时复制 ChatConfig 并记录 sourceShareSlug，知识库引用直接复制

**理由**:
- **独立性**: 安装的 Agent 是独立副本，原作者修改或删除不影响已安装的副本
- **追溯性**: sourceShareSlug 字段记录来源，用于检测更新和防止重复安装
- **知识库引用**: 云端知识库无需复制数据，只复制关联表记录

**实施细节**:
```typescript
// 添加 sourceShareSlug 字段到 chatConfigs schema
export const chatConfigs = pgTable('chat_configs', {
  // ... 现有字段
  sourceShareSlug: varchar('source_share_slug', { length: 64 }),
})

// 安装逻辑
export const installAgent = async (shareSlug: string, userId: string) => {
  // 1. 查找源 Agent
  const sourceAgent = await db
    .select()
    .from(chatConfigs)
    .where(and(
      eq(chatConfigs.shareSlug, shareSlug),
      eq(chatConfigs.isPublic, true)
    ))
    .limit(1)

  if (!sourceAgent[0]) throw new Error('Agent not found')

  // 2. 检查是否已安装
  const existing = await db
    .select()
    .from(chatConfigs)
    .where(and(
      eq(chatConfigs.userId, userId),
      eq(chatConfigs.sourceShareSlug, shareSlug)
    ))
    .limit(1)

  if (existing[0]) throw new Error('Agent already installed')

  // 3. 创建副本
  const [newAgent] = await db.insert(chatConfigs).values({
    userId,
    name: sourceAgent[0].name,
    avatar: sourceAgent[0].avatar,
    defaultModel: sourceAgent[0].defaultModel,
    systemPrompt: sourceAgent[0].systemPrompt,
    webSearchEnabled: sourceAgent[0].webSearchEnabled,
    isPublic: false, // 安装的副本默认私有
    sourceShareSlug: shareSlug,
  }).returning()

  // 4. 复制知识库关联
  const kbLinks = await db
    .select()
    .from(chatConfigKnowledgeBases)
    .where(eq(chatConfigKnowledgeBases.chatConfigId, sourceAgent[0].id))

  if (kbLinks.length > 0) {
    await db.insert(chatConfigKnowledgeBases).values(
      kbLinks.map(link => ({
        chatConfigId: newAgent.id,
        knowledgeBaseId: link.knowledgeBaseId,
      }))
    )
  }

  return newAgent
}
```

---

## 最佳实践参考

### Hono RPC 模式
- 所有端点导出类型供前端使用
- 使用 Zod 验证请求体和查询参数
- 统一错误处理格式

### TanStack Query 模式
- 查询键使用工厂函数（marketplaceKeys）
- 变更操作使用乐观更新
- 失效策略：分享/安装后失效相关列表缓存

### Drizzle ORM 模式
- Schema 是唯一真实来源
- 使用 drizzle-zod 生成验证器
- 查询逻辑封装在 queries/ 目录

---

## 依赖项总结

**需要添加的 npm 包**:
```json
{
  "dependencies": {
    "nanoid": "^5.0.0"
  }
}
```

**数据库更改**:
- chatConfigs: +3 字段 (avatar, isPublic, shareSlug, sourceShareSlug)
- knowledgeBases: +2 字段 (isPublic, shareSlug)
- +4 索引（性能优化）

**无需额外配置**: 所有功能基于现有技术栈实现
