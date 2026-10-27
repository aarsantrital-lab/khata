import { ChevronRight, Copy, MapPin, MessageCircle, Phone, Receipt, Search, UserSearch, X } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Balance, StatusBadge } from '@/components/Amount'
import { EmptyState } from '@/components/Field'
import { Page } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { lookupParties, type LookupResult } from '@/lib/lookup'
import { copyText, whatsappLink } from '@/lib/share'
import { cn } from '@/lib/utils'

export function Lookup() {
  const { t } = useLocale()
  const { parties, bills } = useData()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const deferred = useDeferredValue(q)
  const results = useMemo(() => lookupParties(deferred, parties, bills), [deferred, parties, bills])

  const update = (v: string) => {
    setQ(v)
    setParams(v ? { q: v } : {}, { replace: true })
  }

  return (
    <Page title={t('nav_lookup')}>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3.5 size-6 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-14 pr-12 pl-12 text-xl"
            autoFocus
            value={q}
            onChange={(e) => update(e.target.value)}
            placeholder={t('lookup_placeholder')}
            aria-label={t('lookup_placeholder')}
            autoComplete="off"
            spellCheck={false}
            data-testid="lookup-input"
          />
          {q && (
            <Button variant="ghost" size="icon" className="absolute top-1/2 right-2 -translate-y-1/2" aria-label={t('clear')} onClick={() => update('')}>
              <X />
            </Button>
          )}
        </div>

        {!q.trim() ? (
          <EmptyState icon={<UserSearch />} title={`${t('lookup_hint')} ${t('lookup_start')}`} />
        ) : results.length === 0 ? (
          <EmptyState icon={<UserSearch />} title={t('lookup_empty', { q: q.trim() })} />
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((r) => (
              <LookupCard key={r.party.id} result={r} />
            ))}
          </div>
        )}
      </div>
    </Page>
  )
}

function LookupCard({ result }: { result: LookupResult }) {
  const { t, money, date, digitsOf, num } = useLocale()
  const { ledgers } = useData()
  const { party, matchedOn, billPan } = result
  const ledger = ledgers.get(party.id)
  const open = (ledger?.docs ?? []).filter((d) => d.status !== 'paid' && d.remaining > 0).sort((a, b) => a.date.localeCompare(b.date))
  const lastBill = (ledger?.docs ?? [])
    .filter((d) => d.kind === 'bill' && d.bill)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.bill!.createdAt - a.bill!.createdAt))[0]

  const copy = async (text: string) => {
    if (await copyText(text)) toast.success(t('copied'))
    else toast.error(t('err_generic'))
  }

  const highlight = (field: LookupResult['matchedOn']) => (matchedOn === field ? 'bg-primary/10 ring-1 ring-primary/30' : '')

  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs" data-testid="lookup-result">
      <Link to={`/parties/${party.id}`} className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-semibold text-secondary-foreground">
          {party.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn('line-clamp-2 rounded-md text-xl leading-tight font-semibold break-words', highlight('name'))}>{party.name}</div>
          <div className="text-sm text-muted-foreground">{party.type === 'customer' ? t('customer') : t('supplier')}</div>
        </div>
        <Balance value={ledger?.balance ?? 0} />
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Link>

      <dl className="grid gap-2 sm:grid-cols-2">
        <div className={cn('flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2', highlight('pan'))}>
          <dt className="shrink-0 text-sm text-muted-foreground">{t('pan')}</dt>
          <dd className="tabular min-w-0 flex-1 truncate text-lg font-semibold" data-testid="lookup-pan">
            {party.pan ? digitsOf(party.pan) : <span className="text-base font-normal text-muted-foreground">{t('no_pan')}</span>}
          </dd>
          {party.pan && (
            <Button variant="ghost" size="icon" aria-label={t('copy_pan')} onClick={() => copy(party.pan)} data-testid="copy-pan">
              <Copy />
            </Button>
          )}
        </div>
        <div className={cn('flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2', highlight('phone'))}>
          <dt className="shrink-0 text-sm text-muted-foreground">{t('phone')}</dt>
          <dd className="tabular min-w-0 flex-1 truncate text-lg font-semibold" data-testid="lookup-phone">
            {party.phone ? digitsOf(party.phone) : <span className="text-base font-normal text-muted-foreground">—</span>}
          </dd>
          {party.phone && (
            <Button variant="ghost" size="icon" aria-label={t('copy_phone')} onClick={() => copy(party.phone)}>
              <Copy />
            </Button>
          )}
        </div>
        {party.address && (
          <div className={cn('flex items-center gap-2 rounded-xl px-3 py-1 text-muted-foreground sm:col-span-2', highlight('address'))}>
            <MapPin className="size-4 shrink-0" />
            <dd className="truncate">{party.address}</dd>
          </div>
        )}
        {matchedOn === 'bill_pan' && billPan && (
          <p className="rounded-xl bg-warn/10 px-3 py-2 text-sm font-medium text-warn-strong sm:col-span-2">{t('pan_on_bill', { pan: digitsOf(billPan) })}</p>
        )}
      </dl>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('lookup_open_bills')}</h3>
          {open.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('lookup_no_open_bills')}</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {open.slice(0, 3).map((d) => (
                <li key={d.id}>
                  <Link to={d.bill ? `/bills/${d.bill.id}` : `/parties/${party.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted">
                    <span className="min-w-0 truncate">
                      {d.kind === 'opening' ? t('opening_entry') : `${t('bill_no')} ${digitsOf(d.bill?.billNo ?? '')}`}
                      <span className="text-sm text-muted-foreground"> · {date(d.date, 'short')}</span>
                    </span>
                    <span className="tabular shrink-0 font-semibold">{money(d.remaining)}</span>
                  </Link>
                </li>
              ))}
              {open.length > 3 && <li className="px-3 py-1.5 text-sm text-muted-foreground">{t('more_open_bills', { n: num(open.length - 3) })}</li>}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('last_bill')}</h3>
          {lastBill?.bill ? (
            <Link to={`/bills/${lastBill.bill.id}`} className="flex items-center gap-2 rounded-xl border px-3 py-2 hover:bg-muted" data-testid="lookup-last-bill">
              <Receipt className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {t('bill_no')} {digitsOf(lastBill.bill.billNo)}
                <span className="text-sm text-muted-foreground"> · {date(lastBill.date, 'short')}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className="tabular font-semibold">{money(lastBill.total)}</span>
                <StatusBadge status={lastBill.status} className="text-xs" />
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{t('no_bills')}</p>
          )}
        </div>
      </div>

      {party.phone && (
        <div className="grid grid-cols-2 gap-2">
          <Button size="touch" variant="outline" render={<a href={`tel:${party.phone.replace(/[^\d+]/g, '')}`} />} nativeButton={false}>
            <Phone />
            {t('call')}
          </Button>
          <Button size="touch" variant="outline" render={<a href={whatsappLink(party.phone, '')} target="_blank" rel="noreferrer" />} nativeButton={false}>
            <MessageCircle />
            {t('whatsapp')}
          </Button>
        </div>
      )}
    </article>
  )
}
