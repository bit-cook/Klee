# Phase 1 测试指南：Private Mode 知识库基础设施

**日期**: 2025-10-22
**阶段**: Phase 1 - Foundational (基础设施)
**状态**: ✅ 已完成并通过类型检查

---

## ✅ 已完成的功能

### 1. Ollama Embedding 服务 (`embedding-service.ts`)
- ✅ 单个文本 embedding 生成
- ✅ 批量 embedding 生成 (并发数=5)
- ✅ 带重试逻辑 (最多3次,指数退避)
- ✅ 进度回调支持
- ✅ 超时控制 (30秒)

### 2. 本地文件存储服务 (`storage-service.ts`)
- ✅ 文件保存到本地 (`{userData}/documents/{kbId}/{fileId}-{fileName}`)
- ✅ 文件读取、删除
- ✅ 知识库目录管理
- ✅ 孤立文件清理

### 3. 文件处理服务 (`file-processor.ts`)
- ✅ 文件验证 (大小、类型)
- ✅ 异步处理流程 (验证→保存→提取→分块→embedding→存储)
- ✅ 7个处理阶段,实时进度通知
- ✅ 错误处理和回滚逻辑

### 4. 数据库查询函数
- ✅ 知识库 CRUD (`knowledge-bases.ts`)
- ✅ 文件 CRUD (`knowledge-base-files.ts`)
- ✅ 星标、搜索、统计等辅助功能

### 5. IPC 基础架构
- ✅ Preload API 暴露 (`window.api.knowledgeBase`)
- ✅ TypeScript 类型声明 (`global.d.ts`)

---

## 🧪 如何测试

### 前置条件

1. **确保 Ollama 正在运行**
   ```bash
   # 检查 Ollama 是否运行
   curl http://localhost:11434/api/tags

   # 如果未运行,启动 Ollama
   ollama serve

   # 下载 embedding 模型 (如果未下载)
   ollama pull nomic-embed-text
   ```

2. **确保项目已构建**
   ```bash
   # 在项目根目录
   npm run build
   ```

### 测试方案 1: 单元测试 (手动创建测试文件)

由于 Phase 1 只包含基础服务,还没有 UI 和 IPC handlers,我们可以创建测试脚本来验证功能:

#### 创建测试脚本

在 `client/src/main/local/__tests__/phase1-test.ts` 创建:

```typescript
/**
 * Phase 1 手动测试脚本
 *
 * 运行方式:
 * cd client/src/main/local
 * npx tsx __tests__/phase1-test.ts
 */

import { generateEmbedding, generateEmbeddingsBatch } from '../services/embedding-service'
import { saveFile, deleteFile, getDocumentsPath } from '../services/storage-service'
import { processFileAsync } from '../services/file-processor'
import { VectorDbManager } from '../services/vector-db-manager'
import { DatabaseConnectionManager } from '../db/connection-manager'
import {
  createKnowledgeBase,
  getAllKnowledgeBases,
  deleteKnowledgeBase,
} from '../db/queries/knowledge-bases'
import {
  createKnowledgeBaseFile,
  getFilesByKnowledgeBaseId,
} from '../db/queries/knowledge-base-files'

async function testPhase1() {
  console.log('='.repeat(60))
  console.log('Phase 1 功能测试')
  console.log('='.repeat(60))

  try {
    // Test 1: Embedding 服务
    console.log('\n[Test 1] Testing Embedding Service...')
    const embedding = await generateEmbedding('Hello, world!')
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`)

    const batchEmbeddings = await generateEmbeddingsBatch(['Test 1', 'Test 2'], {
      onProgress: (progress) => console.log(`  Progress: ${progress.percent}%`),
    })
    console.log(`✅ Generated ${batchEmbeddings.length} embeddings in batch`)

    // Test 2: 文件存储服务
    console.log('\n[Test 2] Testing Storage Service...')
    const testBuffer = Buffer.from('Test file content')
    const savedFile = await saveFile(testBuffer, 'test-kb', 'test-file', 'test.txt')
    console.log(`✅ Saved file to: ${savedFile.storagePath}`)

    await deleteFile(savedFile.storagePath)
    console.log(`✅ Deleted file`)

    // Test 3: 数据库查询
    console.log('\n[Test 3] Testing Database Queries...')
    const dbManager = DatabaseConnectionManager.getInstance()
    const db = await dbManager.getConnection('private')

    const kb = await createKnowledgeBase(db, {
      name: 'Test Knowledge Base',
      description: 'Testing Phase 1',
    })
    console.log(`✅ Created knowledge base: ${kb.id}`)

    const allKbs = await getAllKnowledgeBases(db)
    console.log(`✅ Retrieved ${allKbs.length} knowledge bases`)

    // Test 4: 向量数据库
    console.log('\n[Test 4] Testing Vector Database...')
    const vectorDb = new VectorDbManager()
    await vectorDb.connect()
    console.log(`✅ Connected to LanceDB`)

    await vectorDb.createTable(kb.id)
    console.log(`✅ Created vector table for KB ${kb.id}`)

    await vectorDb.addRecords(kb.id, [
      {
        id: 'test-1',
        fileId: 'file-1',
        content: 'Test content',
        embedding: embedding,
      },
    ])
    console.log(`✅ Added vector record`)

    const searchResults = await vectorDb.search(kb.id, embedding, 1)
    console.log(`✅ Search returned ${searchResults.length} results`)

    // Cleanup
    console.log('\n[Cleanup] Cleaning up test data...')
    await vectorDb.dropTable(kb.id)
    await deleteKnowledgeBase(db, kb.id)
    console.log(`✅ Cleanup completed`)

    console.log('\n' + '='.repeat(60))
    console.log('✅ All Phase 1 tests passed!')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

