# 功能规范：Private Mode 知识库模块

**功能分支**: `007-private-knowledge-base`
**创建日期**: 2025-10-22
**状态**: 草稿
**输入**: 用户描述: "参考cloud mode的知识库模块，完成private mode知识库模块
要求：

1. UI尽可能复用
2. embedding全流程要在本地处理，包含本地的embedding大模型和embedding数据库
3. embedding大模型选择一个轻量级的，内嵌在rafa安装包里面，不要让用户下载"

## 用户场景与测试 _(必填)_

### 用户故事 1 - 创建本地知识库并上传文档 (优先级: P1)

用户在 Private Mode 下创建知识库并上传文档，所有数据（包括文件内容、向量embeddings）完全存储在本地，无需网络连接。

**优先级原因**: 这是核心功能，是知识库模块的基础。没有这个功能，用户无法在 Private Mode 下使用 RAG 能力。

**独立测试**: 可以通过创建一个知识库、上传一个 PDF 文件，验证文件成功提取文本、生成本地 embeddings、存储到本地数据库来完全测试此功能。

**验收场景**:

1. **Given** 用户已切换到 Private Mode，**When** 用户点击"新建知识库"按钮并填写名称和描述，**Then** 系统在本地 SQLite 数据库中创建知识库记录
2. **Given** 用户已创建本地知识库，**When** 用户上传一个 PDF 文件（<100MB），**Then** 系统在本地提取文本、分块、使用内嵌的 embedding 模型生成向量、存储到本地向量数据库
3. **Given** 用户正在上传文件，**When** 文件处理过程中，**Then** 系统显示实时进度（提取文本 → 分块 → 向量化 → 完成）
4. **Given** 用户的设备完全离线，**When** 用户执行创建知识库和上传文档操作，**Then** 所有操作成功完成，无需网络连接

---

### 用户故事 2 - 在本地聊天中使用知识库检索 (优先级: P2)

用户在 Private Mode 的聊天会话中关联知识库，系统使用本地向量搜索为 AI 提供上下文。

**优先级原因**: 这是知识库的主要使用场景，让用户能够利用本地知识进行问答。依赖 P1 的基础功能。

**独立测试**: 可以通过创建一个包含特定内容的知识库，在聊天中提问相关问题，验证系统返回的答案包含知识库内容来测试。

**验收场景**:

1. **Given** 用户已创建包含文档的本地知识库，**When** 用户在 Private Mode 聊天中提问，**Then** 系统使用本地向量搜索找到相关文档片段并注入到 Ollama prompt 中
2. **Given** 用户的问题与知识库内容相关，**When** AI 生成回答，**Then** 回答引用知识库中的具体内容
3. **Given** 用户关联了多个知识库，**When** 用户提问，**Then** 系统在所有关联的知识库中执行向量搜索
4. **Given** 系统完全离线运行，**When** 执行向量搜索，**Then** 搜索在 100ms 内返回结果（本地 LanceDB 性能）

---

### 用户故事 3 - 管理本地知识库和文件 (优先级: P3)

用户可以查看、编辑、删除、星标本地知识库，管理其中的文件。

**优先级原因**: 这是知识库的辅助功能，提升用户体验。用户需要能够维护他们的本地知识库。

**独立测试**: 可以通过创建知识库、修改名称、删除文件、删除知识库等操作，验证本地数据库和文件系统的状态变化。

**验收场景**:

1. **Given** 用户有多个本地知识库，**When** 用户打开知识库列表页面，**Then** 系统从本地 SQLite 数据库加载并显示所有知识库
2. **Given** 用户打开某个知识库详情，**When** 用户修改名称或描述，**Then** 系统更新本地数据库记录
3. **Given** 用户选择删除某个文件，**When** 用户确认删除，**Then** 系统删除本地文件存储、删除 SQLite 记录、删除 LanceDB 中的向量数据
4. **Given** 用户删除整个知识库，**When** 用户确认删除，**Then** 系统级联删除所有关联的文件、向量数据、聊天配置引用
5. **Given** 用户标记某个知识库为星标，**When** 用户确认标记，**Then** 系统更新本地数据库记录，将该知识库标记为星标，也可以取消星标

---

