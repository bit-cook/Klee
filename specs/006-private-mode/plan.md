# Implementation Plan: Private Mode（私有模式）

**Branch**: `006-private-mode` | **Date**: 2025-10-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-private-mode/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

实现 Private Mode 功能，允许用户在本地环境下运行应用，完全脱离云端服务器。核心特性包括：通过右侧边栏切换运行模式、基于 Ollama 的本地大模型对话、本地向量化知识库管理、以及本地模型下载市场。

**技术方案**：

- **智能 Ollama 集成**：
  - 优先检测系统 Ollama（端口 11434）
  - 未检测到时使用 **electron-ollama** 内嵌版本（自动管理，无需手动安装）
  - 自动检测和切换，用户无感知
  - 简化的状态管理（system/embedded/none）
- **完全数据隔离**：使用独立 SQLite 文件（rafa-private.db）存储本地数据
- **向量化知识库**：LanceDB 嵌入式向量数据库（计划中）
- **UI 复用**：扩展现有 Cloud Mode 组件，通过 ModeContext 条件渲染

**核心优势**：

- ✅ 避免进程冲突（智能检测 localhost:11434）
- ✅ 节省磁盘空间（复用系统 Ollama 模型库）
- ✅ 零网络请求（完全离线运行）
- ✅ 简化实现（electron-ollama 自动管理）

## Implementation Status (2025-10-21)

**当前阶段**: Phase 3 完成 (US0 - Ollama 集成), Phase 4 部分完成 (US1 - 模式切换)

### 已完成
- ✅ US0: Ollama 智能检测和管理 (electron-ollama)
- ✅ 基础架构: Schema, IPC channels, ModeContext, DatabaseConnectionManager
- ✅ 部分 US1: 模式切换 UI 和状态管理

### 进行中
- ⚠️ US1: 完善离线运行保证(TanStack Query 配置、云功能禁用)

### 待开始
- ❌ US2: 本地聊天对话
- ❌ US3: 本地知识库管理
- ❌ US4: 本地模型市场

## Technical Context

**Language/Version**:

- 前端: TypeScript 5.4.2
- 后端: TypeScript 5.8.3 (仅用于 Cloud Mode，Private Mode 无后端交互)
- Electron: NEEDS CLARIFICATION (当前版本未知)

**Primary Dependencies**:

- Electron 33.4.11 (桌面应用框架)
- React 18.3.1 (前端 UI)
- TanStack Query v4.29.14 (状态管理，需适配本地数据源)
- TanStack Router v1.132.41 (路由管理)
- Vercel AI SDK + ollama-ai-provider (用于本地模型对话)
- **electron-ollama v0.1.25** (内嵌 Ollama 运行时，自动管理)
  - 端口检测：localhost:11434
  - 自动切换：优先系统 Ollama，否则使用内嵌版本
- **LanceDB** (嵌入式向量数据库，TypeScript 原生支持，计划中)
- **better-sqlite3** (SQLite 驱动) + Drizzle ORM (类型安全 schema)
- **Electron 工具**:
  - electron-builder (打包)
  - node-fetch/axios (检测 Ollama API)

**Storage**:

- SQLite (本地数据库，存储对话、知识库元数据、模型配置)
- 本地文件系统 (存储知识库文档、向量索引、模型文件)
- Electron userData 路径 (用户数据存储位置)

**Testing**:

- **E2E**: Playwright + electron-playwright-helpers (官方推荐)
- **单元/集成**: Vitest + React Testing Library
- **离线验证**: Playwright `context.route()` 阻止外部请求
- **性能测试**: 本地模型推理 TTFB、向量化速度

**Target Platform**:

- macOS (优先，支持 Ollama 自动安装)
- Windows (支持 Ollama 自动安装)
- Linux (可选，**不支持 Ollama 自动安装**，需用户手动安装并显示指引)
- Electron 跨平台桌面应用

**Project Type**: Electron 桌面应用（前端 + Electron 主进程）

**Performance Goals**:

- 模式切换响应时间 < 2 秒
- 本地聊天 TTFB < 200ms
- 知识库向量化速度 >= 100 片段/秒
- 本地模型下载支持断点续传

**Constraints**:

- 完全离线可用（Private Mode 下零云端网络请求，除模型下载）
- 内存占用取决于本地模型大小（推荐设备 >= 16GB RAM）
- 存储空间需求 >= 10GB（用于模型和向量数据）
- 数据完全隔离（Cloud/Private 模式独立数据存储）

