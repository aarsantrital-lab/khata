import { ChevronRight, Phone, Plus, Search, UserSearch, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Balance } from '@/components/Amount'
import { EmptyState, Segmented } from '@/components/Field'
import { Page } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { matches } from '@/lib/search'
import { todayIso } from '@/lib/bsdate'
import { overdueParties } from '@/lib/ledger'
import type { PartyType } from '@/lib/types'
import { cn } from '@/lib/utils'

export function Parties() {
  const { t, money, num, digitsOf } = useLocale()
  const { parties, ledgers } = useData()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const tab = (params.get('tab') as PartyType) || 'customer'
  const onlyOverdue = params.get('filter') === 'overdue'
  const [q, setQ] = useState('')

  const overdue = useMemo(() => new Map(overdueParties(parties, ledgers, todayIso()).map((o) => [o.party.id, o])), [parties, ledgers])
  const list = useMemo(() => {
    const rows = parties.filter(
      (p) => p.type === tab && !p.archived && matches(q, p.name, p.phone, p.pan, p.address) && (!onlyOverdue || overdue.has(p.id)),
    )
    return rows.sort((a, b) => {
      const oa = overdue.has(a.id) ? 1 : 0
      const ob = overdue.has(b.id) ? 1 : 0
      if (oa !== ob) return ob - oa
      return Math.abs(ledgers.get(b.id)?.balance ?? 0) - Math.abs(ledgers.get(a.id)?.balance ?? 0)
    })
  }, [parties, tab, q, onlyOverdue, overdue, ledgers])

  const total = useMemo(
    () => parties.filter((p) => p.type === tab).reduce((s, p) => s + (ledgers.get(p.id)?.balance ?? 0), 0),
    [parties, tab, ledgers],
  )

  const setTab = (v: PartyType) => setParams({ tab: v }, { replace: true })

  return (
    <Page
      title={t('nav_parties')}
      actions={
        <>
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label={t('nav_lookup')}
            onClick={() => navigate(q ? `/lookup?q=${encodeURIComponent(q)}` : '/lookup')}
            data-testid="open-lookup"
          >
            <UserSearch />
          </Button>
          <Button onClick={() => navigate(`/parties/new?type=${tab}`)} data-testid="add-party">
            <Plus />
            <span className="hidden sm:inline">{tab === 'customer' ? t('new_customer') : t('new_supplier')}</span>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          name="party type"
          size="lg"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'customer', label: t('customers') },
            { value: 'supplier', label: t('suppliers') },
          ]}
        />
        <div className={cn('flex items-center justify-between rounded-2xl p-4', tab === 'customer' ? 'bg-good/10' : 'bg-bad/8')}>
          <span className="text-lg font-medium">{tab === 'customer' ? t('to_receive') : t('to_pay')}</span>
          <span className={cn('tabular text-2xl font-bold', tab === 'customer' ? 'text-good' : 'text-bad')}>
            {money(Math.abs(total))}
          </span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" placeholder={t('search_parties')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {tab === 'customer' && overdue.size > 0 && (
            <Button
              variant={onlyOverdue ? 'default' : 'outline'}
              size="touch"
              className={cn(!onlyOverdue && 'border-bad/40 text-bad')}
              onClick={() => setParams(onlyOverdue ? { tab } : { tab, filter: 'overdue' }, { replace: true })}
            >
              {t('overdue_parties')} ({num(overdue.size)})
            </Button>
          )}
        </div>

        {list.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={q ? t('nothing_yet') : tab === 'customer' ? t('no_customers') : t('no_suppliers')}
            action={
              <Button size="touch" onClick={() => navigate(`/parties/new?type=${tab}`)}>
                <Plus />
                {tab === 'customer' ? t('new_customer') : t('new_supplier')}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {list.map((p) => {
              const o = overdue.get(p.id)
              return (
                <Link
                  key={p.id}
                  to={`/parties/${p.id}`}
                  className={cn('flex items-center gap-3 px-4 py-3.5 hover:bg-muted', o && 'border-l-4 border-l-bad bg-bad/5')}
                  data-testid="party-row"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold text-secondary-foreground">
                    {p.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{p.name}</div>
                    <div className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                      {o ? (
                        <span className="font-medium text-bad">{t('overdue_days', { n: num(o.daysOverdue) })}</span>
                      ) : (
                        p.phone && (
                          <>
                            <Phone className="size-3.5" />
                            {digitsOf(p.phone)}
                          </>
                        )
                      )}
                    </div>
                  </div>
                  <Balance value={ledgers.get(p.id)?.balance ?? 0} />
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </Page>
  )
}
