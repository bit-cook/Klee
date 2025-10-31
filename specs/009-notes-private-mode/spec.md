# Feature Specification: Notes Private Mode

**Feature Branch**: `009-notes-private-mode`
**Created**: 2025-10-23
**Status**: Draft
**Input**: User description: "我现在要添加note部分的private mode，要求：
1. UI不要变，按照目前的样式
2. 功能同 clould mode note一样，可以创建，编辑，star，delete等等
3. note的本地schema和db相关的内容参考knowleadge base private mode，也要本地保存，也要embedding
4. 对话时也可以加载note，类似于clould mode加载note，也类似于private mode加载knowledge base"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 离线创建和编辑笔记 (Priority: P1)

用户希望在完全离线的 Private Mode 下创建、编辑和管理个人笔记，所有数据存储在本地 SQLite 数据库中，UI 和交互体验与 Cloud Mode 完全一致。

**Why this priority**: 这是 Notes Private Mode 的核心功能，是所有其他功能的基础。用户必须能够在 Private Mode 下创建和管理笔记，才能使用后续的 RAG、星标等功能。

**Independent Test**: 可以独立测试，步骤为：切换到 Private Mode → 创建新笔记 → 编辑笔记内容 → 保存笔记 → 验证数据存储在本地 SQLite 数据库中（通过查询数据库文件或重启应用后检查笔记是否保留）。无需依赖其他功能。

**Acceptance Scenarios**:

1. **Given** 用户处于 Private Mode，**When** 用户点击"新建笔记"按钮，**Then** 系统显示空白的笔记编辑器，标题输入框和内容编辑器均为空
2. **Given** 用户在 Private Mode 新建笔记，**When** 用户输入标题"Meeting Notes"和内容"Discussed project timeline"后点击保存，**Then** 笔记成功保存到本地 SQLite 数据库，并在侧边栏显示
3. **Given** 用户在 Private Mode 下打开已有笔记，**When** 用户修改标题或内容后点击保存，**Then** 修改立即反映在 UI 中，并更新本地数据库的 `updatedAt` 时间戳
4. **Given** 用户在 Private Mode 下编辑笔记，**When** 用户关闭应用后重新打开，**Then** 之前创建和编辑的笔记依然存在且内容完整
5. **Given** 用户在 Private Mode 下创建笔记，**When** 用户切换到 Cloud Mode，**Then** Private Mode 的笔记不显示在列表中（数据隔离）

---

### User Story 2 - 本地笔记 Embedding 和 RAG 检索 (Priority: P2)

用户希望对 Private Mode 笔记生成向量 embeddings，以便在聊天对话中通过 RAG（检索增强生成）自动引用相关笔记内容，实现与 Private Mode Knowledge Base 相同的智能检索能力。

**Why this priority**: RAG 是 Private Mode 的核心价值之一，允许用户在对话中利用笔记知识。虽然不如 P1 核心，但是 Private Mode 的关键差异化功能。

**Independent Test**: 可以独立测试，步骤为：在 Private Mode 下创建笔记 → 点击 Embed 按钮生成向量 → 在聊天中关联该笔记 → 发送与笔记内容相关的问题 → 验证 AI 响应中引用了笔记内容。需要 P1 完成，但可以作为独立功能增量测试。

**Acceptance Scenarios**:

1. **Given** 用户在 Private Mode 下编辑笔记，**When** 用户点击"Embed"按钮，**Then** 系统调用本地 Ollama API 生成 embeddings，并将向量存储到 LanceDB 中，按钮显示"Embedded"状态
2. **Given** 用户在 Private Mode 下创建新笔记，**When** 用户点击"Embed"按钮，**Then** 按钮保持禁用状态并提示"请先保存笔记"（与 Cloud Mode 行为一致）
3. **Given** 用户在 Private Mode 聊天中关联了已 embedded 的笔记，**When** 用户发送与笔记内容相关的问题，**Then** 系统通过向量搜索找到相关笔记片段，并将其作为上下文注入到 AI 提示中
4. **Given** 用户在 Private Mode 下 embed 笔记，**When** embedding 过程失败（如 Ollama 未运行），**Then** 系统显示错误提示，笔记状态保持未 embedded
5. **Given** 用户在 Private Mode 下删除已 embedded 的笔记，**When** 删除操作完成，**Then** 笔记的向量数据也从 LanceDB 中级联删除

