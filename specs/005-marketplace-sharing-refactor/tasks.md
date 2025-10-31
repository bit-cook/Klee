# 任务清单：知识库与 Agent 市场分享流程重构

**输入文档**: `/specs/005-marketplace-sharing-refactor/` 中的设计文档
**前置条件**: plan.md, spec.md, research.md, data-model.md, contracts/api-endpoints.md, quickstart.md

**测试**: 本规格说明中未要求测试，仅关注实现任务。

**组织方式**: 任务按用户故事分组，以支持每个故事的独立实现和测试。

## 格式: `[任务ID] [P?] [故事?] 描述及文件路径`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[故事]**: 该任务属于哪个用户故事（如 US1, US2, US3）
- 描述中包含精确文件路径

## 路径约定

- **Web 应用**: `server/`（后端）, `client/`（前端）
- 后端: `server/db/`, `server/src/routes/`, `server/src/lib/`
- 前端: `client/src/routes/`, `client/src/hooks/`, `client/src/components/`

---

## 阶段 1：环境准备（共享基础设施）

**目的**: 验证现有基础设施并准备开发环境

- [x] T001 验证数据库 schema 完整性（knowledgeBases 和 chatConfigs 表中存在 isPublic、shareSlug 字段）
- [x] T002 [P] 运行服务端 TypeScript 类型检查: `cd server && npx tsc --noEmit`
- [x] T003 [P] 运行客户端 TypeScript 类型检查: `cd client && npx tsc --noEmit`
- [x] T004 审查 research.md 中的发现，确认无需数据库迁移

---

## 阶段 2：基础设施优化（阻塞性前置条件）

**目的**: 核心基础设施优化，所有用户故事开始前必须完成

**⚠️ 关键**: 在此阶段完成前，不能开始任何用户故事的工作

- [x] T005 重构 server/src/lib/slug-generator.ts 中的 slug 生成器，使用 `generateUniqueShareSlug()` 代替 `generateShareSlug()`
- [x] T006 [P] 在 server/src/routes/knowledgebase.ts 的分享端点添加 409 Conflict 错误重试逻辑
- [x] T007 [P] 在 server/src/routes/chatConfig.ts 的分享端点添加 409 Conflict 错误重试逻辑
- [x] T008 验证 client/src/lib/queryKeys.ts 中的查询键层级结构（knowledgeBaseKeys, chatConfigKeys, marketplaceKeys）
- [x] T009 [P] 在 client/src/hooks/knowledge-base/mutations/useUnshareKnowledgeBase.ts 创建取消分享知识库 mutation 钩子模板
- [x] T010 [P] 在 client/src/hooks/chat-config/mutations/useUnshareChatConfig.ts 创建取消分享 Agent mutation 钩子模板

**检查点**: 基础设施就绪 - 现在可以并行开始用户故事实现

---

## 阶段 3：用户故事 1 - 知识库创建与一键分享 (优先级: P1) 🎯 MVP

**目标**: 在知识库详情页直接点击"分享到市场"按钮，生成唯一分享链接并在市场中可见

**独立测试**: 创建一个包含至少一个文件的知识库，进入详情页，点击分享按钮，验证市场列表中出现该知识库

### 用户故事 1 的实现任务

- [x] T011 [P] [US1] 更新 server/db/queries/knowledgebase.ts 中的 shareKnowledgeBase() 函数，使用 `generateUniqueShareSlug()` 回调
- [x] T012 [P] [US1] 在 shareKnowledgeBase() 中添加文件验证逻辑，检查至少有一个 status='completed' 的文件
- [x] T013 [US1] 更新 server/src/routes/knowledgebase.ts 中的 PUT /api/knowledgebase/:id/share 端点，处理 409 Conflict 错误
- [x] T014 [US1] 在 client/src/hooks/marketplace/mutations/useShareKnowledgeBase.ts 实现 useShareKnowledgeBase mutation
- [x] T015 [US1] 在 client/src/routes/\_authenticated/knowledge-base.$knowledgeBaseId.tsx 的知识库详情页添加分享/取消分享按钮
- [x] T016 [US1] 在知识库详情 UI 中显示分享状态（isPublic, shareSlug）
- [x] T017 [US1] 为分享/取消分享操作添加错误处理和 toast 通知

