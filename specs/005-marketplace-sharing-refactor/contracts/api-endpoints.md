# API Endpoints: 知识库与 Agent 市场分享流程重构

**Feature**: 005-marketplace-sharing-refactor
**Date**: 2025-10-20
**Status**: Design

## Overview

本文档定义市场分享功能重构的 API 端点契约。所有端点使用 Hono RPC 实现，提供端到端类型安全。

**架构原则**:
- ✅ 类型优先开发（原则 I）：使用 InferRequestType 和 InferResponseType
- ✅ 模式驱动架构（原则 II）：Zod 验证器从 Drizzle schema 生成
- ✅ 中间件组合（原则 IV）：认证、验证通过中间件处理
- ✅ 多租户隔离（原则 V）：所有端点按 userId 过滤

## Base URL

```
Development: http://localhost:9876/api
Production: [部署时确定]
```

## Authentication

所有端点（除市场公开查询外）需要认证：

```typescript
// Hono 中间件自动注入 userId
c.get('userId') // uuid string
```

**错误响应** (未认证):
```json
{
  "error": "Unauthorized",
  "message": "Authentication required"
}
```

---

## Endpoints

### 知识库分享与取消分享

#### 1. 分享知识库到市场

**路由**: `PUT /api/knowledgebase/:id/share`

**功能需求**: FR-001, FR-002, FR-003, FR-004

**认证**: ✅ 必需

**请求**:
```typescript
// Path 参数
{
  id: string // uuid
}

// Body 参数
{
  isPublic: boolean // true=分享, false=取消分享
}
```

**响应** (200 OK):
```typescript
{
  knowledgeBase: {
    id: string
    userId: string
    name: string
    description: string | null
    isPublic: boolean
    shareSlug: string | null // 分享时生成
    starred: boolean
    createdAt: string // ISO 8601
    updatedAt: string // ISO 8601
  }
}
```

**错误响应**:
- **400 Bad Request** (FR-002): 知识库没有完成的文件
  ```json
  {
    "error": "ValidationError",
    "message": "Knowledge base must have at least one completed file before sharing"
  }
  ```

- **403 Forbidden**: 不是知识库创建者
  ```json
  {
    "error": "Forbidden",
    "message": "You can only share your own knowledge bases"
  }
  ```

- **404 Not Found**: 知识库不存在
  ```json
  {
    "error": "NotFound",
    "message": "Knowledge base not found"
  }
  ```

- **409 Conflict** (FR-049): ShareSlug 冲突（极低概率）
  ```json
  {
    "error": "ConflictError",
    "message": "Failed to generate unique share slug. Please try again"
  }
  ```

**业务逻辑**:
1. 验证 userId === knowledgeBase.userId（FR-001）
2. 如果 isPublic=true：
   - 验证至少有一个 status='completed' 的文件（FR-002）
   - 如果 shareSlug 为空，生成唯一 slug（FR-003）
   - 设置 isPublic=true（FR-004）
3. 如果 isPublic=false：
   - 设置 isPublic=false（FR-005）
   - 保留 shareSlug（FR-006）
4. 更新 updatedAt 时间戳
5. 返回更新后的知识库记录

**缓存失效**（前端）:
- `knowledgeBaseKeys.all`
- `marketplaceKeys.knowledgeBases()`

---

#### 2. 删除知识库（级联清理）

**路由**: `DELETE /api/knowledgebase/:id`

**功能需求**: FR-037 至 FR-042

**认证**: ✅ 必需

**请求**:
```typescript
// Path 参数
{
  id: string // uuid
}
```

**响应** (200 OK):
```typescript
{
  success: true,
  deletedKnowledgeBase: {
    id: string
    name: string
    filesDeleted: number // 已删除文件数
    agentAssociationsRemoved: number // 已移除 Agent 关联数
  }
}
```

**错误响应**:
- **403 Forbidden**: 不是知识库创建者
  ```json
  {
    "error": "Forbidden",
    "message": "You can only delete your own knowledge bases"
  }
  ```

- **404 Not Found**: 知识库不存在
  ```json
  {
    "error": "NotFound",
    "message": "Knowledge base not found"
  }
  ```

- **500 Internal Server Error**: 级联清理失败（事务回滚）
  ```json
  {
    "error": "InternalError",
    "message": "Failed to delete knowledge base. Please try again"
  }
  ```

