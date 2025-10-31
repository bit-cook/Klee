# Research Report: Private Mode 技术选型

**生成日期**: 2025-10-20
**Feature**: 006-private-mode
**目的**: 解决技术上下文中的未知项，为实施规划提供技术决策依据

---

## 研究问题清单

从技术上下文和宪章检查中识别出的关键问题：

1. ✅ Ollama 如何打包到 Electron app 中？
2. ✅ 选择哪个本地向量数据库方案？
3. ✅ 测试框架选择（Playwright/Spectron）？
4. ⏳ 数据隔离策略（独立 SQLite 文件 vs. mode 字段）？
5. ⏳ Electron 版本和兼容性？

---

## Decision 1: Ollama 集成方案

### 决策

**优先复用系统 Ollama，必要时使用 `electron-ollama` 内嵌版本**

采用智能检测策略：
1. **首选**: 检测并复用用户已安装的系统 Ollama（如通过 `brew install ollama` 安装）
2. **备选**: 如果系统未安装，使用 `electron-ollama` 在运行时下载内嵌版本到 userData 目录

### 理由

1. **避免进程冲突**: 检测系统 Ollama 运行状态，避免端口 11434 冲突
2. **节省磁盘空间**: 复用系统 Ollama 模型（避免重复下载 4-8GB 模型文件）
3. **用户体验优秀**:
   - 已有 Ollama 用户：即时可用，共享模型库
   - 新用户：自动下载轻量级安装包（<100MB），首次启动时下载 Ollama（~500MB）
4. **智能降级**: 系统 Ollama 不可用时自动切换到内嵌版本
5. **进程隔离**: 关闭 Rafa 时不影响用户的系统 Ollama 进程
6. **许可证合规**: Ollama 采用 MIT 许可证，允许商业使用、修改和分发
7. **真正离线**: 一旦 Ollama 就绪（系统或内嵌），完全离线运行

### 实施步骤

#### 1. 安装依赖
```bash
npm install electron-ollama ollama
```

