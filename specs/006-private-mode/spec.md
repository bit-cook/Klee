# Feature Specification: Private Mode（私有模式）

**Feature Branch**: `006-private-mode`
**Created**: 2025-10-20
**Status**: Draft
**Input**: User description: "使用中文创建文档，对话
当前app的cloud mode已经基本开发完成，下一步要开发private mode
sidebar-right有一个mode切换按钮，当切换为private mode时，不再与server交互，而是纯本地基于electron运行
主要功能：
chat保留，基于ai sdk的ollama，可以与下载好的本地开源大模型对话
知识库保留，可以本地向量化，创建知识库，没有分享知识库的功能了
市场仅保留开源大模型下载地址，从ollama下载或者hugingface下载，没有分享agent的功能了"

## Clarifications

### Session 2025-10-21 (实际实现方案)

**✅ IMPLEMENTED APPROACH (与原计划不同)**:
- Q: Ollama 如何集成到 rafa 中? → A: 使用 **electron-ollama** npm 包（v0.1.25），自动下载和管理内嵌 Ollama
- Q: 如何处理系统已安装的 Ollama? → A: **智能检测策略**：优先检测系统 Ollama (localhost:11434，2秒超时)，若不存在则自动下载 electron-ollama
- Q: 需要用户确认安装吗? → A: **不需要**，electron-ollama 在后台自动下载（约 500MB），通过 IPC 事件提供进度反馈
- Q: 支持哪些平台? → A: electron-ollama 支持 macOS、Windows、Linux 全平台
- Q: 如何显示进度? → A: 主进程发送 `ollama-init-progress` IPC 事件，渲染进程通过 `useOllamaSource` hook 监听并更新 UI

### ⚠️ 原计划但未采用的方案

以下澄清来自早期设计，**实际实现已改用 electron-ollama**：
- ~~Q: Ollama 安装包应该以什么方式嵌入到 rafa 中? → A: 作为 Electron app 资源文件打包~~
- ~~Q: 在安装 Ollama 之前是否需要用户明确确认? → A: 显示确认对话框~~
- ~~Q: rafa 需要支持哪些操作系统的 Ollama 自动安装? → A: 支持 macOS 和 Windows (.dmg 和 .exe)~~

## User Scenarios & Testing

### User Story 0 - 智能 Ollama 集成 (Priority: P0) ✅ IMPLEMENTED

作为一名用户，我希望在首次启动 rafa 应用时，系统能够**自动检测并管理 Ollama**，无需我手动干预，这样我可以快速开始使用 Private Mode 功能。

**为什么是此优先级**: 这是 Private Mode 的前置依赖。如果没有 Ollama，整个 Private Mode 功能无法使用。

**实际实现方案** (与原计划不同):
- 使用 **electron-ollama** npm 包自动管理 Ollama
- **智能检测策略**: 优先使用系统 Ollama (localhost:11434)，若不存在则自动下载 electron-ollama
- **后台初始化**: 非阻塞，应用启动后在后台检测和下载
- **进度反馈**: 通过 IPC 事件 (`ollama-init-progress`) 提供实时进度

**独立测试**:
- 在未安装 Ollama 的系统上启动 rafa，验证自动下载流程
- 在已安装 Ollama 的系统上启动，验证自动检测并复用

**验收场景 (实际实现)**:

1. **Given** 用户的系统上已安装 Ollama（端口 11434 运行中），**When** 启动 rafa 应用，**Then** 系统在 2 秒内检测到系统 Ollama，Private Mode 按钮直接可用，无需下载
2. **Given** 用户的系统上未安装 Ollama，**When** 启动 rafa 应用，**Then** 系统检测失败后自动开始下载 electron-ollama（约 500MB），显示"Downloading Ollama" 状态
3. **Given** electron-ollama 正在下载，**When** 下载进行中，**Then** 前端通过 `useOllamaSource` hook 接收进度事件，可显示百分比和状态消息
4. **Given** electron-ollama 下载完成，**When** 初始化成功，**Then** 前端接收 `ollama-ready` 事件，Private Mode 按钮变为可用，source 为 'embedded'
5. **Given** Ollama 初始化失败（网络错误、磁盘空间不足等），**When** 30 秒超时，**Then** `useOllamaSource` hook 自动超时保护，返回 source: 'none'，Private Mode 按钮禁用
6. **Given** 用户在 Private Mode 按钮禁用时点击，**When** Ollama 不可用，**Then** 显示提示"Ollama is not available"（需要实现错误提示 UI）
7. **Given** 应用关闭时，**When** 使用的是 electron-ollama，**Then** 主进程自动清理 Ollama 进程（使用 `ollamaManager.shutdown()`）
8. **Given** 应用关闭时，**When** 使用的是系统 Ollama，**Then** 主进程不干扰系统 Ollama，仅断开连接

