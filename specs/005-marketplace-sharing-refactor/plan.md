# Implementation Plan: 知识库与 Agent 市场分享流程重构

**Branch**: `005-marketplace-sharing-refactor` | **Date**: 2025-10-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-marketplace-sharing-refactor/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

重构知识库和 Agent 的市场分享流程，优化用户体验并增强数据完整性。核心改进包括：
1. **一键分享**: 在知识库/Agent 详情页直接分享到市场，无需额外页面
2. **一键安装**: Agent 可一键安装到用户账户，知识库通过引用机制使用
3. **重复安装防护**: 原作者无法安装自己的分享内容，用户无法重复安装
4. **取消分享与删除**: 支持取消分享和删除，自动处理级联关系和依赖清理
5. **级联清理**: 删除知识库时自动移除所有 Agent 关联，删除 Agent 时不影响已安装副本

技术方法：
- **数据库优化**: 验证现有 schema 是否支持所有需求，添加缺失的约束和索引
- **API 重构**: 优化分享、取消分享、安装、删除端点，增强错误处理
- **前端重构**: 将分享操作集成到详情页，改进安装状态检测和 UI 反馈
- **缓存策略**: 优化 TanStack Query 缓存失效策略，确保数据一致性
- **级联逻辑**: 实现知识库删除的级联清理（移除 Agent 关联、更新 chatSessions）

## Technical Context

**Language/Version**: TypeScript 5.4.2 (前端) / 5.8.3 (后端)
**Primary Dependencies**:
  - Hono v4.9.12 (RPC API，端到端类型安全)
  - TanStack Query v4.29.14 (客户端缓存和状态管理)
  - TanStack Router v1.132.41 (路由管理，loader 预加载)
  - React 18.3.1 (UI 框架)
  - Drizzle ORM v0.44.6+ (数据库 ORM)
  - drizzle-zod v0.8.3+ (模式验证器生成)
  - shadcn/ui (UI 组件库)
**Storage**: PostgreSQL (via Drizzle ORM, 云端部署) + Supabase Storage (文件存储)
**Testing**: TypeScript 类型检查 (npx tsc --noEmit), Zod 验证器
**Target Platform**: Web (Electron + React 前端, Node.js 后端)
**Project Type**: Web application (client/ + server/ monorepo)
**Performance Goals**:
  - 分享操作完成 <3秒 (SC-001, SC-002)
  - 市场列表加载 <1秒 (SC-003)
  - 搜索响应 <500毫秒（防抖后）(SC-004)
  - Agent 安装 <3秒 (SC-005)
  - 知识库删除（级联清理）<5秒 (SC-006)
  - 支持 1000+ 市场项目无性能降级 (SC-011)
**Constraints**:
  - 分页限制：每页 20 条记录
  - 缓存策略：市场列表 staleTime 2 分钟，详情页 5 分钟
  - 搜索防抖：300ms
  - 知识库删除批量操作：事务保证原子性
  - 分享标识符唯一性：数据库唯一约束 + 冲突重试
**Scale/Scope**:
  - 支持 ≥1000 个 Agent 和知识库的流畅浏览
  - 优化现有 4 个市场页面（marketplace 首页, agent/:slug, knowledge-base/:slug, agent/new）
  - 重构 2 个数据表的分享逻辑（chatConfigs, knowledgeBases）
  - 新增级联清理逻辑（知识库删除 → Agent 关联清理 → chatSessions 更新）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. 类型优先开发 ✅

**状态**: PASS
**验证**:
- Hono RPC 提供端到端类型安全（server/routes → client/hono-client.ts）
- 使用 InferRequestType 和 InferResponseType 自动推断 API 类型
- 数据库模式通过 drizzle-zod 自动生成 Zod 验证器
- 无手动类型定义，所有类型从 schema → API → client 自动流转
- 重构不引入新的手动类型定义

### II. 模式驱动架构 ✅

