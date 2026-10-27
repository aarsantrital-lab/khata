import { Landmark, Pencil } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Amount } from '@/components/Amount'
import { DateField } from '@/components/DateField'
import { EmptyState, Field } from '@/components/Field'
import { HistoryList } from '@/components/HistoryList'
import { AmountField } from '@/components/NumPad'
import { FormActions, Page, Panel } from '@/components/Page'
import { ACCOUNT_ICONS } from '@/components/Pickers'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso } from '@/lib/bsdate'
import { accountBalance, accountMovements } from '@/lib/ledger'
import { saveAccount, saveBankCheck } from '@/lib/repo'
import type { AccountType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'
import { errorMessage } from './util'

export function AccountForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLocale()
  const { accountById } = useData()
  const existing = id ? accountById.get(id) : undefined
  const [type, setType] = useState<AccountType>(existing?.type ?? 'bank')
  const [name, setName] = useState(existing?.name ?? '')
  const [opening, setOpening] = useState<number | null>(existing?.openingBalance ?? null)
  const [openingDate, setOpeningDate] = useState(existing?.openingDate ?? todayIso())
  const [error, setError] = useState<string | null>(null)

  return (
    <Page title={existing ? t('edit_account') : t('add_account')} back>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            const saved = await saveAccount({ ...(existing ?? {}), id: existing?.id, type, name: name.trim(), openingBalance: opening ?? 0, openingDate })
            toast.success(t('saved'))
            navigate(`/money/accounts/${saved.id}`, { replace: true })
          } catch (err) {
            setError(errorMessage(err, t))
          }
        }}
      >
        <Panel className="flex flex-col gap-4">
          <Field label={t('account_type')}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(['cash', 'bank', 'esewa', 'khalti', 'wallet'] as const).map((k) => {
                const Icon = ACCOUNT_ICONS[k]
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setType(k)
                      if (!name || ['Cash', 'नगद', 'eSewa', 'Khalti', 'इसेवा', 'खल्ती'].includes(name)) setName(k === 'bank' || k === 'wallet' ? '' : t(k))
                    }}
                    className={cn('flex h-16 items-center justify-center gap-2 rounded-xl border px-2 text-lg leading-tight font-medium', type === k ? 'border-primary bg-primary/8 ring-2 ring-primary' : 'bg-card', k === 'wallet' && 'col-span-2 sm:col-span-1')}
                  >
                    <Icon className="size-6" />
                    {t(k)}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label={t('account_name')} htmlFor="account-name" error={error}>
            <Input
              id="account-name"
              value={name}
              placeholder={type === 'bank' ? 'NIC Asia, Global IME…' : type === 'wallet' ? 'IME Pay, PrabhuPAY…' : ''}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label={t('opening_balance')}>
            <AmountField id="account-opening" value={opening} onChange={setOpening} label={t('opening_balance')} />
          </Field>
          <Field label={t('date')}>
            <DateField value={openingDate} onChange={setOpeningDate} label={t('date')} />
          </Field>
        </Panel>
        <FormActions>
          <Button type="button" variant="outline" size="xl" onClick={() => navigate(-1)}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="xl" data-testid="save-account">
            {t('save')}
          </Button>
        </FormActions>
      </form>
    </Page>
  )
}

