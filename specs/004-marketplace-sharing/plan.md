# Implementation Plan: 市场商店分享功能

**Branch**: `004-marketplace-sharing` | **Date**: 2025-10-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-marketplace-sharing/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

实现市场商店（Marketplace）功能，允许用户分享和安装 Agent（聊天配置）和知识库。核心需求包括：
1. **Agent 分享**: 用户可以将 ChatConfig 发布到市场，包含头像、名称、系统提示词、LLM 模型和关联知识库
2. **知识库分享**: 用户可以将知识库发布到市场，需填写名称和描述（knowledgeBase 表需新增字段）
3. **市场浏览**: 公开的 Agent 和知识库列表，支持搜索和分页
4. **安装功能**: 用户可以从市场安装 Agent 到自己的账户，知识库通过引用直接使用（云端存储）
5. **不可变性**: 已分享项目（isPublic = true）永久公开且不可修改/删除，未分享项目可正常编辑

技术方法：
- 数据库迁移：chatConfigs 表添加 avatar、isPublic、shareSlug 字段；knowledgeBases 表添加 name、description、isPublic、shareSlug 字段
- Hono RPC API：分享、安装、列表查询端点，类型安全的端到端通信
- TanStack Router：新增 /marketplace/agent/new 和 /marketplace/knowledge-base/:id/share 路由
- TanStack Query：市场列表缓存（2 分钟 staleTime）和自动失效策略
- UI 约束：仅已分享项目字段禁用，分享前显示警告

## Technical Context

**Language/Version**: TypeScript 5.4.2 (前端) / 5.8.3 (后端)
**Primary Dependencies**:
  - Hono v4.9.5 (RPC API)
  - TanStack Query v4.29.14 (客户端缓存)
  - TanStack Router v1.132.41 (路由)
  - React 18.3.1 (UI)
  - Drizzle ORM v0.44.6 (数据库)
  - drizzle-zod v0.8.3 (模式验证)
**Storage**: PostgreSQL (via Drizzle ORM, 云端部署)
**Testing**: TypeScript 类型检查 (npx tsc --noEmit), Zod 验证器
**Target Platform**: Web (Electron + React 前端, Node.js 后端)
**Project Type**: Web application (client/ + server/ monorepo)
**Performance Goals**:
  - 市场列表 API 响应 <500ms (FR-029)
  - Agent/知识库详情页加载 <300ms/500ms (FR-030/FR-031)
  - 分享操作完成 <500ms (SC-003/SC-004)
  - 支持 100 并发用户无性能降级 (SC-020)
**Constraints**:
  - 分页限制：每页 20 条记录
  - 缓存策略：市场列表 staleTime 2 分钟
  - 搜索防抖：300ms
  - UI 响应：标签页切换 <200ms
**Scale/Scope**:
  - 支持 ≥1000 个 Agent 和知识库的流畅浏览 (SC-012)
  - 4 个主要路由页面 (marketplace 首页, agent/new, agent/:slug, knowledge-base/:id/share)
  - 2 个数据表扩展 (chatConfigs, knowledgeBases)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. 类型优先开发 ✅

**状态**: PASS
**验证**:
- Hono RPC 提供端到端类型安全（server/routes → client/hono-client.ts）
- 数据库模式通过 drizzle-zod 自动生成 Zod 验证器
- TanStack Query 使用 InferResponseType 推断 API 返回类型
- 无手动类型定义，所有类型从 schema → API → client 自动流转

### II. 模式驱动架构 ✅

**状态**: PASS
**验证**:
- Drizzle schema 是唯一真实来源（server/db/schema.ts）
- 数据库迁移：添加 avatar、isPublic、shareSlug 字段到 chatConfigs；添加 name、description、isPublic、shareSlug 到 knowledgeBases
- createInsertSchema() 和 drizzle-zod 自动生成 Zod 验证器
- 无重复类型定义或验证逻辑

### III. 模块化工具函数 ✅

**状态**: PASS
**验证**:
- 分享逻辑可复用（Agent 和知识库使用相同的 shareSlug 生成、isPublic 设置模式）
- TanStack Query hooks 按功能模块组织（hooks/agent/mutations/、hooks/knowledge-base/mutations/）
- queryKeys 工厂函数可组合（agentKeys、knowledgeBaseKeys）

### IV. 中间件组合 ✅

**状态**: PASS
**验证**:
- Hono 中间件处理认证（已有 userId 验证）
- @hono/zod-validator 处理输入验证
- 分享、安装 API 仅包含业务逻辑，认证/验证通过中间件组合

### V. 多租户隔离 ✅

