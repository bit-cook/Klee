# Feature Specification: Marketplace Private Mode - 本地开源大模型管理

**Feature Branch**: `008-specify-scripts-bash`
**Created**: 2025-10-23
**Status**: Draft
**Input**: 用户从marketplace浏览和下载 Ollama 支持的开源大模型，用于 Private Mode 离线聊天

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 浏览可用的开源大模型 (Priority: P1)

用户在 Private Mode 下访问 marketplace，查看所有可供下载的开源大模型列表，了解每个模型的基本信息（名称、提供者、大小、GPU 要求、更新日期等），以便选择适合的模型。

**Why this priority**: 这是整个功能的入口点，用户必须能够看到可用模型列表才能进行后续操作。

**Independent Test**: 用户打开应用，切换到 Private Mode，点击 sidebar 的 marketplace 入口，即可看到开源大模型列表，无需任何前置操作。

**Acceptance Scenarios**:

1. **Given** 用户处于 Private Mode, **When** 用户点击左侧边栏的 Marketplace, **Then** 系统显示 "Local LLMs" 标签页，展示所有可下载的开源大模型
2. **Given** 用户查看模型列表, **When** 用户浏览任一模型卡片, **Then** 系统显示模型的名称、提供者、大小（GB）、GPU 最低要求、更新日期
3. **Given** 用户查看模型列表, **When** 某个模型已经下载完成, **Then** 该模型卡片显示"已下载"徽章，下载按钮替换为"已安装"状态
4. **Given** 用户处于 Cloud Mode, **When** 用户访问 Marketplace, **Then** 系统不显示 "Local LLMs" 标签页，只显示 Agents 和 Knowledge Bases

---

### User Story 2 - 下载开源大模型 (Priority: P1)

用户选择一个未下载的开源大模型，点击下载按钮后，系统从 Ollama 官方源通过 `ollama pull` 命令下载模型到本地，并实时显示下载进度。

**Why this priority**: 下载功能是核心价值，用户需要下载模型才能在 Private Mode 中使用本地聊天。

**Independent Test**: 在 User Story 1 的基础上，用户点击任一未下载模型的"下载"按钮，系统开始下载并显示进度条，完成后模型可用。

**Acceptance Scenarios**:

1. **Given** 用户看到未下载的模型, **When** 用户点击"Download"按钮, **Then** 系统开始下载，按钮文本变为进度百分比（如 "Downloading... 25%"）
2. **Given** 模型正在下载, **When** 下载过程中, **Then** 模型卡片显示进度条、已下载大小、下载速度、预计剩余时间
3. **Given** 模型正在下载, **When** 下载完成, **Then** 系统显示成功消息，按钮变为"已安装"状态，模型立即可在聊天中选择
4. **Given** 模型正在下载, **When** 下载失败（网络中断、磁盘空间不足等）, **Then** 系统显示错误消息，按钮恢复为"Download"状态，并提示用户重试

---

### User Story 3 - 控制下载过程（暂停、继续、取消）(Priority: P2)

用户在模型下载过程中可以暂停下载以节省带宽或释放资源，稍后继续下载，或者取消下载以释放磁盘空间。

**Why this priority**: 提升用户体验，允许用户控制大文件下载，但不是核心功能（大多数用户会一次性下载完成）。

**Independent Test**: 在 User Story 2 的基础上，用户在下载进行中点击"暂停"按钮，下载停止；点击"继续"按钮，下载恢复；点击"取消"按钮，下载任务被清除。

**Acceptance Scenarios**:

1. **Given** 模型正在下载, **When** 用户点击"Pause"按钮, **Then** 下载暂停，进度条冻结，按钮变为"Resume"和"Cancel"
2. **Given** 模型下载已暂停, **When** 用户点击"Resume"按钮, **Then** 下载从上次停止的位置继续，进度条更新
3. **Given** 模型下载已暂停或正在下载, **When** 用户点击"Cancel"按钮, **Then** 系统停止下载，删除部分下载的文件，按钮恢复为"Download"状态
4. **Given** 用户取消下载, **When** 取消完成, **Then** 系统显示确认消息，模型从"正在下载"列表中移除

---