**状态**: PASS
**验证**:
- Drizzle schema 是唯一真实来源（server/db/schema.ts）
- 现有字段验证：chatConfigs 表已有 isPublic, shareSlug, sourceShareSlug；knowledgeBases 表已有 isPublic, shareSlug
- 迁移需求：验证数据库约束（唯一索引）是否完整，补充缺失的索引
- createInsertSchema() 和 drizzle-zod 自动生成 Zod 验证器
- 无重复类型定义或验证逻辑

### III. 模块化工具函数 ✅

**状态**: PASS
**验证**:
- 分享逻辑可复用（知识库和 Agent 使用相同的 shareSlug 生成、isPublic 设置模式）
- TanStack Query hooks 按功能模块组织（hooks/marketplace/、hooks/knowledge-base/、hooks/agent/）
- queryKeys 工厂函数可组合（knowledgeBaseKeys, chatConfigKeys, marketplaceKeys）
- 级联清理逻辑封装为可复用的数据库查询函数

### IV. 中间件组合 ✅

**状态**: PASS
**验证**:
- Hono 中间件处理认证（已有 userId 验证）
- @hono/zod-validator 处理输入验证
- 分享、取消分享、安装、删除 API 仅包含业务逻辑，认证/验证通过中间件组合
- 错误处理统一通过 Hono 的错误中间件

### V. 多租户隔离 ✅

**状态**: PASS
**验证**:
- chatConfigs 和 knowledgeBases 表包含 userId 列
- 所有查询按 userId 过滤（除了公开市场查询 isPublic = true）
- 分享操作验证 userId === 创建者
- 安装操作验证 userId !== 创建者（阻止自我安装）
- 删除操作验证 userId === 创建者
- 公开资源访问：通过 shareSlug 查询 + isPublic = true 验证

### VI. 数据完整性与级联 ✅

**状态**: PASS
**验证**:
- 知识库删除级联：移除 knowledgeBaseFiles、embeddings（数据库外键 CASCADE）
- 知识库删除级联：移除 chatConfigKnowledgeBases 关联（手动删除）
- 知识库删除级联：清理 chatSessions.availableKnowledgeBaseIds（JSONB 数组更新）
- Agent 删除级联：移除 chatConfigKnowledgeBases 关联（数据库外键 CASCADE）
- Agent 安装创建独立副本（sourceShareSlug 追溯来源），删除原始 Agent 不影响副本
- 取消分享保留 shareSlug（历史追踪），删除操作不可逆

### VII. 防御性配置 ✅

**状态**: PASS
**验证**:
- 分页大小显式配置：每页 20 条
- 缓存策略显式配置：列表 staleTime 2 分钟，详情 5 分钟
- 搜索防抖显式配置：300ms
- 性能目标显式文档化（SC-001 至 SC-012）
- 分享标识符生成策略显式：使用 nanoid（8-12 字符），冲突重试最大 3 次

### VIII. 中英文分离原则 ✅

**状态**: PASS
**验证**:
- 开发文档使用中文（spec.md、plan.md、代码注释、AI 对话）
- UI 文本使用英文（按钮文本、错误消息、Toast 提示）
- API 错误消息返回英文（供前端显示）
- 数据库字段名使用英文（isPublic、shareSlug、sourceShareSlug）

**行动项**: 实施时确保所有用户可见消息（toast 提示、错误消息、按钮文本）使用英文。

---

**总结**: 所有宪章原则 PASS，无需在 Complexity Tracking 表中记录违规。

## Project Structure

### Documentation (this feature)

```
specs/005-marketplace-sharing-refactor/
├── spec.md              # 功能规格说明（已完成）
├── plan.md              # 本文件 (/speckit.plan 输出)
├── research.md          # Phase 0 输出
├── data-model.md        # Phase 1 输出
├── quickstart.md        # Phase 1 输出
├── contracts/           # Phase 1 输出（API 契约）
└── tasks.md             # Phase 2 输出 (/speckit.tasks - 不由 /speckit.plan 创建)
```

### Source Code (repository root)

