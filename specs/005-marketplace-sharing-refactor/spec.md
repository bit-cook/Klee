# Feature Specification: 知识库与 Agent 市场分享流程重构

**Feature Branch**: `005-marketplace-sharing-refactor`
**Created**: 2025-10-20
**Status**: Draft
**Input**: User description: "使用中文对话。梳理当前知识库、agent创建和分享的逻辑，重构流程，保证以下的要求：1. 知识库/agent可以创建，创建之后可以在详情页一键分享到市场 2. 其他人可以在市场浏览知识库/agent，一键安装 3. 知识库/agent原作者不能安装自己分享的知识库，防止重复 4. 原作者可以将知识库取消分享、删除，这时使用该知识库的人就看不到这条知识库了，同时使用该知识库的agent也去掉该知识库的关联 5. 原作者可以将agent取消分享、删除，这时使用该agent的人就看不到这条知识库了"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 知识库创建与一键分享 (Priority: P1)

作为知识库创建者，我希望在创建知识库后，能在详情页面直接点击"分享到市场"按钮，让其他用户能够发现和使用我的知识库。

**Why this priority**: 这是核心价值主张 - 让用户能够分享自己的知识资产。没有分享功能，市场就无法存在。

**Independent Test**: 创建一个包含至少一个文件的知识库，进入详情页，点击分享按钮，验证市场列表中出现该知识库。

**Acceptance Scenarios**:

1. **Given** 用户已创建知识库并上传至少一个已处理完成的文件，**When** 用户在知识库详情页点击"分享到市场"按钮，**Then** 系统生成唯一分享链接，知识库状态变为"已分享"，并在市场中可被其他用户搜索到
2. **Given** 知识库没有任何文件或文件未处理完成，**When** 用户尝试分享知识库，**Then** 系统显示错误提示"至少需要一个完整处理的文件才能分享"
3. **Given** 知识库已处于分享状态，**When** 用户在详情页查看，**Then** 按钮显示为"已分享到市场"，并提供"取消分享"选项

---

### User Story 2 - Agent 创建与一键分享 (Priority: P1)

作为 Agent 创建者，我希望在配置 Agent 后，能在详情页面直接点击"分享到市场"按钮，让其他用户能够安装和使用我的 Agent 配置。

**Why this priority**: Agent 是系统的核心功能，分享 Agent 让用户能够传播最佳实践和专业配置。

**Independent Test**: 创建一个包含名称、模型、系统提示的 Agent，点击分享按钮，验证市场中出现该 Agent 且包含关联的知识库列表。

**Acceptance Scenarios**:

1. **Given** 用户已创建 Agent 并配置名称、默认模型和系统提示，**When** 用户在 Agent 详情页点击"分享到市场"按钮，**Then** 系统生成唯一分享链接，Agent 状态变为"已分享"，并在市场中可被搜索到
2. **Given** Agent 缺少必填信息（名称或默认模型），**When** 用户尝试分享，**Then** 系统显示错误提示"请完成必填字段：名称、默认模型"
3. **Given** Agent 关联了多个知识库（包括私有和公开的），**When** Agent 被分享到市场，**Then** 市场详情页仅显示公开的知识库关联，私有知识库不可见
4. **Given** Agent 已处于分享状态，**When** 用户在详情页查看，**Then** 按钮显示为"已分享到市场"，并提供"取消分享"选项

---

### User Story 3 - 市场浏览与搜索 (Priority: P2)

作为用户，我希望在市场页面能够浏览所有公开的知识库和 Agent，并通过搜索快速找到我需要的资源。

**Why this priority**: 发现机制是市场价值的关键，用户需要能够找到他们需要的资源。

**Independent Test**: 打开市场页面，切换知识库/Agent 标签页，使用搜索框输入关键词，验证结果实时更新且相关。

**Acceptance Scenarios**:

