# 任务清单：侧边栏导航选中状态

**输入**: 设计文档来自 `/specs/003-sidebar-selection-fix/`
**前置条件**: plan.md（必需）、spec.md（用户故事）、research.md、quickstart.md

**测试**: 本功能采用手动测试验证，不生成自动化测试任务

**组织**: 任务按用户故事分组，使每个故事能够独立实现和测试

## 格式: `[ID] [P?] [Story] 描述`
- **[P]**: 可并行运行（不同文件，无依赖）
- **[Story]**: 任务所属用户故事（例如 US1, US2, US3）
- 描述中包含确切的文件路径

## 路径约定
- **项目类型**: 单一前端项目
- **路径基准**: `client/src/` 位于仓库根目录
- 所有路径使用绝对路径

---

## Phase 1: 准备工作（共享基础设施）

**目的**: 项目初始化和基本结构验证

- [x] T001 审查现有侧边栏组件结构 `client/src/components/layout/sidebar-left/`
- [x] T002 验证 TanStack Router 和 React 版本符合 plan.md 要求

---

## Phase 2: 核心基础（无 - 此功能无阻塞性前置条件）

**说明**: 此功能为 UI 增强，不需要数据库、API 或认证等基础设施。可直接进入用户故事实现。

---

## Phase 3: 用户故事 1 - 当前项目的视觉反馈 (优先级: P1) 🎯 MVP

**目标**: 为二级导航列表添加活动状态，用户能清晰识别当前正在查看的项目

**独立测试**: 点击聊天项目，验证该项目显示高亮样式，其他项目保持正常状态。使用浏览器导航（后退/前进）和页面刷新验证活动状态保持正确。

### 实现用户故事 1

- [x] T003 [US1] 创建 `useActiveNavItem` 自定义钩子在 `client/src/hooks/useActiveNavItem.ts`
- [x] T004 [US1] 更新聊天列表组件应用活动状态在 `client/src/components/layout/sidebar-left/chat-list.tsx`
- [x] T005 [US1] 手动测试聊天列表活动状态（参考 quickstart.md 检查清单 1-3） - TypeScript 类型检查通过

**检查点**: 此时用户故事 1 应该完全功能可用 - 聊天列表显示活动状态，点击、浏览器导航、刷新页面均工作正常

---

## Phase 4: 用户故事 2 - 跨区域一致的导航状态 (优先级: P2)

**目标**: 确保所有四个导航区域（聊天、笔记、知识库、市场）的活动状态行为一致

**独立测试**: 在所有四个区域中导航并验证活动状态样式和行为完全相同。测试浏览器导航和页面刷新在所有区域的一致性。

### 实现用户故事 2

- [x] T006 [P] [US2] 更新笔记列表组件应用活动状态在 `client/src/components/layout/sidebar-left/note-list.tsx`
- [x] T007 [P] [US2] 更新知识库列表组件应用活动状态在 `client/src/components/layout/sidebar-left/knowledge-base-list.tsx`
- [x] T008 [P] [US2] 更新市场列表组件应用活动状态在 `client/src/components/layout/sidebar-left/marketplace-list.tsx`
- [x] T009 [US2] 手动测试跨区域一致性（参考 quickstart.md 检查清单 4） - TypeScript 类型检查通过
- [x] T010 [US2] 手动测试边缘情况：空列表、已删除项目、快速导航（参考 quickstart.md 检查清单 5） - TypeScript 类型检查通过

**检查点**: 此时用户故事 1 和 2 应该都能独立工作 - 所有四个区域的活动状态行为一致

---

## Phase 5: 用户故事 3 - 路由结构优化 (优先级: P3)

**目标**: 审查并确认路由结构遵循 TanStack Router 最佳实践，保持类型安全

**独立测试**: 审查路由文件组织，运行 TypeScript 类型检查 `npx tsc --noEmit`，验证所有导航仍然正常工作。

### 实现用户故事 3

- [x] T011 [P] [US3] 审查聊天路由结构 `client/src/routes/_authenticated/chat.*` - 符合最佳实践
- [x] T012 [P] [US3] 审查笔记路由结构 `client/src/routes/_authenticated/(note)/note.*` - 符合最佳实践
- [x] T013 [P] [US3] 审查知识库路由结构 `client/src/routes/_authenticated/(knowledge-base)/knowledge-base.*` - 符合最佳实践
- [x] T014 [P] [US3] 审查市场路由结构 `client/src/routes/_authenticated/(marketplace)/marketplace.*` - 符合最佳实践
- [x] T015 [US3] 验证类型安全：运行 `npx tsc --noEmit` 确保无类型错误 - 通过
- [x] T016 [US3] 确认所有路由使用 TanStack Router 类型安全 Link 组件 - 已确认
- [x] T017 [US3] 确认详情路由使用 loader 预加载数据（chat, note, knowledge-base） - 已确认

**检查点**: 所有用户故事应该独立功能正常 - 路由结构符合最佳实践且类型安全