**Scale/Scope**:

- 单用户桌面应用
- 复用现有 Cloud Mode UI 组件（聊天、知识库、市场界面）
- 新增模式切换逻辑和本地数据层
- 集成 Ollama、SQLite、向量数据库到 Electron app

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### I. 类型优先开发 ✅ COMPLIANT

**适用性**: 部分适用（Private Mode 下无 Hono RPC，但前端仍需类型安全）

**合规说明**:

- Private Mode 下不使用 Hono RPC（无服务器交互）
- 但前端本地数据操作仍需类型安全：SQLite 查询结果、本地模型配置、向量数据库响应
- 使用 Drizzle ORM 的类型推断用于 SQLite schema
- 本地 API 调用（Ollama、向量数据库）需要定义 TypeScript 接口

**行动**:

- 定义本地数据源的 TypeScript 接口
- 使用 Drizzle ORM 为 SQLite 生成类型
- 为 Ollama API 响应定义类型（可从 AI SDK 推断）

### II. 模式驱动架构 ✅ COMPLIANT

**适用性**: 完全适用

**合规说明**:

- SQLite 数据库 schema 是本地数据的唯一真实来源
- 使用 Drizzle ORM 定义 schema，生成 TypeScript 类型和验证器
- 本地对话、知识库、模型配置的 schema 从 Drizzle 生成

**行动**:

- 创建 `client/db/schema-local.ts` 定义 Private Mode 的 SQLite schema
- 使用 `drizzle-zod` 生成验证器
- 确保不重复定义类型

### III. 模块化工具函数 ✅ COMPLIANT

**适用性**: 完全适用

**合规说明**:

- 本地模式的工具函数应设计为可组合和可重用
- 例如：`embedDocument()`、`searchVectors()`、`saveConversation()` 等函数应独立且可组合
- 复用现有的 Cloud Mode 工具函数（如文件解析、文本分割）

**行动**:

- 设计本地工具函数时遵循单一职责原则
- 创建 `client/lib/local-utils/` 目录组织本地工具函数
- 复用现有工具函数（避免重复造轮子）

### IV. 中间件组合 ⚠️ PARTIALLY APPLICABLE

**适用性**: 部分适用（Electron 主进程层面）

**合规说明**:

- Private Mode 无 Hono 后端，但 Electron 主进程仍需要中间件模式
- IPC 通信需要错误处理、权限验证（如文件系统访问）
- 本地数据操作需要统一的错误处理层

**行动**:

- 设计 Electron IPC 的错误处理中间件
- 创建本地数据操作的统一错误处理层

### V. 多租户隔离 ⚠️ MODIFIED FOR LOCAL

**适用性**: 需调整（单用户桌面应用）

**合规说明**:

- Private Mode 是单用户本地应用，无多租户需求
- **但需要 Cloud/Private 模式数据隔离**（FR-013）
- SQLite 数据库应分别存储两种模式的数据，或使用 `mode` 字段区分

**调整**:

- 使用独立的 SQLite 文件存储 Private Mode 数据
- 或在同一数据库中使用 `mode` 字段区分数据
- 确保模式切换时不会交叉访问数据

**行动**:

- 设计数据隔离策略（独立文件 vs. mode 字段）
- Phase 0 研究最佳实践

### VI. 数据完整性与级联 ✅ COMPLIANT

**适用性**: 完全适用

**合规说明**:

- 本地知识库删除时，需级联删除关联的文档、向量索引、嵌入数据
- 对话删除时，需级联删除消息记录
- SQLite 外键关系应使用 `CASCADE`

**行动**:

- 在 SQLite schema 中定义外键级联关系
- 确保删除操作的原子性（使用事务）

### VII. 防御性配置 ✅ COMPLIANT

**适用性**: 完全适用

**合规说明**:

- Ollama API 地址、端口、超时配置需显式定义
- 向量数据库参数（维度、距离度量）需配置化
- 文件大小限制、存储路径需配置

**行动**:

- 创建 `client/config/local.config.ts` 定义所有本地配置
- 避免硬编码魔术数字

### VIII. 中英文分离原则 ✅ COMPLIANT

**适用性**: 完全适用

**合规说明**:

