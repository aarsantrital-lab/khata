import { ArrowDown, Ban, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/DateField'
import { Field, Segmented } from '@/components/Field'
import { HistoryList } from '@/components/HistoryList'
import { AmountField } from '@/components/NumPad'
import { FormActions, Page, Panel } from '@/components/Page'
import { AccountPicker } from '@/components/Pickers'
import { VoidDialog } from '@/components/VoidDialog'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso } from '@/lib/bsdate'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, PERSONAL_CATEGORIES, restoreRow, saveEntry, saveSettings, saveTransfer, voidRow } from '@/lib/repo'
import type { EntryType, Scope } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'
import { errorMessage } from './util'

export function EntryForm() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { t, category: catLabel, money, date: fmtDate } = useLocale()
  const { entries, accounts, settings } = useData()
  const existing = id ? entries.find((e) => e.id === id) : undefined
  const [type, setType] = useState<EntryType>(existing?.type ?? (search.get('type') === 'income' ? 'income' : 'expense'))
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? null)
  const [category, setCategory] = useState(existing?.category ?? '')
  const [scope, setScope] = useState<Scope>(existing?.scope ?? 'business')
  const defaultAccount = accounts.find((a) => a.type === 'cash' && !a.archived) ?? accounts[0]
  const [accountId, setAccountId] = useState(existing?.accountId ?? defaultAccount?.id ?? '')
  const [date, setDate] = useState(existing?.date ?? todayIso())
  const [note, setNote] = useState(existing?.note ?? '')
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [voidOpen, setVoidOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (id && !existing) return <NotFound />

  const cats = type === 'expense' ? [...EXPENSE_CATEGORIES, ...settings.expenseCategories] : [...INCOME_CATEGORIES, ...settings.incomeCategories]

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!amount) e.amount = t('err_amount_required')
    if (!accountId) e.account = t('err_account_required')
    if (!category) e.category = t('category')
    setErrors(e)
    if (Object.keys(e).length) return
    try {
      await saveEntry({ ...(existing ?? {}), id: existing?.id, type, amount: amount!, category, scope, accountId, date, note })
      toast.success(t('saved'))
      navigate('/money', { replace: true })
    } catch (err) {
      toast.error(errorMessage(err, t))
    }
  }

  return (
    <Page title={existing ? t('edit') : type === 'expense' ? t('new_expense') : t('new_income')} back>
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault()
          void submit()
        }}
      >
        {existing?.voided && (
          <div className="flex items-center gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-4">
            <div className="flex-1">
              <div className="font-semibold text-bad">{t('cancelled')}</div>
              <div>{existing.voided.reason}</div>
            </div>
            <Button type="button" variant="outline" onClick={() => restoreRow('entries', existing).then(() => toast.success(t('restored')))}>
              <Undo2 />
              {t('restore_entry')}
            </Button>
          </div>
        )}
        <Panel className="flex flex-col gap-4">
          {!existing && (
            <Segmented
              size="lg"
              value={type}
              onChange={(v) => {
                setType(v)
                setCategory('')
              }}
              options={[
                { value: 'expense', label: t('expense') },
                { value: 'income', label: t('income') },
              ]}
            />
          )}
          <Field label={t('amount')} error={errors.amount}>
            <AmountField id="entry-amount" value={amount} onChange={setAmount} label={t('amount')} invalid={!!errors.amount} />
          </Field>
          <Field label={t('category')} error={errors.category ? t('category') : null}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c)
                    if (type === 'expense') setScope(PERSONAL_CATEGORIES.has(c) ? 'personal' : 'business')
                  }}
                  className={cn('min-h-13 rounded-xl border px-2 py-2 text-base font-medium', category === c ? 'border-primary bg-primary/8 ring-2 ring-primary' : 'bg-card hover:border-ring')}
                  data-testid={`cat-${c}`}
                >
                  {catLabel(c)}
                </button>
              ))}
              <button type="button" onClick={() => setAdding(true)} className="flex min-h-13 items-center justify-center gap-1 rounded-xl border border-dashed text-base text-muted-foreground">
                <Plus className="size-5" />
                {t('new_category')}
              </button>
            </div>
            {adding && (
              <div className="flex gap-2">
                <Input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder={t('new_category')} />
                <Button
                  type="button"
                  size="touch"
                  onClick={async () => {
                    const name = newCat.trim()
                    if (!name) return
                    const key = type === 'expense' ? 'expenseCategories' : 'incomeCategories'
                    if (!cats.includes(name)) await saveSettings({ [key]: [...settings[key], name] })
                    setCategory(name)
                    setNewCat('')
                    setAdding(false)
                  }}
                >
                  {t('add')}
                </Button>
              </div>
            )}
          </Field>
          <Segmented
            value={scope}
            onChange={setScope}
            options={[
              { value: 'business', label: t('business') },
              { value: 'personal', label: t('personal') },
            ]}
          />
          <Field label={type === 'expense' ? t('paid_from') : t('received_in')} error={errors.account}>
            <AccountPicker value={accountId} onChange={(a) => setAccountId(a.id)} />
          </Field>
          <Field label={t('date')}>
            <DateField value={date} onChange={setDate} label={t('date')} />
          </Field>
          <Field label={t('note')} optional={t('optional')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Panel>
        {existing && !existing.voided && (
          <Button type="button" variant="outline" size="touch" className="text-bad" onClick={() => setVoidOpen(true)}>
            <Ban />
            {t('cancel_entry')}
          </Button>
        )}
        {existing && <HistoryList entityId={existing.id} fields={{ amount: (v) => money(Number(v ?? 0)), category: (v) => catLabel(String(v ?? '')), date: (v) => (v ? fmtDate(String(v)) : '') }} />}
        <FormActions>
          <Button type="button" variant="outline" size="xl" onClick={() => navigate(-1)}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="xl" data-testid="save-entry">
            {t('save')}
          </Button>
        </FormActions>
      </form>
      {existing && (
        <VoidDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          title={t('cancel_entry')}
          onConfirm={async (reason) => {
            await voidRow('entries', existing, reason)
            toast.success(t('voided'))
          }}
        />
      )}
    </Page>
  )
}

