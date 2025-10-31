# Electron Google OAuth 配置指南

**基于官方最佳实践和 RFC 8252 标准**

## 📋 概述

本指南基于以下官方文档和标准：
- [RFC 8252 - OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
- [Google OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- Electron Deep Linking 文档

## ⚠️ 重要发现

### Google OAuth 限制
1. **自定义协议支持有限** - `rafa://auth/callback` 可能不被 Google 正式支持
2. **推荐方案** - 使用 `http://127.0.0.1` loopback 地址（RFC 8252 标准）
3. **安全最佳实践** - 使用 iOS 应用类型凭证，避免 client_secret

### 当前实现状态
- ✅ Deep link 协议已注册 (`rafa://`)
- ✅ IPC 事件处理已实现
- ✅ Session 创建逻辑已完成
- ⚠️ 需要配置 Supabase Dashboard
- ⚠️ 需要测试实际 OAuth 流程

## 🔧 配置步骤

### 步骤 1: 配置 Supabase Dashboard

1. **登录 Supabase Dashboard**
   - 访问: https://supabase.com/dashboard
   - 选择项目: `zrtckgjmkrttadrjviws`

2. **导航到 Authentication 设置**
   ```
   Dashboard → Authentication → URL Configuration
   ```

3. **添加 Redirect URLs**

   需要添加以下两个 URL（多环境支持）：

   ```
   # 生产环境 - Deep Link
   rafa://auth/callback

   # 开发环境 - Localhost
   http://localhost:5173
   ```

4. **验证 Google Provider 配置**
   ```
   Dashboard → Authentication → Providers → Google
   ```

   确认以下设置：
   - ✅ Google Provider 已启用
   - ✅ Client ID 已配置
   - ✅ Client Secret 已配置（暂时保留，后续考虑迁移到 iOS 凭证）
   - ✅ Authorized redirect URIs 包含 Supabase 回调 URL

### 步骤 2: 验证 Google Cloud Console 配置

1. **访问 Google Cloud Console**
   - https://console.cloud.google.com/apis/credentials

2. **检查 OAuth 2.0 Client**
   - 应用类型：当前为 "Web application"
   - **建议迁移到**: "iOS" 或 "Desktop app" 类型（更安全，无需 client_secret）

3. **验证 Authorized redirect URIs**
   ```
   # Supabase OAuth 回调
   https://<your-project-ref>.supabase.co/auth/v1/callback

   # 开发环境
   http://localhost:5173
   ```

### 步骤 3: 测试配置

#### 开发环境测试（推荐先测试）

```bash
# 启动开发服务器
npm run dev

# 测试步骤：
1. 打开应用
2. 点击 "Continue with Google"
3. 选择 Google 账号
4. 授权后应自动返回应用并登录
```

#### 生产环境测试（打包后）

```bash
# 构建应用
npm run client:build

# 安装并测试
# macOS: 安装 .dmg
# Windows: 安装 .exe

# 测试步骤：
1. 打开应用
2. 点击 "Continue with Google"
3. 浏览器打开 Google 登录
4. 授权后浏览器显示 "rafa://auth/callback?..."
5. Electron 应用自动聚焦并登录
```

## 🐛 已知问题和解决方案

### 问题 1: Google 阻止自定义协议

**症状**: 浏览器显示 "无法打开此链接" 或 "协议不支持"

**原因**: Google 可能不支持 `rafa://` 协议作为 redirect URI

**解决方案**:
1. **方案 A**: 使用中间页面
   - 在你的网站添加页面：`https://yoursite.com/auth/callback`
   - 该页面接收 Google 回调并重定向到 `rafa://auth/callback`
   - Supabase redirect URL 设置为 `https://yoursite.com/auth/callback`

2. **方案 B**: 使用 localhost 服务器（推荐）
   - Electron 主进程启动临时 HTTP 服务器 (127.0.0.1:随机端口)
   - OAuth redirect 到 `http://127.0.0.1:PORT/callback`
   - 服务器接收 token 后立即关闭
   - 参考：`electron-google-oauth2` 库实现

### 问题 2: Token 在 URL hash 而非 query params

**症状**: `urlObj.searchParams.get('access_token')` 返回 null

**当前解决**: 已在 `handleOAuthCallback` 添加 hash 解析
```typescript
const accessToken = urlObj.searchParams.get('access_token') ||
                   urlObj.hash.match(/access_token=([^&]*)/)?.[1]
```

### 问题 3: macOS 协议注册失败

**症状**: 点击 `rafa://` 链接没有反应

**排查**:
```bash
# 检查协议注册
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -dump | grep rafa

# 重新注册
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain system -domain user

# 重启 Finder
killall Finder
```

## 🚀 推荐实施路线图

### 阶段 1: 快速验证（当前）
- [x] 使用 `rafa://auth/callback` 尝试基本流程
- [ ] 配置 Supabase Dashboard
- [ ] 本地构建测试

### 阶段 2: 中间页面方案（如果方案 1 失败）
- [ ] 创建 `https://yoursite.com/auth/callback` 页面
- [ ] 页面逻辑：接收 token → 重定向到 `rafa://`
- [ ] 更新 Supabase redirect URL

### 阶段 3: Localhost 服务器方案（最佳实践）
- [ ] 实现临时 HTTP 服务器（主进程）
- [ ] 使用 `http://127.0.0.1:PORT/callback`
- [ ] 符合 RFC 8252 标准
- [ ] 参考 `electron-google-oauth2` 实现

### 阶段 4: 安全加固（生产环境）
- [ ] 迁移到 Google iOS/Desktop 应用凭证
- [ ] 移除 client_secret（仅使用 client_id）
- [ ] 实施 PKCE (Proof Key for Code Exchange)
- [ ] 添加 state 参数防止 CSRF

## 📊 当前实施检查清单

### 代码修改 ✅
- [x] `client/src/main/index.ts` - 注册协议
- [x] `client/src/main/index.ts` - macOS `open-url` 处理
- [x] `client/src/main/index.ts` - Windows/Linux `second-instance` 处理
- [x] `client/src/main/index.ts` - `handleOAuthCallback` 函数（支持 hash 和 query params）
- [x] `client/src/renderer/src/lib/auth.ts` - `createSessionFromOAuthTokens` 函数
- [x] `client/src/renderer/src/App.tsx` - `OAuthHandler` 组件（IPC 监听）
- [x] `client/src/renderer/src/lib/auth.ts` - `signInWithGoogle` 使用 `rafa://auth/callback`

### Supabase 配置 ⏳
- [ ] 添加 `rafa://auth/callback` 到 Redirect URLs
- [ ] 添加 `http://localhost:5173` 到 Redirect URLs
- [ ] 验证 Google Provider 已启用

### 测试 ⏳
- [ ] 开发环境测试（localhost）
- [ ] 打包后 macOS 测试
- [ ] Session 持久化验证
- [ ] 错误处理测试

## 📚 参考资源

### 官方文档
- [RFC 8252 - OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
- [Google OAuth 2.0 Native Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Electron Deep Links](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)
- [Supabase Native Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)

### 社区资源
- [electron-google-oauth2 (GitHub)](https://github.com/getstation/electron-google-oauth2)
- [Stack Overflow: Electron OAuth Best Practices](https://stackoverflow.com/questions/72549468)
- [Auth0 Electron Guide](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/)

### 替代方案库
- `@getstation/electron-google-oauth2` - 使用 localhost 服务器
- `electron-oauth-helper` - 通用 OAuth 助手
- 手动实现 - 完全控制，参考上述文档

## 🔐 安全注意事项

1. **永远不要在代码中硬编码凭证**
   - 使用环境变量
   - 不要提交 `.env` 到版本控制

2. **Token 存储**
   - Supabase 自动处理 localStorage
   - Electron 可选用 `electron-store` 加密存储

3. **HTTPS Only**
   - 生产环境必须使用 HTTPS
   - 本地开发可用 HTTP

4. **PKCE (计划中)**
   - 增强安全性
   - 无需 client_secret
   - Google 推荐用于公共客户端

---

**创建日期**: 2025-10-28
**状态**: 🚧 进行中
**下一步**: 配置 Supabase Dashboard 并测试
