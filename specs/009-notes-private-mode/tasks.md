# 任务清单：Notes Private Mode

**输入文档**: `/specs/009-notes-private-mode/` 中的设计文档
**前置依赖**: plan.md, spec.md, research.md, data-model.md, contracts/note-ipc.md

**测试**: 规范中未明确要求测试任务，因此省略测试任务。实施将依赖手动验证和 E2E 测试。

**组织方式**: 任务按用户故事分组，以支持每个故事的独立实施和测试。

## 格式说明: `[ID] [P?] [Story] 描述`

- **[P]**: 可并行执行（不同文件，无依赖关系）
- **[Story]**: 任务所属的用户故事（例如 US1, US2, US3）
- 描述中包含具体文件路径

## 路径约定

- Client（Electron + React）: `client/src/`
  - 主进程: `client/src/main/`
  - 渲染进程: `client/src/renderer/src/`
- Server（仅作参考，无需修改）: `server/`

---

## 阶段 1：初始化（共享基础设施）

**目的**: 项目初始化和数据库设置

- [x] T001 在 `client/src/main/local/db/schema.ts` 中添加 `localNotes` 表定义（字段：id, title, content, starred, createdAt, updatedAt）
- [x] T002 在 `client/src/main/local/db/init-db.ts` 中添加 notes 表初始化 SQL（CREATE TABLE notes 及索引）
- [x] T003 [P] 创建数据库查询函数文件 `client/src/main/local/db/queries/notes.ts`（getNotes, getNote, createNote, updateNote, deleteNote）

---

## 阶段 2：基础层（阻塞性前置条件）

**目的**: 核心基础设施，必须在任何用户故事之前完成

**⚠️ 关键**: 在此阶段完成前，无法开始任何用户故事的工作

- [x] T004 创建笔记 embedding 服务文件 `client/src/main/local/services/note-embedding-service.ts`（splitIntoChunks, embedNote, searchNotes 函数）
- [x] T005 [P] 创建 IPC 处理器文件 `client/src/main/ipc/note-handlers.ts`（注册全部 7 个 IPC 通道）
- [x] T006 [P] 更新 preload 脚本 `client/src/preload/index.ts`（暴露 note API，包含 7 个方法 + 3 个事件监听器）
- [x] T007 [P] 创建类型定义文件 `client/src/renderer/src/types/local/note.ts`（LocalNote，IPC 请求/响应类型）
- [x] T008 更新查询键文件 `client/src/renderer/src/lib/queryKeys.ts`（在 noteKeys 工厂函数中添加 mode 参数）

**检查点**: ✅ 基础就绪 - 现在可以并行开始用户故事的实施

---

## 阶段 3：用户故事 1 - 离线创建和编辑笔记 (优先级: P1) 🎯 MVP

**目标**: 用户能够在 Private Mode 下创建、编辑和保存笔记，数据存储在本地 SQLite 数据库中，UI 与 Cloud Mode 完全一致。

**独立测试**: 切换到 Private Mode → 创建新笔记 → 编辑笔记内容 → 保存笔记 → 验证数据存储在本地 SQLite（通过查询数据库或重启应用检查笔记是否保留）

### 用户故事 1 的实施任务

- [x] T009 [P] [US1] 更新 `client/src/renderer/src/hooks/note/queries/useNotes.ts` 中的 useNotes hook（添加 Private Mode 分支调用 IPC）
- [x] T010 [P] [US1] 更新 `client/src/renderer/src/hooks/note/queries/useNote.ts` 中的 useNote hook（添加 Private Mode 分支调用 IPC）
- [x] T011 [P] [US1] 更新 `client/src/renderer/src/hooks/note/mutations/useCreateNote.ts` 中的 useCreateNote hook（添加 Private Mode 分支，包含乐观更新）
- [x] T012 [P] [US1] 更新 `client/src/renderer/src/hooks/note/mutations/useUpdateNote.ts` 中的 useUpdateNote hook（添加 Private Mode 分支，包含乐观更新）
- [x] T013 [US1] 验证 NoteEditor 组件在 Private Mode 下正常工作（无需修改代码，通过 hooks 感知模式）
- [x] T014 [US1] 验证 NoteList 组件在 Private Mode 下正常工作（无需修改代码，通过 hooks 感知模式）
- [x] T015 [US1] 测试：在 Private Mode 创建笔记 → 保存 → 重启应用 → 验证笔记持久化

**检查点**: 此时，用户故事 1 应该完全可用且可独立测试。用户可以在 Private Mode 下创建和编辑笔记。

---

## 阶段 4：用户故事 2 - 本地笔记 Embedding 和 RAG 检索 (优先级: P2)