---

### User Story 3 - 笔记星标和删除管理 (Priority: P3)

用户希望在 Private Mode 下对笔记进行星标标记和删除操作，星标的笔记显示在侧边栏的"Starred"分组中，删除操作需要确认以避免误删。

**Why this priority**: 这是辅助功能，用于组织和管理笔记，优先级低于核心的创建/编辑（P1）和 RAG（P2）功能，但对用户体验很重要。

**Independent Test**: 可以独立测试，步骤为：在 Private Mode 下创建笔记 → 点击星标按钮 → 验证笔记移动到"Starred"分组 → 点击删除按钮 → 确认删除 → 验证笔记从列表和数据库中移除。需要 P1 完成，但可以作为独立功能增量测试。

**Acceptance Scenarios**:

1. **Given** 用户在 Private Mode 下查看笔记列表，**When** 用户点击某个笔记的星标图标，**Then** 笔记立即移动到"Starred"分组，本地数据库的 `starred` 字段更新为 `true`
2. **Given** 用户在 Private Mode 下已星标的笔记，**When** 用户再次点击星标图标，**Then** 笔记移动到"Recent"分组，`starred` 字段更新为 `false`
3. **Given** 用户在 Private Mode 下查看笔记列表，**When** 用户点击某个笔记的删除按钮，**Then** 系统显示确认对话框"确定删除这条笔记吗？"
4. **Given** 用户在删除确认对话框中，**When** 用户点击"确认"，**Then** 笔记从列表中移除，本地数据库和 LanceDB 向量数据同步删除
5. **Given** 用户在删除确认对话框中，**When** 用户点击"取消"，**Then** 对话框关闭，笔记保持不变

---

### User Story 4 - 聊天中关联和加载笔记 (Priority: P2)

用户希望在 Private Mode 的聊天会话中关联特定笔记，系统在用户发送消息时自动搜索相关笔记内容并注入到 AI 上下文中，实现与 Cloud Mode 笔记加载和 Private Mode Knowledge Base 加载相同的体验。

**Why this priority**: 这是 P2 RAG 功能在聊天场景的实际应用，让笔记真正发挥价值。与 P2 优先级相同，因为它们共同构成完整的 RAG 工作流。

**Independent Test**: 可以独立测试，步骤为：在 Private Mode 下创建并 embed 笔记 → 在聊天设置中关联该笔记 → 发送与笔记相关的问题 → 验证 AI 响应引用了笔记内容。需要 P1 和 P2 完成，但可以作为端到端场景独立验证。

**Acceptance Scenarios**:

1. **Given** 用户在 Private Mode 下创建新的聊天会话，**When** 用户在会话设置中选择关联笔记，**Then** 系统显示所有可用的 Private Mode 笔记列表（仅显示本地笔记，不显示 Cloud 笔记）
2. **Given** 用户在 Private Mode 聊天中关联了多个笔记，**When** 用户发送消息，**Then** 系统对消息内容生成 embedding，在关联的笔记中搜索最相关的 5 个片段（与 Knowledge Base 相同）
3. **Given** 用户在 Private Mode 聊天中找到相关笔记片段，**When** 系统生成 AI 响应，**Then** 相关笔记内容作为系统消息注入到 AI 提示中，格式为"You have access to the following notes..."
4. **Given** 用户在 Private Mode 聊天中关联的笔记未 embedded，**When** 用户发送消息，**Then** 系统跳过该笔记的 RAG 检索（或提示用户先 embed）
5. **Given** 用户在 Private Mode 聊天中关联笔记后切换到 Cloud Mode，**When** 用户查看该聊天会话，**Then** 关联的笔记信息保持不变（存储在 `localChatSessions` 表的 `availableNoteIds` 字段中）

---

### Edge Cases

