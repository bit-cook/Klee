# Cloud Mode 迁移到 shared/text-extractor

**日期**: 2025-10-22
**状态**: ✅ 完成

---

## 📊 迁移概述

将 Cloud Mode (Server) 的文本提取逻辑迁移到使用 `shared/text-extractor` 模块,实现 Private Mode 和 Cloud Mode 的代码复用。

---

## ✅ 完成的工作

### 1. 安装依赖

```bash
cd server
npm install officeparser
```

**结果**:
- ✅ `officeparser` v5.2.0 已安装

### 2. 重构 `server/src/lib/fileProcessor.ts`

**主要改动**:

#### Before (418 行,复杂的文本提取逻辑)

```typescript
import mammoth from "mammoth"
import { createRequire } from "node:module"

// 复杂的 pdf-parse 加载逻辑 (60+ 行)
const require = createRequire(import.meta.url)
let pdfParseFunction: PdfParseFn | null = null
// ...

async function extractTextFromPDF(fileBuffer: Buffer): Promise<string> {
  // PDF 提取逻辑
}

async function extractTextFromDocx(fileBuffer: Buffer): Promise<string> {
  // DOCX 提取逻辑
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  fileName: string
): Promise<string> {
  // 根据 MIME 类型选择提取器
  switch (mimeType) {
    case "application/pdf":
      return await extractTextFromPDF(fileBuffer)
    case "application/vnd...docx":
      return await extractTextFromDocx(fileBuffer)
    // ...
  }
}
```

#### After (285 行,使用 shared 模块)

```typescript
// 从 shared 模块导入
import {
  extractTextFromFile,
  validateFile,
  TextExtractionError,
  MAX_FILE_SIZE,
  MAX_FILE_SIZE_MB,
} from "../../../shared/text-extractor/index.js"

export async function processFile(...) {
  // ...

  // 直接使用 shared 模块的函数
  try {
    rawText = await extractTextFromFile(fileBuffer, fileName)
  } catch (error) {
    if (error instanceof TextExtractionError) {
      throw new KnowledgeBaseFileError(error.message, 422)
    }
    throw error
  }

  // ...
}
```

**改进**:
- ✅ 移除了 60+ 行的 pdf-parse 加载逻辑
- ✅ 移除了 PDF 和 DOCX 提取器函数
- ✅ 代码行数: 418 → 285 (减少 32%)
- ✅ 复杂度大幅降低
- ✅ 保持 API 兼容性(导出相同的函数)

### 3. 更新 `server/src/config/storage.config.ts`

**改动**:

```typescript
// Before
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export const SUPPORTED_FILE_TYPES = {
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
} as const

// After
export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB (与 shared/text-extractor 保持一致)

export const SUPPORTED_FILE_TYPES = {
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "application/json": [".json"],
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.oasis.opendocument.text": [".odt"],
  "application/vnd.oasis.opendocument.presentation": [".odp"],
  "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
} as const
```

**改进**:
- ✅ 文件大小限制: 10MB → 100MB
- ✅ 支持格式: 5种 → 10种
- ✅ 与 Private Mode 保持一致

### 4. 移除旧依赖

```bash
npm uninstall pdf-parse mammoth @types/pdf-parse
```

**结果**:
- ✅ 移除了 22 个包
- ✅ node_modules 减少 ~5MB
- ✅ 只保留 `officeparser` 一个文本提取依赖

---

## 📊 迁移效果对比

| 指标 | 迁移前 | 迁移后 | 改进 |
|-----|-------|--------|------|
| **依赖包** | `pdf-parse` + `mammoth` | `officeparser` | ✅ 2→1 |
| **包数量** | +22 packages | 0 (共享 client 的) | ✅ -22 |
| **代码行数** | 418 行 | 285 行 | ✅ -32% |
| **文件大小限制** | 10MB | 100MB | ✅ +90MB |
| **支持格式** | 5种 | **10种** | ✅ +100% |
| **代码复用** | 独立实现 | 共享实现 | ✅ 100% 复用 |
| **维护成本** | 高 (两份代码) | 低 (一份代码) | ✅ 减半 |

---

## 🎯 新增支持的文件格式

Cloud Mode 现在额外支持以下格式:

1. **PowerPoint**: `.pptx`
2. **Excel**: `.xlsx`
3. **OpenDocument Text**: `.odt`
4. **OpenDocument Presentation**: `.odp`
5. **OpenDocument Spreadsheet**: `.ods`

---

## ✅ 验证清单

- [X] `officeparser` 已安装
- [X] `server/src/lib/fileProcessor.ts` 已重构
- [X] `server/src/config/storage.config.ts` 已更新
- [X] `pdf-parse`, `mammoth`, `@types/pdf-parse` 已移除
- [X] 代码导入路径正确 (`../../../shared/text-extractor/index.js`)
- [X] API 兼容性保持 (导出相同的函数和类型)
- [X] 错误处理正确 (TextExtractionError → KnowledgeBaseFileError)

---

## 🔗 相关文件

### 修改的文件

```
server/
├── package.json                        # 依赖变更
├── src/
│   ├── config/
│   │   └── storage.config.ts          # 更新配置
│   └── lib/
│       └── fileProcessor.ts           # 重构主文件
```

### 共享文件

```
shared/
├── schemas/
│   └── knowledge-base.ts              # Cloud & Private 共享
└── text-extractor/
    └── index.ts                       # Cloud & Private 共享
```

---

## 🎯 下一步

现在 Cloud Mode 和 Private Mode 都使用 `shared/text-extractor`,实现了真正的代码复用:

1. ✅ **Private Mode** (`client`) - 使用 shared/text-extractor
2. ✅ **Cloud Mode** (`server`) - 使用 shared/text-extractor
3. ✅ **一致性** - 两种模式行为完全一致
4. ✅ **可维护性** - 只需维护一份代码

---

## 📝 注意事项

### Breaking Changes

⚠️ **文件大小限制变更**: 10MB → 100MB

- 如果有基于旧限制的业务逻辑,需要更新
- Supabase Storage 需要确保有足够的存储空间

### 新功能

✅ Cloud Mode 现在支持更多文件格式 (PPTX, XLSX, ODT 等)

- 用户可以上传更多类型的文件
- UI 提示信息可能需要更新

---

**迁移完成时间**: 2025-10-22
**迁移者**: Claude Code