export function TransferForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, money } = useLocale()
  const { transfers, accounts } = useData()
  const existing = id ? transfers.find((x) => x.id === id) : undefined
  const cash = accounts.find((a) => a.type === 'cash')
  const bank = accounts.find((a) => a.type === 'bank')
  const [fromId, setFromId] = useState(existing?.fromAccountId ?? cash?.id ?? '')
  const [toId, setToId] = useState(existing?.toAccountId ?? bank?.id ?? '')
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? null)
  const [date, setDate] = useState(existing?.date ?? todayIso())
  const [note, setNote] = useState(existing?.note ?? '')
  const [voidOpen, setVoidOpen] = useState(false)

  if (id && !existing) return <NotFound />

  return (
    <Page title={t('new_transfer')} back>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await saveTransfer({ ...(existing ?? {}), id: existing?.id, fromAccountId: fromId, toAccountId: toId, amount: amount ?? 0, date, note })
            toast.success(t('saved'))
            navigate('/money', { replace: true })
          } catch (err) {
            toast.error(errorMessage(err, t))
          }
        }}
      >
        {existing?.voided && (
          <div className="flex items-center gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-4">
            <div className="flex-1 font-semibold text-bad">{t('cancelled')}: {existing.voided.reason}</div>
            <Button type="button" variant="outline" onClick={() => restoreRow('transfers', existing).then(() => toast.success(t('restored')))}>
              <Undo2 />
              {t('restore_entry')}
            </Button>
          </div>
        )}
        <Panel className="flex flex-col gap-4">
          <p className="text-muted-foreground">{t('deposit_example')}</p>
          <Field label={t('from_account')}>
            <AccountPicker value={fromId} onChange={(a) => setFromId(a.id)} />
          </Field>
          <div className="flex justify-center">
            <ArrowDown className="size-8 text-primary" />
          </div>
          <Field label={t('to_account')}>
            <AccountPicker value={toId} onChange={(a) => setToId(a.id)} exclude={fromId} />
          </Field>
          <Field label={t('amount')}>
            <AmountField id="transfer-amount" value={amount} onChange={setAmount} label={t('amount')} />
          </Field>
          <Field label={t('date')}>
            <DateField value={date} onChange={setDate} label={t('date')} />
          </Field>
          <Field label={t('note')} optional={t('optional')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Panel>
        {existing && !existing.voided && (
          <Button type="button" variant="outline" size="touch" className="text-bad" onClick={() => setVoidOpen(true)}>
            <Ban />
            {t('cancel_entry')}
          </Button>
        )}
        {existing && <HistoryList entityId={existing.id} fields={{ amount: (v) => money(Number(v ?? 0)) }} />}
        <FormActions>
          <Button type="button" variant="outline" size="xl" onClick={() => navigate(-1)}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="xl" data-testid="save-transfer">
            {t('save')}
          </Button>
        </FormActions>
      </form>
      {existing && (
        <VoidDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          title={t('cancel_entry')}
          onConfirm={async (reason) => {
            await voidRow('transfers', existing, reason)
            toast.success(t('voided'))
          }}
        />
      )}
    </Page>
  )
}