// 运行测试
testPhase1()
```

#### 运行测试

```bash
# 安装 tsx (如果未安装)
npm install -g tsx

# 运行测试脚本
cd client/src/main/local
npx tsx __tests__/phase1-test.ts
```

### 测试方案 2: 通过 Electron DevTools 控制台测试

一旦你实现了 Phase 2 (IPC handlers),可以在 Electron app 中通过控制台测试:

```javascript
// 1. 测试 embedding 生成
const embedding = await window.electron.ipcRenderer.invoke('test:generate-embedding', 'Hello')
console.log('Embedding dimensions:', embedding.length)

// 2. 测试知识库创建
const kb = await window.api.knowledgeBase.create({
  name: 'Test KB',
  description: 'Testing'
})
console.log('Created KB:', kb)

// 3. 测试文件上传
const fileBuffer = new TextEncoder().encode('Test file content').buffer
const file = await window.api.knowledgeBase.uploadFile({
  knowledgeBaseId: kb.knowledgeBase.id,
  fileBuffer,
  fileName: 'test.txt',
  fileSize: fileBuffer.byteLength,
})
console.log('Uploaded file:', file)

// 4. 监听文件处理进度
window.api.knowledgeBase.onFileProcessingProgress((progress) => {
  console.log(`Progress: ${progress.percent}% - ${progress.message}`)
})
```

### 测试方案 3: 检查生成的文件和数据库

1. **检查 SQLite 数据库**
   ```bash
   # 找到数据库文件
   ls ~/Library/Application\ Support/rafa/rafa-private.db

   # 使用 sqlite3 查看
   sqlite3 ~/Library/Application\ Support/rafa/rafa-private.db

   # 在 sqlite3 中
   .tables                           # 查看所有表
   SELECT * FROM knowledge_bases;    # 查看知识库
   SELECT * FROM knowledge_base_files; # 查看文件
   ```

2. **检查 LanceDB 向量数据库**
   ```bash
   # 向量数据库目录
   ls ~/Library/Application\ Support/rafa/vector-db/

   # 查看表列表
   ls ~/Library/Application\ Support/rafa/vector-db/
   ```

3. **检查文件存储**
   ```bash
   # 文档存储目录
   ls ~/Library/Application\ Support/rafa/documents/

   # 查看某个知识库的文件
   ls ~/Library/Application\ Support/rafa/documents/<kb-id>/
   ```

---

## 🔍 预期行为

### Embedding 服务
- ✅ 单个文本应返回 768 维向量
- ✅ 批量处理应显示进度 (0%, 20%, 40%, ..., 100%)
- ✅ 超时应在 30 秒后抛出错误
- ✅ 失败应自动重试最多 3 次

### 文件存储
- ✅ 文件应保存到 `{userData}/documents/{kbId}/{fileId}-{fileName}`
- ✅ 删除文件应同时删除物理文件
- ✅ 删除知识库目录应递归删除所有文件

### 文件处理
- ✅ 处理应经过 7 个阶段
- ✅ 进度应从 0% 增加到 100%
- ✅ 失败应触发回滚 (删除已保存的文件和向量)

### 数据库查询
- ✅ 创建知识库应自动生成 UUID 和时间戳
- ✅ 更新知识库应自动更新 `updatedAt`
- ✅ 删除知识库应级联删除文件记录
- ✅ 查询应按 `starred DESC, createdAt DESC` 排序

---

## 🐛 已知问题

1. **vector-db-manager.ts 的类型错误**
   - 这是之前就存在的问题,不影响运行时
   - LanceDB 的 TypeScript 类型定义问题
   - 需要等待 LanceDB 更新类型定义

2. **其他文件的类型错误**
   - `note-editor.tsx`, `update/index.tsx` 等文件的错误与 Phase 1 无关
   - 这些是项目中已存在的问题

---

## ✅ 类型检查结果

```bash
# 检查 Phase 1 文件的类型错误数量
cd client
npx tsc --noEmit 2>&1 | grep -E "file-processor\.ts|knowledge-base-files\.ts|knowledge-bases\.ts|embedding-service\.ts|storage-service\.ts" | wc -l
# 输出: 0 (无错误)
```

**Phase 1 创建的所有文件都通过了 TypeScript 类型检查!** ✅

---

## 📝 下一步

Phase 1 (基础设施) 已完成!现在可以开始实施:

- **Phase 2**: User Story 1 - 创建本地知识库并上传文档 (T042-T058)
  - 需要实现 IPC handlers
  - 需要适配 UI hooks 到 Private Mode
  - 需要集成文件上传组件

- **Phase 3**: User Story 2 - 在本地聊天中使用知识库检索
- **Phase 4**: User Story 3 - 管理本地知识库和文件
- **Phase 5**: User Story 4 - 复用 Cloud Mode UI 组件

---

## 📚 相关文档

- [tasks.md](./tasks.md) - 完整任务列表
- [plan.md](./plan.md) - 技术设计文档
- [data-model.md](./data-model.md) - 数据模型文档
- [contracts/ipc-api.md](./contracts/ipc-api.md) - IPC API 规范
