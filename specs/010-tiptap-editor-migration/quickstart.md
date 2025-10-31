# 快速开始: TipTap 编辑器迁移

**日期**: 2025-10-24
**目标**: 帮助开发者理解新编辑器的使用方式和自定义方法

## 概述

本次迁移将笔记编辑器从当前的单文件实现替换为参考项目的模块化组件结构。新编辑器提供:

- 🎨 桌面端固定工具栏 + 移动端浮动工具栏
- 📱 完整的移动端支持
- 🔍 搜索和替换功能
- ⌨️ 斜杠命令快捷菜单
- 🧩 模块化的工具栏组件

## 目录结构

```
client/src/renderer/src/components/
├── note/
│   └── note-editor.tsx              # 使用新编辑器的容器组件
├── ui/
│   └── editor/
│       └── index.tsx                # (可选) 基础编辑器组件导出
└── tiptap/                          # 新增: 所有 TipTap 相关组件
    ├── extensions/                   # TipTap 自定义扩展
    │   ├── floating-menu.tsx         # 斜杠命令菜单
    │   ├── floating-toolbar.tsx      # 移动端浮动工具栏
    │   ├── image-placeholder.tsx     # 图片占位符扩展
    │   ├── image.tsx                 # 图片扩展
    │   └── search-and-replace.tsx    # 搜索替换扩展
    ├── toolbars/                     # 工具栏组件
    │   ├── editor-toolbar.tsx        # 桌面端主工具栏
    │   ├── toolbar-provider.tsx      # 工具栏上下文
    │   └── [各种工具栏按钮].tsx      # 独立的按钮组件
    └── tiptap.css                    # 编辑器样式
```

## 1. 在 NoteEditor 中使用新编辑器

### 基本使用

```typescript
import { RichTextEditor } from '@/components/tiptap/rich-text-editor'
import { Markdown } from 'tiptap-markdown'

export function NoteEditor({ noteId, initialContent, ... }: NoteEditorProps) {
  const [content, setContent] = React.useState(initialContent)

  // 自定义扩展: 添加 Markdown 支持
  const extensions = React.useMemo(() => [
    Markdown.configure({
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ], [])

  return (
    <RichTextEditor
      content={content}
      extensions={extensions}
      onUpdate={({ editor }) => {
        // 获取 Markdown 格式的内容
        const markdown = editor.storage.markdown.getMarkdown()
        setContent(markdown)
      }}
    />
  )
}
```

### 集成自动保存

```typescript
import { useAutoSaveNote } from '@/hooks/note/useAutoSaveNote'

export function NoteEditor({ noteId, ... }: NoteEditorProps) {
  const [markdown, setMarkdown] = React.useState(initialContent)
  const { autoSave } = useAutoSaveNote({ noteId, ... })

  const handleUpdate = React.useCallback(({ editor }) => {
    const currentMarkdown = editor.storage.markdown.getMarkdown()
    setMarkdown(currentMarkdown)

    // 触发自动保存
    autoSave(title, currentMarkdown)
  }, [autoSave, title])

  return (
    <RichTextEditor
      content={markdown}
      onUpdate={handleUpdate}
    />
  )
}
```

### 完整示例 (保留现有 API)

```typescript
export function NoteEditor({
  noteId,
  initialTitle,
  initialContent,
  autoSave = true,
  autoEmbed = true,
  saveDebounceMs = 20000,
  embedDebounceMs = 30000,
}: NoteEditorProps) {
  const [title, setTitle] = React.useState(initialTitle ?? '')
  const [markdown, setMarkdown] = React.useState(initialContent ?? '')
  const [editor, setEditor] = React.useState<Editor | null>(null)

  // 自动保存 hook
  const {
    isSaving,
    isEmbedding,
    saveStatus,
    autoSave: performAutoSave,
  } = useAutoSaveNote({
    noteId,
    saveDebounceMs,
    embedDebounceMs,
    autoEmbed,
  })

  // Markdown 扩展配置
  const customExtensions = React.useMemo(() => [
    Markdown.configure({
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ], [])

  return (
    <div className="flex h-full flex-1 flex-col p-4">
      <div className="mx-auto w-full max-w-3xl py-8">
        {/* 标题输入 */}
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (autoSave) performAutoSave(e.target.value, markdown)
          }}
          placeholder="Untitled note"
        />

        {/* 编辑器 */}
        <RichTextEditor
          content={markdown}
          extensions={customExtensions}
          placeholder="Start writing here..."
          onCreate={({ editor }) => setEditor(editor)}
          onUpdate={({ editor }) => {
            const newMarkdown = editor.storage.markdown.getMarkdown()
            setMarkdown(newMarkdown)
            if (autoSave) performAutoSave(title, newMarkdown)
          }}
        />
      </div>
    </div>
  )
}
```

