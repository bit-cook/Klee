# 数据模型：知识库客户端数据流

**功能**: 知识库客户端优化
**日期**: 2025-10-18
**目的**: 定义客户端数据流、缓存结构和状态管理

## 说明

本功能为**客户端重构**，不修改后端数据库模式。此文档描述：
1. 客户端缓存的数据结构（从后端 API 响应推断）
2. 查询键的层级关系
3. 数据流和状态转换

后端数据模型参考: `/Users/wei/Coding/rafa/docs/knowledge-base.md` 和 `/Users/wei/Coding/rafa/server/db/schema.ts`

---

## 客户端数据实体

### 1. KnowledgeBase（知识库）

**来源**: `GET /api/knowledgebase` 和 `GET /api/knowledgebase/:id`

#### 轻量级列表实体

```typescript
// 从 GET /api/knowledgebase 返回
type KnowledgeBaseListItem = {
  id: string
  name: string
  starred: boolean | null
  // 注意：列表 API 不返回 description 和 files，以优化性能
}
```

**用途**: 侧边栏和列表页显示

**缓存键**: `['knowledgeBases', 'list']`

#### 完整详情实体

```typescript
// 从 GET /api/knowledgebase/:id 返回
type KnowledgeBaseDetail = {
  id: string
  name: string
  description: string | null
  starred: boolean | null
  userId: string
  createdAt: string  // ISO 8601 格式
  updatedAt: string  // ISO 8601 格式
  files: KnowledgeBaseFile[]  // 嵌套文件列表
}
```

**用途**: 详情页显示和编辑

**缓存键**: `['knowledgeBases', 'detail', id]`

### 2. KnowledgeBaseFile（知识库文件）

**来源**: 嵌套在 `KnowledgeBaseDetail.files` 中

```typescript
type KnowledgeBaseFile = {
  id: string
  knowledgeBaseId: string
  fileName: string
  fileSize: number  // 字节
  storagePath: string
  status: 'processing' | 'completed' | 'failed'
  createdAt: string  // ISO 8601 格式
}
```

**状态转换**:
```
上传 → processing → completed (成功)
              ↓
           failed (失败)
```

**缓存键**: `['knowledgeBases', 'detail', knowledgeBaseId, 'files']`

---

## 查询键层级结构

### 查询键工厂设计

```typescript
// client/src/lib/queryKeys.ts
export const knowledgeBaseKeys = {
  // 一级：所有知识库相关查询的根
  all: ['knowledgeBases'] as const,

  // 二级：列表查询
  lists: () => [...knowledgeBaseKeys.all, 'list'] as const,
  list: (filters?: ListFilters) =>
    [...knowledgeBaseKeys.lists(), filters || {}] as const,

  // 二级：详情查询
  details: () => [...knowledgeBaseKeys.all, 'detail'] as const,
  detail: (id: string) => [...knowledgeBaseKeys.details(), id] as const,

  // 三级：文件查询（隶属于特定知识库）
  files: (knowledgeBaseId: string) =>
    [...knowledgeBaseKeys.detail(knowledgeBaseId), 'files'] as const,
}
```

### 层级失效示例

```typescript
// 失效所有知识库查询（删除知识库时）
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all })

// 仅失效所有列表查询（创建知识库时）
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists() })

// 仅失效特定知识库详情（更新知识库时）
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(id) })

// 仅失效特定知识库的文件列表（上传文件时）
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.files(id) })
```

---

## 缓存数据流

### 场景 1：查看知识库列表

```
用户访问列表页
  ↓
useKnowledgeBases() 钩子
  ↓
检查缓存（queryKey: ['knowledgeBases', 'list']）
  ↓
缓存命中 → 立即返回缓存数据
  ↓
检查陈旧性（staleTime: 2 分钟）
  ↓
若陈旧 → 后台重新获取 → 更新缓存
```

### 场景 2：创建知识库

```
用户提交创建表单
  ↓
useCreateKnowledgeBase() mutation
  ↓
调用 POST /api/knowledgebase
  ↓
成功 → invalidateQueries(['knowledgeBases', 'list'])
  ↓
useKnowledgeBases() 检测到失效
  ↓
自动重新获取列表
  ↓
UI 显示新知识库
```

### 场景 3：收藏知识库（乐观更新）

```
用户点击星标图标
  ↓
useUpdateKnowledgeBase() mutation
  ↓
onMutate:
  1. cancelQueries() - 取消正在进行的查询
  2. getQueryData() - 保存当前值
  3. setQueryData() - 乐观更新缓存（立即显示星标）
  ↓
mutationFn: 调用 PUT /api/knowledgebase/:id
  ↓
成功 → onSuccess:
  - invalidateQueries() - 失效详情和列表
  - 后台重新获取确保数据一致
  ↓
失败 → onError:
  - setQueryData(previousData) - 回滚到之前的值
  - 显示错误消息
```