### 用户故事 4 - 复用 Cloud Mode UI 组件 (优先级: P1)

Private Mode 知识库的 UI 界面与 Cloud Mode 保持一致，用户无需学习新的交互方式。

**优先级原因**: 这是设计要求，降低开发成本并提升用户体验。需要在架构设计阶段就考虑。

**独立测试**: 可以通过在 Cloud Mode 和 Private Mode 间切换，验证知识库列表、详情页、上传界面的 UI 完全一致。

**验收场景**:

1. **Given** 用户从 Cloud Mode 切换到 Private Mode，**When** 用户打开知识库页面，**Then** UI 布局、按钮、表单完全一致
2. **Given** 用户在 Private Mode 下操作知识库，**When** 用户执行创建、上传、编辑、删除操作，**Then** 交互流程与 Cloud Mode 完全一致
3. **Given** 开发人员查看代码，**When** 检查知识库 UI 组件，**Then** 发现 Cloud 和 Private Mode 使用相同的 React 组件，仅数据源不同

---

### 边缘情况

- 当用户上传超大文件（>100MB）时会发生什么？系统是否显示明确的错误消息？
- 当用户的磁盘空间不足以存储向量数据时会发生什么？
- 当用户在文件向量化过程中关闭应用会发生什么？系统是否能恢复或清理中间状态？
- 当用户上传无法提取文本的损坏 PDF 文件时会发生什么？
- 当用户在 Cloud Mode 和 Private Mode 之间切换时，知识库数据是否正确隔离？
- 当用户删除知识库时，如果该知识库正在被某个聊天会话使用会发生什么？
- 当用户上传包含大量文本的文件（例如 1000 页的 PDF）时，向量化需要多长时间？是否有进度指示？
- 当内嵌的 embedding 模型首次加载时需要多长时间？是否需要初始化步骤？

## 需求 _(必填)_

### 功能需求

**本地数据存储**

- **FR-001**: 系统必须使用 SQLite 数据库存储 Private Mode 下的知识库元数据（id、name、description、starred、createdAt、updatedAt）
- **FR-002**: 系统必须使用 LanceDB 向量数据库存储文档的 embedding 向量（每个知识库对应一个独立的向量表）
- **FR-003**: 系统必须将上传的原始文件存储在本地文件系统（electron app.getPath('userData') + '/documents/' 目录下）
- **FR-004**: 系统必须确保 Cloud Mode 和 Private Mode 的数据完全隔离（不同的数据库文件和存储目录）

**本地 Embedding 处理**

- **FR-005**: 系统必须内嵌轻量级的 embedding 模型，无需用户下载或安装额外依赖
- **FR-006**: 系统必须使用 Ollama 的 nomic-embed-text 模型生成 768 维向量（已在 local.config.ts 中配置）
- **FR-007**: 系统必须在文件上传时自动执行完整的 embedding 流程：文本提取 → 分块（1000 字符/块，200 字符重叠）→ 向量化 → 存储到 LanceDB
- **FR-008**: 系统必须在完全离线环境下完成所有 embedding 操作（使用本地 Ollama embedding API）

**文件处理**

- **FR-009**: 系统必须支持与 Cloud Mode 相同的文件类型（.txt、.md、.pdf、.json、.html、.csv）
- **FR-010**: 系统必须复用 Cloud Mode 的文本提取逻辑（pdf-parse、mammoth 等库）
- **FR-011**: 系统必须在文件处理过程中显示实时进度（提取文本 → 分块 → 向量化 → 完成）
- **FR-012**: 系统必须验证文件大小不超过 100MB（在 local.config.ts 中配置）
- **FR-013**: 系统必须在文件处理失败时清理已创建的中间数据（部分向量、临时文件等）

**向量检索**

- **FR-014**: 系统必须在本地聊天会话中执行向量相似度搜索（使用 LanceDB 的余弦相似度）
- **FR-015**: 系统必须支持在多个知识库中同时检索（查询所���关联的向量表）
- **FR-016**: 系统必须在 100ms 内返回向量搜索结果（本地 LanceDB 性能要求）
- **FR-017**: 系统必须返回 top-5 相似文档片段（在 local.config.ts 中配置）

**知识库 CRUD 操作**

