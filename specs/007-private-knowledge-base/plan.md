# Implementation Plan: Private Mode 知识库模块

**Branch**: `007-private-knowledge-base` | **Date**: 2025-10-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-private-knowledge-base/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

实现 Private Mode 下的完整知识库功能，包括本地数据存储（SQLite + LanceDB）、文件上传和处理、embedding 生成（使用 Ollama nomic-embed-text 模型）、向量检索（集成到本地聊天）以及 CRUD 操作。所有功能必须在完全离线环境下运行，UI 组件与 Cloud Mode 保持一致（通过条件渲染根据模式切换数据层）。核心技术路径：使用 Electron IPC 实现主进程和渲染进程通信，复用 Cloud Mode 的文本提取逻辑，使用 LanceDB 进行本地向量存储和检索，确保数据库字段与云端严格匹配（去除分享相关字段）。

## Technical Context

**Language/Version**:
- Frontend: TypeScript 5.4.2
- Backend (Electron Main): TypeScript 5.8.3

**Primary Dependencies**:
- Electron (桌面应用框架)
- React 18.3.1 (渲染进程 UI)
- TanStack Query v4.29.14 (客户端数据缓存和状态管理)
- TanStack Router v1.132.41 (路由管理)
- Drizzle ORM (SQLite 数据库 ORM)
- LanceDB (本地向量数据库，需要集成 Node.js 客户端)
- Ollama (embedding 生成，通过 /api/embeddings 端点)
- pdf-parse, mammoth (文本提取库，复用 Cloud Mode)

**Storage**:
- SQLite (知识库和文件元数据，存储在 app.getPath('userData'))
- LanceDB (向量数据，每个知识库对应一个独立的向量表)
- 本地文件系统 (原始文件，存储在 app.getPath('userData')/documents/)

**Testing**:
- TypeScript 类型检查 (npx tsc --noEmit)
- 手动集成测试 (通过 UI 验证完整流程)

**Target Platform**:
- Electron (macOS/Windows/Linux)

**Project Type**:
- Web (Electron 渲染进程) + Desktop (Electron 主进程)

**Performance Goals**:
- 向量搜索延迟 < 100ms (95th percentile，针对包含 1000 个文档片段的知识库)
- 文件上传和向量化总时间 < 30s (针对 10MB 以下文件)
- UI 响应时间 < 200ms (所有操作)

**Constraints**:
- 必须在完全离线环境下运行（无网络请求）
- Cloud Mode 和 Private Mode 数据完全隔离
- UI 组件在两种模式间复用率 > 90%
- 数据库字段与 Cloud Mode 严格匹配（去除分享相关字段）

**Scale/Scope**:
- 单用户桌面应用
- 支持多个知识库（每个知识库可包含多个文件）
- 预期每个知识库包含 100-1000 个文档片段
- 文件大小限制 100MB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ 合规性评估

| 宪章原则 | 合规状态 | 说明 |
|---------|---------|------|
| I. 类型优先开发 | ✅ 通过 | 使用 Drizzle ORM + drizzle-zod 实现端到端类型安全，IPC handlers 返回类型与 Cloud Mode RPC 接口保持一致 |
| II. 模式驱动架构 | ✅ 通过 | SQLite schema 为唯一真实来源（client/src/main/local/db/schema.ts），使用 drizzle-zod 自动生成验证器 |
| III. 模块化工具函数 | ✅ 通过 | 文本提取、分块、embedding 生成等功能设计为可组合的工具函数，可在多个知识库间复用 |
| IV. 中间件组合 | ⚠️ 部分适用 | Electron IPC 架构不使用传统 HTTP 中间件，但使用 Zod 验证器在 IPC handlers 中进行输入验证 |
| V. 多租户隔离 | ✅ 通过 | Private Mode 为单用户模式，无多租户需求，所有数据仅存储在本地设备 |
| VI. 数据完整性与级联 | ✅ 通过 | SQLite 外键关系使用 `onDelete: 'cascade'`，删除知识库时级联删除文件记录和 LanceDB 向量表 |
| VII. 防御性配置 | ✅ 通过 | 所有配置（embedding 维度、文件大小限制、分块配置等）显式定义在 local.config.ts 中 |
| VIII. 中英文分离原则 | ✅ 通过 | 代码注释、文档使用中文；UI 文本（按钮、错误消息）使用英文 |

### 📋 潜在风险

1. **LanceDB 集成复杂度**: LanceDB Node.js 客户端的集成需要研究，可能需要处理 native 模块编译问题
2. **向量搜索性能**: 需要验证 LanceDB 在 Electron 主进程中的性能是否满足 < 100ms 的要求
3. **文件处理阻塞**: 大文件的文本提取和 embedding 生成可能阻塞主进程，需要考虑异步处理或 worker threads

### ✅ 宪章合规总结

本功能完全符合项目宪章要求，无需记录任何违规或例外情况。核心设计遵循类型优先、模式驱动、数据完整性原则，所有配置显式定义，代码组织清晰。

## Project Structure

### Documentation (this feature)

