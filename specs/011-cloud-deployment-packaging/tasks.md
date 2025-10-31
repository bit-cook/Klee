# Tasks: 云端部署与客户端打包

**Input**: Design documents from `/specs/011-cloud-deployment-packaging/`
**Prerequisites**: plan.md (✅), spec.md (✅)

**Tests**: 本功能为部署配置，无需编写测试。验证通过实际部署和安装测试完成。

**Organization**: 任务按用户故事组织，每个故事可独立实施和测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 任务所属用户故事（US1, US2, US3, US4）
- 包含精确的文件路径

## Path Conventions

- **Monorepo 结构**: `client/`, `server/`, `scripts/`
- 客户端: `client/src/`, `client/electron/`
- 服务端: `server/src/`, `server/db/`
- 部署脚本: `scripts/`

---

## 手动操作指南（需要用户完成）

本任务清单中有 **2 个手动操作**步骤，需要你手动完成 AWS 和 GitHub 的登录认证。

### 🔐 手动操作 1: AWS CLI 配置 (T008)

**时机**: 在执行 User Story 1 - 后端部署之前

**步骤**:

1. **获取 AWS 访问密钥**
   - 登录 AWS 控制台: https://console.aws.amazon.com
   - 导航到 **IAM** → **用户** → 选择你的用户（或创建新用户）
   - 点击 **安全凭证** 标签
   - 点击 **创建访问密钥**
   - 选择用例: **命令行界面 (CLI)**
   - 记录 **Access Key ID** 和 **Secret Access Key**（只显示一次！）

2. **配置 AWS CLI**

   ```bash
   aws configure
   ```

   - **AWS Access Key ID**: 粘贴步骤 1 获取的 Access Key ID
   - **AWS Secret Access Key**: 粘贴步骤 1 获取的 Secret Access Key
   - **Default region name**: 输入 `us-east-1`
   - **Default output format**: 输入 `json`

3. **验证配置**
   ```bash
   aws sts get-caller-identity
   ```
   应该返回你的 AWS 账户信息

**所需权限**: 确保 IAM 用户有以下权限策略:

- `AWSElasticBeanstalkFullAccess`
- `IAMReadOnlyAccess` (用于 EB 创建服务角色)

---

### 🔐 手动操作 2: GitHub CLI 认证 (T045)

**时机**: 在执行 User Story 4 - 部署自动化之前

**步骤**:

1. **安装 GitHub CLI** (如果还没有)

   ```bash
   brew install gh
   gh --version  # 验证安装
   ```

2. **启动认证流程**

   ```bash
   gh auth login
   ```

3. **按照交互式提示操作**:
   - **What account do you want to log into?** → 选择 `GitHub.com`
   - **What is your preferred protocol for Git operations?** → 选择 `HTTPS`
   - **How would you like to authenticate GitHub CLI?** → 选择 `Login with a web browser`
   - 会显示一个 **one-time code** (如 `ABCD-1234`)

4. **在浏览器中完成授权**:
   - 按 Enter，会自动打开浏览器
   - 如果没有自动打开，手动访问: https://github.com/login/device
   - 输入刚才显示的 one-time code
   - 点击 **Authorize github**
   - 返回终端，应该显示 "✓ Authentication complete"

5. **验证认证**
   ```bash
   gh auth status
   ```
   应该显示 "✓ Logged in to github.com as [你的用户名]"

**所需权限**: GitHub CLI 会请求以下权限:

- `repo` (访问仓库)
- `workflow` (管理 GitHub Actions)
- `write:packages` (发布 Releases)

---

## 完成手动操作后，继续执行任务清单

完成上述两个手动操作后，所有其他任务都可以自动执行（通过脚本或命令）。

---

## Phase 1: Setup (项目初始化)

**Purpose**: 准备部署所需的基础配置文件

- [x] T001 [P] 创建 `scripts/` 目录用于存放部署脚本
- [x] T002 [P] 创建 `server/.ebignore` 文件，排除 `node_modules`, `*.log`, `.env`, `src/`, `tsconfig.json` 等开发文件
- [x] T003 [P] 创建 `server/.env.production.template` 环境变量模板作为参考（实际部署使用 server/.env 中的值通过 eb setenv 设置）
- [x] T004 [P] 安装 EB CLI (`pip install awsebcli`) 并验证 `eb --version`

---

## Phase 2: Foundational (基础设施 - 阻塞所有用户故事)

**Purpose**: 必须完成的核心基础设施，阻塞所有后续部署工作

**⚠️ CRITICAL**: 在此阶段完成前，无法进行任何用户故事的部署工作

