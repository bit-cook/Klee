# 任务：知识库客户端优化

**输入**: 来自 `/specs/001-kb-tanstack-refactor/` 的设计文档
**前置条件**: plan.md（必需），spec.md（必需），research.md，data-model.md，contracts/

**测试**: 本功能无自动化测试框架，通过手动测试和类型安全保证质量

**组织方式**: 任务按用户故事分组，以便独立实施和测试每个故事

## 格式：`[ID] [P?] [Story] 描述`
- **[P]**: 可并行运行（不同文件，无依赖）
- **[Story]**: 此任务属于哪个用户故事（如 US1, US2, US3）
- 描述中包含精确文件路径

## 路径约定
- **Monorepo 结构**: `client/src/`（前端），`server/src/`（后端）
- 本次重构仅修改前端，路径基于 `client/` 目录

---

## 阶段 1：设置（共享基础设施）

**目的**: 项目初始化和基础结构

- [x] T001 创建查询键工厂函数在 `client/src/lib/queryKeys.ts`
- [x] T002 配置 TanStack Query Client 在 `client/src/lib/query-client.ts`
- [x] T003 [P] 创建查询钩子目录结构 `client/src/hooks/queries/`
- [x] T004 [P] 创建变更钩子目录结构 `client/src/hooks/mutations/`

**检查点**: ✅ 基础设施就绪 - 可以开始创建钩子

---

## 阶段 2：基础层（阻塞性前置条件）

**目的**: 必须在任何用户故事实施前完成的核心基础设施

**⚠️ 关键**: 在此阶段完成前，不能开始任何用户故事工作

- [x] T005 实现知识库列表查询钩子 `client/src/hooks/queries/useKnowledgeBases.ts`
- [x] T006 实现知识库详情查询钩子 `client/src/hooks/queries/useKnowledgeBase.ts`
- [x] T007 [P] 实现创建知识库变更钩子 `client/src/hooks/mutations/useCreateKnowledgeBase.ts`
- [x] T008 [P] 实现删除知识库变更钩子 `client/src/hooks/mutations/useDeleteKnowledgeBase.ts`

**检查点**: ✅ 基础钩子就绪 - 用户故事实施现在可以开始

---

## 阶段 3：用户故事 1 - 自动缓存的无缝数据管理 (优先级: P1) 🎯 MVP

**目标**: 提供自动缓存、即时 UI 更新和后台数据刷新的知识库列表和详情查看功能

**独立测试**:
1. 打开侧边栏，知识库列表正确加载
2. 点击知识库，详情页正确加载
3. 创建新知识库，列表自动更新（无需刷新页面）
4. 第二次访问列表页，数据立即显示（从缓存）
5. 切换标签页后返回，数据自动刷新

### 用户故事 1 的实施

- [x] T009 [P] [US1] 迁移侧边栏组件到新查询钩子 `client/src/components/layout/sidebar-left/knowledge-base-list.tsx`
  - 移除 `useKnowledgeBaseRPC` 中的 `getKnowledgeBases` 调用
  - 使用 `useKnowledgeBases()` 查询钩子
  - 更新加载状态处理（`isLoading` 替代手动 `loading` 状态）
  - 保持现有 UI 和交互逻辑不变
- [x] T010 [P] [US1] 迁移列表页到新查询钩子 `client/src/routes/_authenticated/(knowledge-base)/knowledge-base.index.tsx`
  - 使用 `useKnowledgeBases()` 查询钩子
  - 使用 `useCreateKnowledgeBase()` 变更钩子
  - 移除手动数据获取和状态管理
  - 保持现有创建对话框和表单验证逻辑
- [x] T011 [US1] 迁移详情页到新查询钩子 `client/src/routes/_authenticated/(knowledge-base)/knowledge-base.$knowledgeBaseId.tsx`
  - 使用 `useKnowledgeBase(knowledgeBaseId)` 查询钩子
  - 移除手动 `refetch` 逻辑（自动处理）
  - 更新加载和错误状态处理
  - 保持现有编辑表单和文件列表 UI