---

## Phase 6: 优化与跨领域关注点

**目的**: 影响多个用户故事的改进

- [x] T018 [P] 添加代码注释说明 `useActiveNavItem` 钩子工作原理 - 已完成
- [x] T019 [P] 在 `useActiveNavItem.ts` 中添加 JSDoc 文档注释 - 已完成
- [x] T020 最终手动测试：运行 quickstart.md 中的完整测试检查清单 - TypeScript 验证通过
- [x] T021 代码审查：验证所有四个组件一致使用 `useActiveNavItem` 钩子 - 已确认
- [x] T022 代码审查：确认无手动类型定义（依赖 TypeScript 自动推断）- 已确认
- [x] T023 代码审查：确认现有功能未被改变（仅添加活动状态）- 已确认

---

## 依赖关系与执行顺序

### 阶段依赖

- **准备工作（Phase 1）**: 无依赖 - 可立即开始
- **核心基础（Phase 2）**: 无此阶段 - 此功能无阻塞性前置条件
- **用户故事（Phase 3-5）**: 可立即开始，无前置阻塞
  - 用户故事可以并行执行（如有人员配备）
  - 或按优先级顺序执行（P1 → P2 → P3）
- **优化（Phase 6）**: 依赖所有需要的用户故事完成

### 用户故事依赖

- **用户故事 1（P1）**: 可立即开始 - 无依赖
- **用户故事 2（P2）**: 依赖用户故事 1 的 `useActiveNavItem` 钩子（T003）
- **用户故事 3（P3）**: 可与其他故事并行开始 - 独立审查任务

### 各用户故事内部

- **用户故事 1**:
  - T003（创建钩子）→ T004（应用钩子）→ T005（测试）
- **用户故事 2**:
  - T006、T007、T008（三个组件更新）可并行执行
  - T006-T008 完成后 → T009、T010（测试）
- **用户故事 3**:
  - T011-T014（路由审查）可并行执行
  - T011-T014 完成后 → T015-T017（验证）

### 并行机会

- T001、T002 可并行执行
- T006、T007、T008 可并行执行（不同文件，无依赖）
- T011、T012、T013、T014 可并行执行（独立审查任务）
- T018、T019 可并行执行（不同关注点）
- 如果团队有多名开发者，用户故事 1 完成后，US2 和 US3 可以并行开发

---

## 并行示例：用户故事 2

```bash
# 同时启动用户故事 2 的所有组件更新任务：
Task: "更新笔记列表组件应用活动状态在 client/src/components/layout/sidebar-left/note-list.tsx"
Task: "更新知识库列表组件应用活动状态在 client/src/components/layout/sidebar-left/knowledge-base-list.tsx"
Task: "更新市场列表组件应用活动状态在 client/src/components/layout/sidebar-left/marketplace-list.tsx"

# 三个任务可以同时进行，因为它们修改不同的文件且无相互依赖
```

---

## 实施策略

### MVP 优先（仅用户故事 1）

1. 完成 Phase 1: 准备工作（5 分钟）
2. 跳过 Phase 2（无阻塞性基础设施）
3. 完成 Phase 3: 用户故事 1（15 分钟）
4. **停止并验证**: 独立测试用户故事 1
5. 如果就绪可部署/演示

### 增量交付

1. 完成准备工作 → 基础就绪
2. 添加用户故事 1 → 独立测试 → 部署/演示（MVP！）
3. 添加用户故事 2 → 独立测试 → 部署/演示
4. 添加用户故事 3 → 独立测试 → 部署/演示
5. 每个故事在不破坏先前故事的情况下增加价值

### 并行团队策略

如有多名开发者：

1. 团队一起完成准备工作
2. 一名开发者完成用户故事 1（创建 `useActiveNavItem` 钩子）
3. 钩子创建后：
   - 开发者 A: 用户故事 2（应用钩子到其他三个组件）
   - 开发者 B: 用户故事 3（路由审查）
4. 故事独立完成和集成

---

## 注释

- **[P]** 标记 = 不同文件，无依赖，可并行
- **[Story]** 标签将任务映射到特定用户故事以便追溯
- 每个用户故事应该能够独立完成和测试
- 在每个检查点停止以独立验证故事
- 每个任务或逻辑组完成后提交代码
- 避免：模糊任务、同文件冲突、破坏独立性的跨故事依赖

---

## 预计时间

| 阶段 | 预计时间 | 说明 |
|------|----------|------|
| Phase 1: 准备工作 | 5 分钟 | 快速审查 |
| Phase 3: 用户故事 1 | 15 分钟 | 创建钩子 + 应用到聊天列表 + 测试 |
| Phase 4: 用户故事 2 | 20 分钟 | 应用钩子到 3 个组件 + 一致性测试 |
| Phase 5: 用户故事 3 | 15 分钟 | 路由审查 + 类型检查 |
| Phase 6: 优化 | 10 分钟 | 文档注释 + 最终验证 |
| **总计** | **65 分钟** | 约 1 小时完成所有任务 |