### 场景 4：文件上传

```
用户选择文件
  ↓
useUploadKnowledgeBaseFile() mutation
  ↓
显示上传进度（通过 React state）
  ↓
调用 POST /api/knowledgebase/:id/files
  ↓
成功 → onSuccess:
  - invalidateQueries(['knowledgeBases', 'detail', id, 'files'])
  - 文件列表自动重新获取
  - 新文件出现在列表中，状态为 'processing'
  ↓
后台处理完成（由服务器 SSE 或轮询通知）
  ↓
文件状态更新为 'completed' 或 'failed'
```

---

## 状态管理分层

### 1. 服务器状态（TanStack Query 管理）

- 知识库列表
- 知识库详情
- 文件列表
- 文件状态

**特点**:
- 自动缓存
- 自动重新获取
- 自动失效

### 2. UI 状态（React State 管理）

- 表单输入值（创建/编辑对话框）
- 文件上传进度
- 对话框打开/关闭状态
- 加载指示器（mutation 期间）

**特点**:
- 短暂存在
- 组件本地
- 不需要缓存

### 3. URL 状态（TanStack Router 管理）

- 当前知识库 ID（路由参数）
- 搜索过滤器（查询参数）

**特点**:
- 可书签化
- 可分享
- 浏览器历史记录

---

## 缓存配置矩阵

| 查询类型 | staleTime | cacheTime | refetchOnWindowFocus | refetchOnReconnect |
|---------|-----------|-----------|---------------------|-------------------|
| 知识库列表 | 2 分钟 | 10 分钟 | true | true |
| 知识库详情 | 5 分钟 | 10 分钟 | true | true |
| 文件列表 | 1 分钟 | 10 分钟 | true | true |

**说明**:
- **staleTime**: 数据被认为新鲜的时间，期间不会重新获取
- **cacheTime**: 未使用的数据保留在内存中的时间
- **refetchOnWindowFocus**: 窗口获得焦点时重新获取（多标签页同步）
- **refetchOnReconnect**: 网络重新连接时重新获取

---

## 乐观更新规则

| 操作 | 是否乐观更新 | 理由 |
|------|-------------|------|
| 创建知识库 | 否 | 需要服务器生成 ID，无法预测 |
| 更新知识库名称/描述 | 是 | 客户端已知新值，可立即显示 |
| 收藏/取消收藏 | **是** | 用户期望即时反馈 |
| 删除知识库 | 是 | 可立即从列表移除 |
| 上传文件 | 否 | 需要服务器处理，但可显示进度 |
| 删除文件 | 是 | 可立即从列表移除 |

---

## 错误处理策略

### 网络错误

```typescript
// 自动重试（全局配置）
queries: {
  retry: 3,  // 最多重试 3 次
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
}
```

### 业务错误

```typescript
// 在 mutation 的 onError 中处理
onError: (error) => {
  // 1. 回滚乐观更新
  // 2. 显示用户友好的错误消息（英文）
  // 3. 记录错误到控制台（中文注释）
}
```

### 错误消息映射

| HTTP 状态码 | 用户消息 (英文) | 日志消息 (中文) |
|------------|----------------|----------------|
| 400 | Invalid input | 无效输入 |
| 401 | Please sign in again | 认证过期，请重新登录 |
| 403 | You don't have permission | 无权限访问此资源 |
| 404 | Knowledge base not found | 知识库不存在 |
| 409 | Knowledge base name already exists | 知识库名称已存在 |
| 500 | Something went wrong. Please try again | 服务器内部错误 |

---

## 类型推断链

```
数据库模式 (schema.ts)
  ↓ (drizzle-zod)
Zod 验证器
  ↓ (Hono API 响应)
Hono RPC 类型
  ↓ (InferResponseType)
客户端 RPC 调用返回类型
  ↓ (TanStack Query 推断)
useQuery/useMutation 返回类型
  ↓ (React 组件)
UI 组件 props 类型
```

**关键点**: 整条链无需手动定义类型，完全自动推断

---

## 参考实现

完整类型定义参考:
- 后端模式: `server/db/schema.ts`
- API 路由: `server/src/routes/knowledgebase.ts`
- RPC 客户端: `client/src/lib/hono-client.ts`
- 现有钩子: `client/src/hooks/useKnowledgeBaseRPC.ts`
