import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, Landmark, Loader2, NotebookTabs } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { TrendArrow } from '@/components/Amount'
import { DateField } from '@/components/DateField'
import { DocumentViewer } from '@/components/DocumentViewer'
import { EmptyState, Field, Segmented } from '@/components/Field'
import { Page, Panel, Section } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale, type Locale } from '@/app/locale'
import { BookDocument } from '@/docs/Book'
import {
  addDays,
  adToBs,
  bsMonthRange,
  bsToAd,
  BS_MONTHS,
  daysBetween,
  fiscalYearLabel,
  fiscalYearMonths,
  fiscalYearOf,
  fiscalYearRange,
  formatBsMonth,
  monthKey,
  shiftBsMonth,
  todayIso,
  type DateRange,
  type ISODate,
} from '@/lib/bsdate'
import { rowsToXlsx, type SheetColumn } from '@/lib/exporter'
import { summarizePeriod, trend, vatByMonth, type PeriodSummary } from '@/lib/ledger'
import { saveSettings } from '@/lib/repo'
import { saveFile } from '@/lib/share'
import type { Bill } from '@/lib/types'
import { cn } from '@/lib/utils'

type Tab = 'summary' | 'vat' | 'books'
type PeriodKind = 'day' | 'month' | 'fy' | 'range'

interface PeriodState {
  kind: PeriodKind
  day: ISODate
  month: { y: number; m: number }
  fy: number
  from: ISODate
  to: ISODate
}

interface ResolvedPeriod {
  range: DateRange
  previous: DateRange
  label: string
}

function resolvePeriod(p: PeriodState, loc: Locale): ResolvedPeriod {
  switch (p.kind) {
    case 'day':
      return { range: { from: p.day, to: p.day }, previous: { from: addDays(p.day, -1), to: addDays(p.day, -1) }, label: loc.date(p.day) }
    case 'month': {
      const prev = shiftBsMonth(p.month.y, p.month.m, -1)
      return {
        range: bsMonthRange(p.month.y, p.month.m),
        previous: bsMonthRange(prev.y, prev.m),
        label: formatBsMonth(p.month.y, p.month.m, loc.lang, loc.digits),
      }
    }
    case 'fy':
      return {
        range: fiscalYearRange(p.fy),
        previous: fiscalYearRange(p.fy - 1),
        label: `${loc.t('period_fy')} ${fiscalYearLabel(p.fy, loc.digits)}`,
      }
    case 'range': {
      const from = p.from <= p.to ? p.from : p.to
      const to = p.from <= p.to ? p.to : p.from
      const len = daysBetween(from, to) + 1
      return { range: { from, to }, previous: { from: addDays(from, -len), to: addDays(from, -1) }, label: `${loc.date(from)} – ${loc.date(to)}` }
    }
  }
}

function initialPeriod(): PeriodState {
  const today = todayIso()
  const bs = adToBs(today)
  return { kind: 'month', day: today, month: { y: bs.y, m: bs.m }, fy: fiscalYearOf(today), from: addDays(today, -29), to: today }
}

export function Reports() {
  const loc = useLocale()
  const { t } = loc
  const [search, setSearch] = useSearchParams()
  const tabParam = search.get('tab')
  const tab: Tab = tabParam === 'vat' || tabParam === 'books' ? tabParam : 'summary'
  const [period, setPeriod] = useState<PeriodState>(initialPeriod)
  const resolved = resolvePeriod(period, loc)

  return (
    <Page title={t('nav_reports')} wide>
      <div className="flex flex-col gap-5">
        <Segmented
          size="lg"
          value={tab}
          onChange={(v) => setSearch(v === 'summary' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'summary', label: t('summary'), icon: <BarChart3 /> },
            { value: 'vat', label: t('vat'), icon: <Landmark /> },
            { value: 'books', label: t('books_short'), icon: <NotebookTabs /> },
          ]}
        />
        {tab !== 'vat' && <PeriodPicker period={period} onChange={setPeriod} label={resolved.label} />}
        {tab === 'summary' && <SummaryTab period={resolved} />}
        {tab === 'vat' && <VatTab />}
        {tab === 'books' && <BooksTab period={resolved} />}
      </div>
    </Page>
  )
}

