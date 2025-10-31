# 快速开始：市场商店分享功能

**功能**: 004-marketplace-sharing
**日期**: 2025-10-19
**预计开发时间**: 3-5 天

## 概述

本指南帮助开发者快速理解并开始实施市场商店分享功能。功能分为 6 个主要模块，建议按顺序实施。

## 前置准备

### 1. 安装依赖

```bash
# 后端
cd server
npm install nanoid

# 前端（无新依赖）
```

### 2. 数据库迁移

```bash
cd server

# 修改 schema.ts 添加分享字段（参考 data-model.md）

# 生成迁移文件
npx drizzle-kit generate

# 执行迁移（推送到 Supabase）
npx drizzle-kit push

# 验证迁移
# 打开 Supabase Dashboard > Table Editor 查看表结构
```

### 3. 环境验证

```bash
# 类型检查
npx tsc --noEmit

# 启动开发服务器
npm run dev
```

---

## 实施路线图

### 阶段 1: 数据层（后端） - 1 天

**目标**: 扩展数据库 schema 和查询函数

#### 任务清单

1. ✅ **修改 schema.ts**
   - [ ] 在 `chatConfigs` 添加 `avatar`, `isPublic`, `shareSlug`, `sourceShareSlug`
   - [ ] 在 `knowledgeBases` 添加 `isPublic`, `shareSlug`
   - [ ] 添加索引和唯一约束
   - [ ] 使用 drizzle-zod 生成验证器

2. ✅ **创建工具函数**
   ```
   server/src/lib/slug-generator.ts
   - generateShareSlug()
   ```

3. ✅ **扩展查询函数**
   ```
   server/db/queries/marketplace.ts (新建)
   - getPublicAgents(page, search)
   - getPublicKnowledgeBases(page, search)
   - getAgentByShareSlug(shareSlug)
   - getKnowledgeBaseByShareSlug(shareSlug)
   - countPublicAgents(search)
   - countPublicKnowledgeBases(search)

   server/db/queries/chatConfig.ts (扩展)
   - shareChatConfig(id, userId, isPublic)
   - installAgent(shareSlug, userId)
   - checkAgentInstalled(userId, sourceShareSlug)

   server/db/queries/knowledgebase.ts (扩展)
   - shareKnowledgeBase(id, userId, isPublic)
   - getAccessibleKnowledgeBases(userId)
   ```

**验证**: 运行 `npx tsc --noEmit` 确保无类型错误

---

### 阶段 2: API 层（后端） - 1 天

**目标**: 实现 Hono RPC 端点

#### 任务清单

1. ✅ **创建 Marketplace API**
   ```
   server/src/routes/marketplace.ts (新建)
   - GET /api/marketplace/agents
   - GET /api/marketplace/knowledge-bases
   - GET /api/marketplace/agents/:shareSlug
   - GET /api/marketplace/knowledge-bases/:shareSlug
   ```

2. ✅ **扩展 ChatConfig API**
   ```
   server/src/routes/chatConfig.ts (扩展)
   - POST /api/chat-configs (从 Chat 创建)
   - PUT /api/chat-configs/:id/share (分享/取消分享)
   - POST /api/chat-configs/install (安装)
   - GET /api/chat-configs/check-installed/:shareSlug
   ```

3. ✅ **扩展 KnowledgeBase API**
   ```
   server/src/routes/knowledgebase.ts (扩展)
   - PUT /api/knowledgebase/:id/share
   ```

4. ✅ **添加 Zod 验证**
   - createChatConfigSchema
   - shareChatConfigSchema
   - installAgentSchema
   - shareKnowledgeBaseSchema

5. ✅ **导出类型**
   ```typescript
   // server/src/routes/index.ts
   export type AppType = typeof app
   ```

**验证**:
```bash
# 使用 curl 或 Postman 测试端点
curl http://localhost:PORT/api/marketplace/agents

# 检查 Hono RPC 类型导出
npm run build
```

---

### 阶段 3: 前端数据层 - 1 天

**目标**: 实现 TanStack Query hooks

#### 任务清单

1. ✅ **扩展 queryKeys**
   ```typescript
   // client/src/lib/queryKeys.ts
   export const marketplaceKeys = {
     all: ['marketplace'] as const,
     agents: () => [...marketplaceKeys.all, 'agents'] as const,
     agentsList: (page: number, search?: string) =>
       [...marketplaceKeys.agents(), 'list', { page, search }] as const,
     agentDetail: (shareSlug: string) =>
       [...marketplaceKeys.agents(), 'detail', shareSlug] as const,
     knowledgeBases: () => [...marketplaceKeys.all, 'knowledge-bases'] as const,
     knowledgeBasesList: (page: number, search?: string) =>
       [...marketplaceKeys.knowledgeBases(), 'list', { page, search }] as const,
     knowledgeBaseDetail: (shareSlug: string) =>
       [...marketplaceKeys.knowledgeBases(), 'detail', shareSlug] as const,
   }

   export const chatConfigKeys = {
     all: ['chatConfigs'] as const,
     lists: () => [...chatConfigKeys.all, 'list'] as const,
     detail: (id: string) => [...chatConfigKeys.all, 'detail', id] as const,
   }
   ```