```
specs/007-private-knowledge-base/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
client/                                    # Electron 渲染进程 + 主进程
├── src/
│   ├── main/                             # Electron 主进程（Node.js 环境）
│   │   ├── local/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts             # ✅ 已存在：SQLite schema（知识库表已定义）
│   │   │   │   ├── connection-manager.ts # ✅ 已存在：数据库连接管理器
│   │   │   │   ├── init-db.ts            # ✅ 已存在：数据库初始化
│   │   │   │   └── queries/
│   │   │   │       ├── knowledge-bases.ts    # 🆕 新增：知识库查询函数
│   │   │   │       └── knowledge-base-files.ts # 🆕 新增：文件查询函数
│   │   │   ├── services/
│   │   │   │   ├── ollama-manager.ts     # ✅ 已存在：Ollama 管理器
│   │   │   │   ├── vector-db-manager.ts  # 🆕 新增：LanceDB 管理器
│   │   │   │   ├── embedding-service.ts  # 🆕 新增：Embedding 生成服务
│   │   │   │   ├── file-processor.ts     # 🆕 新增：文件处理服务（文本提取+分块）
│   │   │   │   └── storage-service.ts    # 🆕 新增：本地文件存储服务
│   │   │   └── types/
│   │   │       └── knowledge-base.ts     # 🆕 新增：知识库类型定义
│   │   └── ipc/
│   │       └── knowledge-base-handlers.ts # 🆕 新增：知识库 IPC 处理器
│   │
│   ├── preload/
│   │   └── index.ts                      # 🔧 修改：添加知识库 IPC API 暴露
│   │
│   └── renderer/                         # Electron 渲染进程（浏览器环境）
│       └── src/
│           ├── components/
│           │   ├── knowledge-base/       # ✅ 已存在：Cloud Mode 知识库组件
│           │   │   ├── KnowledgeBaseList.tsx
│           │   │   ├── KnowledgeBaseDetail.tsx
│           │   │   ├── FileUpload.tsx
│           │   │   └── ... (其他组件，需要适配 Private Mode)
│           │   └── mode/
│           │       └── ModeToggle.tsx    # ✅ 已存在：模式切换组件
│           ├── hooks/
│           │   ├── knowledge-base/
│           │   │   ├── queries/
│           │   │   │   ├── useKnowledgeBases.ts  # 🔧 修改：添加 Private Mode 支持
│           │   │   │   └── useKnowledgeBase.ts   # 🔧 修改：添加 Private Mode 支持
│           │   │   └── mutations/
│           │   │       ├── useCreateKnowledgeBase.ts   # 🔧 修改：添加 Private Mode 支持
│           │   │       ├── useUpdateKnowledgeBase.ts   # 🔧 修改：添加 Private Mode 支持
│           │   │       ├── useDeleteKnowledgeBase.ts   # 🔧 修改：添加 Private Mode 支持
│           │   │       ├── useUploadFile.ts            # 🔧 修改：添加 Private Mode 支持
│           │   │       └── useDeleteFile.ts            # 🔧 修改：添加 Private Mode 支持
│           │   └── mode/
│           │       └── useOllamaSource.ts # ✅ 已存在：Ollama 状态监听
│           ├── contexts/
│           │   └── ModeContext.tsx       # ✅ 已存在：模式状态管理
│           ├── config/
│           │   └── local.config.ts       # ✅ 已存在：Private Mode 配置（包含向量数据库和文件存储配置）
│           ├── lib/
│           │   ├── hono-client.ts        # ✅ 已存在：Cloud Mode RPC 客户端
│           │   ├── query-client.ts       # ✅ 已存在：TanStack Query 客户端
│           │   ├── queryKeys.ts          # 🔧 修改：确保包含 knowledgeBaseKeys
│           │   └── ipc-client.ts         # 🆕 新增：Private Mode IPC 客户端封装
│           └── routes/
│               └── _authenticated/
│                   └── knowledge-base/
│                       ├── index.tsx     # ✅ 已存在：知识库列表页面
│                       └── $id.tsx       # ✅ 已存在：知识库详情页面

server/                                   # 后端 API（Cloud Mode）
└── src/
    ├── routes/
    │   └── knowledge-base.ts             # ✅ 已存在：Cloud Mode 知识库路由（作为参考）
    ├── lib/
    │   └── ai/
    │       └── text-extraction.ts        # ✅ 已存在：文本提取逻辑（需要复用到 client）
    └── db/
        └── schema.ts                     # ✅ 已存在：PostgreSQL schema（作为参考）
```

**Structure Decision**:

本功能采用 **Web application (Electron)** 架构，包含以下关键目录：

1. **client/src/main/**: Electron 主进程（Node.js 环境），负责数据库操作、文件处理、向量生成等后端逻辑
2. **client/src/renderer/**: Electron 渲染进程（浏览器环境），负责 UI 渲染和用户交互
3. **IPC 通信**: 主进程和渲染进程通过 Electron IPC 进行通信，确保类型安全

### 📁 新增文件清单

**主进程（Electron Main）**:
- `client/src/main/local/db/queries/knowledge-bases.ts` - 知识库 CRUD 查询
- `client/src/main/local/db/queries/knowledge-base-files.ts` - 文件 CRUD 查询
- `client/src/main/local/services/vector-db-manager.ts` - LanceDB 管理器
- `client/src/main/local/services/embedding-service.ts` - Ollama embedding API 封装
- `client/src/main/local/services/file-processor.ts` - 文件文本提取和分块
- `client/src/main/local/services/storage-service.ts` - 本地文件系统操作
- `client/src/main/local/types/knowledge-base.ts` - 知识库类型定义
- `client/src/main/ipc/knowledge-base-handlers.ts` - IPC 处理器（create, list, get, update, delete, uploadFile, deleteFile）

**渲染进程（Electron Renderer）**:
- `client/src/renderer/src/lib/ipc-client.ts` - IPC 客户端封装（类型安全）

**修改文件清单**:
- `client/src/preload/index.ts` - 添加 `window.api.knowledgeBase.*` IPC API 暴露
- `client/src/renderer/src/hooks/knowledge-base/**/*.ts` - 添加 Private Mode 数据层支持（条件渲染）
- `client/src/renderer/src/lib/queryKeys.ts` - 确保包含知识库查询键

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

**无宪章违规**: 本功能完全符合项目宪章要求，无需记录任何复杂性违规。