1. **Given** 用户打开市场页面，**When** 查看知识库标签页，**Then** 系统显示所有公开知识库的卡片，包括名称、描述、创建者和文件数量
2. **Given** 用户打开市场页面，**When** 查看 Agent 标签页，**Then** 系统显示所有公开 Agent 的卡片，包括名称、描述、模型和关联知识库数量
3. **Given** 用户在搜索框输入关键词，**When** 停止输入超过300毫秒，**Then** 系统自动搜索并显示匹配结果（搜索范围：名称、描述、系统提示）
4. **Given** 搜索结果过多，**When** 滚动到页面底部，**Then** 系统自动加载下一页结果（分页加载）
5. **Given** 用户点击知识库/Agent 卡片，**When** 导航到详情页，**Then** 显示完整信息（文件列表/Agent配置）和安装按钮

---

### User Story 4 - Agent 一键安装 (Priority: P1)

作为用户，我希望在市场浏览 Agent 时，能够点击"安装"按钮，快速将 Agent 配置复制到我的账户中使用。

**Why this priority**: 这是市场的核心功能 - 让用户能够轻松采用他人分享的配置。

**Independent Test**: 在市场找到一个 Agent，点击安装按钮，验证 Agent 出现在用户的个人 Agent 列表中且配置完整。

**Acceptance Scenarios**:

1. **Given** 用户浏览市场中的 Agent 详情页且该 Agent 不是自己创建的，**When** 点击"安装"按钮，**Then** 系统创建 Agent 副本到用户账户，包括所有配置和知识库关联
2. **Given** 用户已安装过该 Agent，**When** 查看 Agent 详情页，**Then** 按钮显示为"已安装"且不可再次点击
3. **Given** 用户查看自己创建并分享的 Agent，**When** 查看详情页，**Then** 显示"这是你的 Agent"提示，无安装按钮
4. **Given** Agent 关联了多个知识库，**When** 用户安装 Agent，**Then** 系统仅关联用户可访问的知识库（公开知识库或用户自己的知识库）
5. **Given** 安装的 Agent 副本，**When** 用户修改配置，**Then** 不影响原始 Agent，两者完全独立

---

### User Story 5 - 知识库一键安装（引用机制） (Priority: P2)

作为用户，我希望在市场浏览知识库时，能够点击"使用此知识库"按钮，将公开知识库关联到我的 Agent 中。

**Why this priority**: 知识库共享避免重复上传相同内容，提升效率。

**Independent Test**: 在市场找到一个知识库，点击"使用"按钮，创建新 Agent 时能够选择该公开知识库。

**Acceptance Scenarios**:

1. **Given** 用户浏览市场中的知识库详情页且该知识库不是自己创建的，**When** 点击"使用此知识库"按钮，**Then** 系统导航到 Agent 创建页面，该知识库自动添加到关联列表
2. **Given** 用户查看自己创建并分享的知识库，**When** 查看详情页，**Then** 显示"这是你的知识库"提示，无"使用"按钮
3. **Given** 用户创建或编辑 Agent，**When** 选择关联知识库，**Then** 下拉列表包含用户自己的知识库和所有公开知识库
4. **Given** 公开知识库的创建者取消分享或删除知识库，**When** 使用该知识库的 Agent 运行，**Then** 系统自动跳过不可用的知识库，仅使用剩余可用的知识库

---

### User Story 6 - 取消分享知识库 (Priority: P2)

作为知识库创建者，我希望能够取消知识库的市场分享状态，让它重新变为私有，其他用户无法再访问。

**Why this priority**: 创建者需要控制内容的可见性，可能因为内容过时、质量问题或隐私考虑。

**Independent Test**: 分享一个知识库后取消分享，验证市场中不再显示该知识库，但已关联该知识库的 Agent 仍能看到（但标记为私有）。

**Acceptance Scenarios**:

1. **Given** 知识库处于已分享状态，**When** 创建者在详情页点击"取消分享"按钮，**Then** 知识库从市场中移除，其他用户无法搜索或访问
2. **Given** 其他用户的 Agent 已关联该知识库，**When** 创建者取消分享，**Then** 这些 Agent 的知识库列表中该条目显示为"不可用（已取消分享）"
3. **Given** 知识库已取消分享，**When** 创建者在详情页查看，**Then** 按钮恢复为"分享到市场"，可重新分享（保留原分享链接）

---

### User Story 7 - 删除知识库及级联处理 (Priority: P2)

作为知识库创建者，我希望能够完全删除知识库，系统自动清理所有关联的 Agent 配置，避免遗留损坏的引用。