**目标**: 用户能够对 Private Mode 笔记生成向量 embeddings，并在聊天中通过 RAG 检索相关内容。

**独立测试**: 在 Private Mode 下创建笔记 → 点击 Embed 按钮生成向量 → 验证 LanceDB 表创建成功 → 在聊天中关联该笔记 → 发送相关问题 → 验证 AI 响应引用了笔记内容

### 用户故事 2 的实施任务

- [x] T016 [P] [US2] 更新 `client/src/renderer/src/hooks/note/mutations/useEmbedNote.ts` 中的 useEmbedNote hook（添加 Private Mode 分支，包含 IPC 和进度监听）
- [x] T017 [P] [US2] 在 `client/src/main/local/services/note-embedding-service.ts` 中实现 embedNote 函数（文本分块 → 生成 embeddings → 存储到 LanceDB）
- [x] T018 [P] [US2] 在 `client/src/main/local/services/note-embedding-service.ts` 中实现 searchNotes 函数（生成查询 embedding → 搜索 LanceDB → 返回结果）
- [x] T019 [US2] 在 `client/src/main/ipc/note-handlers.ts` 中添加 EMBED_NOTE 通道的 IPC 处理器（调用 embedNote，包含进度回调）
- [x] T020 [US2] 在 `client/src/main/ipc/note-handlers.ts` 中添加 SEARCH_NOTES 通道的 IPC 处理器（调用 searchNotes 并返回结果）
- [x] T021 [US2] 测试：创建笔记 → Embed → 验证 LanceDB 表 `note_{noteId}` 存在且包含向量记录
- [x] T022 [US2] 测试：Embed 笔记 → 删除笔记 → 验证 LanceDB 表被删除（级联删除）

**检查点**: 此时，用户故事 1 和 2 应该都能独立工作。用户可以创建笔记并为 RAG 生成 embeddings。

---

## 阶段 5：用户故事 3 - 笔记星标和删除管理 (优先级: P3)

**目标**: 用户能够在 Private Mode 下星标笔记（显示在 Starred 分组）和删除笔记（带确认对话框）。

**独立测试**: 在 Private Mode 下创建笔记 → 点击星标按钮 → 验证笔记移动到 Starred 分组 → 点击删除按钮 → 确认删除 → 验证笔记从列表和数据库中移除

### 用户故事 3 的实施任务

- [x] T023 [P] [US3] 更新 `client/src/renderer/src/hooks/note/mutations/useDeleteNote.ts` 中的 useDeleteNote hook（添加 Private Mode 分支，包含乐观移除）
- [x] T024 [US3] 在 `client/src/main/ipc/note-handlers.ts` 中添加 DELETE_NOTE 通道的 IPC 处理器（从 SQLite 删除 + 删除 LanceDB 表）
- [x] T025 [US3] 测试：星标笔记 → 验证 SQLite 中 starred 字段更新 → 验证 UI 显示在 Starred 分组
- [x] T026 [US3] 测试：取消星标 → 验证 starred 字段更新为 false → 验证 UI 显示在 Recent 分组
- [x] T027 [US3] 测试：删除带 embeddings 的笔记 → 验证 SQLite 记录和 LanceDB 表都被删除

**检查点**: 所有 CRUD 操作（创建、读取、更新、删除、星标）现在应该在 Private Mode 下正常工作

---

## 阶段 6：用户故事 4 - 聊天中关联和加载笔记 (优先级: P2)

**目标**: 用户能够在 Private Mode 聊天中关联笔记，发送消息时自动搜索相关笔记内容并注入到 AI 上下文中。

**独立测试**: 在 Private Mode 下创建并 embed 笔记 → 在聊天设置中关联该笔记 → 发送与笔记相关的问题 → 验证 AI 响应引用了笔记内容

### 用户故事 4 的实施任务

- [x] T028 [P] [US4] 更新 `client/src/renderer/src/hooks/chat/useLocalChatLogic.ts` 中的 useLocalChatLogic hook（在 handleSubmit 中添加笔记 RAG 搜索逻辑）
- [x] T029 [US4] 在聊天提交处理器中添加笔记搜索调用（使用 availableNoteIds 调用 window.api.note.search）
- [x] T030 [US4] 合并笔记搜索结果和知识库结果（格式化为 "You have access to the following notes..."）
- [x] T031 [US4] 将合并的 RAG 上下文作为系统消息注入到 AI（在聊天消息之前）
- [x] T032 [US4] 测试：创建 embedded 笔记 → 关联到聊天 → 发送相关问题 → 验证 AI 在响应中使用了笔记内容
- [x] T033 [US4] 测试：关联未 embed 的笔记 → 验证 RAG 搜索跳过它且无错误
- [x] T034 [US4] 测试：删除笔记 → 聊天中仍有 noteId 在 availableNoteIds → 验证 RAG 搜索优雅处理缺失的笔记

