# 实施计划: TipTap 编辑器迁移

**分支**: `010-tiptap-editor-migration` | **日期**: 2025-10-24 | **规范**: [spec.md](spec.md)
**输入**: 功能规范来自 `/specs/010-tiptap-editor-migration/spec.md`

**备注**: 本模板由 `/speckit.plan` 命令填充。参见 `.specify/templates/commands/plan.md` 了解执行工作流。

## 摘要

将笔记编辑器的 UI 组件从当前的 shadcn 自定义实现迁移到参考项目 (`/Users/wei/Coding/tiptap-editor`) 的 tiptap-shadcn 实现。仅替换 `@/components/ui/editor` 目录和相关的工具栏组件,保持现有的 `NoteEditor` API、自动保存逻辑和 Markdown 格式不变。使用参考项目已有的技术栈,不新增依赖,不修改后端。

## 技术上下文

**语言/版本**: TypeScript 5.4.2 (客户端)
**主要依赖**:
- React 18.3.1
- TipTap v3.7.2 (已安装)
- shadcn/ui (Radix UI 组件)
- tiptap-markdown 0.9.0 (已安装)
- lowlight (已安装,用于代码高亮)
- tippy.js (需从参考项目复制使用方式)
- fuse.js 7.1.0 (已安装,用于模糊搜索)

**存储**: N/A (仅 UI 迁移,不涉及数据存储变更)
**测试**: N/A (本次迁移不包含测试代码编写)
**目标平台**: Electron (桌面端) + Web (客户端渲染)
**项目类型**: Electron + React 单页应用
**性能目标**:
- 编辑器输入响应时间 <100ms
- 斜杠命令搜索 <1秒
- 自动保存防抖 20秒
- 字符数统计实时更新

**约束**:
- 不修改 `NoteEditor` 组件的外部 API (props 保持不变)
- 不修改自动保存和 embedding 的业务逻辑 (`useAutoSaveNote`)
- 不新增 npm 依赖 (使用已有的 TipTap v3.7.2 和 shadcn/ui)
- 不修改后端 API 或数据格式
- 仅替换 `client/src/renderer/src/components/ui/editor` 目录

**规模/范围**:
- 替换 1 个编辑器组件文件 (~1800 行)
- 新增参考项目的工具栏组件目录 (~20 个文件,~1500 行)
- 新增参考项目的扩展目录 (~5 个文件,~600 行)
- 新增样式文件 (tiptap.css ~200 行)
- 修改 1 个使用者组件 (`NoteEditor`, 仅内部实现)

## 宪法检查

*关卡: 必须在 Phase 0 研究前通过。Phase 1 设计后重新检查。*

### I. 类型优先开发

✅ **符合**:
- TipTap 组件已通过 `@tiptap/react` 提供完整的 TypeScript 类型
- 参考项目使用 TipTap 的类型推断,无需手动定义类型
- `NoteEditor` 的 `EditorProviderProps` 和回调类型由 TipTap 自动推断

### II. 模式驱动架构

✅ **符合**:
- 本次迁移不涉及数据库模式变更
- Markdown 数据格式保持不变,由 `tiptap-markdown` 扩展处理

### III. 模块化工具函数

✅ **符合**:
- 参考项目的工具栏组件高度模块化 (每个工具栏按钮独立文件)
- 可组合的 TipTap 扩展 (Image, Link, Color, Highlight 等)
- 可在 `NoteEditor` 和未来其他编辑器场景中重用

### IV. 中间件组合

N/A: 本次迁移不涉及后端中间件

### V. 多租户隔离

N/A: 本次迁移不涉及数据访问或用户隔离

### VI. 数据完整性与级联

✅ **符合**:
- Markdown 格式的输入/输出保持一致性
- 现有的自动保存逻辑确保数据完整性

### VII. 防御性配置

✅ **符合**:
- 编辑器占位符文本可配置 (`placeholder` prop)
- 字符数限制可配置 (`limit` prop)
- 防抖时间可配置 (`saveDebounceMs`, `embedDebounceMs`)

### VIII. 中英文分离原则

✅ **符合**:
- 代码注释使用中文
- UI 文本 (工具栏提示、占位符) 使用英文
- 参考项目已遵循此原则

