# 文档重构总结：智能 Ollama 检测策略

**日期**: 2025-10-21
**功能**: 006-private-mode
**重构原因**: 避免与用户已安装的系统 Ollama 产生进程冲突

---

## 🎯 重构目标

将原有的"强制使用内嵌 Ollama"策略改为"智能检测优先复用系统 Ollama"策略，解决以下问题：

### 原有设计的问题

| 问题 | 影响 | 严重性 |
|------|------|--------|
| **端口冲突** | 系统 Ollama 和内嵌 Ollama 同时监听 11434 端口 | 🔴 高 |
| **模型重复** | 用户需要下载两份相同的模型文件（4-8GB/个） | 🟡 中 |
| **进程误杀** | `pkill -f ollama` 可能杀掉用户的系统 Ollama | 🔴 高 |
| **磁盘浪费** | Ollama 二进制 + 模型占用 ~10GB+ 额外空间 | 🟡 中 |

### 新设计的优势

✅ **智能检测**: 2秒内检测 `localhost:11434` 是否运行 Ollama
✅ **优先复用**: 系统 Ollama 可用时直接使用，节省 ~10GB+ 磁盘空间
✅ **自动降级**: 检测失败自动下载内嵌版本，用户无感知
✅ **精确管理**: 仅关闭内嵌 Ollama，不影响系统进程
✅ **UI 透明**: 显示 Ollama 来源（System/Embedded）

---

## 📋 更新的文档

### 1. [research.md](./research.md)

**核心变更**:
- Decision 1 标题改为："优先复用系统 Ollama，必要时使用内嵌版本"
- 新增 `detectSystemOllama()` 方法实现
- 新增 `getSource()` 方法返回 Ollama 来源
- 重构 `shutdown()` 逻辑：仅关闭内嵌版本
- 新增三种场景详解：系统 Ollama 运行中、未安装、已安装但未运行

**新增代码示例**:
```typescript
type OllamaSource = 'system' | 'embedded' | 'none'

private async detectSystemOllama(): Promise<boolean> {
  // 检测 localhost:11434 是否有 Ollama API 响应
  // 2秒超时，验证返回数据包含 'models' 字段
}
```

### 2. [tasks.md](./tasks.md)

**任务计数更新**:
- 总任务数: 85 → **91** (+6)
- Phase 3 任务: 15 → **21** (+6)

**新增任务**:
- T025.1: 实现 `detectSystemOllama()` 方法
- T025.2: 添加 `getSource()` 方法
- T028.1: 精确进程过滤（macOS/Linux/Windows）
- T029.1: 发送 `ollama-ready` 事件到渲染进程
- T034.1: 创建 `useOllamaSource` hook
- T037.1: UI 显示 Ollama 来源徽章

**修改的任务描述**:
- T025: 添加 `OllamaSource` 类型定义
- T026: 改为"优先检测系统 Ollama，失败则下载内嵌版本"
- T027: 进度事件包含 `source` 信息
- T028: 改为"仅关闭内嵌 Ollama"
- T029: 改为"智能关闭"

### 3. [data-model.md](./data-model.md)

**新增章节**: "Ollama 来源策略"

**存储位置说明**:
```
userData/
├── rafa-private.db
├── rafa-cloud.db
└── ollama/              # 仅在系统无 Ollama 时使用
    ├── bin/
    └── models/
```

**新增对比表格**:
| 场景 | Ollama 位置 | 模型位置 | 磁盘占用 |
|------|------------|---------|---------|
| 系统已安装 | `/usr/local/bin/ollama` | `~/.ollama/models/` | 0 MB (复用) |
| 系统未安装 | `userData/ollama/bin/` | `userData/ollama/models/` | ~500MB + 模型 |

### 4. [plan.md](./plan.md)

**Summary 部分**:
- 新增"技术方案"小节
- 新增"核心优势"列表（4条）

**Primary Dependencies**:
- 明确 `electron-ollama` 用途："智能 Ollama 管理，优先检测系统版本"
- 明确 Electron 版本: 33.4.11
- 明确测试框架: Playwright + Vitest

### 5. [quickstart.md](./quickstart.md)

**Step 2 重构**:
- 标题改为："Ollama 服务管理（智能检测版本）"
- 完整代码示例包含检测、降级、精确关闭逻辑
- 新增 Windows 进程过滤实现（wmic）

---

## 🔄 技术实现对比

### 检测逻辑（新增）

**之前**: 无检测，直接下载内嵌 Ollama

