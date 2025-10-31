# 快速开始：知识库客户端优化

**功能**: 知识库客户端优化
**日期**: 2025-10-18
**目的**: 为开发者提供实施此功能的快速入门指南

## 概述

本指南帮助开发者快速理解并实施知识库客户端的 TanStack Query 重构。

**预计时间**: 4-6 小时
**难度**: 中等
**前置知识**: React Hooks, TypeScript, TanStack Query 基础

---

## 目录

1. [环境准备](#环境准备)
2. [核心概念](#核心概念)
3. [实施步骤](#实施步骤)
4. [常见问题](#常见问题)
5. [测试检查清单](#测试检查清单)

---

## 环境准备

### 依赖检查

确认项目已安装以下依赖（已在 `client/package.json` 中）：

```json
{
  "@tanstack/react-query": "^4.29.14",
  "hono": "^4.9.12",
  "react": "^18.3.1"
}
```

### 开发工具

推荐安装：
- **React DevTools**: 调试组件状态
- **TanStack Query DevTools**: 查看缓存和查询状态（已内置，需启用）

启用 Query DevTools：

```typescript
// client/src/main.tsx 或 app 入口
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 你的应用 */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

---

## 核心概念

### 1. 查询（Query）= 读取数据

```typescript
// 查询是"幂等"的，多次调用不会改变服务器状态
const { data, isLoading, error } = useQuery({
  queryKey: ['key'],
  queryFn: fetchDataFn,
})
```

### 2. 变更（Mutation）= 修改数据

```typescript
// 变更会改变服务器状态（创建/更新/删除）
const mutation = useMutation({
  mutationFn: createDataFn,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['key'] })
  },
})
```

### 3. 缓存失效（Invalidation）= 触发重新获取

```typescript
// 告诉 TanStack Query："这个数据过时了，重新获取吧"
queryClient.invalidateQueries({ queryKey: ['knowledgeBases'] })
```

### 4. 乐观更新（Optimistic Update）= 即时 UI 反馈

```typescript
// 先更新 UI，再调用 API，失败时回滚
onMutate: async (newData) => {
  await queryClient.cancelQueries({ queryKey: ['key'] })
  const previousData = queryClient.getQueryData(['key'])
  queryClient.setQueryData(['key'], newData)
  return { previousData }
},
onError: (err, variables, context) => {
  queryClient.setQueryData(['key'], context.previousData)
},
```

---

## 实施步骤

### 步骤 1：创建查询键工厂 (15 分钟)

**文件**: `client/src/lib/queryKeys.ts`

```typescript
/**
 * 查询键工厂函数
 * 用于生成一致的、层级化的查询键
 */
export const knowledgeBaseKeys = {
  // 一级：所有知识库查询的根键
  all: ['knowledgeBases'] as const,

  // 二级：列表查询
  lists: () => [...knowledgeBaseKeys.all, 'list'] as const,

  // 二级：详情查询
  details: () => [...knowledgeBaseKeys.all, 'detail'] as const,
  detail: (id: string) => [...knowledgeBaseKeys.details(), id] as const,

  // 三级：文件查询
  files: (knowledgeBaseId: string) =>
    [...knowledgeBaseKeys.detail(knowledgeBaseId), 'files'] as const,
}
```

**要点**:
- 使用 `as const` 确保 TypeScript 类型推断
- 层级结构支持批量失效（如 `knowledgeBaseKeys.all` 失效所有相关查询）

---

### 步骤 2：配置 Query Client (15 分钟)

**文件**: `client/src/lib/query-client.ts`

```typescript
import { QueryClient } from '@tanstack/react-query'

/**
 * 全局 Query Client 配置
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5 分钟内数据被认为是新鲜的，不会重新获取
      staleTime: 5 * 60 * 1000,
      // 未使用的数据在 10 分钟后从缓存中移除
      cacheTime: 10 * 60 * 1000,
      // 失败时最多重试 3 次
      retry: 3,
      // 指数退避重试延迟
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // 窗口获得焦点时重新获取（多标签页同步）
      refetchOnWindowFocus: true,
      // 网络重新连接时重新获取
      refetchOnReconnect: true,
    },
    mutations: {
      // 变更操作仅重试 1 次
      retry: 1,
    },
  },
})
```

---

### 步骤 3：创建查询钩子 (45 分钟)

#### 3.1 知识库列表查询

**文件**: `client/src/hooks/queries/useKnowledgeBases.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'

/**
 * 获取知识库列表
 * 用于侧边栏和列表页
 */
export function useKnowledgeBases() {
  return useQuery({
    queryKey: knowledgeBaseKeys.lists(),
    queryFn: async () => {
      const res = await honoClient.api.knowledgebase.$get()
      if (!res.ok) {
        throw new Error(`Failed to fetch knowledge bases: ${res.status}`)
      }
      return res.json()
    },
    // 列表更新频繁，2 分钟陈旧时间
    staleTime: 2 * 60 * 1000,
  })
}
```

#### 3.2 知识库详情查询

**文件**: `client/src/hooks/queries/useKnowledgeBase.ts`

```typescript
import { useQuery } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'

/**
 * 获取知识库详情（含文件列表）
 * 用于详情页
 */
export function useKnowledgeBase(knowledgeBaseId: string) {
  return useQuery({
    queryKey: knowledgeBaseKeys.detail(knowledgeBaseId),
    queryFn: async () => {
      const res = await honoClient.api.knowledgebase[':id'].$get({
        param: { id: knowledgeBaseId },
      })
      if (!res.ok) {
        throw new Error(`Failed to fetch knowledge base: ${res.status}`)
      }
      return res.json()
    },
    // 仅在提供了有效 ID 时启用查询
    enabled: !!knowledgeBaseId,
  })
}
```

---

### 步骤 4：创建变更钩子 (90 分钟)

#### 4.1 创建知识库

**文件**: `client/src/hooks/mutations/useCreateKnowledgeBase.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'

type CreatePayload = InferRequestType<typeof honoClient.api.knowledgebase['$post']>['json']

/**
 * 创建新知识库
 */
export function useCreateKnowledgeBase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: CreatePayload) => {
      const res = await honoClient.api.knowledgebase.$post({ json: payload })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || 'Failed to create knowledge base')
      }
      return res.json()
    },
    onSuccess: () => {
      // 创建成功后失效列表查询，触发自动重新获取
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists() })
    },
  })
}
```

#### 4.2 更新知识库（带乐观更新）

**文件**: `client/src/hooks/mutations/useUpdateKnowledgeBase.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType } from 'hono/client'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'

