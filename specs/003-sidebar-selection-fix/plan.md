# 实施计划：侧边栏导航选中状态

**分支**: `003-sidebar-selection-fix` | **日期**: 2025-10-19 | **规格说明**: [spec.md](./spec.md)
**输入**: 功能规格说明来自 `/specs/003-sidebar-selection-fix/spec.md`

**注意**: 此模板由 `/speckit.plan` 命令填写。执行工作流请参见 `.specify/templates/commands/plan.md`。

## 摘要

修复侧边栏二级导航（聊天列表、笔记列表、知识库列表、市场列表）的选中状态显示问题，确保用户能清晰识别当前正在查看的项目。同时优化路由结构以遵循 TanStack Router 最佳实践。这是一个修复性改进，不改变现有功能，仅增强视觉反馈和代码组织。

**技术方法**: 使用 TanStack Router 的 `useMatchRoute` 钩子检测当前活动路由，在二级导航组件中根据 URL 参数匹配活动项目并应用 `isActive` 样式。路由结构保持现有组织，仅优化命名一致性。

## 技术上下文

**语言/版本**: TypeScript 5.4.2 (前端) / 5.8.3 (后端)
**主要依赖**:
- TanStack Router v1.132.41 (路由管理和类型安全导航)
- TanStack Query v4.29.14 (数据缓存，已用于列表数据加载)
- React 18.3.1
- Hono v4.9.12 (RPC 客户端，已有类型推断)

**存储**: 不适用（仅前端 UI 状态）
**测试**: 手动测试（验证活动状态视觉效果）+ TypeScript 类型检查
**目标平台**: Electron 桌面应用（React 前端）
**项目类型**: 单一前端项目（client/）
**性能目标**: 活动状态更新 < 100ms（URL 变化时）
**约束**:
- 不改变现有功能和数据流
- 保持与现有侧边栏组件结构兼容
- 遵循现有的 TanStack Router loader 模式

**规模/范围**:
- 4 个二级导航组件需要更新（chat-list, note-list, knowledge-base-list, marketplace-list）
- 约 15 个路由文件需要审查（已存在，仅检查命名一致性）

## 宪章检查

*门控：必须在 Phase 0 研究前通过。Phase 1 设计后重新检查。*

### ✅ I. 类型优先开发
**状态**: 符合
**理由**: 使用 TanStack Router 的类型安全 Link 组件和 `useMatchRoute` 钩子，路由参数类型由 Router 自动推断。不需要手动定义类型。

### ✅ II. 模式驱动架构
**状态**: 不适用
**理由**: 此功能仅涉及 UI 状态（活动导航项），不涉及数据库模式或后端验证。

### ✅ III. 模块化工具函数
**状态**: 符合
**理由**: 将创建可重用的 `useActiveNavItem` 自定义钩子，可在所有二级导航组件中复用，遵循单一职责原则。

### ✅ IV. 中间件组合
**状态**: 不适用
**理由**: 此功能不涉及后端 API 或中间件，仅为前端 UI 增强。

### ✅ V. 多租户隔离
**状态**: 符合（继承现有）
**理由**: 不修改数据查询逻辑，继承现有的 `userId` 过滤（由 TanStack Query 钩子实现）。

### ✅ VI. 数据完整性与级联
**状态**: 不适用
**理由**: 不涉及数据删除或数据库操作。

### ✅ VII. 防御性配置
**状态**: 符合
**理由**: 活动状态样式使用现有的 ShadCN UI 组件 `isActive` prop，配置已存在于组件库中。

### ✅ VIII. 中英文分离原则
**状态**: 符合
**理由**:
- 代码注释和 AI 对话使用中文
- UI 文本（如果需要添加）使用英文
- 现有 UI 文本保持不变

**门控结果**: ✅ 全部通过 - 可以进入 Phase 0

## 项目结构

### 文档（本功能）

```
specs/003-sidebar-selection-fix/
├── plan.md              # 本文件（/speckit.plan 命令输出）
├── research.md          # Phase 0 输出（/speckit.plan 命令）
├── data-model.md        # Phase 1 输出（不适用 - 无数据模型）
├── quickstart.md        # Phase 1 输出（/speckit.plan 命令）
├── contracts/           # Phase 1 输出（不适用 - 无 API 变更）
└── tasks.md             # Phase 2 输出（/speckit.tasks 命令 - 本命令不创建）
```

### 源代码（仓库根目录）

```
client/                                    # 前端 Electron + React 应用
├── src/
│   ├── components/
│   │   └── layout/
│   │       └── sidebar-left/              # 侧边栏组件目录
│   │           ├── sidebar-left.tsx       # 主侧边栏容器
│   │           ├── nav-main.tsx           # 一级导航（已有活动状态）
│   │           ├── chat-list.tsx          # 聊天二级导航（需更新）
│   │           ├── note-list.tsx          # 笔记二级导航（需更新）
│   │           ├── knowledge-base-list.tsx # 知识库二级导航（需更新）
│   │           └── marketplace-list.tsx   # 市场二级导航（需更新）
│   │
│   ├── hooks/
│   │   └── useActiveNavItem.ts            # 新增：活动导航项检测钩子
│   │
│   └── routes/                            # TanStack Router 路由
│       └── _authenticated/
│           ├── chat.tsx                   # 聊天根路由
│           ├── chat.index.tsx             # 聊天列表视图
│           ├── chat.$chatId.tsx           # 聊天详情（已有 loader）
│           ├── (note)/
│           │   ├── note.index.tsx         # 笔记列表视图
│           │   └── note.$noteId.tsx       # 笔记详情
│           ├── (knowledge-base)/
│           │   ├── knowledge-base.index.tsx
│           │   └── knowledge-base.$knowledgeBaseId.tsx
│           └── (marketplace)/
│               ├── marketplace.index.tsx
│               └── marketplace.agent.$agentId.tsx
```

**结构决策**:
- 使用现有的 `client/src/components/layout/sidebar-left/` 目录组织侧边栏组件
- 新增 `client/src/hooks/useActiveNavItem.ts` 自定义钩子以复用活动状态检测逻辑
- 路由结构保持不变，已遵循 TanStack Router 文件式路由和路由组约定
- 不需要创建新的 API 路由或数据库查询

## 复杂性跟踪

*仅在宪章检查有违规需要证明时填写*

不适用 - 无宪章违规。