function PeriodPicker({ period, onChange, label }: { period: PeriodState; onChange: (p: PeriodState) => void; label: string }) {
  const { t } = useLocale()
  const today = todayIso()
  const step = (delta: number) => {
    if (period.kind === 'day') onChange({ ...period, day: addDays(period.day, delta) })
    else if (period.kind === 'month') onChange({ ...period, month: shiftBsMonth(period.month.y, period.month.m, delta) })
    else if (period.kind === 'fy') onChange({ ...period, fy: period.fy + delta })
  }
  const atEnd =
    (period.kind === 'day' && period.day >= today) ||
    (period.kind === 'month' && bsMonthRange(period.month.y, period.month.m).to >= today) ||
    (period.kind === 'fy' && fiscalYearRange(period.fy).to >= today)

  return (
    <Panel className="flex flex-col gap-3" data-testid="period-picker">
      <Segmented
        name={t('period')}
        value={period.kind}
        onChange={(kind) => onChange({ ...period, kind })}
        options={[
          { value: 'day', label: t('period_day') },
          { value: 'month', label: t('period_month') },
          { value: 'fy', label: t('period_fy_short') },
          { value: 'range', label: t('period_range_short') },
        ]}
      />
      {period.kind === 'range' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('from')}>
            <DateField value={period.from} onChange={(from) => onChange({ ...period, from })} label={t('from')} />
          </Field>
          <Field label={t('to')}>
            <DateField value={period.to} onChange={(to) => onChange({ ...period, to })} label={t('to')} />
          </Field>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-touch" aria-label={t('back')} onClick={() => step(-1)} data-testid="period-prev">
            <ChevronLeft />
          </Button>
          <div className="flex-1 text-center text-lg font-semibold" data-testid="period-label">
            {label}
          </div>
          <Button variant="outline" size="icon-touch" aria-label={t('next')} onClick={() => step(1)} disabled={atEnd} data-testid="period-next">
            <ChevronRight />
          </Button>
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- Summary

function StatCard({ label, value, children, tone }: { label: string; value: string; children?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-card p-3 shadow-xs sm:gap-1.5 sm:p-4">
      <span className="text-[0.95rem] leading-snug font-medium text-muted-foreground sm:text-base">{label}</span>
      <span className={cn('tabular truncate text-[1.3rem] leading-tight font-bold sm:text-[1.6rem]', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')}>
        {value}
      </span>
      {children}
    </div>
  )
}

function SummaryTab({ period }: { period: ResolvedPeriod }) {
  const { t, money, num, category, lang, digits } = useLocale()
  const { bills, entries, parties, ledgers } = useData()

  const now = useMemo(() => summarizePeriod(period.range, bills, entries), [period.range, bills, entries])
  const before = useMemo(() => summarizePeriod(period.previous, bills, entries), [period.previous, bills, entries])

  const monthly = useMemo(() => {
    const fy = fiscalYearOf(period.range.to)
    return fiscalYearMonths(fy).map(({ y, m }) => {
      const range = bsMonthRange(y, m)
      const s = summarizePeriod(range, bills, entries)
      return { y, m, range, netSales: s.netSales, inPeriod: range.to >= period.range.from && range.from <= period.range.to }
    })
  }, [period.range, bills, entries])
  const maxMonthly = Math.max(1, ...monthly.map((x) => x.netSales))

  const debtors = useMemo(
    () =>
      parties
        .filter((p) => p.type === 'customer')
        .map((p) => ({ party: p, ledger: ledgers.get(p.id)! }))
        .filter((x) => x.ledger && x.ledger.balance > 0)
        .sort((a, b) => b.ledger.balance - a.ledger.balance)
        .slice(0, 5),
    [parties, ledgers],
  )

  const categories = Object.entries(now.expensesByCategory).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(1, ...categories.map(([, v]) => v))
  const vs = t('vs_previous')
  const hasActivity = now.saleCount + now.purchaseCount > 0 || now.businessExpenses + now.personalExpenses + now.businessIncome > 0

  return (
    <div className="flex flex-col gap-6" data-testid="summary">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard label={t('sales_ex_vat')} value={money(now.netSales)}>
          <TrendArrow trend={trend(now.netSales, before.netSales, true)} label={vs} />
          <span className="text-sm text-muted-foreground">{t('bills_count', { n: num(now.saleCount) })}</span>
        </StatCard>
        <StatCard label={t('gross_profit')} value={money(now.grossProfit)} tone={now.grossProfit < 0 ? 'bad' : undefined}>
          <TrendArrow trend={trend(now.grossProfit, before.grossProfit, true)} label={vs} />
        </StatCard>
        <StatCard label={t('business_expenses')} value={money(now.businessExpenses)}>
          <TrendArrow trend={trend(now.businessExpenses, before.businessExpenses, false)} label={vs} />
        </StatCard>
        <StatCard label={t('net_profit')} value={money(now.netProfit)} tone={now.netProfit > 0 ? 'good' : now.netProfit < 0 ? 'bad' : undefined}>
          <TrendArrow trend={trend(now.netProfit, before.netProfit, true)} label={vs} />
        </StatCard>
      </div>

      {!hasActivity && <EmptyState icon={<BarChart3 />} title={t('nothing_yet')} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={t('profit_and_loss')}>
          <ProfitTable s={now} />
        </Section>

        <Section title={t('sales_by_month')}>
          <Panel>
            <div className="flex h-48 items-end gap-1.5" role="img" aria-label={t('sales')} data-testid="sales-chart">
              {monthly.map((x) => (
                <div key={monthKey(x.y, x.m)} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div
                    className={cn('w-full rounded-t-md transition-all', x.inPeriod ? 'bg-primary' : 'bg-primary/25')}
                    style={{ height: `${Math.max(2, (x.netSales / maxMonthly) * 100)}%` }}
                    title={`${formatBsMonth(x.y, x.m, lang, digits)}: ${money(x.netSales)}`}
                  />
                  <span className="w-full truncate text-center text-[0.7rem] text-muted-foreground">
                    {lang === 'en' ? (
                      <>
                        <span className="sm:hidden">{BS_MONTHS.en[x.m - 1].slice(0, 3)}</span>
                        <span className="hidden sm:inline">{BS_MONTHS.en[x.m - 1]}</span>
                      </>
                    ) : (
                      BS_MONTHS.ne[x.m - 1]
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('sales_ex_vat')} · {t('period_fy')} {fiscalYearLabel(fiscalYearOf(period.range.to), digits)}
            </p>
          </Panel>
        </Section>

        <Section
          title={t('top_debtors')}
          action={
            <Link to="/parties?tab=customer" className="text-primary">
              {t('view_all')}
            </Link>
          }
        >
          {debtors.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-4 text-muted-foreground">{t('all_clear')}</p>
          ) : (
            <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card" data-testid="top-debtors">
              {debtors.map(({ party, ledger }, i) => (
                <Link key={party.id} to={`/parties/${party.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-semibold">{num(i + 1)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{party.name}</div>
                    {ledger.oldestDue && ledger.oldestDue < todayIso() && (
                      <div className="text-sm text-bad">{t('overdue_days', { n: num(daysBetween(ledger.oldestDue, todayIso())) })}</div>
                    )}
                  </div>
                  <span className="tabular text-lg font-semibold text-good">{money(ledger.balance)}</span>
                </Link>
              ))}
            </div>
          )}
        </Section>

        <Section title={t('expenses_by_category')}>
          {categories.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-4 text-muted-foreground">{t('nothing_yet')}</p>
          ) : (
            <Panel className="flex flex-col gap-3">
              {categories.map(([key, value]) => (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2">
                    <span>{category(key)}</span>
                    <span className="tabular font-semibold">{money(value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-bad/70" style={{ width: `${(value / maxCat) * 100}%` }} />
                  </div>
                </div>
              ))}
              {now.personalExpenses > 0 && (
                <div className="mt-1 flex justify-between border-t pt-3 text-muted-foreground">
                  <span>{t('personal_expenses')}</span>
                  <span className="tabular font-semibold">{money(now.personalExpenses)}</span>
                </div>
              )}
            </Panel>
          )}
        </Section>
      </div>
    </div>
  )
}

function ProfitTable({ s }: { s: PeriodSummary }) {
  const { t, money } = useLocale()
  const row = (label: string, value: number, opts: { bold?: boolean; minus?: boolean; muted?: boolean } = {}) => (
    <div className={cn('flex justify-between gap-3 py-2', opts.bold && 'border-t font-bold', opts.muted && 'text-muted-foreground')}>
      <span>{label}</span>
      <span className="tabular">
        {opts.minus && value ? '− ' : ''}
        {money(value)}
      </span>
    </div>
  )
  return (
    <Panel className="flex flex-col text-base" data-testid="profit-table">
      {row(t('sales_ex_vat'), s.sales)}
      {s.salesReturns > 0 && row(t('sales_returns'), s.salesReturns, { minus: true })}
      {row(t('cost_of_goods'), s.cogs, { minus: true })}
      {row(t('gross_profit'), s.grossProfit, { bold: true })}
      {s.businessIncome > 0 && row(t('other_income'), s.businessIncome)}
      {row(t('business_expenses'), s.businessExpenses, { minus: true })}
      {row(t('net_profit'), s.netProfit, { bold: true })}
      <div className="mt-2 flex flex-col border-t pt-2">
        {row(t('purchases_ex_vat'), s.netPurchases, { muted: true })}
        {row(`${t('vat_collected')} − ${t('vat_paid')}`, s.outputVat - s.inputVat, { muted: true })}
        {s.personalExpenses > 0 && row(t('personal_expenses'), s.personalExpenses, { muted: true })}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t('profit_note')}</p>
    </Panel>
  )
}

// ---------------------------------------------------------------- VAT

function VatTab() {
  const { t, money, date, lang, digits } = useLocale()
  const { bills, settings } = useData()
  const today = todayIso()
  const [fy, setFy] = useState(() => fiscalYearOf(today))

  const rows = useMemo(() => {
    const earliest = bills.reduce((min, b) => (b.voided || b.date >= min ? min : b.date), today)
    let startFy = Math.min(fiscalYearOf(earliest), fy)
    startFy = Math.max(startFy, fy - 10)
    const months = []
    for (let y = startFy; y <= fy; y++) months.push(...fiscalYearMonths(y))
    return vatByMonth(bills, months.map(({ y, m }) => ({ y, m, range: bsMonthRange(y, m) })))
      .slice(-12)
      .filter((r) => bsMonthRange(r.y, r.m).from <= today)
  }, [bills, fy, today])

  const totals = rows.reduce((s, r) => ({ out: s.out + r.outputVat, in: s.in + r.inputVat, pay: s.pay + r.payable }), { out: 0, in: 0, pay: 0 })
  const filed = new Set(settings.vatFiled)

  return (
    <div className="flex flex-col gap-4" data-testid="vat-tab">
      <Panel className="flex items-center gap-2">
        <Button variant="outline" size="icon-touch" aria-label={t('back')} onClick={() => setFy(fy - 1)}>
          <ChevronLeft />
        </Button>
        <div className="flex-1 text-center text-lg font-semibold">
          {t('period_fy')} {fiscalYearLabel(fy, digits)}
        </div>
        <Button variant="outline" size="icon-touch" aria-label={t('next')} onClick={() => setFy(fy + 1)} disabled={fiscalYearRange(fy).to >= today}>
          <ChevronRight />
        </Button>
      </Panel>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <StatCard label={t('vat_collected')} value={money(totals.out)} />
        <StatCard label={t('vat_paid')} value={money(totals.in)} />
        <div className="col-span-2 sm:col-span-1">
          <StatCard label={t('vat_payable')} value={money(totals.pay)} tone={totals.pay > 0 ? 'bad' : undefined} />
        </div>
      </div>

      <Section title={t('vat_summary')}>
        <p className="text-muted-foreground">{t('vat_due_note')}</p>
        <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
          {rows.map((r) => {
            const range = bsMonthRange(r.y, r.m)
            const next = shiftBsMonth(r.y, r.m, 1)
            const due = bsToAd({ y: next.y, m: next.m, d: 25 })
            const closed = range.to < today
            const isFiled = filed.has(r.key)
            const empty = !r.outputVat && !r.inputVat
            return (
              <div key={r.key} className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center', !closed && 'bg-muted/40')} data-testid="vat-row">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-lg font-semibold">{formatBsMonth(r.y, r.m, lang, digits)}</span>
                  {closed && !isFiled && !empty && (
                    <span className={cn('text-sm', due < today ? 'font-semibold text-bad' : 'text-muted-foreground')}>{t('due_by', { date: date(due) })}</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 text-right sm:w-[26rem]">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{t('vat_collected')}</span>
                    <span className="tabular">{money(r.outputVat)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{t('vat_paid')}</span>
                    <span className="tabular">{money(r.inputVat)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{r.payable > 0 || !r.carriedOut ? t('vat_payable') : t('carried_forward')}</span>
                    <span className={cn('tabular font-semibold', r.payable > 0 ? 'text-bad' : r.carriedOut ? 'text-good' : '')}>
                      {money(r.payable > 0 || !r.carriedOut ? r.payable : r.carriedOut)}
                    </span>
                  </div>
                </div>
                <div className="flex justify-end sm:w-36">
                  {isFiled ? (
                    <Button
                      variant="ghost"
                      className="text-good"
                      onClick={() => saveSettings({ vatFiled: settings.vatFiled.filter((k) => k !== r.key) })}
                      title={t('restore')}
                    >
                      <CheckCircle2 />
                      {t('filed')}
                    </Button>
                  ) : closed && !empty ? (
                    <Button variant="outline" onClick={() => saveSettings({ vatFiled: [...settings.vatFiled, r.key] })}>
                      {t('mark_filed')}
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------- Books

function BooksTab({ period }: { period: ResolvedPeriod }) {
  const { t, date, digitsOf } = useLocale()
  const { bills, settings } = useData()
  const [kind, setKind] = useState<'sale' | 'purchase'>('sale')
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => {
    const kinds: Bill['kind'][] = kind === 'sale' ? ['sale', 'sale_return'] : ['purchase', 'purchase_return']
    return bills
      .filter((b) => !b.voided && kinds.includes(b.kind) && b.date >= period.range.from && b.date <= period.range.to)
      .sort((a, b) => a.date.localeCompare(b.date) || a.billNo.localeCompare(b.billNo, undefined, { numeric: true }))
  }, [bills, kind, period.range])

  const title = kind === 'sale' ? t('sales_book') : t('purchase_book')
  const filename = `${kind === 'sale' ? 'sales' : 'purchase'}-book-${period.range.from}-${period.range.to}`

  const exportExcel = async () => {
    setBusy(true)
    try {
      const sign = (b: Bill) => (b.kind === kind ? 1 : -1)
      const rs = (p: number) => p / 100
      const columns: SheetColumn<Bill>[] = [
        { header: t('date'), width: 12, value: (b) => date(b.date, 'short') },
        { header: t('bill_no'), width: 12, value: (b) => digitsOf(b.billNo) },
        { header: kind === 'sale' ? t('customer') : t('supplier'), width: 28, value: (b) => (sign(b) < 0 ? `${b.partyName} (${t('returns')})` : b.partyName) },
        { header: t('pan'), width: 12, value: (b) => b.partyPan || '' },
        { header: t('total'), width: 14, money: true, value: (b) => rs(sign(b) * b.totals.total) },
        { header: t('exempt_amount'), width: 14, money: true, value: (b) => rs(sign(b) * b.totals.exempt) },
        { header: t('taxable_amount'), width: 14, money: true, value: (b) => rs(sign(b) * b.totals.taxable) },
        { header: t('vat'), width: 12, money: true, value: (b) => rs(sign(b) * b.totals.vat) },
      ]
      const total = (f: (b: Bill) => number) => rs(rows.reduce((s, b) => s + sign(b) * f(b), 0))
      const blob = await rowsToXlsx(`${settings.shopName} — ${title} (${date(period.range.from)} – ${date(period.range.to)})`, rows, columns, [
        t('total'),
        '',
        '',
        '',
        total((b) => b.totals.total),
        total((b) => b.totals.exempt),
        total((b) => b.totals.taxable),
        total((b) => b.totals.vat),
      ])
      await saveFile(blob, `${filename}.xlsx`)
      toast.success(t('saved_file'))
    } catch (err) {
      console.error(err)
      toast.error(t('err_generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="books-tab">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          className="flex-1"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'sale', label: t('sales_book') },
            { value: 'purchase', label: t('purchase_book') },
          ]}
        />
        <Button size="touch" onClick={exportExcel} disabled={busy} className="bg-[#1d6f42] text-white hover:bg-[#185c37]" data-testid="export-excel">
          {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          {t('export_excel')}
        </Button>
      </div>
      <DocumentViewer filename={filename} shareText={`${settings.shopName} — ${title}: ${period.label}`}>
        <BookDocument kind={kind} bills={rows} range={period.range} settings={settings} />
      </DocumentViewer>
    </div>
  )
}
