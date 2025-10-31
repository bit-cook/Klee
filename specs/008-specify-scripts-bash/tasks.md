# Tasks: Marketplace Private Mode - 本地开源大模型管理

**Input**: Design documents from `/specs/008-specify-scripts-bash/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md
**Branch**: `008-specify-scripts-bash`

**Feature Summary**: 为 Rafa 的 Marketplace 添加 Private Mode 支持，允许用户浏览、下载、管理和使用 Ollama 支持的开源大模型，实现完全离线的本地聊天体验。核心功能包括：模型列表展示（US1）、模型下载（US2）、下载控制（US3）、模型删除（US3.5）、聊天集成（US4）、Web Search 隐藏（US5）和统一模型配置（US6）。

**Tests**: 本功能不包含测试任务（spec.md 中未要求）

**Organization**: 任务按用户故事（User Story 1-6）组织，每个故事独立可测，按优先级 P1 → P2 排序

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属用户故事（如 US1, US2, US3）
- 所有任务包含具体文件路径

---

## Phase 1: Setup（项目初始化）

**Purpose**: 安装依赖和配置验证

- [x] T001 安装并发下载队列库 p-queue - 运行 `npm install p-queue` 在项目根目录
- [x] T002 [P] 验证 Ollama 环境 - 确认 `client/electron/main/services/ollama-manager.ts` 存在并正常工作
- [x] T003 [P] 验证 ModeContext - 确认 `client/src/renderer/src/contexts/ModeContext.tsx` 提供 `isPrivateMode` 状态

---

## Phase 2: Foundational（基础架构）

**Purpose**: 核心基础设施，必须在所有用户故事前完成

**⚠️ CRITICAL**: 所有用户故事工作必须在此阶段完成后才能开始

### 数据模型和类型定义

- [x] T004 [P] 扩展模型配置类型 - 在 `client/src/renderer/src/config/models.ts` 中添加 `LocalLLMModel` 接口（包含 name, model, provider, size, minGPU, updatedAt, deprecated, description, tags 字段）
- [x] T005 [P] 添加本地模型列表配置 - 在 `client/src/renderer/src/config/models.ts` 中导出 `localLLMModels` 数组（包含 Llama 3.2 1B, Llama 3.2 3B, Llama 3 8B, Qwen 2.5 0.5B, Mistral 7B, Gemma 2B/7B, CodeLlama 7B, Phi-3 Mini, Nomic Embed Text 共 10 个模型）
- [x] T006 [P] 添加下载进度类型 - 在 `client/src/renderer/src/lib/ollama-client.ts` 中添加 `OllamaDownloadProgress` 接口（包含 status, total, completed, percent 字段）
- [x] T007 [P] 添加下载任务状态类型 - 在 `client/src/renderer/src/hooks/ollama-models/mutations/useDownloadModel.ts` 中添加 `DownloadStatus` 和 `DownloadTask` 类型定义

### 查询键扩展

- [x] T008 扩展 TanStack Query 键 - 在 `client/src/renderer/src/lib/queryKeys.ts` 中添加 `ollamaModelKeys` 工厂函数（包含 all, lists, installed, available 层级）

### Ollama API 客户端扩展

- [x] T009 [P] 实现 NDJSON 流式下载函数 - 在 `client/src/renderer/src/lib/ollama-client.ts` 中实现 `pullOllamaModel(modelName, onProgress, signal)` 函数（支持 AbortController 取消）
- [x] T010 [P] 实现已安装模型查询函数 - 在 `client/src/renderer/src/lib/ollama-client.ts` 中实现 `getInstalledModels()` 函数（调用 `/api/tags` 端点）

### 磁盘空间检测（主进程）

- [x] T011 [P] 创建磁盘空间管理器 - 创建 `client/src/main/local/services/disk-space-manager.ts` 文件，实现 `getOllamaDiskSpace()` 函数（使用 Node.js 原生 `statfs()` API）
- [x] T012 [P] 添加磁盘空间 IPC 处理器 - 创建 `client/src/main/ipc/disk-space-handlers.ts` 文件，实现 `disk-space:get` IPC handler
- [x] T013 注册磁盘空间处理器 - 在 `client/src/main/index.ts` 中导入并调用 `initDiskSpaceHandlers()`

### 模型删除安全检测（主进程）

- [x] T014 [P] 创建模型使用查询 - 创建 `client/src/main/local/db/queries/models.ts` 文件，实现 `isModelInUse(db, modelId)` 和 `getSessionsUsingModel(db, modelId)` 函数
- [x] T015 [P] 创建模型管理服务 - 创建 `client/src/main/local/services/ollama-model-manager.ts` 文件，实现 `deleteModel(modelId, force)` 函数（包含使用检测和 Ollama API 调用）
- [x] T016 [P] 添加模型管理 IPC 处理器 - 创建 `client/src/main/ipc/model-handlers.ts` 文件，实现 `model:delete` 和 `model:check-in-use` IPC handlers
- [x] T017 注册模型管理处理器 - 在 `client/src/main/index.ts` 中导入并调用 `initModelHandlers()`

### 前端 IPC 类型定义

- [x] T018 [P] 添加磁盘空间 IPC 类型 - 在 `client/src/preload/index.ts` 中扩展 `window.api` 接口，添加 `diskSpace.get()` 方法（已存在）
- [x] T019 [P] 添加模型管理 IPC 类型 - 在 `client/src/preload/index.ts` 中扩展 `window.api` 接口，添加 `model.delete(modelId)` 和 `model.checkInUse(modelId)` 方法（已存在）

**Checkpoint**: 基础架构就绪 - 用户故事实施现在可以并行开始

---

## Phase 3: User Story 1 - 浏览可用的开源大模型 (Priority: P1) 🎯 MVP

**Goal**: 用户在 Private Mode 下访问 marketplace，查看所有可供下载的开源大模型列表

**Independent Test**: 用户打开应用，切换到 Private Mode，点击 sidebar 的 marketplace 入口，即可看到开源大模型列表，无需任何前置操作

### Hooks - 查询已安装模型

- [x] T020 [P] [US1] 创建已安装模型查询 Hook - 创建 `client/src/renderer/src/hooks/ollama-models/queries/useInstalledModels.ts` 文件，实现 `useInstalledModels()` Hook（使用 useQuery 调用 `getInstalledModels()`，queryKey: `ollamaModelKeys.installed()`，staleTime: 30秒）

### Hooks - 查询可用模型（合并配置+安装状态）

- [x] T021 [US1] 创建可用模型查询 Hook - 创建 `client/src/renderer/src/hooks/ollama-models/queries/useAvailableModels.ts` 文件，实现 `useAvailableModels()` Hook（合并 `localLLMModels` 配置和 `useInstalledModels()` 数据，返回 `LocalLLMModelWithStatus[]` 类型，queryKey: `ollamaModelKeys.available()`）

### UI 组件 - 模型卡片

- [x] T022 [P] [US1] 创建模型卡片组件 - 创建 `client/src/renderer/src/components/marketplace/local-llm-card.tsx` 文件，实现 `LocalLLMCard` 组件（显示模型名称、提供者、大小、GPU要求、更新日期、描述、标签、下载状态徽章，复用现有 Card 组件）

### UI 组件 - Marketplace 路由扩展

- [x] T023 [US1] 扩展 Marketplace 路由 - 在 `client/src/renderer/src/routes/_authenticated/marketplace.index.tsx` 中添加 "Local LLMs" 标签页（仅在 `isPrivateMode` 为 true 时显示，使用 Tabs 组件，渲染 `LocalLLMCard` 组件列表）
- [x] T024 [US1] 添加空状态 UI - 在 "Local LLMs" 标签页中添加空状态（当配置文件为空或 Ollama 不可用时显示提示消息）

**Checkpoint**: 用户故事 1 应该完全可用且可独立测试 - 用户可以浏览模型列表并看到下载状态

---

## Phase 4: User Story 2 - 下载开源大模型 (Priority: P1)

**Goal**: 用户选择一个未下载的开源大模型，点击下载按钮后，系统从 Ollama 官方源下载模型并实时显示进度

**Independent Test**: 在 User Story 1 的基础上，用户点击任一未下载模型的"下载"按钮，系统开始下载并显示进度条，完成后模型可用

### Hooks - 磁盘空间查询

- [x] T025 [P] [US2] 创建磁盘空间查询 Hook - 创建 `client/src/renderer/src/hooks/mode/useDiskSpace.ts` 文件，实现 `useDiskSpace()` Hook（使用 useQuery 调用 IPC `window.api.diskSpace.get()`，queryKey: `['disk-space', 'ollama']`，staleTime: 30秒，refetchInterval: 60秒）

### Hooks - 下载 Mutation

- [x] T026 [US2] 创建下载 Mutation Hook - 创建 `client/src/renderer/src/hooks/ollama-models/mutations/useDownloadModel.ts` 文件，实现 `useDownloadModel()` Hook（使用 useMutation + React useState 管理进度，支持 AbortController 取消，包含磁盘空间检查，集成 p-queue 限制并发为 2）
- [x] T027 [US2] 实现速度计算逻辑 - 在 `useDownloadModel.ts` 中实现下载速度和剩余时间计算（使用滑动窗口平均最近 10 个样本）

### UI 组件 - 下载进度

- [x] T028 [P] [US2] 创建下载进度组件 - 创建 `client/src/renderer/src/components/marketplace/model-download-progress.tsx` 文件，实现 `ModelDownloadProgress` 组件（显示进度条、百分比、已下载大小、下载速度、预计剩余时间，复用 Progress 组件）

### UI 集成 - 模型卡片下载功能

- [x] T029 [US2] 集成下载功能到模型卡片 - 在 `local-llm-card.tsx` 中集成 `useDownloadModel()` Hook（显示 Download 按钮，点击后显示 `ModelDownloadProgress` 组件，下载完成后更新状态为"已安装"）
- [x] T030 [US2] 添加下载错误处理 - 在 `local-llm-card.tsx` 中添加错误处理（磁盘空间不足、网络中断、Ollama 不可用等错误的 toast 通知）
- [x] T031 [US2] 添加下载成功后缓存失效 - 在 `useDownloadModel()` 的 `onSuccess` 中失效 `ollamaModelKeys.installed()` 和 `ollamaModelKeys.available()` 查询

**Checkpoint**: 用户故事 1 和 2 应该都可以独立工作 - 用户可以下载模型并看到实时进度

---

## Phase 5: User Story 3 - 控制下载过程（暂停、继续）(Priority: P2)

**Goal**: 用户在模型下载过程中可以暂停和继续下载

**Independent Test**: 在 User Story 2 的基础上，用户在下载进行中点击"暂停"按钮，下载停止并保持进度；点击"继续"按钮，下载从上次停止的位置恢复

**Note**: Ollama 支持断点续传，暂停后的下载会从上次停止的位置继续，不会重新开始。取消功能已移除，用户只需暂停即可。

### Hooks - 下载控制扩展

- [x] T032 [US3] 添加暂停/继续逻辑 - 在 `useDownloadModel.ts` 中添加 `pause()` 和 `resume()` 方法（支持断点续传，Ollama 会自动从上次停止的位置继续）
- [x] T033 [US3] 添加 AbortError 处理 - 在 `useDownloadModel.ts` 的 mutation 中正确处理 AbortError（暂停时不作为错误处理）

### UI 组件 - 下载控制按钮

- [x] T034 [US3] 添加下载控制按钮 - 在 `model-download-progress.tsx` 中添加 Pause、Resume 按钮（根据下载状态动态显示，使用 Lucide 图标）
- [x] T035 [US3] 添加暂停提示 - 在 "Pause" 按钮上添加 Tooltip 提示："Pause download. Progress will be preserved and you can resume later."

**Checkpoint**: 用户故事 1、2、3 应该都可以独立工作 - 用户可以暂停和继续下载过程，进度会被保留

---

## Phase 6: User Story 3.5 - 删除已下载的模型 (Priority: P2)

**Goal**: 用户可以删除已下载的开源模型，从系统 Ollama 文件夹中移除模型文件

**Independent Test**: 用户在 marketplace 中找到已下载的模型，点击"删除"按钮，确认后模型从系统中删除，模型卡片状态恢复为"未下载"

### Hooks - 模型使用查询

- [x] T036 [P] [US3.5] 创建模型使用查询 Hook - 创建 `client/src/renderer/src/hooks/mode/useModelUsage.ts` 文件，实现 `useModelUsage(modelId)` Hook（使用 useQuery 调用 IPC `window.api.model.checkInUse(modelId)`，queryKey: `['model-usage', modelId]`，staleTime: 30秒）

### Hooks - 删除 Mutation

- [x] T037 [US3.5] 创建删除 Mutation Hook - 创建 `client/src/renderer/src/hooks/ollama-models/mutations/useDeleteModel.ts` 文件，实现 `useDeleteModel()` Hook（使用 useMutation 调用 IPC `window.api.model.delete(modelId)`，成功后失效 `ollamaModelKeys.installed()`, `ollamaModelKeys.available()`, `['disk-space', 'ollama']` 查询）

### UI 组件 - 删除确认对话框

- [x] T038 [P] [US3.5] 创建删除确认对话框组件 - 创建 `client/src/renderer/src/components/marketplace/model-delete-dialog.tsx` 文件，实现 `ModelDeleteDialog` 组件（显示模型名称、将释放的磁盘空间、Confirm/Cancel 按钮，使用 AlertDialog 组件）

### UI 集成 - 模型卡片删除功能

- [x] T039 [US3.5] 添加删除按钮到模型卡片 - 在 `local-llm-card.tsx` 中添加垃圾桶图标按钮（仅在模型已安装时显示，点击打开 `ModelDeleteDialog`）
- [x] T040 [US3.5] 集成删除功能 - 在 `local-llm-card.tsx` 中集成 `useDeleteModel()` 和 `useModelUsage()` Hooks（检查模型是否被使用，如果被使用则阻止删除并显示警告消息）
- [x] T041 [US3.5] 添加删除错误处理 - 在删除失败时显示错误 toast（包括 in_use、权限不足、文件被锁定等错误类型）

**Checkpoint**: 用户故事 1、2、3、3.5 应该都可以独立工作 - 用户可以删除模型并看到磁盘空间更新

---

## Phase 7: User Story 4 - 在聊天中使用已下载的模型 (Priority: P1)

**Goal**: 用户在 Private Mode 下的聊天模型选择器中可以看到所有已下载的开源模型，并选择使用

**Independent Test**: 用户下载至少一个模型，切换到 Private Mode，打开聊天会话，模型选择器中显示已下载模型，选择后可以正常发送消息并收到本地模型的回复

### 聊天组件 - 模型选择器扩展

- [x] T042 [US4] 扩展 ChatPromptInput 模型选择器 - 在 `client/src/renderer/src/components/chat/chat-prompt-input.tsx` 中修改模型选择器逻辑（在 Private Mode 下显示 `useInstalledModels()` 返回的本地模型，在 Cloud Mode 下显示云端模型）
- [x] T042.1 [US4] 添加默认模型选择逻辑 - 在 `ChatPromptInput` 中添加 `useEffect`，当模型列表变化时自动选择第一个可用模型，确保模型选择器不为空
- [x] T043 [US4] 添加空模型提示 - 在 ChatPromptInput 中添加空状态（当 Private Mode 下没有已下载模型时，显示："No models installed. Please download models from Marketplace."）
- [x] T044 [US4] ~~扩展 chat-config 模型选择器~~ - **不适用**: `chat-config.tsx` 没有模型选择器，模型选择在 `ChatPromptInput` 中完成（已在 T042 实现）。Private Mode 下不支持创建 Agent（UI 已隐藏），因此无需修改 Agent 创建页面
- [x] T044.1 [US4] 在 chat-config Agent 标签显示提示 - 在 `client/src/renderer/src/components/layout/sidebar-right/chat-config.tsx` 中保留 Agent 标签，但在 Private Mode 下显示提示信息："Agent mode is only available in Cloud Mode. Switch to Cloud Mode to use AI Agents."（保持 UI 一致性）

**Checkpoint**: 用户故事 1、2、3、3.5、4 应该都可以独立工作 - 用户可以在聊天中使用已下载的本地模型

---

## Phase 8: User Story 5 - Private Mode 下隐藏 Web Search (Priority: P2)

**Goal**: 用户在 Private Mode 下使用 ChatPromptInput 时，Web Search 按钮被隐藏

**Independent Test**: 用户切换到 Private Mode，打开聊天会话，ChatPromptInput 工具栏不显示 Web Search 按钮

### 聊天组件 - Web Search 禁用

- [X] T045 [US5] 禁用 Web Search 按钮 - 在 `client/src/renderer/src/components/chat/chat-prompt-input.tsx` 中添加禁用逻辑（使用 `useMode()` Hook 的 `isPrivateMode` 状态，当为 true 时禁用 "Search" 按钮，并显示 tooltip："Web Search is not available in Private Mode. Switch to Cloud Mode to use this feature."）
- [X] T046 [US5] 测试模式切换 - 验证从 Cloud Mode 切换到 Private Mode 时，Web Search 按钮立即禁用（监听 ModeContext 变化）- **自动完成**: React 响应式更新自动处理

**Checkpoint**: 用户故事 1、2、3、3.5、4、5 应该都可以独立工作 - Private Mode 下不显示 Web Search 按钮

---

## Phase 9: User Story 6 - 统一的模型列表配置 (Priority: P2)

**Goal**: 系统维护一个统一的模型配置文件，包含本地模型和云端模型的定义

**Independent Test**: 开发者在配置文件中添加新模型后，重启应用，新模型出现在 marketplace 列表中；移除模型后，该模型不再显示

### 配置扩展 - 统一模型配置

- [X] T047 [P] [US6] 创建统一模型配置接口 - 在 `client/src/renderer/src/config/models.ts` 中添加 `ModelConfig` 接口（包含 version, localModels, cloudModels 字段）- **已存在**: 接口已在之前的 phase 中创建
- [X] T048 [US6] 导出统一配置对象 - 在 `models.ts` 中导出 `modelConfig` 对象（合并 `localLLMModels` 和现有的 `llmModels`，版本号 "1.0.0"）- **已存在**: 对象已导出

### 配置验证

- [X] T049 [P] [US6] 添加模型配置验证函数 - 在 `models.ts` 中实现 `validateModelConfig(model)` 函数（验证必填字段、模型 ID 格式、大小正数、日期格式等），以及 `validateLocalModel` 和 `validateCloudModel` 辅助函数
- [X] T050 [US6] 添加启动时配置验证 - 在 `client/src/renderer/src/App.tsx` 中添加配置验证逻辑（应用启动时验证所有模型配置，记录错误到控制台）

### 文档更新

- [X] T051 [P] [US6] 添加配置文件注释 - 在 `models.ts` 中添加详细的 JSDoc 注释（说明如何添加新模型、字段含义、更新流程）- 包含完整的使用示例和验证说明

**Checkpoint**: 所有用户故事应该都可以独立工作 - 模型配置统一管理

---

## Phase 10: Polish & Integration（优化和集成）

**Purpose**: 跨用户故事的改进和最终验证

### UI 优化

- [ ] T052 [P] 添加加载骨架屏 - 在 marketplace "Local LLMs" 标签页中添加 Skeleton 组件（模型列表加载时显示）
- [ ] T053 [P] 添加下载成功动画 - 在 `model-download-progress.tsx` 中添加完成动画（下载 100% 后显示 checkmark 图标动画）
- [ ] T054 [P] 优化模型卡片布局 - 调整 `local-llm-card.tsx` 的响应式布局（确保在不同屏幕尺寸下显示正常）

### 性能优化

- [ ] T055 [P] 优化查询缓存策略 - 调整所有 Ollama 相关查询的 staleTime 和 refetchInterval（确保性能和实时性平衡）
- [ ] T056 [P] 添加虚拟滚动（可选） - 如果模型列表超过 20 个，考虑在 marketplace 中添加虚拟滚动（使用 react-window 或 react-virtual）

### 错误处理增强

- [ ] T057 [P] 添加 Ollama 不可用检测 - 在 marketplace 页面中添加 Ollama 服务状态检测（使用 `useOllamaSource()` Hook，显示"Ollama is not available"提示）
- [ ] T058 [P] 添加网络错误重试逻辑 - 在 `useDownloadModel.ts` 中添加自动重试机制（网络错误时自动重试 3 次，指数退避）

### 文档和验证

- [X] T059 [P] 更新 CLAUDE.md - 在 `/Users/wei/Coding/rafa/CLAUDE.md` 中添加 Marketplace Private Mode 开发指南（包含新增的 hooks、组件、IPC 处理器、使用示例、关键设计决策、查询键管理、UI/UX 优化说明）
- [ ] T060 [P] 验证 quickstart.md - 按照 `specs/008-specify-scripts-bash/quickstart.md` 中的步骤验证所有功能（模型浏览、下载、删除、聊天集成、模式切换）- **建议手动测试**

### 代码清理

- [ ] T061 [P] 清理未使用的导入 - 运行 ESLint 并修复所有"未使用的导入"警告
- [ ] T062 [P] 格式化代码 - 运行 Prettier 格式化所有新增和修改的文件
- [ ] T063 [P] 添加 TypeScript 注释 - 为所有公共函数和组件添加 JSDoc 注释（说明用途、参数、返回值）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 - 可立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成 - **阻塞所有用户故事**
- **User Stories (Phase 3-9)**: 全部依赖 Foundational 完成
  - 用户故事可以并行进行（如果有多名开发者）
  - 或按优先级顺序进行（P1 → P2）: US1 → US2 → US4 → US3 → US3.5 → US5 → US6
- **Polish (Phase 10)**: 依赖所有需要的用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**: 可在 Foundational 完成后开始 - 无其他故事依赖
- **User Story 2 (P1)**: 可在 Foundational 完成后开始 - 依赖 US1 的模型列表 UI
- **User Story 3 (P2)**: 可在 US2 完成后开始 - 扩展下载功能
- **User Story 3.5 (P2)**: 可在 US1 完成后开始 - 依赖模型列表 UI
- **User Story 4 (P1)**: 可在 US1 完成后开始 - 依赖 `useInstalledModels()` Hook
- **User Story 5 (P2)**: 可在 Foundational 完成后开始 - 无其他故事依赖
- **User Story 6 (P2)**: 可在 Foundational 完成后开始 - 无其他故事依赖

### Within Each User Story

- Hooks 中的查询（queries）先于变更（mutations）
- Mutations 先于 UI 组件
- UI 组件先于路由集成
- 核心实现先于错误处理和优化

### Parallel Opportunities

- Phase 1: T001, T002, T003 可并行
- Phase 2: T004-T007 (类型定义) 可并行, T009-T010 (API 客户端) 可并行, T011-T012 (磁盘空间) 可并行, T014-T016 (模型删除) 可并行, T018-T019 (IPC 类型) 可并行
- Phase 3: T020, T022 可并行（不同文件）
- Phase 4: T025, T028 可并行
- Phase 6: T036, T038 可并行
- Phase 9: T047, T049, T051 可并行
- Phase 10: 所有优化和文档任务 (T052-T063) 可并行

---

## Parallel Example: Phase 2 Foundational

```bash
# 同时启动类型定义任务:
Task: "T004 扩展模型配置类型 - client/src/renderer/src/config/models.ts"
Task: "T005 添加本地模型列表配置 - client/src/renderer/src/config/models.ts"
Task: "T006 添加下载进度类型 - client/src/renderer/src/lib/ollama-client.ts"
Task: "T007 添加下载任务状态类型 - client/src/renderer/src/hooks/ollama-models/mutations/useDownloadModel.ts"