**业务逻辑**（事务）:
1. 验证 userId === knowledgeBase.userId（FR-037）
2. 获取所有文件列表（用于存储清理）
3. 删除数据库记录（自动级联 knowledgeBaseFiles, embeddings, chatConfigKnowledgeBases）（FR-038, FR-040）
4. 清理 chatSessions.availableKnowledgeBaseIds（FR-041）
5. 事务提交后异步清理 Supabase Storage 文件（FR-039）
6. 返回删除统计信息

**缓存失效**（前端）:
- `knowledgeBaseKeys.detail(id)`
- `knowledgeBaseKeys.lists()`
- `marketplaceKeys.knowledgeBases()`

---

### Agent 分享与取消分享

#### 3. 分享 Agent 到市场

**路由**: `PUT /api/chat-configs/:id/share`

**功能需求**: FR-008, FR-009, FR-010, FR-011

**认证**: ✅ 必需

**请求**:
```typescript
// Path 参数
{
  id: string // uuid
}

// Body 参数
{
  isPublic: boolean // true=分享, false=取消分享
}
```

**响应** (200 OK):
```typescript
{
  chatConfig: {
    id: string
    userId: string
    name: string
    defaultModel: string
    systemPrompt: string | null
    avatar: string | null
    webSearchEnabled: boolean
    isPublic: boolean
    shareSlug: string | null // 分享时生成
    sourceShareSlug: string | null
    createdAt: string // ISO 8601
    updatedAt: string // ISO 8601
  }
}
```

**错误响应**:
- **400 Bad Request** (FR-009): Agent 缺少必填字段
  ```json
  {
    "error": "ValidationError",
    "message": "Agent must have name and defaultModel before sharing"
  }
  ```

- **403 Forbidden**: 不是 Agent 创建者
  ```json
  {
    "error": "Forbidden",
    "message": "You can only share your own agents"
  }
  ```

- **404 Not Found**: Agent 不存在
  ```json
  {
    "error": "NotFound",
    "message": "Agent not found"
  }
  ```

- **409 Conflict** (FR-049): ShareSlug 冲突（极低概率）
  ```json
  {
    "error": "ConflictError",
    "message": "Failed to generate unique share slug. Please try again"
  }
  ```

**业务逻辑**:
1. 验证 userId === chatConfig.userId（FR-008）
2. 如果 isPublic=true：
   - 验证 name 和 defaultModel 非空（FR-009）
   - 如果 shareSlug 为空，生成唯一 slug（FR-010）
   - 设置 isPublic=true（FR-011）
3. 如果 isPublic=false：
   - 设置 isPublic=false（FR-012）
   - 保留 shareSlug（FR-013）
4. 更新 updatedAt 时间戳
5. 返回更新后的 Agent 记录

**缓存失效**（前端）:
- `chatConfigKeys.all`
- `marketplaceKeys.agents()`

---

#### 4. 删除 Agent

**路由**: `DELETE /api/chat-configs/:id`

**功能需求**: FR-043 至 FR-047

**认证**: ✅ 必需

**请求**:
```typescript
// Path 参数
{
  id: string // uuid
}
```

**响应** (200 OK):
```typescript
{
  success: true,
  deletedChatConfig: {
    id: string
    name: string
    knowledgeBaseAssociationsRemoved: number // 已移除知识库关联数
  }
}
```

**错误响应**:
- **403 Forbidden**: 不是 Agent 创建者
  ```json
  {
    "error": "Forbidden",
    "message": "You can only delete your own agents"
  }
  ```

- **404 Not Found**: Agent 不存在
  ```json
  {
    "error": "NotFound",
    "message": "Agent not found"
  }
  ```

**业务逻辑**:
1. 验证 userId === chatConfig.userId（FR-043）
2. 如果 isPublic=true，先设置 isPublic=false（FR-046）
3. 删除数据库记录（自动级联 chatConfigKnowledgeBases）（FR-044）
4. 已安装副本（sourceShareSlug 指向此 Agent）不受影响（FR-045）
5. 返回删除统计信息

**缓存失效**（前端）:
- `chatConfigKeys.detail(id)`
- `chatConfigKeys.lists()`
- `marketplaceKeys.agents()`

---

### Agent 安装

#### 5. 安装 Agent 到用户账户

**路由**: `POST /api/chat-configs/install`

**功能需求**: FR-023 至 FR-031

**认证**: ✅ 必需

**请求**:
```typescript
// Body 参数
{
  shareSlug: string // 要安装的 Agent 分享标识符
}
```