**检查点**: 此时用户故事 1 应完全可用 - 知识库可以分享并在市场中显示

---

## 阶段 4：用户故事 2 - Agent 创建与一键分享 (优先级: P1)

**目标**: 在 Agent 详情页直接点击"分享到市场"按钮，生成唯一分享链接并在市场中可见

**独立测试**: 创建一个包含名称、模型、系统提示的 Agent，点击分享按钮，验证市场中出现该 Agent 且包含关联的知识库列表

### 用户故事 2 的实现任务

- [x] T018 [P] [US2] 更新 server/db/queries/chatConfig.ts 中的 shareChatConfig() 函数，使用 `generateUniqueShareSlug()` 回调
- [x] T019 [P] [US2] 在 shareChatConfig() 中添加必填字段验证（name, defaultModel）
- [x] T020 [US2] 更新 server/src/routes/chatConfig.ts 中的 PUT /api/chat-configs/:id/share 端点，处理 409 Conflict 错误
- [x] T021 [US2] 在 client/src/hooks/marketplace/mutations/useShareAgent.ts 实现 useShareAgent mutation
- [x] T022 [US2] 在 client/src/components/layout/sidebar-left/marketplace-list.tsx 添加分享/取消分享按钮
- [x] T023 [US2] 在 Agent 侧边栏 UI 中显示分享状态（Globe 图标）
- [x] T024 [US2] 为分享操作添加错误处理和 toast 通知

**检查点**: 此时用户故事 1 和 2 应都能独立工作 - 知识库和 Agent 都可以分享

---

## 阶段 5：用户故事 3 - 市场浏览与搜索 (优先级: P2)

**目标**: 在市场页面浏览所有公开的知识库和 Agent，并通过搜索快速找到资源

**独立测试**: 打开市场页面，切换知识库/Agent 标签页，使用搜索框输入关键词，验证结果实时更新且相关

### 用户故事 3 的实现任务

- [x] T025 [P] [US3] 验证 server/src/routes/marketplace.ts 中的 GET /api/marketplace/agents 端点（应已存在）
- [x] T026 [P] [US3] 验证 server/src/routes/marketplace.ts 中的 GET /api/marketplace/knowledge-bases 端点（应已存在）
- [x] T027 [P] [US3] 审查 client/src/hooks/marketplace/queries/useMarketplaceAgents.ts 中的 useMarketplaceAgents 查询钩子
- [x] T028 [P] [US3] 审查 client/src/hooks/marketplace/queries/useMarketplaceKnowledgeBases.ts 中的 useMarketplaceKnowledgeBases 查询钩子
- [x] T029 [US3] 验证市场列表组件中的搜索防抖实现（300ms）
- [x] T030 [US3] 验证市场列表渲染中的分页实现（每页 20 条）
- [x] T031 [US3] 测试 client/src/routes/\_authenticated/marketplace.tsx 中的市场导航
- [x] T032 [US3] 验证卡片组件显示正确信息（AgentCard, KnowledgeBaseCard）

**检查点**: 市场浏览和搜索应完全可用

---

## 阶段 6：用户故事 4 - Agent 一键安装 (优先级: P1)

**目标**: 在市场浏览 Agent 时，点击"安装"按钮快速将 Agent 配置复制到用户账户

**独立测试**: 在市场找到一个 Agent，点击安装按钮，验证 Agent 出现在用户的个人 Agent 列表中且配置完整

### 用户故事 4 的实现任务

