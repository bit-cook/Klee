# Quick Start: Private Mode 开发指南

**Feature**: 006-private-mode
**生成日期**: 2025-10-20
**目标读者**: 开发者（首次接触本功能）

---

## 概述

Private Mode 允许用户在完全离线的环境下使用 Rafa，所有数据（对话、知识库）存储在本地，无任何云端交互。

**核心技术栈**:
- Electron（桌面应用框架）
- Ollama（本地 LLM 推理）
- LanceDB（本地向量数据库）
- SQLite（本地关系数据库）
- Vercel AI SDK（流式对话）

---

## 开发环境设置

### 1. 安装依赖

```bash
cd /Users/wei/Coding/rafa/client

# Ollama 集成
npm install electron-ollama ollama

# 向量数据库
npm install vectordb @lancedb/lancedb

# 本地数据库
npm install better-sqlite3 drizzle-orm
npm install -D drizzle-kit drizzle-zod

# 测试工具
npm install -D @playwright/test electron-playwright-helpers
npm install -D vitest @vitest/ui jsdom
npm install -D @testing-library/react @testing-library/jest-dom
```

### 2. 配置 Drizzle ORM

```bash
# 生成 SQLite schema
npx drizzle-kit generate:sqlite --schema=./db/schema-local.ts

# 运行迁移
npx drizzle-kit push:sqlite
```

### 3. 启动 Ollama（本地测试）

```bash
# macOS
brew install ollama
ollama serve

# 下载测试模型
ollama pull llama3:8b
ollama pull nomic-embed-text  # 嵌入模型
```

---

## 项目结构导航

```
client/
├── electron/                    # Electron 主进程
│   ├── main/
│   │   └── index.ts             # 主入口（初始化 Ollama + DB）
│   ├── services/                # 核心服务
│   │   ├── ollama-manager.ts    # Ollama 生命周期管理
│   │   ├── vector-db-manager.ts # LanceDB 管理
│   │   └── db-connection.ts     # SQLite 连接管理
│   └── ipc/                     # IPC 处理器
│       ├── ollama-handlers.ts
│       ├── vector-handlers.ts
│       └── db-handlers.ts
├── src/
│   ├── contexts/
│   │   └── ModeContext.tsx      # 运行模式上下文
│   ├── hooks/
│   │   ├── mode/
│   │   │   ├── useMode.ts       # 模式切换 Hook
│   │   │   └── useModeSync.ts   # 模式状态同步
│   │   ├── chat/
│   │   │   └── useLocalChat.ts  # 本地聊天 Hook（新增）
│   │   └── knowledge-base/
│   │       └── useLocalKB.ts    # 本地知识库 Hook（新增）
│   └── lib/
│       └── local-utils/         # 本地工具函数
│           ├── embedding.ts
│           └── vector-search.ts
└── db/
    └── schema-local.ts          # SQLite schema 定义
```

---

## 核心开发流程

### Step 1: 模式切换实现

```typescript
// src/contexts/ModeContext.tsx
import { createContext, useState, useEffect } from 'react'

export const ModeContext = createContext<{
  mode: 'cloud' | 'private'
  setMode: (mode: 'cloud' | 'private') => void
  isPrivateMode: boolean
} | null>(null)

export function ModeProvider({ children }) {
  const [mode, setModeState] = useState<'cloud' | 'private'>('cloud')

  const setMode = (newMode) => {
    setModeState(newMode)
    localStorage.setItem('run-mode', newMode)
    window.electron.ipcRenderer.send('mode:switch', { mode: newMode })
  }

  useEffect(() => {
    const saved = localStorage.getItem('run-mode') || 'cloud'
    setModeState(saved as any)
  }, [])

  return (
    <ModeContext.Provider value={{ mode, setMode, isPrivateMode: mode === 'private' }}>
      {children}
    </ModeContext.Provider>
  )
}
```

### Step 2: Ollama 服务管理（智能检测版本）