export function AccountDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, date, money, category } = useLocale()
  const data = useData()
  const { accountById, balances, partyById, bankChecks } = data
  const account = accountById.get(id)
  const [checkOpen, setCheckOpen] = useState(false)
  const [bankShows, setBankShows] = useState<number | null>(null)
  const [checkDate, setCheckDate] = useState(todayIso())

  const moves = useMemo(() => (account ? accountMovements(account, data).reverse() : []), [account, data])
  const checks = bankChecks.filter((c) => c.accountId === id).sort((a, b) => b.createdAt - a.createdAt)
  if (!account) return <NotFound />
  const Icon = ACCOUNT_ICONS[account.type]
  const appOnDate = accountBalance(account, data, checkDate)
  const diff = bankShows === null ? null : bankShows - appOnDate

  const label = (m: (typeof moves)[number]) => {
    switch (m.kind) {
      case 'opening':
        return t('opening_balance')
      case 'payment_in':
      case 'payment_out':
        return partyById.get(m.partyId ?? '')?.name ?? t('payment')
      case 'income':
      case 'expense':
        return category(m.label)
      case 'transfer_in':
        return t('transfer_label', { from: accountById.get(m.label)?.name ?? '', to: account.name })
      case 'transfer_out':
        return t('transfer_label', { from: account.name, to: accountById.get(m.label)?.name ?? '' })
    }
  }
  const link = (m: (typeof moves)[number]) =>
    m.kind.startsWith('payment') ? `/payments/${m.refId}` : m.kind.startsWith('transfer') ? `/money/transfer/${m.refId}` : m.kind === 'opening' ? `/money/accounts/${id}/edit` : `/money/entry/${m.refId}`

  return (
    <Page
      title={account.name}
      back="/money"
      actions={
        <Button variant="ghost" size="icon-touch" aria-label={t('edit')} onClick={() => navigate(`/money/accounts/${id}/edit`)}>
          <Pencil />
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-2xl bg-secondary p-5">
          <Icon className="size-10 text-secondary-foreground" />
          <div>
            <div className="text-secondary-foreground">{t(account.type)}</div>
            <Amount value={balances.get(id) ?? 0} className="text-4xl font-bold" />
          </div>
        </div>
        {account.type !== 'cash' && (
          <Button
            size="xl"
            variant="outline"
            onClick={() => {
              setBankShows(null)
              setCheckDate(todayIso())
              setCheckOpen(true)
            }}
            data-testid="bank-check"
          >
            <Landmark />
            {t('bank_check')}
          </Button>
        )}
        {checks[0] && (
          <div className={cn('rounded-2xl p-4', checks[0].bankBalance === checks[0].appBalance ? 'bg-good/10' : 'bg-bad/8')}>
            <div className="text-sm text-muted-foreground">
              {t('last_check')} · {date(checks[0].date)}
            </div>
            <div className="font-semibold">
              {t('bank_shows')} {money(checks[0].bankBalance)} · {t('app_shows')} {money(checks[0].appBalance)}
            </div>
            <div className={cn('font-semibold', checks[0].bankBalance === checks[0].appBalance ? 'text-good' : 'text-bad')}>
              {checks[0].bankBalance === checks[0].appBalance ? t('matches') : t('mismatch', { amount: money(Math.abs(checks[0].bankBalance - checks[0].appBalance)) })}
            </div>
          </div>
        )}
        <h2 className="text-lg font-semibold">{t('movements')}</h2>
        {moves.length === 0 ? (
          <EmptyState title={t('nothing_yet')} />
        ) : (
          <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {moves.map((m) => (
              <Link key={m.id} to={link(m)} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{label(m)}</div>
                  <div className="text-sm text-muted-foreground">{date(m.date)}</div>
                </div>
                <div className="flex flex-col items-end">
                  <span className={cn('tabular text-lg font-semibold', m.amount >= 0 ? 'text-good' : 'text-bad')}>
                    {m.amount >= 0 ? '+' : ''}
                    {money(m.amount)}
                  </span>
                  <span className="tabular text-sm text-muted-foreground">{money(m.balance)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
        <HistoryList entityId={account.id} fields={{ name: (v) => String(v ?? ''), openingBalance: (v) => money(Number(v ?? 0)) }} />
      </div>

      <Dialog open={checkOpen} onOpenChange={setCheckOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('bank_check')}</DialogTitle>
            <DialogDescription>{t('bank_check_hint')}</DialogDescription>
          </DialogHeader>
          <Field label={t('date')}>
            <DateField value={checkDate} onChange={setCheckDate} label={t('date')} />
          </Field>
          <Field label={t('bank_shows')}>
            <AmountField id="bank-shows" value={bankShows} onChange={setBankShows} label={t('bank_shows')} />
          </Field>
          <div className="flex justify-between text-lg">
            <span className="text-muted-foreground">{t('app_shows')}</span>
            <Amount value={appOnDate} className="font-semibold" />
          </div>
          {diff !== null && (
            <div className={cn('rounded-xl p-3 text-lg font-semibold', diff === 0 ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad')} data-testid="bank-diff">
              {diff === 0 ? t('matches') : `${t('difference')}: ${diff > 0 ? '+' : ''}${money(diff)}`}
            </div>
          )}
          <Button
            size="touch"
            disabled={bankShows === null}
            onClick={async () => {
              await saveBankCheck({ accountId: id, date: checkDate, bankBalance: bankShows ?? 0, appBalance: appOnDate, note: '' })
              toast.success(t('saved'))
              setCheckOpen(false)
            }}
          >
            {t('save')}
          </Button>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
