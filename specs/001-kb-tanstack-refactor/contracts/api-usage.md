# API 使用合约：知识库客户端

**功能**: 知识库客户端优化
**日期**: 2025-10-18
**目的**: 定义客户端如何调用后端 API，确保类型安全和一致性

## 说明

本文档定义客户端 TanStack Query 钩子与后端 Hono API 的交互合约。
后端 API 规范参考: `/Users/wei/Coding/rafa/server/src/routes/knowledgebase.ts`

---

## API 端点清单

| 端点 | 方法 | 用途 | TanStack Query 钩子 |
|------|------|------|-------------------|
| `/api/knowledgebase` | GET | 获取知识库列表 | `useKnowledgeBases` (query) |
| `/api/knowledgebase` | POST | 创建知识库 | `useCreateKnowledgeBase` (mutation) |
| `/api/knowledgebase/:id` | GET | 获取知识库详情 | `useKnowledgeBase` (query) |
| `/api/knowledgebase/:id` | PUT | 更新知识库 | `useUpdateKnowledgeBase` (mutation) |
| `/api/knowledgebase/:id` | DELETE | 删除知识库 | `useDeleteKnowledgeBase` (mutation) |
| `/api/knowledgebase/:id/files` | POST | 上传文件 | `useUploadKnowledgeBaseFile` (mutation) |
| `/api/knowledgebase/:id/files/:fileId` | DELETE | 删除文件 | `useDeleteKnowledgeBaseFile` (mutation) |

---

## 查询（Queries）

### 1. 获取知识库列表

**端点**: `GET /api/knowledgebase`

**查询键**: `['knowledgeBases', 'list']`

**请求**:
```typescript
// 无参数
const res = await honoClient.api.knowledgebase.$get()
```

**响应**:
```typescript
{
  knowledgeBases: Array<{
    id: string
    name: string
    starred: boolean | null
  }>
}
```

**缓存配置**:
- `staleTime`: 2 分钟
- `cacheTime`: 10 分钟

**使用示例**:
```typescript
const { data, isLoading, error } = useKnowledgeBases()
```

---

### 2. 获取知识库详情

**端点**: `GET /api/knowledgebase/:id`

**查询键**: `['knowledgeBases', 'detail', id]`

**请求**:
```typescript
const res = await honoClient.api.knowledgebase[':id'].$get({
  param: { id: knowledgeBaseId },
})
```

**响应**:
```typescript
{
  id: string
  name: string
  description: string | null
  starred: boolean | null
  userId: string
  createdAt: string
  updatedAt: string
  files: Array<{
    id: string
    knowledgeBaseId: string
    fileName: string
    fileSize: number
    storagePath: string
    status: 'processing' | 'completed' | 'failed'
    createdAt: string
  }>
}
```

**缓存配置**:
- `staleTime`: 5 分钟
- `cacheTime`: 10 分钟

**使用示例**:
```typescript
const { data, isLoading, error } = useKnowledgeBase(knowledgeBaseId)
```

---

## 变更（Mutations）

### 3. 创建知识库

**端点**: `POST /api/knowledgebase`

**请求体**:
```typescript
{
  name: string        // 必需，1-100 字符
  description?: string // 可选，最多 500 字符
}
```

**请求**:
```typescript
const res = await honoClient.api.knowledgebase.$post({
  json: {
    name: 'My Knowledge Base',
    description: 'Optional description',
  },
})
```

**响应**:
```typescript
{
  id: string
  name: string
  description: string | null
  starred: boolean
  userId: string
  createdAt: string
  updatedAt: string
}
```

**副作用**:
- 失效: `['knowledgeBases', 'list']`

**使用示例**:
```typescript
const createMutation = useCreateKnowledgeBase()
createMutation.mutate({
  name: 'My Knowledge Base',
  description: 'Optional description',
})
```

---

### 4. 更新知识库

**端点**: `PUT /api/knowledgebase/:id`

**请求体**:
```typescript
{
  name?: string
  description?: string
  starred?: boolean
}
```

**请求**:
```typescript
const res = await honoClient.api.knowledgebase[':id'].$put({
  param: { id: knowledgeBaseId },
  json: {
    name: 'Updated Name',
    starred: true,
  },
})
```

**响应**:
```typescript
{
  id: string
  name: string
  description: string | null
  starred: boolean | null
  userId: string
  createdAt: string
  updatedAt: string
}
```

