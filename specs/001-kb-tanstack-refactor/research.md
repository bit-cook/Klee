# 研究文档：知识库客户端优化

**功能**: 知识库客户端优化
**日期**: 2025-10-18
**目的**: 解决技术上下文中的 NEEDS CLARIFICATION 项，并研究 TanStack Query 最佳实践

## 研究项目

### 1. 测试策略

**决策**: 暂不添加自动化测试框架

**理由**:
1. **现状评估**: 当前项目无自动化测试框架，添加测试框架是独立的大型任务
2. **优先级**: 本次重构专注于数据层优化，保持零回归是通过手动测试和类型安全保证的
3. **风险控制**: 通过 TypeScript 严格模式和 Hono RPC 类型推断，编译时已能捕获大部分错误
4. **渐进式改进**: 测试框架应作为独立任务在未来添加，覆盖整个应用而非单一功能

**备选方案考虑**:
- **添加 Vitest + Testing Library**: 被拒绝，因为会显著增加本次重构的范围和复杂度
- **仅添加类型测试**: 被拒绝，TypeScript 编译已提供充分的类型安全性

**实施建议**: 创建单独的 feature 来引入测试框架，覆盖所有模块

---

### 2. TanStack Query 最佳实践研究

**主题**: 如何在保持 Hono RPC 类型安全的前提下使用 TanStack Query

**决策**: 采用"查询键工厂 + 自定义钩子"模式

**研究发现**:

#### 2.1 查询键管理

**最佳实践**: 使用查询键工厂函数，确保一致性和可维护性

```typescript
// lib/queryKeys.ts
export const knowledgeBaseKeys = {
  all: ['knowledgeBases'] as const,
  lists: () => [...knowledgeBaseKeys.all, 'list'] as const,
  list: (filters: string) => [...knowledgeBaseKeys.lists(), { filters }] as const,
  details: () => [...knowledgeBaseKeys.all, 'detail'] as const,
  detail: (id: string) => [...knowledgeBaseKeys.details(), id] as const,
  files: (id: string) => [...knowledgeBaseKeys.detail(id), 'files'] as const,
}
```

