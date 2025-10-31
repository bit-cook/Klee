# 实施计划：知识库客户端优化

**分支**: `001-kb-tanstack-refactor` | **日期**: 2025-10-18 | **规格**: [spec.md](./spec.md)
**输入**: 功能规格来自 `/specs/001-kb-tanstack-refactor/spec.md`

**说明**: 此模板由 `/speckit.plan` 命令填充。参见 `.specify/templates/commands/plan.md` 了解执行工作流。

## 摘要

将知识库模块的客户端数据管理层从直接 Hono RPC 调用重构为基于 TanStack Query 的现代化数据层。主要目标包括：

1. **自动缓存管理**：实现智能缓存策略，减少不必要的网络请求，提升用户体验
2. **乐观更新**：为收藏/取消收藏等快速操作提供即时视觉反馈
3. **后台数据同步**：实现 stale-while-revalidate 模式和窗口焦点自动刷新
4. **类型安全保持**：继续使用 Hono RPC 类型推断，确保端到端类型安全

技术方法：使用 TanStack Query v4 作为数据层，保留现有的 Hono RPC 客户端调用，通过自定义钩子封装查询和变更逻辑，实现缓存、乐观更新和自动失效策略。

## 技术上下文

**语言/版本**: TypeScript 5.4.2 (前端) / TypeScript 5.8.3 (后端)
**主要依赖**:
- 前端：React 18.3.1, TanStack Query 4.29.14, TanStack Router 1.132.41, Hono 4.9.12 (RPC 客户端), Vite 5.4.11
- 后端：Hono 4.9.5, Drizzle ORM 0.44.6, Supabase 客户端 2.47.10
- UI 组件：Shadcn/ui (基于 Radix UI)
**存储**: Supabase (PostgreSQL + pgvector + Storage)
**测试**: 当前无自动化测试框架（NEEDS CLARIFICATION：是否需要为新钩子添加测试）
**目标平台**: Electron 33.4.11 (跨平台桌面应用)
**项目类型**: Monorepo - 前后端分离 Web 应用 + Electron 桌面包装
**性能目标**:
- 缓存数据显示 <50ms
- 乐观更新响应 <16ms (1帧@60fps)
- 后台刷新不阻塞 UI
- 支持 100+ 并发文件上传
**约束**:
- 零回归 - 所有现有 UI 功能必须保持一致
- 保持 Hono RPC 类型安全
- 不修改后端 API
- 保持现有组件接口兼容
**规模/范围**:
- 3 个主要页面需要迁移（列表、详情、侧边栏）
- 7 个 RPC API 端点
- 约 500 行现有代码需重构

## 宪章检查

*门控：必须在阶段 0 研究前通过。在阶段 1 设计后重新检查。*

### I. 类型优先开发 ✅

**状态**: 符合
**验证**: 继续使用 Hono RPC 端到端类型推断，TanStack Query 的 `useQuery` 和 `useMutation` 将自动推断返回类型。所有查询键和数据类型从现有 RPC 客户端派生，无需手动定义类型。

### II. 模式驱动架构 ✅

**状态**: 符合（本功能不涉及）
**说明**: 此重构仅涉及客户端数据层，不修改数据库模式或验证逻辑。继续使用现有的 Drizzle ORM 模式和 drizzle-zod 验证器。

### III. 模块化工具函数 ✅

**状态**: 符合
**验证**: 新的 TanStack Query 钩子将设计为可组合和可重用。查询键工厂、缓存失效函数等将作为独立模块，可被其他功能（如聊天、笔记）复用。

### IV. 中间件组合 ✅

**状态**: 符合（本功能不涉及）
**说明**: 此重构不涉及后端中间件。前端将使用 TanStack Query 的全局配置（如默认缓存时间、重试策略）实现横切关注点。

### V. 多租户隔离 ✅

**状态**: 符合（本功能不涉及）
**说明**: 数据隔离由后端 API 保证，客户端通过认证 token 访问。此重构不改变现有的多租户架构。

### VI. 数据完整性与级联 ✅

**状态**: 符合（本功能不涉及）
**说明**: 数据完整性由后端数据库和 API 保证。客户端缓存失效策略将确保 UI 数据一致性。

