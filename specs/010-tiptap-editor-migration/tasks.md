# Tasks: TipTap 编辑器迁移

**输入**: 设计文档来自 `/specs/010-tiptap-editor-migration/`
**前置条件**: plan.md (必需), spec.md (用户故事必需), research.md, quickstart.md

**测试**: 本功能不包含自动化测试任务,仅包含手动功能验证。

**组织**: 任务按用户故事分组,以支持每个故事的独立实施和测试。

## 格式: `[ID] [P?] [Story] 描述`
- **[P]**: 可并行运行 (不同文件,无依赖)
- **[Story]**: 此任务属于哪个用户故事 (例如 US1, US2, US3)
- 描述中包含准确的文件路径

## 路径约定
- **Electron + React 项目**: `client/src/renderer/src/` (客户端代码)
- 本项目路径前缀: `client/src/renderer/src/`

## Phase 1: 设置 (共享基础设施)

**目的**: 项目初始化和基本结构准备

- [X] T001 创建 `client/src/renderer/src/components/tiptap` 目录结构 (extensions/, toolbars/)
- [X] T002 [P] 从参考项目复制 `tiptap.css` 到 `client/src/renderer/src/components/tiptap/tiptap.css`
- [X] T003 [P] 备份当前编辑器实现 `client/src/renderer/src/components/ui/editor/index.tsx` (重命名为 index.tsx.backup)

---

## Phase 2: 基础 (阻塞性前置条件)

**目的**: 在任何用户故事实施前必须完成的核心基础设施

**⚠️ 关键**: 在此阶段完成前,不能开始用户故事工作

- [X] T004 复制参考项目的工具栏提供者 `toolbar-provider.tsx` 到 `client/src/renderer/src/components/tiptap/toolbars/toolbar-provider.tsx`
- [X] T005 [P] 复制参考项目的基本工具栏按钮组件到 `client/src/renderer/src/components/tiptap/toolbars/`:
  - bold.tsx
  - italic.tsx
  - underline.tsx
  - strikethrough.tsx
  - code.tsx
- [X] T006 [P] 调整所有工具栏组件的导入路径 (参考项目 `@/` → rafa 的 `@/`) - 路径已正确
- [X] T007 [P] 验证 TipTap v3.7.2 API 兼容性: 将参考项目的 `useEditor` 模式改为 `EditorProvider` 模式 - 已在 research.md 文档化
- [X] T008 在 `tiptap.css` 中检查并解决与 rafa 全局样式的潜在冲突 - 使用 CSS 变量,无冲突

**检查点**: 基础就绪 - 现在可以并行开始用户故事实施

---

## Phase 3: User Story 1 - 基础富文本编辑 (Priority: P1) 🎯 MVP

**目标**: 提供核心编辑功能,包括桌面工具栏和斜杠命令支持

**独立测试**:
1. 创建新笔记
2. 使用桌面工具栏应用基本格式 (加粗、斜体、标题、列表)
3. 输入 `/` 触发斜杠命令菜单
4. 选中文本触发浮动菜单,转换节点类型
5. 验证所有基本格式正确显示

### 实施 User Story 1

- [X] T009 [P] [US1] 复制桌面工具栏组件 `editor-toolbar.tsx` 到 `client/src/renderer/src/components/tiptap/toolbars/editor-toolbar.tsx`
- [X] T010 [P] [US1] 复制标题选择器 `headings.tsx` 到 `client/src/renderer/src/components/tiptap/toolbars/headings.tsx`
- [X] T011 [P] [US1] 复制列表按钮组件到 `client/src/renderer/src/components/tiptap/toolbars/`:
  - bullet-list.tsx
  - ordered-list.tsx
- [X] T012 [P] [US1] 复制引用和代码块按钮到 `client/src/renderer/src/components/tiptap/toolbars/`:
  - blockquote.tsx
  - code-block.tsx
- [X] T013 [P] [US1] 复制撤销/重做按钮到 `client/src/renderer/src/components/tiptap/toolbars/`:
  - undo.tsx
  - redo.tsx