- [x] T033 [P] [US4] 重构 server/db/queries/chatConfig.ts 中的 installAgent() 函数，验证非所有者检查（userId !== creator）
- [x] T034 [P] [US4] 在 installAgent() 中使用 sourceShareSlug 添加重复安装检查
- [x] T035 [P] [US4] 在 installAgent() 中实现知识库过滤，仅复制可访问的知识库（isPublic=true 或用户拥有）
- [x] T036 [US4] 更新 server/src/routes/chatConfig.ts 中 POST /api/chat-configs/install 端点的错误处理
- [x] T037 [US4] 审查 client/src/hooks/marketplace/mutations/useInstallAgent.ts 中的 useInstallAgent mutation
- [x] T038 [US4] 审查 client/src/hooks/marketplace/queries/useCheckAgentInstalled.ts 中的 useCheckAgentInstalled 查询
- [x] T039 [US4] 在 client/src/routes/\_authenticated/marketplace.agent.$agentId.tsx 的市场 Agent 详情页添加安装按钮渲染逻辑
- [x] T040 [US4] 根据 useCheckAgentInstalled 结果显示安装状态（已安装/你的Agent/安装）
- [x] T041 [US4] 为"已安装"和"无法安装自己的 Agent"场景添加错误处理

**检查点**: Agent 安装应完全可用，包含适当的重复和所有权检查

---

## 阶段 7：用户故事 5 - 知识库一键安装（引用机制） (优先级: P2)

**目标**: 在市场浏览知识库时，点击"使用此知识库"按钮，将公开知识库关联到 Agent 中

**独立测试**: 在市场找到一个知识库，点击"使用"按钮，创建新 Agent 时能够选择该公开知识库

### 用户故事 5 的实现任务

- [X] T042 [P] [US5] 验证 server/db/queries/knowledgebase.ts 中的 validateKnowledgeBaseAccess() 按 userId 或 isPublic=true 过滤
- [X] T043 [P] [US5] 在 client/src/routes/_authenticated/marketplace.knowledge-base.$shareSlug.tsx 的市场知识库详情页添加"使用此知识库"按钮
- [X] T044 [US5] 实现导航到 Agent 创建页面并预选知识库的功能
- [X] T045 [US5] 更新 Agent 创建/编辑表单以显示可用知识库（用户的 + 公开的）
- [X] T046 [US5] 在 Agent 创建 UI 中添加知识库下拉选择器，并进行适当过滤
- [X] T085 [US5] 当主导航栏来市场时，左侧边栏创建按钮点击，跳转打开新建agent页面，"/marketplace/agent/new"

**检查点**: 知识库使用机制应允许在创建/编辑 Agent 时选择公开知识库

---

## 阶段 8：用户故事 6 - 取消分享知识库 (优先级: P2)

**目标**: 取消知识库的市场分享状态，让它重新变为私有

**独立测试**: 分享一个知识库后取消分享，验证市场中不再显示该知识库

### 用户故事 6 的实现任务

- [X] T047 [P] [US6] 验证 shareKnowledgeBase() 中的取消分享逻辑设置 isPublic=false 并保留 shareSlug
- [X] T048 [US6] 在 client/src/hooks/knowledge-base/mutations/useUnshareKnowledgeBase.ts 实现 useUnshareKnowledgeBase mutation 主体
- [X] T049 [US6] 更新知识库详情页，在 isPublic=true 时显示"取消分享"按钮
- [X] T050 [US6] 在取消分享时添加 knowledgeBaseKeys.all 和 marketplaceKeys.knowledgeBases() 的缓存失效
- [X] T051 [US6] 在取消分享前添加确认对话框，警告将从市场移除

**检查点**: 知识库取消分享应正常工作并从市场列表中移除

---

## 阶段 9：用户故事 7 - 删除知识库及级联处理 (优先级: P2)

**目标**: 完全删除知识库，系统自动清理所有关联的 Agent 配置和文件存储

**独立测试**: 创建知识库并关联到 Agent，删除知识库后验证 Agent 的知识库列表中不再包含该知识库

### 用户故事 7 的实现任务