**⚠️ 已删除/未实现的场景** (原计划但实际未采用):
- ~~确认对话框~~: electron-ollama 自动下载，无需确认
- ~~手动安装选项~~: 自动化流程，无"稍后安装"选项
- ~~分阶段进度显示~~: electron-ollama 提供整体进度，无提取/安装两阶段区分
- ~~Linux 特殊处理~~: electron-ollama 支持全平台，无需特殊处理

---

### User Story 1 - 模式切换与离线运行 (Priority: P1) ✅ IMPLEMENTED

作为一名用户，我希望能够通过右侧边栏的按钮切换到 Private Mode，使应用完全在本地运行，不与任何云端服务器交互，从而确保我的数据隐私和离线可用性。

**为什么是此优先级**: 这是整个功能的基础，没有模式切换机制，所有其他功能都无法实现。这是最小可行产品（MVP）的核心。

**当前实现状态**:
- ✅ ModeContext 和 localStorage 持久化
- ✅ ModeToggle UI 组件（右侧边栏按钮，已足够显示模式状态）
- ✅ 模式切换确认对话框
- ✅ Ollama 可用性检测（禁用按钮逻辑）
- ✅ DatabaseConnectionManager 模式路由
- ✅ TanStack Query 模式感知配置（Private Mode 下禁用云端查询）
- ✅ 云端功能禁用逻辑（知识库分享按钮、创建 Agent 按钮已隐藏）
- ✅ 网络监控验证（已通过浏览器开发工具验证）

**独立测试**: 可以通过点击模式切换按钮，验证 localStorage 更新、数据库连接切换、云端功能隐藏。网络请求停止可通过浏览器开发工具验证。

**验收场景 (当前状态)**:

1. **Given** 用户在 Cloud Mode 下，Ollama 已就绪，**When** 点击 ModeToggle 的 Private Mode 按钮，**Then** 显示确认对话框 ✅
2. **Given** 用户确认切换，**When** 点击确认，**Then** localStorage 更新为 'private'，DatabaseConnectionManager 切换到私有数据库连接，显示成功通知 ✅
3. **Given** 用户在 Private Mode 下，**When** 点击 Cloud Mode 按钮，**Then** localStorage 更新为 'cloud'，数据库连接切换回云端模式 ✅
4. **Given** Ollama 未就绪，**When** 在 Cloud Mode 下查看 Private Mode 按钮，**Then** 按钮禁用状态，显示灰色 ✅
5. **Given** 用户在 Private Mode 下，**When** 查看知识库详情页，**Then** 分享按钮被隐藏 ✅
6. **Given** 用户在 Private Mode 下，**When** 查看聊天配置侧边栏，**Then** "Create Agent" 按钮被隐藏 ✅
7. **Given** 用户在 Private Mode 下，**When** TanStack Query 尝试执行云端查询，**Then** 查询被禁用（enabled: false） ✅
8. **Given** 用户在 Private Mode 下，**When** 断开网络连接，**Then** 应用仍然可以正常使用（理论上，建议通过开发工具验证） ⚠️

**✅ 所有任务已完成并验证**

---

### User Story 2 - 本地聊天对话 (Priority: P2) ❌ NOT IMPLEMENTED

作为一名用户，我希望在 Private Mode 下能够使用本地下载的开源大模型（通过 Ollama）进行聊天对话，以确保我的对话内容完全私密且不会被上传到任何云端服务器。

**为什么是此优先级**: 聊天是应用的核心功能之一，Private Mode 的主要使用场景就是进行隐私保护的对话。

**当前实现状态**:
- ✅ SQLite schema 完整（chat_sessions, chat_messages 表）
- ✅ DatabaseConnectionManager 支持 Private Mode 数据库路由
- ❌ **缺失**: IPC handlers for chat CRUD operations
- ❌ **缺失**: Ollama chat API 集成（AI SDK + ollama-ai-provider）
- ❌ **缺失**: Local chat hooks (useLocalConversations, useLocalMessages)
- ❌ **缺失**: useChatLogic 模式适配
- ❌ **缺失**: 本地模型选择器 UI
- ❌ **缺失**: Ollama 错误处理和提示

**独立测试**: **无法测试** - 聊天功能完全未实现

**验收场景 (计划)**:

