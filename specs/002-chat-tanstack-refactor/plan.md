# 实施计划：聊天模块客户端优化

**分支**: `002-chat-tanstack-refactor` | **日期**: 2025-10-18 | **规格**: [spec.md](./spec.md)
**输入**: 功能规格来自 `/specs/002-chat-tanstack-refactor/spec.md`

**说明**: 此模板由 `/speckit.plan` 命令填充。参见 `.specify/templates/commands/plan.md` 了解执行工作流。

## 摘要

将聊天模块的客户端数据管理层从直接 Hono RPC 调用和 AI SDK `useChat` 钩子重构为基于 TanStack Query 的现代化数据层。主要目标包括:

1. **自动缓存管理**：实现智能缓存策略，减少不必要的网络请求，提升用户体验
2. **乐观更新**：为会话管理操作（重命名、固定、删除）提供即时视觉反馈
3. **流式消息管理**：优化 AI SDK 与 TanStack Query 的集成，确保流式响应的可靠性
4. **后台数据同步**：实现 stale-while-revalidate 模式和窗口焦点自动刷新
5. **知识库集成**：优化会话与知识库的关联管理，利用 AI SDK 工具调用能力
6. **类型安全保持**：继续使用 Hono RPC 类型推断，确保端到端类型安全

技术方法：使用 TanStack Query v4 作为会话和配置数据的管理层，保留现有的 Hono RPC 客户端调用和 AI SDK `useChat` 钩子，通过自定义钩子封装查询和变更逻辑，实现缓存、乐观更新和自动失效策略。对于实时消息流，继续使用 AI SDK 的原生能力，但将消息持久化和会话更新整合到 TanStack Query 的缓存失效机制中。

## 技术上下文

**语言/版本**: TypeScript 5.4.2 (前端) / TypeScript 5.8.3 (后端)
**主要依赖**:
- 前端：
  - React 18.3.1
  - TanStack Query 4.29.14 (已安装)
  - TanStack Router 1.132.41
  - Hono 4.9.12 (RPC 客户端)
  - AI SDK (@ai-sdk/react 2.0.68, ai 5.0.68)
  - Vite 5.4.11
- 后端：
  - Hono 4.9.5
  - Drizzle ORM 0.44.6
  - AI SDK (服务器端：ai 5.0.68, streamText, smoothStream)
  - Supabase 客户端 2.47.10
- UI 组件：Shadcn/ui (基于 Radix UI)

**存储**: Supabase (PostgreSQL + pgvector 用于知识库嵌入)

**测试**: 当前无自动化测试框架

**目标平台**: Electron 33.4.11 (跨平台桌面应用)

**项目类型**: Monorepo - 前后端分离 Web 应用 + Electron 桌面包装

**性能目标**:
- 缓存数据显示 <50ms
- 会话管理操作乐观更新响应 <16ms (1帧@60fps)
- 会话切换 <100ms
- AI 响应第一个 token <100ms (由后端流式响应决定)
- 后台刷新不阻塞 UI

**约束**:
- 零回归 - 所有现有 UI 功能必须保持一致
- 保持 Hono RPC 类型安全
- 保持 AI SDK 流式响应能力
- 不修改后端 API（除非发现明显缺陷）
- 保持现有组件接口兼容
- 保持 ChatContext 的现有用途（知识库选择状态）

**规模/范围**:
- 约 10 个 RPC API 端点（聊天 + 配置）
- 2 个主要 Hook 文件需重构（useChatRPC.ts + useChatLogic.ts）
- 4 个主要页面需更新（聊天列表、聊天详情、聊天配置）
- 约 800 行现有代码需重构

## 宪章检查

*门控：必须在阶段 0 研究前通过。在阶段 1 设计后重新检查。*

### I. 类型优先开发 ✅

**状态**: 符合
**验证**: 继续使用 Hono RPC 端到端类型推断。TanStack Query 的 `useQuery` 和 `useMutation` 将自动推断返回类型。所有查询键和数据类型从现有 RPC 客户端派生，无需手动定义类型。AI SDK 的 `useChat` 钩子已有完整类型定义。

### II. 模式驱动架构 ✅

**状态**: 符合（本功能不涉及）
**说明**: 此重构仅涉及客户端数据层，不修改数据库模式或验证逻辑。继续使用现有的 Drizzle ORM 模式和 drizzle-zod 验证器（server/src/db/schema.ts 中的 createChatSessionRequestSchema, updateChatSessionSchema 等）。

### III. 模块化工具函数 ✅

**状态**: 符合
**验证**: 新的 TanStack Query 钩子将设计为可组合和可重用。查询键工厂、缓存失效函数、AI 消息处理工具等将作为独立模块，遵循知识库模块的模式（参考 client/src/lib/queryKeys.ts）。消息流处理逻辑将提取为可复用的工具函数。

### IV. 中间件组合 ✅

**状态**: 符合（本功能不涉及）
**说明**: 此重构不涉及后端中间件（已有 requireAuth 中间件）。前端将使用 TanStack Query 的全局配置（如默认缓存时间、重试策略）实现横切关注点。

### V. 多租户隔离 ✅

**状态**: 符合（本功能不涉及）
**说明**: 数据隔离由后端 API 保证（getUserChats, getChatById 等查询已包含 userId 过滤）。客户端通过认证 token 访问。此重构不改变现有的多租户架构。

### VI. 数据完整性与级联 ✅

