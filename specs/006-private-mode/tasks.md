# 任务清单：Private Mode（私有模式）

**输入文档**: `/specs/006-private-mode/` 下的设计文档
**前置依赖**: plan.md, spec.md, research.md, data-model.md

**测试**: 规格说明中未明确要求测试 - 专注于实现任务

**组织方式**: 任务按用户故事分组，以实现每个故事的独立实现和测试

## 格式说明: `[ID] [P?] [Story] 描述`
- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 任务所属用户故事（如 US0, US1, US2, US3, US4）
- 描述中包含具体文件路径

## 重要变更记录

**2025-10-21 重构**:
- ✅ 采用 electron-ollama 方案，废弃手动安装流程
- 🗑️ 删除 `OllamaDownloadProgress` 组件 (简化 UI)
- 🗑️ 删除 `PrivateModeErrorBoundary` 组件 (不必要)
- ✅ 完成 DatabaseConnectionManager (替代旧的 connection.ts)
- ✅ 完成 ModeToggle UI (实际路径在 sidebar-right/)

## 路径约定
- **Electron 项目**: `client/electron/`, `client/src/`
- **主进程**: `client/electron/`（Ollama 安装、IPC、本地数据库）
- **渲染进程**: `client/src/`（UI 组件、Hooks、Context）

---

## 阶段 1：初始化（共享基础设施）

**目的**: 项目初始化和基础结构搭建

- [X] T001 安装依赖：better-sqlite3, drizzle-orm, lancedb, ollama-ai-provider
- [X] ~~T002 [P] 配置 electron-builder 以在 resources/ 目录中打包 Ollama 安装程序~~ (已废弃: 改用 electron-ollama)
- [X] T003 [P] 创建目录结构：electron/services/, electron/ipc/, electron/db/, src/hooks/mode/, src/contexts/

---

## 阶段 2：基础层（阻塞性前置条件）

**目的**: 必须在任何用户故事实现前完成的核心基础设施

**⚠️ 关键**: 所有用户故事工作必须等此阶段完成后才能开始

- [X] T004 在 client/db/schema-local.ts 创建 Private Mode 的 SQLite schema（conversations, messages, knowledge_bases, models, settings）
- [X] T005 [P] 在 client/electron/db/connection.ts 配置本地 SQLite 的 Drizzle ORM
- [X] T006 [P] 在 client/src/contexts/ModeContext.tsx 创建 ModeContext provider（Cloud/Private 模式状态管理）
- [X] T007 [P] 在 client/src/config/local.config.ts 创建模式配置（Ollama 端口、路径、超时）
- [X] T008 在 client/electron/ipc/channels.ts 定义 IPC 通道（ollama-*, local-data-*, mode-*）
- [X] T009 在 client/electron/ipc/error-handler.ts 设置 IPC 错误处理中间件

**检查点**: 基础层就绪 - 用户故事实现可以并行开始

---

## 阶段 3：用户故事 0 - Ollama 集成（优先级：P0）🎯 前置依赖

**目标**: 实现 Ollama 智能检测和启动流程，确保 Private Mode 的前置条件满足

**实际实现**: 使用 electron-ollama 内嵌 Ollama，优先检测系统 Ollama，未检测到时启动内嵌版本（无需下载）

**独立测试**: 启动 rafa，验证自动检测系统 Ollama 或启动内嵌 Ollama，Private Mode 可用

### 用户故事 0 的实现任务（已简化实现）

- [X] T010 [US0] 在 client/electron/services/ollama-manager.ts 实现系统 Ollama 检测（检查 localhost:11434）
- [X] T011 [US0] 在 client/electron/services/ollama-manager.ts 实现内嵌 Ollama 启动（使用 electron-ollama）
- [X] T012 [US0] 在 client/electron/main.ts 集成应用启动时的 Ollama 初始化（优先使用系统 Ollama）
- [X] T013 [US0] 在 client/src/hooks/mode/useOllamaSource.ts 创建 useOllamaSource hook（监听 Ollama 来源和状态）
- [X] T014 [US0] 在 client/src/components/layout/sidebar-right/mode-toggle.tsx 根据 Ollama 可用性更新 Private Mode 按钮状态

**✅ 检查点**: Ollama 集成完成 - 使用 electron-ollama 方案，优先检测系统 Ollama，未检测到时自动下载内嵌版本

---

## 阶段 4：用户故事 1 - 模式切换与离线运行（优先级：P1）🎯 MVP 核心

**目标**: 实现 Cloud/Private 模式切换，确保 Private Mode 下完全离线运行

**独立测试**: 点击模式切换按钮，验证模式状态变化、网络请求停止、UI 更新正确

### 用户故事 1 的实现任务