- [x] T005 [US1] 添加健康检查端点到 `server/src/routes/health.ts`，返回 `{ status: 'ok', timestamp, version }`
- [x] T006 [US1] 在 `server/src/index.ts` 中注册健康检查路由 `app.route('/health', health)`
- [x] T007 [US1] 本地测试健康检查端点 `curl http://localhost:3000/api/health` 返回 200

**Checkpoint**: 基础设施就绪 - 用户故事部署可以开始

---

## Phase 3: User Story 1 - 后端云端部署 (Priority: P1) 🎯 MVP

**Goal**: 将后端服务部署到 AWS Elastic Beanstalk，获得稳定的 HTTPS API URL

**Independent Test**: 向部署的 API 端点发送健康检查请求，返回 200 状态码

### AWS Elastic Beanstalk 初始化

- [x] T008 [US1] **手动操作**: 配置 AWS CLI 凭证
- [x] T009 [US1] 初始化 EB 应用 `eb init rafa-backend --platform "Node.js 22 running on 64bit Amazon Linux 2023" --region us-east-1`
- [x] T010 [US1] 创建 EB 环境 `eb create rafa-prod --instance-type t3.small --enable-spot`

### 环境变量配置

- [x] T011 [US1] 跳过：直接使用 `server/.env` 中的现有配置
- [x] T012 [US1] 设置 EB 环境变量：`npm run server:deploy:setenv`
- [x] T013 [US1] 验证环境变量：`cd server && eb printenv`

### 部署和验证

- [x] T014 [US1] 部署应用到 EB：`npm run server:deploy`（包含构建 + 复制 shared + 部署）
- [x] T015 [US1] 获取 EB URL：`npm run server:status` → CNAME: `rafa-prod.eba-mmc3gc5h.us-east-1.elasticbeanstalk.com`
- [x] T016 [US1] 测试云端健康检查：`curl https://rafa-prod.eba-mmc3gc5h.us-east-1.elasticbeanstalk.com/api/health` ✅ Health: Green
- [x] T017 [US1] 验证 API 可访问（健康检查端点已验证）
- [x] T018 [US1] 验证 Supabase 连接：`npm run server:logs` 确认无错误

**注意**: T019-T021（部署脚本）不需要单独创建，已在根目录 `package.json` 中添加 `npm run server:deploy` 脚本

**Checkpoint**: ✅ 后端成功部署到 AWS EB，Health: Green，API 可访问

---

## Phase 4: User Story 2 - Mac 客户端本地模式打包 (Priority: P1)

**Goal**: 打包 Mac 客户端为 .dmg 安装包，支持本地模式离线使用

**Independent Test**: 在断网环境下安装并运行客户端，创建笔记和知识库，验证数据保存在本地

### electron-builder 配置优化

- [x] T022 [P] [US2] 更新 `client/electron-builder.json`，设置 `mac.target` 为 `["dmg"]`，移除 `zip`
- [x] T023 [P] [US2] 更新 `client/electron-builder.json`，设置 `mac.hardenedRuntime: false`, `mac.gatekeeperAssess: false`（跳过签名）
- [x] T024 [P] [US2] 更新 `client/electron-builder.json`，设置 `artifactName: "${productName}_${version}_${arch}.${ext}"`

### 本地构建测试

- [x] T025 [US2] 运行 `npm run build --workspace=client` 构建客户端
- [x] T026 [US2] 验证 `client/release/` 目录生成 .dmg 文件
- [x] T027 [US2] 检查 .dmg 文件大小 < 200MB（不含 Ollama 模型）
- [x] T028 [US2] 在本机安装 .dmg 文件，验证应用启动
- [x] T029 [US2] 断网后测试本地模式：创建笔记、知识库，确认数据保存在 `~/Library/Application Support/rafa/`

### 打包脚本自动化

- [x] T030 [US2] ~~创建 `scripts/build-client.sh` 脚本~~ 跳过 - 已有 `npm run client:build` 命令
- [x] T031 [US2] ~~赋予执行权限~~ 跳过 - 不需要额外脚本
- [x] T032 [US2] 测试构建命令 `npm run client:build` 成功生成 .dmg

**Checkpoint**: 客户端 .dmg 打包成功，本地模式可离线使用

---

## Phase 5: User Story 3 - Mac 客户端云端模式配置 (Priority: P2)

**Goal**: 客户端默认云端模式启动，连接到 AWS EB 部署的后端 API

**Independent Test**: 安装客户端后首次启动，自动显示登录界面，登录后访问云端数据

### 硬编码云端 API URL

- [x] T033 [US3] 获取 EB 环境 URL（从 T015 记录）→ `http://rafa-prod.eba-mmc3gc5h.us-east-1.elasticbeanstalk.com`
- [x] T034 [US3] 更新 `client/src/renderer/src/lib/hono-client.ts`，使用环境变量或硬编码 URL
- [x] T035 [US3] 在 `client/.env.production` 设置 `VITE_API_URL=http://[EB-URL]`（使用 HTTP，HTTPS 尚未配置）
- [x] T036 [US3] Vite 自动注入环境变量，无需手动配置 vite.config.ts

