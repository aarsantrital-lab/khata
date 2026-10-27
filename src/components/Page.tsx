import { ArrowLeft, Menu } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/app/locale'
import { cn } from '@/lib/utils'
import { useOpenNav } from './AppShell'
import { SyncIndicator } from './SyncIndicator'

export function Page({
  title,
  back,
  actions,
  children,
  className,
  wide,
}: {
  title: ReactNode
  /** true = browser back, string = go to that path */
  back?: boolean | string
  actions?: ReactNode
  children: ReactNode
  className?: string
  wide?: boolean
}) {
  const navigate = useNavigate()
  const openNav = useOpenNav()
  const { t } = useLocale()
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className={cn('mx-auto flex h-16 w-full items-center gap-2 px-3 lg:px-6', wide ? 'max-w-6xl' : 'max-w-4xl')}>
          {!back && openNav && (
            <Button variant="ghost" size="icon-touch" className="-ml-1 lg:hidden" aria-label={t('open_menu')} onClick={openNav} data-testid="menu-button">
              <Menu />
            </Button>
          )}
          {back && (
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label={t('back')}
              onClick={() => {
                if (typeof back === 'string') navigate(back)
                else if (window.history.length > 1) navigate(-1)
                else navigate('/')
              }}
            >
              <ArrowLeft />
            </Button>
          )}
          <h1 className="min-w-0 flex-1 truncate text-xl font-semibold lg:text-2xl">{title}</h1>
          <div className="flex items-center gap-1.5">
            {actions}
            <SyncIndicator />
          </div>
        </div>
      </header>
      <main className={cn('page-enter mx-auto w-full flex-1 px-3 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:px-6 lg:pb-10', wide ? 'max-w-6xl' : 'max-w-4xl', className)}>
        {children}
      </main>
    </div>
  )
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Panel({ children, className, ...rest }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-2xl border bg-card p-4 shadow-xs', className)} {...rest}>
      {children}
    </div>
  )
}

/** Sticky bottom action bar for forms, above the mobile nav (which grows by the iPhone home-bar inset). */
export function FormActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 -mx-3 mt-2 border-t bg-background/95 px-3 py-3 backdrop-blur lg:bottom-0 lg:mx-0 lg:rounded-2xl lg:border lg:px-4">
      <div className="flex gap-2 [&>*]:flex-1">{children}</div>
    </div>
  )
}