type UpdatePayload = InferRequestType<
  typeof honoClient.api.knowledgebase[':id']['$put']
>['json']

/**
 * 更新知识库
 * 支持乐观更新（特别是 starred 字段）
 */
export function useUpdateKnowledgeBase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePayload }) => {
      const res = await honoClient.api.knowledgebase[':id'].$put({
        param: { id },
        json: data,
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || 'Failed to update knowledge base')
      }
      return res.json()
    },
    // 乐观更新：立即更新 UI，失败时回滚
    onMutate: async ({ id, data }) => {
      // 1. 取消正在进行的查询，防止竞态条件
      await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.detail(id) })

      // 2. 保存当前值用于回滚
      const previousDetail = queryClient.getQueryData(knowledgeBaseKeys.detail(id))
      const previousList = queryClient.getQueryData(knowledgeBaseKeys.lists())

      // 3. 乐观更新详情缓存
      queryClient.setQueryData(knowledgeBaseKeys.detail(id), (old: any) =>
        old ? { ...old, ...data } : old
      )

      // 4. 乐观更新列表缓存
      queryClient.setQueryData(knowledgeBaseKeys.lists(), (old: any) => {
        if (!old?.knowledgeBases) return old
        return {
          ...old,
          knowledgeBases: old.knowledgeBases.map((kb: any) =>
            kb.id === id ? { ...kb, ...data } : kb
          ),
        }
      })

      return { previousDetail, previousList }
    },
    // 失败时回滚
    onError: (err, variables, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(knowledgeBaseKeys.detail(variables.id), context.previousDetail)
      }
      if (context?.previousList) {
        queryClient.setQueryData(knowledgeBaseKeys.lists(), context.previousList)
      }
    },
    // 无论成功或失败，都重新获取以确保数据一致性
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists() })
    },
  })
}
```

#### 4.3 删除知识库

**文件**: `client/src/hooks/mutations/useDeleteKnowledgeBase.ts`

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { honoClient } from '@/lib/hono-client'
import { knowledgeBaseKeys } from '@/lib/queryKeys'

/**
 * 删除知识库
 * 支持乐观更新（立即从列表移除）
 */
export function useDeleteKnowledgeBase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await honoClient.api.knowledgebase[':id'].$delete({
        param: { id },
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(error.error || 'Failed to delete knowledge base')
      }
      return res.json()
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: knowledgeBaseKeys.lists() })

      const previousList = queryClient.getQueryData(knowledgeBaseKeys.lists())

      // 乐观更新：立即从列表移除
      queryClient.setQueryData(knowledgeBaseKeys.lists(), (old: any) => {
        if (!old?.knowledgeBases) return old
        return {
          ...old,
          knowledgeBases: old.knowledgeBases.filter((kb: any) => kb.id !== id),
        }
      })

      return { previousList }
    },
    onError: (err, variables, context) => {
      if (context?.previousList) {
        queryClient.setQueryData(knowledgeBaseKeys.lists(), context.previousList)
      }
    },
    onSuccess: (data, id) => {
      // 删除所有相关缓存
      queryClient.removeQueries({ queryKey: knowledgeBaseKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists() })
    },
  })
}
```