**优势**:
- 集中管理查询键，避免字符串重复
- 支持层级失效（如 `queryClient.invalidateQueries(knowledgeBaseKeys.all)` 失效所有知识库查询）
- TypeScript 类型安全（使用 `as const`）
- 参考：[TanStack Query 官方文档 - Effective Query Keys](https://tanstack.com/query/v4/docs/react/community/tkdodos-blog#8-effective-react-query-keys)

#### 2.2 类型安全集成

**决策**: 保留 Hono RPC 客户端作为底层 API 调用层，TanStack Query 仅作为缓存和状态管理层

**实现模式**:

```typescript
// hooks/queries/useKnowledgeBases.ts
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'

export function useKnowledgeBases() {
  return useQuery({
    queryKey: knowledgeBaseKeys.lists(),
    queryFn: async () => {
      const res = await honoClient.api.knowledgebase.$get()
      if (!res.ok) throw new Error('Failed to fetch knowledge bases')
      return res.json() // 类型自动从 Hono RPC 推断
    },
  })
}
```

**优势**:
- 完全保留 Hono RPC 的端到端类型安全
- 零手动类型定义
- TanStack Query 自动推断返回类型
- 编译时类型错误检测

#### 2.3 乐观更新模式

**最佳实践**: 使用 `useMutation` 的 `onMutate` + `onError` + `onSettled` 生命周期

```typescript
// hooks/mutations/useUpdateKnowledgeBase.ts
export function useUpdateKnowledgeBase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await honoClient.api.knowledgebase[':id'].$put({
        param: { id },
        json: data,
      })
      if (!res.ok) throw new Error('Failed to update')
      return res.json()
    },
    onMutate: async ({ id, data }) => {
      // 1. 取消正在进行的查询，避免竞态条件
      await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.detail(id) })

      // 2. 保存当前值用于回滚
      const previousData = queryClient.getQueryData(knowledgeBaseKeys.detail(id))

      // 3. 乐观更新缓存
      queryClient.setQueryData(knowledgeBaseKeys.detail(id), (old) => ({
        ...old,
        ...data,
      }))

      return { previousData }
    },
    onError: (err, variables, context) => {
      // 回滚到之前的值
      if (context?.previousData) {
        queryClient.setQueryData(
          knowledgeBaseKeys.detail(variables.id),
          context.previousData
        )
      }
    },
    onSettled: (data, error, variables) => {
      // 无论成功或失败，都重新获取以确保数据一致性
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(variables.id) })
    },
  })
}
```

**参考**: [TanStack Query 官方文档 - Optimistic Updates](https://tanstack.com/query/v4/docs/react/guides/optimistic-updates)

#### 2.4 缓存策略配置

**决策**: 根据数据特性设置不同的陈旧时间

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 分钟 - 默认陈旧时间
      cacheTime: 10 * 60 * 1000, // 10 分钟 - 缓存保留时间
      retry: 3, // 失败重试 3 次
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // 指数退避
      refetchOnWindowFocus: true, // 窗口焦点时重新获取
      refetchOnReconnect: true, // 重新连接时重新获取
    },
    mutations: {
      retry: 1, // 变更操作仅重试 1 次
    },
  },
})
```

**特定查询调整**:
- **知识库列表**: `staleTime: 2 * 60 * 1000` (2 分钟) - 更频繁更新
- **知识库详情**: `staleTime: 5 * 60 * 1000` (5 分钟) - 默认值
- **文件列表**: `staleTime: 1 * 60 * 1000` (1 分钟) - 文件状态可能快速变化

**参考**: [TanStack Query 官方文档 - Important Defaults](https://tanstack.com/query/v4/docs/react/guides/important-defaults)

#### 2.5 缓存失效策略

**最佳实践**: 根据操作影响范围精确失效相关查询

**失效矩阵**:

| 操作 | 失效查询 |
|------|---------|
| 创建知识库 | `knowledgeBaseKeys.lists()` |
| 更新知识库 | `knowledgeBaseKeys.detail(id)`, `knowledgeBaseKeys.lists()` |
| 删除知识库 | `knowledgeBaseKeys.all` (删除所有相关缓存) |
| 上传文件 | `knowledgeBaseKeys.files(knowledgeBaseId)`, `knowledgeBaseKeys.detail(knowledgeBaseId)` |
| 删除文件 | `knowledgeBaseKeys.files(knowledgeBaseId)`, `knowledgeBaseKeys.detail(knowledgeBaseId)` |

**实现示例**:

```typescript
// hooks/mutations/useCreateKnowledgeBase.ts
export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createKnowledgeBaseFn,
    onSuccess: () => {
      // 创建成功后失效列表查询，触发自动重新获取
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists() })
    },
  })
}
```

#### 2.6 文件上传进度跟踪

**挑战**: TanStack Query 的 `useMutation` 不直接支持上传进度

**决策**: 使用 React 状态配合 Fetch API 的 `ReadableStream`

**实现方案**:

```typescript
export function useUploadKnowledgeBaseFile() {
  const [uploadProgress, setUploadProgress] = useState(0)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async ({ knowledgeBaseId, file }) => {
      // 使用原生 fetch 而非 Hono RPC（以支持进度跟踪）
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/knowledgebase/${knowledgeBaseId}/files`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Upload failed')

      // 可选：使用 response.body.getReader() 跟踪下载进度
      return response.json()
    },
    onSuccess: (data, variables) => {
      setUploadProgress(0) // 重置进度
      queryClient.invalidateQueries({
        queryKey: knowledgeBaseKeys.files(variables.knowledgeBaseId),
      })
    },
  })

  return { ...mutation, uploadProgress }
}
```

**备选方案**: 使用 `axios` 的 `onUploadProgress`（被拒绝，避免引入额外依赖）

#### 2.7 多标签页同步

**决策**: 依赖 TanStack Query 的内置窗口焦点重新获取

**配置**: `refetchOnWindowFocus: true` (已在全局配置中启用)

**工作原理**:
1. 用户在标签页 A 修改数据
2. 用户切换到标签页 B
3. 标签页 B 的窗口焦点触发器检测到焦点恢复
4. TanStack Query 自动重新获取所有活动查询
5. 标签页 B 的 UI 自动更新

**无需额外代码**，开箱即用。

---

### 3. 迁移策略

**决策**: 渐进式迁移，保持向后兼容

**阶段划分**:

1. **阶段 1**: 创建新钩子和配置
   - 创建 `lib/query-client.ts`
   - 创建 `lib/queryKeys.ts`
   - 创建 `hooks/queries/` 和 `hooks/mutations/`

2. **阶段 2**: 迁移 UI 组件
   - 迁移 `knowledge-base-list.tsx` (侧边栏)
   - 迁移 `knowledge-base.index.tsx` (列表页)
   - 迁移 `knowledge-base.$knowledgeBaseId.tsx` (详情页)

3. **阶段 3**: 废弃旧钩子
   - 标记 `useKnowledgeBaseRPC` 为 `@deprecated`
   - 添加迁移指南注释
   - （可选）在未来版本中移除

**零停机迁移**:
- 新旧钩子可以并存
- 组件逐个迁移，而非一次性全部迁移
- 每个组件迁移后立即测试

---

## 技术选型总结

| 技术点 | 选择 | 理由 |
|--------|------|------|
| 数据层 | TanStack Query v4 | 已安装，成熟稳定，社区支持好 |
| 类型安全 | Hono RPC + 类型推断 | 保持现有端到端类型安全 |
| 查询键管理 | 工厂函数模式 | 官方推荐，可维护性高 |
| 乐观更新 | onMutate + onError | 官方模式，可靠且可测试 |
| 缓存策略 | 分层陈旧时间 | 根据数据特性优化性能 |
| 文件上传 | 原生 Fetch API | 支持进度跟踪，无需额外依赖 |
| 多标签页同步 | 窗口焦点重新获取 | 内置功能，零配置 |

---

## 参考资料

1. [TanStack Query 官方文档 v4](https://tanstack.com/query/v4/docs/react/overview)
2. [Effective React Query Keys - TkDodo's Blog](https://tanstack.com/query/v4/docs/react/community/tkdodos-blog#8-effective-react-query-keys)
3. [Optimistic Updates - TanStack Query](https://tanstack.com/query/v4/docs/react/guides/optimistic-updates)
4. [Hono RPC 文档](https://hono.dev/guides/rpc)
5. [项目现有知识库实施文档](../../docs/knowledge-base.md)

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 类型推断失败 | 高 | 通过 TypeScript strict 模式编译时检测 |
| 缓存失效错误 | 中 | 编写单元测试覆盖失效逻辑（未来任务） |
| 性能回退 | 低 | 使用 React DevTools Profiler 对比前后性能 |
| 用户体验回归 | 高 | 每个组件迁移后进行手动测试 |
| 文件上传中断 | 中 | 添加错误处理和用户友好的错误消息 |