- [X] T025 [P] [US1] 在 client/src/contexts/ModeContext.tsx 扩展 ModeContext 并添加模式持久化（保存到 localStorage）
- [X] T026 [P] [US1] 在 client/src/components/layout/sidebar-right/mode-toggle.tsx 创建模式切换器 UI（Cloud/Private 切换按钮，简洁设计）
- [X] T027 [US1] 在 client/src/lib/query-client.ts 实现模式感知的 TanStack Query 配置（Private 模式下禁用查询）
- [X] ~~T028 [US1] 在 client/src/components/ModeIndicator.tsx 创建模式指示器组件（显示当前模式）~~ (不需要: ModeToggle 已足够)
- [X] T029 [US1] 在 client/src/routes/_authenticated/knowledge-base.$knowledgeBaseId.tsx 在 Private 模式下禁用云端专属功能（隐藏分享按钮）
- [X] T030 [US1] 在 client/src/components/layout/sidebar-right/chat-config.tsx 在 Private 模式下禁用云端专属功能（隐藏创建 Agent 按钮）
- [X] T031 [US1] 在 client/src/components/layout/sidebar-right/mode-toggle.tsx 实现模式切换确认对话框（简洁设计）
- [X] ~~T032 [US1] 在 client/src/hooks/mode/useModeSwitch.ts 在模式切换时取消待处理的云端操作~~ (不需要: 异步操作正常后台运行即可)
- [X] T033 [US1] 网络监控验证（已通过浏览器开发工具验证 Private 模式下零云端请求）
- [X] T034 [US1] 模式切换成功后显示 Alert 通知（使用 useAlert 实现）

**✅ 检查点**: 模式切换功能完全完成！所有任务已完成并验证。

---

## 阶段 5：用户故事 2 - 本地聊天对话（优先级：P2）

**目标**: 实现 Private Mode 下基于 Ollama 的本地大模型对话功能

**独立测试**: 在 Private Mode 下创建新对话，选择本地模型，发送消息并接收流式响应，验证无云端请求

**⚠️ 注意**: 阶段 5-8 依赖 US1 完成 (离线保证必须先实现)

### 用户故事 2 的实现任务

- [X] T035 [P] [US2] 在 client/db/schema-local.ts 创建本地对话模型（扩展 Drizzle schema）
- [X] T036 [P] [US2] 在 client/db/schema-local.ts 创建本地消息模型（扩展 Drizzle schema）
- [X] T037 [P] [US2] 在 client/electron/db/queries/conversations.ts 实现本地对话 CRUD（create, read, update, delete）
- [X] T038 [P] [US2] 在 client/electron/db/queries/messages.ts 实现本地消息 CRUD（create, read, list）
- [X] T039 [US2] 在 client/electron/ipc/conversation-handlers.ts 创建本地对话的 IPC 处理器
- [X] T040 [US2] 在 client/electron/ipc/message-handlers.ts 创建本地消息的 IPC 处理器
- [X] T041 [P] [US2] 在 client/src/hooks/chat/queries/useLocalConversations.ts 创建 useLocalConversations hook（列出对话）
- [X] T042 [P] [US2] 在 client/src/hooks/chat/queries/useLocalMessages.ts 创建 useLocalMessages hook（加载消息）
- [X] T043 [US2] 在 client/src/lib/ollama-client.ts 在 AI SDK 中配置 Ollama provider（连接到 localhost:11434）
- [X] T044 [US2] 在 client/src/hooks/chat/useLocalChatLogic.ts 创建本地模式专用的聊天逻辑（完全独立实现，避免破坏云端功能）
- [X] T045 [US2] 在 client/src/hooks/mode/useLocalModelList.ts 创建 useLocalModelList hook（获取可用的 Ollama 模型）
- [X] T046 [US2] 在 client/src/routes/_authenticated/chat.$chatId.tsx 更新聊天 UI 以显示本地模型选择器（条件渲染）
- [X] T047 [US2] 在 client/src/components/chat/OllamaErrorPrompt.tsx 实现 Ollama 连接错误处理（显示安装/启动指引）
- [X] T048 [US2] 在 client/src/hooks/chat/useLocalChatLogic.ts 添加本地模型的流式响应处理（AI SDK streamText，已集成）

**检查点**: Private Mode 下本地聊天功能完整可用

---

## 阶段 6：用户故事 3 - 本地知识库管理（优先级：P3）

**目标**: 实现 Private Mode 下本地知识库创建、向量化和 RAG 检索

**独立测试**: 在 Private Mode 下创建知识库，上传文档，验证向量化完成，在对话中引用知识库获得增强回答

### 用户故事 3 的实现任务