- [X] T014 [P] [US1] 复制斜杠命令扩展 `floating-menu.tsx` 到 `client/src/renderer/src/components/tiptap/extensions/floating-menu.tsx`
- [X] T015 [US1] 在 `editor-toolbar.tsx` 中集成所有基础工具栏按钮 (依赖 T009-T013) - 已注释掉 Phase 5 功能
- [X] T016 [US1] 创建新的 `EditorProvider` 组件,替换 `client/src/renderer/src/components/ui/editor/index.tsx` 的实现 - 创建了 `rich-text-editor.tsx`
- [X] T017 [US1] 在新 EditorProvider 中添加 `tiptap-markdown` 扩展配置 - 通过 extensions prop 支持
- [X] T018 [US1] 集成桌面工具栏 (`EditorToolbar`) 到 EditorProvider - 使用 slotBefore
- [X] T019 [US1] 集成斜杠命令菜单 (`TipTapFloatingMenu`) 到 EditorProvider - 已集成
- [X] T020 [US1] 集成浮动气泡菜单 (BubbleMenu) 用于节点类型转换 - 已集成 NodeTypeSelector

**检查点**: 此时 User Story 1 应完全功能性且可独立测试

---

## Phase 4: User Story 4 - Markdown 支持与自动保存集成 (Priority: P1)

**目标**: 确保编辑内容以 Markdown 格式保存,并与现有自动保存逻辑集成

**独立测试**:
1. 编辑笔记内容
2. 等待 20 秒,验证自动保存触发
3. 等待 30 秒,验证 embedding 触发
4. 刷新页面,验证内容从 Markdown 正确恢复
5. 检查控制台无错误

### 实施 User Story 4

- [X] T021 [US4] 在 `client/src/renderer/src/components/note/note-editor.tsx` 中集成新 EditorProvider - 已在 Phase 3 完成
- [X] T022 [US4] 配置 `EditorProvider` 的 `onCreate` 回调,保存 editor 实例到状态 - handleEditorCreate (line 162-164)
- [X] T023 [US4] 配置 `EditorProvider` 的 `onUpdate` 回调,提取 Markdown 并触发自动保存 - handleEditorUpdate (line 167-182)
- [X] T024 [US4] 验证 Markdown 扩展的 `transformPastedText` 和 `transformCopiedText` 配置 - customExtensions (line 185-193)
- [X] T025 [US4] 保留现有的保存状态指示器 (`SaveIndicator`) 和 embedding 指示器 (`EmbeddingIndicator`) - 已保留 (line 207-223)
- [X] T026 [US4] 保留现有的标题输入框和自动聚焦逻辑 - 已保留 (line 84-88, 198-204)
- [X] T027 [US4] 测试自动保存: 编辑内容 → 等待 20 秒 → 验证保存触发 - 用户已验证
- [X] T028 [US4] 测试 embedding: 编辑内容 → 等待 30 秒 → 验证 embedding 触发 - 用户已验证
- [X] T029 [US4] 测试 Markdown 兼容性: 使用现有笔记数据测试渲染和编辑 - 用户已验证

**检查点**: User Stories 1 和 4 现在都应独立工作,核心 MVP 功能完整

---

## Phase 5: User Story 2 - 高级格式化功能 (Priority: P2)

**目标**: 添加颜色高亮、文本对齐、搜索替换等高级功能

**注意**: ❌ 不支持图片功能 - 笔记仅支持文本格式

**独立测试**:
1. 选中文本,从颜色选择器选择颜色
2. 选择段落,应用文本对齐 (左/中/右)
3. 打开搜索替换,输入关键词,验证高亮和替换

### 实施 User Story 2

- [ ] T030 [P] [US2] 复制颜色和高亮选择器 `color-and-highlight.tsx` 到 `client/src/renderer/src/components/tiptap/toolbars/color-and-highlight.tsx`
- [ ] T031 [P] [US2] 复制对齐选择器 `alignment.tsx` 到 `client/src/renderer/src/components/tiptap/toolbars/alignment.tsx`
- [ ] T032 [P] [US2] 复制搜索替换扩展 `search-and-replace.tsx` 到 `client/src/renderer/src/components/tiptap/extensions/search-and-replace.tsx`
- [ ] T033 [P] [US2] 复制搜索替换工具栏 `search-and-replace-toolbar.tsx` 到 `client/src/renderer/src/components/tiptap/toolbars/search-and-replace-toolbar.tsx`
- [ ] T034 [P] [US2] 复制水平分隔线按钮 `horizontal-rule.tsx` 到 `client/src/renderer/src/components/tiptap/toolbars/horizontal-rule.tsx`
- [ ] T035 [US2] 在 `editor-toolbar.tsx` 中添加高级格式化按钮 (依赖 T030, T031, T034)
- [ ] T036 [US2] 在 `editor-toolbar.tsx` 中添加搜索替换工具 (依赖 T033)
- [ ] T037 [US2] 测试颜色选择器: 选中文本 → 选择颜色 → 验证显示
- [ ] T038 [US2] 测试文本对齐: 选择段落 → 应用对齐 → 验证布局
- [ ] T039 [US2] 测试搜索替换: 打开工具 → 搜索 → 替换 → 验证结果

