import { Cloud, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidebarFooter } from '@/components/ui/sidebar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useMode } from '@/contexts/ModeContext'
import { useOllamaSource } from '@/hooks/mode/useOllamaSource'
import { useAlert } from '@/components/ui/alert-provider'
import { useQueryClient } from '@tanstack/react-query'
import { knowledgeBaseKeys } from '@/lib/queryKeys'

/**
 * ModeToggle - 模式切换组件
 *
 * T035: 在右侧边栏添加模式切换按钮，带视觉指示器
 * T036: 实现模式切换确认对话框，显示数据隔离警告（FR-014）
 * T088: 添加模式切换时失效知识库缓存逻辑
 */
export function ModeToggle() {
  const { setMode, isPrivateMode } = useMode()
  const { source, isInitializing } = useOllamaSource()
  const { showAlert } = useAlert()
  const queryClient = useQueryClient()

  // 检查 Ollama 是否可用
  const isOllamaAvailable = source === 'system' || source === 'embedded'

  // 处理模式切换
  const handleModeSwitch = () => {
    const newMode = isPrivateMode ? 'cloud' : 'private'
    setMode(newMode)

    // T088: 失效知识库缓存，确保切换模式后加载正确的数据
    // 失效所有知识库查询（包括列表和详情）
    queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all })

    // 显示模式切换成功的提示
    if (newMode === 'private') {
      showAlert({
        title: (
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span>Switched to Private Mode</span>
          </div>
        ),
        description:
          source === 'system'
            ? 'Using system Ollama. All data stays on your device.'
            : 'Using embedded Ollama. All data stays on your device.',
      })
    } else {
      showAlert({
        title: (
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-blue-600" />
            <span>Switched to Cloud Mode</span>
          </div>
        ),
        description: 'Connected to cloud services.',
      })
    }
  }

  // 禁用逻辑：
  // - 如果当前在 Cloud Mode，且想切换到 Private Mode，但 Ollama 不可用且不在初始化中，则禁用
  // - 如果当前在 Private Mode，可以随时切换回 Cloud Mode
  const shouldDisable = !isPrivateMode && !isOllamaAvailable && !isInitializing

  const buttonContent = (
    <Button
      variant="ghost"
      disabled={shouldDisable}
      className={
        isPrivateMode
          ? 'text-green-800 w-full justify-start'
          : 'text-secondary-foreground w-full justify-start'
      }
    >
      {isPrivateMode ? (
        <>
          <ShieldCheck className="size-4 mr-2" />
          <span className="flex-1 text-left">Private Mode</span>
        </>
      ) : (
        <>
          <Cloud className="size-4 mr-2" />
          <span className="flex-1 text-left">Cloud Mode</span>
        </>
      )}
    </Button>
  )

  return (
    <SidebarFooter className="border-sidebar-border border-t">
      <AlertDialog>
        <AlertDialogTrigger asChild>{buttonContent}</AlertDialogTrigger>
        <AlertDialogContent>
          {isPrivateMode ? (
            <AlertDialogHeader>
              <AlertDialogTitle>Switch to Cloud Mode?</AlertDialogTitle>
              <AlertDialogDescription>
                This will send your data to the cloud for processing. Please ensure you are
                comfortable with this before proceeding.
              </AlertDialogDescription>
            </AlertDialogHeader>
          ) : (
            <AlertDialogHeader>
              <AlertDialogTitle>Switch to Private Mode?</AlertDialogTitle>
              <AlertDialogDescription>
                This will stop sending your data to the cloud and process everything locally on
                your device.
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleModeSwitch}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarFooter>
  )
}
