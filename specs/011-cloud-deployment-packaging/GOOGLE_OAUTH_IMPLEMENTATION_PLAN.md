# Google OAuth Deep Link 实施计划

**功能**: 在 Electron 打包应用中支持 Google OAuth 登录
**协议**: `rafa://auth/callback`
**状态**: 📋 待实施

---

## 🎯 目标

实现 Electron 应用中的 Google OAuth 登录，使用自定义协议 `rafa://` 处理 OAuth 回调。

---

## 📚 技术背景

### 问题根源
- Electron 打包后 `window.location.origin` 是 `file://`
- OAuth 回调需要有效的 URL（http/https 或自定义协议）
- 浏览器 OAuth 流程完成后需要重定向回 Electron 应用

### 解决方案
使用 **Deep Linking**：
1. 注册自定义协议 `rafa://`（已在 electron-builder.json 配置）
2. OAuth 回调到 `rafa://auth/callback?access_token=...`
3. Electron 捕获 deep link，提取 token，创建 session

---

## 📝 实施步骤

### 步骤 1: Electron 主进程注册 Deep Link 协议 ✅

**文件**: `client/src/main/index.ts`

**代码位置**: 在 `app.whenReady()` 之前

```typescript
// 注册自定义协议处理
if (process.defaultApp) {
  // 开发环境
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('rafa', process.execPath, [
      path.resolve(process.argv[1])
    ])
  }
} else {
  // 生产环境
  app.setAsDefaultProtocolClient('rafa')
}
```

---

### 步骤 2: 处理 macOS 的 `open-url` 事件

**文件**: `client/src/main/index.ts`

**代码位置**: 在 `app.whenReady()` 之后

```typescript
// macOS: 处理 deep link
app.on('open-url', (event, url) => {
  event.preventDefault()
  console.log('[Deep Link] Received URL (macOS):', url)

  handleOAuthCallback(url)
})

function handleOAuthCallback(url: string) {
  try {
    const urlObj = new URL(url)

    // 检查是否是 OAuth 回调
    if (urlObj.protocol === 'rafa:' && urlObj.pathname.includes('auth/callback')) {
      // 提取 token
      const accessToken = urlObj.searchParams.get('access_token')
      const refreshToken = urlObj.searchParams.get('refresh_token')
      const error = urlObj.searchParams.get('error')
      const errorDescription = urlObj.searchParams.get('error_description')

      if (error) {
        console.error('[OAuth] Error:', error, errorDescription)
        // 通知渲染进程
        if (win && !win.isDestroyed()) {
          win.webContents.send('oauth-error', { error, errorDescription })
        }
        return
      }

      if (accessToken && refreshToken) {
        console.log('[OAuth] Tokens received, sending to renderer...')
        // 通知渲染进程
        if (win && !win.isDestroyed()) {
          win.webContents.send('oauth-success', { accessToken, refreshToken })
          // 如果窗口最小化，恢复并聚焦
          if (win.isMinimized()) win.restore()
          win.focus()
        }
      }
    }
  } catch (err) {
    console.error('[OAuth] Failed to parse deep link URL:', err)
  }
}
```

---

### 步骤 3: 处理 Windows/Linux 的 `second-instance` 事件

**文件**: `client/src/main/index.ts`

**代码位置**: 在 `app.requestSingleInstanceLock()` 之后

```typescript
// 确保单实例运行（Windows/Linux deep link 需要）
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...')
  app.quit()
  process.exit(0)
} else {
  // Windows/Linux: 处理 deep link（第二个实例启动时触发）
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Deep Link] Second instance triggered (Windows/Linux):', commandLine)

    // 恢复主窗口
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }

    // 从命令行参数中提取 deep link URL
    const deepLinkUrl = commandLine.find((arg) => arg.startsWith('rafa://'))
    if (deepLinkUrl) {
      handleOAuthCallback(deepLinkUrl)
    }
  })
}
```

---

### 步骤 4: 渲染进程接收 Token 并创建 Session

**文件**: `client/src/renderer/src/lib/auth.ts`

**新增函数**:

```typescript
/**
 * 使用 OAuth tokens 创建 session
 * 由 Electron IPC 在 OAuth 回调后调用
 */
export async function createSessionFromOAuthTokens(
  accessToken: string,
  refreshToken: string
): Promise<void> {
  const client = getSupabaseClient()

  const { data, error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    console.error('[OAuth] Failed to create session:', error.message)
    throw error
  }

  console.log('[OAuth] Session created successfully:', data.session?.user?.email)
}
```

**文件**: `client/src/renderer/src/App.tsx` 或适当的组件

**添加 IPC 监听器**:

```typescript
import { createSessionFromOAuthTokens } from '@/lib/auth'
import { useNavigate } from '@tanstack/react-router'

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    // 监听 OAuth 成功事件
    const handleOAuthSuccess = async (_event: any, { accessToken, refreshToken }: any) => {
      try {
        await createSessionFromOAuthTokens(accessToken, refreshToken)
        // 导航到首页
        navigate({ to: '/' })
      } catch (error) {
        console.error('[OAuth] Failed to handle callback:', error)
        // 显示错误提示
      }
    }

    // 监听 OAuth 错误事件
    const handleOAuthError = (_event: any, { error, errorDescription }: any) => {
      console.error('[OAuth] Error:', error, errorDescription)
      // 显示错误提示
    }

    // @ts-ignore (Electron IPC)
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on('oauth-success', handleOAuthSuccess)
      window.electron.ipcRenderer.on('oauth-error', handleOAuthError)

      return () => {
        window.electron.ipcRenderer.off('oauth-success', handleOAuthSuccess)
        window.electron.ipcRenderer.off('oauth-error', handleOAuthError)
      }
    }
  }, [navigate])

  // ...
}
```

---

### 步骤 5: 配置 Supabase Dashboard

**操作清单**:

1. **登录 Supabase Dashboard**
   - 访问: https://supabase.com/dashboard

2. **导航到项目设置**
   - 选择你的项目（`zrtckgjmkrttadrjviws`）
   - 点击 **Authentication** → **URL Configuration**

3. **添加 Redirect URL**
   - 在 **Redirect URLs** 部分，点击 **Add URL**
   - 添加: `rafa://auth/callback`
   - 点击 **Save**

4. **验证配置**
   - 确认 `rafa://auth/callback` 出现在允许的 URL 列表中

---

### 步骤 6: 测试 Google OAuth 登录

**测试步骤**:

1. **重新构建应用**
   ```bash
   npm run client:build
   ```

2. **安装新的 .dmg 文件**

3. **测试 OAuth 流程**
   - 点击 "Continue with Google"
   - 浏览器打开 Google 登录页面
   - 选择 Google 账号并授权
   - 浏览器重定向到 `rafa://auth/callback?access_token=...`
   - Electron 应用自动打开并聚焦
   - 应用自动登录并导航到首页

4. **验证 Session 持久化**
   - 重启应用
   - 确认仍保持登录状态

5. **调试日志**
   - 打开 DevTools 查看控制台
   - 应该看到：
     ```
     [Deep Link] Received URL (macOS): rafa://auth/callback?access_token=...
     [OAuth] Tokens received, sending to renderer...
     [OAuth] Session created successfully: user@example.com
     ```

---

## 🐛 故障排查

### 问题 1: Deep link 不触发

**症状**: 浏览器重定向后应用没有反应

**排查**:
1. 检查协议是否注册：
   ```bash
   # macOS
   /System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -dump | grep rafa
   ```
2. 确认 `electron-builder.json` 中的 `protocols` 配置正���
3. 检查 `app.setAsDefaultProtocolClient('rafa')` 是否在 `app.whenReady()` 之前调用

---

### 问题 2: Token 解析失败

**症状**: 控制台显示 "Failed to parse deep link URL"

**排查**:
1. 打印完整的 URL：`console.log('[Deep Link] Full URL:', url)`
2. 检查 Supabase 回调的 URL 格式
3. 确认 URL 中包含 `access_token` 和 `refresh_token`

---

### 问题 3: Session 创建失败

**症状**: `setSession` 返回错误

**排查**:
1. 检查 token 是否有效（未过期）
2. 验证 Supabase 客户端初始化正确
3. 检查网络连接

---

## 📊 实施检查清单

### 代码修改
- [ ] `client/src/main/index.ts` - 注册协议
- [ ] `client/src/main/index.ts` - 添加 `open-url` 事件处理（macOS）
- [ ] `client/src/main/index.ts` - 添加 `second-instance` 事件处理（Windows/Linux）
- [ ] `client/src/main/index.ts` - 实现 `handleOAuthCallback` 函数
- [ ] `client/src/renderer/src/lib/auth.ts` - 添加 `createSessionFromOAuthTokens` 函数
- [ ] `client/src/renderer/src/App.tsx` - 添加 IPC 监听器
- [ ] `client/src/renderer/src/lib/auth.ts` - 已修改 `signInWithGoogle` 使用 `rafa://auth/callback`

### Supabase 配置
- [ ] 添加 `rafa://auth/callback` 到 Redirect URLs

### 测试
- [ ] 本地开发环境测试（可选）
- [ ] 打包后 macOS 测试
- [ ] Session 持久化验证
- [ ] 错误处理测试

---

## 🔗 参考资源

- [Supabase Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Electron Deep Links Official Guide](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)
- [Supabase signInWithOAuth API](https://supabase.com/docs/reference/javascript/auth-signinwithoauth)
- [GitHub Discussion: Electron OAuth](https://github.com/orgs/supabase/discussions/17722)

---

**创建日期**: 2025-10-27
**预估时间**: 2-3 小时（包括测试）
**复杂度**: 中等
