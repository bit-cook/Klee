# 快速开始指南：Private Mode 知识库模块

**功能分支**: `007-private-knowledge-base`
**创建日期**: 2025-10-22
**关联文档**: [plan.md](./plan.md) | [data-model.md](./data-model.md) | [contracts/ipc-api.md](./contracts/ipc-api.md)

## 概述

Private Mode 知识库模块允许用户在完全离线的环境下创建和管理知识库，上传文件并进行向量检索，所有数据和 AI 推理都在本地进行。本指南将帮助您快速了解如何使用该功能。

**核心特性**:
- ✅ 完全离线运行（无网络请求）
- ✅ 本地向量检索（LanceDB）
- ✅ 支持多种文件格式（PDF、DOCX、TXT、MD、JSON）
- ✅ 与 Cloud Mode UI 完全一致
- ✅ 自动文本提取和分块
- ✅ 使用 Ollama nomic-embed-text 生成 embeddings

---

## 前置要求

### 1. 确保 Ollama 已启动

Private Mode 依赖 Ollama 生成 embeddings，请确保：

- 系统 Ollama 已安装（推荐）或 electron-ollama 已下载
- Ollama 服务正在运行（`localhost:11434`）
- 已拉取 nomic-embed-text 模型：
  ```bash
  ollama pull nomic-embed-text
  ```

**检查 Ollama 状态**:
```typescript
// 在渲染进程中
import { useOllamaSource } from '@/hooks/mode/useOllamaSource'

function MyComponent() {
  const { source, isInitializing } = useOllamaSource()

  if (source === 'none' || isInitializing) {
    return <div>Waiting for Ollama to initialize...</div>
  }

  // Ollama 已就绪，可以使用 Private Mode
}
```

### 2. 切换到 Private Mode

在应用中切换到 Private Mode：

```typescript
import { useMode } from '@/contexts/ModeContext'

function ModeToggle() {
  const { mode, setMode } = useMode()

  return (
    <button onClick={() => setMode('private')}>
      Switch to Private Mode
    </button>
  )
}
```

---

## 快速上手步骤

### 步骤 1: 创建知识库

**UI 层调用**:

```typescript
import { useCreateKnowledgeBase } from '@/hooks/knowledge-base/mutations/useCreateKnowledgeBase'

function CreateKnowledgeBaseButton() {
  const createMutation = useCreateKnowledgeBase()

  const handleCreate = () => {
    createMutation.mutate(
      {
        name: 'AI 研究论文集',
        description: '收集 2023-2024 年的 AI 相关论文',
      },
      {
        onSuccess: (data) => {
          console.log('Created:', data.knowledgeBase)
          toast.success('Knowledge base created')
        },
        onError: (error) => {
          toast.error(error.message)
        },
      }
    )
  }

  return (
    <button onClick={handleCreate}>
      Create Knowledge Base
    </button>
  )
}
```

**直接 IPC 调用**:

```typescript
// 直接调用 IPC API（不使用 React hooks）
const { knowledgeBase } = await window.api.knowledgeBase.create({
  name: 'AI 研究论文集',
  description: '收集 2023-2024 年的 AI 相关论文',
})

console.log('Created knowledge base:', knowledgeBase)
// {
//   id: '550e8400-e29b-41d4-a716-446655440000',
//   name: 'AI 研究论文集',
//   description: '收集 2023-2024 年的 AI 相关论文',
//   starred: false,
//   createdAt: Date,
//   updatedAt: Date
// }
```

---

### 步骤 2: 上传文件

**UI 层调用**:

```typescript
import { useUploadFile } from '@/hooks/knowledge-base/mutations/useUploadFile'

function FileUpload({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const uploadMutation = useUploadFile()
  const [uploadProgress, setUploadProgress] = useState<number>(0)

  useEffect(() => {
    // 监听文件处理进度
    const handler = (event, progress) => {
      setUploadProgress(progress.percent)
      console.log(`Stage: ${progress.stage}, Progress: ${progress.percent}%`)
    }

    window.electron.ipcRenderer.on('file-processing-progress', handler)

    return () => {
      window.electron.ipcRenderer.removeListener('file-processing-progress', handler)
    }
  }, [])

  const handleUpload = async (file: File) => {
    const fileBuffer = await file.arrayBuffer()

    uploadMutation.mutate(
      {
        knowledgeBaseId,
        fileBuffer,
        fileName: file.name,
        fileSize: file.size,
      },
      {
        onSuccess: (data) => {
          console.log('Upload started:', data.fileId)
          toast.success('File upload started')
        },
        onError: (error) => {
          toast.error(error.message)
        },
      }
    )
  }

  return (
    <div>
      <input
        type="file"
        accept=".pdf,.docx,.txt,.md,.json"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
        }}
      />
      {uploadProgress > 0 && (
        <div>
          <progress value={uploadProgress} max={100} />
          <span>{uploadProgress}%</span>
        </div>
      )}
    </div>
  )
}
```

