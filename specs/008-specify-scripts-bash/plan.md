# Implementation Plan: Marketplace Private Mode - 本地开源大模型管理

**Branch**: `008-specify-scripts-bash` | **Date**: 2025-10-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-specify-scripts-bash/spec.md`

## Summary

为 Rafa 的 Marketplace 添加 Private Mode 支持，允许用户浏览、下载、管理和使用 Ollama 支持的开源大模型，实现完全离线的本地聊天体验。核心功能包括：模型列表展示、模型下载（支持暂停/继续/取消）、模型删除、聊天集成（模型选择器）和 Web Search 隐藏。技术方案基于现有的 Ollama 集成（系统 Ollama + electron-ollama 自动切换），复用 TanStack Query 缓存机制和 UI 组件库。

## Technical Context

**架构类型**: Electron + React (前端) + Hono (后端 RPC)，Monorepo 工作区
**Language/Version**: TypeScript 5.4.2 (client) / 5.8.3 (server)
**Primary Dependencies**:
- **前端**: React 18.3.1, TanStack Query 4.29.14, TanStack Router 1.132.41, Electron 33.4.11
- **本地 AI**: Ollama 0.6.0, ollama-ai-provider-v2 1.5.0, electron-ollama 0.1.25
- **UI**: Radix UI, Tailwind CSS, Lucide Icons
- **后端**: Hono 4.9.5, Drizzle ORM 0.44.6, PostgreSQL (云端数据)
- **本地数据**: Better-SQLite3 12.4.1, LanceDB 0.22.2

**Storage**:
- **云端**: PostgreSQL (用户数据、聊天记录、知识库)
- **本地**: SQLite (Private Mode 用户数据)，系统 Ollama 模型存储 (\`~/.ollama/models\`)

**Testing**: Vitest 3.2.4, @testing-library/react 16.3.0, Playwright 1.56.1
**Target Platform**: Electron (macOS, Windows, Linux), Node.js 20+
**Project Type**: Electron Monorepo (client + server workspaces)

**Performance Goals**:
- 模型列表加载 < 2 秒
- 下载进度更新延迟 ≤ 1 秒
- 模式切换（Cloud ↔ Private）< 3 秒
- 删除操作 < 5 秒

**Constraints**:
- 完全离线运行（Private Mode 下无网络依赖）
- 模型下载依赖 Ollama 官方源（网络稳定性）
- 磁盘空间管理（模型文件 0.4GB - 40GB）
- 并发下载限制（最多 2 个）

**Scale/Scope**:
- 支持模型数量：~10-20 个精选模型
- 并发下载任务：2 个
- 用户数量：单用户桌面应用

**特殊架构说明**:
1. **Ollama 绑定机制**: 优先使用系统 Ollama，若未安装则自动启动 electron-ollama，共享相同的模型存储路径
2. **模式隔离**: Cloud Mode 和 Private Mode 数据完全分离，模式切换时清除 TanStack Query 缓存
3. **RPC 类型安全**: 后端 Hono 路由导出 AppType，前端通过 hono-client.ts 自动推断请求/响应类型

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### 适用原则

| 原则 | 适用性 | 验证方式 |
|------|--------|----------|
| **I. 类型优先开发** | ✅ 适用 | 所有 API 使用 Hono RPC，类型从 server 导出自动推断 |
| **II. 模式驱动架构** | ⚠️ 部分适用 | 本地模型配置为静态 TypeScript 对象（\`models.ts\`），无需数据库模式 |
| **III. 模块化工具函数** | ✅ 适用 | Ollama API 调用封装为可复用函数（\`ollama-client.ts\`） |
| **IV. 中间件组合** | N/A | 本功能不涉及后端 API 路由（纯本地 Ollama 操作） |
| **V. 多租户隔离** | N/A | 本地桌面应用，单用户模式 |
| **VI. 数据完整性与级联** | N/A | 模型删除由 Ollama CLI 管理，无级联关系 |
| **VII. 防御性配置** | ✅ 适用 | Ollama 配置（URL、端口、超时）集中在 \`local.config.ts\` |
| **VIII. 中英文分离** | ✅ 适用 | 代码注释和文档使用中文，UI 文本使用英文 |

### 开发标准验证

| 标准 | 验证 |
|------|------|
| **配置集中化** | ✅ 模型配置在 \`models.ts\`，Ollama 配置在 \`local.config.ts\` |
| **查询隔离** | ⚠️ 本地 Ollama 操作无需数据库查询，通过 Ollama API 直接操作 |
| **基于功能的模块** | ✅ 新增文件组织在 \`client/src/renderer/src/hooks/ollama-models/\` 和 \`client/src/renderer/src/components/marketplace/\` |
| **类型验证** | ✅ 所有用户操作（下载、删除）在执行前验证（如磁盘空间检查） |
| **错误边界** | ✅ 下载/删除失败不影响核心浏览功能，显示错误消息并允许重试 |
| **集成点** | ⚠️ 本功能为新模块，无需测试现有 chat/knowledge-base 集成 |

### 性能标准验证

| 标准 | 本功能对应 |
|------|-----------|
| **向量搜索** | N/A（本功能不涉及向量搜索） |
| **会话缓存** | N/A（本功能不涉及认证会话） |
| **流式响应** | ⚠️ Ollama \`/api/pull\` 返回 NDJSON 流，用于实时下载进度（类似 SSE） |

### 复杂性说明

**无宪章违规** - 本功能完全符合宪章原则，无需额外复杂性。

**关键架构决策**:
1. **静态模型配置 vs 动态 API**: 选择静态配置文件（\`models.ts\`）而非从 Ollama API 动态获取，确保模型列表可控和安全
2. **模式隔离**: 复用现有 ModeContext，通过 \`isPrivateMode\` 控制 UI 显示和功能可见性

## Project Structure

### Documentation (this feature)

\`\`\`
specs/008-specify-scripts-bash/
├── spec.md              # 功能规格说明（已完成）
├── plan.md              # 本文件（实施计划）
├── research.md          # Phase 0 输出（研究与技术决策）
├── data-model.md        # Phase 1 输出（数据模型）
├── quickstart.md        # Phase 1 输出（开发快速上手）
├── contracts/           # Phase 1 输出（API 契约）
│   └── ollama-api.yaml  # Ollama API 规范
└── checklists/          # 质量检查清单
    └── requirements.md  # 规格质量验证（已完成）
\`\`\`

### Source Code (repository root)

\`\`\`
client/                                      # Electron + React 前端
├── electron/                                # Electron 主进程
│   └── main/local/services/
│       └── ollama-manager.ts                # 已存在 - Ollama 管理器（检测+启动）
│
├── src/renderer/src/                        # React 渲染进程
│   ├── config/
│   │   ├── models.ts                        # 🔄 扩展 - 添加 localLLMModels 配置
│   │   └── local.config.ts                  # 已存在 - Ollama 配置
│   │
│   ├── lib/
│   │   ├── ollama-client.ts                 # 已存在 - Ollama API 客户端
│   │   ├── hono-client.ts                   # 已存在 - Hono RPC 客户端
│   │   └── queryKeys.ts                     # 🔄 扩展 - 添加 ollamaModelKeys
│   │
│   ├── hooks/
│   │   ├── ollama-models/                   # ✨ 新增模块
│   │   │   ├── queries/
│   │   │   │   ├── useInstalledModels.ts    # ✨ 新增 - 查询已安装模型
│   │   │   │   └── useAvailableModels.ts    # ✨ 新增 - 查询可下载模型
│   │   │   └── mutations/
│   │   │       ├── useDownloadModel.ts      # ✨ 新增 - 下载模型（支持暂停/继续/取消）
│   │   │       └── useDeleteModel.ts        # ✨ 新增 - 删除模型
│   │   │
│   │   └── mode/
│   │       └── useOllamaSource.ts           # 已存在 - Ollama 状态监听
│   │
│   ├── components/
│   │   ├── marketplace/
│   │   │   ├── local-llm-card.tsx           # ✨ 新增 - 模型卡片组件
│   │   │   ├── model-download-progress.tsx  # ✨ 新增 - 下载进度组件
│   │   │   └── model-delete-dialog.tsx      # ✨ 新增 - 删除确认对话框
│   │   │
│   │   └── chat/
│   │       └── chat-prompt-input.tsx        # 🔄 修改 - 隐藏 Web Search（Private Mode）
│   │
│   ├── routes/_authenticated/
│   │   └── marketplace.index.tsx            # 🔄 扩展 - 添加 "Local LLMs" 标签页
│   │
│   └── contexts/
│       └── ModeContext.tsx                  # 已存在 - 模式管理（cloud/private）

server/                                      # Hono 后端（本功能无需后端修改）
└── src/routes/                              # 无需新增 API 路由
\`\`\`

**Structure Decision**:
- **前端主导**: 本功能完全在前端实现，通过 Ollama API 直接操作本地模型，无需后端支持
- **模块化组织**: 新增 \`hooks/ollama-models/\` 模块，遵循现有的 \`queries/\` 和 \`mutations/\` 分离模式
- **UI 复用**: 复用 marketplace 现有的卡片布局（\`marketplace.index.tsx\`），新增 Local LLMs 标签页

## Complexity Tracking

*无宪章违规，此部分为空。*

