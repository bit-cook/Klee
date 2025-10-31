# Implementation Plan: 云端部署与客户端打包

**Branch**: `011-cloud-deployment-packaging` | **Date**: 2025-10-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-cloud-deployment-packaging/spec.md`

## Summary

本功能专注于将已有的、本地开发环境可正常运行的 Rafa 项目进行**打包和部署**，使其能够：
1. 后端独立部署到 AWS Elastic Beanstalk（**极简运维**，自动处理一切）
2. 客户端打包成 macOS .dmg 安装包，支持本地和云端双模式
3. 通过 GitHub Releases 自动分发客户端更新

**重要**: 本功能**不改变任何现有技术栈和代码逻辑**，仅添加部署配置和打包脚本。项目的 `npm run dev` 已验证可用，我们只需要确保生产环境能够以相同方式运行。

### 为什么选择 Elastic Beanstalk？

**运维复杂度对比**:

| 方案 | 配置复杂度 | 需要管理的组件 | 部署步骤 |
|------|-----------|---------------|---------|
| **Elastic Beanstalk** | ⭐ 极简 | 0（全托管） | 3 个命令 (`eb init/create/deploy`) |
| ECS + Fargate | ⭐⭐⭐ 中等 | ECR、任务定义、服务、ALB | 10+ 步骤 |
| EC2 + 手动配置 | ⭐⭐⭐⭐⭐ 复杂 | EC2、ALB、Auto Scaling、部署脚本 | 20+ 步骤 |

**EB 自动提供**:
- ✅ 负载均衡器 (自动配置 HTTPS)
- ✅ 自动扩展 (根据流量)
- ✅ 健康检查和监控
- ✅ 日志聚合
- ✅ 滚动更新（零停机部署）
- ✅ 环境管理（dev/staging/prod）
- ✅ Node.js 运行时自动安装

## Technical Context

**项目类型**: Electron (客户端) + Hono (服务端) Monorepo
**语言/版本**:
- 客户端: TypeScript 5.4.2 + Node.js 20+
- 服务端: TypeScript 5.8.3 + Node.js 20+

**核心依赖**:
- 客户端框架: Electron 33.4.11 + React 18.3.1 + Vite 5.4.11
- 路由和状态: TanStack Router 1.132.41 + TanStack Query 4.29.14
- 后端框架: Hono 4.9.5 + @hono/node-server 1.19.0
- 数据库 ORM: Drizzle ORM 0.44.6 + Drizzle Kit 0.31.4
- 认证: Supabase Auth (@supabase/supabase-js 2.47.10+)
- AI SDK: Vercel AI SDK 5.0.68 + Ollama 0.6.0 (本地模式)
- 本地数据库: Better-SQLite3 12.4.1 (本地模式)

**存储**:
- 云端模式: Supabase PostgreSQL + Supabase Storage
- 本地模式: SQLite + 本地文件系统 (~/Library/Application Support/rafa/)

**打包工具**:
- 客户端: electron-builder 24.13.3 (已配置 electron-builder.json)
- 服务端: Docker (待添加 Dockerfile)

**部署目标**:
- 后端: AWS Elastic Beanstalk (全托管平台，自动处理负载均衡、扩展、监控)
- 客户端分发: GitHub Releases
- 数据库: Supabase (已托管)

**性能目标**:
- 后端健康检查: < 500ms (95th percentile)
- 客户端安装包: < 200MB (不含 Ollama 模型)
- 云端 API 响应: < 1s (正常网络)

**约束**:
- 使用 AWS 默认 HTTPS URL (如 xxx.elb.amazonaws.com)
- 最小监控策略 (仅健康检查端点)
- macOS 12 (Monterey) 及以上
- 多租户架构 (Supabase RLS 隔离)

**规模/范围**:
- 支持多用户 SaaS 模式
- 客户端默认云端模式，可切换本地模式
- 无自动更新，用户手动下载

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### 原则合规性检查

| 原则 | 状态 | 说明 |
|------|------|------|
| **I. 类型优先开发** | ✅ 符合 | 使用 Hono RPC 实现端到端类型安全，客户端通过 `hc` 自动推断类型 |
| **II. 模式驱动架构** | ✅ 符合 | Drizzle ORM Schema + drizzle-zod 生成验证器，数据库为单一真实来源 |
| **III. 模块化工具函数** | ✅ 符合 | 已按功能模块组织 (chat/knowledge-base/notes)，hooks 和 services 可组合重用 |
| **IV. 中间件组合** | ✅ 符合 | Hono 中间件处理认证、CORS、错误处理等横切关注点 |
| **V. 多租户隔离** | ✅ 符合 | 所有数据表包含 userId，Supabase RLS 策略强制隔离 |
| **VI. 数据完整性与级联** | ✅ 符合 | 外键关系已定义，支持级联删除 |
| **VII. 防御性配置** | ✅ 符合 | 环境变量集中管理，配置文件显式定义所有外部依赖参数 |
| **VIII. 中英文分离原则** | ✅ 符合 | 代码注释和文档使用中文，UI 文本使用英文 |

### 开发标准检查

| 标准 | 状态 | 说明 |
|------|------|------|
| **配置集中化** | ✅ 符合 | 已有 storage.config.ts, local.config.ts 等配置文件 |
| **查询隔离** | ✅ 符合 | 数据库查询位于 server/db/queries/ 目录 |
| **基于功能的模块** | ✅ 符合 | 前端按 chat/knowledge-base/notes 组织 |
| **类型验证** | ✅ 符合 | 使用 Zod 验证用户输入 |
| **错误边界** | ✅ 符合 | 已有错误边界组件和优雅降级逻辑 |

**结论**: 无宪章违规。本功能为部署配置层，不改变现有架构和代码组织，完全符合项目宪章。

## Project Structure

### Documentation (this feature)

```
specs/011-cloud-deployment-packaging/
├── spec.md              # 功能规格说明
├── plan.md              # 本文件 (实施计划)
├── research.md          # Phase 0 输出 (部署方案研究)
├── quickstart.md        # Phase 1 输出 (部署快速开始指南)
└── contracts/           # Phase 1 输出 (部署配置和脚本)
    ├── .ebignore                   # EB 部署忽略文件
    ├── .env.production.template    # 生产环境变量模板
    ├── deploy-backend.sh           # 后端部署脚本 (EB CLI)
    ├── build-client.sh             # 客户端打包脚本
    └── release-github.sh           # GitHub Release 发布脚本