**Why this priority**: 数据完整性和用户体验 - 避免用户遇到损坏的引用链接。

**Independent Test**: 创建知识库并关联到 Agent，删除知识库后验证 Agent 的知识库列表中不再包含该知识库。

**Acceptance Scenarios**:

1. **Given** 用户拥有知识库（无论是否分享），**When** 在详情页点击"删除"按钮并确认，**Then** 知识库及所有文件从系统中永久删除
2. **Given** 该知识库已关联到用户自己的 Agent，**When** 删除知识库，**Then** 所有 Agent 的关联自动移除，Agent 配置保持完整
3. **Given** 该知识库已被其他用户的 Agent 关联（因为之前是公开的），**When** 删除知识库，**Then** 这些 Agent 的关联自动移除，其他用户看到"关联的知识库已被删除"提示
4. **Given** 删除操作正在进行，**When** 用户界面响应，**Then** 显示加载状态，删除完成后从列表中移除该知识库

---

### User Story 8 - 取消分享 Agent (Priority: P2)

作为 Agent 创建者，我希望能够取消 Agent 的市场分享状态，让它重新变为私有，其他用户无法再安装。

**Why this priority**: 创建者需要控制 Agent 的传播，可能因为配置有误或不再维护。

**Independent Test**: 分享一个 Agent 后取消分享，验证市场中不再显示该 Agent，但已安装的用户仍保留副本。

**Acceptance Scenarios**:

1. **Given** Agent 处于已分享状态，**When** 创建者在详情页点击"取消分享"按钮，**Then** Agent 从市场中移除，其他用户无法搜索或安装
2. **Given** 其他用户已安装该 Agent 的副本，**When** 创建者取消分享，**Then** 已安装的副本不受影响，继续正常工作
3. **Given** Agent 已取消分享，**When** 创建者在详情页查看，**Then** 按钮恢复为"分享到市场"，可重新分享（保留原分享链接）

---

### User Story 9 - 删除 Agent (Priority: P2)

作为 Agent 创建者，我希望能够完全删除 Agent 配置，系统确保已安装的用户副本不受影响。

**Why this priority**: 独立副本机制保证了删除原始 Agent 不会破坏用户的工作流程。

**Independent Test**: 分享 Agent 并被其他用户安装，删除原始 Agent 后验证安装的副本仍可正常使用。

**Acceptance Scenarios**:

1. **Given** 用户拥有 Agent（无论是否分享），**When** 在详情页点击"删除"按钮并确认，**Then** Agent 配置从系统中删除
2. **Given** 该 Agent 已被其他用户安装，**When** 删除原始 Agent，**Then** 已安装的副本不受影响，因为它们是独立的实体
3. **Given** Agent 处于分享状态，**When** 删除 Agent，**Then** 系统自动取消分享并删除，市场中不再显示
4. **Given** 删除操作正在进行，**When** 用户界面响应，**Then** 显示加载状态，删除完成后从列表中移除该 Agent

---

### Edge Cases

- **知识库删除时的级联清理**：当删除已分享的知识库时，系统如何高效处理可能数百个 Agent 的关联关系？需要批量操作并考虑性能影响。
- **分享链接冲突**：当生成分享链接（shareSlug）时遇到哈希冲突（极低概率），系统如何处理？需要重试机制。
- **并发安装**：多个用户同时安装同一个 Agent 时，数据库如何保证每个用户都创建独立副本且无竞争条件？
- **孤立的 Agent 副本**：用户安装 Agent 后，原始 Agent 被删除。用户如何知道这个 Agent 来自哪里？是否需要保留原始创建者信息？
- **权限边界**：用户尝试关联他人的私有知识库到 Agent 时（通过 API 直接调用），系统如何拒绝？
- **搜索性能**：市场中有数千个 Agent 和知识库时，搜索响应时间是否仍然可接受（<1秒）？
- **分享状态不一致**：知识库标记为已分享但 shareSlug 为空（数据损坏场景），系统如何恢复或提示？
- **长文件处理**：知识库包含大量文件（>100个）时，详情页加载是否流畅？是否需要分页或虚拟滚动？

## Requirements *(mandatory)*

### Functional Requirements

#### 知识库分享与取消分享

