import { BarChart3, Boxes, Camera, ChevronRight, Lock, Settings, UserSearch } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Page } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { hasPin } from '@/lib/pin'

export function More() {
  const { t, num } = useLocale()
  const { items, stock, photos } = useData()
  const low = items.filter((i) => !i.archived && (stock.get(i.id) ?? 0) <= i.lowStockAt).length
  const toEnter = photos.filter((p) => p.status === 'pending' && !p.voided).length

  const links = [
    { to: '/lookup', icon: UserSearch, label: t('nav_lookup'), sub: t('lookup_placeholder') },
    { to: '/photos', icon: Camera, label: t('nav_photos'), sub: toEnter === 1 ? t('photos_pending_one', { n: num(1) }) : toEnter ? t('photos_pending', { n: num(toEnter) }) : t('take_photo'), warn: toEnter > 0 },
    { to: '/stock', icon: Boxes, label: t('nav_stock'), sub: low ? `${t('low_stock')}: ${num(low)}` : t('stock_items'), warn: low > 0 },
    { to: '/reports', icon: BarChart3, label: t('nav_reports'), sub: `${t('summary')} · ${t('vat')} · ${t('books_short')}` },
    { to: '/settings', icon: Settings, label: t('nav_settings'), sub: `${t('shop_details')} · ${t('backup')} · ${t('sync')}` },
  ]

  return (
    <Page title={t('nav_more')}>
      <div className="flex flex-col gap-3">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-xs hover:border-primary/40" data-testid={`more-${l.to.slice(1)}`}>
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <l.icon className="size-7" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-xl font-semibold">{l.label}</span>
              <span className={l.warn ? 'text-sm font-medium text-warn' : 'truncate text-sm text-muted-foreground'}>{l.sub}</span>
            </span>
            <ChevronRight className="size-6 text-muted-foreground" />
          </Link>
        ))}
        {hasPin() && (
          <Button size="xl" variant="outline" className="mt-2" onClick={() => window.dispatchEvent(new Event('khata:lock'))}>
            <Lock />
            {t('lock_now')}
          </Button>
        )}
      </div>
    </Page>
  )
}