```

### Source Code (repository root)

**现有结构** (不做改动):

```
rafa/                           # Monorepo 根目录
├── client/                     # Electron + React 客户端
│   ├── electron/               # Electron 主进程
│   │   ├── main/               # 主进程入口
│   │   ├── services/           # OllamaManager 等服务
│   │   └── ipc/                # IPC 处理器
│   ├── src/                    # React 渲染进程
│   │   ├── hooks/              # 按功能组织的 hooks
│   │   ├── components/         # UI 组件
│   │   ├── routes/             # TanStack Router 路由
│   │   ├── contexts/           # ModeContext 等上下文
│   │   ├── config/             # local.config.ts 等配置
│   │   └── lib/                # hono-client, queryKeys 等
│   ├── dist/                   # Vite 构建输出
│   ├── dist-electron/          # Electron 构建输出
│   ├── release/                # electron-builder 打包输出
│   ├── electron-builder.json   # electron-builder 配置
│   ├── package.json
│   └── vite.config.ts
│
├── server/                     # Hono 后端 API
│   ├── src/
│   │   ├── routes/             # API 路由 (导出 Hono AppType)
│   │   ├── db/                 # 数据库 schema 和 queries
│   │   ├── lib/                # 工具函数
│   │   └── index.ts            # Hono 服务器入口
│   ├── dist/                   # TypeScript 构建输出
│   ├── package.json
│   └── tsconfig.json
│
├── package.json                # Monorepo workspace 配置
├── .env                        # 本地环境变量 (不提交)
└── .env.example                # 环境变量示例
```

**新增文件** (仅部署配置):

```
rafa/
├── server/
│   ├── .ebignore               # 【新增】EB 部署时忽略的文件
│   └── .elasticbeanstalk/      # 【新增】EB CLI 自动生成的配置目录
│
├── .github/
│   └── workflows/
│       ├── deploy-backend.yml  # 【新增】后端 CI/CD (可选)
│       └── release-client.yml  # 【新增】客户端 Release 自动化 (可选)
│
├── scripts/                    # 【新增】部署脚本目录
│   ├── deploy-backend.sh       # 后端部署到 EB 脚本 (封装 eb deploy)
│   ├── build-client.sh         # 客户端打包脚本
│   └── release-github.sh       # GitHub Release 发布脚本
│
└── .env.production.template    # 【新增】生产环境变量模板
```

**注意**: Elastic Beanstalk 不需要 Dockerfile（除非你想自定义环境），直接部署 Node.js 代码即可！

**结构决策**: 保持现有 Monorepo 结构不变，仅在项目根目录添加 `scripts/` 部署脚本目录和 `server/.ebignore`。Elastic Beanstalk 大幅简化部署配置，无需 Docker、无需 ECS 配置，直接部署 Node.js 代码。

## Complexity Tracking

*本功能无宪章违规，此部分留空。*

---

## Phase 0: Outline & Research

### 研究任务清单

以下未知点需要在 `research.md` 中解决：

1. **AWS Elastic Beanstalk 部署方案**
   - Elastic Beanstalk Node.js 平台版本选择
   - 如何通过 Dockerfile 或直接部署 Node.js 应用
   - 环境变量配置 (Supabase 密钥等)
   - 自动获取的 HTTPS URL 格式
   - 健康检查自动配置
   - EB CLI vs AWS Console 部署方式

2. **Docker 镜像优化**
   - Node.js 生产镜像最佳实践
   - 多阶段构建减小镜像体积
   - Hono 服务器在容器中的启动方式
   - PostgreSQL 客户端依赖 (Drizzle ORM)

3. **Electron 打包优化**
   - electron-builder 配置调优
   - macOS 代码签名跳过方式 (未签名应用安装提示)
   - .dmg 和 .zip 格式选择
   - 安装包大小优化 (< 200MB 目标)

4. **GitHub Releases 自动化**
   - GitHub Actions 工作流设计
   - Release 创建和资产上传
   - 版本号管理 (Semantic Versioning)
   - 更新日志自动生成

5. **环境变量管理**
   - 本地开发 vs 生产环境分离
   - AWS Secrets Manager vs 环境变量
   - Supabase 连接信息安全存储
   - 客户端硬编码云端 API URL 方式

6. **Supabase Auth 集成验证**
   - 客户端 Auth Token 存储方式
   - Token 刷新机制
   - 后端 Token 验证中间件
   - RLS 策略检查

**输出**: 完成后生成 `research.md`，包含每个研究点的决策、理由和替代方案

---

## Phase 1: Design & Contracts

### 1.1 部署配置设计

**目标**: 创建可执行的部署配置文件，确保"本地可运行 → 云端可部署"的平滑过渡

#### 后端部署文件

**Elastic Beanstalk 配置选项**:

**选项 1: 直接部署 Node.js (推荐 - 最简单)**
```json
// .ebextensions/nodecommand.config (可选配置)
{
  "option_settings": [
    {
      "namespace": "aws:elasticbeanstalk:container:nodejs",
      "option_name": "NodeCommand",
      "value": "npm start"
    }
  ]
}
```

**选项 2: 使用 Dockerfile (如需自定义)**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

**Elastic Beanstalk 会自动**:
- 安装 Node.js 20
- 运行 `npm install --production`
- 运行 `npm start`
- 配置负载均衡器和 HTTPS
- 设置健康检查

**`.env.production.template`**:
```bash
# Supabase 配置
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 数据库配置 (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxx.supabase.co:5432/postgres

# CORS 配置
ALLOWED_ORIGINS=https://xxx.elb.amazonaws.com

# Node 环境
NODE_ENV=production
PORT=3000
```

**`scripts/deploy-backend.sh`**:
```bash
#!/bin/bash
# AWS Elastic Beanstalk 部署脚本
# 1. 打包应用 (zip 或使用 EB CLI)
# 2. 创建/更新 EB 环境
# 3. 设置环境变量
# 4. 输出 EB 环境 URL
```

#### 客户端打包文件

**更新 `client/electron-builder.json`**:
```json
{
  "appId": "com.signerlabs.rafa",
  "productName": "Rafa",
  "directories": {
    "output": "release/${version}"
  },
  "files": ["dist", "dist-electron"],
  "mac": {
    "category": "public.app-category.productivity",
    "target": ["dmg"],
    "artifactName": "${productName}_${version}_${arch}.${ext}",
    "hardenedRuntime": false,
    "gatekeeperAssess": false
  },
  "dmg": {
    "title": "${productName} ${version}",
    "icon": "build/icon.icns"
  },
  "publish": {
    "provider": "github",
    "owner": "signerlabs",
    "repo": "rafa"
  }
}
```

**`scripts/build-client.sh`**:
```bash
#!/bin/bash
# Electron 打包脚本
# 1. 设置环境变量 (云端 API URL)
# 2. 运行 npm run build
# 3. 生成 .dmg 文件到 release/
```

**`scripts/release-github.sh`**:
```bash
#!/bin/bash
# GitHub Release 发布脚本
# 1. 提取版本号
# 2. 创建 Git Tag
# 3. 使用 gh CLI 创建 Release
# 4. 上传 .dmg 文件
```

### 1.2 环境变量硬编码策略

**客户端云端 API URL 硬编码**:

在 `client/src/lib/hono-client.ts` 中:
```typescript
// 生产环境硬编码 AWS ECS URL
const API_BASE_URL = import.meta.env.PROD
  ? 'https://rafa-api-xxx.elb.amazonaws.com'  // 替换为实际部署的 ALB URL
  : 'http://localhost:3000'

export const honoClient = hc<AppType>(API_BASE_URL)
```

**构建时注入** (通过 Vite):
```typescript
// vite.config.ts
export default defineConfig({
  define: {
    __API_URL__: JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3000')
  }
})
```

### 1.3 快速开始指南

**输出**: `quickstart.md`

内容大纲:
1. **前提条件**
   - AWS 账号和 CLI 配置
   - EB CLI 安装 (`pip install awsebcli`)
   - Node.js 20+
   - gh CLI (GitHub 命令行工具)

2. **后端部署步骤** (极简！)
   ```bash
   cd server
   eb init rafa-backend --platform node.js --region us-west-2
   eb create rafa-prod
   eb setenv SUPABASE_URL=xxx SUPABASE_ANON_KEY=xxx ...
   eb open  # 打开浏览器查看环境 URL
   ```

3. **客户端打包步骤**
   - 更新 `hono-client.ts` 中的 API URL (使用 EB 环境 URL)
   - 运行 `npm run build --workspace=client`
   - .dmg 文件生成在 `client/release/` 目录

4. **发布 GitHub Release**
   - 运行 `scripts/release-github.sh`
   - 验证 Release 页面和下载链接

### 1.4 健康检查端点

**后端添加** (在 `server/src/routes/health.ts`):
```typescript
import { Hono } from 'hono'

const health = new Hono()

health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  })
})