- **FR-001**: 系统必须允许知识库创建者在详情页点击按钮一键分享到市场
- **FR-002**: 系统必须在分享前验证知识库至少包含一个状态为"已完成"的文件
- **FR-003**: 系统必须为每个分享的知识库生成唯一的分享标识符（shareSlug），且保证全局唯一性
- **FR-004**: 系统必须在知识库分享后将其标记为公开（isPublic=true），使其在市场中可见
- **FR-005**: 系统必须允许创建者取消知识库分享，将其状态改为私有（isPublic=false）
- **FR-006**: 系统必须在取消分享后保留原 shareSlug（用于历史追踪），但从市场中移除该知识库
- **FR-007**: 系统必须在知识库详情页显示当前分享状态（已分享/未分享）和对应操作按钮

#### Agent 分享与取消分享

- **FR-008**: 系统必须允许 Agent 创建者在详情页点击按钮一键分享到市场
- **FR-009**: 系统必须在分享前验证 Agent 包含必填字段：名称（name）和默认模型（defaultModel）
- **FR-010**: 系统必须为每个分享的 Agent 生成唯一的分享标识符（shareSlug），且保证全局唯一性
- **FR-011**: 系统必须在 Agent 分享后将其标记为公开（isPublic=true），使其在市场中可见
- **FR-012**: 系统必须允许创建者取消 Agent 分享，将其状态改为私有（isPublic=false）
- **FR-013**: 系统必须在取消分享后保留原 shareSlug，但从市场中移除该 Agent
- **FR-014**: 系统必须在 Agent 详情页显示当前分享状态和对应操作按钮

#### 市场浏览与搜索

- **FR-015**: 系统必须提供市场页面，包含"知识库"和"Agent"两个独立标签页
- **FR-016**: 系统必须在知识库标签页显示所有公开知识库（isPublic=true）的卡片列表
- **FR-017**: 系统必须在 Agent 标签页显示所有公开 Agent（isPublic=true）的卡片列表
- **FR-018**: 系统必须为市场提供搜索功能，实时过滤结果（知识库：名称+描述；Agent：名称+系统提示）
- **FR-019**: 系统必须对搜索输入实施防抖（debounce），延迟300毫秒后发送请求，避免频繁查询
- **FR-020**: 系统必须对市场列表实施分页，每页加载固定数量的项目（例如20个），支持无限滚动或分页按钮
- **FR-021**: 系统必须在卡片上显示关键信息：名称、描述/系统提示、创建者、统计数据（文件数/关联KB数）
- **FR-022**: 系统必须允许用户点击卡片跳转到详情页，显示完整信息

#### Agent 安装机制

- **FR-023**: 系统必须在 Agent 市场详情页提供"安装"按钮，允许用户一键安装
- **FR-024**: 系统必须验证用户不是 Agent 的原始创建者（userId !== sourceAgent.userId），阻止自我安装
- **FR-025**: 系统必须验证用户尚未安装该 Agent（检查 sourceShareSlug），阻止重复安装
- **FR-026**: 系统必须在安装时创建 Agent 的完整副本，包括所有配置字段（名称、模型、系统提示、头像、设置）
- **FR-027**: 系统必须在安装的 Agent 副本中记录原始来源（sourceShareSlug=原始Agent的shareSlug）
- **FR-028**: 系统必须在安装时复制 Agent 的知识库关联关系（chatConfigKnowledgeBases 表），仅关联用户可访问的知识库
- **FR-029**: 系统必须将安装的 Agent 标记为私有（isPublic=false），默认不分享
- **FR-030**: 系统必须在安装成功后更新用户界面，按钮变为"已安装"状态
- **FR-031**: 系统必须检测安装状态，若用户已安装或是原始创建者，则在详情页显示对应状态（已安装/这是你的Agent）

#### 知识库使用机制

- **FR-032**: 系统必须在知识库市场详情页提供"使用此知识库"按钮（针对非原创者）
- **FR-033**: 系统必须允许用户在创建或编辑 Agent 时选择关联的知识库，列表包含：用户自己的知识库 + 所有公开知识库
- **FR-034**: 系统必须验证关联的知识库访问权限，阻止用户关联他人的私有知识库
- **FR-035**: 系统必须在 Agent 运行时自动过滤不可用的知识库（已删除或已取消分享），仅使用可访问的知识库
- **FR-036**: 系统必须在 Agent 的知识库列表中标记不可用的知识库（显示"不可用"提示）