**直接 IPC 调用**:

```typescript
// 选择文件
const fileInput = document.querySelector('input[type="file"]')
const file = fileInput.files[0]

// 读取文件为 ArrayBuffer
const fileBuffer = await file.arrayBuffer()

// 上传文件
const { fileId, status } = await window.api.knowledgeBase.uploadFile({
  knowledgeBaseId: '550e8400-e29b-41d4-a716-446655440000',
  fileBuffer,
  fileName: file.name,
  fileSize: file.size,
})

console.log('File upload started:', fileId)  // 立即返回文件 ID

// 监听处理进度
window.electron.ipcRenderer.on('file-processing-progress', (event, progress) => {
  if (progress.fileId === fileId) {
    console.log(`Stage: ${progress.stage}, Progress: ${progress.percent}%`)

    if (progress.stage === 'completed') {
      console.log('File processing completed!')
    }
  }
})

// 监听错误
window.electron.ipcRenderer.on('file-processing-error', (event, error) => {
  if (error.fileId === fileId) {
    console.error('Processing failed:', error.error)
  }
})
```

**文件处理阶段**:

| 阶段 | 描述 | 进度范围 |
|------|------|----------|
| `extracting` | 提取文本（PDF/DOCX → 纯文本） | 10%-30% |
| `chunking` | 文本分块（1000字符，200字符重叠） | 30%-50% |
| `embedding` | 生成 embeddings（调用 Ollama） | 50%-90% |
| `saving` | 存储到 LanceDB 和本地文件系统 | 90%-100% |
| `completed` | 处理完成 | 100% |

---

### 步骤 3: 在聊天中使用知识库

**向量检索（RAG）**:

```typescript
import { useKnowledgeBaseSearch } from '@/hooks/knowledge-base/queries/useKnowledgeBaseSearch'

function ChatInput({ knowledgeBaseIds }: { knowledgeBaseIds: string[] }) {
  const [query, setQuery] = useState('')

  const handleSubmit = async () => {
    // 1. 执行向量检索
    const { results } = await window.api.knowledgeBase.search(
      query,
      knowledgeBaseIds,
      5  // 返回前 5 个最相关的文档片段
    )

    console.log('Search results:', results)
    // [
    //   {
    //     content: 'The dominant sequence transduction models...',
    //     similarity: 0.85,
    //     fileId: '660e8400-...',
    //     fileName: 'attention-is-all-you-need.pdf'
    //   },
    //   ...
    // ]

    // 2. 构建 RAG prompt
    const context = results.map(r => r.content).join('\n\n')
    const ragPrompt = `Context:\n${context}\n\nQuestion: ${query}`

    // 3. 发送到 AI 模型
    // ... 调用本地聊天 API
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask a question..."
      />
      <button onClick={handleSubmit}>Submit</button>
    </div>
  )
}
```

---

## 示例代码

### 完整的知识库管理流程

```typescript
import { useMode } from '@/contexts/ModeContext'
import { useKnowledgeBases } from '@/hooks/knowledge-base/queries/useKnowledgeBases'
import { useCreateKnowledgeBase } from '@/hooks/knowledge-base/mutations/useCreateKnowledgeBase'
import { useUpdateKnowledgeBase } from '@/hooks/knowledge-base/mutations/useUpdateKnowledgeBase'
import { useDeleteKnowledgeBase } from '@/hooks/knowledge-base/mutations/useDeleteKnowledgeBase'

function KnowledgeBaseManager() {
  const { mode } = useMode()
  const { data, isLoading } = useKnowledgeBases()  // 自动根据 mode 切换数据源
  const createMutation = useCreateKnowledgeBase()
  const updateMutation = useUpdateKnowledgeBase()
  const deleteMutation = useDeleteKnowledgeBase()

  if (isLoading) return <div>Loading...</div>

  return (
    <div>
      <h1>Knowledge Bases ({mode === 'cloud' ? 'Cloud' : 'Private'})</h1>

      {/* 创建知识库 */}
      <button
        onClick={() => {
          createMutation.mutate({
            name: 'New Knowledge Base',
            description: 'Description...',
          })
        }}
      >
        Create Knowledge Base
      </button>

      {/* 知识库列表 */}
      {data?.knowledgeBases.map((kb) => (
        <div key={kb.id}>
          <h3>{kb.name}</h3>
          <p>{kb.description}</p>

          {/* 切换星标 */}
          <button
            onClick={() => {
              updateMutation.mutate({
                id: kb.id,
                starred: !kb.starred,
              })
            }}
          >
            {kb.starred ? '⭐ Starred' : '☆ Star'}
          </button>

          {/* 删除知识库 */}
          <button
            onClick={() => {
              if (confirm('Delete this knowledge base?')) {
                deleteMutation.mutate(kb.id)
              }
            }}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}
```

