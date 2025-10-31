# API 端点合约：市场商店分享功能

**功能**: 004-marketplace-sharing
**日期**: 2025-10-19
**协议**: Hono RPC over HTTP

## 概述

所有 API 端点通过 Hono RPC 实现，前端使用类型安全的 Hono Client 调用。端点按功能分组：
1. **Marketplace API**: 公开市场浏览和搜索
2. **ChatConfig API**: Agent 创建、分享、安装
3. **KnowledgeBase API**: 知识库分享

## 认证

- **公开端点**: 市场浏览、详情查询（无需认证）
- **受保护端点**: 分享、安装、创建（需要 Supabase Auth token）

**认证方式**: Bearer Token in Authorization header
```
Authorization: Bearer <supabase_access_token>
```

---

## Marketplace API

### 1. 获取公开 Agent 列表

**端点**: `GET /api/marketplace/agents`

**查询参数**:
```typescript
{
  page?: number        // 页码，默认 1
  search?: string      // 搜索关键词（name 或 systemPrompt）
}
```

**响应类型**:
```typescript
{
  agents: Array<{
    id: string
    avatar: string | null
    name: string
    systemPrompt: string
    defaultModel: string
    shareSlug: string
    author: string        // 从 userId 查询用户名（需 join users 表或使用 Supabase Auth API）
    updatedAt: string     // ISO 8601 格式
  }>
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}
```

**错误响应**:
- `400 Bad Request`: 无效的查询参数
- `500 Internal Server Error`: 数据库查询失败

**Hono Route 示例**:
```typescript
// server/src/routes/marketplace.ts
export const marketplaceRoutes = new Hono()
  .get('/agents', async (c) => {
    const page = Number(c.req.query('page')) || 1
    const search = c.req.query('search')

    const agents = await getPublicAgents(page, search)
    const total = await countPublicAgents(search)

    return c.json({
      agents,
      pagination: {
        page,
        limit: 20,
        total,
        hasMore: page * 20 < total
      }
    })
  })
```

---

### 2. 获取公开知识库列表

**端点**: `GET /api/marketplace/knowledge-bases`

**查询参数**:
```typescript
{
  page?: number
  search?: string
}
```

**响应类型**:
```typescript
{
  knowledgeBases: Array<{
    id: string
    name: string
    description: string | null
    shareSlug: string
    author: string
    fileCount: number      // 文件数量统计
    updatedAt: string
  }>
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}
```

---

### 3. 获取 Agent 详情（通过 shareSlug）

**端点**: `GET /api/marketplace/agents/:shareSlug`

**路径参数**:
- `shareSlug`: string (10 字符 nanoid)

**响应类型**:
```typescript
{
  agent: {
    id: string
    avatar: string | null
    name: string
    systemPrompt: string
    defaultModel: string
    webSearchEnabled: boolean
    shareSlug: string
    author: string
    createdAt: string
    updatedAt: string
    knowledgeBases: Array<{
      id: string
      name: string
      description: string | null
      isPublic: boolean        // 标记知识库是否可访问
    }>
  }
}
```

**错误响应**:
- `404 Not Found`: Agent 不存在或未公开分享

---

### 4. 获取知识库详情（通过 shareSlug）

**端点**: `GET /api/marketplace/knowledge-bases/:shareSlug`

**路径参数**:
- `shareSlug`: string

**响应类型**:
```typescript
{
  knowledgeBase: {
    id: string
    name: string
    description: string | null
    shareSlug: string
    author: string
    createdAt: string
    updatedAt: string
    files: Array<{
      id: string
      fileName: string
      fileSize: number
      fileType: string
      status: string
    }>
    fileCount: number
  }
}
```

---

## ChatConfig API

### 5. 从 Chat 创建 Agent

**端点**: `POST /api/chat-configs`

**认证**: 必需

**请求体**:
```typescript
{
  name: string              // Agent 名称
  avatar?: string           // 头像（emoji 或 URL）
  systemPrompt: string      // 系统提示词（从 Chat 传入）
  defaultModel: string      // 模型名称（从 Chat 传入）
  webSearchEnabled: boolean // 网络搜索开关（从 Chat 传入）
  knowledgeBaseIds: string[] // 关联的知识库 IDs（从 Chat 传入）
}
```

**响应类型**:
```typescript
{
  chatConfig: {
    id: string
    name: string
    avatar: string | null
    defaultModel: string
    systemPrompt: string
    webSearchEnabled: boolean
    isPublic: boolean        // 新创建默认 false
    createdAt: string
  }
}
```