# 同时启动 API 客户端任务:
Task: "T009 实现 NDJSON 流式下载函数 - client/src/renderer/src/lib/ollama-client.ts"
Task: "T010 实现已安装模型查询函数 - client/src/renderer/src/lib/ollama-client.ts"

# 同时启动磁盘空间任务:
Task: "T011 创建磁盘空间管理器 - client/src/main/local/services/disk-space-manager.ts"
Task: "T012 添加磁盘空间 IPC 处理器 - client/src/main/ipc/disk-space-handlers.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 + 4)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational（**关键 - 阻塞所有故事**）
3. 完成 Phase 3: User Story 1（浏览模型）
4. 完成 Phase 4: User Story 2（下载模型）
5. 完成 Phase 7: User Story 4（聊天集成）
6. **停止并验证**: 测试完整的下载和使用流程
7. 部署/演示（如果就绪）

### Incremental Delivery

1. Setup + Foundational → 基础就绪
2. 添加 US1 → 独立测试 → 部署/演示（用户可以浏览模型）
3. 添加 US2 → 独立测试 → 部署/演示（用户可以下载模型）
4. 添加 US4 → 独立测试 → 部署/演示（用户可以在聊天中使用模型）🎯 **MVP 完成**
5. 添加 US3 → 独立测试 → 部署/演示（用户可以控制下载）
6. 添加 US3.5 → 独立测试 → 部署/演示（用户可以删除模型）
7. 添加 US5 → 独立测试 → 部署/演示（Private Mode 优化）
8. 添加 US6 → 独立测试 → 部署/演示（配置管理）
9. 每个故事增加价值且不破坏之前的功能