### User Story 3.5 - 删除已下载的模型 (Priority: P2)

用户可以删除已下载的开源模型，从系统 Ollama 文件夹（`~/.ollama/models`）中移除模型文件，以释放磁盘空间。

**Why this priority**: 提供磁盘空间管理功能，允许用户清理不再使用的模型，但不是核心功能（用户可以通过 Ollama CLI 手动删除）。

**Independent Test**: 用户在 marketplace 中找到已下载的模型，点击"删除"按钮，确认后模型从系统中删除，模型卡片状态恢复为"未下载"。

**Acceptance Scenarios**:

1. **Given** 用户查看已下载的模型, **When** 用户点击模型卡片上的"Delete"按钮（垃圾桶图标）, **Then** 系统显示确认对话框："Are you sure you want to delete [Model Name]? This will free up [X] GB of disk space."
2. **Given** 系统显示删除确认对话框, **When** 用户点击"Confirm", **Then** 系统通过 Ollama API 调用 `ollama rm <model>` 删除模型，显示删除进度
3. **Given** 模型正在删除, **When** 删除完成, **Then** 系统显示成功消息，模型卡片状态变为"未下载"（显示"Download"按钮），模型从聊天模型选择器中移除
4. **Given** 系统显示删除确认对话框, **When** 用户点击"Cancel", **Then** 系统关闭对话框，模型保持已下载状态
5. **Given** 用户尝试删除模型, **When** 模型正在被某个聊天会话使用, **Then** 系统显示警告消息："This model is currently in use. Please switch to another model before deleting."，并阻止删除操作
6. **Given** 用户尝试删除模型, **When** 删除失败（如权限不足、文件被锁定）, **Then** 系统显示错误消息并保持模型已下载状态

---

### User Story 4 - 在聊天中使用已下载的模型 (Priority: P1)

用户在 Private Mode 下创建或打开一个聊天会话，可以在聊天配置（chat-config）或聊天输入框（ChatPromptInput）的模型选择器中看到所有已下载的开源模型，并选择使用。

**Why this priority**: 这是下载模型后的实际使用场景，是功能的最终价值体现。

**Independent Test**: 用户下载至少一个模型（P2），切换到 Private Mode，打开聊天会话，模型选择器中显示已下载模型，选择后可以正常发送消息并收到本地模型的回复。

**Acceptance Scenarios**:

1. **Given** 用户处于 Private Mode 且已下载至少一个模型, **When** 用户打开聊天会话, **Then** ChatPromptInput 的模型选择器显示所有已下载的开源模型（如 "Llama 3 8B", "Mistral 7B"）
2. **Given** 用户查看模型选择器, **When** 用户选择一个已下载的模型, **Then** 系统设置该模型为当前聊天的默认模型
3. **Given** 用户处于 Private Mode 且未下载任何模型, **When** 用户打开聊天会话, **Then** 系统显示提示消息："No models installed. Please download models from Marketplace."，模型选择器为空
4. **Given** 用户在 chat-config 中选择模型, **When** 用户切换模型, **Then** 后续消息使用新选择的模型生成回复

---

### User Story 5 - Private Mode 下隐藏 Web Search 选项 (Priority: P2)

用户在 Private Mode 下使用 ChatPromptInput 时，Web Search 按钮被隐藏或禁用，因为 Private Mode 强调完全离线运行，不支持联网搜索。

**Why this priority**: 保持 Private Mode 的完全离线特性，避免用户混淆，但不影响核心聊天功能。

**Independent Test**: 用户切换到 Private Mode，打开聊天会话，ChatPromptInput 工具栏不显示 Web Search 按钮。

**Acceptance Scenarios**:

1. **Given** 用户处于 Private Mode, **When** 用户打开聊天输入框, **Then** ChatPromptInput 工具栏不显示"Search"（Web Search）按钮
2. **Given** 用户处于 Cloud Mode, **When** 用户打开聊天输入框, **Then** ChatPromptInput 工具栏显示"Search"按钮且功能正常
3. **Given** 用户从 Cloud Mode 切换到 Private Mode, **When** 切换完成, **Then** 当前聊天会话的 Web Search 按钮立即隐藏

---