**响应** (201 Created):
```typescript
{
  chatConfig: {
    id: string // 新生成的 UUID
    userId: string // 当前用户 ID
    name: string // 复制自原始 Agent
    defaultModel: string
    systemPrompt: string | null
    avatar: string | null
    webSearchEnabled: boolean
    isPublic: false // 默认私有
    shareSlug: null // 不继承
    sourceShareSlug: string // 指向原始 Agent 的 shareSlug
    createdAt: string // 新记录时间戳
    updatedAt: string
    knowledgeBases: Array<{
      id: string
      name: string
      isPublic: boolean
    }> // 复制的知识库关联（仅用户可访问的）
  }
}
```

**错误响应**:
- **400 Bad Request** (FR-025): 用户已安装此 Agent
  ```json
  {
    "error": "ValidationError",
    "message": "You have already installed this agent"
  }
  ```

- **403 Forbidden** (FR-024): 尝试安装自己的 Agent
  ```json
  {
    "error": "Forbidden",
    "message": "You cannot install your own agent"
  }
  ```

- **404 Not Found**: Agent 不存在或未分享
  ```json
  {
    "error": "NotFound",
    "message": "Agent not found or not shared"
  }
  ```

**业务逻辑**（事务）:
1. 查询原始 Agent（shareSlug + isPublic=true）
2. 验证 userId !== 原始 Agent userId（FR-024）
3. 检查用户是否已安装（sourceShareSlug=shareSlug）（FR-025）
4. 创建 Agent 副本（FR-026）：
   - 新 UUID
   - userId=当前用户
   - 复制所有配置字段（name, defaultModel, systemPrompt, avatar, webSearchEnabled）
   - isPublic=false（FR-029）
   - shareSlug=null
   - sourceShareSlug=原始 Agent shareSlug（FR-027）
5. 复制知识库关联（FR-028）：
   - 仅关联用户可访问的知识库（isPublic=true 或 userId=当前用户）
6. 返回新创建的 Agent 及其关联知识库

**缓存失效**（前端）:
- `chatConfigKeys.lists()`

---

#### 6. 检查 Agent 安装状态

**路由**: `GET /api/chat-configs/check-installed/:shareSlug`

**功能需求**: FR-031

**认证**: ✅ 必需

**请求**:
```typescript
// Path 参数
{
  shareSlug: string // Agent 分享标识符
}
```

**响应** (200 OK):
```typescript
{
  isInstalled: boolean // 用户是否已安装此 Agent
  isOwner: boolean // 用户是否是原始创建者
  installedConfig: {
    id: string
    name: string
  } | null // 如果已安装，返回安装的 Agent 信息
}
```

**错误响应**:
- **404 Not Found**: Agent 不存在或未分享
  ```json
  {
    "error": "NotFound",
    "message": "Agent not found or not shared"
  }
  ```

**业务逻辑**:
1. 查询原始 Agent（shareSlug + isPublic=true）
2. 检查 userId === 原始 Agent userId（isOwner）
3. 查询用户是否已安装（sourceShareSlug=shareSlug）（isInstalled）
4. 返回状态信息

**缓存策略**（前端）:
- staleTime: 1 * 60 * 1000 (1 分钟)
- 安装成功后失效

---

### 市场浏览与搜索

#### 7. 获取市场 Agent 列表

**路由**: `GET /api/marketplace/agents`

**功能需求**: FR-015, FR-017, FR-018, FR-019, FR-020

**认证**: ❌ 不需要（公开访问）

**请求**:
```typescript
// Query 参数
{
  page?: number // 默认 1
  limit?: number // 默认 20, 最大 100
  search?: string // 搜索关键词（名称 + 系统提示词）
}
```

**响应** (200 OK):
```typescript
{
  agents: Array<{
    id: string
    shareSlug: string
    name: string
    defaultModel: string
    systemPrompt: string | null
    avatar: string | null
    webSearchEnabled: boolean
    createdAt: string
    updatedAt: string
    creator: {
      id: string
      name: string // 如果有用户表
    } | null
    knowledgeBasesCount: number // 关联知识库数量
  }>
  pagination: {
    page: number
    limit: number
    total: number // 总记录数
    totalPages: number
  }
}
```

**错误响应**:
- **400 Bad Request**: 无效的分页参数
  ```json
  {
    "error": "ValidationError",
    "message": "Invalid pagination parameters"
  }
  ```