#### 知识库删除与级联清理

- **FR-037**: 系统必须允许知识库创建者完全删除知识库（无论是否已分享）
- **FR-038**: 系统必须在删除知识库时级联删除所有关联的文件记录（knowledgeBaseFiles）和嵌入向量（embeddings）
- **FR-039**: 系统必须在删除知识库时清理云存储（Supabase Storage）中的所有文件
- **FR-040**: 系统必须在删除知识库时移除所有 Agent 的关联关系（chatConfigKnowledgeBases 表中的对应记录）
- **FR-041**: 系统必须在删除知识库时清理聊天会话的可用知识库列表（chatSessions.availableKnowledgeBaseIds JSONB 数组）
- **FR-042**: 系统必须在删除操作完成后从用户界面的知识库列表中移除该项

#### Agent 删除

- **FR-043**: 系统必须允许 Agent 创建者完全删除 Agent 配置（无论是否已分享）
- **FR-044**: 系统必须在删除 Agent 时级联删除所有关联关系（chatConfigKnowledgeBases 表中的记录）
- **FR-045**: 系统必须确保删除原始 Agent 不影响已安装的副本（副本是独立实体，拥有不同的 id 和 userId）
- **FR-046**: 系统必须在 Agent 已分享时，删除前自动取消分享（设置 isPublic=false）
- **FR-047**: 系统必须在删除操作完成后从用户界面的 Agent 列表中移除该项

#### 数据完整性与错误处理

- **FR-048**: 系统必须使用数据库唯一约束（UNIQUE constraint）保证 shareSlug 的全局唯一性
- **FR-049**: 系统必须在生成 shareSlug 遇到冲突时自动重试，直到生成唯一值或达到最大重试次数
- **FR-050**: 系统必须在知识库删除失败时回滚所有操作，保持数据一致性
- **FR-051**: 系统必须在 Agent 安装失败时显示清晰的错误消息（例如："您已安装此 Agent"、"无法安装自己的 Agent"）
- **FR-052**: 系统必须在关联不可用的知识库时（API 调用），返回 403 Forbidden 错误并拒绝操作
- **FR-053**: 系统必须记录所有分享、安装、删除操作的时间戳（createdAt, updatedAt）

#### 缓存与性能

- **FR-054**: 系统必须在分享/取消分享后失效相关缓存：用户知识库列表、市场知识库列表
- **FR-055**: 系统必须在 Agent 分享/取消分享后失效相关缓存：用户 Agent 列表、市场 Agent 列表
- **FR-056**: 系统必须在安装 Agent 后失效用户的 Agent 列表缓存
- **FR-057**: 系统必须在删除知识库/Agent 后失效对应的详情缓存和列表缓存

### Key Entities

- **KnowledgeBase（知识库）**：用户创建的知识集合，包含多个文件。属性：id, userId（创建者）, name, description, isPublic（是否分享）, shareSlug（分享标识符）, starred（收藏状态）, createdAt, updatedAt。关系：拥有多个 KnowledgeBaseFile，可被多个 ChatConfig（Agent）关联。

- **KnowledgeBaseFile（知识库文件）**：知识库中的单个文件。属性：id, knowledgeBaseId, fileName, fileSize, fileType, storagePath（云存储路径）, contentText（文本内容）, status（处理状态：pending/completed/failed）, createdAt, updatedAt。关系：属于一个 KnowledgeBase，拥有多个 Embedding。

- **Embedding（嵌入向量）**：文件的向量表示，用于 RAG 检索。属性：id, knowledgeBaseId, fileId, content（文本片段）, embedding（1536维向量）, metadata（元数据）, createdAt。关系：属于一个 KnowledgeBase 和一个 KnowledgeBaseFile。