#### 2. 在 Electron 主进程初始化 Ollama（智能检测版本）
```typescript
// client/electron/services/ollama-manager.ts
import { ElectronOllama } from 'electron-ollama'
import { app } from 'electron'
import path from 'path'

type OllamaSource = 'system' | 'embedded' | 'none'

export class OllamaManager {
  private ollama: ElectronOllama | null = null
  private readonly basePath: string
  private ollamaSource: OllamaSource = 'none'

  constructor() {
    this.basePath = path.join(app.getPath('userData'), 'ollama')
  }

  async initialize(onProgress?: (percent: number, message: string) => void) {
    try {
      // Step 1: 检测系统 Ollama
      const systemOllamaAvailable = await this.detectSystemOllama()

      if (systemOllamaAvailable) {
        this.ollamaSource = 'system'
        console.log('✅ Using system Ollama at http://localhost:11434')
        onProgress?.(100, 'Connected to system Ollama')
        return { source: 'system' as const, url: 'http://localhost:11434' }
      }

      // Step 2: 系统无 Ollama，使用内嵌版本
      console.log('⬇️ System Ollama not found, initializing embedded version...')
      this.ollamaSource = 'embedded'

      this.ollama = new ElectronOllama({ basePath: this.basePath })

      if (!(await this.ollama.isRunning())) {
        const metadata = await this.ollama.getMetadata('latest')

        await this.ollama.serve(metadata.version, {
          serverLog: (message) => console.log('[Ollama]', message),
          downloadLog: (percent, message) => {
            console.log(`[Ollama Download] ${percent}%: ${message}`)
            onProgress?.(percent, message)
          }
        })
      }

      console.log('✅ Embedded Ollama server ready at http://localhost:11434')
      return { source: 'embedded' as const, url: 'http://localhost:11434' }
    } catch (error) {
      console.error('❌ Failed to initialize Ollama:', error)
      this.ollamaSource = 'none'
      throw error
    }
  }

  /**
   * 检测系统是否已运行 Ollama
   * 检查端口 11434 是否有 Ollama API 响应
   */
  private async detectSystemOllama(): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2秒超时

      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        // 验证返回的是 Ollama API 响应
        const data = await response.json()
        return 'models' in data // Ollama /api/tags 返回 { models: [...] }
      }

      return false
    } catch (error) {
      // 网络错误、超时或连接被拒绝 → 系统无 Ollama
      return false
    }
  }

  /**
   * 获取当前使用的 Ollama 来源
   */
  getSource(): OllamaSource {
    return this.ollamaSource
  }

  async shutdown() {
    // 如果使用的是系统 Ollama，不要关闭它！
    if (this.ollamaSource === 'system') {
      console.log('ℹ️ Using system Ollama, skipping shutdown')
      return
    }

    // 只关闭内嵌的 Ollama
    if (this.ollamaSource !== 'embedded') {
      return
    }

    const { exec } = require('child_process')
    const util = require('util')
    const execAsync = util.promisify(exec)

    try {
      // 更精确的进程关闭，避免误杀系统 Ollama
      const ollamaPath = path.join(this.basePath, 'bin', 'ollama')

      if (process.platform === 'darwin' || process.platform === 'linux') {
        // 只杀掉从 basePath 启动的进程
        await execAsync(`pkill -f "${ollamaPath}"`)
      } else if (process.platform === 'win32') {
        // Windows: 通过进程路径过滤
        const findCmd = `wmic process where "ExecutablePath='${ollamaPath.replace(/\\/g, '\\\\')}'" get ProcessId`
        const { stdout } = await execAsync(findCmd)
        const pids = stdout.split('\n').slice(1).map(line => line.trim()).filter(Boolean)

        for (const pid of pids) {
          await execAsync(`taskkill /F /PID ${pid}`)
        }
      }

      console.log('✅ Embedded Ollama shutdown complete')
    } catch (error) {
      // 进程可能已关闭，忽略错误
      console.log('ℹ️ Ollama process already terminated')
    }
  }
}
```

#### 3. 在主进程中集成
```typescript
// client/electron/main/index.ts
import { OllamaManager } from '../services/ollama-manager'

let ollamaManager: OllamaManager

app.whenReady().then(async () => {
  ollamaManager = new OllamaManager()

  try {
    const result = await ollamaManager.initialize((percent, message) => {
      // 发送下载/连接进度到渲染进程
      mainWindow?.webContents.send('ollama-init-progress', {
        percent,
        message,
        source: ollamaManager.getSource()
      })
    })

    console.log(`Ollama initialized: ${result.source}`)

    // 通知渲染进程 Ollama 来源
    mainWindow?.webContents.send('ollama-ready', {
      source: result.source,
      url: result.url
    })
  } catch (error) {
    // 显示用户友好的错误提示
    dialog.showErrorBox('Ollama Initialization Failed',
      'Failed to start Ollama service. Please check your internet connection and restart the app.')
  }

  createWindow()
})

app.on('before-quit', async (event) => {
  event.preventDefault()
  await ollamaManager?.shutdown()  // 智能关闭（不影响系统 Ollama）
  app.exit(0)
})
```

#### 4. 通过 IPC 暴露 Ollama API
```typescript
// client/electron/ipc/ollama-handlers.ts
import { ipcMain } from 'electron'
import Ollama from 'ollama'

const ollama = new Ollama({ host: 'http://localhost:11434' })

ipcMain.handle('ollama:pull-model', async (event, modelName: string) => {
  try {
    const stream = await ollama.pull({ model: modelName, stream: true })

    for await (const part of stream) {
      event.sender.send('ollama:pull-progress', part)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('ollama:list-models', async () => {
  const response = await ollama.list()
  return response.models
})

ipcMain.handle('ollama:chat', async (event, { model, messages }) => {
  const response = await ollama.chat({ model, messages })
  return response.message
})
```