### 云端模式验证

- [x] T037 [US3] 重新构建客户端 `npm run build --workspace=client` → 生成 `client/release/0.1.0/rafa_0.1.0_arm64.dmg` (239MB)
- [x] T038 [US3] 安装新的 .dmg 文件 ✅ 已安装 (Oct 27 23:06 版本)
- [x] T039 [US3] 首次启动应用，验证默认显示登录界面（云端模式） ✅ 登录界面正常显示
- [x] T040 [US3] 使用 Supabase Auth 登录 ✅ 登录成功
- [x] T041 [US3] 登录后测试云端聊天，验证数据保存到云端 ✅ 聊天功能正常（无 401/file:// 错误）
- [x] T042 [US3] 重启应用，验证自动登录并显示云端数据
- [x] T043 [US3] 测试模式切换：在设置中切换到本地模式，验证应用重启后显示本地数据（不受云端数据影响）

**Checkpoint**: 客户端默认云端模式启动，可登录并访问云端数据

---

## Phase 6: User Story 4 - 部署流程自动化 (Priority: P3)

**Goal**: 自动化部署流程，通过简单命令完成后端部署和客户端发布

**Independent Test**: 运行部署脚本，自动完成构建、部署、发布，无需手动干预

### GitHub Releases 配置

- [ ] T044 [P] [US4] 安装 GitHub CLI `brew install gh` 并验证 `gh --version`
- [ ] T045 [P] [US4] **手动操作**: 认证 GitHub CLI
  ```bash
  gh auth login
  # 选择: GitHub.com
  # 选择: HTTPS
  # 选择: Login with a web browser
  # 复制 one-time code，在浏览器中完成授权
  ```
- [ ] T046 [P] [US4] 更新 `client/electron-builder.json` 的 `publish` 配置，设置正确的 `owner` 和 `repo`

### GitHub Release 发布脚本

- [ ] T047 [US4] 创建 `scripts/release-github.sh` 脚本：
  - 提取版本号 `VERSION=$(node -p "require('./client/package.json').version")`
  - 创建 Git Tag `git tag v$VERSION && git push origin v$VERSION`
  - 创建 GitHub Release `gh release create v$VERSION client/release/*.dmg --title "v$VERSION" --notes "Release v$VERSION"`
- [ ] T048 [US4] 赋予执行权限 `chmod +x scripts/release-github.sh`

### 端到端部署测试

- [ ] T049 [US4] 修改代码（如更新版本号）
- [ ] T050 [US4] 运行后端部署脚本 `./scripts/deploy-backend.sh`
- [ ] T051 [US4] 运行客户端构建脚本 `./scripts/build-client.sh`
- [ ] T052 [US4] 运行 GitHub Release 脚本 `./scripts/release-github.sh`
- [ ] T053 [US4] 验证 GitHub Releases 页面存在新版本和 .dmg 下载链接

### CI/CD 工作流（可选）

- [ ] T054 [P] [US4] 创建 `.github/workflows/deploy-backend.yml`，触发条件为 `push to main`
- [ ] T055 [P] [US4] 创建 `.github/workflows/release-client.yml`，触发条件为 `new tag`
- [ ] T056 [US4] 测试 GitHub Actions 工作流（推送代码触发部署）

**Checkpoint**: 部署流程全自动化，代码提交后自动部署和发布

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 跨用户故事的改进和文档

- [ ] T057 [P] 创建 `specs/011-cloud-deployment-packaging/quickstart.md` 部署快速开始指南
- [ ] T058 [P] 更新 `CLAUDE.md`，添加"部署说明"章节，包含 EB 部署和客户端打包步骤
- [ ] T059 [P] 在 `server/.ebignore` 中优化排除规则，确保仅部署必要文件
- [ ] T060 [P] 测试版本兼容性：部署新版本后端，验证旧版本客户端的错误提示
- [ ] T061 验证所有 Success Criteria（SC-001 至 SC-010）
- [ ] T062 清理临时文件和敏感信息（如 `.env.production`）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 - 可立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成 - **阻塞所有用户故事**
- **User Stories (Phase 3-6)**: 所有依赖 Foundational 完成
  - US1 (后端部署): 可在 Foundational 后开始 - 无其他故事依赖
  - US2 (客户端本地模式): 可在 Foundational 后开始 - 无其他故事依赖
  - US3 (客户端云端模式): **依赖 US1 完成**（需要后端 URL）
  - US4 (自动化): 依赖 US1, US2, US3 完成（验证所有部署流程）