- **ChatConfig（Agent 配置）**：用户创建或安装的 AI 助手配置预设。属性：id, userId（所有者）, name, defaultModel, systemPrompt（系统提示）, avatar（头像URL）, webSearchEnabled, isPublic（是否分享）, shareSlug（分享标识符）, sourceShareSlug（来源标识符，标记安装来源）, createdAt, updatedAt。关系：属于一个 User，关联多个 KnowledgeBase（M:N），被多个 ChatSession 使用。

- **ChatConfigKnowledgeBase（Agent-知识库关联）**：多对多关系表。属性：chatConfigId, knowledgeBaseId（复合主键）。关系：连接 ChatConfig 和 KnowledgeBase。

- **Marketplace（市场逻辑实体）**：虚拟实体，通过查询 isPublic=true 的 KnowledgeBase 和 ChatConfig 实现。不是独立表，而是一组查询函数和前端路由的集合。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 知识库创建者能在详情页点击分享按钮，3秒内完成分享操作且市场中立即可见
- **SC-002**: Agent 创建者能在详情页点击分享按钮，3秒内完成分享操作且市场中立即可见
- **SC-003**: 用户在市场页面能在1秒内看到所有公开知识库和 Agent 的列表（首页加载）
- **SC-004**: 用户在市场搜索框输入关键词后，500毫秒内获得匹配结果（防抖后）
- **SC-005**: 用户能在市场浏览 Agent 详情页并点击"安装"按钮，3秒内完成安装且在个人列表中可见
- **SC-006**: 原始创建者删除已分享的知识库后，所有关联该知识库的 Agent（包括其他用户的）在5秒内自动移除关联关系，无损坏引用
- **SC-007**: 原始创建者删除已分享的 Agent 后，已安装该 Agent 的用户副本不受影响，继续正常工作
- **SC-008**: 用户尝试安装自己创建的 Agent 时，系统立即显示"无法安装自己的 Agent"提示，阻止操作
- **SC-009**: 用户尝试重复安装已安装的 Agent 时，按钮显示为"已安装"且不可点击
- **SC-010**: 用户创建或编辑 Agent 时，知识库选择列表在1秒内加载完成，包含个人知识库和所有公开知识库
- **SC-011**: 市场支持至少1000个公开 Agent 和知识库时，搜索响应时间仍在1秒以内
- **SC-012**: 知识库删除操作（包括文件清理和关联移除）在10秒内完成，即使知识库包含100个文件

### Assumptions

1. **分享标识符生成**：使用短 UUID 或可读的 slug 生成算法（如 nanoid），长度8-12字符，碰撞概率极低（<0.0001%）
2. **文件处理状态**：知识库文件的处理状态由现有的文件上传和嵌入向量生成流程管理，本功能仅验证至少一个文件状态为"completed"
3. **云存储清理**：Supabase Storage 的文件删除操作通过现有的存储服务抽象层执行，假设删除 API 可靠且支持批量操作
4. **用户身份验证**：所有分享、安装、删除操作都需要用户登录，由现有的认证中间件（auth middleware）保护
5. **数据库事务**：知识库删除和 Agent 关联移除使用数据库事务保证原子性，失败时自动回滚
6. **缓存策略**：使用 TanStack Query 的缓存失效机制，操作成功后通过 `invalidateQueries` 失效相关缓存键
7. **搜索性能**：数据库对 `name`, `description`, `systemPrompt` 字段建立 GIN 索引（PostgreSQL）或全文索引，支持高效的 ILIKE 查询
8. **分页参数**：市场列表默认每页20条记录，前端通过无限滚动或传统分页按钮触发加载更多
9. **Agent 副本独立性**：安装的 Agent 副本拥有独立的 `id` 和 `userId`，仅通过 `sourceShareSlug` 字段追溯来源，修改副本不影响原始 Agent
10. **知识库访问权限**：Agent 可以关联公开知识库（isPublic=true）或自己创建的私有知识库，系统在查询时自动过滤权限（通过 `validateKnowledgeBaseAccess` 函数）
11. **级联删除**：数据库外键配置为 `ON DELETE CASCADE`，删除知识库时自动删除 `knowledgeBaseFiles` 和 `embeddings`，删除 Agent 时自动删除 `chatConfigKnowledgeBases` 关联
12. **UI 状态管理**：分享、取消分享、安装按钮使用乐观更新（optimistic update），操作失败时回滚并显示错误提示