### 智能检测策略详解

#### 场景 1: 用户已安装系统 Ollama

```
用户环境：
- 通过 brew install ollama 安装
- 运行中: ollama serve (监听 localhost:11434)
- 已下载模型: llama3:8b, mistral:7b

Rafa 行为：
1. 检测到 localhost:11434 有响应 ✅
2. 验证是 Ollama API (检查 /api/tags) ✅
3. 设置 ollamaSource = 'system'
4. 直接使用，无需下载 (~500MB 节省)
5. 用户模型库共享 (~10GB+ 节省)
```

#### 场景 2: 用户未安装 Ollama

```
用户环境：
- 首次使用 Private Mode
- 无 localhost:11434 响应

Rafa 行为：
1. 检测失败 (2秒超时) ❌
2. 设置 ollamaSource = 'embedded'
3. 下载 Ollama 到 userData/ollama/ (~500MB)
4. 启动内嵌 Ollama 服务
5. 显示下载进度条
```

#### 场景 3: 系统 Ollama 已安装但未运行

```
用户环境：
- brew install ollama 已执行
- 但未运行 ollama serve

Rafa 行为：
1. 检测失败 (无响应) ❌
2. 下载内嵌版本
3. [可选优化] 提示用户可启动系统 Ollama 节省空间
```

### 替代方案（已否决）

- ❌ **要求用户手动安装 Ollama**: 用户体验差，需要检测安装路径，版本不匹配问题
- ❌ **预打包所有平台二进制文件**: 安装包膨胀至 1.2-1.5GB，浪费带宽和存储
- ❌ **强制使用内嵌版本**: 浪费磁盘空间（重复模型），可能端口冲突
- ⚠️ **使用自定义端口（11435）**: 避免冲突，但用户模型库无法共享
- ⚠️ **使用 llama.cpp + node-llama-cpp**: 更轻量（90MB），但 API 更底层，需要更多集成工作
- ⚠️ **NSIS 安装脚本自动安装**: 仅限 Windows，需要管理员权限

### 参考资料

- electron-ollama: https://github.com/antarasi/electron-ollama
- Ollama 官方文档: https://ollama.com
- Ollama MIT 许可证: https://github.com/ollama/ollama/blob/main/LICENSE
- 生产案例 (electron-gpt): https://github.com/lorem-ipsumm/electron-gpt

---

## Decision 2: 本地向量数据库选型

### 决策

**LanceDB** - 嵌入式 TypeScript 向量数据库

### 理由

1. **真正嵌入式**: LanceDB 提供原生 TypeScript 库，完全运行在进程内，无需独立服务器或后台进程
2. **磁盘存储优化**: 基于磁盘的索引架构，最小化内存占用（与内存数据库 Vectra 相比）
3. **生产验证**: 已被多个 Electron AI 应用成功使用：
   - **5ire**: 跨平台 AI 助手，管理 100 万+向量
   - **AnythingLLM**: 一体化 AI 桌面应用
4. **高性能**: HNSW 索引提供亚 100ms 的搜索时间（10 亿向量规模）
5. **TypeScript 优先**: 一流的类型支持，完整的类型推断
6. **Apache 2.0 许可证**: 商业使用无限制

### 对比分析

| 数据库 | 嵌入式 | 性能 | TS 支持 | 内存占用 | 许可证 | 状态 |
|--------|--------|------|---------|----------|--------|------|
| **LanceDB** | ✅ 原生 TS，磁盘存储 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ 极低 | Apache 2.0 | ✅ YC 支持 |
| Vectra | ✅ 本地文件 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ 全内存 | MIT | ✅ 活跃 |
| Chroma | ❌ 需要 Python 服务器 | ⭐⭐⭐⭐ | ⭐⭐ 仅客户端 | ⭐⭐⭐ | Apache 2.0 | ✅ 流行 |
| Qdrant | ❌ Python 嵌入模式 | ⭐⭐⭐⭐⭐ | ⭐⭐ 需服务器 | ⭐⭐⭐⭐ | Apache 2.0 | ✅ 生产级 |
| sqlite-vec | ✅ SQLite 扩展 | ⭐⭐⭐ 暴力搜索 | ⭐⭐⭐ | ⭐⭐⭐⭐ | Apache 2.0 | ✅ 新项目 |