**业务逻辑**:
1. 查询 isPublic=true 的 Agent（FR-017）
2. 如果有 search 参数（FR-018）：
   - 使用 ILIKE 查询 name 和 systemPrompt
   - 前端防抖 300ms（FR-019）
3. 分页（FR-020）：每页 20 条
4. 关联查询知识库数量（LEFT JOIN chatConfigKnowledgeBases）
5. 返回列表和分页信息

**缓存策略**（前端）:
- staleTime: 2 * 60 * 1000 (2 分钟)

---

#### 8. 获取市场知识库列表

**路由**: `GET /api/marketplace/knowledge-bases`

**功能需求**: FR-015, FR-016, FR-018, FR-019, FR-020

**认证**: ❌ 不需要（公开访问）

**请求**:
```typescript
// Query 参数
{
  page?: number // 默认 1
  limit?: number // 默认 20, 最大 100
  search?: string // 搜索关键词（名称 + 描述）
}
```

**响应** (200 OK):
```typescript
{
  knowledgeBases: Array<{
    id: string
    shareSlug: string
    name: string
    description: string | null
    createdAt: string
    updatedAt: string
    creator: {
      id: string
      name: string // 如果有用户表
    } | null
    filesCount: number // 文件数量
  }>
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
```

**错误响应**:
- **400 Bad Request**: 无效的分页参数
  ```json
  {
    "error": "ValidationError",
    "message": "Invalid pagination parameters"
  }
  ```

**业务逻辑**:
1. 查询 isPublic=true 的知识库（FR-016）
2. 如果有 search 参数（FR-018）：
   - 使用 ILIKE 查询 name 和 description
   - 前端防抖 300ms（FR-019）
3. 分页（FR-020）：每页 20 条
4. 关联查询文件数量（LEFT JOIN knowledgeBaseFiles）
5. 返回列表和分页信息

**缓存策略**（前端）:
- staleTime: 2 * 60 * 1000 (2 分钟)

---

#### 9. 获取市场 Agent 详情

**路由**: `GET /api/marketplace/agents/:shareSlug`

**功能需求**: FR-022

**认证**: ❌ 不需要（公开访问）

**请求**:
```typescript
// Path 参数
{
  shareSlug: string // Agent 分享标识符
}
```

**响应** (200 OK):
```typescript
{
  agent: {
    id: string
    shareSlug: string
    name: string
    defaultModel: string
    systemPrompt: string | null
    avatar: string | null
    webSearchEnabled: boolean
    createdAt: string
    updatedAt: string
    creator: {
      id: string
      name: string
    } | null
    knowledgeBases: Array<{
      id: string
      name: string
      description: string | null
      filesCount: number
      isPublic: boolean // 总是 true（市场仅显示公开知识库）
    }>
  }
}
```

**错误响应**:
- **404 Not Found**: Agent 不存在或未分享
  ```json
  {
    "error": "NotFound",
    "message": "Agent not found or not shared"
  }
  ```

**业务逻辑**:
1. 查询 shareSlug + isPublic=true 的 Agent
2. 关联查询知识库（仅显示 isPublic=true 的知识库）
3. 关联查询创建者信息
4. 返回完整详情

**缓存策略**（前端）:
- staleTime: 5 * 60 * 1000 (5 分钟)

---

#### 10. 获取市场知识库详情

**路由**: `GET /api/marketplace/knowledge-bases/:shareSlug`

**功能需求**: FR-022

**认证**: ❌ 不需要（公开访问）

**请求**:
```typescript
// Path 参数
{
  shareSlug: string // 知识库分享标识符
}
```

**响应** (200 OK):
```typescript
{
  knowledgeBase: {
    id: string
    shareSlug: string
    name: string
    description: string | null
    createdAt: string
    updatedAt: string
    creator: {
      id: string
      name: string
    } | null
    files: Array<{
      id: string
      fileName: string
      fileSize: number
      fileType: string
      status: 'pending' | 'completed' | 'failed'
      createdAt: string
    }>
  }
}
```

**错误响应**:
- **404 Not Found**: 知识库不存在或未分享
  ```json
  {
    "error": "NotFound",
    "message": "Knowledge base not found or not shared"
  }
  ```

**业务逻辑**:
1. 查询 shareSlug + isPublic=true 的知识库
2. 关联查询文件列表
3. 关联查询创建者信息
4. 返回完整详情

**缓存策略**（前端）:
- staleTime: 5 * 60 * 1000 (5 分钟)

---

## Error Handling Standards

### HTTP 状态码约定