- **FR-018**: 用户必须能够创建本地知识库（输入名称和可选描述）
- **FR-019**: 用户必须能够查看所有本地知识库的列表（从 SQLite 加载）
- **FR-020**: 用户必须能够查看单个知识库的详情和文件列表
- **FR-021**: 用户必须能够更新知识库的名称和描述（更新 SQLite 记录）
- **FR-022**: 用户必须能够删除知识库（级联删除 SQLite 记录、LanceDB 向量表、本地文件存储）
- **FR-023**: 用户必须能够标记/取消标记知识库为星标（更新 SQLite 中的 starred 字段）

**文件 CRUD 操作**

- **FR-024**: 用户必须能够上传文件到知识库（触发完整的 embedding 流程）
- **FR-025**: 用户必须能够查看知识库中的文件列表（文件名、大小、上传时间、处理状态）
- **FR-026**: 用户必须能够删除知识库中的文件（删除 SQLite 记录、LanceDB 向量、本地文件）
- **FR-027**: 系统必须在文件删除后自动更新向量索引

**UI 复用**

- **FR-028**: 系统必须复用 Cloud Mode 的知识库 UI 组件（知识库列表、详情页、创建对话框、文件上传界面）
- **FR-029**: 系统必须通过条件渲染根据当前模式（cloud/private）调用不同的数据层（RPC client vs IPC handlers）
- **FR-030**: 系统必须在 UI 上显示当前模式标识（例如在页面标题或侧边栏显示 "Private Mode" 徽章）
- **FR-031**: 系统必须在知识库列表中支持按星标筛选和排序（星标知识库优先显示）

**IPC 通信架构**

- **FR-032**: 系统必须在 Electron 主进程中实现知识库相关的 IPC handlers（create、list、get、update、delete、toggleStar、uploadFile、deleteFile）
- **FR-033**: 系统必须在渲染进程中通过 window.api.knowledgeBase.\* 调用 IPC handlers
- **FR-034**: 系统必须确保 IPC handlers 的返回类型与 Cloud Mode RPC 接口保持一致（便于 UI 复用）

**错误处理与恢复**

- **FR-035**: 系统必须在文件上传失败时回滚事务（删除部分写入的向量数据和文件）
- **FR-036**: 系统必须在应用崩溃后恢复时清理"processing"状态的文件记录
- **FR-037**: 系统必须在 embedding 模型不可用时显示明确的错误消息（例如 Ollama 服务未启动）

### 关键实体 _(包含数据的功能必须填写)_

- **KnowledgeBase（本地知识库）**: 代表用户创建的知识库，包含 id（UUID）、name（名称）、description（可选描述）、starred（是否星标，布尔值）、createdAt（创建时间）、updatedAt（更新时间）。存储在本地 SQLite 数据库中。
- **KnowledgeBaseFile（知识库文件）**: 代表上传到知识库的文件，包含 id（UUID）、knowledgeBaseId（所属知识库）、fileName（文件名）、fileSize（字节数）、fileType（MIME 类型）、storagePath（本地文件路径）、contentText（提取的文本内容）、status（processing/completed/failed）、createdAt（上传时间）。存储在本地 SQLite 数据库中。
- **Embedding（向量数据）**: 代表文档片段的向量表示，包含 id（UUID）、knowledgeBaseId（所属知识库）、fileId（所属文件）、content（文档片段文本）、embedding（768 维浮点数向量）。存储在 LanceDB 向量数据库中（每个知识库对应一个独立的表）。
- **VectorTable（向量表）**: LanceDB 中的向量表，命名格式为 "kb\_<knowledgeBaseId>"，包含所有属于该知识库的 embedding 向量。支持余弦相似度搜索。

## 成功标准 _(必填)_

### 可衡量的成果