### 实施步骤

#### 1. 安装
```bash
npm install vectordb
# 或使用带类型的版本
npm install @lancedb/lancedb
```

#### 2. 初始化数据库
```typescript
// client/electron/services/vector-db-manager.ts
import * as lancedb from 'vectordb'
import { app } from 'electron'
import path from 'path'

export class VectorDBManager {
  private db: lancedb.Connection | null = null
  private readonly dbPath: string

  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'vector-db')
  }

  async initialize() {
    try {
      this.db = await lancedb.connect(this.dbPath)
      console.log('✅ Vector DB initialized at', this.dbPath)
      return this.db
    } catch (error) {
      console.error('❌ Failed to initialize Vector DB:', error)
      throw error
    }
  }

  async createTable(tableName: string, schema: any) {
    if (!this.db) throw new Error('Database not initialized')

    return await this.db.createTable(tableName, schema, {
      mode: 'overwrite', // 或 'create' 如果不想覆盖
    })
  }

  async getTable(tableName: string) {
    if (!this.db) throw new Error('Database not initialized')
    return await this.db.openTable(tableName)
  }
}
```

#### 3. 知识库向量化集成
```typescript
// client/electron/services/knowledge-base-vectorizer.ts
import { VectorDBManager } from './vector-db-manager'
import Ollama from 'ollama'

export class KnowledgeBaseVectorizer {
  constructor(
    private vectorDB: VectorDBManager,
    private ollama: Ollama
  ) {}

  async embedDocument(knowledgeBaseId: string, documents: Array<{
    id: string
    text: string
    metadata: any
  }>) {
    const tableName = `kb_${knowledgeBaseId}`

    // 生成嵌入向量
    const vectorizedDocs = await Promise.all(
      documents.map(async (doc) => {
        const embedding = await this.ollama.embeddings({
          model: 'nomic-embed-text', // 或用户选择的嵌入模型
          prompt: doc.text
        })

        return {
          id: doc.id,
          embedding: embedding.embedding,
          text: doc.text,
          ...doc.metadata,
          timestamp: Date.now()
        }
      })
    )

    // 存储到 LanceDB
    const table = await this.vectorDB.createTable(tableName, vectorizedDocs)

    // 创建 HNSW 索引以提升搜索性能
    await table.createIndex('embedding', {
      type: 'ivf_pq',
      num_partitions: 256,
      num_sub_vectors: 96
    })

    return vectorizedDocs.length
  }

  async searchSimilar(knowledgeBaseId: string, queryText: string, limit = 10) {
    const tableName = `kb_${knowledgeBaseId}`

    // 向量化查询
    const queryEmbedding = await this.ollama.embeddings({
      model: 'nomic-embed-text',
      prompt: queryText
    })

    // 搜索相似向量
    const table = await this.vectorDB.getTable(tableName)
    const results = await table
      .search(queryEmbedding.embedding)
      .limit(limit)
      .execute()

    return results
  }
}
```

#### 4. IPC 处理器
```typescript
// client/electron/ipc/vector-db-handlers.ts
import { ipcMain } from 'electron'
import { KnowledgeBaseVectorizer } from '../services/knowledge-base-vectorizer'

let vectorizer: KnowledgeBaseVectorizer

export function registerVectorDBHandlers(vectorizer: KnowledgeBaseVectorizer) {
  ipcMain.handle('vector:embed-documents', async (event, { kbId, documents }) => {
    try {
      const count = await vectorizer.embedDocument(kbId, documents)
      return { success: true, count }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('vector:search', async (event, { kbId, query, limit }) => {
    try {
      const results = await vectorizer.searchSimilar(kbId, query, limit)
      return { success: true, results }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })
}
```