**副作用**:
- 失效: `['knowledgeBases', 'detail', id]`, `['knowledgeBases', 'list']`
- 乐观更新: **是**（仅针对 starred 字段）

**使用示例**:
```typescript
const updateMutation = useUpdateKnowledgeBase()

// 乐观更新示例（收藏/取消收藏）
updateMutation.mutate({
  id: knowledgeBaseId,
  starred: true,
})
```

---

### 5. 删除知识库

**端点**: `DELETE /api/knowledgebase/:id`

**请求**:
```typescript
const res = await honoClient.api.knowledgebase[':id'].$delete({
  param: { id: knowledgeBaseId },
})
```

**响应**:
```typescript
{
  success: boolean
  message: string
}
```

**副作用**:
- 失效: `['knowledgeBases']` (所有知识库查询)
- 乐观更新: **是**（立即从列表移除）

**使用示例**:
```typescript
const deleteMutation = useDeleteKnowledgeBase()
deleteMutation.mutate(knowledgeBaseId)
```

---

### 6. 上传文件

**端点**: `POST /api/knowledgebase/:id/files`

**请求体**: `multipart/form-data`
```typescript
{
  file: File  // 支持 .txt/.md/.pdf/.docx/.json，最大 10MB
}
```

**请求**:
```typescript
const formData = new FormData()
formData.append('file', file)

const res = await fetch(`/api/knowledgebase/${knowledgeBaseId}/files`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
})
```

**说明**: 使用原生 `fetch` 而非 Hono RPC，以便跟踪上传进度

**响应**:
```typescript
{
  id: string
  knowledgeBaseId: string
  fileName: string
  fileSize: number
  storagePath: string
  status: 'processing' | 'completed' | 'failed'
  createdAt: string
  embeddingCount?: number  // 可选，成功时返回
}
```

**副作用**:
- 失效: `['knowledgeBases', 'detail', id, 'files']`, `['knowledgeBases', 'detail', id]`

**使用示例**:
```typescript
const uploadMutation = useUploadKnowledgeBaseFile()
uploadMutation.mutate({
  knowledgeBaseId,
  file,
})
```

---

### 7. 删除文件

**端点**: `DELETE /api/knowledgebase/:id/files/:fileId`

**请求**:
```typescript
const res = await honoClient.api.knowledgebase[':id'].files[':fileId'].$delete({
  param: {
    id: knowledgeBaseId,
    fileId: fileId,
  },
})
```

**响应**:
```typescript
{
  success: boolean
  message: string
}
```

**副作用**:
- 失效: `['knowledgeBases', 'detail', id, 'files']`, `['knowledgeBases', 'detail', id]`
- 乐观更新: **是**（立即从文件列表移除）

**使用示例**:
```typescript
const deleteFileMutation = useDeleteKnowledgeBaseFile()
deleteFileMutation.mutate({
  knowledgeBaseId,
  fileId,
})
```

---

## 错误处理合约

### 标准错误响应

所有 API 在失败时返回：

```typescript
{
  error: string  // 错误消息（英文，用户可见）
}
```

**HTTP 状态码映射**:

| 状态码 | 含义 | 客户端处理 |
|--------|------|-----------|
| 200 | 成功 | 正常处理响应 |
| 400 | 无效请求 | 显示错误消息，不重试 |
| 401 | 未授权 | 重定向到登录页 |
| 403 | 禁止访问 | 显示权限错误，不重试 |
| 404 | 资源不存在 | 显示"未找到"消息，不重试 |
| 409 | 冲突（如名称重复） | 显示错误消息，不重试 |
| 500 | 服务器错误 | 显示通用错误，重试最多 3 次 |

### 错误处理示例

```typescript
const mutation = useMutation({
  mutationFn: createKnowledgeBaseFn,
  onError: (error: Error) => {
    // 假设 error 包含 HTTP 状态码和消息
    const httpError = error as { status: number; message: string }

    switch (httpError.status) {
      case 401:
        // 重定向到登录
        router.navigate({ to: '/login' })
        break
      case 409:
        // 显示冲突错误（如名称已存在）
        showAlert({ variant: 'destructive', title: httpError.message })
        break
      default:
        // 通用错误
        showAlert({
          variant: 'destructive',
          title: 'Failed to create knowledge base',
          description: httpError.message || 'Please try again',
        })
    }
  },
})
```

