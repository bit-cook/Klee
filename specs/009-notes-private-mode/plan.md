# Implementation Plan: Notes Private Mode

**Branch**: `009-notes-private-mode` | **Date**: 2025-10-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-notes-private-mode/spec.md`

## Summary

为 rafa 应用添加 Private Mode 笔记功能，使用户能够在完全离线的环境下创建、编辑、管理笔记，并通过本地 Ollama embeddings 和 LanceDB 向量搜索实现 RAG（检索增强生成）能力。功能与 Cloud Mode Notes 保持 UI 和交互一致性，同时参考 Private Mode Knowledge Base 的本地存储架构。

**核心技术路径**:
- 本地存储: SQLite (better-sqlite3) + LanceDB (向量数据库)
- Embedding: Ollama API (`nomic-embed-text`, 768 维向量)
- 前端: TanStack Query v4 (缓存管理) + React 18 + TanStack Router v1
- IPC: Electron 主进程/渲染进程通信 (处理文件、向量、数据库操作)
- UI: 完全复用现有 Cloud Mode Notes 组件 (NoteEditor, NoteList)

## Technical Context

**Language/Version**: TypeScript 5.4.2 (client) / 5.8.3 (server), Node.js 20+
**Primary Dependencies**:
- Client: React 18.3.1, Electron 33.4.11, better-sqlite3 12.4.1, @lancedb/lancedb 0.22.2, drizzle-orm 0.44.6, @tanstack/react-query 4.29.14, @tanstack/react-router 1.132.41, hono 4.9.12
- Server: Hono 4.9.5 (RPC 类型生成), drizzle-orm 0.44.6, PostgreSQL (Cloud Mode)

**Storage**:
- Private Mode: SQLite (`{userData}/rafa-private.db`) + LanceDB (`{userData}/vector-db`)
- Cloud Mode: PostgreSQL (Supabase) + pgvector
- 本地文件系统: `{userData}/documents/` (暂无需求，笔记纯文本)

**Testing**: Vitest 3.2.4 (单元测试), Playwright 1.56.1 (E2E 测试), @testing-library/react 16.3.0
**Target Platform**: Electron (跨平台桌面应用，macOS/Windows/Linux)
**Project Type**: Electron + React (monorepo: client + server workspaces)

**Performance Goals**:
- 笔记保存 < 500ms (SQLite 写入)
- Embedding 生成: ~5s / 1000 字符 (取决于硬件，M4 Mac Metal GPU)
- RAG 搜索 < 2s (包含向量化查询 + LanceDB 搜索)

**Constraints**:
- 完全离线运行 (Private Mode)
- UI 与 Cloud Mode 100% 一致 (代码复用)
- 数据隔离 (Cloud vs Private 完全分离)
- Embedding 串行处理 (避免 Metal GPU 崩溃)

**Scale/Scope**:
- 笔记数量: < 10,000 条 (SQLite 性能限制)
- 单笔记大小: < 100,000 字符
- 向量维度: 768 (Ollama nomic-embed-text)
- 并发用户: 1 (Private Mode 单用户)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. 类型优先开发 ✅

**状态**: 符合
- SQLite schema 使用 drizzle-orm + drizzle-zod 自动生成类型和验证器
- IPC 通道使用明确的请求/响应类型 (与 Knowledge Base 一致)
- 前端 hooks 直接使用 drizzle 推导的类型 (`LocalNote`, `NewLocalNote`)
- 无手动类型定义

### II. 模式驱动架构 ✅

**状态**: 符合
- `client/src/main/local/db/schema.ts` 作为唯一真实来源
- 添加 `localNotes` 表定义，字段与 Cloud Mode `notes` 表完全对应
- 使用 `createInsertSchema` 和 `drizzle-zod` 生成验证器
- 避免重复定义

### III. 模块化工具函数 ✅

**状态**: 符合
- 复用现有的 `embedding-service.ts` (生成向量)
- 复用现有的 `vector-db-manager.ts` (LanceDB 操作)
- 新增 `note-embedding-service.ts` (笔记专用 embedding 逻辑)
- 工具函数可组合 (分块 → embedding → 存储向量)

### IV. 中间件组合 ⚠️

**状态**: 部分适用
- Cloud Mode: Hono 中间件处理认证、验证
- Private Mode: 无需认证中间件 (单用户本地)
- IPC handlers 使用统一的错误处理模式 (参考 Knowledge Base)

**理由**: Private Mode 不涉及 HTTP API，仅通过 IPC 通信，认证层不适用。

### V. 多租户隔离 ⚠️

**状态**: 不适用
- Private Mode 是单用户模式，无 `userId` 字段
- Cloud Mode 笔记已有 `userId` 隔离
- Cloud 和 Private 数据完全隔离 (不同数据库)

**理由**: Private Mode 设计为单用户离线使用，无多租户需求。

### VI. 数据完整性与级联 ✅

**状态**: 符合
- SQLite 外键约束启用 (`FOREIGN KEY ... ON DELETE CASCADE`)
- 删除笔记时级联删除 LanceDB 向量表 (`note_{noteId}`)
- 参考 Knowledge Base 的级联删除逻辑

### VII. 防御性配置 ✅

**状态**: 符合
- 向量维度配置在 `local.config.ts` 中明确定义 (768 维)
- 分块参数配置: `MAX_CHUNK_SIZE: 1000`, `CHUNK_OVERLAP: 200`
- Ollama API URL、超时、重试次数均可配置
- 无魔术数字

### VIII. 中英文分离原则 ✅

**状态**: 符合
- 开发层面: 代码注释、AI 对话、文档使用中文
- UI 层面: 按钮文本、错误提示、用户可见消息使用英文 (复用 Cloud Mode UI)

**总结**: ✅ 所有适用原则均符合。部分原则 (IV, V) 由于 Private Mode 的单用户离线特性而不适用，已在 Complexity Tracking 中说明。

## Project Structure

### Documentation (this feature)

```
specs/009-notes-private-mode/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── note-ipc.md      # IPC 通道定义
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
client/                                    # Electron + React 前端
├── src/
│   ├── main/                              # Electron 主进程
│   │   ├── local/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts              # ✨ 添加 localNotes 表定义
│   │   │   │   ├── queries/
│   │   │   │   │   └── notes.ts           # ✨ 新增: 笔记查询函数
│   │   │   │   └── init-db.ts             # ✨ 更新: 添加 notes 表初始化
│   │   │   ├── services/
│   │   │   │   ├── note-embedding-service.ts  # ✨ 新增: 笔记 embedding 服务
│   │   │   │   ├── embedding-service.ts   # 复用: 向量生成
│   │   │   │   └── vector-db-manager.ts   # 复用: LanceDB 操作
│   │   │   └── ipc/
│   │   │       └── note-handlers.ts       # ✨ 新增: 笔记 IPC 处理器
│   │   └── preload/
│   │       └── index.ts                   # ✨ 更新: 暴露 note IPC API
│   ├── renderer/src/                      # React 渲染进程
│   │   ├── hooks/
│   │   │   └── note/
│   │   │       ├── queries/
│   │   │       │   ├── useNotes.ts        # ✨ 更新: 添加 Private Mode 逻辑
│   │   │       │   └── useNote.ts         # ✨ 更新: 添加 Private Mode 逻辑
│   │   │       └── mutations/
│   │   │           ├── useCreateNote.ts   # ✨ 更新: 添加 Private Mode 逻辑
│   │   │           ├── useUpdateNote.ts   # ✨ 更新: 添加 Private Mode 逻辑
│   │   │           ├── useDeleteNote.ts   # ✨ 更新: 添加 Private Mode 逻辑
│   │   │           └── useEmbedNote.ts    # ✨ 更新: 添加 Private Mode 逻辑
│   │   ├── components/
│   │   │   └── note/
│   │   │       ├── note-editor.tsx        # 复用: 无需修改 (模式感知)
│   │   │       ├── note-editor-frame.tsx  # 复用: 无需修改
│   │   │       └── note-list.tsx          # 复用: 无需修改
│   │   ├── lib/
│   │   │   └── queryKeys.ts               # ✨ 更新: 添加模式参数到 noteKeys
│   │   └── types/
│   │       └── local/
│   │           └── note.ts                # ✨ 新增: Private Mode 笔记类型
│   └── package.json