2. ✅ **创建 Marketplace Hooks**
   ```
   client/src/hooks/marketplace/queries/
   - useMarketplaceAgents.ts
   - useMarketplaceAgent.ts
   - useMarketplaceKnowledgeBases.ts
   - useMarketplaceKnowledgeBase.ts

   client/src/hooks/marketplace/mutations/
   - useInstallAgent.ts
   - useShareAgent.ts
   - useShareKnowledgeBase.ts
   ```

3. ✅ **创建 ChatConfig Hooks**
   ```
   client/src/hooks/chat-config/queries/
   - useChatConfigs.ts
   - useCheckAgentInstalled.ts

   client/src/hooks/chat-config/mutations/
   - useCreateAgentFromChat.ts
   ```

**示例代码**:
```typescript
// useMarketplaceAgents.ts
export function useMarketplaceAgents(page: number, search?: string) {
  return useQuery({
    queryKey: marketplaceKeys.agentsList(page, search),
    queryFn: async () => {
      const res = await honoClient.api.marketplace.agents.$get({
        query: { page: String(page), search }
      })
      if (!res.ok) throw new Error('Failed to fetch agents')
      return res.json()
    },
    staleTime: 2 * 60 * 1000, // 2 分钟
  })
}

// useInstallAgent.ts
export function useInstallAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (shareSlug: string) => {
      const res = await honoClient.api['chat-configs'].install.$post({
        json: { shareSlug }
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error)
      }
      return res.json()
    },
    onSuccess: () => {
      // 失效用户 ChatConfig 列表缓存
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() })
    }
  })
}
```

**验证**: 使用 TanStack Query DevTools 监控查询状态

---

### 阶段 4: UI 组件 - 1 天

**目标**: 实现市场页面和 Agent 创建表单

#### 任务清单

1. ✅ **调整市场首页**
   ```
   client/src/routes/_authenticated/(marketplace)/marketplace.index.tsx
   - 集成 useMarketplaceAgents 和 useMarketplaceKnowledgeBases
   - 实现搜索和分页
   - 替换 mock 数据为真实 API 数据
   ```

2. ✅ **调整 Agent 详情/创建页面**
   ```
   client/src/routes/_authenticated/(marketplace)/marketplace.agent.$agentId.tsx
   - 添加 avatar 字段（emoji picker 或 URL 输入）
   - 移除 Instructions 字段
   - 集成 useCreateAgentFromChat（新建）或 useUpdateChatConfig（编辑）
   - 处理 "new" 路由参数（创建新 Agent）
   - 处理从 Chat 跳转时的配置预填充
   ```

3. ✅ **添加分享按钮**
   ```
   client/src/components/chat-config/
   - ShareAgentButton.tsx (在 ChatConfig 列表项添加分享按钮)
   ```

4. ✅ **Chat 页面集成**
   ```
   client/src/routes/_authenticated/(chat)/chat.$chatId.tsx
   - 添加 "Share & Create Agent" 按钮到右侧边栏
   - 按钮点击跳转到 /marketplace/agent/new?from=chat&chatId={chatId}
   - 使用 TanStack Router 的 navigate 和 search params
   ```

**示例代码**:
```typescript
// Chat 页面跳转逻辑
const navigate = useNavigate()
const { chatId } = useParams({ from: '/_authenticated/(chat)/chat/$chatId' })

const handleShareAgent = () => {
  navigate({
    to: '/marketplace/agent/new',
    search: { from: 'chat', chatId }
  })
}

// Agent 创建页面获取预填充数据
const { from, chatId } = Route.useSearch()

useEffect(() => {
  if (from === 'chat' && chatId) {
    // 从 ChatSession 获取配置
    const chatSession = await honoClient.api.chat[':id'].$get({ param: { id: chatId } })
    // 预填充表单
    form.setValue('systemPrompt', chatSession.systemPrompt)
    form.setValue('model', chatSession.model)
    // ...
  }
}, [from, chatId])
```

---

### 阶段 5: 知识库分享（可选） - 0.5 天

**目标**: 实现知识库分享功能

#### 任务清单

1. ✅ **知识库列表添加分享按钮**
   ```
   client/src/routes/_authenticated/(knowledge-base)/knowledge-base.index.tsx
   - 添加分享/取消分享按钮
   - 使用 useShareKnowledgeBase mutation
   ```