### 关键考虑

- ⚠️ **需要 SSD**: 磁盘存储架构在 HDD 上性能下降，建议在系统要求中说明
- ⚠️ **索引构建时间**: 10 万+向量首次建索引需要数分钟，需显示进度条
- ✅ **并发访问**: LanceDB 支持并发读，写操作需要序列化避免冲突
- ✅ **备份友好**: 基于文件存储，用户可以直接备份 `userData/vector-db/` 目录

### 替代方案

- **Vectra**: 适合原型开发，<1 万向量场景，全内存加载
- **USearch**: 如果需要极致性能（10x FAISS），但 API 更底层
- **sqlite-vec**: 未来潜力大，但当前缺少 ANN 索引（仅暴力搜索）

### 参考资料

- LanceDB 官方文档: https://lancedb.github.io/lancedb/
- TypeScript 快速开始: https://lancedb.com/docs/quickstart/
- 5ire 案例研究: https://github.com/nanbingxyz/5ire
- AnythingLLM 集成: https://docs.anythingllm.com/setup/vector-database-configuration/local/lancedb

---

## Decision 3: 测试框架选型

### 决策

**Playwright + Vitest + React Testing Library** 组合

- **E2E 测试**: Playwright with `electron-playwright-helpers`
- **单元/集成测试**: Vitest + React Testing Library
- **网络监控**: Playwright 内置 `context.route()` API

### 理由

1. **官方 Electron 支持**: Playwright 提供实验性但稳定的 Electron 支持（Electron 官方推荐）
2. **强大的网络控制**: 内置 `route.abort()` API 完美验证 Private Mode 零云端请求
3. **跨平台卓越**: macOS/Windows/Linux 原生支持，API 一致
4. **现代架构**: 基于 Chrome DevTools Protocol，而非传统 WebDriver
5. **TypeScript 优先**: 开箱即用的类型定义和自动补全
6. **Vitest 集成**: 与现有 Vite 构建系统无缝集成，极快的测试执行速度

### 对比分析

| 框架 | 维护状态 | 网络控制 | TS 支持 | 社区 | 性能 | Electron 支持 |
|------|----------|----------|---------|------|------|---------------|
| **Playwright** | ✅ 活跃 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ 实验但稳定 |
| WebDriverIO | ✅ 活跃 | ⭐⭐⭐ 插件 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ 生产级 |
| **Spectron** | ❌ 2022 年弃用 | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ 遗留 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ 专为 Electron |
| **Vitest** | ✅ 活跃 | ⭐⭐ 单元测试 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ 仅 Mock |

### 实施步骤

#### 1. 安装依赖
```bash
cd client

# Playwright + Electron helpers
npm install -D @playwright/test electron-playwright-helpers

# Vitest + Testing utilities
npm install -D vitest @vitest/ui jsdom
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

#### 2. Vitest 配置
```typescript
// client/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

#### 3. Playwright 配置
```typescript
// client/playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Electron 测试应串行运行
  workers: 1,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
```

#### 4. Playwright Electron Fixture
```typescript
// client/e2e/fixtures/electron.ts
import { test as base, _electron as electron } from '@playwright/test'
import path from 'path'

type ElectronFixtures = {
  electronApp: ElectronApplication
  page: Page
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main/index.js')],
      env: { ...process.env, NODE_ENV: 'test' },
    })
    await use(app)
    await app.close()
  },

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})
```