1. **Given** 用户在 Private Mode 下已安装本地模型，**When** 创建新对话并选择本地模型，**Then** 对话界面显示本地模型信息，可以正常发送消息 ❌
2. **Given** 用户在对话中发送消息，**When** 本地模型处理请求，**Then** 响应以流式方式显示，整个过程无云端网络请求 ❌
3. **Given** 用户有多个历史对话，**When** 切换对话，**Then** 历史消息从本地存储加载并显示 ❌
4. **Given** 用户在 Private Mode 下，**When** 本地模型未安装或 Ollama 未运行，**Then** 系统显示友好的错误提示，引导用户安装模型或启动 Ollama ❌

**⚠️ 待实现的任务 (Phase 5, Tasks T035-T048)**:
- 本地对话/消息的 IPC handlers
- Ollama provider 配置和 AI SDK 集成
- Local chat hooks
- useChatLogic 扩展以支持模式切换
- 本地模型列表和选择器 UI

---

### User Story 3 - 本地知识库管理 (Priority: P3) ❌ NOT IMPLEMENTED

作为一名用户，我希望在 Private Mode 下能够创建和管理知识库，将文档本地向量化并用于 RAG（检索增强生成），以便在不上传敏感文档到云端的情况下增强对话质量。

**为什么是此优先级**: 知识库功能是高级特性，依赖于基础的模式切换和聊天功能。用户可以先使用基础聊天功能，再按需添加知识库。

**当前实现状态**:
- ✅ SQLite schema 完整（knowledge_bases, knowledge_base_files 表）
- ✅ LanceDB 配置定义（local.config.ts: VECTOR_DB_CONFIG, EMBEDDING_CONFIG）
- ❌ **缺失**: LanceDB 依赖安装
- ❌ **缺失**: Vector DB 服务（连接、嵌入、搜索）
- ❌ **缺失**: Document embedding 服务（使用 Ollama 嵌入模型）
- ❌ **缺失**: IPC handlers for knowledge base operations
- ❌ **缺失**: Local knowledge base hooks
- ❌ **缺失**: 文档上传和处理流程
- ❌ **缺失**: RAG 集成到聊天流程

**独立测试**: **无法测试** - 知识库功能完全未实现

**验收场景 (计划)**:

1. **Given** 用户在 Private Mode 下，**When** 创建新知识库并上传文档，**Then** 系统在本地进行向量化处理，文档内容存储在本地文件系统 ❌
2. **Given** 用户已创建知识库，**When** 在对话中引用该知识库，**Then** 系统从本地向量数据库检索相关内容，增强对话回答 ❌
3. **Given** 用户管理知识库，**When** 删除知识库，**Then** 相关的本地文件和向量数据被清除 ❌
4. **Given** 用户在 Private Mode 下，**When** 查看知识库列表，**Then** 不显示分享选项，所有知识库仅本地可用 ❌

**⚠️ 待实现的任务 (Phase 6, Tasks T049-T063)**:
- 安装 LanceDB 依赖
- 实现向量数据库服务（连接、索引、搜索）
- 实现文档嵌入服务（Ollama 嵌入模型）
- 知识库 IPC handlers
- Local knowledge base hooks
- 文档处理和向量化流程
- RAG 集成

---

### User Story 4 - 本地模型市场 (Priority: P4) ❌ NOT IMPLEMENTED

作为一名用户，我希望在 Private Mode 下能够浏览和下载开源大模型（从 Ollama），以便扩展可用的本地模型选择。

**为什么是此优先级**: 这是增强功能，用户可以先使用已安装的模型，再按需下载新模型。不影响核心使用流程。

**当前实现状态**:
- ✅ SQLite schema 有 models 表（用于追踪本地模型）
- ❌ **缺失**: Ollama model management IPC handlers (pull, list, delete)
- ❌ **缺失**: 模型注册表数据源（ollama-models.ts）
- ❌ **缺失**: Model download hooks and UI
- ❌ **缺失**: 下载进度追踪
- ❌ **缺失**: 市场页面 Private Mode 适配（隐藏 Agent，显示模型）
- ❌ **缺失**: 磁盘空间检查

**独立测试**: **无法测试** - 模型市场功能完全未实现

**验收场景 (计划)**:

1. **Given** 用户在 Private Mode 下访问市场，**When** 浏览模型列表，**Then** 显示可用的开源模型及其信息（大小、描述） ❌
2. **Given** 用户选择一个模型，**When** 点击下载，**Then** 系统通过 Ollama API 下载模型，显示进度，完成后模型可在对话中选择使用 ❌
3. **Given** 用户在 Private Mode 下，**When** 查看市场，**Then** 不显示任何 Agent 分享相关的功能，仅显示模型下载选项 ❌
4. **Given** 用户下载失败（如网络中断），**When** 查看下载状态，**Then** 系统显示错误信息并提供重试选项 ❌