---

## 故障排查

### 问题 1: Ollama 未启动

**症状**: 创建知识库后上传文件，文件状态一直是 `processing`，最终变为 `failed`

**解决方案**:
1. 检查 Ollama 是否运行：
   ```bash
   curl http://localhost:11434/api/version
   ```
2. 如果未运行，启动 Ollama：
   ```bash
   ollama serve
   ```
3. 拉取 embedding 模型：
   ```bash
   ollama pull nomic-embed-text
   ```

---

### 问题 2: 文件处理失败

**症状**: 上传文件后收到 `file-processing-error` 事件

**可能原因**:
- 文件大小超过 100MB 限制
- 不支持的文件类型
- 文件损坏或格式异常

**解决方案**:
1. 检查文件大小：
   ```typescript
   if (file.size > 100 * 1024 * 1024) {
     alert('File size exceeds 100MB limit')
     return
   }
   ```
2. 检查文件类型：
   ```typescript
   const supportedTypes = [
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'text/plain',
     'text/markdown',
     'application/json',
   ]
   if (!supportedTypes.includes(file.type)) {
     alert('Unsupported file type')
     return
   }
   ```
3. 尝试重新上传文件

---

### 问题 3: 向量搜索无结果

**症状**: 调用 `window.api.knowledgeBase.search()` 返回空数组

**可能原因**:
- 文件尚未处理完成（状态仍为 `processing`）
- 查询文本与知识库内容不相关
- 知识库为空（无文件）

**解决方案**:
1. 检查文件状态：
   ```typescript
   const { files } = await window.api.knowledgeBase.get(knowledgeBaseId)
   const allCompleted = files.every(f => f.status === 'completed')
   if (!allCompleted) {
     console.log('Some files are still processing')
   }
   ```
2. 尝试更宽泛的查询文本
3. 检查知识库是否包含文件

---

### 问题 4: UI 在 Cloud 和 Private 模式间切换异常

**症状**: 切换模式后数据未刷新，或显示错误的数据

**解决方案**:
1. 确保 `useKnowledgeBases` 等 hooks 正确使用 `mode` 状态：
   ```typescript
   export function useKnowledgeBases() {
     const { mode } = useMode()

     return useQuery({
       queryKey: ['knowledgeBases', mode],  // ✅ 包含 mode 在 queryKey 中
       queryFn: async () => {
         if (mode === 'cloud') {
           const res = await honoClient.api.knowledgebase.$get()
           return res.json()
         } else {
           return await window.api.knowledgeBase.list()
         }
       },
     })
   }
   ```
2. 切换模式后手动失效缓存：
   ```typescript
   import { useQueryClient } from '@tanstack/react-query'

   function ModeToggle() {
     const { setMode } = useMode()
     const queryClient = useQueryClient()

     const handleSwitch = (newMode: 'cloud' | 'private') => {
       setMode(newMode)
       queryClient.invalidateQueries({ queryKey: ['knowledgeBases'] })
     }

     return (
       <button onClick={() => handleSwitch('private')}>
         Switch to Private Mode
       </button>
     )
   }
   ```

---

### 问题 5: 数据库损坏或初始化失败

**症状**: 应用启动时报错 `Failed to open database` 或 `Table not found`

**解决方案**:
1. 检查数据库文件路径：
   ```typescript
   import { app } from 'electron'
   import path from 'path'

   const dbPath = path.join(app.getPath('userData'), 'private.db')
   console.log('Database path:', dbPath)
   ```