### User Story 6 - 统一的模型列表配置 (Priority: P2)

系统维护一个统一的开源模型配置文件，包含本地模型和云端模型的定义，只有在该配置文件中列出的模型才能在 marketplace 中显示并下载。

**Why this priority**: 确保模型列表的可维护性和一致性，便于后续扩展和管理，但不直接影响用户体验。

**Independent Test**: 开发者在配置文件中添加新模型后，重启应用，新模型出现在 marketplace 列表中；移除模型后，该模型不再显示。

**Acceptance Scenarios**:

1. **Given** 配置文件中包含 10 个开源模型, **When** 用户访问 marketplace, **Then** 系统仅显示这 10 个模型，不显示其他 Ollama 官方模型
2. **Given** 开发者更新配置文件添加新模型, **When** 用户刷新或重启应用, **Then** 新模型出现在 marketplace 列表中
3. **Given** 配置文件中模型被标记为已弃用, **When** 用户访问 marketplace, **Then** 该模型显示"已弃用"标签，但仍可下载（如果已下载则可继续使用）
4. **Given** 配置文件语法错误或缺失, **When** 系统启动, **Then** 系统使用默认模型列表，并在控制台记录错误日志

---

### Edge Cases

- **磁盘空间不足**: 用户下载大模型时磁盘空间不足，系统在��载前检查可用空间，不足时提示用户并阻止下载
- **网络中断**: 下载过程中网络中断，系统显示错误消息，允许用户重试或取消
- **Ollama 服务不可用**: 用户尝试下载模型但 Ollama 服务未运行，系统显示"Ollama is not available. Please ensure Ollama is running."
- **模型已部分下载**: 用户上次取消下载留下部分文件，系统检测到后自动清理或续传
- **并发下载限制**: 用户同时下载多个大模型，系统限制并发下载数（如最多 2 个），其他任务排队
- **模式切换**: 用户在 Cloud Mode 下载模型过程中切换到 Private Mode，系统继续下载但仅在 Private Mode 中可见下载进度
- **模型版本更新**: Ollama 官方更新模型版本，配置文件中的模型信息需要手动更新（或通过后续功能自动同步）
- **删除正在使用的模型**: 用户尝试删除当前聊天会话正在使用的模型，系统阻止删除并提示切换模型
- **删除失败**: 模型文件被锁定或权限不足导致删除失败，系统显示错误消息并保持模型已下载状态
- **删除后自动切换**: 用户删除当前默认模型，系统自动将默认模型切换为第一个可用的已下载模型（或提示下载新模型）

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: 系统 MUST 在 marketplace 中新增 "Local LLMs" 标签页，仅在 Private Mode 下显示
- **FR-002**: 系统 MUST 从统一的模型配置文件读取开源模型列表（包含名称、提供者、大小、GPU 要求、更新日期等元数据）
- **FR-003**: 系统 MUST 为每个模型显示以下信息：模型名称、提供者、大小（GB）、GPU 最低要求、更新日期、下载状态（未下载/下载中/已安装）
- **FR-004**: 系统 MUST 提供"Download"按钮，点击后通过 Ollama API 调用 `ollama pull <model>` 下载模型到系统 Ollama 文件夹
- **FR-005**: 系统 MUST 在下载过程中实时显示：进度百分比、已下载大小、下载速度、预计剩余时间
- **FR-006**: 系统 MUST 提供"Pause"按钮暂停下载，"Resume"按钮继续下载，"Cancel"按钮取消下载并清理部分文件
- **FR-007**: 系统 MUST 在下载失败时显示错误消息（包括错误类型：网络、磁盘、服务不可用），并允许用户重试
- **FR-008**: 系统 MUST 在下载完成后更新模型卡片状态为"已安装"，并在聊天模型选择器中添加该模型
- **FR-009**: 系统 MUST 在 Private Mode 下的 ChatPromptInput 中隐藏 Web Search 按钮
- **FR-010**: 系统 MUST 在 Private Mode 下的聊天模型选择器中仅显示已下载的开源模型（来自 Ollama 的 `/api/tags` API）
- **FR-011**: 系统 MUST 在用户切换模式（Cloud ↔ Private）时刷新模型列表和 Web Search 按钮可见性
- **FR-012**: 系统 MUST 在下载前检查磁盘可用空间，不足时阻止下载并提示用户释放空间
- **FR-013**: 系统 MUST 限制并发下载数为 2 个，其他下载任务排队等待
- **FR-014**: 配置文件 MUST 支持以下字段：`name`（显示名称）、`model`（Ollama 模型 ID）、`provider`（提供者）、`size`（大小 GB）、`minGPU`（GPU 要求）、`updatedAt`（更新日期）、`deprecated`（是否弃用）
- **FR-015**: 系统 MUST 为已下载的模型提供"Delete"按钮（垃圾桶图标），点击后显示确认对话框
- **FR-016**: 删除确认对话框 MUST 显示模型名称和将释放的磁盘空间（如 "4.7 GB"）
- **FR-017**: 系统 MUST 通过 Ollama API 调用 `ollama rm <model>` 删除模型文件
- **FR-018**: 系统 MUST 在删除完成后更新模型卡片状态为"未下载"，并从聊天模型选择器中移除该模型
- **FR-019**: 系统 MUST 在删除模型前检查该模型是否正在被任何聊天会话使用，如果是则阻止删除并显示警告消息
- **FR-020**: 系统 MUST 在删除失败时显示错误消息（包括错误类型：权限不足、文件被锁定等），并保持模型已下载状态