export default health
```

**在 `server/src/index.ts` 中注册**:
```typescript
import health from './routes/health'

app.route('/health', health)
```

---

## Phase 2 Preview: Tasks Breakdown

**注意**: 任务分解由 `/speckit.tasks` 命令生成，此处仅预览结构。

预期任务组:
1. **后端部署配置** (T001-T005)
   - T001: 添加健康检查端点 (`/health`)
   - T002: 创建 `.env.production.template`
   - T003: 创建 `.ebignore` 文件 (排除不需要的文件)
   - T004: 编写 `deploy-backend.sh` 脚本 (使用 EB CLI)
   - T005: 本地测试 `npm run build && npm start`

2. **AWS Elastic Beanstalk 设置** (T006-T010)
   - T006: 安装 EB CLI (`pip install awsebcli`)
   - T007: 初始化 EB 应用 (`eb init`)
   - T008: 创建 EB 环境 (`eb create`)
   - T009: 配置环境变量 (`eb setenv`)
   - T010: 部署并验证健康检查 (`eb deploy`)

3. **客户端打包配置** (T011-T015)
   - T011: 更新 `electron-builder.json`
   - T012: 硬编码云端 API URL
   - T013: 编写 `build-client.sh` 脚本
   - T014: 本地测试打包流程
   - T015: 验证 .dmg 安装

4. **GitHub Releases 自动化** (T016-T020)
   - T016: 配置 GitHub repo 权限
   - T017: 编写 `release-github.sh` 脚本
   - T018: 测试 Release 创建
   - T019: 验证下载链接
   - T020: 更新客户端版本检查逻辑

5. **文档和验证** (T021-T025)
   - T021: 编写 `quickstart.md`
   - T022: 端到端部署测试
   - T023: 客户端云端模式登录测试
   - T024: 版本兼容性测试
   - T025: 更新 CLAUDE.md 部署说明

---

## Validation Checkpoints

### Phase 0 完成标准
- [ ] `research.md` 存在且包含所有 6 个研究点的决策
- [ ] 每个研究点都有明确的"选择方案"、"理由"和"替代方案"
- [ ] Docker 镜像大小预估 < 200MB

### Phase 1 完成标准
- [ ] `quickstart.md` 存在且包含完整的部署步骤
- [ ] `contracts/` 目录包含所有配置文件
- [ ] `server/Dockerfile` 可成功构建
- [ ] `scripts/` 目录包含 3 个可执行脚本
- [ ] 健康检查端点已添加并测试通过

### 最终交付标准 (Phase 2 后)
- [ ] 后端成功部署到 AWS Elastic Beanstalk，健康检查返回 200
- [ ] 获得 EB 环境 HTTPS URL (如 https://rafa-prod.us-west-2.elasticbeanstalk.com)
- [ ] 客户端 .dmg 文件生成成功，< 200MB
- [ ] GitHub Release 创建成功，包含 .dmg 下载链接
- [ ] 客户端安装后默认云端模式可登录并访问云端数据
- [ ] 本地模式切换后可离线使用

---

## Agent Context Update

**执行**: 在 Phase 1 完成后运行
```bash
.specify/scripts/bash/update-agent-context.sh claude
```

**新增技术到 CLAUDE.md**:
- AWS Elastic Beanstalk 部署 (EB CLI)
- Elastic Beanstalk Node.js 平台
- electron-builder 打包配置
- GitHub Releases 自动化
- 环境变量管理策略

---

## Notes

1. **不改变现有代码**: 本功能严格遵循"仅部署配置"原则，所有新增文件都是配置和脚本
2. **本地开发优先**: 所有脚本都支持本地测试验证（如本地 Docker 构建）
3. **手动部署优先**: 先确保手动脚本可用，再考虑 CI/CD 自动化（P3 优先级）
4. **版本控制**: 生产环境 URL 等敏感信息使用 `.env.production` 文件，不提交到 Git
5. **渐进式交付**: 先完成后端部署 → 再客户端打包 → 最后 GitHub Release 自动化
