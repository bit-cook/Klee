# Quick Start: 知识库与 Agent 市场分享流程重构

**Feature**: 005-marketplace-sharing-refactor
**Date**: 2025-10-20
**Target Audience**: Developers implementing this feature

## Overview

本文档提供市场分享功能重构的快速启动指南，帮助开发者快速理解实施步骤、关键代码示例和最佳实践。

**重构目标**:
1. 优化用户体验：一键分享、一键安装
2. 增强数据完整性：级联清理、防重复安装
3. 提升性能：缓存优化、查询优化

## Prerequisites

### 开发环境

- Node.js 18+ (前端和后端)
- PostgreSQL 14+ (数据库)
- npm 或 yarn (包管理器)

### 技术栈熟悉度

**必需**:
- TypeScript 类型系统
- Hono RPC API 开发
- TanStack Query 缓存管理
- Drizzle ORM 数据库操作

**推荐**:
- PostgreSQL 事务和级联删除
- TanStack Router loader 预加载
- shadcn/ui 组件库

### 文档准备

阅读以下文档（按顺序）:
1. [spec.md](./spec.md) - 功能需求和验收标准
2. [research.md](./research.md) - 技术研究和现状分析
3. [data-model.md](./data-model.md) - 数据模型和状态转换
4. [contracts/api-endpoints.md](./contracts/api-endpoints.md) - API 端点契约

## Implementation Phases

### Phase 1: 数据库验证与优化（预估 2 小时）

**目标**: 验证现有 schema 完整性，补充缺失的索引

#### 步骤 1.1: 检查现有 schema

```bash
# 读取数据库 schema
cat server/db/schema.ts | grep -A 20 "knowledgeBases\|chatConfigs"
```

**验证清单**:
- ✅ knowledgeBases 表有 isPublic, shareSlug 字段
- ✅ chatConfigs 表有 isPublic, shareSlug, sourceShareSlug 字段
- ✅ shareSlug 字段有 UNIQUE 约束
- ✅ 外键关系有 CASCADE DELETE 约束

#### 步骤 1.2: 添加性能索引（可选）

如果以下索引不存在，创建迁移脚本：

```sql
-- server/db/migrations/0005_add_performance_indexes.sql

-- 优化安装状态检测查询
CREATE INDEX IF NOT EXISTS idx_chatConfigs_sourceShareSlug
ON chat_configs(source_share_slug)
WHERE source_share_slug IS NOT NULL;

-- 优化 chatSessions 知识库查询（如使用 JSONB 查询）
CREATE INDEX IF NOT EXISTS idx_chatSessions_availableKnowledgeBaseIds
ON chat_sessions USING GIN(available_knowledge_base_ids);
```

**运行迁移**:
```bash
cd server
npx drizzle-kit generate
npx drizzle-kit push
```

---

### Phase 2: 后端 API 重构（预估 8 小时）

**目标**: 优化分享/删除逻辑，增强错误处理

#### 步骤 2.1: 优化 ShareSlug 生成

**文件**: `server/src/lib/slug-generator.ts`

**修改前**（当前代码）:
```typescript
export function generateShareSlug(): string {
  return nanoid(10); // 无冲突检测
}
```

**修改后**（推荐）:
```typescript
import { nanoid } from 'nanoid';
import { db } from '../db';
import { knowledgeBases, chatConfigs } from '../db/schema';
import { eq } from 'drizzle-orm';

export function generateShareSlug(): string {
  return nanoid(10);
}

export async function generateUniqueShareSlug(
  table: 'knowledgeBases' | 'chatConfigs',
  maxRetries = 3
): Promise<string> {
  const dbTable = table === 'knowledgeBases' ? knowledgeBases : chatConfigs;

  for (let i = 0; i < maxRetries; i++) {
    const slug = generateShareSlug();

    const existing = await db
      .select({ id: dbTable.id })
      .from(dbTable)
      .where(eq(dbTable.shareSlug, slug))
      .limit(1);

    if (existing.length === 0) return slug;
  }

  throw new Error('Failed to generate unique slug after retries');
}
```

#### 步骤 2.2: 重构知识库分享端点

**文件**: `server/src/routes/knowledgebase.ts`