- [X] T052 [P] [US7] 在 server/db/queries/knowledgebase.ts 的 deleteKnowledgeBase() 中使用数据库事务实现级联删除
- [X] T053 [P] [US7] 在 deleteKnowledgeBase() 中添加 chatSessions.availableKnowledgeBaseIds JSONB 数组清理 SQL
- [X] T054 [P] [US7] 在 deleteKnowledgeBase() 中添加 Supabase Storage 文件清理（事务后异步）
- [X] T055 [US7] 更新 server/src/routes/knowledgebase.ts 中 DELETE /api/knowledgebase/:id 端点的错误处理
- [X] T056 [US7] 审查 client/src/hooks/knowledge-base/mutations/useDeleteKnowledgeBase.ts 中的 useDeleteKnowledgeBase mutation
- [X] T057 [US7] 在知识库详情页的删除前添加确认对话框，并警告级联影响
- [X] T058 [US7] 更新删除后的缓存失效策略（knowledgeBaseKeys.all, marketplaceKeys.knowledgeBases()）
- [X] T059 [US7] 在删除操作期间添加加载状态（大型知识库可能需要 5 秒）

**检查点**: 知识库删除应正确级联并清理所有关联

---

## 阶段 10：用户故事 8 - 取消分享 Agent (优先级: P2)

**目标**: 取消 Agent 的市场分享状态，让它重新变为私有

**独立测试**: 分享一个 Agent 后取消分享，验证市场中不再显示该 Agent，但已安装的用户仍保留副本

### 用户故事 8 的实现任务

- [X] T060 [P] [US8] 验证 shareChatConfig() 中的取消分享逻辑设置 isPublic=false 并保留 shareSlug
- [X] T061 [US8] 在 client/src/hooks/chat-config/mutations/useUnshareChatConfig.ts 实现 useUnshareChatConfig mutation 主体
- [X] T062 [US8] 更新 Agent 详情/编辑页，在 isPublic=true 时显示"取消分享"按钮
- [X] T063 [US8] 在取消分享时添加 chatConfigKeys.all 和 marketplaceKeys.agents() 的缓存失效
- [X] T064 [US8] 在取消分享前添加确认对话框，警告将从市场移除
- [X] T065 [US8] 验证源 Agent 取消分享后，已安装的 Agent 副本仍可正常使用

**检查点**: Agent 取消分享应正常工作且不影响已安装的副本

---

## 阶段 11：用户故事 9 - 删除 Agent (优先级: P2)

**目标**: 完全删除 Agent 配置，系统确保已安装的用户副本不受影响

**独立测试**: 分享 Agent 并被其他用户安装，删除原始 Agent 后验证安装的副本仍可正常使用

### 用户故事 9 的实现任务

- [X] T066 [P] [US9] 验证 server/db/queries/chatConfig.ts 中的 deleteChatConfig() 级联删除 chatConfigKnowledgeBases
- [X] T067 [P] [US9] 在 deleteChatConfig() 中添加自动取消分享逻辑（删除前设置 isPublic=false）
- [X] T068 [US9] 更新 server/src/routes/chatConfig.ts 中的 DELETE /api/chat-configs/:id 端点
- [X] T069 [US9] 审查 client/src/hooks/chat-config/mutations/useDeleteChatConfig.ts 中的 useDeleteChatConfig mutation
- [X] T070 [US9] 在 Agent 详情页的删除前添加确认对话框
- [X] T071 [US9] 验证删除不影响已安装的副本（不同的 id 和 userId）
- [X] T072 [US9] 更新删除后的缓存失效（chatConfigKeys.all, marketplaceKeys.agents()）

**检查点**: 所有用户故事现在应该都能独立工作

---

## 阶段 12：优化与跨功能改进

**目的**: 影响多个用户故事的改进