**结论**: 所有适用原则均符合,无宪法违规。

## 项目结构

### 文档 (本功能)

```
specs/010-tiptap-editor-migration/
├── plan.md              # 本文件 (/speckit.plan 命令输出)
├── research.md          # Phase 0 输出 (/speckit.plan 命令)
├── data-model.md        # N/A (仅 UI 迁移,无数据模型变更)
├── quickstart.md        # Phase 1 输出 (/speckit.plan 命令)
├── contracts/           # N/A (无 API 变更)
└── tasks.md             # Phase 2 输出 (/speckit.tasks 命令 - 不由 /speckit.plan 创建)
```

### 源代码 (仓库根目录)

```
client/src/renderer/src/
├── components/
│   ├── note/
│   │   └── note-editor.tsx              # 修改: 内部实现替换为新编辑器
│   ├── ui/
│   │   └── editor/
│   │       └── index.tsx                # 替换: 从参考项目迁移新实现
│   └── tiptap/                          # 新增: 从参考项目迁移
│       ├── extensions/                   # 新增: 自定义 TipTap 扩展
│       │   ├── floating-menu.tsx         # 斜杠命令菜单
│       │   ├── floating-toolbar.tsx      # 移动端浮动工具栏
│       │   ├── image-placeholder.tsx     # 图片占位符扩展
│       │   ├── image.tsx                 # 图片扩展
│       │   └── search-and-replace.tsx    # 搜索替换扩展
│       ├── toolbars/                     # 新增: 工具栏组件
│       │   ├── editor-toolbar.tsx        # 桌面端主工具栏
│       │   ├── toolbar-provider.tsx      # 工具栏上下文
│       │   ├── bold.tsx                  # 加粗按钮
│       │   ├── italic.tsx                # 斜体按钮
│       │   ├── underline.tsx             # 下划线按钮
│       │   ├── strikethrough.tsx         # 删除线按钮
│       │   ├── code.tsx                  # 行内代码按钮
│       │   ├── code-block.tsx            # 代码块按钮
│       │   ├── headings.tsx              # 标题选择器
│       │   ├── bullet-list.tsx           # 无序列表按钮
│       │   ├── ordered-list.tsx          # 有序列表按钮
│       │   ├── blockquote.tsx            # 引用按钮
│       │   ├── link.tsx                  # 链接按钮
│       │   ├── alignment.tsx             # 对齐选择器
│       │   ├── color-and-highlight.tsx   # 颜色和高亮选择器
│       │   ├── horizontal-rule.tsx       # 分隔线按钮
│       │   ├── image-placeholder-toolbar.tsx  # 图片占位符按钮
│       │   ├── search-and-replace-toolbar.tsx # 搜索替换工具
│       │   ├── undo.tsx                  # 撤销按钮
│       │   ├── redo.tsx                  # 重做按钮
│       │   └── mobile-toolbar-group.tsx  # 移动端工具栏分组
│       ├── rich-text-editor.tsx          # 参考: 可选的独立编辑器组件
│       └── tiptap.css                    # 新增: 编辑器样式
└── hooks/
    └── note/
        └── useAutoSaveNote.ts            # 保持不变: 自动保存逻辑
```

**结构决策**:
- 采用参考项目的组件化结构,将工具栏按钮独立为单独文件,便于维护和复用
- 新增 `components/tiptap` 目录,包含所有参考项目的组件和扩展
- 保持现有的 `components/note/note-editor.tsx` 作为容器组件,仅修改内部实现
- 不修改 `hooks/note/useAutoSaveNote.ts`,保持自动保存逻辑不变

## 复杂性追踪

*仅在宪法检查有违规需要证明合理性时填写*

无违规。

## Phase 0: 大纲与研究

### 研究任务

1. **参考项目组件映射**: 分析参考项目的组件结构,与当前 `@/components/ui/editor` 的功能对应关系
2. **TipTap 扩展兼容性**: 验证参考项目使用的 TipTap 扩展与当前 v3.7.2 的兼容性
3. **样式集成**: 研究 `tiptap.css` 与 rafa 的全局样式和主题系统的集成方式
4. **Markdown 扩展**: 验证参考项目的 Markdown 配置与 `tiptap-markdown` 0.9.0 的兼容性
5. **移动端适配**: 研究参考项目的 `FloatingToolbar` (BubbleMenu) 在移动设备上的实现
6. **图片占位符**: 研究参考项目的图片占位符扩展,评估是否需要调整
7. **搜索替换**: 研究参考项目的搜索替换功能实现
8. **工具栏状态管理**: 研究 `ToolbarProvider` 的上下文管理机制