**现在**:
```typescript
// 1. 检测系统 Ollama
const systemOllamaAvailable = await this.detectSystemOllama()

if (systemOllamaAvailable) {
  this.ollamaSource = 'system'
  return { source: 'system', url: 'http://localhost:11434' }
}

// 2. 系统无 Ollama，下载内嵌版本
this.ollamaSource = 'embedded'
this.ollama = new ElectronOllama({ basePath: this.basePath })
await this.ollama.serve(...)
```

### 关闭逻辑（重构）

**之前**: 无条件 `pkill -f ollama`（误杀风险）

**现在**:
```typescript
async shutdown() {
  // 仅关闭内嵌 Ollama
  if (this.ollamaSource === 'system') {
    console.log('ℹ️ Using system Ollama, skipping shutdown')
    return
  }

  // 精确过滤进程（通过 basePath）
  const ollamaPath = path.join(this.basePath, 'bin', 'ollama')
  exec(`pkill -f "${ollamaPath}"`)  // 仅杀掉 userData 中的进程
}
```

### UI 显示（新增）

**新增组件**:
```tsx
// 显示 Ollama 来源
const { ollamaSource } = useOllamaSource()

{ollamaSource === 'system' ? (
  <Badge variant="outline">Using System Ollama</Badge>
) : (
  <Badge variant="secondary">Using Embedded Ollama</Badge>
)}
```

---

## 📊 影响分析

### 用户体验提升

| 场景 | 之前 | 现在 | 改进 |
|------|------|------|------|
| 已有系统 Ollama | 下载 500MB + 模型重复 | 即时可用，共享模型 | ✅ 节省 ~10GB+，即时启动 |
| 无系统 Ollama | 下载 500MB + 模型 | 下载 500MB + 模型 | ➖ 无变化 |
| 关闭应用 | 可能杀掉系统 Ollama | 仅关闭内嵌版本 | ✅ 不影响系统进程 |

### 开发任务增加

- **新增任务**: 6 个
- **修改任务**: 7 个
- **估计工时**: +2-3 小时（检测逻辑 + 精确关闭 + UI）
- **复杂度**: 低-中（主要是条件判断和进程过滤）

### 风险评估

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| 检测超时影响启动速度 | 低 | 2秒超时，用户几乎无感知 |
| Windows 进程过滤失败 | 中 | 添加后备 `taskkill` 逻辑 |
| 系统 Ollama 版本过旧 | 低 | API 兼容性强，暂不需版本检查 |

---

## ✅ 验收标准

### 功能验收

- [ ] 用户已运行系统 Ollama → Rafa 检测并复用，UI 显示 "System Ollama"
- [ ] 用户未安装 Ollama → Rafa 自动下载内嵌版本，UI 显示 "Embedded Ollama"
- [ ] 关闭 Rafa 时 → 系统 Ollama 仍在运行（如果原本在运行）
- [ ] 端口 11434 被占用 → Rafa 检测成功，不尝试启动第二个实例
- [ ] 网络断开时 → 检测超时（2秒），自动降级到内嵌版本

### 代码质量

- [ ] TypeScript 类型完整（`OllamaSource` 类型定义）
- [ ] 错误处理健全（检测失败、下载失败、关闭失败）
- [ ] 跨平台兼容（macOS/Windows/Linux 进程管理）
- [ ] 单元测试覆盖（检测逻辑、关闭逻辑）

### 文档完整性

- [X] research.md 更新
- [X] tasks.md 更新（+6 任务）
- [X] data-model.md 更新
- [X] plan.md 更新
- [X] quickstart.md 更新
- [X] 创建本总结文档

---

## 🚀 下一步行动

1. **开发团队**: 按照更新后的 tasks.md Phase 3 实现检测逻辑
2. **测试团队**: 准备三种测试环境（系统 Ollama 运行中、未安装、已安装未运行）
3. **产品团队**: 准备 UI 文案（"Using System Ollama" vs "Using Embedded Ollama"）
4. **文档团队**: 添加用户文档说明 Ollama 来源的含义

---

## 📚 参考资料

- [Ollama API 文档](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [electron-ollama GitHub](https://github.com/antarasi/electron-ollama)
- [Electron 进程管理最佳实践](https://www.electronjs.org/docs/latest/tutorial/process-model)

---

**总结**: 此次重构显著提升了用户体验（避免冲突、节省空间），同时增加了系统的智能性和健壮性。开发成本可控（+6 任务），风险低。