### Key Entities _(include if feature involves data)_

- **LocalLLMModel**: 开源大模型元数据
  - `name`: 显示名称（如 "Llama 3 8B"）
  - `model`: Ollama 模型 ID（如 "llama3:8b"）
  - `provider`: 提供者（如 "Meta", "Mistral AI"）
  - `size`: 模型大小（GB）
  - `minGPU`: GPU 最低要求（如 "4GB VRAM", "None"）
  - `updatedAt`: 最后更新日期（ISO 8601 格式）
  - `deprecated`: 是否已弃用（布尔值）
  - `downloadStatus`: 下载状态（未下载/下载中/已安装）
  - `downloadProgress`: 下载进度（0-100）

- **DownloadTask**: 模型下载任务
  - `modelId`: 关联的模型 ID
  - `status`: 任务状态（等待/下载中/暂停/完成/失败/已取消）
  - `progress`: 下载进度（0-100）
  - `downloadedBytes`: 已下载字节数
  - `totalBytes`: 总字节数
  - `speed`: 下载速度（bytes/s）
  - `estimatedTimeRemaining`: 预计剩余时间（秒）
  - `error`: 错误消息（如果失败）

- **ModelConfig**: 统一模型配置（文件格式）
  - `localModels`: 本地开源模型列表（LocalLLMModel 数组）
  - `cloudModels`: 云端模型列表（现有的 llmModels）
  - `version`: 配置文件版本号（用于后续迁移）

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 用户可以在 2 分钟内浏览完所有可用的开源模型并开始下载（假设模型列表 ≤ 20 个）
- **SC-002**: 用户可以在下载完成后立即（≤ 5 秒）在聊天中选择并使用新下载的模型
- **SC-003**: 下载进度更新延迟 ≤ 1 秒，用户实时看到下载进展
- **SC-004**: 暂停/继续/取消操作在 2 秒内生效，用户获得即时反馈
- **SC-005**: 系统在磁盘空间不足时 100% 阻止下载，避免下载失败导致用户困惑
- **SC-006**: Private Mode 下 Web Search 按钮 100% 隐藏，避免用户误操作
- **SC-007**: 模式切换后模型列表在 3 秒内更新，用户看到正确的模型列表
- **SC-008**: 配置文件更新后，重启应用即可看到新模型（无需清除缓存或重新安装）
- **SC-009**: 下载失败时错误消息清晰易懂，用户知道如何解决问题（如"网络连接中断，请检查网络后重试"）
- **SC-010**: 并发下载限制确保系统稳定，不因同时下载过多模型导致 Ollama 服务崩溃或响应缓慢
- **SC-011**: 删除模型操作在 5 秒内完成，用户获得即时反馈（删除确认对话框响应 ≤ 1 秒）
- **SC-012**: 系统在 100% 情况下阻止删除正在使用的模型，避免导致聊天会话错误
- **SC-013**: 删除失败时错误消息准确描述原因，用户知道如何解决（如"文件被锁定，请关闭使用该模型的应用后重试"）