**关键改动**:
1. 使用 `generateUniqueShareSlug()` 代替 `generateShareSlug()`
2. 添加 409 Conflict 错误处理
3. 优化缓存失效逻辑

```typescript
import { generateUniqueShareSlug } from '../lib/slug-generator';
import { shareKnowledgeBase } from '../db/queries/knowledgebase';

// PUT /api/knowledgebase/:id/share
app.put(
  '/:id/share',
  zValidator('json', z.object({ isPublic: z.boolean() })),
  async (c) => {
    const userId = c.get('userId'); // 认证中间件注入
    const { id } = c.req.param();
    const { isPublic } = c.req.valid('json');

    try {
      // 调用数据库查询函数（需修改）
      const knowledgeBase = await shareKnowledgeBase(
        id,
        userId,
        isPublic,
        async () => await generateUniqueShareSlug('knowledgeBases') // 传入生成器
      );

      return c.json({ knowledgeBase });
    } catch (error) {
      if (error.message === 'Failed to generate unique slug after retries') {
        return c.json(
          { error: 'ConflictError', message: 'Failed to generate unique share slug. Please try again' },
          409
        );
      }

      // 其他错误处理...
      throw error;
    }
  }
);
```

#### 步骤 2.3: 重构知识库删除端点（级联清理）

**文件**: `server/db/queries/knowledgebase.ts`

**关键改动**:
1. 添加事务保证原子性
2. 清理 chatSessions.availableKnowledgeBaseIds
3. 异步清理 Supabase Storage 文件

```typescript
import { db } from '../index';
import { knowledgeBases, knowledgeBaseFiles, chatSessions } from '../schema';
import { eq, sql } from 'drizzle-orm';
import { deleteFiles } from '../../lib/storage'; // Supabase Storage 清理

export async function deleteKnowledgeBase(
  id: string,
  userId: string
): Promise<{ id: string; name: string; filesDeleted: number; agentAssociationsRemoved: number }> {
  // 使用事务保证原子性
  return await db.transaction(async (tx) => {
    // 1. 获取知识库并验证所有权
    const [kb] = await tx
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.id, id))
      .limit(1);

    if (!kb) throw new Error('Knowledge base not found');
    if (kb.userId !== userId) throw new Error('Forbidden');

    // 2. 获取所有文件（用于存储清理）
    const files = await tx
      .select({ storagePath: knowledgeBaseFiles.storagePath })
      .from(knowledgeBaseFiles)
      .where(eq(knowledgeBaseFiles.knowledgeBaseId, id));

    // 3. 清理 chatSessions JSONB 数组引用
    await tx.execute(sql`
      UPDATE chat_sessions
      SET available_knowledge_base_ids = (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(available_knowledge_base_ids) AS elem
        WHERE elem::text != ${JSON.stringify(id)}
      )
      WHERE available_knowledge_base_ids @> ${JSON.stringify([id])}::jsonb
    `);

    // 4. 删除知识库（自动级联删除 files, embeddings, chatConfigKnowledgeBases）
    await tx.delete(knowledgeBases).where(eq(knowledgeBases.id, id));

    // 事务提交后异步清理外部存储（失败不影响事务）
    const filesDeleted = files.length;
    deleteFiles(files.map(f => f.storagePath)).catch(err => {
      console.error('Failed to delete storage files:', err);
    });

    return {
      id: kb.id,
      name: kb.name,
      filesDeleted,
      agentAssociationsRemoved: 0, // TODO: 统计（可选）
    };
  });
}
```

#### 步骤 2.4: 优化 Agent 安装端点

**文件**: `server/db/queries/chatConfig.ts`

**关键改动**:
1. 严格验证安装条件（非创建者、未重复安装）
2. 复制知识库关联（仅用户可访问的）
3. 设置 sourceShareSlug 追溯来源

