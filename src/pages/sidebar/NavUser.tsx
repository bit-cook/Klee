import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, DialogContent } from '@/components/ui/dialog'
import supabase from '@/lib/supabase'
import { CircleUserRound, Settings, LogOut, LogIn } from 'lucide-react'
import Account from '@/pages/setting/Account'
import CreateAccount from '@/pages/setting/CreateAccount'
import { useUser } from '@/lib/supabase/hooks'
import { Badge } from '@/components/ui/badge'
import { useNavigate } from 'react-router-dom'
import { EnumRouterLink } from '@/constants/paths'
import { useIsSettingOpen, useSettingTab } from '@/hooks/use-config'
import { useTranslation } from 'react-i18next'
import { SettingsTab } from '@/constants/settings'
import { toast } from 'sonner'

const getInitial = (str: string | null | undefined) => {
  if (str && typeof str === 'string' && str.length > 0) {
    return str.charAt(0).toUpperCase()
  }
  return null
}

export default function NavUser() {
  const user = useUser()
  const navigate = useNavigate()
  // const [, setIsIntro] = useIsIntro()
  const { t } = useTranslation()
  const [, setIsSettingOpen] = useIsSettingOpen()
  const [, setActiveTab] = useSettingTab()

  const handleLogout = () => {
    if (!supabase) {
      toast.error('Supabase is not initialized')
      return
    }
    supabase.auth.signOut()
  }

  const handleOnBoarding = () => {
    // setIsIntro(true)
    navigate(EnumRouterLink.LanguageSelection)
  }

  const handleOpenSetting = () => {
    setActiveTab(SettingsTab.General)
    setIsSettingOpen(true)
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem className="cursor-pointer">
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="flex w-full justify-center">
              <div className="mb-2">
                {user ? (
                  <Avatar className="h-8 w-8 rounded-lg shadow-lg">
                    <AvatarImage src={user.user_metadata.avatar_url} alt={user.user_metadata.name} />
                    <AvatarFallback className="rounded-lg">
                      {getInitial(user.user_metadata.name) || getInitial(user.user_metadata.email) || '?'}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <Button variant="ghost" size="icon" className="hover:bg-primary/10">
                    <CircleUserRound strokeWidth={1.5} className="text-muted-foreground" />
                  </Button>
                )}
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="flex flex-col rounded-lg" side="right" align="end" sideOffset={4}>
              {user && (
                <>
                  <DropdownMenuLabel className="p-0 font-normal">
                    <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src={user.user_metadata.avatar_url} alt={user.user_metadata.name} />
                        <AvatarFallback>
                          {getInitial(user.user_metadata.name) || getInitial(user.user_metadata.email) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left text-sm leading-tight">
                        <span className="truncate font-semibold">{user.user_metadata.name}</span>
                        <span className="truncate text-xs">{user.email}</span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                </>
              )}
              {user && (
                <>
                  <Dialog>
                    <DialogTrigger className="w-full" asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2 text-sm font-normal">
                        <CircleUserRound className="h-4 w-4" />
                        {t('account.title')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-5xl">
                      <Account />
                    </DialogContent>
                  </Dialog>
                  <DropdownMenuSeparator />
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 px-2 text-sm font-normal"
                onClick={handleOpenSetting}
              >
                <Settings className="h-4 w-4" />
                {t('settings.title')}
              </Button>
              {import.meta.env.DEV && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-auto justify-start gap-2 px-2 text-sm font-normal"
                  onClick={handleOnBoarding}
                >
                  {t('onboarding.title')}
                  <Badge>Dev</Badge>
                </Button>
              )}
              {import.meta.env.DEV && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-auto justify-start gap-2 px-2 text-sm font-normal"
                  onClick={() => {
                    window.ipcRenderer.invoke('quit-and-install')
                  }}
                >
                  Quit and Restart
                  <Badge>Dev</Badge>
                </Button>
              )}
              <DropdownMenuSeparator />
              {user ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 px-2 text-sm font-normal"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  {t('logout.title')}
                </Button>
              ) : supabase ? (
                <Dialog>
                  <DialogTrigger className="w-full" asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-start gap-2 px-2 text-sm font-normal">
                      <LogIn className="h-4 w-4" />
                      {t('login.title')}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-3xl">
                    <CreateAccount />
                  </DialogContent>
                </Dialog>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}