**状态**: 符合（本功能不涉及）
**说明**: 数据完整性由后端数据库和 API 保证（deleteChatSession 已实现级联删除消息）。客户端缓存失效策略将确保 UI 数据一致性（例如，删除会话时同时失效会话列表和详情缓存）。

### VII. 防御性配置 ✅

**状态**: 符合
**验证**: TanStack Query 配置将使用显式值（staleTime、cacheTime、retry 次数等），参考知识库模块的配置（client/src/lib/query-client.ts）。查询键命名约定将文档化，避免魔术字符串。AI 模型列表（VALID_MODELS）已在配置文件中定义。

### VIII. 中英文分离原则 ✅

**状态**: 符合
**验证**: 代码注释、变量名、文档使用中文。UI 文本（错误消息、加载提示、按钮文本）使用英文。保持与现有代码风格一致（如 useChatRPC.ts 中的注释使用中文，错误消息使用英文 "Failed to fetch chats"）。

**门控结果**: ✅ 通过 - 无违规项

## 项目结构

### 文档（本功能）

```
specs/002-chat-tanstack-refactor/
├── plan.md              # 本文件 (/speckit.plan 命令输出)
├── research.md          # 阶段 0 输出 (/speckit.plan 命令) - 待生成
├── data-model.md        # 阶段 1 输出 (/speckit.plan 命令) - 待生成
├── quickstart.md        # 阶段 1 输出 (/speckit.plan 命令) - 待生成
├── contracts/           # 阶段 1 输出 (/speckit.plan 命令) - 待生成
├── checklists/          # 质量检查清单
│   └── requirements.md  # 规格质量检查（已完成）
└── tasks.md             # 阶段 2 输出 (/speckit.tasks 命令 - 不由 /speckit.plan 创建)
```

### 源代码（仓库根目录）

```
client/                          # 前端 Electron + React 应用
├── src/
│   ├── hooks/                   # 🎯 主要修改区域
│   │   ├── useChatRPC.ts               # 将被废弃/重构
│   │   ├── useChatLogic.ts             # 需重构：提取数据管理逻辑
│   │   ├── queries/                    # 新增：TanStack Query 钩子
│   │   │   ├── useConversations.ts     # 会话列表查询
│   │   │   ├── useConversation.ts      # 会话详情查询（含消息）
│   │   │   ├── useChatConfigs.ts       # 配置列表查询
│   │   │   └── useChatConfig.ts        # 配置详情查询
│   │   └── mutations/                  # 新增：TanStack Mutation 钩子
│   │       ├── useCreateConversation.ts
│   │       ├── useUpdateConversation.ts
│   │       ├── useDeleteConversation.ts
│   │       ├── useCreateChatConfig.ts
│   │       ├── useUpdateChatConfig.ts
│   │       ├── useDeleteChatConfig.ts
│   │       └── useSetConfigKnowledgeBases.ts
│   ├── lib/
│   │   ├── hono-client.ts       # Hono RPC 客户端（保持不变）
│   │   ├── query-client.ts      # TanStack Query 客户端配置（已存在）
│   │   ├── queryKeys.ts         # 查询键工厂函数（需扩展：添加 chat 相关键）
│   │   └── chat-events.ts       # 聊天事件（保持不变，可能需要集成到缓存失效中）
│   ├── contexts/
│   │   └── ChatContext.tsx      # 🎯 可能需要简化：仅保留 UI 状态（知识库选择）
│   ├── routes/
│   │   └── _authenticated/
│   │       ├── chat.tsx                # 🎯 修改：使用新钩子
│   │       ├── chat.index.tsx          # 🎯 修改：使用新钩子（会话列表）
│   │       └── chat.$chatId.tsx        # 🎯 修改：使用新钩子（会话详情）
│   └── components/
│       ├── chat/
│       │   └── chat-prompt-input.tsx   # 🎯 可能需要调整：集成缓存失效
│       └── layout/
│           ├── sidebar-left/
│           │   └── chat-list.tsx       # 🎯 修改：使用新钩子
│           └── sidebar-right/
│               └── chat-config.tsx     # 🎯 修改：使用新钩子
└── package.json

server/                          # 后端 Hono API（本次基本不修改）
├── src/
│   ├── routes/
│   │   ├── chat.ts              # 聊天 API 路由（保持不变，或添加缺失端点）
│   │   └── chatConfig.ts        # 配置 API 路由（保持不变）
│   ├── lib/
│   │   └── ai/
│   │       ├── embedding.ts     # 知识库向量检索（保持不变）
│   │       └── provider.ts      # AI 模型提供者（保持不变）
│   ├── db/
│   │   ├── schema.ts            # 数据库模式（保持不变）
│   │   └── queries/
│   │       └── index.ts         # 聊天查询（getUserChats, getChatById 等，保持不变）
│   └── index.ts                 # 导出 AppType（保持不变）
└── package.json
```

**结构决策**:
- **Monorepo 结构**：前端 (`client/`) 和后端 (`server/`) 分离
- **修改范围**：主要是前端，后端仅在发现缺失端点时添加
- **新增文件**：约 11 个新文件（查询/变更钩子 + 扩展查询键）
- **修改文件**：7 个文件（3 个路由页面 + 2 个组件 + 1 个 Context + 1 个查询键文件）
- **废弃文件**：useChatRPC.ts 将被逐步替换为新钩子
- **保留兼容**：现有 Hono RPC 客户端和 AI SDK useChat 钩子保持不变，作为底层 API 调用层

## 复杂性追踪

*仅在宪章检查有必须证明合理性的违规时填写*

**状态**: 无违规项，无需追踪