```typescript
import { db } from '../index';
import { chatConfigs, chatConfigKnowledgeBases, knowledgeBases } from '../schema';
import { eq, and, or } from 'drizzle-orm';

export async function installAgent(
  shareSlug: string,
  userId: string
): Promise<{ chatConfig: any; knowledgeBases: any[] }> {
  return await db.transaction(async (tx) => {
    // 1. 查询原始 Agent
    const [sourceAgent] = await tx
      .select()
      .from(chatConfigs)
      .where(and(eq(chatConfigs.shareSlug, shareSlug), eq(chatConfigs.isPublic, true)))
      .limit(1);

    if (!sourceAgent) throw new Error('Agent not found or not shared');

    // 2. 验证非创建者
    if (sourceAgent.userId === userId) {
      throw new Error('You cannot install your own agent');
    }

    // 3. 检查是否已安装
    const [existing] = await tx
      .select({ id: chatConfigs.id })
      .from(chatConfigs)
      .where(
        and(
          eq(chatConfigs.userId, userId),
          eq(chatConfigs.sourceShareSlug, shareSlug)
        )
      )
      .limit(1);

    if (existing) throw new Error('You have already installed this agent');

    // 4. 创建 Agent 副本
    const [newAgent] = await tx
      .insert(chatConfigs)
      .values({
        userId,
        name: sourceAgent.name,
        defaultModel: sourceAgent.defaultModel,
        systemPrompt: sourceAgent.systemPrompt,
        avatar: sourceAgent.avatar,
        webSearchEnabled: sourceAgent.webSearchEnabled,
        isPublic: false, // 默认私有
        shareSlug: null, // 不继承
        sourceShareSlug: shareSlug, // 追溯来源
      })
      .returning();

    // 5. 复制知识库关联（仅用户可访问的）
    const sourceKBs = await tx
      .select({ knowledgeBaseId: chatConfigKnowledgeBases.knowledgeBaseId })
      .from(chatConfigKnowledgeBases)
      .where(eq(chatConfigKnowledgeBases.chatConfigId, sourceAgent.id));

    const accessibleKBs = await tx
      .select({ id: knowledgeBases.id, name: knowledgeBases.name, isPublic: knowledgeBases.isPublic })
      .from(knowledgeBases)
      .where(
        and(
          or(
            eq(knowledgeBases.userId, userId), // 用户自己的
            eq(knowledgeBases.isPublic, true) // 公开的
          ),
          // @ts-ignore
          sql`${knowledgeBases.id} = ANY(${sourceKBs.map(kb => kb.knowledgeBaseId)})`
        )
      );

    if (accessibleKBs.length > 0) {
      await tx.insert(chatConfigKnowledgeBases).values(
        accessibleKBs.map(kb => ({
          chatConfigId: newAgent.id,
          knowledgeBaseId: kb.id,
        }))
      );
    }

    return { chatConfig: newAgent, knowledgeBases: accessibleKBs };
  });
}
```

---

### Phase 3: 前端 UI 重构（预估 10 小时）

**目标**: 集成分享按钮到详情页，优化安装状态检测

#### 步骤 3.1: 重构知识库详情页（添加分享按钮）

**文件**: `client/src/routes/_authenticated/(knowledge-base)/knowledge-base.$knowledgeBaseId.tsx`

**关键改动**:
1. 添加分享/取消分享按钮
2. 使用 `useShareKnowledgeBase` mutation
3. 显示分享状态（已分享/未分享）

```typescript
import { useShareKnowledgeBase } from '@/hooks/marketplace/mutations/useShareKnowledgeBase';
import { Button } from '@/components/ui/button';
import { Share2, X } from 'lucide-react';

export function KnowledgeBaseDetail() {
  const { knowledgeBaseId } = Route.useParams();
  const { data: knowledgeBase } = useKnowledgeBase(knowledgeBaseId);
  const shareM Mutation = useShareKnowledgeBase();

  const handleShare = () => {
    shareMutation.mutate(
      { id: knowledgeBaseId, isPublic: !knowledgeBase?.isPublic },
      {
        onSuccess: () => {
          toast.success(
            knowledgeBase?.isPublic
              ? 'Knowledge base unshared successfully'
              : 'Knowledge base shared to marketplace'
          );
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  return (
    <div>
      {/* 详情内容 */}

      {/* 分享按钮 */}
      <div className="flex gap-2">
        <Button
          onClick={handleShare}
          disabled={shareMutation.isPending}
          variant={knowledgeBase?.isPublic ? 'outline' : 'default'}
        >
          {knowledgeBase?.isPublic ? (
            <>
              <X className="h-4 w-4 mr-2" />
              Unshare
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4 mr-2" />
              Share to Marketplace
            </>
          )}
        </Button>

        {knowledgeBase?.isPublic && (
          <div className="text-sm text-muted-foreground">
            Shared as: {knowledgeBase.shareSlug}
          </div>
        )}
      </div>
    </div>
  );
}
```