- [X] T073 [P] 根据查询性能测试，如需要则添加性能索引（sourceShareSlug, availableKnowledgeBaseIds GIN）
- [X] T074 [P] 根据宪章 VIII（中英文分离）审查所有英文 UI 消息（按钮、toast、错误）
- [X] T075 验证所有缓存失效策略遵循 TanStack Query 最佳实践
- [X] T076 使用 1000+ 个模拟项目测试市场，验证 SC-011 性能目标（<1秒）
- [X] T077 [P] 测试所有分享操作满足 <3秒 性能目标（SC-001, SC-002）
- [X] T078 [P] 测试 Agent 安装满足 <3秒 性能目标（SC-005）
- [X] T079 [P] 测试包含 100 个文件的知识库删除满足 <5秒 目标（SC-006）
- [X] T080 运行完整 TypeScript 类型检查: `npm run build`
- [X] T081 验证 quickstart.md 中的场景按文档工作
- [X] T082 更新 CLAUDE.md，添加实现期间发现的新模式（如有）
- [X] T083 代码审查：检查所有 [P] 任务确实使用不同文件且无隐藏依赖

---

## 依赖关系与执行顺序

### 阶段依赖

- **环境准备（阶段 1）**: 无依赖 - 可立即开始
- **基础设施优化（阶段 2）**: 依赖环境准备完成 - 阻塞所有用户故事
- **用户故事（阶段 3-11）**: 都依赖基础设施优化阶段完成
  - **P1 故事（US1, US2, US4）**: 基础设施优化后可并行进行
  - **P2 故事（US3, US5, US6, US7, US8, US9）**: 基础设施优化后可并行进行
  - **推荐顺序**: US1 → US2 → US4（核心分享/安装）→ US3（浏览）→ US5-US9（高级功能）
- **优化（阶段 12）**: 依赖所有期望的用户故事完成

### 用户故事依赖

#### P1 故事（核心 MVP）

- **用户故事 1（知识库分享）**: 独立 - 基础设施优化后可开始
- **用户故事 2（Agent分享）**: 独立 - 基础设施优化后可开始
- **用户故事 4（Agent安装）**: 依赖 US2（需要已分享的 Agent 存在）

#### P2 故事（次要功能）

- **用户故事 3（市场浏览）**: 依赖 US1 + US2（需要已分享的项目进行浏览）
- **用户故事 5（知识库使用）**: 依赖 US1（需要已分享的知识库使用）
- **用户故事 6（取消分享KB）**: 依赖 US1（需要先分享才能取消分享）
- **用户故事 7（删除KB）**: 独立 - 基础设施优化后可开始
- **用户故事 8（取消分享Agent）**: 依赖 US2（需要先分享才能取消分享）
- **用户故事 9（删除Agent）**: 独立 - 基础设施优化后可开始

### 每个用户故事内部

- 后端逻辑先于前端钩子
- 钩子先于 UI 组件
- 核心实现先于错误处理
- 故事完成后再进入下一个优先级

### 并行执行机会

- 所有标记 [P] 的环境准备任务可并行运行
- 所有标记 [P] 的基础设施优化任务可并行运行（在阶段 2 内）
- 基础设施优化阶段完成后：
  - **US1 + US2 可并行**（不同的表：knowledgeBases vs chatConfigs）
  - **US1 + US2 完成后**: US3、US4、US5 可并行
  - **US6 + US7 可并行**（US6 修改知识库分享，US7 删除知识库 - 不同操作）
  - **US8 + US9 可并行**（US8 修改 Agent 分享，US9 删除 Agent - 不同操作）
- 所有标记 [P] 的优化任务可并行运行

---

## 并行示例：用户故事 1（知识库分享）

```bash
# 同时启动后端任务：
任务: "更新 server/db/queries/knowledgebase.ts 中的 shareKnowledgeBase()"
任务: "在 shareKnowledgeBase() 中添加文件验证逻辑"

# 然后同时启动前端任务：
任务: "实现 useShareKnowledgeBase mutation"
任务: "在知识库详情页添加分享/取消分享按钮"
```

---

## 并行示例：基础设施优化阶段