## Assumptions _(optional)_

- 用户已安装 Ollama 或系统已通过 electron-ollama 自动配置
- 用户网络连接稳定，可以访问 Ollama 官方模型仓库（https://ollama.com）
- 用户磁盘空间至少有 10GB 可用空间（用于下载中等大小模型）
- Ollama API `/api/pull` 支持流式响应和进度跟踪（已验证）
- 模型配置文件存储在 `client/src/renderer/src/config/models.ts` 中，采用 TypeScript 对象格式
- 下载的模型存储在系统 Ollama 默认目录（`~/.ollama/models` 或 Windows 等效路径）
- 用户不会在短时间内频繁切换 Cloud/Private 模式（模式切换后缓存清除可能导致短暂性能下降）

## Dependencies _(optional)_

- **Ollama API**: 依赖 Ollama 的 `/api/pull`、`/api/tags` 和 `/api/delete` 端点（用于下载、列出和删除模型）
- **electron-ollama**: 如果系统未安装 Ollama，依赖 electron-ollama 自动配置（已在 006-private-mode 中实现）
- **ModeContext**: 依赖 `client/src/renderer/src/contexts/ModeContext.tsx` 提供的 `isPrivateMode` 状态
- **TanStack Query**: 依赖现有的查询缓存机制来管理模型列表和下载状态
- **UI 组件库**: 复用现有的 Card、Button、Badge、Skeleton、ProgressBar、Dialog（确认对话框）组件

## Out of Scope _(optional)_

- 模型版本自动更新（需要额外的 Ollama 版本管理逻辑）
- 模型性能基准测试（如推理速度、内存占用）
- 自定义模型参数（如 temperature、top_p）配置（由 chat-config 或 Agent 配置控制）
- 模型搜索和筛选功能（如按大小、提供者筛选）
- 模型评论和评分（需要后端支持）
- 离线模型推荐（如根据用户硬件配置推荐模型）
- 模型下载断点续传（Ollama API 不直接支持，需额外实现）
- 批量删除多个模型（用户需逐个删除）
- 删除后磁盘空间回收验证（依赖操作系统自动回收）

## Notes _(optional)_

### 技术实现建议（非规格要求）

以下建议供开发团队参考，不作为规格验收标准：

1. **模型配置文件结构**: 建议扩展 `client/src/renderer/src/config/models.ts`，添加 `localModels` 导出：

   ```typescript
   export const localLLMModels = [
     {
       name: "Llama 3 8B",
       model: "llama3:8b",
       provider: "Meta",
       size: 4.7,
       minGPU: "None",
       updatedAt: "2024-05-15",
     },
     // ...
   ]
   ```

2. **下载进度追踪**: Ollama `/api/pull` 返回 NDJSON 流，每行包含 `status` 和 `completed`/`total` 字段，可直接解析

3. **UI 组件复用**: marketplace 模型卡片可复用 `client/src/renderer/src/routes/_authenticated/marketplace.index.tsx` 中的 Card 布局

4. **模式切换监听**: 在 `ModeContext` 的 `setMode` 函数中已有缓存清除逻辑，无需额外处理

5. **错误处理**: 建议使用 TanStack Query 的 `onError` 回调统一处理下载错误，显示 toast 通知

### ��户体验优化（可选）

- 下载完成后显示庆祝动画或成功提示音（提升用户满意度）
- 在模型卡片中显示模型的"推荐"标签（如 "Recommended for beginners"）
- 提供"下载全部推荐模型"快捷按钮（一次下载多个精选模型）
- 在下载队列中显示所有等待下载的模型（用户可调整顺序）

### 安全和隐私考虑

- Private Mode 强调完全离线，确保下载过程不收集用户数据或发送遥测信息
- 模型配置文件为静态文件，不从远程服务器动态获取（避免潜在的供应链攻击）
- 下载过程使用 HTTPS（Ollama 官方源默认支持），确保模型完整性
