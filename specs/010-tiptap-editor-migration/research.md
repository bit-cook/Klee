# 研究文档: TipTap 编辑器迁移

**日期**: 2025-10-24
**最后更新**: 2025-10-25 (重构为 @tiptap/suggestion 最佳实践)
**功能**: TipTap 编辑器 UI 组件迁移
**研究目标**: 解决技术上下文中的所有未知项,为迁移提供明确的技术决策

## 0. 斜杠命令最佳实践 (2025-10-25 更新)

### 决策: 使用 @tiptap/suggestion 扩展

**实施**: 重构斜杠命令使用官方推荐的 `@tiptap/suggestion` 工具,而非手动监听编辑器事件

### 理由

根据 TipTap 官方文档 (https://tiptap.dev/docs/editor/api/utilities/suggestion):

1. **官方推荐**: `@tiptap/suggestion` 是 TipTap 官方提供的工具,专门用于实现自动补全和建议功能
2. **更好的集成**: 作为 ProseMirror 插件,与编辑器核心深度集成,处理边界情况更完善
3. **标准模式**: Mention、Emoji 等官方扩展都基于此工具构建,遵循相同模式确保一致性
4. **简化维护**: 不需要手动管理编辑器事件监听、位置计算、菜单显示/隐藏逻辑

### 实施细节

**新文件**:
- `extensions/slash-command.tsx` - 扩展定义,使用 `Suggestion()` 创建插件
- `extensions/slash-command-list.tsx` - React 组件,渲染命令列表

**配置**:
```typescript
Suggestion({
  editor: this.editor,
  char: "/",                    // 触发字符
  startOfLine: false,           // 允许在行中触发
  items: ({ query }) => [...],  // 过滤命令
  render: () => ({              // Tippy.js 渲染
    onStart, onUpdate, onKeyDown, onExit
  })
})
```

**优势**:
- ✅ 自动处理光标位置和菜单定位
- ✅ 内置键盘导航支持
- ✅ 正确处理编辑器焦点和选区
- ✅ 与其他扩展更好的兼容性
- ✅ 更少的代码,更易维护

**对比旧实现**:
- ❌ 旧: 手动监听 `update` 和 `selectionUpdate` 事件
- ✅ 新: Suggestion 插件自动管理生命周期
- ❌ 旧: 手动计算菜单位置 (固定 top/left)
- ✅ 新: Tippy.js 智能定位
- ❌ 旧: 自己实现键盘导航逻辑
- ✅ 新: Suggestion 内置键盘处理

## 1. 参考项目组件映射

### 决策

参考项目 (`/Users/wei/Coding/tiptap-editor`) 的组件结构与当前 rafa 的 `@/components/ui/editor` 功能对应关系如下:

| 参考项目组件 | 当前实现 | 映射关系 |
|------------|---------|---------|
| `rich-text-editor.tsx` | N/A | 独立编辑器示例,不直接使用 |
| `extensions/floating-menu.tsx` | 部分包含在 `index.tsx` 的 `Slash` 扩展中 | 替换为更完整的斜杠命令实现 |
| `extensions/floating-toolbar.tsx` | N/A (当前无移动端浮动工具栏) | 新增移动端浮动工具栏 |
| `extensions/image-placeholder.tsx` | N/A | 新增图片占位符功能 |
| `extensions/image.tsx` | N/A | 新增图片扩展 |
| `extensions/search-and-replace.tsx` | N/A | 新增搜索替换功能 |
| `toolbars/editor-toolbar.tsx` | N/A (当前无固定工具栏) | 新增桌面端固定工具栏 |
| `toolbars/toolbar-provider.tsx` | N/A | 新增工具栏上下文管理 |
| `toolbars/*.tsx` (各按钮组件) | 部分包含在 `index.tsx` 的导出组件中 | 拆分为独立文件,便于维护 |
| `tiptap.css` | N/A (样式内嵌在组件中) | 新增独立样式文件 |

### 理由

- **组件化优势**: 参考项目将每个工具栏按钮独立为单独文件,比当前在单文件中定义所有组件更易维护
- **功能完整性**: 参考项目提供了更丰富的功能 (移动端工具栏、搜索替换、图片占位符)
- **代码复用**: 独立的组件文件可以在不同场景下复用

### 替代方案

**方案 A**: 仅替换 `index.tsx`,保持单文件结构
- **拒绝理由**: 单文件过长 (~1800 行),难以维护;无法获得参考项目的新功能

**方案 B**: 选择性迁移部分组件
- **拒绝理由**: 不完整的迁移会导致代码风格不一致,增加维护复杂度

### 迁移步骤建议

1. 创建 `components/tiptap` 目录结构
2. 按功能模块复制组件:
   - 先复制 `extensions/` 目录 (核心扩展)
   - 再复制 `toolbars/` 目录 (工具栏组件)
   - 最后复制 `tiptap.css` 样式文件
3. 调整导入路径 (参考项目使用 `@/` 别名,与 rafa 一致)
4. 在 `NoteEditor` 中集成新组件

## 2. TipTap 扩展兼容性

### 决策

参考项目使用 TipTap v2.11.3,rafa 当前使用 v3.7.2。需要进行以下 API 迁移:

| v2.11.3 API | v3.7.2 API | 变更说明 |
|------------|-----------|---------|
| `useEditor({ ... })` | `<EditorProvider>` 组件 | v3 推荐使用 Provider 模式 |
| `EditorContent editor={editor}` | `<EditorContent />` (在 Provider 内) | Editor 通过 Context 传递 |
| `editor.commands.*` | 保持不变 | 命令 API 向后兼容 |
| `BubbleMenu editor={editor}` | 保持不变 | 菜单组件 API 兼容 |
| `FloatingMenu editor={editor}` | 保持不变 | 菜单组件 API 兼容 |

### 理由

- TipTap v3 引入了新的 Provider 模式,简化了编辑器实例的传递
- 命令和扩展 API 保持向后兼容,无需大规模改动
- rafa 已安装 v3.7.2 的所有必要扩展包

### 替代方案

**方案 A**: 降级到 v2.11.3
- **拒绝理由**: 失去 v3 的性能改进和新特性;rafa 已在使用 v3

**方案 B**: 继续使用 `useEditor` Hook
- **拒绝理由**: 违反 v3 的最佳实践;Provider 模式更易管理状态

### 具体调整

1. **参考项目的 `useEditor` 改为 `EditorProvider`**:
   ```typescript
   // 参考项目 (v2)
   const editor = useEditor({
     extensions,
     content,
     onUpdate: ({ editor }) => { ... }
   })

   // 迁移到 rafa (v3)
   <EditorProvider
     extensions={extensions}
     content={content}
     onUpdate={({ editor }) => { ... }}
   >
     <EditorContent />
   </EditorProvider>
   ```

2. **工具栏组件使用 `useCurrentEditor`**:
   ```typescript
   // 参考项目传递 editor prop
   <BoldToolbar editor={editor} />

   // 迁移到 rafa 使用 Context
   function BoldToolbar() {
     const { editor } = useCurrentEditor()
     // ...
   }
   ```

## 3. 样式集成

### 决策

将 `tiptap.css` 作为独立样式文件导入,使用 CSS 模块化避免全局污染。

### 理由

- 参考项目的 `tiptap.css` 包含编辑器的核心样式 (列表、代码块、占位符等)
- rafa 使用 Tailwind CSS,需要确保样式优先级正确
- CSS 模块化可以避免与全局样式冲突

### 替代方案

**方案 A**: 将样式内嵌到组件中
- **拒绝理由**: 样式分散,难以维护;增加组件文件大小

**方案 B**: 转换为 Tailwind 类
- **拒绝理由**: 工作量大;可能丢失原有样式的细节

### 集成步骤

1. 复制 `tiptap.css` 到 `components/tiptap/` 目录
2. 在 `rich-text-editor.tsx` 或相关组件中导入:
   ```typescript
   import "./tiptap.css"
   ```
3. 检查样式冲突:
   - 验证编辑器的默认样式 (字体、行高、颜色)
   - 验证代码块的语法高亮样式
   - 验证列表和表格的样式

4. 如有冲突,使用作用域选择器:
   ```css
   /* 原样式 */
   .ProseMirror { ... }

   /* 如有冲突,添加作用域 */
   .tiptap-editor .ProseMirror { ... }
   ```

## 4. Markdown 扩展

### 决策

继续使用 rafa 已安装的 `tiptap-markdown` 0.9.0,参考项目未使用 Markdown 扩展,需要在迁移时保留。

### 理由

- rafa 的笔记数据以 Markdown 格式存储,必须保留 Markdown 支持
- `tiptap-markdown` 已集成在当前的 `EditorProvider` 中
- 参考项目的编辑器可以无缝添加 Markdown 扩展

### 集成方式

在 `NoteEditor` 组件中,将 `tiptap-markdown` 添加到 `extensions` 数组:

```typescript
import { Markdown } from 'tiptap-markdown'

const customExtensions: EditorProviderProps['extensions'] = [
  Markdown.configure({
    transformPastedText: true,
    transformCopiedText: true,
  }),
]

<EditorProvider
  extensions={customExtensions}
  // ... 其他 props
>
```

### 验证

- 测试 Markdown 序列化:编辑器内容 → Markdown 字符串
- 测试 Markdown 反序列化:Markdown 字符串 → 编辑器内容
- 测试粘贴 Markdown 文本的转换
- 测试复制编辑器内容为 Markdown

## ~~5. 移动端适配~~ ❌ 不实施

### 决策

**不实施移动端适配** - rafa 是桌面端 Electron 应用,无需移动端支持。

### 理由

- rafa 是 Electron 桌面应用,不会在移动设备上运行
- 无需 `FloatingToolbar` 或响应式工具栏
- 简化实施,专注于桌面端体验

### 移除的功能

- ❌ 移动端浮动工具栏 (`FloatingToolbar`)
- ❌ 移动端工具栏分组 (`mobile-toolbar-group.tsx`)
- ❌ 响应式工具栏切换逻辑

## ~~6. 图片占位符~~ ❌ 不实施

### 决策

**不支持图片功能** - rafa 笔记仅支持文本格式,不支持图片插入。

### 理由

- rafa 的笔记定位为纯文本知识库,用于 RAG 和 embedding
- 图片会干扰文本 embedding 的质量和检索准确性
- 图片需要额外的存储和管理成本
- 简化编辑器,专注于文本内容

### 移除的功能

- ❌ 图片扩展 (`image.tsx`, `image-placeholder.tsx`)
- ❌ 图片占位符工具栏按钮 (`image-placeholder-toolbar.tsx`)
- ❌ 斜杠命令中的图片插入选项

### 数据纯度优势

**对 Embedding 的好处**:
- ✅ 纯文本内容,语义清晰
- ✅ 无二进制数据干扰
- ✅ 向量检索质量更高

**对对话引用的好处**:
- ✅ 引用内容完全可读
- ✅ 无需处理图片 URL 或占位符
- ✅ 用户体验更简洁

## 7. 搜索替换

### 决策

使用参考项目的搜索替换功能,作为增强功能添加到桌面端工具栏。

### 理由

- 搜索替换是笔记编辑的实用功能
- 参考项目已实现完整的搜索替换逻辑 (使用自定义 TipTap 扩展)
- 不影响现有功能,可以作为新增功能提供

### 实现细节

**搜索替换扩展** (`extensions/search-and-replace.tsx`):
- 基于 TipTap 的 `Extension.create()` 创建自定义扩展
- 提供 `find`, `replace`, `replaceAll` 命令
- 高亮显示所有匹配项

**工具栏集成** (`toolbars/search-and-replace-toolbar.tsx`):
- 在桌面端工具栏最右侧添加搜索图标
- 点击后显示搜索/替换输入框
- 支持正则表达式搜索 (可选)

### 测试

- 测试搜索功能:输入关键词,验证高亮显示
- 测试单个替换:替换当前匹配项
- 测试全部替换:替换所有匹配项
- 测试性能:在大文档 (1000+ 字符) 中搜索

## 8. 工具栏状态管理

### 决策

使用参考项目的 `ToolbarProvider` 管理工具栏状态,基于 React Context。

### 理由

- `ToolbarProvider` 提供编辑器实例到所有工具栏按钮
- 避免 prop drilling,简化组件树
- 与 TipTap v3 的 `useCurrentEditor` Hook 配合良好

### 实现

**ToolbarProvider** (`toolbars/toolbar-provider.tsx`):
```typescript
export const ToolbarProvider = ({ editor, children }) => {
  return (
    <TooltipProvider>
      {children}
    </TooltipProvider>
  )
}
```

**工具栏按钮使用**:
```typescript
export function BoldToolbar() {
  const { editor } = useCurrentEditor()

  if (!editor) return null

  return (
    <Toggle
      pressed={editor.isActive('bold')}
      onPressedChange={() => editor.chain().focus().toggleBold().run()}
    >
      <Bold className="h-4 w-4" />
    </Toggle>
  )
}
```

### 集成步骤

1. 复制 `toolbar-provider.tsx`
2. 在 `EditorToolbar` 和 `FloatingToolbar` 中包裹 `ToolbarProvider`
3. 所有工具栏按钮使用 `useCurrentEditor` 获取编辑器实例

## 9. 依赖检查

### 当前已安装依赖

✅ 已安装 (无需新增):
- `@tiptap/core`: 3.7.2
- `@tiptap/react`: 3.7.2
- `@tiptap/starter-kit`: 3.7.2
- `@tiptap/extension-*`: 3.7.2 (所有需要的扩展)
- `tiptap-markdown`: 0.9.0
- `lowlight`: (已安装,用于代码高亮)
- `fuse.js`: 7.1.0 (用于斜杠命令模糊搜索)
- `tippy.js`: (需确认版本)

### 需要确认的依赖

**tippy.js**:
- 参考项目使用 `tippy.js` 用于浮动菜单定位
- 检查 rafa 是否已安装: `grep tippy package.json`
- 如未安装,需要添加 (但根据要求,应已包含在 TipTap 的依赖中)

**@radix-ui 组件**:
- rafa 已安装所有 shadcn/ui 组件 (Tooltip, Toggle, Separator 等)
- 参考项目使用的所有 Radix 组件均已覆盖

## 总结

### 关键决策

1. **组件结构**: 采用参考项目的模块化结构,独立的工具栏组件文件
2. **TipTap 版本**: 迁移到 v3.7.2 API (EditorProvider, useCurrentEditor)
3. **样式**: 独立 CSS 文件,检查冲突后集成
4. **Markdown**: 保留 `tiptap-markdown` 扩展,在迁移时集成
5. **移动端**: ❌ 不实施 (桌面端 Electron 应用)
6. **图片**: ❌ 不支持 (纯文本知识库,专注 embedding 质量)
7. **搜索替换**: 作为新增功能添加
8. **状态管理**: 使用 `ToolbarProvider` + `useCurrentEditor`

### 功能范围明确

**支持的功能** ✅:
- 基础富文本编辑 (加粗、斜体、下划线等)
- 标题 (H1-H3)
- 列表 (有序、无序、任务列表)
- 引用、代码块
- 表格编辑
- 颜色和高亮
- 文本对齐
- 搜索替换
- Markdown 双向转换
- 自动保存和 embedding

**不支持的功能** ❌:
- 图片插入 (保持纯文本)
- 视频/音频嵌入
- 移动端适配
- 文件附件

### 风险与缓解

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| TipTap v2→v3 API 变更 | 中 | 详细的 API 映射表,逐步迁移 ✅ |
| 样式冲突 | 低 | 作用域样式,冲突检测 ✅ |
| Markdown 兼容性 | 中 | 充分测试现有笔记数据 ✅ |
| ~~移动端交互问题~~ | N/A | ❌ 不适用 (桌面应用) |
| 性能回归 | 低 | 性能基准测试 |

### 实施状态

✅ **Phase 1-4 已完成** (MVP 功能)
- 基础编辑器集成
- Markdown 支持
- 自动保存集成
- 所有核心功能可用

⏳ **待完成**:
- Phase 5: 高级格式化 (颜色、对齐、搜索)
- Phase 6: 表格编辑优化
- Phase 7: 字符数统计
- Phase 8: 清理与优化