```typescript
// electron/services/ollama-manager.ts
import { ElectronOllama } from 'electron-ollama'
import { app } from 'electron'
import path from 'path'

type OllamaSource = 'system' | 'embedded' | 'none'

export class OllamaManager {
  private ollama: ElectronOllama | null = null
  private ollamaSource: OllamaSource = 'none'
  private readonly basePath: string

  constructor() {
    this.basePath = path.join(app.getPath('userData'), 'ollama')
  }

  async initialize() {
    // 1. 优先检测系统 Ollama
    const systemOllamaAvailable = await this.detectSystemOllama()

    if (systemOllamaAvailable) {
      this.ollamaSource = 'system'
      console.log('✅ Using system Ollama')
      return { source: 'system' as const, url: 'http://localhost:11434' }
    }

    // 2. 系统无 Ollama，使用内嵌版本
    console.log('⬇️ Downloading embedded Ollama...')
    this.ollamaSource = 'embedded'

    this.ollama = new ElectronOllama({ basePath: this.basePath })

    if (!(await this.ollama.isRunning())) {
      const metadata = await this.ollama.getMetadata('latest')
      await this.ollama.serve(metadata.version, {
        serverLog: (msg) => console.log('[Ollama]', msg),
        downloadLog: (percent, msg) => console.log(`[Download] ${percent}%: ${msg}`)
      })
    }

    return { source: 'embedded' as const, url: 'http://localhost:11434' }
  }

  private async detectSystemOllama(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000)

      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        return 'models' in data
      }
      return false
    } catch {
      return false
    }
  }

  getSource(): OllamaSource {
    return this.ollamaSource
  }

  async shutdown() {
    // 仅关闭内嵌 Ollama，不影响系统 Ollama
    if (this.ollamaSource === 'system') {
      console.log('ℹ️ Using system Ollama, skipping shutdown')
      return
    }

    if (this.ollamaSource !== 'embedded') return

    const { exec } = require('child_process')
    const ollamaPath = path.join(this.basePath, 'bin', 'ollama')

    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        exec(`pkill -f "${ollamaPath}"`)
      } else {
        // Windows: 通过路径过滤进程
        exec(`wmic process where "ExecutablePath='${ollamaPath.replace(/\\/g, '\\\\')}'" delete`)
      }
    } catch {
      console.log('ℹ️ Ollama already terminated')
    }
  }
}
```

### Step 3: 本地聊天实现

```typescript
// src/hooks/chat/useLocalChat.ts
import { useState } from 'react'
import { useMode } from '@/contexts/ModeContext'

export function useLocalChat(conversationId: string) {
  const { isPrivateMode } = useMode()
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)

  const sendMessage = async (content: string) => {
    if (!isPrivateMode) {
      throw new Error('useLocalChat can only be used in Private Mode')
    }

    setIsLoading(true)

    // 调用 Electron IPC
    window.electron.ipcRenderer.on('ollama:chat-stream', (data) => {
      if (data.conversationId === conversationId) {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          if (last?.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: last.content + data.delta }]
          }
          return [...prev, { role: 'assistant', content: data.delta }]
        })
      }
    })

    const result = await window.electron.ipcRenderer.invoke('ollama:chat', {
      model: 'llama3:8b',
      messages: [...messages, { role: 'user', content }],
      conversationId
    })

    setIsLoading(false)

    if (!result.success) {
      throw new Error(result.error)
    }
  }

  return { messages, sendMessage, isLoading }
}
```

### Step 4: 知识库向量化

```typescript
// src/hooks/knowledge-base/useLocalKB.ts
export function useLocalKBEmbedding(kbId: string) {
  const [progress, setProgress] = useState(0)

  const embedDocuments = async (files: File[]) => {
    // 监听向量化进度
    window.electron.ipcRenderer.on('vector:embed-progress', (data) => {
      if (data.knowledgeBaseId === kbId) {
        setProgress((data.current / data.total) * 100)
      }
    })

    const documents = files.map(file => ({
      id: crypto.randomUUID(),
      text: await file.text(),
      metadata: { fileName: file.name }
    }))

    const result = await window.electron.ipcRenderer.invoke('vector:embed-documents', {
      knowledgeBaseId: kbId,
      documents
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    return result.count
  }

  const searchSimilar = async (query: string) => {
    const result = await window.electron.ipcRenderer.invoke('vector:search', {
      knowledgeBaseId: kbId,
      query,
      limit: 10
    })

    if (!result.success) {
      throw new Error(result.error)
    }

    return result.results
  }

  return { embedDocuments, searchSimilar, progress }
}
```

---

## 测试指南

### 单元测试（Vitest）

```bash
# 运行所有单元测试
npm run test

# 运行特定测试文件
npm run test useLocalChat.test.ts

# 查看测试覆盖率
npm run test:coverage
```