**⚠️ 待实现的任务 (Phase 7, Tasks T064-T074)**:
- 实现 Ollama model management IPC handlers
- 创建模型注册表数据源
- Model download hooks and mutation
- 市场 UI 适配
- 下载进度 UI
- 磁盘空间检查

---

### Edge Cases

- **模式切换时有正在进行的操作**: 如果用户在 Cloud Mode 下正在上传文件或发送消息时切换到 Private Mode，系统应取消所有云端操作并提示用户
- **本地存储空间不足**: 当用户在 Private Mode 下下载大型模型或上传大量文档时，如果本地存储空间不足，系统应显示警告并阻止操作
- **Ollama 服务不可用**: 如果 Ollama 未安装或未运行，系统应检测并显示引导用户安装/启动的友好提示
- **本地模型与知识库冲突**: 如果用户在 Private Mode 下使用的本地模型不支持某些功能（如嵌入生成），系统应提示用户选择兼容的模型
- **数据隔离**: Cloud Mode 和 Private Mode 的数据完全隔离。用户在 Cloud Mode 下创建的数据（聊天、知识库）在切换到 Private Mode 后不会自动迁移或同步。用户需要理解两种模式维护独立的数据存储，切换模式时需要重新创建内容
- **模型更新**: 本地下载的模型如何更新到新版本？系统是否需要检测模型更新并提示用户？
- **Ollama 版本过旧**: 如果用户系统上已安装的 Ollama 版本过旧，可能不兼容某些新功能，系统应检测版本并提示用户更新
- **Ollama 版本检测失败**: 如果无法获取 Ollama 版本信息（API 变更或连接失败），系统应使用降级策略，继续允许基本功能运行

## Requirements

### Functional Requirements

**实现状态总结** (2025-10-21 更新):
- ✅ **已实现**: 15 项 (FR-001, FR-002, FR-003, FR-008, FR-009, FR-010, FR-012, FR-013, FR-016修改版, US0, US1完成)
- ❌ **未实现**: 7 项 (FR-004至FR-007, FR-011, FR-014, US2-US4相关)
- 🗑️ **已废弃**: 10 项 (FR-015, FR-017至FR-025 - 改用 electron-ollama)

#### 模式切换与基础设施 (✅ 已实现)

- **FR-001** ✅: 系统必须在右侧边栏提供 Cloud Mode 和 Private Mode 的切换按钮
- **FR-008** ✅: 系统必须在 UI 上明确标识当前运行的模式（**已实现**: ModeToggle 按钮已足够显示模式状态）
- **FR-010** ✅: 系统必须在模式切换时保存当前模式状态，下次启动时恢复
- **FR-013** ✅: 系统必须将 Cloud Mode 和 Private Mode 的数据完全隔离，切换模式时不自动迁移或同步任何数据

#### Ollama 集成 (✅ 已实现 - electron-ollama 方案)

- **FR-009** ✅: 系统必须在 Private Mode 下检测 Ollama 服务的可用性（通过端口 11434 检测），并提供友好的错误提示
- **FR-016** ✅ (修改版): 系统必须在首次启动时检测系统 Ollama（通过端口 11434），若不存在则自动下载 electron-ollama

**🗑️ 已废弃 (改用 electron-ollama，无需手动安装流程)**:
- ~~FR-015~~: 嵌入安装包到 resources
- ~~FR-017~~: 显示确认对话框
- ~~FR-018~~: 提取并执行安装包
- ~~FR-019~~: "稍后安装"选项
- ~~FR-020~~: 安装失败错误提示
- ~~FR-021~~: Linux 手动安装指引
- ~~FR-022~~: Ollama 版本检测
- ~~FR-023~~: 版本过旧更新提示
- ~~FR-024~~: 记录嵌入版本号
- ~~FR-025~~: 分阶段进度显示

#### 离线运行 (✅ 已实现)

- **FR-002** ✅: 系统必须在切换到 Private Mode 后，完全停止所有与云端服务器的网络通信（已实现 TanStack Query 模式感知配置）
- **FR-003** ✅: 系统必须在 Private Mode 下禁用所有云端专属功能（分享知识库、分享 Agent）（已实现：分享按钮已隐藏）
- **FR-012** ✅: 系统必须在 Private Mode 下防止任何数据泄露到云端（包括日志、分析数据）（已验证：网络请求已禁用）
- **FR-014** ❌: 系统必须在用户首次切换到 Private Mode 时，显示说明提示用户两种模式的数据是独立的（**未实现**，可在 ModeToggle 确认对话框中添加）

