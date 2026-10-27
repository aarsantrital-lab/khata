import { Camera, Plus, Receipt, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Amount, StatusBadge } from '@/components/Amount'
import { EmptyState, Segmented } from '@/components/Field'
import { Page } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { matches } from '@/lib/search'
import { findBillState, type BillStatus, type DocState } from '@/lib/ledger'
import { cn } from '@/lib/utils'

type Tab = 'sale' | 'purchase' | 'returns'

export function Bills() {
  const { t, date, money, digitsOf } = useLocale()
  const { bills, ledgers, photos } = useData()
  const photosToEnter = photos.filter((p) => p.status === 'pending' && !p.voided).length
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = (params.get('tab') as Tab) || 'sale'
  const [status, setStatus] = useState<'all' | BillStatus>('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(50)

  const rows = useMemo(() => {
    return bills
      .filter((b) => (tab === 'returns' ? b.kind === 'sale_return' || b.kind === 'purchase_return' : b.kind === tab))
      .filter((b) => matches(q, b.billNo, b.partyName))
      .map((b) => ({ bill: b, state: findBillState(ledgers.get(b.partyId), b.id) as DocState | undefined }))
      .filter((r) => status === 'all' || (!r.bill.voided && r.state && 'status' in r.state && r.state.status === status))
      .sort((a, b) => b.bill.date.localeCompare(a.bill.date) || b.bill.createdAt - a.bill.createdAt)
  }, [bills, tab, q, status, ledgers])

  return (
    <Page
      title={t('nav_bills')}
      actions={
        <>
          <Button variant="outline" className="relative" onClick={() => navigate('/photos')} aria-label={t('nav_photos')} data-testid="open-photos">
            <Camera />
            <span className="hidden sm:inline">{t('nav_photos')}</span>
            {photosToEnter > 0 && (
              <span className="tabular min-w-5 rounded-full bg-primary px-1 text-center text-xs leading-5 font-semibold text-primary-foreground">{digitsOf(String(photosToEnter))}</span>
            )}
          </Button>
          {tab !== 'returns' && (
            <Button onClick={() => navigate(`/bills/new/${tab}`)} data-testid="new-bill">
              <Plus />
              <span className="hidden sm:inline">{tab === 'sale' ? t('new_sale') : t('new_purchase')}</span>
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          size="lg"
          value={tab}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
          options={[
            { value: 'sale', label: t('sales') },
            { value: 'purchase', label: t('purchases') },
            { value: 'returns', label: t('returns') },
          ]}
        />
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" placeholder={t('search_bills')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {tab !== 'returns' && (
          <div className="flex gap-2 overflow-x-auto">
            {(['all', 'unpaid', 'partial', 'paid'] as const).map((s) => (
              <Button key={s} variant={status === s ? 'default' : 'outline'} onClick={() => setStatus(s)} className="shrink-0">
                {s === 'all' ? t('all') : t(`status_${s}`)}
              </Button>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title={t('no_bills')}
            action={
              tab !== 'returns' && (
                <Button size="touch" onClick={() => navigate(`/bills/new/${tab}`)}>
                  <Plus />
                  {tab === 'sale' ? t('new_sale') : t('new_purchase')}
                </Button>
              )
            }
          />
        ) : (
          <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {rows.slice(0, limit).map(({ bill, state }) => (
              <Link key={bill.id} to={`/bills/${bill.id}`} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted', bill.voided && 'opacity-60')} data-testid="bill-row">
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-lg font-semibold', bill.voided && 'line-through')}>{bill.partyName}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {t('bill_no')} {digitsOf(bill.billNo)} · {date(bill.date)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Amount value={bill.totals.total} className="text-lg font-semibold" />
                  {bill.voided ? (
                    <StatusBadge cancelled />
                  ) : state && 'status' in state ? (
                    state.status === 'partial' ? (
                      <span className="text-sm font-semibold text-warn-strong">{t('partial_remaining', { amount: money(state.remaining) })}</span>
                    ) : (
                      <StatusBadge status={state.status} />
                    )
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        )}
        {rows.length > limit && (
          <Button variant="outline" size="touch" onClick={() => setLimit((l) => l + 50)}>
            {t('more')}
          </Button>
        )}
      </div>
    </Page>
  )
}