#### 5. Private Mode 离线测试示例
```typescript
// client/e2e/private-mode.spec.ts
import { test, expect } from './fixtures/electron'

test.describe('Private Mode - Offline Functionality', () => {
  let blockedRequests: string[] = []

  test.beforeEach(async ({ page }) => {
    blockedRequests = []

    // 阻止所有外部网络请求
    await page.context().route('**/*', (route) => {
      const url = route.request().url()

      // 允许本地资源
      if (url.startsWith('file://') || url.startsWith('http://localhost')) {
        return route.continue()
      }

      // 阻止并记录外部请求
      blockedRequests.push(url)
      console.error(`❌ BLOCKED: ${url}`)
      route.abort('blockedbyclient')
    })
  })

  test('should not make any external network requests', async ({ page }) => {
    await page.click('[data-testid="private-mode-toggle"]')
    await expect(page.locator('[data-testid="private-mode-indicator"]')).toBeVisible()

    // 执行聊天操作
    await page.fill('[data-testid="chat-input"]', 'Test message')
    await page.click('[data-testid="send-button"]')

    await expect(page.locator('[data-testid="chat-message"]').last()).toBeVisible()

    // 验证零外部请求
    expect(blockedRequests).toHaveLength(0)
  })

  test.afterEach(async () => {
    if (blockedRequests.length > 0) {
      console.error('🚨 Security Issue: External requests detected:', blockedRequests)
      throw new Error(`Private Mode made ${blockedRequests.length} external request(s)`)
    }
  })
})
```

### 测试策略

- **单元测试 (Vitest)**: React 组件、Hooks、工具函数
- **集成测试 (Vitest)**: 功能工作流、多 Hook 交互
- **E2E 测试 (Playwright)**: 完整用户流程、IPC 通信、离线功能
- **网络监控**: Playwright `context.route()` 验证零云端请求

### 替代方案

- ❌ **Cypress**: 优秀的 Web DX，但 Electron 支持有限
- ⚠️ **纯 WebDriverIO**: 更成熟的 Electron 支持，但配置复杂且慢
- ❌ **仅手动测试**: 无法可靠验证离线模式，无 CI/CD 集成

### 参考资料

- Playwright Electron API: https://playwright.dev/docs/api/class-electron
- electron-playwright-helpers: https://github.com/spaceagetv/electron-playwright-helpers
- Actual Budget Electron 测试 PR: https://github.com/actualbudget/actual/pull/4674
- Electron 官方测试指南: https://www.electronjs.org/docs/latest/tutorial/automated-testing

---

## Decision 4: 数据隔离策略

### 决策

**使用独立的 SQLite 数据库文件** 存储 Private Mode 数据

- Cloud Mode: `userData/rafa-cloud.db`
- Private Mode: `userData/rafa-private.db`

### 理由

1. **完全物理隔离**: 两种模式的数据存储在不同文件中，确保绝对隔离
2. **简化数据迁移**: 用户可以独立备份/删除任一模式的数据
3. **性能优化**: 避免所有查询都需要 WHERE mode = 'private' 过滤
4. **清晰的数据归属**: 文件名明确标识数据所属模式
5. **易于调试**: 开发者可以独立检查每个数据库文件

### 实施步骤

#### 1. 数据库连接管理器
```typescript
// client/electron/db/connection-manager.ts
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

type RunMode = 'cloud' | 'private'

export class DatabaseConnectionManager {
  private connections: Map<RunMode, Database.Database> = new Map()
  private readonly dbDir: string

  constructor() {
    this.dbDir = app.getPath('userData')
  }

  getConnection(mode: RunMode): Database.Database {
    if (!this.connections.has(mode)) {
      const dbPath = path.join(this.dbDir, `rafa-${mode}.db`)
      const db = new Database(dbPath)

      // 启用 WAL 模式以提升并发性能
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = NORMAL')

      this.connections.set(mode, db)
      console.log(`✅ Database connected: ${dbPath}`)
    }

    return this.connections.get(mode)!
  }

  closeAll() {
    for (const [mode, db] of this.connections) {
      db.close()
      console.log(`✅ Database closed: ${mode}`)
    }
    this.connections.clear()
  }
}
```