**错误响应**:
- `400 Bad Request`: 验证失败（name 必填，avatar 格式错误等）
- `401 Unauthorized`: 未认证
- `500 Internal Server Error`: 创建失败

**Hono Route 示例**:
```typescript
// server/src/routes/chatConfig.ts
export const chatConfigRoutes = new Hono()
  .post('/', authMiddleware, zValidator('json', createChatConfigSchema), async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')

    const chatConfig = await createChatConfig(userId, body)

    return c.json({ chatConfig }, 201)
  })
```

---

### 6. 分享 Agent 到市场

**端点**: `PUT /api/chat-configs/:id/share`

**认证**: 必需

**路径参数**:
- `id`: string (ChatConfig ID)

**请求体**:
```typescript
{
  isPublic: boolean    // true = 分享，false = 取消分享
}
```

**响应类型**:
```typescript
{
  chatConfig: {
    id: string
    isPublic: boolean
    shareSlug: string | null  // 分享时生成，取消分享时设为 null
  }
}
```

**业务逻辑**:
1. 验证 ChatConfig 属于当前用户
2. 如果 `isPublic = true` 且 `shareSlug` 为空，生成新的 shareSlug
3. 更新 `isPublic` 和 `shareSlug` 字段
4. 验证 Agent 完整性（必须有 name, avatar, systemPrompt, defaultModel）

**错误响应**:
- `400 Bad Request`: Agent 信息不完整（缺少必填字段）
- `401 Unauthorized`: 未认证
- `403 Forbidden`: 非 Agent 所有者
- `404 Not Found`: Agent 不存在

---

### 7. 从市场安装 Agent

**端点**: `POST /api/chat-configs/install`

**认证**: 必需

**请求体**:
```typescript
{
  shareSlug: string    // 要安装的 Agent shareSlug
}
```

**响应类型**:
```typescript
{
  chatConfig: {
    id: string           // 新创建的 ChatConfig ID
    name: string
    avatar: string | null
    defaultModel: string
    systemPrompt: string
    webSearchEnabled: boolean
    sourceShareSlug: string  // 记录安装来源
    createdAt: string
  }
}
```

**业务逻辑**:
1. 查找源 Agent（shareSlug + isPublic = true）
2. 检查是否已安装（userId + sourceShareSlug）
3. 创建 ChatConfig 副本（复制所有配置字段）
4. 复制 chatConfigKnowledgeBases 关联记录
5. 设置 sourceShareSlug 为原 shareSlug

**错误响应**:
- `400 Bad Request`: shareSlug 无效
- `404 Not Found`: Agent 不存在或未公开
- `409 Conflict`: 已安装该 Agent
- `500 Internal Server Error`: 安装失败（事务回滚）

**Hono Route 示例**:
```typescript
export const chatConfigRoutes = new Hono()
  .post('/install', authMiddleware, zValidator('json', installAgentSchema), async (c) => {
    const userId = c.get('userId')
    const { shareSlug } = c.req.valid('json')

    try {
      const chatConfig = await installAgent(shareSlug, userId)
      return c.json({ chatConfig }, 201)
    } catch (error) {
      if (error.message === 'Agent not found') {
        return c.json({ error: 'Agent not found or not public' }, 404)
      }
      if (error.message === 'Agent already installed') {
        return c.json({ error: 'You have already installed this agent' }, 409)
      }
      throw error
    }
  })
```

---

### 8. 检查 Agent 是否已安装

**端点**: `GET /api/chat-configs/check-installed/:shareSlug`

**认证**: 必需

**路径参数**:
- `shareSlug`: string

**响应类型**:
```typescript
{
  installed: boolean
  chatConfigId?: string  // 如果已安装，返回本地 ChatConfig ID
}
```

**用途**: 在 Agent 详情页显示"已安装"状态

---

## KnowledgeBase API

### 9. 分享知识库到市场

**端点**: `PUT /api/knowledgebase/:id/share`

**认证**: 必需

**路径参数**:
- `id`: string (KnowledgeBase ID)

**请求体**:
```typescript
{
  isPublic: boolean
}
```

**响应类型**:
```typescript
{
  knowledgeBase: {
    id: string
    isPublic: boolean
    shareSlug: string | null
  }
}
```