**检查点**: 完整的 Private Mode 笔记功能已完成，包括聊天集成

---

## 阶段 7：完善和跨功能关注点

**目的**: 影响多个用户故事的改进

- [ ] T035 [P] 验证数据隔离：在 Cloud/Private 模式之间切换 → 验证笔记不混淆
- [ ] T036 [P] 测试错误处理：Ollama 未运行 → Embed 笔记 → 验证显示清晰的错误消息
- [ ] T037 [P] 测试边界情况：笔记内容 > 10,000 字符 → 验证分块正常工作
- [ ] T038 [P] 验证 UI 一致性：对比 Cloud Mode 笔记 UI 和 Private Mode → 确保 100% 相同
- [ ] T039 [P] 测试性能：创建 100 个笔记 → 列表性能 < 200ms
- [ ] T040 [P] 测试性能：Embed 5,000 字符的笔记 → 完成时间 < 30s
- [ ] T041 [P] 测试性能：在 5 个笔记中 RAG 搜索 → 返回结果 < 2s
- [ ] T042 验证 quickstart.md 中的所有验证场景都通过
- [ ] T043 更新 CLAUDE.md，添加 Notes Private Mode 实施说明（如需要）

---

## 依赖关系和执行顺序

### 阶段依赖

- **初始化（阶段 1）**: 无依赖 - 可立即开始
- **基础层（阶段 2）**: 依赖初始化完成 - 阻塞所有用户故事
- **用户故事（阶段 3-6）**: 都依赖基础层完成
  - **US1 (P1)**: 阶段 2 完成后可开始 - 不依赖其他故事
  - **US2 (P2)**: 阶段 2 完成后可开始 - 依赖 US1 创建笔记（但可独立测试）
  - **US3 (P3)**: 阶段 2 完成后可开始 - 依赖 US1 创建笔记（但可独立测试）
  - **US4 (P2)**: 阶段 2 完成后可开始 - 依赖 US1（笔记创建）和 US2（embeddings）进行完整测试
- **完善（阶段 7）**: 依赖所有用户故事完成

### 用户故事依赖

- **用户故事 1 (P1)**: 基础层（阶段 2）完成后可开始 - 不依赖其他故事
- **用户故事 2 (P2)**: 需要 US1 创建笔记以进行 embed，但 embedding 逻辑独立
- **用户故事 3 (P3)**: 需要 US1 创建笔记以进行星标/删除，但管理逻辑独立
- **用户故事 4 (P2)**: 需要 US1（笔记）+ US2（embeddings）完成完整工作流，但聊天集成逻辑独立

### 每个用户故事内部

- Hooks 在组件验证之前
- Query hooks 可并行更新
- Mutation hooks 可并行更新
- IPC 处理器可与 hooks 并行实现
- 测试在实现之后

### 并行执行机会

- **阶段 1（初始化）**: 所有 3 个任务可并行执行（不同文件）
- **阶段 2（基础层）**: 任务 T005, T006, T007, T008 可并行执行
- **阶段 3（US1）**: 任务 T009, T010, T011, T012 可并行执行（不同 hook 文件）
- **阶段 4（US2）**: 任务 T016, T017, T018 可并行执行（不同关注点）
- **阶段 5（US3）**: 任务 T023 可立即开始
- **阶段 6（US4）**: 任务 T028 可提前开始
- **阶段 7（完善）**: 大多数任务可并行执行（独立验证）

---

## 并行示例：用户故事 1（CRUD 操作）

```bash
# 同时启动用户故事 1 的所有 query/mutation hooks：
任务: "更新 client/src/renderer/src/hooks/note/queries/useNotes.ts 中的 useNotes hook"
任务: "更新 client/src/renderer/src/hooks/note/queries/useNote.ts 中的 useNote hook"
任务: "更新 client/src/renderer/src/hooks/note/mutations/useCreateNote.ts 中的 useCreateNote hook"
任务: "更新 client/src/renderer/src/hooks/note/mutations/useUpdateNote.ts 中的 useUpdateNote hook"
```

---

## 并行示例：用户故事 2（Embeddings）

