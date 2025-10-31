import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Fragment, useEffect, useMemo, useRef } from 'react'
import { Action, Actions } from '@/components/ai-elements/actions'
import { CopyIcon, RefreshCcwIcon, Trash2Icon } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { Response } from '@/components/ai-elements/response'
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources'
import { ChatPromptInput } from '@/components/chat/chat-prompt-input'
import { useChatLogic } from '@/hooks/chat/useChatLogic'
import { useLocalChatLogic } from '@/hooks/chat/useLocalChatLogic'
import { useMode } from '@/contexts/ModeContext'
import { useChatContext } from '@/contexts/ChatContext'
import { honoClient } from '@/lib/hono-client'
import type { UIMessage } from 'ai'
import { localMessagesToUIMessages, type LocalChatMessage } from '@/types'

type LoaderData = {
  messages: UIMessage[]
  chat?: {
    model: string
    webSearchEnabled: boolean
    availableKnowledgeBaseIds: string[]
    availableNoteIds: string[]
  }
}

function RouteComponent() {
  const { chatId } = Route.useParams()
  const navigate = useNavigate()
  const search = Route.useSearch()
  const initialMessageSentRef = useRef(false)

  // 检测当前模式
  const { isPrivateMode } = useMode()

  // 从 ChatContext 获取选中的知识库 ID 和笔记 ID (在 Private Mode 下会自动加载)
  const { selectedKnowledgeBaseIds, selectedNoteIds } = useChatContext()

  // 使用 loader 预加载的数据（Cloud Mode）
  const { messages: initialMessages, chat } = Route.useLoaderData() as LoaderData

  // 根据模式选择聊天逻辑
  const cloudChatLogic = useChatLogic({
    chatId,
    initialMessages,
    resume: false,
    initialModel: search.model ?? chat?.model,
    initialWebSearch: search.webSearch ?? chat?.webSearchEnabled,
    initialKnowledgeBaseIds: chat?.availableKnowledgeBaseIds,
    initialNoteIds: chat?.availableNoteIds,
  })

  // Private Mode: useLocalChatLogic 会在内部通过 IPC 加载消息
  const privateChatLogic = useLocalChatLogic({
    chatId,
    initialModel: search.model,
    knowledgeBaseIds: selectedKnowledgeBaseIds, // 从 ChatContext 获取
    noteIds: selectedNoteIds, // 从 ChatContext 获取
  })

  // 选择当前活跃的聊天逻辑
  const activeChat = isPrivateMode ? privateChatLogic : cloudChatLogic

  // 从活跃的聊天逻辑中提取需要的值
  const {
    input,
    setInput,
    model,
    setModel,
    messages: chatMessages,
    status,
    handleSubmit,
    handleDelete,
    handleRegenerate,
  } = activeChat

  // Private Mode 下的消息需要转换为 UI 格式
  const messages: UIMessage[] = useMemo(() => {
    if (!isPrivateMode) {
      return chatMessages as UIMessage[]
    }

    return localMessagesToUIMessages(chatMessages as LocalChatMessage[])
  }, [chatMessages, isPrivateMode])

  // webSearch 和 isUsingAgent 仅在 Cloud Mode 可用
  const webSearch = isPrivateMode ? false : cloudChatLogic.webSearch
  const setWebSearch = isPrivateMode ? () => {} : cloudChatLogic.setWebSearch
  const isUsingAgent = isPrivateMode ? false : cloudChatLogic.isUsingAgent

  // 计算最后一条助手消息的 ID
  const lastAssistantMessageId = messages
    .slice()
    .reverse()
    .find((m) => m.role === 'assistant')?.id

  // 自动发送初始消息（从 chat.index 传递过来的）
  useEffect(() => {
    if (search.initialMessage && !initialMessageSentRef.current) {
      initialMessageSentRef.current = true

      // 发送消息
      handleSubmit({ text: search.initialMessage })

      // 清除 search params，避免刷新页面重复发送
      void navigate({
        to: `/chat/${chatId}`,
        search: {},
        replace: true,
      })
    }
  }, [search, chatId, handleSubmit, navigate])

  return (
    <div className="relative size-full h-screen">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent className="max-w-4xl mx-auto">
            {messages.map((message) => {
              const sourceParts = message.parts.filter(
                (part) => part.type === 'source-url'
              ) as Array<{ type: 'source-url'; url: string; title?: string }>

              return (
                <div key={message.id}>
                  {message.role === 'assistant' && sourceParts.length > 0 && (
                    <Sources>
                      <SourcesTrigger count={sourceParts.length} />
                      <SourcesContent>
                        {sourceParts.map((part, index) => (
                          <Source
                            href={part.url}
                            key={`${message.id}-source-${index}`}
                            title={part.title ?? part.url}
                          />
                        ))}
                      </SourcesContent>
                    </Sources>
                  )}
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case 'text':
                        return (
                          <Fragment key={`${message.id}-${i}`}>
                            <Message from={message.role}>
                              <MessageContent>
                                <Response>{part.text}</Response>
                              </MessageContent>
                            </Message>

                            <Actions
                              className={`my-2 w-full ${
                                message.role === 'user' ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              {message.role === 'assistant' &&
                                message.id === lastAssistantMessageId && (
                                  <Action
                                    label="Retry"
                                    onClick={() => handleRegenerate(message.id)}
                                  >
                                    <RefreshCcwIcon className="size-3" />
                                  </Action>
                                )}
                              <Action
                                label="Copy"
                                onClick={() => navigator.clipboard.writeText(part.text)}
                              >
                                <CopyIcon className="size-3" />
                              </Action>
                              <Action label="Delete" onClick={() => handleDelete(message.id)}>
                                <Trash2Icon className="size-3" />
                              </Action>
                            </Actions>
                          </Fragment>
                        )
                      default:
                        return null
                    }
                  })}
                </div>
              )
            })}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div className="max-w-5xl w-full mx-auto pb-4 px-4">
          <ChatPromptInput
            input={input}
            setInput={setInput}
            model={model}
            setModel={setModel}
            webSearch={webSearch}
            setWebSearch={setWebSearch}
            status={status}
            isUsingAgent={isUsingAgent}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/chat/$chatId')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      initialMessage: (search.initialMessage as string) ?? undefined,
      model: (search.model as string) ?? undefined,
      webSearch: (search.webSearch as boolean) ?? undefined,
    }
  },
  loader: async ({ params }) => {
    // 检查当前模式（从 localStorage 读取）
    const currentMode = localStorage.getItem('run-mode')

    // Private Mode 下跳过云端请求，直接返回空数据
    // useLocalChatLogic 会通过 IPC 加载本地消息
    if (currentMode === 'private') {
      return {
        messages: [],
        chat: undefined,
      } satisfies LoaderData
    }

    // Cloud Mode: 从后端加载聊天数据
    try {
      const res = await honoClient.api.chat[':id'].$get({ param: { id: params.chatId } })

      // 如果是新聊天（404），返回空消息数组和空配置
      if (res.status === 404) {
        return {
          messages: [],
          chat: undefined,
        } satisfies LoaderData
      }

      if (!res.ok) {
        return {
          messages: [],
          chat: undefined,
        } satisfies LoaderData
      }

      const data = await res.json()

      const messages: UIMessage[] = Array.isArray(data.messages)
        ? (data.messages as any[]).map((message: any) => ({
            id: message.id,
            role: message.role,
            parts: message.parts ?? [],
          }))
        : []

      // 提取聊天配置
      const chat = data.chat
        ? {
            model: data.chat.model as string,
            webSearchEnabled: data.chat.webSearchEnabled as boolean,
            availableKnowledgeBaseIds: (data.chat.availableKnowledgeBaseIds ?? []) as string[],
            availableNoteIds: (data.chat.availableNoteIds ?? []) as string[],
          }
        : undefined

      return {
        messages,
        chat,
      } satisfies LoaderData
    } catch (error) {
      // 网络错误，返回空数据
      return {
        messages: [],
        chat: undefined,
      } satisfies LoaderData
    }
  },
  component: RouteComponent,
})