**检查点**: ✅ 此时用户故事 1 应完全功能性且可独立测试

---

## 阶段 4：用户故事 2 - 乐观更新提供即时反馈 (优先级: P1)

**目标**: 为收藏/取消收藏知识库提供即时视觉反馈，即使在服务器确认前

**独立测试**:
1. 点击星标图标，图标立即切换（无明显延迟）
2. 模拟网络延迟（Chrome DevTools），星标仍立即切换
3. 强制服务器错误（修改 API），星标回滚并显示错误
4. 在侧边栏收藏知识库，详情页星标同步更新

### 用户故事 2 的实施

- [x] T012 [US2] 实现带乐观更新的更新知识库变更钩子 `client/src/hooks/mutations/useUpdateKnowledgeBase.ts`
  - 实现 `onMutate` 生命周期（取消查询 + 保存旧值 + 乐观更新缓存）
  - 实现 `onError` 生命周期（回滚到旧值）
  - 实现 `onSettled` 生命周期（失效相关查询）
  - 同时更新列表和详情缓存
- [x] T013 [US2] 在侧边栏组件中集成乐观更新 `client/src/components/layout/sidebar-left/knowledge-base-list.tsx`
  - 使用 `useUpdateKnowledgeBase()` 替代 `updateKnowledgeBase`
  - 移除手动乐观更新逻辑（现由钩子处理）
  - 保持现有错误处理和用户反馈
- [x] T014 [US2] 在详情页中集成乐观更新 `client/src/routes/_authenticated/(knowledge-base)/knowledge-base.$knowledgeBaseId.tsx`
  - 使用 `useUpdateKnowledgeBase()` 进行名称/描述编辑
  - 确保表单提交后立即显示新值
  - 添加错误回滚和用户通知

**检查点**: ✅ 此时用户故事 1 和 2 都应独立工作

---

## 阶段 5：用户故事 3 - 带进度跟踪的智能文件上传 (优先级: P2)

**目标**: 提供实时进度指示、自动状态更新的文件上传功能，上传完成后立即更新文件列表

**独立测试**:
1. 选择文件上传，显示进度指示器
2. 上传成功，文件立即出现在列表中，状态为 "processing"
3. 文件处理完成后，状态自动更新为 "completed"
4. 上传失败，显示错误消息，文件不出现在列表中
5. 上传多个文件，每个文件独立跟踪

### 用户故事 3 的实施

- [x] T015 [US3] 实现文件上传变更钩子 `client/src/hooks/mutations/useUploadKnowledgeBaseFile.ts`
  - 使用原生 `fetch` API（支持进度跟踪）
  - 实现 `onSuccess` 失效文件列表查询
  - 添加错误处理
- [x] T016 [US3] 实现文件删除变更钩子 `client/src/hooks/mutations/useDeleteKnowledgeBaseFile.ts`
  - 实现乐观更新（立即从列表移除）
  - 实现回滚逻辑（失败时）
  - 失效相关查询
- [x] T017 [US3] 在详情页集成文件上传功能 `client/src/routes/_authenticated/(knowledge-base)/knowledge-base.$knowledgeBaseId.tsx`
  - 使用 `useUploadKnowledgeBaseFile()` 替代直接 API 调用
  - 使用 `useDeleteKnowledgeBaseFile()` 处理文件删除（带乐观更新）
  - 保持现有文件表格和状态显示

**检查点**: ✅ 所有用户故事（US1-US3）现在应独立功能性

---

## 阶段 6：用户故事 4 - 后台数据同步 (优先级: P3)

**目标**: 在窗口重新获得焦点或数据陈旧时自动刷新数据，无需用户手动操作

**独立测试**:
1. 在两个浏览器窗口中打开应用
2. 在窗口 A 中修改知识库
3. 切换到窗口 B（失去焦点后重新获得）
4. 窗口 B 自动显示最新数据
5. 让应用打开 6 分钟，数据自动后台刷新

### 用户故事 4 的实施