- [ ] T049 [P] [US3] 在 client/db/schema-local.ts 创建本地知识库模型（扩展 Drizzle schema）
- [ ] T050 [P] [US3] 在 client/db/schema-local.ts 创建本地文档模型（files, chunks, embeddings metadata）
- [ ] T051 [P] [US3] 在 client/electron/db/queries/knowledge-bases.ts 实现知识库 CRUD
- [ ] T052 [US3] 在 client/electron/services/vector-db.ts 设置 LanceDB 连接（初始化向量存储）
- [ ] T053 [US3] 在 client/electron/services/embedder.ts 实现文档嵌入服务（使用 Ollama 嵌入模型）
- [ ] T054 [US3] 在 client/electron/ipc/knowledge-base-handlers.ts 创建文档上传处理器（保存文件、触发嵌入）
- [ ] T055 [US3] 在 client/electron/services/vector-db.ts 实现向量搜索服务（查询 LanceDB）
- [ ] T056 [P] [US3] 在 client/src/hooks/knowledge-base/queries/useLocalKnowledgeBases.ts 创建 useLocalKnowledgeBases hook
- [ ] T057 [P] [US3] 在 client/src/hooks/knowledge-base/queries/useLocalDocuments.ts 创建 useLocalDocuments hook
- [ ] T058 [US3] 在 client/src/hooks/knowledge-base/mutations/useEmbedDocument.ts 创建 useEmbedDocument mutation hook（触发向量化）
- [ ] T059 [US3] 在 client/src/routes/_authenticated/(knowledge-base)/knowledge-base.$knowledgeBaseId.tsx 更新知识库 UI 以在 Private 模式下隐藏分享选项
- [ ] T060 [US3] 在 client/src/hooks/chat/useChatLogic.ts 在聊天流程中实现 RAG 检索（发送消息前查询向量）
- [ ] T061 [US3] 在 client/src/components/knowledge-base/EmbeddingProgress.tsx 添加嵌入进度指示器
- [ ] T062 [US3] 在 client/electron/db/queries/knowledge-bases.ts 处理知识库删除的级联操作（删除文件、向量）
- [ ] T063 [US3] 在 client/src/components/knowledge-base/ModelCompatibilityWarning.tsx 显示嵌入模型缺失时的不兼容模型警告

**检查点**: Private Mode 下本地知识库功能完整可用

---

## 阶段 7：用户故事 4 - 本地模型市场（优先级：P4）

**目标**: 实现 Private Mode 下浏览和下载 Ollama 模型

**独立测试**: 在 Private Mode 下访问市场，浏览模型列表，点击下载，验证模型安装成功并可在对话中使用

### 用户故事 4 的实现任务

- [ ] T064 [P] [US4] 在 client/src/data/ollama-models.ts 创建模型注册表数据源（精选的 Ollama 模型列表）
- [ ] T065 [P] [US4] 在 client/electron/services/ollama-model-manager.ts 实现 Ollama 模型拉取服务（ollama pull API）
- [ ] T066 [US4] 在 client/electron/services/ollama-model-manager.ts 创建模型下载进度追踪器（流式进度事件）
- [ ] T067 [US4] 在 client/electron/ipc/model-handlers.ts 创建模型操作的 IPC 处理器（list, pull, delete）
- [ ] T068 [P] [US4] 在 client/src/hooks/marketplace/queries/useOllamaModels.ts 创建 useOllamaModels hook（列出已安装模型）
- [ ] T069 [P] [US4] 在 client/src/hooks/marketplace/mutations/useModelDownload.ts 创建 useModelDownload mutation hook
- [ ] T070 [US4] 在 client/src/routes/_authenticated/marketplace.tsx 更新 Private 模式下的市场 UI（隐藏 agent 分享，仅显示模型）
- [ ] T071 [US4] 在 client/src/components/marketplace/ModelCard.tsx 创建模型卡片组件（显示大小、描述、下载按钮）
- [ ] T072 [US4] 在 client/src/components/marketplace/ModelDownloadProgress.tsx 实现下载进度 UI（流式进度条）
- [ ] T073 [US4] 在 client/src/components/marketplace/ModelDownloadError.tsx 处理下载失败并提供重试
- [ ] T074 [US4] 在 client/electron/services/ollama-model-manager.ts 在模型下载前添加磁盘空间检查

**检查点**: Private Mode 下本地模型市场功能完整可用

---

## 阶段 8：优化与跨领域关注点

**目的**: 影响多个用户故事的改进

- [ ] T075 [P] 在 client/electron/db/connection.ts 添加数据隔离强制执行（分离 SQLite 文件：rafa-cloud.db, rafa-private.db）
- [ ] T076 [P] 在 client/electron/services/logger.ts 为 Private 模式实现全面的错误日志记录（仅本地日志）
- [ ] T077 [P] 在 client/src/hooks/mode/usePerformanceMonitor.ts 为本地操作添加性能监控（TTFB、向量化速度）
- [ ] T078 在 client/electron/main.ts 通过网络监控验证 Private 模式下零云端请求
- [ ] ~~T079 [P] 在 electron-builder.yml 更新 electron-builder 配置以打包 Ollama 安装程序（extraResources）~~ (已废弃: electron-ollama 自动处理)
- [ ] T080 [P] 在 docs/private-mode-dev.md 创建 Private 模式的开发文档
- [ ] T081 跨所有新服务的代码清理和重构
- [ ] T082 本地数据存储和 IPC 通信的安全审查
- [ ] T083 对所有用户故事运行 quickstart.md 手动验证

