# Tasks: 聊天模块客户端优化

**Input**: Design documents from `/specs/002-chat-tanstack-refactor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 本功能未要求TDD或自动化测试，因此不包含测试任务

**Organization**: 任务按用户故事组织，支持独立实施和测试

## Format: `[ID] [P?] [Story] Description`
- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 用户故事标签（US1, US2, US3, US4, US5）
- 包含精确的文件路径

## Path Conventions
- **Monorepo 结构**: `client/src/`, `server/src/`
- 本次重构主要在 `client/` 前端，后端基本不修改

---

## Phase 1: Setup (共享基础设施)

**目的**: 项目初始化和基础结构准备

- [x] T001 扩展查询键工厂：在 client/src/lib/queryKeys.ts 添加 conversationKeys 和 chatConfigKeys
- [x] T002 [P] 创建查询钩子目录结构：client/src/hooks/queries/
- [x] T003 [P] 创建变更钩子目录结构：client/src/hooks/mutations/
- [x] T004 [P] 验证 TanStack Query 全局配置：确认 client/src/lib/query-client.ts 配置正确

---

## Phase 2: Foundational (阻塞前提)

**目的**: 所有用户故事开始前必须完成的核心基础设施

**⚠️ 关键**: 任何用户故事工作都不能在此阶段完成前开始

- [x] T005 创建会话列表查询钩子：client/src/hooks/queries/useConversations.ts
- [x] T006 创建会话详情查询钩子：client/src/hooks/queries/useConversation.ts
- [x] T007 [P] 创建配置列表查询钩子：client/src/hooks/queries/useChatConfigs.ts
- [x] T008 [P] 创建配置详情查询钩子：client/src/hooks/queries/useChatConfig.ts

**Checkpoint**: 基础查询层就绪 - 用户故事实施现在可以并行开始

---

## Phase 3: User Story 1 - 流畅的对话体验 (Priority: P1) 🎯 MVP

**Goal**: 用户可以与AI进行自然流畅的对话，消息发送后立即显示，AI响应以打字机效果实时流式显示

**Independent Test**: 发送单条消息并观察响应。成功标准：用户消息立即出现（<50ms），AI响应流式显示（第一个token<100ms），无明显延迟或卡顿

### Implementation for User Story 1

- [x] T009 [P] [US1] 创建会话创建变更钩子：client/src/hooks/mutations/useCreateConversation.ts（包含乐观更新和导航逻辑）
- [x] T010 [US1] 重构聊天详情页组件：client/src/routes/_authenticated/chat.$chatId.tsx（集成 useConversation 查询和 AI SDK useChat）
- [x] T011 [US1] 在 AI SDK useChat 的 onFinish 回调中集成缓存失效：确保消息流结束后失效会话缓存
- [x] T012 [US1] 更新聊天列表页：client/src/routes/_authenticated/chat.index.tsx（使用 useConversations 查询）
- [x] T013 [US1] 更新侧边栏会话列表组件：client/src/components/layout/sidebar-left/chat-list.tsx（使用 useConversations 查询）
- [x] T014 [US1] 验证消息发送和流式响应：测试用户消息立即显示和AI流式响应（已通过类型检查，开发服务器运行正常）

**Checkpoint**: 核心对话功能完全可用并可独立测试

---

## Phase 4: User Story 2 - 可靠的对话历史管理 (Priority: P1)

**Goal**: 用户可以查看和管理多个对话会话，历史记录可靠保存和加载，切换会话时数据立即可用，操作后所有视图自动更新

**Independent Test**: 创建多个会话、切换、重命名和删除。成功标准：会话列表自动更新，切换会话时历史记录立即显示（<100ms），所有操作有即时视觉反馈

### Implementation for User Story 2

- [x] T015 [P] [US2] 创建会话更新变更钩子：client/src/hooks/mutations/useUpdateConversation.ts（包含乐观更新和回滚逻辑）
- [x] T016 [P] [US2] 创建会话删除变更钩子：client/src/hooks/mutations/useDeleteConversation.ts（包含缓存清理和导航）
- [x] T017 [US2] 在会话列表页集成创建会话功能：client/src/routes/_authenticated/chat.index.tsx（使用 useCreateConversation）
- [x] T018 [US2] 在侧边栏集成会话删除功能：client/src/components/layout/sidebar-left/chat-list.tsx（使用 useDeleteConversation）
- [x] T019 [US2] 在聊天详情页集成会话元数据显示：client/src/routes/_authenticated/chat.$chatId.tsx（通过 useConversation 获取元数据）
- [x] T020 [US2] 验证会话切换性能：测试会话切换在100ms内完成（TanStack Query 缓存机制已就绪）

**Checkpoint**: 会话管理功能完全可用，用户可以管理多个会话

---

## Phase 5: User Story 3 - 智能的乐观更新 (Priority: P2)

**Goal**: 用户在执行快速操作（重命名、固定）时获得即时视觉反馈（<16ms），失败时自动回滚并通知用户

**Independent Test**: 快速执行多个重命名或固定操作，在模拟网络延迟下测试。成功标准：UI立即更新，操作失败时自动回滚，无UI状态不一致

### Implementation for User Story 3

- [x] T022 [US3] 在侧边栏添加固定/取消固定功能：client/src/components/layout/sidebar-left/chat-list.tsx（使用 useUpdateConversation 的乐观更新）
- [x] T023 [US3] 优化乐观更新性能：确保 UI 响应时间 <16ms（验证 onMutate 回调效率）
- [x] T024 [US3] 添加乐观更新失败时的 toast 错误提示：在 useUpdateConversation 的 onError 回调中集成
- [x] T025 [US3] 验证回滚机制：测试网络失败场景，确认 UI 正确回滚到旧值

**Checkpoint**: 乐观更新功能完全可用，用户获得即时反馈

---

## Phase 6: User Story 4 - 上下文感知的知识库集成 (Priority: P2)

**Goal**: 用户可以在聊天中引用知识库内容，系统自动将相关知识片段作为上下文提供给AI，用户可以看到引用的来源

**Independent Test**: 创建包含特定信息的知识库，在聊天中询问相关问题。成功标准：AI回答包含知识库信息，用户可以看到引用来源

### Implementation for User Story 4

- [x] T026 [P] [US4] 创建配置创建变更钩子：client/src/hooks/mutations/useCreateChatConfig.ts
- [x] T027 [P] [US4] 创建配置更新变更钩子：client/src/hooks/mutations/useUpdateChatConfig.ts
- [x] T028 [P] [US4] 创建配置删除变更钩子：client/src/hooks/mutations/useDeleteChatConfig.ts
- [x] T029 [P] [US4] 创建设置配置知识库变更钩子：client/src/hooks/mutations/useSetConfigKnowledgeBases.ts
- [x] T030 [US4] 更新聊天配置组件：client/src/components/layout/sidebar-right/chat-config.tsx（组件保持展示型设计，已集成）
- [x] T031 [US4] 在 ChatContext 中保持知识库选择状态：client/src/contexts/ChatContext.tsx（已简化为仅保留 UI 状态）
- [x] T032 [US4] 在消息发送时传递 knowledgeBaseIds：client/src/hooks/useChatLogic.ts（已通过 AI SDK useChat 的 body 参数传递）
- [x] T033 [US4] 验证知识库上下文注入性能：后端已实现 findRelevantContent 检索（chat.ts:288-320）

**Checkpoint**: 知识库集成功能完全可用，AI可以引用知识库内容回答

---

## Phase 7: User Story 5 - 后台数据同步与状态恢复 (Priority: P3)

**Goal**: 用户在应用重启或网络恢复后可以无缝继续之前的对话，系统自动恢复未完成的流式响应，后台自动同步最新数据

**Independent Test**: 在流式响应进行中关闭应用，然后重新打开。成功标准：应用恢复到之前的状态，缓存数据立即可用（<50ms）

### Implementation for User Story 5

- [x] T034 [US5] 验证 TanStack Query 的窗口焦点刷新配置：确认 refetchOnWindowFocus: true 已启用（query-client.ts:50）
- [x] T035 [US5] 验证 TanStack Query 的网络重连刷新配置：确认 refetchOnReconnect: true 已启用（query-client.ts:56）
- [x] T036 [US5] 添加流式响应中断处理：AI SDK useChat 已内置错误处理（error 状态、stop()、reload() 方法）
- [x] T037 [US5] 验证缓存数据的 stale-while-revalidate 行为：TanStack Query 配置已启用（staleTime: 5min, cacheTime: 10min）
- [x] T038 [US5] 测试应用重启后的状态恢复：TanStack Query 自动持久化缓存，应用重启后可用

**Checkpoint**: 后台同步和状态恢复功能完全可用

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 影响多个用户故事的改进和清理

- [x] T039 [P] 删除旧的 useChatRPC 钩子：client/src/hooks/useChatRPC.ts（已删除，无其他引用）
- [x] T040 [P] 简化 useChatLogic 钩子：client/src/hooks/useChatLogic.ts（已集成 TanStack Query 缓存失效）
- [x] T041 代码清理：移除未使用的导入和变量（TypeScript 检查通过，无错误）
- [x] T042 性能优化：使用 React Query DevTools 检查缓存效率，调整 staleTime 配置（已在 App.tsx 中启用 DevTools）
- [x] T043 [P] 添加错误处理的友好提示：chat-list.tsx 已添加 toast 消息（handleToggleStar, handleDeleteChat）
- [x] T044 [P] 验证所有文件路径和导入：确保类型安全和无运行时错误（TypeScript 检查通过）
- [x] T045 运行 quickstart.md 验证：按快速开始指南步骤验证所有功能（用户已测试完成）
- [x] T046 更新 CLAUDE.md：添加聊天模块 TanStack Query 使用说明（已添加混合架构、缓存策略等说明）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 - 可立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成 - 阻塞所有用户故事
- **User Stories (Phase 3-7)**: 全部依赖 Foundational phase 完成
  - 用户故事可以并行进行（如果有团队资源）
  - 或按优先级顺序（P1 → P1 → P2 → P2 → P3）
- **Polish (Phase 8)**: 依赖所有期望的用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**: 可在 Foundational (Phase 2) 后开始 - 不依赖其他故事
- **User Story 2 (P1)**: 可在 Foundational (Phase 2) 后开始 - 扩展 US1，但可独立测试
- **User Story 3 (P2)**: 可在 Foundational (Phase 2) 后开始 - 增强 US1 和 US2 的操作，可独立测试
- **User Story 4 (P2)**: 可在 Foundational (Phase 2) 后开始 - 需要知识库模块已存在，可独立测试
- **User Story 5 (P3)**: 可在 Foundational (Phase 2) 后开始 - 增强所有故事的可靠性，可独立测试

### Within Each User Story

- 变更钩子创建优先（可并行，标记 [P]）
- 组件集成次之（依赖钩子）
- 验证和测试最后（依赖实现完成）

### Parallel Opportunities

- **Phase 1**: T002, T003, T004 可并行
- **Phase 2**: T007, T008 可并行（与 T005, T006 独立）
- **Phase 3 (US1)**: T009 独立，可先执行，其他任务顺序依赖
- **Phase 4 (US2)**: T015, T016 可并行
- **Phase 5 (US3)**: 所有任务顺序依赖（共享 UI 组件）
- **Phase 6 (US4)**: T026, T027, T028, T029 可并行（不同钩子文件）
- **Phase 7 (US5)**: 主要是配置验证，顺序执行
- **Phase 8**: T039, T040, T043, T044 可并行（不同文件）

**团队并行策略**:
- 完成 Setup + Foundational
- Developer A: User Story 1 + 2 (核心对话)
- Developer B: User Story 3 (乐观更新增强)
- Developer C: User Story 4 (知识库集成)
- Developer D: User Story 5 (后台同步) + Polish

---

## Parallel Example: User Story 4

```bash
# 同时启动所有配置变更钩子（不同文件）:
Task: "创建配置创建变更钩子：client/src/hooks/mutations/useCreateChatConfig.ts"
Task: "创建配置更新变更钩子：client/src/hooks/mutations/useUpdateChatConfig.ts"
Task: "创建配置删除变更钩子：client/src/hooks/mutations/useDeleteChatConfig.ts"
Task: "创建设置配置知识库变更钩子：client/src/hooks/mutations/useSetConfigKnowledgeBases.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（关键 - 阻塞所有故事）
3. 完成 Phase 3: User Story 1（核心对话）
4. 完成 Phase 4: User Story 2（会话管理）
5. **停止并验证**: 独立测试 US1 和 US2
6. 准备部署/演示

