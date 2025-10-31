# OAuth 快速测试指南

## 🚨 当前问题

你遇到的错误：
```
Cannot read properties of undefined (reading 'openExternal')
```

**原因**：你运行的是**旧版本的打包应用**，不包含新的 preload 修改。

## ✅ 解决方案

### 方案 1: 重新构建应用（推荐）

```bash
# 1. 重新构建
npm run client:build

# 2. 安装新的 .dmg
# 找到: client/release/<version>/rafa-<version>-arm64.dmg
# 双击安装

# 3. 打开新安装的应用测试
```

### 方案 2: 开发环境测试（更快）

```bash
# 在开发环境测试（自动包含最新代码）
npm run dev

# 点击 "Continue with Google"
# 应该会在系统浏览器打开
```

## 🔍 验证修复

### 检查 1: shell API 是否可用

打开 DevTools (Cmd+Option+I)，在 Console 运行：

```javascript
console.log(window.electron.shell)
```

**期望输出**：
```javascript
{ openExternal: ƒ }
```

**错误输出**：
```javascript
undefined  // ← 说明需要重新构建
```

### 检查 2: OAuth 流程

1. 点击 "Continue with Google"
2. 查看 Console 日志：

**成功**：
```
[OAuth] Opening OAuth URL in system browser: https://...
[OAuth] Using electron.shell.openExternal
```

**失败（旧版本）**：
```
[OAuth] Opening OAuth URL in system browser: https://...
[OAuth] shell.openExternal is not available. Please rebuild the app.
[OAuth] Available APIs: Array [ "ipcRenderer" ]
Google sign-in error: Please rebuild the application...
```

## 📦 构建命令说明

### 完整构建流程

```bash
# 从项目根目录运行
npm run client:build
```

这个命令会：
1. 清理旧的构建文件
2. 编译 TypeScript (包括 preload)
3. 打包 Electron 应用
4. 生成 .dmg 安装包

**输出位置**：
```
client/release/<version>/rafa-<version>-arm64.dmg
```

### 构建时间

- 首次构建：~2-3 分钟
- 增量构建：~30-60 秒

## 🧪 测试清单

### 开发环境测试 ✅

```bash
npm run dev
```

- [ ] 应用启动成功
- [ ] 点击 "Continue with Google"
- [ ] **系统浏览器**自动打开（不是 Electron 窗口）
- [ ] 选择 Google 账号
- [ ] 授权后返回 Electron 应用
- [ ] 自动登录成功

### 生产环境测试 ⏳

```bash
npm run client:build
# 安装 .dmg
```

- [ ] 安装新版本成功
- [ ] 打开应用
- [ ] Console 显示 `window.electron.shell` 可用
- [ ] OAuth 流程完整工作
- [ ] Deep link 回调成功

## 🐛 常见问题

### Q1: 构建失败 "command not found"

**解决**：
```bash
# 确保在项目根目录
cd /Users/wei/Coding/rafa

# 确保依赖已安装
npm install

# 重新构建
npm run client:build
```

### Q2: 构建后仍然报错

**检查**：
```bash
# 1. 确认构建成功
ls -lh client/release/

# 2. 卸载旧版本
# 应用程序 → 拖动 rafa 到废纸篓

# 3. 重新安装
# 双击新的 .dmg
```

### Q3: 开发环境也报错

**原因**：开发环境应该自动包含最新代码

**解决**：
```bash
# 重启开发服务器
pkill -f "npm run dev"
npm run dev
```

## 📝 修改的文件汇总

构建会包含以下修改：

1. **preload/index.ts** - 暴露 shell.openExternal
2. **lib/auth.ts** - 使用 shell.openExternal
3. **global.d.ts** - 类型定义
4. **App.tsx** - OAuth IPC 监听器

## 🎯 预期结果

### 成功的日志输出

```
[OAuth] IPC listeners registered
[Model Config] Validation passed: Object
[OAuth] Opening OAuth URL in system browser: https://zrtckgjmkrttadrjviws.supabase.co/...
[OAuth] Using electron.shell.openExternal
```

### 系统浏览器打开

- Safari/Chrome/Firefox 自动打开（取决于系统默认）
- 显示 Google 登录页面
- URL: `https://accounts.google.com/...`

### 成功回调

```
[Deep Link] Received URL (macOS): rafa://auth/callback?access_token=...
[OAuth] Tokens received, sending to renderer...
[OAuth] Received tokens from main process
[OAuth] Session created successfully: user@example.com
```

## ⚡ 快速测试（推荐）

如果你想立即测试，**使用开发环境**：

```bash
# 1. 停止当前应用
# 2. 运行开发环境
npm run dev

# 3. 测试 OAuth
# 应该立即工作（包含所有最新代码）
```

---

**需要帮助？**
- 检查构建日志是否有错误
- 确认 `window.electron.shell` 在 Console 中可用
- 查看 OAuth 日志确认使用了 shell.openExternal