#### 步骤 3.2: 优化 Agent 详情页（集成安装按钮）

**文件**: `client/src/routes/_authenticated/marketplace.agent.$agentId.tsx`

**关键改动**:
1. 检测安装状态（isOwner, isInstalled）
2. 显示对应按钮（安装/已安装/你的 Agent）
3. 处理安装错误（重复安装、自我安装）

```typescript
import { useCheckAgentInstalled } from '@/hooks/marketplace/queries/useCheckAgentInstalled';
import { useInstallAgent } from '@/hooks/marketplace/mutations/useInstallAgent';
import { Button } from '@/components/ui/button';
import { Download, Check } from 'lucide-react';

export function MarketplaceAgentDetail() {
  const { agentId } = Route.useParams(); // shareSlug
  const { data: agent } = useMarketplaceAgent(agentId);
  const { data: installStatus } = useCheckAgentInstalled(agentId);
  const installMutation = useInstallAgent();

  const handleInstall = () => {
    installMutation.mutate(
      { shareSlug: agentId },
      {
        onSuccess: () => {
          toast.success('Agent installed successfully');
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  // 渲染安装按钮
  const renderInstallButton = () => {
    if (installStatus?.isOwner) {
      return (
        <div className="text-sm text-muted-foreground">
          This is your agent
        </div>
      );
    }

    if (installStatus?.isInstalled) {
      return (
        <Button disabled variant="outline">
          <Check className="h-4 w-4 mr-2" />
          Installed
        </Button>
      );
    }

    return (
      <Button onClick={handleInstall} disabled={installMutation.isPending}>
        <Download className="h-4 w-4 mr-2" />
        Install
      </Button>
    );
  };

  return (
    <div>
      {/* Agent 详情内容 */}

      {/* 安装按钮 */}
      <div className="flex gap-2">
        {renderInstallButton()}
      </div>
    </div>
  );
}
```

#### 步骤 3.3: 创建取消分享钩子

**文件**: `client/src/hooks/knowledge-base/mutations/useUnshareKnowledgeBase.ts`（新建）

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { honoClient } from '@/lib/hono-client';
import { knowledgeBaseKeys, marketplaceKeys } from '@/lib/queryKeys';

export function useUnshareKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await honoClient.api.knowledgebase[':id'].share.$put({
        param: { id },
        json: { isPublic: false },
      });

      if (!res.ok) throw new Error('Failed to unshare knowledge base');
      return res.json();
    },
    onSuccess: (data, variables) => {
      // 失效相关缓存
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(variables) });
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.lists() });
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.knowledgeBases() });
    },
  });
}
```

---

### Phase 4: 缓存策略优化（预估 3 小时）

**目标**: 优化 TanStack Query 缓存失效策略

#### 步骤 4.1: 验证缓存键层级

**文件**: `client/src/lib/queryKeys.ts`

**验证清单**:
- ✅ knowledgeBaseKeys 层级完整（all → lists/details → detail）
- ✅ chatConfigKeys 层级完整
- ✅ marketplaceKeys 层级完整

**示例层级**:
```typescript
export const knowledgeBaseKeys = {
  all: ['knowledgeBases'] as const,
  lists: () => [...knowledgeBaseKeys.all, 'list'] as const,
  details: () => [...knowledgeBaseKeys.all, 'detail'] as const,
  detail: (id: string) => [...knowledgeBaseKeys.details(), id] as const,
};