2. 删除损坏的数据库文件（⚠️ 会丢失所有 Private Mode 数据）：
   ```bash
   # macOS
   rm ~/Library/Application\ Support/rafa/private.db
   rm -rf ~/Library/Application\ Support/rafa/vector-db
   rm -rf ~/Library/Application\ Support/rafa/documents
   ```
3. 重新启动应用，数据库会自动初始化

---

## 常见使用场景

### 场景 1: 研究论文管理

```typescript
// 1. 创建知识库
const { knowledgeBase } = await window.api.knowledgeBase.create({
  name: 'AI Research Papers',
  description: 'Collection of recent AI papers (2023-2024)',
})

// 2. 批量上传论文
const pdfFiles = [
  'attention-is-all-you-need.pdf',
  'bert-paper.pdf',
  'gpt3-paper.pdf',
]

for (const file of pdfFiles) {
  const fileBuffer = await fetch(`/papers/${file}`).then(r => r.arrayBuffer())
  await window.api.knowledgeBase.uploadFile({
    knowledgeBaseId: knowledgeBase.id,
    fileBuffer,
    fileName: file,
    fileSize: fileBuffer.byteLength,
  })
}

// 3. 在聊天中查询
const { results } = await window.api.knowledgeBase.search(
  'What is the attention mechanism in transformers?',
  [knowledgeBase.id],
  5
)
```

---

### 场景 2: 个人笔记整理

```typescript
// 1. 创建知识库
const { knowledgeBase } = await window.api.knowledgeBase.create({
  name: 'Personal Notes',
  description: 'My coding notes and learnings',
})

// 2. 上传 Markdown 笔记
const markdownFiles = [
  'react-hooks-notes.md',
  'typescript-tips.md',
  'electron-ipc-guide.md',
]

for (const file of markdownFiles) {
  const content = await fetch(`/notes/${file}`).then(r => r.text())
  const fileBuffer = new TextEncoder().encode(content).buffer

  await window.api.knowledgeBase.uploadFile({
    knowledgeBaseId: knowledgeBase.id,
    fileBuffer,
    fileName: file,
    fileSize: fileBuffer.byteLength,
  })
}

// 3. 搜索笔记
const { results } = await window.api.knowledgeBase.search(
  'How to use useEffect with cleanup?',
  [knowledgeBase.id],
  3
)
```

---

## 性能优化建议

### 1. 文件上传优化

```typescript
// ✅ 使用批量上传（一次上传多个文件）
async function uploadMultipleFiles(files: File[], knowledgeBaseId: string) {
  const uploadPromises = files.map(async (file) => {
    const fileBuffer = await file.arrayBuffer()
    return window.api.knowledgeBase.uploadFile({
      knowledgeBaseId,
      fileBuffer,
      fileName: file.name,
      fileSize: file.size,
    })
  })

  // 并行上传（主进程会串行处理，但渲染进程不会阻塞）
  await Promise.all(uploadPromises)
}
```

### 2. 查询缓存优化

```typescript
// ✅ 使用 TanStack Query 缓存搜索结果
import { useQuery } from '@tanstack/react-query'

export function useKnowledgeBaseSearch(query: string, kbIds: string[]) {
  return useQuery({
    queryKey: ['kb-search', query, kbIds],
    queryFn: async () => {
      return await window.api.knowledgeBase.search(query, kbIds, 5)
    },
    staleTime: 5 * 60 * 1000,  // 5 分钟缓存
    enabled: !!query && kbIds.length > 0,
  })
}
```

### 3. 向量搜索优化

```typescript
// ✅ 限制搜索的知识库数量
const relevantKbIds = knowledgeBases
  .filter(kb => kb.starred)  // 仅搜索星标知识库
  .map(kb => kb.id)
  .slice(0, 3)  // 最多搜索 3 个知识库

const { results } = await window.api.knowledgeBase.search(
  query,
  relevantKbIds,
  5
)
```

---

## 下一步

现在您已经了解了 Private Mode 知识库模块的基本使用方法，接下来可以：

1. **运行 `/speckit.tasks` 命令**生成详细的任务清单（`tasks.md`）
2. **按照任务清单**逐步实现功能
3. **参考文档**：
   - [plan.md](./plan.md) - 完整的实施计划
   - [data-model.md](./data-model.md) - 数据模型定义
   - [contracts/ipc-api.md](./contracts/ipc-api.md) - IPC API 契约

如有疑问，请参考故障排查部分或查阅相关文档。