示例测试：
```typescript
// src/hooks/chat/useLocalChat.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useLocalChat } from './useLocalChat'

describe('useLocalChat', () => {
  it('should send message to Ollama', async () => {
    const { result } = renderHook(() => useLocalChat('test-conversation'))

    await result.current.sendMessage('Hello')

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2)
      expect(result.current.messages[0].role).toBe('user')
      expect(result.current.messages[1].role).toBe('assistant')
    })
  })
})
```

### E2E 测试（Playwright）

```bash
# 运行 E2E 测试
npm run test:e2e

# 调试模式
npm run test:e2e:debug

# 有头模式（查看 UI）
npm run test:e2e:headed
```

示例测试：
```typescript
// e2e/private-mode.spec.ts
import { test, expect } from './fixtures/electron'

test('should work completely offline', async ({ page }) => {
  // 切换到 Private Mode
  await page.click('[data-testid="private-mode-toggle"]')

  // 验证模式指示器
  await expect(page.locator('[data-testid="private-mode-indicator"]')).toBeVisible()

  // 发送消息
  await page.fill('[data-testid="chat-input"]', 'Test offline')
  await page.click('[data-testid="send-button"]')

  // 验证响应
  await expect(page.locator('[data-testid="chat-message"]').last()).toContainText('Test offline')
})
```

---

## 调试技巧

### 1. 查看 Electron 主进程日志

```bash
# 打开 DevTools 查看主进程日志
npm run dev

# 主进程日志会显示在终端
# 渲染进程日志在浏览器 DevTools 中
```

### 2. 检查 Ollama 状态

```bash
# 查看 Ollama 是否运行
curl http://localhost:11434/api/tags

# 查看已下载模型
ollama list
```

### 3. 检查 SQLite 数据库

```bash
# 使用 sqlite3 命令行工具
sqlite3 ~/Library/Application\ Support/Rafa/rafa-private.db

# 查看表
.tables

# 查询数据
SELECT * FROM conversations;
```

### 4. 检查 LanceDB 数据

```bash
# 查看向量数据库目录
ls -lh ~/Library/Application\ Support/Rafa/vector-db/

# 查看特定知识库的向量表
# (需要通过代码或 Python 脚本查看)
```

---

## 常见问题

### Q: Ollama 下载卡住或失败

**A**: 检查网络连接，或手动下载 Ollama 二进制文件：
```bash
# macOS
curl -O https://ollama.com/download/ollama-darwin
```

### Q: 向量化速度很慢

**A**: 检查以下因素：
1. 使用 SSD 而非 HDD
2. 减少文档大小或分块大小
3. 使用更快的嵌入模型

### Q: 模式切换后数据丢失

**A**: 这是正常的！Cloud/Private 数据完全隔离。如需迁移数据，使用导出/导入功能（未来功能）。

### Q: 测试时无法连接 Ollama

**A**: 确保测试环境中 Ollama 服务正在运行：
```bash
# 启动 Ollama（测试前）
ollama serve &
```

---

## 下一步

1. ✅ 完成基础设置
2. ⏭️ 阅读 [data-model.md](./data-model.md) 了解数据结构
3. ⏭️ 查看 [contracts/ipc-channels.md](./contracts/ipc-channels.md) 了解 IPC API
4. ⏭️ 运行 `/speckit.tasks` 生成具体开发任务

---

## 有用的命令

```bash
# 开发
npm run dev                    # 启动开发服务器

# 测试
npm run test                   # 单元测试
npm run test:e2e               # E2E 测试
npm run test:coverage          # 测试覆盖率

# 构建
npm run build                  # 构建生产版本
npm run package                # 打包 Electron 应用

# 数据库
npx drizzle-kit studio         # 查看数据库（可视化）
npx drizzle-kit generate       # 生成迁移文件
npx drizzle-kit push           # 应用迁移

# Ollama
ollama list                    # 列出已安装模型
ollama pull <model>            # 下载模型
ollama rm <model>              # 删除模型
```

---

## 资源链接

- Electron 文档: https://www.electronjs.org/docs
- Ollama 文档: https://ollama.com/docs
- LanceDB 文档: https://lancedb.github.io/lancedb/
- Vercel AI SDK: https://sdk.vercel.ai/docs
- Playwright Electron: https://playwright.dev/docs/api/class-electron

祝开发顺利！🚀