---

## 依赖关系与执行顺序

### 阶段依赖

- **初始化（阶段 1）**: 无依赖 - 可立即开始
- **基础层（阶段 2）**: 依赖初始化完成 - 阻塞所有用户故事
- **用户故事 0（阶段 3）**: 依赖基础层 - 阻塞 Private Mode 激活
- **用户故事 1（阶段 4）**: 依赖 US0 完成 - 核心 MVP
- **用户故事 2（阶段 5）**: 依赖 US0 和 US1 完成
- **用户故事 3（阶段 6）**: 依赖 US0、US1 和 US2 完成（RAG 需要聊天功能）
- **用户故事 4（阶段 7）**: 依赖 US0 和 US1 完成（独立于聊天/知识库）
- **优化（阶段 8）**: 依赖所有所需用户故事完成

### 用户故事依赖

- **US0 (P0)**: 阻塞性 - 所有 Private Mode 功能都需要 Ollama
- **US1 (P1)**: 依赖 US0 - 核心模式切换逻辑
- **US2 (P2)**: 依赖 US0 + US1 - 本地聊天需要 Ollama + 模式切换
- **US3 (P3)**: 依赖 US0 + US1 + US2 - RAG 需要聊天功能
- **US4 (P4)**: 依赖 US0 + US1 - 模型下载需要 Ollama + 模式切换

### 每个用户故事内部

- 模型先于服务
- 服务先于 IPC 处理器
- IPC 处理器先于前端 hooks
- Hooks 先于 UI 组件
- 核心实现先于错误处理

### 并行机会

- 所有标记 [P] 的初始化任务可并行运行
- 所有标记 [P] 的基础层任务可并行运行（在阶段 2 内）
- ~~US0 内部：已全部完成（electron-ollama 简化了实现）~~
- US1 内部：模式上下文、UI 组件和功能禁用标记 [P] 的可并行运行
- US2 内部：Schema、IPC、hooks 标记 [P] 的可在集成前并行运行
- US3 内部：Schema、服务、hooks 标记 [P] 的可在集成前并行运行
- US4 内部：数据源、hooks、UI 标记 [P] 的可在集成前并行运行
- US4 可能与 US2/US3 并行运行（不同代码路径）

---

## 并行示例：用户故事 0

```bash
# electron-ollama 方案已大幅简化，大部分任务已完成
# US0 的所有任务已标记为 [X] 完成
```

---

## 实施策略

### MVP 优先（US0 + US1 + US2）

1. 完成阶段 1：初始化
2. 完成阶段 2：基础层（关键 - 阻塞所有故事）
3. 完成阶段 3：US0 - Ollama 自动安装（阻塞性）
4. 完成阶段 4：US1 - 模式切换（核心 MVP）
5. 完成阶段 5：US2 - 本地聊天（主要价值）
6. **停止并验证**: 独立测试完整的本地聊天流程
7. 准备就绪后部署/演示

### 增量交付

1. 初始化 + 基础层 → 基础就绪
2. 添加 US0 → Ollama 自动安装工作 → 可激活 Private Mode
3. 添加 US1 → 模式切换工作 → 可切换模式
4. 添加 US2 → 本地聊天工作 → **MVP 完成！** 部署/演示
5. 添加 US3 → 本地知识库 → 增强功能
6. 添加 US4 → 模型市场 → 完整功能集
7. 每个故事增加价值而不破坏之前的故事

### 并行团队策略

多个开发人员时：

1. 团队一起完成初始化 + 基础层
2. 团队一起完成 US0（阻塞性）
3. US0 + US1 完成后：
   - 开发人员 A：US2（本地聊天）
   - 开发人员 B：US4（模型市场）
   - 开发人员 C：US3（知识库 - 在 US2 基础就绪后开始）
4. 故事独立完成和集成

---

## 注意事项

- [P] 任务 = 不同文件，无依赖
- [Story] 标签将任务映射到特定用户故事以便追溯
- 每个用户故事应独立完成和测试
- 每个任务或逻辑组后提交
- 在任何检查点停止以独立验证故事
- US0 是关键路径 - 所有 Private Mode 功能都依赖于 Ollama 安装工作
- 避免：模糊任务、同一文件冲突、破坏独立性的跨故事依赖
- 数据隔离在 SQLite 文件级别强制执行（rafa-cloud.db vs rafa-private.db）
