# Electron + Supabase OAuth 实现指南

**简洁参考版本 - 适用于所有 Electron + Supabase 项目**

---

## 🎯 核心原理

Electron 应用使用 Supabase OAuth 的关键：
1. **系统浏览器打开** OAuth 页面（不在 Electron 窗口内）
2. **Deep link 回调** - 使用自定义协议（如 `myapp://auth/callback`）
3. **主进程处理** - 提取 tokens 并发送到渲染进程
4. **创建 session** - 使用 `supabase.auth.setSession()`

---

## 📋 实现步骤

### 1. 注册自定义协议

**electron-builder.json**:
```json
{
  "protocols": [
    {
      "name": "MyApp Protocol",
      "schemes": ["myapp"]
    }
  ]
}
```

**主进程** (`main/index.ts`):
```typescript
import { app, shell, ipcMain } from 'electron'

// 在 app.whenReady() 之前
if (process.defaultApp) {
  // 开发环境
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('myapp', process.execPath, [
      path.resolve(process.argv[1])
    ])
  }
} else {
  // 生产环境
  app.setAsDefaultProtocolClient('myapp')
}
```

### 2. 主进程 - 注册 IPC 处理器

```typescript
app.whenReady().then(() => {
  // 1. 打开浏览器
  ipcMain.handle('oauth:openBrowser', async (_event, url: string) => {
    await shell.openExternal(url)
    return { success: true }
  })

  // ... 其他初始化代码
})

// 2. 处理 OAuth 回调
function handleOAuthCallback(url: string) {
  const urlObj = new URL(url)

  if (urlObj.protocol === 'myapp:' && urlObj.pathname.includes('callback')) {
    // 从 hash 提取 tokens (Supabase 使用 hash 格式)
    const accessToken = urlObj.hash.match(/access_token=([^&]*)/)?.[1]
    const refreshToken = urlObj.hash.match(/refresh_token=([^&]*)/)?.[1]

    if (accessToken && refreshToken) {
      // 发送到渲染进程
      mainWindow.webContents.send('oauth-success', { accessToken, refreshToken })
      mainWindow.focus()
    }
  }
}

// 3. 监听 deep link 事件
// macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleOAuthCallback(url)
})

// Windows/Linux
app.on('second-instance', (_event, commandLine) => {
  if (mainWindow) {
    mainWindow.focus()
  }
  const deepLinkUrl = commandLine.find((arg) => arg.startsWith('myapp://'))
  if (deepLinkUrl) {
    handleOAuthCallback(deepLinkUrl)
  }
})
```

### 3. 渲染进程 - 发起 OAuth

**lib/auth.ts**:
```typescript
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'myapp://auth/callback',
      skipBrowserRedirect: true, // 关键：不自动重定向
    },
  })

  if (error) throw error

  // 使用 IPC 在系统浏览器打开
  if (window.electron?.ipcRenderer) {
    await window.electron.ipcRenderer.invoke('oauth:openBrowser', data.url)
  }
}

export async function createSessionFromOAuthTokens(
  accessToken: string,
  refreshToken: string
) {
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) throw error
}
```

### 4. 渲染进程 - 监听 OAuth 回调

**App.tsx**:
```typescript
function App() {
  useEffect(() => {
    if (!window.electron?.ipcRenderer) return

    const handleOAuthSuccess = async (_event, { accessToken, refreshToken }) => {
      try {
        await createSessionFromOAuthTokens(accessToken, refreshToken)
        // 导航到首页或显示成功消息
        router.navigate({ to: '/' })
      } catch (error) {
        console.error('Failed to create session:', error)
      }
    }

    window.electron.ipcRenderer.on('oauth-success', handleOAuthSuccess)

    return () => {
      window.electron.ipcRenderer.off('oauth-success', handleOAuthSuccess)
    }
  }, [])

  return <YourApp />
}
```

### 5. Preload 脚本 - 暴露 IPC

