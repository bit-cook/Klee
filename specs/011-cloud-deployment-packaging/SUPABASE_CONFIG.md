# Supabase OAuth 配置指南

## 🎯 目标

配置 Supabase 以支持 Electron 应用的 Google OAuth 回调。

## 📋 配置步骤

### 步骤 1: 登录 Supabase Dashboard

访问: https://supabase.com/dashboard

### 步骤 2: 选择项目

项目 ID: `zrtckgjmkrttadrjviws`

### 步骤 3: 配置 Redirect URLs

1. 导航到: **Authentication** → **URL Configuration**

2. 找到 **Redirect URLs** 部分

3. 点击 **Add URL** 添加以下 URL：

   ```
   rafa://auth/callback
   ```

4. 点击 **Save** 保存配置

### 步骤 4: 验证 Google Provider

1. 导航到: **Authentication** → **Providers**

2. 找到 **Google** provider

3. 确认以下设置：
   - ✅ **Enabled** (已启用)
   - ✅ **Client ID** 已配置
   - ✅ **Client Secret** 已配置

## 🔍 验证配置

配置完成后，在 Supabase Dashboard 的 URL Configuration 页面应该看到：

**Redirect URLs**:
```
rafa://auth/callback
```

## 🧪 测试流程

### 预期行为

1. 用户在 Electron 应用点击 "Continue with Google"
2. **系统浏览器**打开 Google 登录页面
3. 用户选择 Google 账号并授权
4. 浏览器重定向到 `rafa://auth/callback?access_token=...&refresh_token=...`
5. **Electron 应用自动聚焦**（macOS 的 `open-url` 事件触发）
6. 应用提取 tokens 并创建 session
7. 用户自动登录成功 ✅

### 日志验证

**Electron 主进程**:
```
[OAuth] Opening browser: https://zrtckgjmkrttadrjviws.supabase.co/...
[Deep Link] Received URL (macOS): rafa://auth/callback?access_token=...
[OAuth] Tokens received, sending to renderer...
```

**渲染进程**:
```
[OAuth] Opening OAuth URL in system browser: https://...
[OAuth] Using IPC to open browser
[OAuth] Browser opened successfully via IPC
[OAuth] Received tokens from main process
[OAuth] Session created successfully: user@example.com
```

## 🐛 故障排查

### 问题 1: 浏览器显示 "无法打开此页面"

**原因**: Deep link 协议未注册

**解决**:
```bash
# macOS - 重新注册协议
# 重启 Electron 应用即可
```

### 问题 2: 浏览器重定向后应用没有反应

**检查**:
1. 确认 Supabase 配置了 `rafa://auth/callback`
2. 查看 Electron 主进程日志
3. 确认 `app.setAsDefaultProtocolClient('rafa')` 已调用

**调试**:
```bash
# 手动测试 deep link
open "rafa://auth/callback?access_token=test&refresh_token=test"
```

应该看到 Electron 应用聚焦并在控制台输出日志。

### 问题 3: Token 解析失败

**症状**: 控制台显示 `[OAuth] Missing tokens in callback URL`

**原因**: Supabase 可能将 tokens 放在 URL hash 而不是 query params

**已解决**: 代码已支持两种格式：
```typescript
const accessToken = urlObj.searchParams.get('access_token') ||
                   urlObj.hash.match(/access_token=([^&]*)/)?.[1]
```

## 📊 配置检查清单

### Supabase Dashboard
- [ ] 访问 Authentication → URL Configuration
- [ ] 添加 `rafa://auth/callback` 到 Redirect URLs
- [ ] 点击 Save
- [ ] 验证 Google Provider 已启用

### Electron 应用
- [x] `app.setAsDefaultProtocolClient('rafa')` 已调用
- [x] `handleOAuthCallback` 函数已实现
- [x] `open-url` 事件已监听 (macOS)
- [x] `second-instance` 事件已监听 (Windows/Linux)
- [x] IPC `oauth-success` 监听器已注册

### 代码
- [x] `signInWithGoogle` 使用 `rafa://auth/callback`
- [x] `skipBrowserRedirect: true`
- [x] IPC `oauth:openBrowser` 处理器已注册
- [x] OAuth IPC 监听器在 App.tsx

## 🎉 完成

配置完成后，OAuth 流程应该能够：
1. ✅ 在系统浏览器打开 Google 登录
2. ✅ 登录后自动返回 Electron 应用
3. ✅ 自动创建 session 并登录

---

**下一步**: 测试完整的 OAuth 流程
