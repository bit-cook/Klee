# Phase 4 实施总结：Mac 客户端本地模式打包

**完成日期**: 2025-10-27
**User Story**: US2 - Mac 客户端本地模式打包
**状态**: ✅ 完成

---

## 🎯 目标

打包 Mac 客户端为 .dmg 安装包，支持本地模式离线使用，同时支持云端模式连接后端 API。

---

## ✅ 已完成的任务

### 1. Electron Builder 配置优化

**文件**: `client/electron-builder.json`

**关键配置**:
```json
{
  "mac": {
    "category": "public.app-category.productivity",
    "target": ["dmg"],  // 仅生成 .dmg，移除 zip
    "artifactName": "${productName}_${version}_${arch}.${ext}",  // 包含架构信息
    "hardenedRuntime": false,  // 跳过签名（开发阶段）
    "gatekeeperAssess": false
  },
  "asarUnpack": [
    "node_modules/apache-arrow/**/*",  // LanceDB 依赖
    "node_modules/@lancedb/**/*",
    "node_modules/better-sqlite3/**/*"  // SQLite 原生模块
  ],
  "publish": {
    "provider": "github",
    "owner": "signerlabs",  // 修正为正确的组织名
    "repo": "rafa"
  }
}
```

---

### 2. 关键 Bug 修复

#### 问题 A: 原生模块打包失败

**错误**: `Cannot find module 'apache-arrow'`

**原因**:
- `apache-arrow` 是 `@lancedb/lancedb` 的 peer dependency，未自动安装
- 原生模块不能打包到 `.asar` 归档文件中

**解决方案**:
1. 安装缺失依赖：`npm install apache-arrow --save`
2. 配置 `asarUnpack` 排除原生模块

---

#### 问题 B: 生产环境 API URL 错误

**错误**: `Failed to load resource: net::ERR_FILE_NOT_FOUND`

**原因**: 打包后使用 `file://` 协议访问 API

**解决方案**:
```typescript
// client/src/renderer/src/lib/hono-client.ts
function getApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return ''  // 开发环境：Vite 代理
  }
  return 'http://rafa-prod.eba-mmc3gc5h.us-east-1.elasticbeanstalk.com'  // 生产环境
}
```

---

#### 问题 C: SSL 证书验证失败

**错误**: `ERR_CERT_COMMON_NAME_INVALID`

**原因**: AWS EB 默认 HTTPS 证书不完全有效

**解决方案**: 临时改用 HTTP（生产环境建议配置自定义域名 + ACM 证书）

---

#### 问题 D: Supabase Session 持久化失败（核心问题）

**错误**: 登录成功但立即返回登录页，localStorage 中无 session

**根本原因**:
1. ❌ 使用了 `createBrowserClient` from `@supabase/ssr`（为 SSR 框架设计）
2. ❌ Electron 环境下 Supabase 的自动 storage 不工作

**解决方案**:

**Step 1**: 改用正确的 Supabase 客户端
```typescript
// ❌ 之前（错误）
import { createBrowserClient } from '@supabase/ssr'

// ✅ 现在（正确）
import { createClient } from '@supabase/supabase-js'
```

**Step 2**: 配置自定义 storage
```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: {
      getItem: (key: string) => localStorage.getItem(key),
      setItem: (key: string, value: string) => localStorage.setItem(key, value),
      removeItem: (key: string) => localStorage.removeItem(key),
    },
  },
})
```

**Step 3**: 手动保存 session（双保险）
```typescript
// client/src/renderer/src/lib/auth.ts
if (data.session) {
  const storageKey = `sb-${projectRef}-auth-token`
  localStorage.setItem(storageKey, JSON.stringify(data.session))
  localStorage.setItem('rafa-session-backup', JSON.stringify(data.session))
}
```

**Step 4**: 直接从 localStorage 读取 token
```typescript
// client/src/renderer/src/lib/hono-client.ts
const sessionStr = localStorage.getItem(storageKey) || localStorage.getItem('rafa-session-backup')
const session = JSON.parse(sessionStr)
headers['Authorization'] = `Bearer ${session.access_token}`
```

---

### 3. 环境变量配置

**文件**: `client/.env.production`

```bash
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_URL=https://zrtckgjmkrttadrjviws.supabase.co
```

