import { BarChart3, Boxes, Camera, Home, LayoutGrid, Loader2, Lock, Receipt, Settings, UserSearch, Users, Wallet } from 'lucide-react'
import { createContext, Suspense, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import type { MessageKey } from '@/lib/i18n'
import { hasPin } from '@/lib/pin'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: MessageKey
  icon: typeof Home
  end?: boolean
}

const MAIN: NavItem[] = [
  { to: '/', label: 'nav_home', icon: Home, end: true },
  { to: '/parties', label: 'nav_parties', icon: Users },
  { to: '/bills', label: 'nav_bills', icon: Receipt },
  { to: '/money', label: 'nav_money', icon: Wallet },
]

const EXTRA: NavItem[] = [
  { to: '/stock', label: 'nav_stock', icon: Boxes },
  { to: '/reports', label: 'nav_reports', icon: BarChart3 },
  { to: '/settings', label: 'nav_settings', icon: Settings },
]

const SIDEBAR: NavItem[] = [
  MAIN[0],
  MAIN[1],
  { to: '/lookup', label: 'nav_lookup', icon: UserSearch },
  MAIN[2],
  { to: '/photos', label: 'nav_photos', icon: Camera },
  ...MAIN.slice(3),
  ...EXTRA,
]

const NavDrawerContext = createContext<(() => void) | null>(null)

/** Opens the phone's slide-out menu. Null outside the app shell. */
export function useOpenNav() {
  return useContext(NavDrawerContext)
}

function useNavBadges() {
  const { items, stock, photos } = useData()
  return useMemo(() => {
    const badges = new Map<string, { n: number; tone: 'warn' | 'primary' }>()
    const low = items.filter((i) => !i.archived && (stock.get(i.id) ?? 0) <= i.lowStockAt).length
    if (low) badges.set('/stock', { n: low, tone: 'warn' })
    const toEnter = photos.filter((p) => p.status === 'pending' && !p.voided).length
    if (toEnter) badges.set('/photos', { n: toEnter, tone: 'primary' })
    return badges
  }, [items, stock, photos])
}

function ShopHeader() {
  const { t } = useLocale()
  const { settings } = useData()
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      {settings.logo ? (
        <img src={settings.logo} alt="" className="size-11 rounded-xl bg-white object-contain" />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
          {(settings.shopName || t('app_name')).slice(0, 1)}
        </div>
      )}
      <div className="min-w-0">
        <div className="line-clamp-2 text-lg leading-tight font-semibold break-words">{settings.shopName || t('app_name')}</div>
        <div className="text-sm text-muted-foreground">{t('app_tagline')}</div>
      </div>
    </div>
  )
}

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t, num } = useLocale()
  const badges = useNavBadges()
  return (
    <nav className="flex flex-col gap-1 px-3" aria-label="Main">
      {SIDEBAR.map((item) => {
        const badge = badges.get(item.to)
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            data-testid={`nav-${item.to === '/' ? 'home' : item.to.slice(1)}`}
            className={({ isActive }) =>
              cn(
                'flex h-12 items-center gap-3 rounded-xl px-3 text-lg font-medium transition-colors',
                isActive ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-muted',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
                {badge && (
                  <span
                    className={cn(
                      'tabular min-w-6 rounded-full px-1.5 text-center text-sm font-semibold',
                      isActive ? 'bg-primary-foreground/20' : badge.tone === 'warn' ? 'bg-warn/20 text-warn-strong' : 'bg-primary/12 text-primary',
                    )}
                  >
                    {num(badge.n)}
                  </span>
                )}
              </>
            )}
          </NavLink>
        )
      })}
    </nav>
  )
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { t, num } = useLocale()
  const location = useLocation()
  const photosToEnter = useNavBadges().get('/photos')?.n ?? 0
  const inPhotos = location.pathname.startsWith('/photos')
  const navigationType = useNavigationType()
  useEffect(() => {
    // A new page starts at the top; going back keeps where the user was.
    if (navigationType !== 'POP') window.scrollTo(0, 0)
  }, [location.pathname, navigationType])
  const [navOpen, setNavOpen] = useState(false)
  const inMore = ['/more', '/stock', '/reports', '/settings', '/lookup'].some((p) => location.pathname.startsWith(p))
  const openNav = useMemo(() => () => setNavOpen(true), [])

  return (
    <NavDrawerContext.Provider value={openNav}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r bg-card lg:flex">
          <ShopHeader />
          <SidebarLinks />
        </aside>

        <div className="min-w-0 flex-1">
          {children ?? (
            <Suspense
              fallback={
                <div className="flex min-h-[60dvh] items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          )}
        </div>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-xs gap-0 overflow-y-auto bg-card p-0 pt-[env(safe-area-inset-top)] pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:hidden" data-testid="nav-drawer">
            <SheetTitle className="sr-only">{t('menu')}</SheetTitle>
            <SheetDescription className="sr-only">{t('app_tagline')}</SheetDescription>
            <ShopHeader />
            <SidebarLinks onNavigate={() => setNavOpen(false)} />
            {hasPin() && (
              <div className="mt-3 border-t px-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setNavOpen(false)
                    window.dispatchEvent(new Event('khata:lock'))
                  }}
                  className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-lg font-medium text-foreground/80 hover:bg-muted"
                >
                  <Lock className="size-5" />
                  {t('lock_now')}
                </button>
              </div>
            )}
          </SheetContent>
        </Sheet>

        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden" aria-label="Main">
          <div className="mx-auto grid max-w-xl grid-cols-5">
            {MAIN.map((item) => {
              // Bill photos belong with bills on the phone's bottom bar.
              const photos = item.to === '/bills'
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex h-16 flex-col items-center justify-center gap-0.5 text-[0.8rem] font-medium',
                      isActive || (photos && inPhotos) ? 'text-primary' : 'text-muted-foreground',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn('relative flex h-8 w-14 items-center justify-center rounded-full', (isActive || (photos && inPhotos)) && 'bg-primary/12')}>
                        <item.icon className="size-6" />
                        {photos && photosToEnter > 0 && (
                          <span className="tabular absolute -top-1 right-1 min-w-5 rounded-full bg-primary px-1 text-center text-xs leading-5 font-semibold text-primary-foreground" data-testid="bills-photo-badge">
                            {num(photosToEnter)}
                          </span>
                        )}
                      </span>
                      <span className="max-w-full truncate px-1">{t(item.label)}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
            <NavLink
              to="/more"
              className={cn('flex h-16 flex-col items-center justify-center gap-0.5 text-[0.8rem] font-medium', inMore ? 'text-primary' : 'text-muted-foreground')}
            >
              <span className={cn('flex h-8 w-14 items-center justify-center rounded-full', inMore && 'bg-primary/12')}>
                <LayoutGrid className="size-6" />
              </span>
              <span>{t('nav_more')}</span>
            </NavLink>
          </div>
        </nav>
      </div>
    </NavDrawerContext.Provider>
  )
}

export const EXTRA_NAV = EXTRA
