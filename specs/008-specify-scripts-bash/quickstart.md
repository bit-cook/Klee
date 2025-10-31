# Quickstart: Marketplace Private Mode 开发指南

**Feature**: Marketplace Private Mode - 本地开源大模型管理
**Date**: 2025-10-23
**Target Audience**: 开发团队成员

## 概述

本指南帮助开发者快速上手 Marketplace Private Mode 功能的开发。按照以下步骤，您可以在 30 分钟内搭建完整的开发环境并理解核心架构。

---

## 1. 前置条件

### 1.1 系统要求

- **Node.js**: v20+ （项目使用 v22.14.0）
- **npm**: v9+
- **Ollama**: 0.6.0+ （系统安装或 electron-ollama）
- **磁盘空间**: 至少 10GB 可用（用于测试模型下载）

### 1.2 安装 Ollama（可选）

如果您想在开发时使用系统 Ollama：

\`\`\`bash
# macOS (Homebrew)
brew install ollama

# 启动服务
ollama serve

# 验证
curl http://localhost:11434/api/tags
\`\`\`

**注意**: 如果不安装系统 Ollama，electron-ollama 会自动在应用启动时初始化。

---

## 2. 项目设置

### 2.1 安装依赖

\`\`\`bash
cd /path/to/rafa
npm install

# 安装并发下载队列库
npm install p-queue
\`\`\`

### 2.2 启动开发服务器

\`\`\`bash
# 启动客户端和服务器
npm run dev

# 或分别启动
npm run client:dev  # Vite + Electron (端口 5173)
npm run server:dev  # Hono API (端口 3000)
\`\`\`

### 2.3 验证环境

1. 打开应用，切换到 **Private Mode**
2. 打开 DevTools (Cmd+Option+I)
3. 在 Console 中运行：
   \`\`\`javascript
   fetch('http://localhost:11434/api/tags').then(r => r.json()).then(console.log)
   \`\`\`
4. 应该看到 Ollama API 返回的模型列表（如果为空也正常）

---

## 3. 核心文件位置

### 3.1 配置文件

| 文件 | 用途 |
|------|------|
| \`client/src/renderer/src/config/models.ts\` | 模型配置（本地+云端） |
| \`client/src/renderer/src/config/local.config.ts\` | Ollama 和 Private Mode 配置 |

### 3.2 主进程（Electron）

| 文件 | 用途 |
|------|------|
| \`client/src/main/local/services/ollama-manager.ts\` | Ollama 管理器（已存在） |
| \`client/src/main/local/services/disk-space-manager.ts\` | 磁盘空间检测（✨ 新增） |
| \`client/src/main/local/services/ollama-model-manager.ts\` | 模型删除管理（✨ 新增） |
| \`client/src/main/local/db/queries/models.ts\` | 模型使用查询（✨ 新增） |
| \`client/src/main/ipc/disk-space-handlers.ts\` | 磁盘空间 IPC（✨ 新增） |
| \`client/src/main/ipc/model-handlers.ts\` | 模型管理 IPC（✨ 新增） |

### 3.3 渲染进程（React）

| 文件 | 用途 |
|------|------|
| \`client/src/renderer/src/lib/ollama-client.ts\` | Ollama API 客户端（🔄 扩展） |
| \`client/src/renderer/src/lib/queryKeys.ts\` | TanStack Query 键工厂（🔄 扩展） |
| \`client/src/renderer/src/hooks/ollama-models/\` | 模型管理 Hooks（✨ 新增模块） |
| \`client/src/renderer/src/components/marketplace/\` | Marketplace 组件（✨ 新增） |
| \`client/src/renderer/src/routes/_authenticated/marketplace.index.tsx\` | Marketplace 路由（🔄 扩展） |

---

## 4. 开发流程

### 4.1 Phase 1: 模型配置（5 分钟）

**目标**: 在 marketplace 中显示可下载的本地模型列表。

**步骤**:

1. **扩展 \`models.ts\`**:
   \`\`\`typescript
   // client/src/renderer/src/config/models.ts
   
   export interface LocalLLMModel {
     name: string
     model: string
     provider: string
     size: number
     minGPU: string
     updatedAt: string
     description?: string
     tags?: string[]
   }
   
   export const localLLMModels: LocalLLMModel[] = [
     {
       name: 'Llama 3.2 1B',
       model: 'llama3.2:1b',
       provider: 'Meta',
       size: 1.3,
       minGPU: 'None',
       updatedAt: '2024-09-25',
       description: 'Ultra-lightweight, best compatibility',
       tags: ['Recommended', 'Fastest'],
     },
     // ... 添加更多模型
   ]
   \`\`\`

2. **在 marketplace 中显示**:
   \`\`\`typescript
   // client/src/renderer/src/routes/_authenticated/marketplace.index.tsx
   
   import { localLLMModels } from '@/config/models'
   
   function MarketplaceContent() {
     const { isPrivateMode } = useMode()
     
     return (
       <Tabs defaultValue="agents">
         <TabsList>
           <TabsTrigger value="agents">Agents</TabsTrigger>
           <TabsTrigger value="knowledge-bases">Knowledge Bases</TabsTrigger>
           {isPrivateMode && <TabsTrigger value="local-llms">Local LLMs</TabsTrigger>}
         </TabsList>
         
         <TabsContent value="local-llms">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {localLLMModels.map(model => (
               <Card key={model.model}>
                 <CardHeader>
                   <CardTitle>{model.name}</CardTitle>
                   <CardDescription>by {model.provider}</CardDescription>
                 </CardHeader>
                 <CardContent>
                   <p>{model.description}</p>
                   <p className="text-sm text-muted-foreground">
                     Size: {model.size} GB | GPU: {model.minGPU}
                   </p>
                 </CardContent>
               </Card>
             ))}
           </div>
         </TabsContent>
       </Tabs>
     )
   }
   \`\`\`

**验证**: 切换到 Private Mode，访问 marketplace，应该看到 "Local LLMs" 标签页。

---

### 4.2 Phase 2: 模型下载（20 分钟）

**目标**: 实现模型下载功能（支持实时进度）。

**步骤**:

1. **扩展 \`ollama-client.ts\`**:
   \`\`\`typescript
   // client/src/renderer/src/lib/ollama-client.ts
   
   export interface OllamaDownloadProgress {
     status: string
     total?: number
     completed?: number
     percent: number
   }
   
   export async function pullOllamaModel(
     modelName: string,
     onProgress: (progress: OllamaDownloadProgress) => void,
     signal?: AbortSignal
   ): Promise<void> {
     const response = await fetch('http://localhost:11434/api/pull', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ name: modelName, stream: true }),
       signal,
     })
     
     const reader = response.body?.getReader()
     const decoder = new TextDecoder()
     let buffer = ''
     
     while (true) {
       const { done, value } = await reader.read()
       if (done) break
       
       buffer += decoder.decode(value, { stream: true })
       const lines = buffer.split('\n')
       buffer = lines.pop() || ''
       
       for (const line of lines) {
         if (!line.trim()) continue
         const data = JSON.parse(line)
         
         onProgress({
           status: data.status,
           total: data.total,
           completed: data.completed,
           percent: data.total && data.completed 
             ? Math.round((data.completed / data.total) * 100) 
             : 0,
         })
       }
     }
   }
   \`\`\`

2. **创建下载 Hook**:
   \`\`\`typescript
   // client/src/renderer/src/hooks/ollama-models/mutations/useDownloadModel.ts
   
   import { useMutation } from '@tanstack/react-query'
   import { useState, useCallback, useRef } from 'react'
   import { pullOllamaModel } from '@/lib/ollama-client'
   
   export function useDownloadOllamaModel() {
     const [progress, setProgress] = useState<OllamaDownloadProgress | null>(null)
     const abortControllerRef = useRef<AbortController | null>(null)
     
     const mutation = useMutation({
       mutationFn: async (modelName: string) => {
         const controller = new AbortController()
         abortControllerRef.current = controller
         
         try {
           await pullOllamaModel(modelName, setProgress, controller.signal)
         } finally {
           abortControllerRef.current = null
         }
       },
       
       onSuccess: () => {
         setProgress({ status: 'success', percent: 100 })
       },
       
       onError: () => {
         setProgress(null)
       },
     })
     
     const cancel = useCallback(() => {
       abortControllerRef.current?.abort()
       setProgress(null)
     }, [])
     
     return {
       download: mutation.mutate,
       isDownloading: mutation.isLoading,
       progress,
       cancel,
     }
   }
   \`\`\`

3. **在 UI 中使用**:
   \`\`\`typescript
   function LocalLLMCard({ model }: { model: LocalLLMModel }) {
     const { download, isDownloading, progress, cancel } = useDownloadOllamaModel()
     
     return (
       <Card>
         <CardHeader>
           <CardTitle>{model.name}</CardTitle>
         </CardHeader>
         <CardContent>
           {!isDownloading && (
             <Button onClick={() => download(model.model)}>
               Download
             </Button>
           )}
           
           {isDownloading && progress && (
             <div>
               <Progress value={progress.percent} />
               <p>{progress.status}: {progress.percent}%</p>
               <Button onClick={cancel}>Cancel</Button>
             </div>
           )}
         </CardContent>
       </Card>
     )
   }
   \`\`\`

**验证**: 点击 "Download" 按钮，应该看到实时进度条。

---

### 4.3 Phase 3: 模型删除（15 分钟）

**目标**: 实现安全删除模型（带使用检测）。

**步骤**:

1. **主进程数据库查询**:
   \`\`\`typescript
   // client/src/main/local/db/queries/models.ts
   
   import { eq } from 'drizzle-orm'
   import { localChatSessions } from '../schema'
   
   export async function isModelInUse(db, modelId: string): Promise<boolean> {
     const sessions = await db
       .select({ id: localChatSessions.id })
       .from(localChatSessions)
       .where(eq(localChatSessions.model, modelId))
       .limit(1)
     
     return sessions.length > 0
   }
   \`\`\`

2. **IPC 处理器**:
   \`\`\`typescript
   // client/src/main/ipc/model-handlers.ts
   
   import { ipcMain } from 'electron'
   import { Ollama } from 'ollama'
   import { isModelInUse } from '../local/db/queries/models'
   import { dbManager } from '../local/db/connection-manager'
   
   const ollama = new Ollama({ host: 'http://localhost:11434' })
   
   export function initModelHandlers() {
     ipcMain.handle('model:delete', async (event, modelId: string) => {
       try {
         // 检查使用
         const db = dbManager.getDb()
         const inUse = await isModelInUse(db, modelId)
         
         if (inUse) {
           return {
             success: false,
             error: 'Model is in use by chat sessions',
           }
         }
         
         // 删除
         await ollama.delete({ model: modelId })
         
         return { success: true }
       } catch (error) {
         return {
           success: false,
           error: error.message,
         }
       }
     })
   }
   \`\`\`

3. **前端 Mutation**:
   \`\`\`typescript
   // client/src/renderer/src/hooks/ollama-models/mutations/useDeleteModel.ts
   
   import { useMutation, useQueryClient } from '@tanstack/react-query'
   import { toast } from 'sonner'
   
   export function useDeleteModel() {
     const queryClient = useQueryClient()
     
     return useMutation({
       mutationFn: async (modelId: string) => {
         const result = await window.api.model.delete(modelId)
         
         if (!result.success) {
           throw new Error(result.error)
         }
         
         return result
       },
       
       onSuccess: () => {
         toast.success('Model deleted successfully')
         queryClient.invalidateQueries(['local-models'])
       },
       
       onError: (error: Error) => {
         toast.error('Failed to delete model', {
           description: error.message,
         })
       },
     })
   }
   \`\`\`

**验证**: 尝试删除一个未使用的模型，应该成功；尝试删除正在使用的模型，应该看到错误提示。

---

## 5. 调试技巧

### 5.1 查看 Ollama API 请求

在 DevTools Console 中：

\`\`\`javascript
// 查看已安装模型
fetch('http://localhost:11434/api/tags')
  .then(r => r.json())
  .then(console.log)

// 监控下载进度
const response = await fetch('http://localhost:11434/api/pull', {
  method: 'POST',
  body: JSON.stringify({ name: 'llama3.2:1b', stream: true }),
})

const reader = response.body.getReader()
const decoder = new TextDecoder()

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  console.log(decoder.decode(value))
}
\`\`\`

### 5.2 查看 TanStack Query 缓存

1. 打开 TanStack Query DevTools（应用右下角浮动图标）
2. 查看 \`['local-models']\` 查询键的数据
3. 手动触发 \`invalidateQueries\` 测试缓存失效

### 5.3 查看 SQLite 数据库

\`\`\`bash
# 连接到 Private Mode 数据库
sqlite3 ~/Library/Application\\ Support/rafa/userData/local.db

# 查询使用模型的会话
SELECT id, title, model FROM chat_sessions WHERE model = 'llama3:8b';
\`\`\`

---

## 6. 常见问题

### Q1: Ollama API 返回 404

**原因**: Ollama 服务未运行。

**解决**:
\`\`\`bash
# 启动 Ollama
ollama serve

# 或等待 electron-ollama 自动启动（应用启动后约 5-10 秒）
\`\`\`

### Q2: 下载进度不更新

**原因**: NDJSON 解析逻辑错误。

**调试**:
\`\`\`typescript
// 在 pullOllamaModel 中添加日志
console.log('[Download] Raw line:', line)
console.log('[Download] Parsed:', JSON.parse(line))
\`\`\`

### Q3: 模型删除失败："model is in use"

**原因**: 模型正在被 Ollama 运行。

**解决**:
\`\`\`bash
# 停止模型
ollama stop llama3:8b

# 然后重试删除
\`\`\`

### Q4: 磁盘空间检测不工作

**原因**: Node.js 版本 < 19.6。

**解决**: 升级 Node.js 到 v20+，或使用 \`check-disk-space\` 库。

---

## 7. 测试checklist

开发完成后，运行以下测试：

- [ ] 模型列表显示（配置文件中的所有模型）
- [ ] 模型下载（实时进度条）
- [ ] 模型下载取消（AbortController）
- [ ] 模型删除（未使用）
- [ ] 模型删除（被使用，显示警告）
- [ ] 磁盘空间检测（下载前检查）
- [ ] 并发下载限制（最多 2 个）
- [ ] Private Mode 隐藏 Web Search
- [ ] Cloud Mode 不显示 Local LLMs 标签页
- [ ] 模式切换后缓存刷新

---

## 8. 下一步

1. 阅读 [research.md](research.md) 了解技术决策
2. 阅读 [data-model.md](data-model.md) 了解数据结构
3. 运行 \`/speckit.tasks\` 生成详细任务清单
4. 开始实施！

**预计开发时间**: 3-5 天（1 位开发者）

---

**文档版本**: 1.0.0  
**最后更新**: 2025-10-23
