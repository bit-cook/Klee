# 快速开始：侧边栏导航选中状态

**功能分支**: `003-sidebar-selection-fix`
**创建时间**: 2025-10-19

## 功能概述

为侧边栏二级导航（聊天列表、笔记列表、知识库列表、市场列表）添加活动状态视觉反馈，让用户清晰识别当前正在查看的项目。

## 前置条件

- ✅ 已安装依赖: `npm install`
- ✅ 开发服务器运行: `npm run dev`
- ✅ 熟悉 TanStack Router 和 React Hooks

## 核心概念

### 活动状态检测

使用 TanStack Router 的 `useLocation()` 钩子获取当前 URL，通过比较 URL 参数与列表项 ID 来确定活动项目。

```typescript
import { useLocation } from '@tanstack/react-router'

const location = useLocation()
// location.pathname = '/chat/abc123'

const activeChatId = location.pathname.split('/chat/')[1] // 'abc123'
```

### 样式应用

使用现有的 ShadCN UI `SidebarMenuButton` 组件的 `isActive` prop:

```typescript
<SidebarMenuButton asChild isActive={item.isActive}>
  <Link to={item.url}>
    {item.name}
  </Link>
</SidebarMenuButton>
```

## 实施步骤

### 步骤 1: 创建自定义钩子（5 分钟）

**文件**: `client/src/hooks/useActiveNavItem.ts`

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

  // 从 URL 中提取 ID（例如 '/chat/abc123' -> 'abc123'）
  const activeId = location.pathname.split(`${routePrefix}/`)[1]

  return items.map((item) => ({
    ...item,
    isActive: item.id === activeId,
  }))
}
```

### 步骤 2: 更新聊天列表（10 分钟）

**文件**: `client/src/components/layout/sidebar-left/chat-list.tsx`

**修改前**:
```typescript
export function ChatList({ chat }: ChatListProps) {
  // ... 现有代码 ...

  return (
    <SidebarMenu>
      {chatItems.map((item) => (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton asChild>
            <Link to={item.url}>{item.name}</Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
```

**修改后**:
```typescript
import { useActiveNavItem } from '@/hooks/useActiveNavItem'

export function ChatList({ chat }: ChatListProps) {
  // 应用活动状态检测
  const chatItemsWithActive = useActiveNavItem(chatItems, '/chat')

  return (
    <SidebarMenu>
      {chatItemsWithActive.map((item) => (
        <SidebarMenuItem key={item.id}>
          <SidebarMenuButton asChild isActive={item.isActive}>
            <Link to={item.url}>{item.name}</Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
```

**关键变更**:
1. 导入 `useActiveNavItem` 钩子
2. 用钩子包装 `chatItems`，传入路由前缀 `'/chat'`
3. 添加 `isActive={item.isActive}` prop 到 `SidebarMenuButton`

### 步骤 3: 更新其他三个列表（15 分钟）

**笔记列表** (`note-list.tsx`):
```typescript
const noteItemsWithActive = useActiveNavItem(noteItems, '/note')
```

**知识库列表** (`knowledge-base-list.tsx`):
```typescript
const kbItemsWithActive = useActiveNavItem(knowledgeBaseItems, '/knowledge-base')
```

**市场列表** (`marketplace-list.tsx`):
```typescript
const agentItemsWithActive = useActiveNavItem(agentItems, '/marketplace/agent')
```

### 步骤 4: 测试验证（10 分钟）

#### 手动测试检查清单

1. **基本功能**:
   - [ ] 点击聊天列表中的项目，该项目高亮显示
   - [ ] 点击另一个聊天，高亮切换到新项目
   - [ ] 高亮样式清晰可见（背景色/边框变化）

2. **浏览器导航**:
   - [ ] 点击浏览器后退按钮，活动状态正确切换
   - [ ] 点击浏览器前进按钮，活动状态正确切换

3. **页面刷新**:
   - [ ] 在聊天详情页刷新，聊天列表中对应项目仍然高亮
   - [ ] 直接在地址栏输入 URL（例如 `/chat/abc123`），活动状态正确

4. **跨区域一致性**:
   - [ ] 在笔记列表中点击项目，活动状态表现与聊天列表一致
   - [ ] 在知识库列表中点击项目，活动状态表现与聊天列表一致
   - [ ] 在市场列表中点击项目，活动状态表现与聊天列表一致

5. **边缘情况**:
   - [ ] 空列表时不报错（例如新用户无聊天记录）
   - [ ] 导航到不存在的 ID（例如已删除的聊天），无项目高亮（符合预期）

## 代码结构

```
client/src/
├── hooks/
│   └── useActiveNavItem.ts          # 新增：活动状态检测钩子
│
└── components/layout/sidebar-left/
    ├── chat-list.tsx                # 修改：应用钩子
    ├── note-list.tsx                # 修改：应用钩子
    ├── knowledge-base-list.tsx      # 修改：应用钩子
    └── marketplace-list.tsx         # 修改：应用钩子
```

## 类型安全

TypeScript 会自动推断所有类型，无需手动定义：

```typescript
// ✅ 类型自动推断
const chatItemsWithActive = useActiveNavItem(chatItems, '/chat')
// 类型: Array<ChatItem & { isActive: boolean }>

// ❌ 不要手动定义类型
const chatItemsWithActive: Array<ChatItem & { isActive: boolean }> = ...
```

## 常见问题

### Q: 为什么使用 `useLocation()` 而不是 `useMatchRoute()`？

**A**: `useLocation()` 更简单直观，且与现有代码风格一致（见 `nav-main.tsx`）。`useMatchRoute()` 需要为每个路由定义匹配器，代码冗长且无明显优势。

### Q: 活动状态更新会不会导致性能问题？

**A**: 不会。`useLocation()` 仅在路由变化时触发更新，活动状态计算成本极低（字符串比较），实测性能远优于 100ms 目标。

### Q: 如果用户快速点击多个项目会怎样？

**A**: TanStack Router 会自动取消未完成的导航，最终状态始终与最后一次点击一致，无视觉故障。

### Q: 为什么不使用 React Context 共享活动状态？

**A**: URL 已经是全局状态的单一来源，使用 Context 会引入不必要的复杂性。`useLocation()` 直接从 Router 读取 URL，更符合单向数据流原则。

## 后续优化（可选）

- **无障碍性增强**: 为活动项目添加 `aria-current="page"` 属性
- **动画过渡**: 使用 CSS transition 平滑切换高亮状态
- **键盘导航**: 支持 Arrow Keys 在列表项之间移动焦点

## 相关文档

- [研究文档](./research.md) - 技术决策详细说明
- [实施计划](./plan.md) - 完整项目计划
- [规格说明](./spec.md) - 功能需求和验收标准
- [TanStack Router 官方文档](https://tanstack.com/router/latest/docs/framework/react/guide/navigation)
