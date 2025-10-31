# OAuth 紧急变通方案

## 🚨 当前问题

- `window.electron.shell.openExternal` 存在但调用时报错
- 开发服务器 Electron 主进程启动失败

## ✅ 临时解决方案

### 方案 1: 使用 IPC 调用 shell.openExternal

不直接调用 preload 的 shell，而是通过 IPC 让主进程打开浏览器。

#### 步骤 1: 在主进程添加 IPC 处理器

**文件**: `client/src/main/index.ts`

在 `app.whenReady()` 中添加：

```typescript
// 注册 shell.openExternal IPC 处理器
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  console.log('[Main] Opening external URL:', url)
  await shell.openExternal(url)
  return { success: true }
})
```

#### 步骤 2: 修改 auth.ts 使用 IPC

**文件**: `client/src/renderer/src/lib/auth.ts`

```typescript
// 替换现有的 shell.openExternal 调用
if (window.electron?.ipcRenderer) {
  console.log('[OAuth] Using IPC to open external URL')
  await window.electron.ipcRenderer.invoke('shell:openExternal', data.url)
  console.log('[OAuth] Successfully triggered browser open')
} else {
  // Web 环境回退
  window.location.href = data.url
}
```

### 方案 2: 使用主进程打开 URL（推荐）

直接在主进程导入 shell 并打开，避免 preload 的复杂性。

#### 完整修改

**client/src/main/index.ts**:
```typescript
import { shell } from 'electron'

// 在 app.whenReady() 中添加
ipcMain.handle('oauth:openBrowser', async (_event, url: string) => {
  try {
    console.log('[OAuth] Opening browser:', url)
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    console.error('[OAuth] Failed to open browser:', error)
    return { success: false, error: String(error) }
  }
})
```

**client/src/renderer/src/lib/auth.ts**:
```typescript
// 在 signInWithGoogle 中
if (data?.url) {
  console.log('[OAuth] Opening OAuth URL in system browser:', data.url)

  if (window.electron?.ipcRenderer) {
    const result = await window.electron.ipcRenderer.invoke('oauth:openBrowser', data.url)
    if (result.success) {
      console.log('[OAuth] Browser opened successfully')
    } else {
      throw new Error(`Failed to open browser: ${result.error}`)
    }
  } else {
    window.location.href = data.url
  }
}
```

**优点**:
- ✅ 不依赖 preload 的 shell 暴露
- ✅ 更简单直接
- ✅ 更好的错误处理
- ✅ 不需要重新构建就能测试

## 🧪 快速测试

1. 添加上述 IPC 处理器
2. 重启开发服务器
3. 在 Console 测试：
```javascript
await window.electron.ipcRenderer.invoke('oauth:openBrowser', 'https://google.com')
```

## 🔧 为什么这个方案更好

1. **避免 preload 复杂性** - preload 的 this 绑定问题很难调试
2. **更安全** - 主进程可以验证 URL
3. **更容易调试** - 所有日志在主进程
4. **标准做法** - Electron 官方推荐通过 IPC 调用主进程功能

## 📚 实施优先级

1. **立即**: 使用方案 2（IPC 方式）
2. **长期**: 保留 preload shell 作为备用
3. **清理**: 成功后移除 debug 日志

---

**下一步**: 实施 IPC 方案并测试