2. ✅ **市场知识库详情页**
   ```
   client/src/routes/_authenticated/(marketplace)/marketplace.knowledge-base.$shareSlug.tsx (新建)
   - 显示知识库详情和文件列表
   - 添加"在 Agent 中使用"按钮（跳转到 Agent 创建页面并预选此知识库）
   ```

---

### 阶段 6: 测试和优化 - 1 天

**目标**: 手动测试和性能优化

#### 测试清单

**功能测试**:
- [ ] 从 Chat 创建 Agent（配置正确预填充）
- [ ] 上传/选择 avatar
- [ ] 分享 Agent 到市场（生成 shareSlug）
- [ ] 浏览市场列表（Agents 和 Knowledge Bases 标签页）
- [ ] 搜索功能（实时过滤）
- [ ] 查看 Agent 详情（包含知识库）
- [ ] 安装 Agent（复制配置和知识库引用）
- [ ] 防止重复安装（显示"已安装"状态）
- [ ] 取消分享（Agent 从市场移除）
- [ ] 知识库分享和浏览

**边缘情况**:
- [ ] 空知识库分享（返回错误提示）
- [ ] 无效 shareSlug 访问（404 页面）
- [ ] 已删除 Agent 的链接（友好错误消息）
- [ ] 知识库被删除后，Agent 中的引用显示"不可用"

**性能验证**:
- [ ] 市场列表加载 < 2 秒
- [ ] Agent 详情加载 < 300ms
- [ ] 安装操作 < 1 秒
- [ ] TanStack Query 缓存正常工作（DevTools 验证）

**UI/UX 检查**:
- [ ] 所有文本为英文（按钮、错误提示、表单标签）
- [ ] 加载状态显示（骨架屏或 spinner）
- [ ] 错误消息清晰友好
- [ ] 乐观更新流畅（分享/安装时 UI 立即响应）

---

## 开发工具和调试

### TanStack Query DevTools

```typescript
// client/src/main.tsx (已启用)
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

<ReactQueryDevtools initialIsOpen={false} />
```

**使用方法**:
1. 打开应用，点击右下角 TanStack Query 图标
2. 查看所有查询状态、缓存数据
3. 手动触发重新获取或失效缓存

### Supabase Dashboard

直接使用 Supabase Dashboard 查看和编辑数据库数据：
1. 打开 Supabase 项目控制台
2. 进入 Table Editor 查看表结构和数据
3. 使用 SQL Editor 执行自定义查询

### 类型检查

```bash
# 前端
cd client
npx tsc --noEmit

# 后端
cd server
npx tsc --noEmit
```

---

## 常见问题

### Q1: shareSlug 冲突怎么办？

A: nanoid(10) 生成的 10 字符 ID 碰撞概率极低（生成 1 billion IDs 需要 ~25 years 才有 1% 碰撞概率）。数据库 UNIQUE 约束会捕获冲突，此时重新生成 slug。

### Q2: 如何处理 Agent 更新？

A: 当前版本不支持更新已安装的 Agent。sourceShareSlug 字段为未来实现更新检测预留。用户可以重新安装最新版本。

### Q3: 知识库删除后 Agent 如何显示？

A: Agent 的 knowledgeBases 关联仍保留，但查询时检查 knowledge_bases 表。如果知识库被删除或取消分享，UI 标记为"不可用"。

### Q4: 如何优化搜索性能？

A: 当前使用 ILIKE 进行大小写不敏感搜索。如果性能成为瓶颈，考虑：
1. 添加 pg_trgm 扩展实现模糊搜索
2. 使用全文搜索（PostgreSQL FTS）
3. 引入 Elasticsearch（过度设计，不建议）

### Q5: 测试框架推荐？

A: 项目当前没有测试，建议未来引入 Vitest + Testing Library。优先级：
1. 单元测试：工具函数（slug-generator, query functions）
2. 集成测试：API 端点（使用 Hono testing utilities）
3. E2E 测试：用户流程（Playwright，低优先级）

---

## 下一步

完成开发后，运行 `/speckit.tasks` 生成详细的任务清单，用于任务跟踪和进度管理。

```bash
/speckit.tasks
```

---

## 参考资源

- [Hono RPC 文档](https://hono.dev/guides/rpc)
- [TanStack Query 文档](https://tanstack.com/query/latest)
- [Drizzle ORM 文档](https://orm.drizzle.team)
- [nanoid 文档](https://github.com/ai/nanoid)
- [项目宪章](../../.specify/memory/constitution.md)

---

**估计工作量**: 3-5 天（一名全栈开发者）

**关键里程碑**:
- Day 1: 完成数据层和 API 层
- Day 2: 完成前端数据层
- Day 3: 完成 UI 组件
- Day 4: 测试和修复
- Day 5: 优化和文档

祝开发顺利！🚀