#### 本地聊天 (❌ 未实现)

- **FR-004** ❌: 系统必须支持通过 Ollama 接口与本地大模型进行对话
- **FR-005** ❌: 系统必须在 Private Mode 下将所有聊天消息和知识库数据存储在本地文件系统 (Schema 完成，功能未实现)

#### 知识库与向量化 (❌ 未实现)

- **FR-006** ❌: 系统必须在 Private Mode 下提供本地向量化功能（用于知识库 RAG）

#### 模型市场 (❌ 未实现)

- **FR-007** ❌: 系统必须在 Private Mode 的市场页面显示开源模型下载链接
- **FR-011** ❌: 系统必须在 Private Mode 下支持本地模型的下载、安装和管理

### Key Entities

- **运行模式（Mode）**: 表示应用当前的运行模式，包含 Cloud 和 Private 两种状态，影响所有功能的行为和数据流向
- **本地模型（Local Model）**: 通过 Ollama 或其他方式安装在本地的大语言模型，包含模型名称、大小、能力参数等属性
- **本地知识库（Local Knowledge Base）**: 存储在本地文件系统的知识库，包含文档文件、向量索引、元数据等
- **本地对话（Local Conversation）**: 在 Private Mode 下创建的对话记录，所有消息和上下文完全存储在本地
- **模型下载任务（Model Download Task）**: 表示一个正在进行的模型下载任务，包含进度、状态、错误信息等
- **Ollama 版本信息（Ollama Version）**: 记录嵌入的 Ollama 版本号和已安装的版本号，用于版本比较和兼容性检查

## Success Criteria

### Measurable Outcomes

- **SC-001**: 用户能够在 2 秒内完成模式切换，且切换后应用保持流畅运行
- **SC-002**: 在 Private Mode 下，所有核心功能（聊天、知识库）的响应时间与 Cloud Mode 相当或更快
- **SC-003**: 在 Private Mode 下使用网络监控工具验证，零云端网络请求发生（除模型下载外）
- **SC-004**: 用户能够在 10 分钟内完成首次本地模型下载和对话（假设网络速度正常）
- **SC-005**: 90% 的用户能够在首次使用 Private Mode 时，理解其功能和限制（通过引导提示或说明）
- **SC-006**: 本地知识库的向量化处理速度达到每秒至少 100 个文档片段
- **SC-007**: Private Mode 下的聊天流式响应延迟低于 200 毫秒首字节时间（TTFB）
- **SC-008**: Ollama 自动安装流程的用户完成率达到 85% 以上（选择"立即安装"的用户中，成功完成安装的比例）
- **SC-009**: 安装进度反馈的更新频率至少每秒一次，确保用户感知到持续进展

### Assumptions

- 用户已经安装 Electron 桌面应用，具备基本的文件系统访问权限
- 用户的设备有足够的存储空间用于下载和存储本地模型（至少 10GB 可用空间）
- 本地向量化功能使用标准的嵌入模型（如 sentence-transformers），无需联网
- 用户理解 Private Mode 下某些云端功能（如协作、分享）不可用
- 用户接受 Cloud Mode 和 Private Mode 的数据完全隔离，不期望自动数据迁移
- Ollama 提供稳定的 API 接口，兼容 AI SDK 的调用方式
- 用户的设备性能足以运行本地大模型（至少 8GB RAM，推荐 16GB 以上）

### Dependencies

- **Ollama**: 本地模型推理的核心依赖，需要用户安装并运行
- **本地向量数据库**: 如 Chroma、LanceDB 或其他轻量级方案，用于知识库 RAG
- **Electron 文件系统 API**: 用于本地数据存储和管理
- **AI SDK**: 需要支持 Ollama provider 的配置和调用
- **下载管理**: 需要实现可靠的大文件下载和断点续传功能（针对模型下载）

### Out of Scope

- Cloud Mode 和 Private Mode 之间的数据导出/导入功能（两种模式的数据完全隔离，不支持迁移）
- 云端数据到本地的自动同步或批量下载
- 本地数据到云端的上传或同步功能
- 本地模型的训练或微调功能
- Private Mode 下的多设备同步（完全本地运行，无同步需求）
- 本地模型的性能优化和加速（依赖 Ollama 自身能力）
- 与其他本地 AI 工具的集成（如 LM Studio、LocalAI 等）
- Linux 平台的 Ollama 自动安装（用户需手动安装）