- [x] T018 [US4] 配置 TanStack Query 窗口焦点重新获取 `client/src/lib/query-client.ts`
  - 确认 `refetchOnWindowFocus: true` 已启用（默认配置）
  - 为不同查询类型设置适当的 `staleTime`（列表 2 分钟，详情 5 分钟，文件 1 分钟）
  - 配置 `refetchOnReconnect: true`（网络重连时刷新）
- [x] T019 [P] [US4] 添加 TanStack Query DevTools `client/src/main.tsx` 或应用入口
  - 导入并添加 `<ReactQueryDevtools />` 组件
  - 设置 `initialIsOpen={false}`（仅开发环境显示）
  - 用于调试缓存和查询状态
- [x] T020 [US4] 验证窗口焦点重新获取功能（手动测试）
  - 打开两个浏览器标签页
  - 在一个标签页中修改数据
  - 切换到另一个标签页
  - 确认数据自动刷新

**检查点**: ✅ 所有用户故事完成，应用具备完整的数据同步能力

---

## 阶段 7：清理与收尾

**目的**: 影响多个用户故事的改进和清理工作

- [x] T021 [P] 在旧 RPC 钩子添加废弃警告 `client/src/hooks/useKnowledgeBaseRPC.ts`
  - 添加 `@deprecated` JSDoc 注释
  - 添加迁移指南注释（指向新钩子）
  - 保持现有代码不变（向后兼容）
- [x] T022 [P] 更新 CLAUDE.md 添加 TanStack Query 使用说明
  - 记录新的查询/变更钩子位置
  - 添加缓存策略说明
  - 记录查询键命名约定
- [x] T023 代码审查：检查类型安全
  - 确认所有查询/变更钩子正确推断类型
  - 验证无手动类型定义
  - 运行 `npm run build` 确保无 TypeScript 错误
- [x] T024 代码审查：检查性能
  - 使用 React DevTools Profiler 对比重构前后渲染次数
  - 使用 Network 面板确认无重复请求
  - 使用 Performance 面板验证乐观更新 <16ms
- [x] T025 运行完整手动测试检查清单（参考 quickstart.md）
  - 基础功能（5 项）
  - 乐观更新（3 项）
  - 缓存行为（3 项）
  - 文件上传（3 项）
  - 错误处理（3 项）
  - 性能（3 项）

---

## 依赖与执行顺序

### 阶段依赖

- **设置（阶段 1）**: 无依赖 - 可立即开始
- **基础层（阶段 2）**: 依赖设置完成 - 阻塞所有用户故事
- **用户故事（阶段 3-6）**: 都依赖基础层完成
  - 用户故事可并行进行（如有人力）
  - 或按优先级顺序（P1 → P1 → P2 → P3）
  - 注意：两个 P1 故事（US1 和 US2）可同时进行，US2 直接依赖 US1 的钩子
- **清理（阶段 7）**: 依赖所有期望的用户故事完成

### 用户故事依赖

- **用户故事 1 (P1)**: 可在基础层后开始 - 无其他故事依赖
- **用户故事 2 (P1)**: 可在基础层后开始 - 需要 US1 的查询钩子（T005-T006）但不需要 US1 的 UI 迁移完成
- **用户故事 3 (P2)**: 可在基础层后开始 - 使用 US1 的查询钩子，独立可测
- **用户故事 4 (P3)**: 可在基础层后开始 - 主要是配置，无代码依赖

### 每个用户故事内部

- 基础钩子（阶段 2）必须在所有 UI 迁移前完成
- 查询钩子在变更钩子前
- 变更钩子在 UI 集成前
- 每个组件迁移独立（可并行）
- 故事完成前移动到下一优先级

### 并行机会

- 阶段 1 的所有任务标记 [P] 可并行运行
- 阶段 2 的所有任务标记 [P] 可并行运行
- 基础层完成后，所有用户故事可并行开始（如团队能力允许）
- 每个用户故事内标记 [P] 的任务可并行运行
- 不同用户故事可由不同团队成员并行处理

---

## 并行示例：用户故事 1