确保生产构建时正确注入。

---

## 📦 构建结果

### 构建命令
```bash
npm run client:build
```

### 生成文件
```
client/release/0.1.0/mac-arm64/rafa_0.1.0_arm64.dmg
```

### 文件大小
- ✅ < 200MB（符合要求）

---

## 🧪 测试验证

### 云端模式测试
- ✅ 登录成功
- ✅ Session 持久化（重启应用仍保持登录状态）
- ✅ API 请求成功（200 OK）
- ✅ 数据同步到云端（Supabase PostgreSQL）

### 本地模式测试
- ✅ 切换到 Private Mode
- ✅ 创建笔记和知识库
- ✅ 数据保存到本地（`~/Library/Application Support/rafa/`）
- ✅ 完全离线可用

---

## 🔑 关键技术决策

### 1. 为什么跳过代码签名？

**优点**:
- ✅ 简化 MVP 阶段部署
- ✅ 无需 Apple Developer 账号（$99/年）
- ✅ 快速迭代测试

**缺点**:
- ⚠️ 用户安装时需要右键打开（绕过 Gatekeeper）
- ⚠️ 企业环境可能拒绝安装
- ⚠️ 无法使用自动更新

**建议**: 正式发布前添加签名和公证

---

### 2. 为什么使用 createClient 而不是 createBrowserClient？

| 客户端类型 | 适用场景 | 是否适合 Electron |
|-----------|---------|------------------|
| `createBrowserClient` | Next.js, SvelteKit 等 SSR 框架 | ❌ 否 |
| `createClient` | Electron, React Native 等非浏览器环境 | ✅ 是 |

**参考**: [Supabase GitHub Discussion #17722](https://github.com/orgs/supabase/discussions/17722)

---

### 3. 为什么使用 HTTP 而不是 HTTPS？

**临时方案**（测试环境）:
- AWS EB 默认 HTTPS 证书在 Electron 中验证失败
- HTTP 可以快速验证功能

**长期方案**（生产环境）:
- 配置自定义域名（如 `api.rafa.app`）
- 申请 ACM SSL 证书
- 或在 Electron 中禁用证书验证（仅针对信任的域名）

---

## 📝 修改文件清单

### 新增文件
- `client/.env.production` - 生产环境变量

### 修改文件
- `client/electron-builder.json` - 打包配置优化
- `client/src/renderer/src/lib/supabase.ts` - 改用 createClient + 自定义 storage
- `client/src/renderer/src/lib/hono-client.ts` - API URL 配置 + 从 localStorage 读取 token
- `client/src/renderer/src/lib/auth.ts` - 手动保存 session
- `client/package.json` - 添加 apache-arrow 依赖
- `docs/aws-deployment.md` - 更新为前后端完整部署指南

---

## 🐛 已知问题和限制

### 1. 未签名警告
- 用户首次安装需要右键打开
- 解决：添加代码签名（需要 Apple Developer 账号）

### 2. HTTP 连接
- 当前使用 HTTP（测试环境）
- 解决：配置自定义域名 + SSL 证书

### 3. 手动下载更新
- 无自动更新功能
- 解决：未来可添加 electron-updater

---

## 🚀 下一步计划

### Phase 5: User Story 3 - 客户端云端模式配置
- 配置后端 URL（已完成）
- 云端模式验证（已完成）

### Phase 6: User Story 4 - 部署流程自动化
- GitHub Releases 配置
- Release 脚本自动化
- CI/CD 工作流（可选）

### Phase 7: Polish
- 添加代码签名
- 配置 HTTPS
- 优化文档
- 清理调试代码

---

## 📚 参考资源

- [Supabase JavaScript API Reference](https://supabase.com/docs/reference/javascript/initializing)
- [Electron Builder Configuration](https://www.electron.build/configuration/configuration)
- [Supabase + Electron Integration Guide](https://bootstrapped.app/guide/how-to-use-supabase-with-electron-for-desktop-apps)
- [GitHub Discussion: Supabase OAuth with Electron](https://github.com/orgs/supabase/discussions/17722)

---

**最后更新**: 2025-10-27
**实施人员**: Claude + Wei
**总耗时**: ~8 小时（包括调试 Supabase session 持久化问题）