- **笔记内容过长**: 当笔记内容超过 10,000 字符时，如何分块生成 embeddings？（参考 Knowledge Base 的分块策略：1000 字符/块，200 字符重叠）
- **并发编辑**: 如果用户在多个窗口同时编辑同一笔记（Private Mode），如何处理冲突？（SQLite 级别的写锁保证原子性）
- **Ollama 未运行**: 当用户在 Private Mode 下点击"Embed"但 Ollama 未运行时，如何提示和处理？（显示错误提示，建议启动 Ollama）
- **向量搜索无结果**: 当用户在聊天中关联笔记但 RAG 搜索未找到相关内容时，如何处理？（继续生成 AI 响应，不注入笔记上下文）
- **数据迁移**: 如果用户想将 Cloud Mode 笔记迁移到 Private Mode（或反之），如何实现？（超出此功能范围，可作为未来需求）
- **Embedding 模型未下载**: 当用户首次使用 Embed 功能但 `nomic-embed-text` 模型未安装时，如何处理？（自动拉取模型，显示下载进度）
- **笔记删除但仍在聊天中关联**: 当用户删除笔记后，关联该笔记的聊天会话如何处理？（聊天会话保留笔记 ID，但 RAG 搜索时忽略不存在的笔记）

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须在 Private Mode 下允许用户创建新笔记，包含标题（必填，1-200 字符）和内容（可选，Markdown/HTML 格式）
- **FR-002**: 系统必须将 Private Mode 笔记存储在本地 SQLite 数据库（`{userData}/rafa-private.db`）的 `localNotes` 表中，包含字段：id, title, content, starred, createdAt, updatedAt
- **FR-003**: 系统必须在 Private Mode 下允许用户编辑已有笔记的标题和内容，并更新 `updatedAt` 时间戳
- **FR-004**: 系统必须在 Private Mode 下允许用户星标/取消星标笔记，并在侧边栏按"Starred"和"Recent"分组显示
- **FR-005**: 系统必须在 Private Mode 下允许用户删除笔记，删除前显示确认对话框，删除后级联删除关联的向量数据
- **FR-006**: 系统必须为 Private Mode 笔记提供 Embed 功能，调用本地 Ollama API（模型：`nomic-embed-text`）生成 768 维向量
- **FR-007**: 系统必须将笔记内容分块（1000 字符/块，200 字符重叠）后分别生成 embeddings，并存储到 LanceDB 的 `note_{noteId}` 表中
- **FR-008**: 系统必须在 Private Mode 聊天中允许用户关联特定笔记，笔记 ID 存储在 `localChatSessions.availableNoteIds` 字段（JSON 数组）
- **FR-009**: 系统必须在 Private Mode 聊天中，当用户发送消息时，对关联的笔记进行向量搜索（返回 top 5 最相关片段），并将结果注入到 AI 提示的系统消息中
- **FR-010**: 系统必须在 Cloud Mode 和 Private Mode 之间完全隔离笔记数据（Cloud 笔记存储在远程 PostgreSQL，Private 笔记存储在本地 SQLite）
- **FR-011**: 系统必须保持 Private Mode 笔记的 UI 与 Cloud Mode 笔记完全一致，包括编辑器样式、侧边栏布局、按钮样式和交互行为
- **FR-012**: 系统必须为 Private Mode 笔记 Embed 操作提供进度反馈（IPC 进度事件），显示当前处理进度百分比
- **FR-013**: 系统必须在 Embed 操作失败时回滚，不保留部分 embeddings，并向用户显示错误提示
- **FR-014**: 系统必须在删除 Private Mode 笔记时，级联删除 LanceDB 中的向量表（`note_{noteId}`）和所有向量记录
- **FR-015**: 系统必须在 Private Mode 下使用 TanStack Query 管理笔记数据缓存，查询键格式为 `noteKeys.lists('private')` 和 `noteKeys.detail(noteId, 'private')`
- **FR-016**: 系统必须支持 Private Mode 笔记的乐观更新（optimistic updates），包括创建、编辑、星标和删除操作
- **FR-017**: 系统必须在 Embed 操作前自动检查并下载 `nomic-embed-text` 模型（如果未安装），显示下载进度
- **FR-018**: 系统必须在 Private Mode 聊天的 RAG 搜索中使用余弦相似度（cosine similarity）排序，距离阈值为 0.3（相似度 > 0.7）

### Key Entities *(include if feature involves data)*

- **Local Note**: Private Mode 下的本地笔记实体，存储在 SQLite
  - 属性：id (UUID), title (文本), content (Markdown/HTML), starred (布尔), createdAt (时间戳), updatedAt (时间戳)
  - 关系：一个笔记对应一个 LanceDB 向量表（`note_{noteId}`）