**状态**: PASS
**验证**:
- chatConfigs 和 knowledgeBases 表包含 userId 列
- 所有查询按 userId 过滤（除了公开市场查询 isPublic = true）
- 安装操作创建新记录时设置当前用户 userId
- 公开分享的资源访问：通过 shareSlug 查询，但仍验证 isPublic = true

### VI. 数据完整性与级联 ✅

**状态**: PASS
**验证**:
- 已分享项目（isPublic = true）禁止删除，避免破坏市场引用
- Agent 安装创建独立副本，不依赖原始记录
- 知识库通过引用关联（availableKnowledgeBaseIds），云端存储无需级联复制
- 数据库约束：shareSlug 唯一性索引防止冲突

### VII. 防御性配置 ✅

**状态**: PASS
**验证**:
- 分页大小显式配置：每页 20 条（FR-029/FR-030）
- 缓存策略显式配置：staleTime 2 分钟（FR-039）
- 搜索防抖显式配置：300ms（FR-042）
- 性能目标显式文档化（SC-017 至 SC-020）

### VIII. 中英文分离原则 ✅

**状态**: PASS
**验证**:
- 开发文档使用中文（spec.md、plan.md、代码注释）
- UI 文本使用英文（"Share to Marketplace"、"已分享的 Agent 无法修改"需改为英文错误消息）
- API 错误消息需使用英文返回给前端
- 数据库字段名使用英文（isPublic、shareSlug、avatar）

**行动项**: 实施时确保所有用户可见消息（toast 提示、错误消息、按钮文本）使用英文。

---

**总结**: 所有宪章原则 PASS，无需在 Complexity Tracking 表中记录违规。

## Project Structure

### Documentation (this feature)

```
specs/004-marketplace-sharing/
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
│   ├── schema.ts                    # [修改] 添加字段到 chatConfigs, knowledgeBases
│   ├── migrations/                  # [新增] 迁移脚本
│   │   └── 0004_marketplace_sharing.sql
│   └── queries/
│       ├── marketplace.ts           # [新增] 市场查询函数
│       └── chatConfigs.ts           # [修改] 添加分享/安装逻辑
└── src/
    └── routes/
        ├── marketplace.ts           # [新增] 市场 API 路由
        ├── chatConfig.ts            # [修改] 添加分享端点
        └── knowledgebase.ts         # [修改] 添加分享端点

client/                              # 前端 React + Electron
├── src/
│   ├── routes/
│   │   └── _authenticated/
│   │       ├── marketplace.tsx      # [新增] 市场首页
│   │       ├── marketplace.agent.$agentSlug.tsx    # [新增] Agent 详情页
│   │       ├── marketplace.agent.new.tsx           # [新增] Agent 创建页
│   │       └── marketplace.knowledge-base.$kbId.share.tsx  # [新增] 知识库分享页
│   ├── hooks/
│   │   ├── marketplace/
│   │   │   ├── queries/
│   │   │   │   ├── useMarketplaceAgents.ts     # [新增] 市场 Agent 列表
│   │   │   │   └── useMarketplaceKnowledgeBases.ts  # [新增] 市场知识库列表
│   │   │   └── mutations/
│   │   │       ├── useShareAgent.ts            # [新增] 分享 Agent
│   │   │       ├── useInstallAgent.ts          # [新增] 安装 Agent
│   │   │       └── useShareKnowledgeBase.ts    # [新增] 分享知识库
│   │   └── agent/
│   │       └── mutations/
│   │           └── useCreateAgent.ts           # [新增] 创建 Agent（从 Chat）
│   ├── lib/
│   │   └── queryKeys.ts             # [修改] 添加 marketplaceKeys、agentKeys
│   └── components/
│       └── marketplace/
│           ├── AgentCard.tsx        # [新增] Agent 卡片组件
│           ├── KnowledgeBaseCard.tsx # [新增] 知识库卡片组件
│           └── MarketplaceTabs.tsx  # [新增] 市场标签页组件
```

**Structure Decision**:
采用 Web application (client/ + server/) monorepo 结构。此功能主要涉及：
1. **数据库层**: 扩展现有表（server/db/schema.ts），添加迁移脚本
2. **API 层**: 新增 marketplace.ts 路由，修改 chatConfig.ts 和 knowledgebase.ts
3. **前端路由层**: 新增 4 个页面路由（marketplace, agent/new, agent/:slug, kb/:id/share）
4. **前端状态层**: 新增 marketplace/ hooks 目录，组织查询和变更钩子
5. **UI 组件层**: 新增 marketplace/ 组件目录，可复用卡片和标签页组件

选择此结构的理由：
- 遵循现有 client/server 分离架构
- hooks 按功能模块组织（marketplace、agent），符合宪章原则 III（模块化）
- 路由文件使用 TanStack Router 约定（$param 语法）
- 组件目录按功能分组，便于维护和测试

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