**业务逻辑**:
1. 验证知识库属于当前用户
2. 验证至少有一个已完成的文件（status = 'completed'）
3. 如果 `isPublic = true` 且 `shareSlug` 为空，生成新的 shareSlug
4. 更新字段

**错误响应**:
- `400 Bad Request`: 知识库为空（无已完成文件）
- `401 Unauthorized`: 未认证
- `403 Forbidden`: 非知识库所有者
- `404 Not Found`: 知识库不存在

---

## Zod Validation Schemas

### createChatConfigSchema
```typescript
import { z } from 'zod'

export const createChatConfigSchema = z.object({
  name: z.string().min(1).max(80),
  avatar: z.string().max(500).optional(),
  systemPrompt: z.string().max(5000),
  defaultModel: z.string().min(1).max(64),
  webSearchEnabled: z.boolean().default(false),
  knowledgeBaseIds: z.array(z.string().uuid()).default([]),
})
```

### shareChatConfigSchema
```typescript
export const shareChatConfigSchema = z.object({
  isPublic: z.boolean(),
})
```

### installAgentSchema
```typescript
export const installAgentSchema = z.object({
  shareSlug: z.string().length(10),
})
```

### shareKnowledgeBaseSchema
```typescript
export const shareKnowledgeBaseSchema = z.object({
  isPublic: z.boolean(),
})
```

---

## Hono RPC Type Export

```typescript
// server/src/routes/index.ts
import { Hono } from 'hono'
import { marketplaceRoutes } from './marketplace'
import { chatConfigRoutes } from './chatConfig'
import { knowledgeBaseRoutes } from './knowledgebase'

export const app = new Hono()
  .route('/api/marketplace', marketplaceRoutes)
  .route('/api/chat-configs', chatConfigRoutes)
  .route('/api/knowledgebase', knowledgeBaseRoutes)

export type AppType = typeof app
```

---

## 前端调用示例（Hono Client）

```typescript
// client/src/lib/hono-client.ts
import { hc } from 'hono/client'
import type { AppType } from '@server/routes'

export const honoClient = hc<AppType>(process.env.API_URL)

// 使用示例
const res = await honoClient.api.marketplace.agents.$get({
  query: { page: '1', search: 'coding' }
})
if (res.ok) {
  const data = await res.json()  // 类型自动推断
}
```

---

## 错误处理标准

所有错误响应遵循统一格式：

```typescript
{
  error: string        // 用户友好的错误消息（英文）
  code?: string        // 错误代码（可选）
  details?: unknown    // 详细错误信息（可选，仅开发环境）
}
```

**HTTP 状态码约定**:
- `200 OK`: 成功
- `201 Created`: 资源创建成功
- `400 Bad Request`: 验证失败或请求参数错误
- `401 Unauthorized`: 未认证或 token 无效
- `403 Forbidden`: 已认证但无权限
- `404 Not Found`: 资源不存在
- `409 Conflict`: 资源冲突（如重复安装）
- `500 Internal Server Error`: 服务器内部错误

---

## 性能考量

### 缓存策略

**前端缓存（TanStack Query）**:
- 市场列表：`staleTime: 2 * 60 * 1000` (2 分钟)
- Agent 详情：`staleTime: 5 * 60 * 1000` (5 分钟)
- 用户 ChatConfigs：`staleTime: 5 * 60 * 1000`

**后端优化**:
- 数据库查询使用索引（is_public, share_slug）
- 分页限制 20 条/页
- 考虑添加 Redis 缓存热门 Agent（未来优化）

### 速率限制

建议为公开端点添加速率限制（未来改进）：
- 市场浏览：100 req/min per IP
- 搜索：30 req/min per IP
- 安装操作：10 req/min per user

---

## 测试场景

### 功能测试
1. 从 Chat 创建 Agent（预填充配置）
2. 分享 Agent 到市场（生成 shareSlug）
3. 浏览市场列表（分页和搜索）
4. 查看 Agent 详情（包含知识库）
5. 安装 Agent（复制配置和知识库引用）
6. 防止重复安装（返回 409）
7. 取消分享（isPublic = false）

### 边缘情况
1. 空知识库分享（返回 400）
2. 无效 shareSlug（返回 404）
3. 已删除 Agent 的 shareSlug 访问（返回 404）
4. 并发安装同一 Agent（事务保证一致性）

### 安全测试
1. 未认证访问受保护端点（返回 401）
2. 跨用户操作（返回 403）
3. SQL 注入防护（参数化查询）
4. XSS 防护（avatar URL 验证）