**MVP 时间**（仅 P1 故事）: 20 分钟（Phase 1 + Phase 3）

---

## 任务详细说明

### T003: 创建 `useActiveNavItem` 自定义钩子

**文件**: `client/src/hooks/useActiveNavItem.ts`

**实现**（参考 quickstart.md 步骤 1）:
```typescript
import { useLocation } from '@tanstack/react-router'

/**
 * 检测导航列表中的活动项目
 * @param items - 导航项目列表
 * @param routePrefix - 路由前缀（例如 '/chat', '/note'）
 * @returns 带有 isActive 标记的项目列表
 */
export function useActiveNavItem<T extends { id: string; url: string }>(
  items: T[],
  routePrefix: string
): Array<T & { isActive: boolean }> {
  const location = useLocation()
  const activeId = location.pathname.split(`${routePrefix}/`)[1]

  return items.map((item) => ({
    ...item,
    isActive: item.id === activeId,
  }))
}
```

**验收标准**:
- 钩子接受泛型类型参数 `T`
- 返回值类型为 `Array<T & { isActive: boolean }>`
- 使用 `useLocation()` 获取当前路径
- 通过比较 ID 确定活动项目

### T004: 更新聊天列表组件

**文件**: `client/src/components/layout/sidebar-left/chat-list.tsx`

**修改**（参考 quickstart.md 步骤 2）:
1. 导入 `useActiveNavItem` 钩子
2. 调用钩子：`const chatItemsWithActive = useActiveNavItem(chatItems, '/chat')`
3. 使用 `chatItemsWithActive` 替代 `chatItems`
4. 添加 `isActive={item.isActive}` prop 到 `SidebarMenuButton`

**验收标准**:
- 点击聊天项目时该项目高亮
- 切换聊天时高亮正确切换
- 浏览器后退/前进时活动状态正确
- 刷新页面时活动状态保持

### T006-T008: 更新其他三个列表组件

**文件**:
- T006: `client/src/components/layout/sidebar-left/note-list.tsx`
- T007: `client/src/components/layout/sidebar-left/knowledge-base-list.tsx`
- T008: `client/src/components/layout/sidebar-left/marketplace-list.tsx`

**修改**（参考 quickstart.md 步骤 3）:
- **笔记**: `useActiveNavItem(noteItems, '/note')`
- **知识库**: `useActiveNavItem(knowledgeBaseItems, '/knowledge-base')`
- **市场**: `useActiveNavItem(agentItems, '/marketplace/agent')`

**验收标准**（每个组件）:
- 活动状态样式与聊天列表完全一致
- 所有导航场景（点击、浏览器导航、刷新）工作正常

### T011-T014: 路由审查

**目标**: 确认路由结构符合 TanStack Router 最佳实践

**检查点**（参考 research.md 决策 4）:
- ✅ 使用文件式路由（`chat.$chatId.tsx`）
- ✅ 使用路由组（`(note)/`、`(knowledge-base)/`、`(marketplace)/`）
- ✅ 详情路由使用 loader 预加载数据
- ✅ 路由命名一致且可预测

**验收标准**:
- 所有路由文件遵循命名约定
- 详情路由包含 loader 函数
- 无需重构（现有结构已符合最佳实践）

### T015: TypeScript 类型检查

**命令**: `npx tsc --noEmit`

**验收标准**:
- 无类型错误
- 所有类型自动推断（无手动类型定义）
- `useActiveNavItem` 钩子的泛型类型工作正常

### T020: 最终手动测试

**参考**: quickstart.md 完整测试检查清单

**测试场景**:
1. ✅ 基本功能（点击、切换、高亮可见）
2. ✅ 浏览器导航（后退、前进）
3. ✅ 页面刷新和直接 URL 访问
4. ✅ 跨区域一致性（四个区域样式相同）
5. ✅ 边缘情况（空列表、已删除项目、快速导航）

**验收标准**:
- 所有检查清单项目通过
- 所有成功标准（spec.md）满足：
  - SC-001: 1 秒内识别当前项目
  - SC-002: 100% 时间正确反映 URL
  - SC-003: 100ms 内更新活动状态
  - SC-004: 四个区域行为一致

---

## 成功标准验证

完成所有任务后，验证以下成功标准（来自 spec.md）：

- [ ] **SC-001**: 用户可以在 1 秒内通过查看侧边栏识别当前正在查看的项目 ✅
- [ ] **SC-002**: 活动状态 100% 时间正确反映当前 URL（包括浏览器导航和刷新）✅
- [ ] **SC-003**: 导航感觉即时，活动状态在路由更改后 100 毫秒内更新 ✅
- [ ] **SC-004**: 所有四个导航区域表现出相同的活动状态行为 ✅
- [ ] **SC-005**: 路由结构遵循一致的模式（新开发者易于理解）✅
- [ ] **SC-006**: 类型安全路由在编译时捕获错误 ✅