**preload/index.ts**:
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    off: (channel, listener) => ipcRenderer.off(channel, listener),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  },
})
```

### 6. 类型定义

**global.d.ts**:
```typescript
interface Window {
  electron?: {
    ipcRenderer: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
      off: (channel: string, listener: (...args: any[]) => void) => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}
```

### 7. Supabase Dashboard 配置

1. 访问: https://supabase.com/dashboard
2. 选择项目 → **Authentication** → **URL Configuration**
3. 添加 Redirect URL: `myapp://auth/callback`
4. 保存

---

## 🔑 关键要点

### ✅ 必须做的

1. **使用 `skipBrowserRedirect: true`** - 不让 Supabase 自动重定向
2. **从 hash 提取 tokens** - Supabase 使用 `#access_token=...` 格式
3. **系统浏览器打开** - 使用 `shell.openExternal`，不在 Electron 窗口内
4. **IPC 通信** - 主进程和渲染进程通过 IPC 传递 tokens
5. **单例锁** - Windows/Linux 需要 `requestSingleInstanceLock()`

### ❌ 避免的错误

1. ~~不要在 Electron 窗口内打开 OAuth~~ - Google 会阻止
2. ~~不要直接使用 preload shell.openExternal~~ - this 绑定问题
3. ~~不要忘记 `event.preventDefault()`~~ - macOS open-url 事件
4. ~~不要使用 query params 提取 tokens~~ - Supabase 用 hash

---

## 🧪 测试

### 开发环境
```bash
npm run dev
# 点击登录 → 浏览器打开 → 选择账号 → 自动返回应用
```

### 生产环境
```bash
# 构建（跳过代码签名）
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run build

# 安装并测试
```

### 手动测试 Deep Link
```bash
# macOS
open "myapp://auth/callback?test=1"

# 应该看到应用聚焦并输出日志
```

---

## 📊 完整流程

```
用户点击登录
  ↓
渲染进程: signInWithGoogle()
  ↓
Supabase: 返回 OAuth URL
  ↓
渲染进程: IPC 调用 oauth:openBrowser
  ↓
主进程: shell.openExternal(url)
  ↓
系统浏览器: 打开 Google 登录
  ↓
用户选择账号并授权
  ↓
浏览器: 重定向到 myapp://auth/callback#access_token=...
  ↓
主进程: open-url 事件触发
  ↓
主进程: 提取 tokens
  ↓
主进程: IPC 发送 oauth-success
  ↓
渲染进程: createSessionFromOAuthTokens()
  ↓
登录成功 ✅
```

---

## 🐛 故障排查

| 问题 | 检查 | 解决 |
|------|------|------|
| 浏览器打开但不跳回 | Deep link 是否注册 | 重启应用或重装 |
| Session 未创建 | 检查 IPC 监听器 | 确认 `oauth-success` 已注册 |
| Token 提取失败 | 检查是否从 hash 提取 | 使用 `urlObj.hash.match()` |
| 开发环境不工作 | 协议注册参数 | 使用 `process.execPath` |

---

## 📝 最小示例

**main.ts**:
```typescript
app.setAsDefaultProtocolClient('myapp')

app.whenReady().then(() => {
  ipcMain.handle('oauth:openBrowser', async (_, url) => {
    await shell.openExternal(url)
  })
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  const accessToken = url.match(/access_token=([^&]*)/)?.[1]
  const refreshToken = url.match(/refresh_token=([^&]*)/)?.[1]
  if (accessToken && refreshToken) {
    mainWindow.webContents.send('oauth-success', { accessToken, refreshToken })
  }
})
```

**renderer.tsx**:
```typescript
// 发起登录
const { data } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: 'myapp://auth/callback', skipBrowserRedirect: true },
})
await window.electron.ipcRenderer.invoke('oauth:openBrowser', data.url)

// 监听回调
window.electron.ipcRenderer.on('oauth-success', async (_, { accessToken, refreshToken }) => {
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
})
```

---

**创建日期**: 2025-10-28
**测试环境**: macOS, Electron 33.2.1, Supabase 2.x
**状态**: ✅ 生产可用