### 输出

所有研究结果将整合到 `research.md` 文件中,包含:
- 每个研究任务的决策和理由
- 考虑的替代方案
- 具体的迁移步骤建议

## Phase 1: 设计与契约

### 数据模型

**跳过**: 本次迁移不涉及数据模型变更。Markdown 格式保持不变。

### API 契约

**跳过**: 本次迁移不涉及 API 变更。`NoteEditor` 组件的 props 接口保持不变:

```typescript
// 保持不变的接口
type NoteEditorProps = {
  noteId: string
  initialTitle?: string
  initialContent?: string
  autoSave?: boolean
  autoEmbed?: boolean
  saveDebounceMs?: number
  embedDebounceMs?: number
}
```

### 快速开始指南

将在 `quickstart.md` 中提供:
1. 如何在 `NoteEditor` 中使用新编辑器
2. 如何自定义工具栏按钮
3. 如何添加新的 TipTap 扩展
4. 如何调试编辑器问题
5. 如何处理样式冲突

### Agent 上下文更新

将运行 `.specify/scripts/bash/update-agent-context.sh claude` 更新 AI 助手的上下文,添加:
- 新的 `components/tiptap` 组件结构
- TipTap v3.7.2 的使用模式
- 参考项目的工具栏组件化模式

## Phase 2: 任务生成

**备注**: Phase 2 由 `/speckit.tasks` 命令执行,不在本计划中生成。

任务将涵盖:
1. 从参考项目复制组件文件到 `components/tiptap`
2. 替换 `components/ui/editor/index.tsx` 的实现
3. 修改 `NoteEditor` 组件以使用新编辑器组件
4. 集成样式文件 `tiptap.css`
5. 测试所有编辑器功能 (格式化、表格、斜杠命令等)
6. 测试自动保存和 embedding 集成
7. 测试桌面和移动端的工具栏
8. 验证 Markdown 格式的兼容性
9. 性能测试 (输入响应、搜索速度等)
10. 清理未使用的旧代码

## 迁移策略

### 分阶段迁移

1. **阶段 1**: 复制参考项目组件到新目录 `components/tiptap`
   - 不影响现有编辑器
   - 可以逐步调整和测试

2. **阶段 2**: 创建新的 `EditorProvider` 和工具栏集成
   - 在 `NoteEditor` 中同时保留旧编辑器作为备份
   - 使用功能开关切换新旧编辑器

3. **阶段 3**: 完全替换并删除旧代码
   - 验证所有功能正常后删除旧编辑器
   - 清理未使用的导入和类型

### 回滚计划

如果迁移出现问题:
1. 通过功能开关立即切换回旧编辑器
2. 保留旧代码直到新编辑器稳定运行至少 1 周
3. Git 历史保留完整的旧实现,可随时回滚

### 测试策略

1. **功能验证**: 手动测试所有编辑器功能 (参考 spec.md 的验收场景)
2. **自动保存测试**: 验证编辑后 20 秒自动保存
3. **Embedding 测试**: 验证编辑后 30 秒自动 embedding
4. **Markdown 兼容性**: 使用现有笔记数据测试渲染和编辑
5. **性能测试**: 测量输入响应时间、搜索速度、字符数统计更新

### 风险缓解

1. **样式冲突**:
   - 使用 CSS 模块或作用域样式避免全局污染
   - 检查 `tiptap.css` 与全局样式的冲突

2. **TipTap 版本差异**:
   - 参考项目使用 v2.11.3,rafa 使用 v3.7.2
   - 需要调整 API 变更 (如 `useEditor` → `EditorProvider`)

3. **移动端兼容性**:
   - 在小屏幕设备上测试浮动工具栏
   - 确保触摸交互正常

4. **数据完整性**:
   - 备份现有笔记数据
   - 测试 Markdown 序列化/反序列化

## 下一步

运行 `/speckit.tasks` 生成详细的任务列表和依赖关系图。
