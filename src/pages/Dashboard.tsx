import { AlertTriangle, ArrowDownLeft, ArrowUpRight, BarChart3, Camera, ChevronRight, Landmark, PackageMinus, Receipt, ShoppingCart, Wallet } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TrendArrow } from '@/components/Amount'
import { Page, Section } from '@/components/Page'
import { ACCOUNT_ICONS } from '@/components/Pickers'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { addDays, adToBs, bsMonthRange, bsToAd, shiftBsMonth, todayIso, BS_MONTHS, monthKey } from '@/lib/bsdate'
import { accountBalances, computeAllLedgers, overdueParties, receivablePayable, trend, vatByMonth, type Trend } from '@/lib/ledger'
import { WALLET_TYPES } from '@/lib/accounts'
import { saveSettings } from '@/lib/repo'
import type { AccountType, Bill, MoneyEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

function salesOn(bills: Bill[], from: string, to: string) {
  let total = 0
  for (const b of bills) {
    if (b.voided || b.date < from || b.date > to) continue
    if (b.kind === 'sale') total += b.totals.total
    else if (b.kind === 'sale_return') total -= b.totals.total
  }
  return total
}

function expensesOn(entries: MoneyEntry[], from: string, to: string) {
  return entries.filter((e) => !e.voided && e.type === 'expense' && e.date >= from && e.date <= to).reduce((s, e) => s + e.amount, 0)
}

export function Dashboard() {
  const data = useData()
  const { t, money, num, digitsOf, lang, date } = useLocale()
  const navigate = useNavigate()
  const [payOpen, setPayOpen] = useState(false)
  const { settings, bills, entries, accounts, ledgers, balances, parties, items, stock, photos } = data

  const today = todayIso()
  const yesterday = addDays(today, -1)

  const stats = useMemo(() => {
    const ledgersYesterday = computeAllLedgers(data, yesterday)
    const now = receivablePayable(ledgers.values())
    const before = receivablePayable(ledgersYesterday.values())
    const balYesterday = accountBalances(accounts, data, yesterday)
    const sumType = (m: Map<string, number>, types: AccountType[]) =>
      accounts.filter((a) => types.includes(a.type)).reduce((s, a) => s + (m.get(a.id) ?? 0), 0)

    const bs = adToBs(today)
    const thisMonth = bsMonthRange(bs.y, bs.m)
    const prev = shiftBsMonth(bs.y, bs.m, -1)
    const prevRange = bsMonthRange(prev.y, prev.m)
    const prevSameDay = addDays(prevRange.from, Math.min(bs.d, 32) - 1)
    const prevTo = prevSameDay > prevRange.to ? prevRange.to : prevSameDay

    return {
      todaySales: salesOn(bills, today, today),
      yesterdaySales: salesOn(bills, yesterday, yesterday),
      receivable: now.receivable,
      receivableBefore: before.receivable,
      payable: now.payable,
      payableBefore: before.payable,
      cash: sumType(balances, ['cash']),
      cashBefore: sumType(balYesterday, ['cash']),
      bank: sumType(balances, ['bank']),
      bankBefore: sumType(balYesterday, ['bank']),
      wallet: sumType(balances, WALLET_TYPES),
      walletBefore: sumType(balYesterday, WALLET_TYPES),
      hasWallet: accounts.some((a) => WALLET_TYPES.includes(a.type)),
      monthSales: salesOn(bills, thisMonth.from, today),
      lastMonthSales: salesOn(bills, prevRange.from, prevTo),
      monthExpenses: expensesOn(entries, thisMonth.from, today),
      lastMonthExpenses: expensesOn(entries, prevRange.from, prevTo),
      bsDay: bs.d,
      prevMonth: prev,
    }
  }, [data, ledgers, balances, accounts, bills, entries, today, yesterday])

  const vat = useMemo(() => {
    const { prevMonth, bsDay } = stats
    const key = monthKey(prevMonth.y, prevMonth.m)
    if (bsDay > 25 || settings.vatFiled.includes(key)) return null
    const months = Array.from({ length: 12 }, (_, i) => shiftBsMonth(prevMonth.y, prevMonth.m, i - 11)).map(({ y, m }) => ({ y, m, range: bsMonthRange(y, m) }))
    const row = vatByMonth(bills, months).at(-1)!
    if (!row.outputVat && !row.inputVat && !row.carriedIn) return null
    const cur = shiftBsMonth(prevMonth.y, prevMonth.m, 1)
    return { row, key, dueIso: bsToAd({ y: cur.y, m: cur.m, d: 25 }) }
  }, [stats, bills, settings.vatFiled])

  const overdue = useMemo(() => overdueParties(parties, ledgers, today), [parties, ledgers, today])
  const liveAccounts = accounts.filter((a) => !a.archived)
  const photosToEnter = photos.filter((p) => p.status === 'pending' && !p.voided)
  const lowStock = useMemo(
    () => items.filter((i) => !i.archived && (stock.get(i.id) ?? 0) <= i.lowStockAt).slice(0, 6),
    [items, stock],
  )

  const cards: { key: string; label: string; value: number; tr: Trend; vs: string; to: string; icon: typeof Wallet; accent: string }[] = [
    { key: 'sales', label: t('today_sales'), value: stats.todaySales, tr: trend(stats.todaySales, stats.yesterdaySales, true), vs: t('vs_yesterday'), to: '/bills', icon: ShoppingCart, accent: 'text-primary' },
    { key: 'receive', label: t('to_receive'), value: stats.receivable, tr: trend(stats.receivable, stats.receivableBefore, false), vs: t('vs_yesterday'), to: '/parties?tab=customer', icon: ArrowDownLeft, accent: 'text-good' },
    { key: 'pay', label: t('to_pay'), value: stats.payable, tr: trend(stats.payable, stats.payableBefore, false), vs: t('vs_yesterday'), to: '/parties?tab=supplier', icon: ArrowUpRight, accent: 'text-bad' },
    { key: 'cash', label: t('cash_in_hand'), value: stats.cash, tr: trend(stats.cash, stats.cashBefore, true), vs: t('vs_yesterday'), to: '/money', icon: Wallet, accent: 'text-primary' },
    { key: 'bank', label: t('bank_balance'), value: stats.bank, tr: trend(stats.bank, stats.bankBefore, true), vs: t('vs_yesterday'), to: '/money', icon: Landmark, accent: 'text-primary' },
    ...(stats.hasWallet
      ? [{ key: 'wallet', label: t('wallet_balance'), value: stats.wallet, tr: trend(stats.wallet, stats.walletBefore, true), vs: t('vs_yesterday'), to: '/money', icon: Wallet, accent: 'text-primary' }]
      : []),
    { key: 'msales', label: t('month_sales'), value: stats.monthSales, tr: trend(stats.monthSales, stats.lastMonthSales, true), vs: t('vs_last_month'), to: '/reports', icon: BarChart3, accent: 'text-primary' },
    { key: 'mexp', label: t('month_expenses'), value: stats.monthExpenses, tr: trend(stats.monthExpenses, stats.lastMonthExpenses, false), vs: t('vs_last_month'), to: '/money', icon: Receipt, accent: 'text-bad' },
  ]

  const quick = [
    { label: t('quick_sale'), icon: ShoppingCart, onClick: () => navigate('/bills/new/sale'), primary: true, id: 'quick-sale' },
    { label: t('quick_payment'), icon: Wallet, onClick: () => setPayOpen(true), id: 'quick-payment' },
    { label: t('quick_expense'), icon: Receipt, onClick: () => navigate('/money/entry/new?type=expense'), id: 'quick-expense' },
    { label: t('quick_purchase'), icon: PackageMinus, onClick: () => navigate('/bills/new/purchase'), id: 'quick-purchase' },
    { label: t('quick_reports'), icon: BarChart3, onClick: () => navigate('/reports'), id: 'quick-reports' },
    { label: t('bill_photo'), icon: Camera, onClick: () => navigate('/photos'), id: 'quick-photo', className: 'col-span-2 h-14 flex-row gap-3 sm:col-span-1 sm:h-24 sm:flex-col sm:gap-1' },
  ]

  return (
    <Page
      wide
      title={
        <span className="flex flex-col leading-tight">
          <span className="truncate">{settings.shopName || t('app_name')}</span>
          <span className="text-sm font-normal text-muted-foreground">{date(today)}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
          {quick.map((q) => (
            <Button
              key={q.id}
              data-testid={q.id}
              variant={q.primary ? 'default' : 'outline'}
              size="xl"
              onClick={q.onClick}
              className={cn('h-20 flex-col gap-1 text-lg sm:h-24', q.primary && 'col-span-2 sm:col-span-1', q.className)}
            >
              <q.icon className={q.className ? 'size-7! sm:size-8!' : 'size-8!'} />
              {q.label}
            </Button>
          ))}
        </div>

        {vat && (
          <div className="flex flex-col gap-3 rounded-2xl border border-warn/40 bg-warn/10 p-4 sm:flex-row sm:items-center" data-testid="vat-reminder">
            <AlertTriangle className="size-7 shrink-0 text-warn" />
            <div className="flex-1">
              <p className="font-semibold">
                {t('vat_due_reminder', { month: digitsOf(`${BS_MONTHS[lang][vat.row.m - 1]} ${vat.row.y}`), date: date(vat.dueIso) })}
              </p>
              <p>{vat.row.payable > 0 ? t('vat_payable_is', { amount: money(vat.row.payable) }) : t('vat_credit_is', { amount: money(vat.row.carriedOut) })}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/reports?tab=vat')}>
                {t('details')}
              </Button>
              <Button onClick={() => saveSettings({ vatFiled: [...settings.vatFiled, vat.key] })}>{t('mark_filed')}</Button>
            </div>
          </div>
        )}

        {photosToEnter.length > 0 && (
          <Link
            to="/photos"
            className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 transition-colors hover:bg-primary/10"
            data-testid="photos-pending"
          >
            <span className="flex shrink-0 -space-x-4">
              {photosToEnter.slice(0, 3).map((p) => (
                <img key={p.id} src={p.thumb} alt="" className="size-12 rounded-lg border-2 border-card object-cover shadow-xs" />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{photosToEnter.length === 1 ? t('photos_pending_one', { n: num(1) }) : t('photos_pending', { n: num(photosToEnter.length) })}</span>
              <span className="block truncate text-sm text-muted-foreground">{t('photos_waiting_hint')}</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <Link
              key={c.key}
              to={c.to}
              data-testid={`card-${c.key}`}
              className="group flex min-w-0 flex-col gap-1 rounded-2xl border bg-card p-3 shadow-xs transition-colors hover:border-primary/40 sm:gap-1.5 sm:p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[0.95rem] leading-snug font-medium text-muted-foreground sm:text-base">{c.label}</span>
                <c.icon className={cn('size-5 shrink-0', c.accent)} />
              </div>
              <span className="tabular truncate text-[1.3rem] leading-tight font-bold sm:text-[1.75rem]" data-testid="card-value">
                {money(c.value)}
              </span>
              <TrendArrow trend={c.tr} label={c.vs} />
            </Link>
          ))}
        </div>

        {liveAccounts.length > 1 && (
          <Section
            title={t('each_account')}
            action={
              <Link to="/money" className="text-primary">
                {t('view_all')}
              </Link>
            }
          >
            <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0" data-testid="account-strip">
              {liveAccounts.map((a) => {
                const Icon = ACCOUNT_ICONS[a.type]
                const bal = balances.get(a.id) ?? 0
                return (
                  <Link
                    key={a.id}
                    to={`/money/accounts/${a.id}`}
                    className="flex w-44 shrink-0 snap-start items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5 shadow-xs hover:border-primary/40 lg:w-auto lg:min-w-0"
                    data-testid="account-chip"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-muted-foreground">{a.name}</span>
                      <span className={cn('tabular block truncate text-lg font-semibold', bal < 0 && 'text-bad')}>{money(bal)}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </Section>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-bad" />
                {t('overdue_parties')}
              </span>
            }
            action={
              overdue.length > 0 && (
                <Link to="/parties?tab=customer&filter=overdue" className="text-primary">
                  {t('view_all')}
                </Link>
              )
            }
          >
            {overdue.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-4 text-muted-foreground">{t('all_clear')}</p>
            ) : (
              <div className="flex flex-col divide-y overflow-hidden rounded-2xl border border-bad/30 bg-bad/5">
                {overdue.slice(0, 5).map((o) => (
                  <Link key={o.party.id} to={`/parties/${o.party.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-bad/10">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold">{o.party.name}</div>
                      <div className="text-sm text-bad">{t('overdue_days', { n: num(o.daysOverdue) })}</div>
                    </div>
                    <span className="tabular text-lg font-semibold text-bad">{money(o.overdueAmount)}</span>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {lowStock.length > 0 && (
            <Section
              title={
                <span className="flex items-center gap-2">
                  <PackageMinus className="size-5 text-warn" />
                  {t('low_stock')}
                </span>
              }
              action={
                <Link to="/stock?filter=low" className="text-primary">
                  {t('view_all')}
                </Link>
              }
            >
              <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
                {lowStock.map((i) => (
                  <Link key={i.id} to={`/stock/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                    <div className="min-w-0 flex-1 truncate text-lg">{i.name}</div>
                    <span className="rounded-full bg-warn/15 px-2.5 py-0.5 font-semibold">{t('low_stock_left', { n: num(stock.get(i.id) ?? 0) })}</span>
                  </Link>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('new_payment')}</DialogTitle>
          </DialogHeader>
          <Button size="xl" className="h-20 justify-start" onClick={() => navigate('/payments/new?dir=in')} data-testid="pay-in">
            <ArrowDownLeft />
            <span className="flex flex-col items-start leading-tight">
              <span>{t('receive_payment')}</span>
              <span className="text-sm font-normal opacity-80">{t('customer')}</span>
            </span>
          </Button>
          <Button size="xl" variant="outline" className="h-20 justify-start" onClick={() => navigate('/payments/new?dir=out')} data-testid="pay-out">
            <ArrowUpRight />
            <span className="flex flex-col items-start leading-tight">
              <span>{t('make_payment')}</span>
              <span className="text-sm font-normal text-muted-foreground">{t('supplier')}</span>
            </span>
          </Button>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