```
server/                              # 后端 Hono API
├── db/
│   ├── schema.ts                    # [验证] 检查现有字段和约束完整性
│   ├── migrations/                  # [可能新增] 补充缺失的索引迁移
│   │   └── 0005_refactor_marketplace.sql (如需要)
│   └── queries/
│       ├── marketplace.ts           # [审查] 优化查询性能和错误处理
│       ├── chatConfig.ts            # [重构] 优化分享/安装/删除逻辑
│       └── knowledgebase.ts         # [重构] 添加级联清理逻辑
└── src/
    ├── lib/
    │   └── slug-generator.ts        # [审查] 验证 shareSlug 生成和冲突处理
    └── routes/
        ├── marketplace.ts           # [审查] 优化市场 API 端点
        ├── chatConfig.ts            # [重构] 添加取消分享端点
        └── knowledgebase.ts         # [重构] 添加取消分享端点和级联清理

client/                              # 前端 React + Electron
├── src/
│   ├── routes/
│   │   └── _authenticated/
│   │       ├── marketplace.tsx      # [审查] 优化市场首页组件
│   │       ├── marketplace.agent.$agentId.tsx    # [重构] 集成分享/安装按钮
│   │       ├── marketplace.knowledge-base.$kbSlug.tsx  # [审查] 知识库详情
│   │       ├── knowledge-base.$knowledgeBaseId.tsx     # [重构] 添加分享按钮
│   │       └── agent/                               # [重构] Agent 详情和编辑页
│   ├── hooks/
│   │   ├── marketplace/
│   │   │   ├── queries/
│   │   │   │   ├── useMarketplaceAgents.ts     # [审查] 优化查询和缓存
│   │   │   │   ├── useMarketplaceKnowledgeBases.ts  # [审查] 优化查询
│   │   │   │   └── useCheckAgentInstalled.ts    # [审查] 安装状态检测
│   │   │   └── mutations/
│   │   │       ├── useShareAgent.ts            # [审查] 优化缓存失效
│   │   │       ├── useInstallAgent.ts          # [审查] 错误处理和重复检测
│   │   │       └── useShareKnowledgeBase.ts    # [审查] 优化缓存失效
│   │   ├── knowledge-base/
│   │   │   └── mutations/
│   │   │       ├── useDeleteKnowledgeBase.ts   # [重构] 添加级联清理确认
│   │   │       └── useUnsharKnowledgeBase.ts   # [新增] 取消分享钩子
│   │   └── chat-config/
│   │       └── mutations/
│   │           ├── useDeleteChatConfig.ts      # [审查] 验证副本独立性
│   │           └── useUnshareChatConfig.ts     # [新增] 取消分享钩子
│   ├── lib/
│   │   └── queryKeys.ts             # [审查] 验证缓存键层级完整性
│   └── components/
│       ├── marketplace/
│       │   ├── MarketplaceList.tsx  # [审查] 优化列表渲染
│       │   ├── AgentCard.tsx        # [审查] 卡片组件
│       │   └── KnowledgeBaseCard.tsx # [审查] 卡片组件
│       ├── knowledge-base/
│       │   └── KnowledgeBaseDetail.tsx  # [重构] 集成分享按钮
│       └── agent/
│           └── AgentDetail.tsx      # [重构] 集成分享按钮
```

**Structure Decision**:
采用 Web application (client/ + server/) monorepo 结构。此功能主要涉及：
1. **数据库层**: 验证现有 schema 完整性，补充缺失的索引和约束
2. **API 层**: 重构 chatConfig.ts 和 knowledgebase.ts 的分享/删除逻辑，优化 marketplace.ts 查询
3. **前端路由层**: 重构现有 4 个市场页面和 2 个详情页，集成分享按钮
4. **前端状态层**: 审查和优化 marketplace/ hooks，新增取消分享钩子
5. **UI 组件层**: 重构详情页组件，集成分享/取消分享/安装按钮

选择此结构的理由：
- 遵循现有 client/server 分离架构
- hooks 按功能模块组织（marketplace、knowledge-base、agent），符合宪章原则 III（模块化）
- 路由文件使用 TanStack Router 约定（$param 语法）
- 组件目录按功能分组，便于维护和测试
- 最小化文件改动，重构而非重写

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

无宪章违规，此表格为空。