## 2. 自定义工具栏按钮

### 添加新按钮

创建新的工具栏按钮文件 `toolbars/my-custom-button.tsx`:

```typescript
import { useCurrentEditor } from '@tiptap/react'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Icon } from 'lucide-react'

export function MyCustomButton() {
  const { editor } = useCurrentEditor()

  if (!editor) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          size="sm"
          pressed={editor.isActive('customMark')}
          onPressedChange={() => {
            editor.chain().focus().toggleCustomMark().run()
          }}
        >
          <Icon className="h-4 w-4" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>
        <p>Toggle custom mark</p>
      </TooltipContent>
    </Tooltip>
  )
}
```

### 集成到工具栏

在 `toolbars/editor-toolbar.tsx` 中添加按钮:

```typescript
import { MyCustomButton } from './my-custom-button'

export const EditorToolbar = ({ editor }: { editor: Editor }) => {
  return (
    <div className="sticky top-0 z-20 w-full border-b bg-background">
      <ToolbarProvider editor={editor}>
        <div className="flex items-center gap-1 px-2">
          {/* 现有按钮 */}
          <BoldToolbar />
          <ItalicToolbar />
          <Separator orientation="vertical" className="mx-1 h-7" />

          {/* 添加自定义按钮 */}
          <MyCustomButton />
        </div>
      </ToolbarProvider>
    </div>
  )
}
```

## 3. 添加新的 TipTap 扩展

### 创建自定义扩展

```typescript
import { Extension } from '@tiptap/core'

export const CustomExtension = Extension.create({
  name: 'customExtension',

  addOptions() {
    return {
      // 扩展选项
      customOption: 'default value',
    }
  },

  addCommands() {
    return {
      toggleCustomMark: () => ({ commands }) => {
        // 自定义命令逻辑
        return commands.toggleMark('customMark')
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-X': () => this.editor.commands.toggleCustomMark(),
    }
  },
})
```

### 在编辑器中使用

```typescript
import { CustomExtension } from '@/components/tiptap/extensions/custom-extension'

const extensions = [
  CustomExtension.configure({
    customOption: 'my value',
  }),
  // ... 其他扩展
]

<RichTextEditor
  extensions={extensions}
  // ...
/>
```

## 4. 调试编辑器问题

### 检查编辑器状态

```typescript
const { editor } = useCurrentEditor()

if (editor) {
  // 查看当前内容
  console.log('HTML:', editor.getHTML())
  console.log('JSON:', editor.getJSON())
  console.log('Markdown:', editor.storage.markdown.getMarkdown())

  // 查看激活状态
  console.log('Bold active:', editor.isActive('bold'))
  console.log('Current marks:', editor.state.storedMarks)

  // 查看光标位置
  console.log('Selection:', editor.state.selection)
}
```

### 监听编辑器事件

```typescript
<RichTextEditor
  onCreate={({ editor }) => {
    console.log('Editor created:', editor)
  }}
  onUpdate={({ editor }) => {
    console.log('Content updated:', editor.getHTML())
  }}
  onSelectionUpdate={({ editor }) => {
    console.log('Selection changed:', editor.state.selection)
  }}
  onFocus={() => {
    console.log('Editor focused')
  }}
  onBlur={() => {
    console.log('Editor blurred')
  }}
/>
```

### 常见问题

**问题 1: Markdown 扩展未生效**

确保 `Markdown` 扩展已添加到 `extensions` 数组:

```typescript
const extensions = [
  Markdown.configure({ ... }),
  // ... 其他扩展
]
```

**问题 2: 工具栏按钮无响应**