---

## 类型安全保证

### 1. 请求类型推断

```typescript
// 从 Hono RPC 自动推断请求类型
type CreateKBPayload = InferRequestType<
  typeof honoClient.api.knowledgebase['$post']
>['json']

// 结果：{ name: string; description?: string }
```

### 2. 响应类型推断

```typescript
// 从 Hono RPC 自动推断响应类型
type KBListResponse = InferResponseType<
  typeof honoClient.api.knowledgebase['$get'],
  200
>

// 结果：{ knowledgeBases: Array<{ id: string; name: string; starred: boolean | null }> }
```

### 3. TanStack Query 自动推断

```typescript
// useQuery 自动推断返回类型
const { data } = useKnowledgeBases()
//     ^? KBListResponse（自动推断）

// useMutation 自动推断参数类型
const mutation = useCreateKnowledgeBase()
mutation.mutate({ name: '...' })  // ✓ 类型检查通过
mutation.mutate({ invalid: '...' })  // ✗ 编译错误
```

---

## 缓存失效矩阵

| 操作 | 失效的查询键 | 失效原因 |
|------|------------|----------|
| 创建知识库 | `['knowledgeBases', 'list']` | 列表发生变化 |
| 更新知识库 | `['knowledgeBases', 'detail', id]` <br> `['knowledgeBases', 'list']` | 详情和列表都需要更新 |
| 删除知识库 | `['knowledgeBases']` | 移除所有相关缓存 |
| 上传文件 | `['knowledgeBases', 'detail', id, 'files']` <br> `['knowledgeBases', 'detail', id]` | 文件列表和知识库详情都需要更新 |
| 删除文件 | `['knowledgeBases', 'detail', id, 'files']` <br> `['knowledgeBases', 'detail', id]` | 文件列表和知识库详情都需要更新 |

---

## 认证合约

所有 API 调用需要包含认证 token：

```typescript
// Hono RPC 自动从 cookie 或 header 获取 token
// 通过 Supabase Auth 的 session

const { data } = await supabase.auth.getSession()
const token = data.session?.access_token

// Hono RPC 客户端配置已包含 credentials: 'include'
// 服务器端 requireAuth() 中间件验证 token
```

**失败处理**:
- 401 错误 → 重定向到登录页
- Token 过期 → 自动刷新（Supabase SDK 处理）

---

## 并发控制

### 防止重复请求

TanStack Query 自动防止相同查询键的重复请求：

```typescript
// 即使多个组件同时调用，也只发起一次请求
function ComponentA() {
  const { data } = useKnowledgeBases()
}

function ComponentB() {
  const { data } = useKnowledgeBases()  // 复用 ComponentA 的请求
}
```

### 防止竞态条件

```typescript
// useMutation 的 onMutate 中取消正在进行的查询
onMutate: async (variables) => {
  await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.detail(variables.id) })
  // 防止旧的查询覆盖新的乐观更新
}
```

---

## 性能优化

### 1. 预取（Prefetching）

```typescript
// 鼠标悬停时预取详情
function KnowledgeBaseListItem({ kb }) {
  const queryClient = useQueryClient()

  const handleMouseEnter = () => {
    queryClient.prefetchQuery({
      queryKey: knowledgeBaseKeys.detail(kb.id),
      queryFn: () => fetchKnowledgeBaseDetail(kb.id),
    })
  }

  return <div onMouseEnter={handleMouseEnter}>...</div>
}
```

### 2. 选择性订阅（Selector）

```typescript
// 仅订阅特定字段，减少不必要的重新渲染
const kbName = useKnowledgeBase(id, {
  select: (data) => data.name,  // 仅当 name 变化时才重新渲染
})
```

---

## 测试策略

### Mock 数据

```typescript
// 测试时使用 Mock Service Worker (MSW) 模拟 API
// 或直接 mock queryClient

const mockQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

mockQueryClient.setQueryData(knowledgeBaseKeys.lists(), mockKBList)
```

**注意**: 当前项目无测试框架，此为未来参考

---

## 版本控制

**API 版本**: v1 (隐式，无版本前缀)
**合约版本**: 1.0.0
**最后更新**: 2025-10-18

**变更策略**:
- 破坏性变更需要新的 API 版本或迁移脚本
- 后端 API 和客户端钩子应同步更新
- 类型通过 Hono RPC 自动同步，无需手动维护