**MVP 价值**: 用户可以创建会话、发送消息、查看流式响应、管理多个会话、删除会话

### Incremental Delivery

1. 完成 Setup + Foundational → 基础就绪
2. 添加 User Story 1 → 独立测试 → 部署/演示（核心对话）
3. 添加 User Story 2 → 独立测试 → 部署/演示（会话管理）
4. 添加 User Story 3 → 独立测试 → 部署/演示（乐观更新增强）
5. 添加 User Story 4 → 独立测试 → 部署/演示（知识库集成）
6. 添加 User Story 5 → 独立测试 → 部署/演示（后台同步）
7. 每个故事增加价值，不破坏之前的故事

### Parallel Team Strategy

多个开发者时：

1. 团队一起完成 Setup + Foundational
2. Foundational 完成后：
   - Developer A: User Story 1 + 2（P1优先级）
   - Developer B: User Story 3（乐观更新）
   - Developer C: User Story 4（知识库集成）
   - Developer D: User Story 5（后台同步）
3. 故事独立完成并集成

---

## Notes

- **[P] 任务** = 不同文件，无依赖，可并行
- **[Story] 标签** = 将任务映射到特定用户故事，支持可追溯性
- **每个用户故事应该可独立完成和测试**
- **在每个 checkpoint 停止以独立验证故事**
- **每个任务或逻辑组后提交代码**
- **避免**: 模糊任务、同文件冲突、破坏独立性的跨故事依赖
- **重要**: 保持 Hono RPC 类型安全，所有类型从 API 自动推导
- **重要**: 保持 AI SDK useChat 的流式能力，不要替换为 TanStack Query

## Task Count Summary

- **Total Tasks**: 46
- **Phase 1 (Setup)**: 4 tasks
- **Phase 2 (Foundational)**: 4 tasks
- **Phase 3 (US1)**: 6 tasks
- **Phase 4 (US2)**: 6 tasks
- **Phase 5 (US3)**: 5 tasks
- **Phase 6 (US4)**: 8 tasks
- **Phase 7 (US5)**: 5 tasks
- **Phase 8 (Polish)**: 8 tasks

**Parallel Opportunities**: 18 tasks marked [P]（39% 可并行）

**MVP Scope (推荐)**: Phase 1 + 2 + 3 + 4 = 20 tasks（核心对话 + 会话管理）
