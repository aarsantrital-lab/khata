import { ArrowLeftRight, ChevronRight, Landmark, MinusCircle, Plus, PlusCircle } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Amount } from '@/components/Amount'
import { EmptyState } from '@/components/Field'
import { Page, Section } from '@/components/Page'
import { ACCOUNT_ICONS } from '@/components/Pickers'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { cn } from '@/lib/utils'

export function Money() {
  const { t, date, category, money } = useLocale()
  const { accounts, balances, entries, transfers, accountById, bankChecks } = useData()
  const navigate = useNavigate()
  const total = accounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0)

  const recent = useMemo(() => {
    const rows = [
      ...entries.map((e) => ({ kind: e.type, id: e.id, date: e.date, createdAt: e.createdAt, amount: e.amount, voided: !!e.voided, label: category(e.category), sub: `${t(e.scope)} · ${accountById.get(e.accountId)?.name ?? ''}`, to: `/money/entry/${e.id}` })),
      ...transfers.map((tr) => ({
        kind: 'transfer' as const,
        id: tr.id,
        date: tr.date,
        createdAt: tr.createdAt,
        amount: tr.amount,
        voided: !!tr.voided,
        label: t('transfer'),
        sub: t('transfer_label', { from: accountById.get(tr.fromAccountId)?.name ?? '', to: accountById.get(tr.toAccountId)?.name ?? '' }),
        to: `/money/transfer/${tr.id}`,
      })),
    ]
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 40)
  }, [entries, transfers, accountById, category, t])

  return (
    <Page
      title={t('nav_money')}
      actions={
        <Button variant="outline" onClick={() => navigate('/money/accounts/new')}>
          <Plus />
          <span className="hidden sm:inline">{t('add_account')}</span>
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2">
          <Button size="xl" variant="outline" className="h-20 flex-col gap-1 text-base text-bad" onClick={() => navigate('/money/entry/new?type=expense')} data-testid="new-expense">
            <MinusCircle />
            {t('expense')}
          </Button>
          <Button size="xl" variant="outline" className="h-20 flex-col gap-1 text-base text-good" onClick={() => navigate('/money/entry/new?type=income')} data-testid="new-income">
            <PlusCircle />
            {t('income')}
          </Button>
          <Button size="xl" variant="outline" className="h-20 flex-col gap-1 text-base" onClick={() => navigate('/money/transfer/new')} data-testid="new-transfer">
            <ArrowLeftRight />
            {t('transfer')}
          </Button>
        </div>

        <Section title={t('accounts')} action={<span className="tabular text-lg font-semibold">{t('total_money')}: {money(total)}</span>}>
          <div className="grid gap-2 sm:grid-cols-2">
            {accounts.filter((a) => !a.archived).map((a) => {
              const Icon = ACCOUNT_ICONS[a.type]
              const last = bankChecks.filter((c) => c.accountId === a.id).sort((x, y) => y.createdAt - x.createdAt)[0]
              return (
                <Link key={a.id} to={`/money/accounts/${a.id}`} className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:border-primary/40" data-testid="account-row">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                    <Icon className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{a.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {t(a.type)}
                      {last && (
                        <span className={cn('ml-1', last.bankBalance === last.appBalance ? 'text-good' : 'text-bad')}>
                          · {last.bankBalance === last.appBalance ? t('matches') : t('mismatch', { amount: money(Math.abs(last.bankBalance - last.appBalance)) })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Amount value={balances.get(a.id) ?? 0} className="text-xl font-bold" />
                  <ChevronRight className="size-5 text-muted-foreground" />
                </Link>
              )
            })}
          </div>
          <Button variant="outline" size="touch" className="border-dashed" onClick={() => navigate('/money/accounts/quick')} data-testid="quick-add-accounts">
            <Landmark />
            {t('quick_add_accounts')}
          </Button>
        </Section>

        <Section title={t('recent_entries')}>
          {recent.length === 0 ? (
            <EmptyState title={t('nothing_yet')} />
          ) : (
            <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
              {recent.map((r) => (
                <Link key={r.id} to={r.to} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted', r.voided && 'opacity-50')} data-testid="entry-row">
                  {r.kind === 'expense' ? (
                    <MinusCircle className="size-6 text-bad" />
                  ) : r.kind === 'income' ? (
                    <PlusCircle className="size-6 text-good" />
                  ) : (
                    <ArrowLeftRight className="size-6 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={cn('truncate text-lg font-semibold', r.voided && 'line-through')}>{r.label}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {date(r.date)} · {r.sub}
                    </div>
                  </div>
                  <Amount value={r.amount} className={cn('text-lg font-semibold', r.kind === 'expense' ? 'text-bad' : r.kind === 'income' ? 'text-good' : '')} />
                </Link>
              ))}
            </div>
          )}
        </Section>
      </div>
    </Page>
  )
}