- **Note Embedding**: 笔记的向量 embedding 记录，存储在 LanceDB
  - 属性：id (格式: `{noteId}_chunk_{index}`), noteId (UUID), content (分块文本), embedding (768 维向量)
  - 关系：属于特定的 Local Note

- **Chat Session (Private Mode)**: Private Mode 下的聊天会话
  - 属性：id, title, model, availableNoteIds (JSON 数组)
  - 关系：可以关联多个 Local Notes 用于 RAG 检索

- **Note Chunk**: 笔记内容的文本分块（逻辑实体，用于 embedding 生成）
  - 属性：chunkIndex (序号), content (1000 字符), overlap (200 字符)
  - 关系：多个 Chunks 组成一个 Note 的完整内容

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户在 Private Mode 下创建笔记后立即在侧边栏看到新笔记，无需手动刷新（乐观更新）
- **SC-002**: 用户在 Private Mode 下编辑笔记时，保存操作在 500 毫秒内完成（本地 SQLite 写入性能）
- **SC-003**: 用户在 Private Mode 下对笔记进行 Embed 操作时，每 1000 字符的内容在 5 秒内完成 embedding 生成（取决于本地硬件性能）
- **SC-004**: 用户在 Private Mode 聊天中关联笔记后，RAG 搜索在 2 秒内返回相关片段（包含向量化查询时间）
- **SC-005**: 用户切换 Cloud Mode 和 Private Mode 后，笔记列表在 200 毫秒内切换完成，无数据混淆（100% 数据隔离）
- **SC-006**: 用户删除 Private Mode 笔记后，向量数据在 1 秒内完全清除，不留孤立数据（级联删除成功率 100%）
- **SC-007**: 用户在 Private Mode 下重启应用后，所有本地笔记数据完整保留，无数据丢失（持久化成功率 100%）
- **SC-008**: 用户在 Private Mode 下使用 Embed 功能时，如果 Ollama 未运行，在 3 秒内收到明确的错误提示
- **SC-009**: 用户在 Private Mode 聊天中关联 5 个笔记，RAG 搜索能够从所有笔记中找到最相关的内容（多笔记搜索准确率 > 90%）
- **SC-010**: Private Mode 笔记的 UI 与 Cloud Mode 笔记在视觉和交互上完全一致，用户无法通过 UI 区分模式（UI 一致性 100%）

## Assumptions *(optional)*

- **ASM-001**: 用户已经安装并配置了 Ollama，且 `nomic-embed-text` 模型可通过 Ollama API 访问（如果未安装，系统会自动拉取）
- **ASM-002**: Private Mode 笔记的内容大小不超过 100,000 字符（参考 Knowledge Base 文件大小限制）
- **ASM-003**: 用户在 Private Mode 下的笔记数量不超过 10,000 条（SQLite 性能考虑）
- **ASM-004**: LanceDB 向量数据库已在应用启动时初始化，路径为 `{userData}/vector-db`
- **ASM-005**: 用户的设备具有足够的磁盘空间存储笔记和向量数据（至少 1GB 可用空间）
- **ASM-006**: RAG 搜索使用与 Knowledge Base 相同的相似度阈值（余弦距离 < 0.3）
- **ASM-007**: 笔记内容使用 UTF-8 编码，支持中文、英文和其他 Unicode 字符
- **ASM-008**: Embedding 生成过程串行处理，避免 M4 Mac Metal GPU 崩溃（参考 Knowledge Base 实现）

## Out of Scope *(optional)*

- **OOS-001**: Cloud Mode 笔记和 Private Mode 笔记之间的数据同步或迁移功能
- **OOS-002**: 笔记版本历史和回滚功能
- **OOS-003**: 笔记的协作编辑和共享功能（Private Mode 仅支持本地单用户）
- **OOS-004**: 笔记的富文本格式（图片、表格等），仅支持 Markdown/HTML 文本
- **OOS-005**: 笔记的标签（tags）和分类功能（仅支持星标）
- **OOS-006**: 笔记的全文搜索功能（仅支持 RAG 向量搜索）
- **OOS-007**: 笔记的导入/导出功能（如从 Notion、Evernote 导入）
- **OOS-008**: 笔记的加密功能（数据存储在本地文件系统，依赖操作系统级别的加密）