| 状态码 | 使用场景 | 示例 |
|--------|---------|------|
| 200 OK | 成功的 GET/PUT 请求 | 获取列表、更新资源 |
| 201 Created | 成功的 POST 请求（创建资源） | 安装 Agent |
| 400 Bad Request | 客户端请求错误（验证失败） | 缺少必填字段、无效参数 |
| 403 Forbidden | 权限不足 | 尝试操作他人资源 |
| 404 Not Found | 资源不存在 | Agent/知识库不存在 |
| 409 Conflict | 资源冲突 | ShareSlug 重复 |
| 500 Internal Server Error | 服务器错误 | 数据库事务失败 |

### 错误响应格式

所有错误响应遵循统一格式：

```typescript
{
  error: string // 错误类型（驼峰命名）
  message: string // 用户可读错误消息（英文）
  details?: Record<string, any> // 可选的详细信息
}
```

### Zod 验证错误

```typescript
// 自动转换为 400 Bad Request
{
  error: "ValidationError",
  message: "Invalid request body",
  details: {
    issues: [
      {
        path: ["isPublic"],
        message: "Expected boolean, received string"
      }
    ]
  }
}
```

## Type Safety Contract

### Hono RPC 类型导出

**服务端** (`server/src/routes/marketplace.ts`):
```typescript
import { Hono } from 'hono'

const app = new Hono()
  .get('/agents', /* handler */)
  .get('/knowledge-bases', /* handler */)
  ...

export type MarketplaceAppType = typeof app
```

**客户端** (`client/src/lib/hono-client.ts`):
```typescript
import { hc } from 'hono/client'
import type { MarketplaceAppType } from '@server/routes/marketplace'

const client = hc<MarketplaceAppType>('/api/marketplace')

// 类型自动推断
const res = await client.agents.$get({
  query: { page: 1, limit: 20 }
})

if (res.ok) {
  const data = await res.json() // 类型: { agents: ..., pagination: ... }
}
```

### TanStack Query 类型推断

```typescript
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'

export function useMarketplaceAgents(filters: { search?: string }) {
  return useQuery({
    queryKey: marketplaceKeys.agentsList(filters),
    queryFn: async () => {
      const res = await honoClient.api.marketplace.agents.$get({
        query: { search: filters.search, page: 1, limit: 20 }
      })
      if (!res.ok) throw new Error('Failed to fetch agents')
      return res.json() // 类型自动推断
    }
  })
}
```

## Performance Requirements

### Endpoint Response Time Targets

| 端点 | 目标响应时间 | 来源 |
|------|-------------|------|
| POST /api/chat-configs/install | <3秒 | SC-005 |
| PUT /api/knowledgebase/:id/share | <3秒 | SC-001 |
| PUT /api/chat-configs/:id/share | <3秒 | SC-002 |
| DELETE /api/knowledgebase/:id | <5秒 | SC-006 |
| GET /api/marketplace/agents | <1秒 | SC-003 |
| GET /api/marketplace/knowledge-bases | <1秒 | SC-003 |
| GET /api/marketplace/agents/:slug | <1秒 | SC-003 |
| GET /api/marketplace/knowledge-bases/:slug | <1秒 | SC-003 |

### Database Query Optimization

**索引要求**:
- `knowledgeBases.shareSlug` - UNIQUE, BTREE
- `chatConfigs.shareSlug` - UNIQUE, BTREE
- `chatConfigs.sourceShareSlug` - BTREE (推荐)
- `chatSessions.availableKnowledgeBaseIds` - GIN (推荐)

**分页查询**:
- 使用 LIMIT/OFFSET
- 每页最多 20 条记录（默认）
- 最大 100 条记录（限制）

**搜索查询**:
- 使用 ILIKE 模糊匹配
- 考虑 GIN 索引（PostgreSQL 全文搜索）
- 前端防抖 300ms

## Summary

✅ **端点完整性**: 10 个端点覆盖所有功能需求
✅ **类型安全**: Hono RPC 提供端到端类型推断
✅ **错误处理**: 统一错误格式和状态码约定
✅ **性能目标**: 明确响应时间要求和优化策略
✅ **缓存策略**: TanStack Query 缓存和失效规则

**实施阶段行动项**:
1. 使用 Zod 验证器验证所有请求参数
2. 在分享端点使用 `generateUniqueShareSlug()`
3. 添加 409 Conflict 错误处理和重试逻辑
4. 实现事务保证级联删除原子性
5. 测试市场列表查询性能（1000+ 记录）