---

### 步骤 5：迁移 UI 组件 (90 分钟)

#### 5.1 侧边栏列表组件

**文件**: `client/src/components/layout/sidebar-left/knowledge-base-list.tsx`

**修改前**:
```typescript
const { getKnowledgeBases, updateKnowledgeBase } = useKnowledgeBaseRPC()

const [data, setData] = useState(null)
const [loading, setLoading] = useState(true)

useEffect(() => {
  getKnowledgeBases().then(setData).finally(() => setLoading(false))
}, [])
```

**修改后**:
```typescript
// 导入新钩子
import { useKnowledgeBases } from '@/hooks/queries/useKnowledgeBases'
import { useUpdateKnowledgeBase } from '@/hooks/mutations/useUpdateKnowledgeBase'

// 使用查询钩子
const { data, isLoading, error } = useKnowledgeBases()

// 使用变更钩子
const updateMutation = useUpdateKnowledgeBase()

const handleToggleStar = (id: string, starred: boolean) => {
  updateMutation.mutate({ id, data: { starred } })
}
```

**关键变化**:
- 移除手动状态管理（`useState`, `useEffect`）
- 使用 `isLoading` 而非手动 `loading` 状态
- 直接调用 `mutation.mutate()` 而非 `await updateKnowledgeBase()`

#### 5.2 详情页组件

**文件**: `client/src/routes/_authenticated/(knowledge-base)/knowledge-base.$knowledgeBaseId.tsx`

**修改前**:
```typescript
const { getKnowledgeBase, updateKnowledgeBase, uploadKnowledgeBaseFile } = useKnowledgeBaseRPC()

const [data, setData] = useState(null)

const refetch = async () => {
  const result = await getKnowledgeBase(knowledgeBaseId)
  setData(result)
}

useEffect(() => {
  refetch()
}, [knowledgeBaseId])
```

**修改后**:
```typescript
import { useKnowledgeBase } from '@/hooks/queries/useKnowledgeBase'
import { useUpdateKnowledgeBase } from '@/hooks/mutations/useUpdateKnowledgeBase'
import { useUploadKnowledgeBaseFile } from '@/hooks/mutations/useUploadKnowledgeBaseFile'

// 查询自动处理依赖变化
const { data, isLoading, error, refetch } = useKnowledgeBase(knowledgeBaseId)

// 变更钩子
const updateMutation = useUpdateKnowledgeBase()
const uploadMutation = useUploadKnowledgeBaseFile()
```

---

### 步骤 6：废弃旧钩子 (10 分钟)

**文件**: `client/src/hooks/useKnowledgeBaseRPC.ts`

在文件顶部添加废弃警告：