server/                                    # Hono API (Cloud Mode)
├── db/
│   ├── schema.ts                          # 参考: notes 表定义 (无需修改)
│   └── queries/
│       └── note.ts                        # 参考: Cloud Mode 查询 (无需修改)
└── src/
    └── routes/
        └── note.ts                        # 参考: Cloud Mode API (无需修改)
```

**Structure Decision**:
采用 Electron monorepo 结构，client workspace 包含主进程 (Electron) 和渲染进程 (React)。Private Mode 功能完全在 client/src/main/local 中实现，复用 Cloud Mode 的 UI 组件和 hooks，仅在 hooks 中添加模式判断逻辑。Server workspace 仅作为 Cloud Mode API 和类型定义的参考，无需修改。

**关键设计决策**:
1. **表结构对齐**: `localNotes` 表字段与 Cloud Mode `notes` 表完全一致 (id, title, content, starred, createdAt, updatedAt)，仅移除 `userId` (单用户模式)
2. **组件复用**: 完全复用 `NoteEditor`, `NoteList` 等组件，通过 `useMode()` 上下文感知当前模式
3. **Hooks 扩展**: 在现有 hooks 中添加 `if (mode === 'private')` 分支，调用 IPC 而非 HTTP API
4. **向量表命名**: LanceDB 表命名为 `note_{noteId}`，与 Knowledge Base 的 `kb_{knowledgeBaseId}` 保持一致

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| IV. 中间件组合 - 部分适用 | Private Mode 通过 IPC 通信，无需 HTTP 中间件 | IPC handlers 使用统一错误处理模式，与中间件思想一致 |
| V. 多租户隔离 - 不适用 | Private Mode 设计为单用户离线使用 | 单用户模式无需 userId 隔离，Cloud/Private 数据库分离已确保隔离 |