```bash
# 同时启动 embedding 实现任务：
任务: "更新 client/src/renderer/src/hooks/note/mutations/useEmbedNote.ts 中的 useEmbedNote hook"
任务: "在 client/src/main/local/services/note-embedding-service.ts 中实现 embedNote 函数"
任务: "在 client/src/main/local/services/note-embedding-service.ts 中实现 searchNotes 函数"
```

---

## 实施策略

### MVP 优先（仅用户故事 1）

1. 完成阶段 1：初始化（T001-T003）- 约 30 分钟
2. 完成阶段 2：基础层（T004-T008）- 约 2 小时（关键 - 阻塞所有故事）
3. 完成阶段 3：用户故事 1（T009-T015）- 约 2 小时
4. **停止并验证**：独立测试用户故事 1
   - 在 Private Mode 创建笔记
   - 编辑笔记并保存
   - 重启应用并验证笔记持久化
   - 切换到 Cloud Mode 并验证笔记不混淆
5. 如果就绪，可部署/演示（MVP 交付！）

**MVP 总时间**: 约 4.5 小时

### 增量交付

1. 完成初始化 + 基础层 → 基础就绪（约 2.5 小时）
2. 添加用户故事 1 → 独立测试 → 部署/演示（MVP！）（+2 小时）
3. 添加用户故事 2（Embeddings）→ 独立测试 → 部署/演示（+3 小时）
4. 添加用户故事 3（星标/删除）→ 独立测试 → 部署/演示（+1.5 小时）
5. 添加用户故事 4（聊天集成）→ 独立测试 → 部署/演示（+2 小时）
6. 完善和验证 → 最终发布（+2 小时）

**总时间**: 约 13 小时（包含测试）

### 并行团队策略

2 位开发者的情况：

1. 两人一起完成初始化 + 基础层（约 2.5 小时）
2. 基础层完成后：
   - **开发者 A**: 用户故事 1（CRUD）+ 用户故事 3（星标/删除）
   - **开发者 B**: 用户故事 2（Embeddings）+ 用户故事 4（聊天集成）
3. 各故事独立完成并集成
4. 两人共同完成完善工作

**2 位开发者总时间**: 约 8 小时（并行执行）

---

## 说明

- [P] 任务 = 不同文件，无依赖关系
- [Story] 标签将任务映射到特定用户故事，便于追溯
- 每个用户故事应该可以独立完成和测试
- 在每个任务或逻辑组后提交
- 在任何检查点停止以独立验证故事
- **无需 UI 更改**：所有现有的 Cloud Mode 组件通过模式感知的 hooks 工作
- **参考实现**：Knowledge Base Private Mode（client/src/main/local/）
- 避免：模糊任务、同文件冲突、破坏独立性的跨故事依赖

## 任务统计

- **阶段 1（初始化）**: 3 个任务
- **阶段 2（基础层）**: 5 个任务
- **阶段 3（US1 - CRUD）**: 7 个任务
- **阶段 4（US2 - Embeddings）**: 7 个任务
- **阶段 5（US3 - 星标/删除）**: 5 个任务
- **阶段 6（US4 - 聊天集成）**: 7 个任务
- **阶段 7（完善）**: 9 个任务
- **总计**: 43 个任务

## 已识别的并行机会

- **阶段 1**: 2 个并行任务（T001, T003 可同时执行）
- **阶段 2**: 4 个并行任务（T005, T006, T007, T008）
- **阶段 3**: 4 个并行任务（T009, T010, T011, T012）
- **阶段 4**: 3 个并行任务（T016, T017, T018）
- **阶段 7**: 8 个并行任务（大多数验证任务）

**总并行机会**: 约 21 个任务可并发执行

## 每个故事的独立测试标准

- **US1**: 创建 → 保存 → 重启 → 验证持久化 + 数据隔离
- **US2**: 创建 → Embed → 验证 LanceDB 表 + RAG 搜索工作
- **US3**: 星标 → 验证分组 + 删除 → 验证级联删除
- **US4**: Embed 笔记 → 关联到聊天 → 发送查询 → 验证 AI 使用笔记内容

## 建议的 MVP 范围

**最小可行产品** = 阶段 1 + 阶段 2 + 阶段 3（仅用户故事 1）

这将交付：

- ✅ 在 Private Mode 创建笔记
- ✅ 在 Private Mode 编辑笔记
- ✅ 保存笔记到本地 SQLite
- ✅ 在侧边栏列出笔记
- ✅ 与 Cloud Mode 数据隔离
- ✅ 应用重启后持久化

**MVP 不包含**：

- ❌ Embeddings/RAG（US2）
- ❌ 星标/删除（US3）
- ❌ 聊天集成（US4）

此 MVP 可在约 4.5 小时内交付，并为离线笔记记录提供即时价值。