- **SC-001**: 用户能够在完全离线状态下创建知识库、上传文件、执行向量搜索，无网络请求（可通过断开网络连接验证）
- **SC-002**: 文件上传和向量化流程在 95% 的情况下对于 10MB 以下的文件在 30 秒内完成（包括文本提取、分块、embedding 生成）
- **SC-003**: 向量相似度搜索在 100ms 内返回结果（95th percentile，针对包含 1000 个文档片段的知识库）
- **SC-004**: Private Mode 知识库 UI 与 Cloud Mode 保持 100% 的视觉和交互一致性（通过 UI 截图对比验证）
- **SC-005**: 系统在处理 100 页 PDF 文件时生成约 100-200 个文档片段（取决于内容密度），所有片段成功向量化
- **SC-006**: 内嵌的 embedding 模型（nomic-embed-text）首次加载时间不超过 5 秒（通过 Ollama API）
- **SC-007**: 用户删除知识库后，所有关联数据（SQLite 记录、LanceDB 向量表、本地文件）在 1 秒内完全清理
- **SC-008**: 系统在文件处理失败时自动回滚，不留下孤立的数据库记录或文件（通过错误注入测试验证）
- **SC-009**: 用户能够即时标记/取消标记知识库为星标，UI 立即响应（<200ms），星标知识库在列表中优先显示

## 假设与依赖

### 假设

- 用户的设备已成功安装并启动 Ollama（通过 006-private-mode 功能保证）
- Ollama 已预装或自动下载 nomic-embed-text 模型（768 维，轻量级）
- 用户的设备有足够的磁盘空间存储文档和向量数据（至少 1GB 可用空间）
- 用户的设备性能足以运行本地 embedding 生成（现代笔记本/台式机，不支持低端设备）

### 依赖

- **依赖 006-private-mode**: Private Mode 基础设施，包括 Ollama 管理器、模式切换、本地 SQLite 数据库初始化
- **依赖 LanceDB**: 用于本地向量存储和检索的向量数据库（需要在项目中集成 LanceDB Node.js 客户端）
- **依赖 Ollama embedding API**: 使用 Ollama 的 /api/embeddings 端点生成向量（无需额外下载模型）
- **依赖 Electron 文件系统 API**: 用于本地文件存储（app.getPath('userData')）
- **依赖 pdf-parse、mammoth 等库**: 文本提取功能复用 Cloud Mode 的实现

## 范围边界

### 包含在范围内

- 完整的本地知识库 CRUD 功能（创建、读取、更新、删除）
- 完整的本地文件上传和管理功能
- 本地 embedding 生成和向量存储（使用 Ollama + LanceDB）
- 本地向量检索集成到 Private Mode 聊天
- UI 组件复用架构（Cloud/Private Mode 共享组件）
- IPC 通信层实现（主进程 handlers + 渲染进程 API）

### 不包含在范围内

- 知识库的分享功能（Private Mode 不支持分享，仅本地使用）
- 知识库的导入/导出功能（可作为未来增强）
- 多设备同步（Private Mode 数据仅存储在单个设备）
- 高级向量搜索功能（如混合搜索、重排序）
- 自定义 embedding 模型选择（本版本固定使用 nomic-embed-text）
- 向量索引优化（本版本使用 LanceDB 默认索引）

## 非功能性需求

### 性能

- 向量搜索延迟 < 100ms（95th percentile）
- 文件上传和向量化总时间 < 30s（针对 10MB 以下文件）
- UI 响应时间 < 200ms（所有操作）

### 可靠性

- 文件处理失败时 100% 回滚成功（无孤立数据）
- 应用崩溃后恢复时自动清理中间状态
- 数据库事务保证原子性（SQLite + LanceDB 操作）

### 可维护性

- UI 组件在 Cloud/Private Mode 间的代码复用率 > 90%
- IPC handler 接口与 RPC 接口保持类型兼容
- 清晰的模块分离（数据层、业务逻辑层、UI 层）

### 安全性

- 所有知识库数据存储在本地，无网络传输
- Cloud Mode 和 Private Mode 数据完全隔离
- 文件路径使用安全的 Electron API（防止路径遍历攻击）

## 技术约束

- 必须使用 Ollama 的 nomic-embed-text 模型（768 维）
- 必须使用 LanceDB 作为向量数据库（支持 Node.js）
- 必须使用 SQLite 作为元数据存储（复用 006-private-mode 的数据库）
- 必须通过 Electron IPC 进行主进程和渲染进程通信
- 必须复用 Cloud Mode 的文本提取库（pdf-parse、mammoth）
- 必须在 Electron 主进程中执行文件 I/O 和数据库操作（避免阻塞渲染进程）