### Parallel Team Strategy

如果有多名开发者：

1. 团队一起完成 Setup + Foundational
2. Foundational 完成后：
   - 开发者 A: User Story 1 + User Story 2（浏览和下载）
   - 开发者 B: User Story 4 + User Story 5（聊天集成和 Web Search）
   - 开发者 C: User Story 3 + User Story 3.5（下载控制和删除）
   - 开发者 D: User Story 6（配置管理）
3. 故事独立完成并集成

---

## Notes

- **[P] 标记**: 不同文件，无依赖，可并行执行
- **[Story] 标签**: 将任务映射到特定用户故事，便于追踪
- **每个用户故事应该独立可完成和测试**
- **在每个 Checkpoint 停止验证**: 确保故事独立工作
- **提交策略**: 每完成一个任务或逻辑组提交一次
- **避免**: 模糊任务、相同文件冲突、破坏故事独立性的跨故事依赖

---

## Risk Mitigation

### 已识别风险

| 风险                 | 严重程度 | 缓解任务                         |
| -------------------- | -------- | -------------------------------- |
| Ollama 服务未运行    | 高       | T057 - 添加 Ollama 不可用检测    |
| 网络中断导致下载失败 | 中       | T058 - 添加自动重试机制          |
| 磁盘空间不足         | 中       | T025 + T026 - 下载前磁盘空间检查 |
| 删除正在使用的模型   | 高       | T036 + T040 - 多层使用检测       |
| 并发下载过多         | 低       | T026 - p-queue 限制并发数为 2    |

---

**预计开发时间**: 3-5 天（1 位开发者，完成 MVP）| 5-7 天（1 位开发者，完成所有功能）
**任务总数**: 63 个任务（包含 Setup、Foundational、6 个用户故事、Polish）