### VII. 防御性配置 ✅

**状态**: 符合
**验证**: TanStack Query 配置将使用显式值（staleTime、cacheTime、retry 次数等）。查询键命名约定将文档化，避免魔术字符串。

### VIII. 中英文分离原则 ✅

**状态**: 符合
**验证**: 代码注释、变量名、文档使用中文。UI 文本（错误消息、加载提示）使用英文。

**门控结果**: ✅ 通过 - 无违规项

## 项目结构

### 文档（本功能）

```
specs/001-kb-tanstack-refactor/
├── plan.md              # 本文件 (/speckit.plan 命令输出)
├── research.md          # 阶段 0 输出 (/speckit.plan 命令)
├── data-model.md        # 阶段 1 输出 (/speckit.plan 命令)
├── quickstart.md        # 阶段 1 输出 (/speckit.plan 命令)
├── contracts/           # 阶段 1 输出 (/speckit.plan 命令)
├── checklists/          # 质量检查清单
│   └── requirements.md  # 规格质量检查（已完成）
└── tasks.md             # 阶段 2 输出 (/speckit.tasks 命令 - 不由 /speckit.plan 创建)
```

### 源代码（仓库根目录）

```
client/                          # 前端 Electron + React 应用
├── src/
│   ├── hooks/                   # 🎯 主要修改区域
│   │   ├── useKnowledgeBaseRPC.ts      # 将被废弃
│   │   ├── queries/                     # 新增：TanStack Query 钩子
│   │   │   ├── useKnowledgeBases.ts    # 列表查询
│   │   │   ├── useKnowledgeBase.ts     # 详情查询
│   │   │   └── useKnowledgeBaseFiles.ts # 文件查询
│   │   └── mutations/                   # 新增：TanStack Mutation 钩子
│   │       ├── useCreateKnowledgeBase.ts
│   │       ├── useUpdateKnowledgeBase.ts
│   │       ├── useDeleteKnowledgeBase.ts
│   │       ├── useUploadKnowledgeBaseFile.ts
│   │       └── useDeleteKnowledgeBaseFile.ts
│   ├── lib/
│   │   ├── hono-client.ts       # Hono RPC 客户端（保持不变）
│   │   ├── query-client.ts      # 新增：TanStack Query 客户端配置
│   │   └── queryKeys.ts         # 新增：查询键工厂函数
│   ├── routes/
│   │   └── _authenticated/
│   │       └── (knowledge-base)/
│   │           ├── knowledge-base.index.tsx    # 🎯 修改：使用新钩子
│   │           └── knowledge-base.$knowledgeBaseId.tsx  # 🎯 修改：使用新钩子
│   └── components/
│       └── layout/
│           └── sidebar-left/
│               └── knowledge-base-list.tsx  # 🎯 修改：使用新钩子
└── package.json

server/                          # 后端 Hono API（本次不修改）
├── src/
│   ├── routes/
│   │   └── knowledgebase.ts     # 知识库 API 路由（保持不变）
│   ├── lib/
│   │   ├── fileProcessor.ts     # 文件处理（保持不变）
│   │   ├── storage.ts           # Supabase Storage（保持不变）
│   │   └── ai/
│   │       └── embedding.ts     # 向量化（保持不变）
│   ├── db/
│   │   ├── schema.ts            # 数据库模式（保持不变）
│   │   └── queries/
│   │       └── knowledgebase.ts # 数据库查询（保持不变）
│   └── index.ts                 # 导出 AppType（保持不变）
└── package.json
```

**结构决策**:
- **Monorepo 结构**：前端 (`client/`) 和后端 (`server/`) 分离
- **修改范围**：仅限前端，后端零修改
- **新增文件**：约 10 个新文件（查询/变更钩子 + 配置）
- **修改文件**：3 个 UI 组件，1 个废弃钩子
- **保留兼容**：现有 Hono RPC 客户端保持不变，作为底层 API 调用层

## 复杂性追踪

*仅在宪章检查有必须证明合理性的违规时填写*

**状态**: 无违规项，无需追踪