```bash
# 这些可以全部并行运行（不同文件）：
任务: "在 knowledgebase.ts 中添加 409 Conflict 重试逻辑"
任务: "在 chatConfig.ts 中添加 409 Conflict 重试逻辑"
任务: "创建 useUnshareKnowledgeBase mutation 钩子模板"
任务: "创建 useUnshareChatConfig mutation 钩子模板"
```

---

## 实施策略

### MVP 优先（仅用户故事 1、2、4）

1. 完成阶段 1：环境准备（验证现有基础设施）
2. 完成阶段 2：基础设施优化（关键 - slug 生成重构）
3. 完成阶段 3：用户故事 1（知识库分享）
4. 完成阶段 4：用户故事 2（Agent 分享）
5. 完成阶段 6：用户故事 4（Agent 安装）
6. **停止并验证**: 独立测试这 3 个故事
7. 如果准备好则部署/演示

**为何选择此 MVP**: 这 3 个故事构成核心市场体验 - 用户可以分享知识库、分享 Agent 和安装 Agent。浏览功能（US3）在之前的实现中已存在。

### 增量交付

1. 完成环境准备 + 基础设施优化 → 基础就绪
2. 添加 US1 + US2 → 独立测试 → 部署/演示（核心分享 MVP！）
3. 添加 US4 → 独立测试 → 部署/演示（安装功能正常！）
4. 添加 US3 → 独立测试 → 部署/演示（浏览优化！）
5. 添加 US5-US9 → 独立测试 → 部署/演示（高级功能完成！）
6. 每个故事在不破坏先前故事的情况下增加价值

### 并行团队策略

多位开发者时：

1. 团队共同完成环境准备 + 基础设施优化
2. 基础设施优化完成后：
   - 开发者 A：用户故事 1（知识库分享）
   - 开发者 B：用户故事 2（Agent 分享）
3. US1 + US2 完成后：
   - 开发者 A：用户故事 4（Agent 安装）+ 用户故事 6（取消分享知识库）
   - 开发者 B：用户故事 3（浏览）+ 用户故事 8（取消分享 Agent）
   - 开发者 C：用户故事 7（删除知识库）+ 用户故事 9（删除 Agent）
4. US1 完成后任何时候都可以并行开发 US5（知识库使用）
5. 故事独立完成并整合

---

## 注意事项

- [P] 任务 = 不同文件，无依赖
- [故事] 标签将任务映射到特定用户故事以便追溯
- 每个用户故事应该可以独立完成和测试
- 规格说明中未包含测试 - 专注于实现
- 每个任务或逻辑组后提交
- 在任何检查点停止以独立验证故事
- 这是一个**重构**任务 - 大多数组件已存在，专注于优化和集成
- 避免：模糊任务、同文件冲突、破坏独立性的跨故事依赖

---

## 任务摘要

**总任务数**: 83

- 环境准备: 4 个任务
- 基础设施优化: 6 个任务（关键 - 阻塞所有故事）
- 用户故事 1（P1）: 7 个任务
- 用户故事 2（P1）: 7 个任务
- 用户故事 3（P2）: 8 个任务
- 用户故事 4（P1）: 9 个任务
- 用户故事 5（P2）: 5 个任务
- 用户故事 6（P2）: 5 个任务
- 用户故事 7（P2）: 8 个任务
- 用户故事 8（P2）: 6 个任务
- 用户故事 9（P2）: 7 个任务
- 优化: 11 个任务

**并行机会**: 37 个任务标记为 [P]

**MVP 范围**（推荐首次交付）:

- 阶段 1: 环境准备（4 个任务）
- 阶段 2: 基础设施优化（6 个任务）
- 阶段 3: 用户故事 1（7 个任务）
- 阶段 4: 用户故事 2（7 个任务）
- 阶段 6: 用户故事 4（9 个任务）
- **MVP 总计**: 33 个任务

**格式验证**: ✅ 所有任务遵循 `- [ ] [ID] [P?] [故事?] 描述及文件路径` 格式