#### 2. Drizzle ORM 配置
```typescript
// client/db/schema-local.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// Private Mode 对话表
export const localConversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  modelId: text('model_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Private Mode 消息表
export const localMessages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => localConversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
})

// Private Mode 知识库表
export const localKnowledgeBases = sqliteTable('knowledge_bases', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  embeddingModel: text('embedding_model').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// Private Mode 文档表
export const localDocuments = sqliteTable('documents', {
  id: text('id').primaryKey(),
  knowledgeBaseId: text('knowledge_base_id')
    .notNull()
    .references(() => localKnowledgeBases.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull(),
})
```

#### 3. 模式切换逻辑
```typescript
// client/src/contexts/ModeContext.tsx
import { createContext, useContext, useState, useEffect } from 'react'

type RunMode = 'cloud' | 'private'

interface ModeContextValue {
  mode: RunMode
  setMode: (mode: RunMode) => void
  isPrivateMode: boolean
}

const ModeContext = createContext<ModeContextValue | null>(null)

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<RunMode>('cloud')

  // 从本地存储恢复模式
  useEffect(() => {
    const savedMode = localStorage.getItem('run-mode') as RunMode || 'cloud'
    setModeState(savedMode)
  }, [])

  const setMode = (newMode: RunMode) => {
    setModeState(newMode)
    localStorage.setItem('run-mode', newMode)

    // 通知 Electron 主进程切换数据库
    window.electron.ipcRenderer.send('mode:switch', newMode)
  }

  return (
    <ModeContext.Provider value={{
      mode,
      setMode,
      isPrivateMode: mode === 'private'
    }}>
      {children}
    </ModeContext.Provider>
  )
}

export const useMode = () => {
  const context = useContext(ModeContext)
  if (!context) throw new Error('useMode must be used within ModeProvider')
  return context
}
```

### 替代方案

- ❌ **单数据库 + mode 字段**: 需要所有查询都加 WHERE 过滤，容易遗漏导致数据泄露
- ⚠️ **完全独立的数据目录**: 更彻底隔离，但增加管理复杂度

### 数据迁移考虑

根据规格文档 FR-013，我们 **不支持** Cloud/Private 模式间的数据迁移。但可以在未来提供：

- **手动导出**: 用户可以导出对话为 JSON/Markdown 文件
- **手动导入**: 用户可以将导出的文件导入到另一模式

---

## Decision 5: Electron 版本和兼容性

### 决策

**使用 Electron 30.x**（最新稳定版本，截至 2025-10-20）

### 理由

1. **现代 Chromium**: Electron 30 基于 Chromium 124，支持最新 Web API
2. **Node.js 20.x**: 内置 Node.js 20，长期支持（LTS）
3. **性能优化**: V8 引擎持续优化，内存占用降低
4. **安全更新**: 及时的安全补丁和漏洞修复
5. **生态兼容**: electron-ollama、LanceDB 等库均支持

### 兼容性矩阵

| Electron 版本 | Chromium | Node.js | 支持状态 | 推荐用于 |
|--------------|----------|---------|----------|----------|
| **30.x** | 124 | 20.x | ✅ 最新稳定 | **新项目（推荐）** |
| 29.x | 122 | 20.x | ✅ 稳定 | 保守项目 |
| 28.x | 120 | 18.x | ⚠️ 接近 EOL | 遗留项目 |

### package.json 配置
```json
{
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.13.0"
  }
}
```

### 跨平台测试计划

- ✅ macOS 13+ (Intel + Apple Silicon)
- ✅ Windows 10/11
- ⚠️ Linux (Ubuntu 22.04+, 可选支持)

---

## 总结

所有技术选型已完成，关键决策：

1. ✅ **Ollama 集成**: `electron-ollama` 运行时下载
2. ✅ **向量数据库**: LanceDB 嵌入式存储
3. ✅ **测试框架**: Playwright (E2E) + Vitest (单元)
4. ✅ **数据隔离**: 独立 SQLite 文件
5. ✅ **Electron 版本**: 30.x 最新稳定版

准备进入 **Phase 1: Design & Contracts** 阶段。