- 代码注释、文档、AI 对话使用中文（当前已遵循）
- UI 文本、错误提示、用户可见消息使用英文
- 模式切换提示、错误消息、引导文本均需英文

**行动**:

- 所有用户可见文本使用英文
- 开发文档和注释使用中文

### 🚦 Gate 评估结果

**状态**: ✅ PASS WITH ADJUSTMENTS

**需要调整的原则**:

1. **V. 多租户隔离** → 调整为 **模式隔离**（Cloud/Private 数据隔离）

**待研究的问题**（Phase 0）:

1. ~~Ollama 如何打包到 Electron app 中？~~ ✅ **已解决**：使用 electron-ollama v0.1.25
2. 选择哪个本地向量数据库方案？
3. 测试框架选择（Playwright/Spectron）？
4. 数据隔离策略（独立 SQLite 文件 vs. mode 字段）？
5. Electron 版本和兼容性？

## Project Structure

### Documentation (this feature)

```
specs/006-private-mode/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

当前项目采用 **Electron + React Web** 结构，Private Mode 功能将在此基础上扩展：

```
client/                           # Electron 前端应用
├── electron/                     # Electron 主进程（NEW: Private Mode 逻辑）
│   ├── main/
│   │   └── index.ts              # 主进程入口，集成 OllamaManager
│   ├── ipc/                      # NEW: IPC handlers for local data operations
│   │   └── mode-handlers.ts      # 模式切换 IPC 处理器
│   ├── db/                       # NEW: SQLite database management
│   │   ├── connection-manager.ts # 数据库连接管理器（替代 connection.ts）
│   │   └── init-db.ts            # 数据库初始化（已创建但未集成）
│   ├── services/                 # NEW: Ollama, vector DB integration
│   │   └── ollama-manager.ts     # Ollama 管理器（检测+启动 electron-ollama）
├── src/
│   ├── components/               # UI 组件（复用，部分条件渲染）
│   ├── hooks/                    # React Hooks（扩展本地数据 hooks）
│   │   ├── chat/                 # 聊天模块 hooks（扩展本地模式）
│   │   ├── knowledge-base/       # 知识库 hooks（扩展本地向量化）
│   │   ├── marketplace/          # 市场 hooks（扩展模型下载）
│   │   ├── mode/                 # NEW: 模式切换 hooks
│   │   │   └── useOllamaSource.ts     # Ollama 状态监听 hook
│   ├── lib/                      # 工具库
│   │   ├── local-utils/          # NEW: 本地工具函数（嵌入、向量搜索，计划中）
│   │   ├── query-client.ts       # TanStack Query 配置（扩展本地数据源）
│   │   └── hono-client.ts        # Hono RPC 客户端（仅 Cloud Mode）
│   ├── routes/                   # 路由（复用，根据模式条件渲染）
│   ├── config/                   # 配置文件
│   │   └── local.config.ts       # NEW: Private Mode 配置
│   ├── contexts/                 # React Contexts
│   │   └── ModeContext.tsx       # NEW: 运行模式上下文
│   └── components/layout/
│       └── sidebar-right/
│           └── mode-toggle.tsx   # Cloud/Private 模式切换器 UI
└── db/                           # NEW: 本地数据库 schema
    └── schema-local.ts           # SQLite schema（Drizzle ORM）

server/                           # Hono 后端（Private Mode 下不使用）
└── [保持不变，仅 Cloud Mode 使用]

test/                             # 测试
├── electron/                     # NEW: Electron 集成测试
├── local-mode/                   # NEW: Private Mode 功能测试
└── [existing tests]
```

**Structure Decision**:

Private Mode 采用 **混合架构**：

1. **复用前端 UI 组件**：现有的聊天、知识库、市场界面组件完全复用，通过条件渲染适配两种模式
2. **扩展 Hooks 层**：在现有 hooks 基础上添加本地数据操作逻辑，根据运行模式选择数据源（云端 vs. 本地）
3. **新增 Electron 主进程服务**：在 `electron/` 目录下添加 SQLite、Ollama、向量数据库的集成代码
4. **新增本地数据层**：`client/db/` 存放 SQLite schema，`electron/db/` 存放数据库实例管理
5. **模式上下文**：通过 React Context 提供全局的运行模式状态，所有组件根据此状态调整行为

## Complexity Tracking

_Fill ONLY if Constitution Check has violations that must be justified_

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