```typescript
/**
 * @deprecated 使用 hooks/queries/ 和 hooks/mutations/ 中的新钩子替代
 * 迁移指南:
 * - getKnowledgeBases() → useKnowledgeBases()
 * - getKnowledgeBase(id) → useKnowledgeBase(id)
 * - createKnowledgeBase(data) → useCreateKnowledgeBase().mutate(data)
 * - updateKnowledgeBase(id, data) → useUpdateKnowledgeBase().mutate({ id, data })
 * - deleteKnowledgeBase(id) → useDeleteKnowledgeBase().mutate(id)
 * - uploadKnowledgeBaseFile(id, file) → useUploadKnowledgeBaseFile().mutate({ knowledgeBaseId: id, file })
 * - deleteKnowledgeBaseFile(id, fileId) → useDeleteKnowledgeBaseFile().mutate({ knowledgeBaseId: id, fileId })
 */
export function useKnowledgeBaseRPC() {
  // ... 现有代码保持不变，仅添加注释
}
```

---

## 常见问题

### Q1: 为什么查询返回 `undefined`？

**A**: 查询尚未完成或被禁用。检查：
```typescript
const { data, isLoading } = useKnowledgeBase(id)

if (isLoading) return <div>Loading...</div>
if (!data) return <div>No data</div>
// 此时 data 保证存在
```

### Q2: 为什么乐观更新没有立即生效？

**A**: 确保：
1. `onMutate` 中调用了 `setQueryData`
2. 缓存键与查询键完全匹配
3. 没有其他查询覆盖了乐观更新

### Q3: 如何强制重新获取数据？

**A**: 使用 `refetch()` 或 `invalidateQueries()`:
```typescript
const { refetch } = useKnowledgeBases()
// 手动重新获取
refetch()

// 或失效缓存触发自动重新获取
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists() })
```

### Q4: 缓存什么时候会被清除？

**A**:
- `cacheTime` 到期后（默认 10 分钟）
- 手动调用 `removeQueries()`
- 页面刷新

### Q5: 类型错误："Property does not exist"

**A**: 确保：
1. Hono RPC 客户端类型正确导入
2. 使用 `InferRequestType` 和 `InferResponseType` 推断类型
3. 后端 API 类型已更新（运行 `npm run build` 在 server 目录）

---

## 测试检查清单

完成实施后，逐项测试以下场景：

### 基础功能

- [ ] 打开侧边栏，知识库列表正确加载
- [ ] 点击知识库，详情页正确加载
- [ ] 创建新知识库，列表自动更新
- [ ] 编辑知识库名称，详情页和列表同步更新
- [ ] 删除知识库，列表自动更新

### 乐观更新

- [ ] 点击星标，图标立即切换（无明显延迟）
- [ ] 星标操作失败时，图标恢复到原状态
- [ ] 快速连续点击星标，不会出现闪烁或错误

### 缓存行为

- [ ] 第二次访问列表页，数据立即显示（从缓存）
- [ ] 切换标签页 5 分钟后返回，数据自动刷新
- [ ] 在多个标签页修改数据，其他标签页自动同步

### 文件上传

- [ ] 上传文件，进度指示器正常显示
- [ ] 上传成功，文件立即出现在列表中
- [ ] 上传失败，显示错误消息且文件不出现在列表中

### 错误处理

- [ ] 网络断开时，显示友好的错误消息
- [ ] 401 错误，重定向到登录页
- [ ] 404 错误，显示"未找到"消息

### 性能

- [ ] 使用 React DevTools Profiler 对比重构前后渲染次数
- [ ] 使用 Network 面板确认无重复请求
- [ ] 乐观更新响应时间 <16ms（使用 Performance 面板）

---

## 下一步

完成本快速开始后：

1. ✅ **运行完整的手动测试** - 使用上述检查清单
2. ✅ **审查代码** - 确保符合宪章原则
3. ✅ **提交 PR** - 包含测试截图和性能对比
4. 📝 **文档更新** - 更新项目 README 说明新的钩子使用方式
5. 🚀 **部署** - 推送到生产环境

---

## 参考资料

- [TanStack Query 官方文档](https://tanstack.com/query/v4/docs/react/overview)
- [Hono RPC 文档](https://hono.dev/guides/rpc)
- [项目规格说明](./spec.md)
- [研究文档](./research.md)
- [数据模型](./data-model.md)
- [API 使用合约](./contracts/api-usage.md)

---

**祝你重构顺利！** 如有问题，参考研究文档或咨询团队成员。