检查 `useCurrentEditor` 是否返回有效的 editor 实例:

```typescript
const { editor } = useCurrentEditor()

if (!editor) {
  console.error('Editor not found in context')
  return null
}
```

**问题 3: 样式未应用**

确保 `tiptap.css` 已导入:

```typescript
import '@/components/tiptap/tiptap.css'
```

## 5. 处理样式冲突

### 检查样式冲突

1. 打开开发者工具
2. 检查编辑器元素的 computed styles
3. 查找被覆盖的样式规则

### 解决冲突

**方法 1: 提高优先级**

在 `tiptap.css` 中添加作用域:

```css
/* 原样式 */
.ProseMirror {
  outline: none;
}

/* 添加作用域提高优先级 */
.tiptap-editor .ProseMirror {
  outline: none !important;
}
```

**方法 2: 使用 CSS 模块**

将 `tiptap.css` 改为 `tiptap.module.css`:

```css
/* tiptap.module.css */
.proseMirror {
  outline: none;
}
```

```typescript
import styles from './tiptap.module.css'

<div className={styles.proseMirror}>
  <EditorContent />
</div>
```

**方法 3: 覆盖全局样式**

在项目的全局样式文件中覆盖:

```css
/* globals.css */
.ProseMirror {
  /* 覆盖 tiptap.css 的样式 */
  font-family: var(--font-sans);
  line-height: 1.6;
}
```

## 6. 性能优化

### 优化渲染

使用 `React.memo` 包裹工具栏组件:

```typescript
export const BoldToolbar = React.memo(() => {
  const { editor } = useCurrentEditor()
  // ...
})
```

### 优化扩展配置

使用 `useMemo` 缓存扩展数组:

```typescript
const extensions = React.useMemo(() => [
  Markdown.configure({ ... }),
  // ... 其他扩展
], []) // 空依赖数组,仅创建一次
```

### 优化自动保存

调整防抖时间,平衡性能和数据安全:

```typescript
<NoteEditor
  saveDebounceMs={20000}   // 20秒保存一次
  embedDebounceMs={30000}  // 30秒 embedding 一次
/>
```

## 7. 测试清单

在部署前,确保测试以下功能:

### 基本编辑
- [ ] 输入文本
- [ ] 加粗、斜体、下划线、删除线
- [ ] 标题 (H1, H2, H3)
- [ ] 列表 (有序、无序、任务)
- [ ] 引用、代码块

### 高级功能
- [ ] 斜杠命令菜单
- [ ] 搜索和替换
- [ ] 表格操作
- [ ] 颜色和高亮
- [ ] 文本对齐

### 集成
- [ ] 自动保存 (20秒后触发)
- [ ] Embedding (30秒后触发)
- [ ] Markdown 序列化/反序列化
- [ ] 刷新后内容恢复

### 响应式
- [ ] 桌面端固定工具栏
- [ ] 移动端浮动工具栏
- [ ] 小屏幕 (<640px) 体验

### 性能
- [ ] 输入响应 <100ms
- [ ] 斜杠命令搜索 <1秒
- [ ] 字符数统计实时更新

## 8. 迁移检查表

- [ ] 复制 `components/tiptap` 目录到项目
- [ ] 调整所有导入路径
- [ ] 集成 `tiptap.css` 样式文件
- [ ] 修改 `NoteEditor` 使用新编辑器
- [ ] 添加 `Markdown` 扩展
- [ ] 测试桌面端工具栏
- [ ] 测试移动端浮动工具栏
- [ ] 测试自动保存功能
- [ ] 测试 Markdown 兼容性
- [ ] 性能基准测试
- [ ] 清理旧代码

## 参考资料

- [TipTap v3 文档](https://tiptap.dev/)
- [TipTap 扩展指南](https://tiptap.dev/guide/custom-extensions)
- [参考项目](https://github.com/ehtisham-afzal/tiptap-shadcn)
- [tiptap-markdown](https://github.com/aguingand/tiptap-markdown)

## 获取帮助

如遇到问题:
1. 检查控制台错误日志
2. 查看 TipTap 官方文档
3. 参考 `research.md` 中的技术决策
4. 查看参考项目的实现示例