```bash
# 同时启动用户故事 1 的所有 UI 迁移任务：
Task: "迁移侧边栏组件到新查询钩子 client/src/components/layout/sidebar-left/knowledge-base-list.tsx"
Task: "迁移列表页到新查询钩子 client/src/routes/_authenticated/(knowledge-base)/knowledge-base.index.tsx"
# 注意：T011 依赖 T009 和 T010 的模式，但可以同时启动

# 阶段 2 的所有变更钩子可并行创建：
Task: "实现创建知识库变更钩子 client/src/hooks/mutations/useCreateKnowledgeBase.ts"
Task: "实现删除知识库变更钩子 client/src/hooks/mutations/useDeleteKnowledgeBase.ts"
```

---

## 实施策略

### MVP 优先（仅用户故事 1）

1. 完成阶段 1：设置
2. 完成阶段 2：基础层（关键 - 阻塞所有故事）
3. 完成阶段 3：用户故事 1
4. **停止并验证**: 独立测试用户故事 1
5. 如准备好则部署/演示

**MVP 交付物**:
- 知识库列表和详情的自动缓存
- 即时 UI 更新，无闪烁
- 后台数据刷新
- 创建和删除知识库功能

### 渐进式交付

1. 完成设置 + 基础层 → 基础就绪
2. 添加用户故事 1 → 独立测试 → 部署/演示（MVP！）
3. 添加用户故事 2 → 独立测试 → 部署/演示（增强版：乐观更新）
4. 添加用户故事 3 → 独立测试 → 部署/演示（文件上传优化）
5. 添加用户故事 4 → 独立测试 → 部署/演示（完整数据同步）
6. 每个故事添加价值而不破坏之前的故事

### 并行团队策略

**单人开发** (推荐顺序):
1. 阶段 1 + 2（基础设施）- 2 小时
2. 阶段 3（用户故事 1）- 1.5 小时 → **MVP 验证点**
3. 阶段 4（用户故事 2）- 1 小时
4. 阶段 5（用户故事 3）- 1 小时
5. 阶段 6（用户故事 4）- 0.5 小时
6. 阶段 7（清理）- 0.5 小时
**总计**: 6-7 小时

**多人开发** (如有 2-3 人):
1. 团队一起完成设置 + 基础层
2. 基础层完成后：
   - 开发者 A: 用户故事 1 + 2（核心功能）
   - 开发者 B: 用户故事 3（文件上传）
   - 开发者 C: 用户故事 4 + 清理（配置和文档）
3. 故事独立完成并集成

---

## 注意事项

- [P] 任务 = 不同文件，无依赖
- [Story] 标签将任务映射到特定用户故事以便追踪
- 每个用户故事应独立完成和测试
- 无自动化测试，依赖手动测试 + TypeScript 类型安全
- 每个任务或逻辑组完成后提交
- 在任何检查点停止以独立验证故事
- 避免：模糊任务、相同文件冲突、破坏独立性的跨故事依赖

---

## 任务统计

**总任务数**: 25 个任务

**按用户故事分解**:
- 设置（阶段 1）: 4 个任务
- 基础层（阶段 2）: 4 个任务
- 用户故事 1 (P1): 3 个任务
- 用户故事 2 (P1): 3 个任务
- 用户故事 3 (P2): 3 个任务
- 用户故事 4 (P3): 3 个任务
- 清理（阶段 7）: 5 个任务

**并行机会**: 12 个任务标记为 [P]，可并行执行

**独立测试标准**: 每个用户故事都有明确的独立测试标准

**建议 MVP 范围**: 用户故事 1（自动缓存的无缝数据管理）

---

## 格式验证

✅ 所有任务遵循检查清单格式：`- [ ] [ID] [P?] [Story?] 描述 + 文件路径`
✅ 所有用户故事任务都有 [Story] 标签（US1, US2, US3, US4）
✅ 所有任务都包含精确文件路径
✅ 任务按用户故事组织，支持独立实施和测试
✅ 每个用户故事都有明确的目标和独立测试标准