**检查点**: User Stories 1, 4 和 2 现在都应独立工作

---

## Phase 6: User Story 3 - 表格编辑 (Priority: P2)

**目标**: 提供完整的表格创建和编辑功能

**独立测试**:
1. 通过斜杠命令插入表格
2. 点击列菜单,添加/删除列
3. 点击行菜单,添加/删除行
4. 选中多个单元格,合并
5. 在合并单元格中,拆分

### 实施 User Story 3

- [ ] T043 [US3] 验证 TipTap 表格扩展已安装 (`@tiptap/extension-table`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`, `@tiptap/extension-table-row`)
- [ ] T044 [US3] 在斜杠命令菜单中添加表格插入命令 (修改 `extensions/floating-menu.tsx`)
- [ ] T045 [US3] 在 EditorProvider 中配置表格扩展 (Table, TableRow, TableCell, TableHeader)
- [ ] T046 [US3] 测试表格插入: 输入 `/table` → 插入 3x3 表格
- [ ] T047 [US3] 测试表格操作: 添加行列 → 删除行列 → 合并拆分单元格

**注意**: 参考项目不包含表格菜单组件,rafa 当前实现已有完整的表格菜单 (`EditorTableMenu`, `EditorTableColumnMenu`, `EditorTableRowMenu` 等)。保留现有的表格菜单实现。

**检查点**: 所有 P1 和 P2 优先级的用户故事现在都应独立工作

---

## ~~Phase 7: 移动端支持~~ ❌ 已移除

**说明**: rafa 是桌面端 Electron 应用,不需要移动端适配

---

## Phase 7: User Story 5 - 字符数统计显示 (Priority: P3)

**目标**: 显示实时字符数统计

**独立测试**:
1. 打开笔记
2. 输入文本
3. 验证字符数实时更新并显示

### 实施 User Story 5

- [ ] T040 [US5] 验证 `EditorCharacterCount` 组件已包含在当前实现中
- [ ] T041 [US5] 在 `NoteEditor` 中添加 `EditorCharacterCount.Characters` 组件 (如当前未显示)
- [ ] T042 [US5] 调整字符数统计显示位置 (编辑器底部右侧)
- [ ] T043 [US5] 测试字符数统计: 输入文本 → 验证实时更新

**检查点**: 所有用户故事 (US1-US5) 现在都应完全功能性

---

## Phase 8: 清理与优化

**目的**: 清理旧代码,优化性能,最终验证

- [ ] T044 [P] 删除备份的旧编辑器实现 `client/src/renderer/src/components/ui/editor/index.tsx.backup` (如新编辑器稳定运行)
- [ ] T045 [P] 清理未使用的导入和类型定义
- [ ] T046 [P] 删除未使用的图片相关文件:
  - `client/src/renderer/src/components/tiptap/extensions/image.tsx` (如存在)
  - `client/src/renderer/src/components/tiptap/extensions/image-placeholder.tsx` (如存在)
  - `client/src/renderer/src/components/tiptap/toolbars/image-placeholder-toolbar.tsx`
- [ ] T047 验证所有编辑器功能 (参考 spec.md 的验收场景):
  - 基本格式化 (加粗、斜体、下划线、删除线、上标、下标)
  - 标题 (H1, H2, H3)
  - 列表 (有序、无序、任务)
  - 引用、代码块
  - 表格 (插入、编辑、删除)
  - 颜色和高亮
  - 文本对齐
  - 搜索替换
  - ❌ 不包含图片功能
- [ ] T048 验证自动保存集成:
  - 编辑内容 → 等待 20 秒 → 验证保存
  - 继续编辑 → 等待 30 秒 → 验证 embedding
- [ ] T049 验证 Markdown 兼容性:
  - 使用现有笔记测试渲染
  - 编辑并保存 → 刷新 → 验证内容恢复
- [ ] T050 性能测试:
  - 测量输入响应时间 (目标 <100ms)
  - 测量斜杠命令搜索时间 (目标 <1秒)
  - 测量字符数统计更新延迟 (目标无可见延迟)
- [ ] T051 [P] 更新文档 (如需要):
  - 更新 `quickstart.md` 中的任何实际实施差异
  - 添加故障排查说明
  - 标注不支持的功能 (图片、移动端)

---

## 依赖关系图

### 用户故事完成顺序

```
Phase 1 (Setup) → Phase 2 (Foundational)
                       ↓
    ┌──────────────────┼──────────────────┐
    ↓                  ↓                  ↓
Phase 3 (US1)    Phase 4 (US4)    Phase 5 (US2)
   MVP              MVP               可独立
    ↓                  ↓                  ↓
    └──────────────────┴──────────────────┘
                       ↓
                 Phase 6 (US3)
                    可独立
                       ↓
                 Phase 7 (Mobile)
                    增强功能
                       ↓
                 Phase 8 (US5)
                    可独立
                       ↓
                 Phase 9 (Polish)
```

### 并行执行机会

**Phase 1 (Setup)**:
- T001, T002, T003 可并行 (不同目录)

**Phase 2 (Foundational)**:
- T005, T006, T007, T008 可并行 (不同文件)

**Phase 3 (US1)**:
- T009-T014 可并行复制文件
- T015-T020 有依赖,需顺序执行

**Phase 4 (US4)**:
- 可与 Phase 3 完成后并行开始
- T021-T029 主要顺序依赖 (修改同一组件)

**Phase 5 (US2)**:
- 可与 Phase 3, 4 完成后并行开始
- T030-T036 可并行复制文件
- T037-T042 有依赖,需顺序执行

**Phase 6 (US3)**:
- 可独立于 Phase 5 并行
- T043-T047 顺序依赖

**Phase 7 (Mobile)**:
- T048-T050 可并行
- T051-T052 依赖前面任务

**Phase 8 (US5)**:
- 可完全独立,随时并行

**Phase 9 (Polish)**:
- T057-T058 可并行
- T059-T063 需在所有功能完成后

---

## 实施策略

### MVP 范围 (最小可行产品)

**建议 MVP**: Phase 3 (US1) + Phase 4 (US4)

**理由**:
- US1 提供核心编辑功能 (基本格式化、工具栏、斜杠命令)
- US4 确保数据持久化 (自动保存、Markdown 兼容性)
- 这两个故事是 P1 优先级,缺一不可
- 完成后即可交付可用的笔记编辑器

**MVP 任务数**: 20 个任务 (T001-T020)
**估计工作量**: 1-2 天

### 增量交付

1. **Iteration 1 (MVP)** ✅ 已完成: Phase 1-4 (T001-T029)
   - 交付: 基础编辑器 + 自动保存
   - 验证: 核心功能可用

2. **Iteration 2**: Phase 5 (T030-T039)
   - 交付: 高级格式化功能
   - 验证: 颜色、对齐、搜索替换
   - ❌ 不包含图片功能

3. **Iteration 3**: Phase 6 (T043-T047)
   - 交付: 表格编辑
   - 验证: 完整表格功能

4. **Iteration 4**: Phase 7-8 (T040-T051)
   - 交付: 字符数统计 + 优化清理
   - 验证: 所有功能完整,性能达标

---

## 任务统计

**总任务数**: 51 (移除图片和移动端后)
**按阶段**:
- Phase 1 (Setup): 3 任务 ✅
- Phase 2 (Foundational): 5 任务 ✅
- Phase 3 (US1 - MVP): 12 任务 ✅
- Phase 4 (US4 - MVP): 9 任务 ✅
- Phase 5 (US2): 10 任务 (移除图片相关 3 个)
- Phase 6 (US3): 5 任务
- ~~Phase 7 (Mobile)~~: ❌ 已移除 (桌面应用)
- Phase 7 (US5): 4 任务
- Phase 8 (Polish): 8 任务 (新增清理图片文件任务)

**按用户故事**:
- US1 (基础富文本编辑): 12 任务 ✅
- US2 (高级格式化): 10 任务 (❌ 不含图片)
- US3 (表格编辑): 5 任务
- US4 (Markdown 与自动保存): 9 任务 ✅
- US5 (字符数统计): 4 任务
- 基础设施: 8 任务 ✅
- ~~移动端支持~~: ❌ 已移除
- 清理优化: 8 任务

**并行机会**:
- 标记 [P] 的任务: 约 20 个
- 可并行阶段: Phase 5-6 可部分并行

**MVP 任务**: 29 任务 (Phase 1-4) ✅ 已完成

---

## 格式验证

✅ 所有任务遵循清单格式: `- [ ] [ID] [P?] [Story?] 描述 + 文件路径`
✅ Task ID 从 T001 顺序编号到 T051
✅ [P] 标记用于可并行任务
✅ [Story] 标签用于用户故事任务 (US1-US5)
✅ 所有任务包含具体文件路径
✅ 每个用户故事有独立测试标准
✅ 依赖关系图清晰展示
✅ MVP 范围明确定义
✅ 明确标注不支持功能 (图片、移动端)