export const marketplaceKeys = {
  all: ['marketplace'] as const,
  knowledgeBases: () => [...marketplaceKeys.all, 'knowledgeBases'] as const,
  knowledgeBasesList: (filters: any) => [...marketplaceKeys.knowledgeBases(), 'list', filters] as const,
  knowledgeBaseDetail: (slug: string) => [...marketplaceKeys.knowledgeBases(), 'detail', slug] as const,
};
```

#### 步骤 4.2: 优化缓存失效策略

**原则**:
- 分享/取消分享: 失效 `*.all`（广泛失效，安全）
- 安装: 失效 `chatConfigKeys.lists()`（精确失效）
- 删除: 失效 `*.detail()` + `*.lists()`（精确 + 列表）

**示例**（分享知识库）:
```typescript
export function useShareKnowledgeBase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isPublic }) => {
      const res = await honoClient.api.knowledgebase[':id'].share.$put({
        param: { id },
        json: { isPublic },
      });
      if (!res.ok) throw new Error('Failed to share');
      return res.json();
    },
    onSuccess: () => {
      // 广泛失效，确保所有相关缓存更新
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all });
      queryClient.invalidateQueries({ queryKey: marketplaceKeys.knowledgeBases() });
    },
  });
}
```

---

### Phase 5: 测试与验证（预估 5 小时）

**目标**: 验证所有功能需求和性能目标

#### 测试清单

**功能测试**:
- [ ] 知识库分享（isPublic=true，生成 shareSlug）
- [ ] 知识库取消分享（isPublic=false，保留 shareSlug）
- [ ] 知识库删除（级联清理 files、embeddings、chatConfigKnowledgeBases、chatSessions）
- [ ] Agent 分享（isPublic=true，生成 shareSlug）
- [ ] Agent 取消分享（isPublic=false，保留 shareSlug）
- [ ] Agent 安装（创建副本，设置 sourceShareSlug）
- [ ] Agent 删除（不影响已安装副本）
- [ ] 阻止自我安装（isOwner=true）
- [ ] 阻止重复安装（sourceShareSlug 检测）
- [ ] 市场浏览（列表、搜索、分页）

**性能测试**:
- [ ] 市场列表加载 <1秒（SC-003）
- [ ] 分享操作 <3秒（SC-001, SC-002）
- [ ] Agent 安装 <3秒（SC-005）
- [ ] 知识库删除 <5秒（SC-006）
- [ ] 支持 1000+ 市场项目（SC-011）

**类型检查**:
```bash
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
```

---

## Common Pitfalls & Solutions

### 问题 1: ShareSlug 冲突

**症状**: 偶尔出现 409 Conflict 错误

**原因**: 未使用 `generateUniqueShareSlug()`，直接调用 `generateShareSlug()`

**解决方案**:
```typescript
// ❌ 错误
const shareSlug = generateShareSlug();

// ✅ 正确
const shareSlug = await generateUniqueShareSlug('knowledgeBases');
```

### 问题 2: 知识库删除失败

**症状**: 删除知识库时事务超时或失败

**原因**: chatSessions JSONB 更新耗时过长，未使用索引

**解决方案**:
1. 添加 GIN 索引到 availableKnowledgeBaseIds
2. 优化 SQL 查询（仅更新包含该 KB 的 sessions）

```sql
-- 优化前（扫描所有 sessions）
UPDATE chat_sessions SET ...;

-- 优化后（仅更新包含该 KB 的 sessions）
UPDATE chat_sessions
SET ...
WHERE available_knowledge_base_ids @> '["{uuid}"]'::jsonb;
```

### 问题 3: 缓存不一致

**症状**: 分享后市场列表未更新

**原因**: 缓存失效键不正确或失效范围过窄

**解决方案**:
```typescript
// ❌ 错误（仅失效详情）
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.detail(id) });

// ✅ 正确（失效所有相关缓存）
queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all });
queryClient.invalidateQueries({ queryKey: marketplaceKeys.knowledgeBases() });
```

### 问题 4: 安装状态检测延迟

**症状**: 安装 Agent 后按钮仍显示"Install"

**原因**: 安装状态查询缓存未失效

**解决方案**:
```typescript
export function useInstallAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ shareSlug }) => { /* ... */ },
    onSuccess: (data, variables) => {
      // 失效 Agent 列表
      queryClient.invalidateQueries({ queryKey: chatConfigKeys.lists() });

      // 失效安装状态查询
      queryClient.invalidateQueries({
        queryKey: ['checkAgentInstalled', variables.shareSlug],
      });
    },
  });
}
```

---

## Development Workflow

### 日常开发流程

1. **启动开发服务器**:
   ```bash
   # Terminal 1: 后端
   cd server && npm run dev

   # Terminal 2: 前端
   cd client && npm run dev
   ```

2. **代码修改**:
   - 后端: 修改 `server/src/routes/*.ts` 或 `server/db/queries/*.ts`
   - 前端: 修改 `client/src/routes/**/*.tsx` 或 `client/src/hooks/**/*.ts`

3. **类型检查**:
   ```bash
   # 检查所有类型错误
   npm run build

   # 或分别检查
   cd client && npx tsc --noEmit
   cd server && npx tsc --noEmit
   ```

4. **测试功能**:
   - 打开浏览器 `http://localhost:5173`
   - 测试分享、安装、删除流程
   - 检查网络请求和响应