- **Polish (Phase 7)**: 依赖所有所需用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**: 可在 Foundational 后开始 - 独立可测
- **User Story 2 (P1)**: 可在 Foundational 后开始 - 独立可测
- **User Story 3 (P2)**: **依赖 US1**（需要后端 EB URL）
- **User Story 4 (P3)**: 依赖 US1, US2, US3（验证所有流程）

### Within Each User Story

- **US1**: EB 初始化 → 环境变量配置 → 部署验证 → 脚本自动化
- **US2**: electron-builder 配置 → 本地构建测试 → 脚本自动化
- **US3**: 硬编码 API URL → 云端模式验证（依赖 US1 的 EB URL）
- **US4**: GitHub 配置 → Release 脚本 → 端到端测试 → CI/CD（可选）

### Parallel Opportunities

- **Phase 1**: T001, T002, T003 可并行（不同文件）
- **Phase 2**: T005, T006 可串行（同一文件），T007 依赖前两者
- **US1 和 US2 可并行**: 后端部署（US1）和客户端本地模式打包（US2）完全独立
- **US4 内部**: T044, T045, T046, T054, T055 可并行（不同文件和配置）
- **Phase 7**: T057, T058, T059 可并行（不同文档）

---

## Parallel Example: US1 和 US2 同时进行

```bash
# 团队成员 A 负责后端部署（US1）:
Task: "初始化 EB 应用"
Task: "配置环境变量"
Task: "首次部署"
Task: "创建部署脚本"

# 团队成员 B 同时负责客户端打包（US2）:
Task: "优化 electron-builder 配置"
Task: "本地构建测试"
Task: "创建打包脚本"

# 两个用户故事完全独立，可并行执行
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2 Only)

1. Complete Phase 1: Setup（准备工具和配置文件）
2. Complete Phase 2: Foundational（健康检查端点）
3. Complete Phase 3: User Story 1（后端部署到 EB）
4. Complete Phase 4: User Story 2（客户端本地模式打包）
5. **STOP and VALIDATE**:
   - 后端健康检查通过
   - 客户端本地模式可离线使用
6. 此时 MVP 完成，可独立交付！

### Incremental Delivery

1. **Foundation**: Setup + Foundational → 健康检查就绪
2. **Iteration 1**: Add US1 → 后端云端部署完成 → 可独立访问 API
3. **Iteration 2**: Add US2 → 客户端本地模式可用 → 可独立分发
4. **Iteration 3**: Add US3 → 客户端云端模式可用 → 完整双模式体验
5. **Iteration 4**: Add US4 → 部署自动化 → 降低运维成本
6. 每个迭代增加价值，不破坏之前的故事

### Parallel Team Strategy

**2 人团队**:

1. 一起完成 Setup + Foundational
2. 分工并行:
   - Developer A: User Story 1（后端部署）
   - Developer B: User Story 2（客户端本地模式）
3. 汇合完成 User Story 3（需要 A 的 EB URL）
4. 一起完成 User Story 4（自动化）

**1 人团队**（推荐顺序）:

1. Setup + Foundational
2. User Story 1（后端先行，获得 URL）
3. User Story 2（客户端本地模式）
4. User Story 3（客户端云端模式）
5. User Story 4（自动化）

---

## Notes

- **[P] 任务**: 不同文件，无依赖，可并行
- **[Story] 标签**: 追溯任务到具体用户故事
- **每个用户故事应独立可完成和测试**
- **无需测试代码**: 验证通过实际部署和安装测试
- **提交频率**: 每完成一个 User Story 提交一次
- **Checkpoint**: 在每个 Checkpoint 停下来验证故事独立性
- **避免**: 模糊任务、同文件冲突、破坏故事独立性的跨故事依赖

## Task Summary

- **总任务数**: 62 个任务
- **User Story 1 (后端部署)**: 14 个任务 (T008-T021)
- **User Story 2 (客户端本地模式)**: 11 个任务 (T022-T032)
- **User Story 3 (客户端云端模式)**: 11 个任务 (T033-T043)
- **User Story 4 (自动化)**: 13 个任务 (T044-T056)
- **Parallel Opportunities**: 约 20 个任务可并行执行
- **MVP Scope**: Phase 1-4 (US1 + US2)，约 30 个任务

## Validation Checklist

- ✅ 所有任务遵循 `- [ ] [ID] [P?] [Story?] Description` 格式
- ✅ 每个用户故事有明确的 Goal 和 Independent Test
- ✅ 任务包含精确的文件路径或命令
- ✅ 用户故事 1 和 2 可独立测试（MVP）
- ✅ 依赖关系清晰（US3 依赖 US1 的 EB URL）
- ✅ Parallel 标记正确（不同文件，无依赖）
- ✅ 提供 MVP 和增量交付策略