5. **提交代码**:
   ```bash
   git add .
   git commit -m "refactor: optimize marketplace sharing flow"
   git push origin 005-marketplace-sharing-refactor
   ```

### 调试技巧

**后端调试**:
```typescript
// 添加日志
console.log('Sharing knowledge base:', { id, userId, isPublic });

// 检查数据库查询
const result = await db.select().from(knowledgeBases)...;
console.log('Query result:', result);
```

**前端调试**:
- 使用 TanStack Query DevTools（浮动图标）
- 检查缓存状态和查询键
- 手动触发缓存失效测试

**数据库调试**:
```sql
-- 检查 shareSlug 唯一性
SELECT share_slug, COUNT(*) FROM knowledge_bases
GROUP BY share_slug HAVING COUNT(*) > 1;

-- 检查级联删除
SELECT * FROM chat_config_knowledge_bases
WHERE knowledge_base_id = '{deleted-kb-id}'; -- 应返回 0 行
```

---

## Performance Optimization Tips

### 数据库查询优化

1. **使用索引**:
   - shareSlug: UNIQUE BTREE（已有）
   - sourceShareSlug: BTREE（推荐添加）
   - availableKnowledgeBaseIds: GIN（推荐添加）

2. **使用 EXISTS 代替 COUNT**:
   ```typescript
   // ❌ 慢
   const count = await db.select({ count: sql`COUNT(*)` })...;
   if (count > 0) { /* ... */ }

   // ✅ 快
   const [exists] = await db.select({ exists: sql`1` }).from(...)...;
   if (exists) { /* ... */ }
   ```

3. **批量操作**:
   ```typescript
   // ❌ N+1 查询
   for (const file of files) {
     await supabase.storage.delete(file.path);
   }

   // ✅ 批量删除
   await Promise.allSettled(files.map(f => supabase.storage.delete(f.path)));
   ```

### 前端缓存优化

1. **合理设置 staleTime**:
   - 市场列表: 2 分钟（数据变化不频繁）
   - 详情页: 5 分钟
   - 用户资源列表: 1 分钟（数据变化较频繁）

2. **使用乐观更新**:
   ```typescript
   useMutation({
     onMutate: async (variables) => {
       // 立即更新 UI
       queryClient.setQueryData(queryKey, newData);
     },
     onError: (error, variables, context) => {
       // 失败时回滚
       queryClient.setQueryData(queryKey, context.previousData);
     },
   });
   ```

3. **预加载详情页**:
   ```typescript
   // TanStack Router loader
   export const Route = createFileRoute('/_authenticated/marketplace.agent.$agentId')({
     loader: async ({ params }) => {
       const res = await honoClient.api.marketplace.agents[':shareSlug'].$get({
         param: { shareSlug: params.agentId },
       });
       return await res.json();
     },
   });
   ```

---

## Next Steps

完成重构后：

1. **运行完整测试**（Phase 5 测试清单）
2. **更新 CLAUDE.md**（添加新技术和模式）
3. **创建 Pull Request**（使用 `/speckit.tasks` 生成任务清单）
4. **性能基准测试**（验证 SC-001 至 SC-012）
5. **用户验收测试**（邀请团队成员测试）

---

## Resources

- [Hono RPC 文档](https://hono.dev/guides/rpc)
- [TanStack Query 文档](https://tanstack.com/query/latest)
- [TanStack Router 文档](https://tanstack.com/router/latest)
- [Drizzle ORM 文档](https://orm.drizzle.team/)
- [PostgreSQL 级联删除](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)

---

**祝开发顺利！如有问题，请参考 [research.md](./research.md) 和 [data-model.md](./data-model.md)。**
