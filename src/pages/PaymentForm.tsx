import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Amount } from '@/components/Amount'
import { DateField } from '@/components/DateField'
import { Field, Segmented } from '@/components/Field'
import { AmountField } from '@/components/NumPad'
import { FormActions, Page, Panel } from '@/components/Page'
import { AccountPicker, PartyPicker } from '@/components/Pickers'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso } from '@/lib/bsdate'
import { computePartyLedger, openingDocId } from '@/lib/ledger'
import { savePayment } from '@/lib/repo'
import type { PaymentDirection } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'
import { errorMessage } from './util'

export function PaymentForm({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { t, money, date: fmtDate, digitsOf } = useLocale()
  const { partyById, accounts, accountById, bills, payments } = useData()
  const existing = mode === 'edit' ? payments.find((p) => p.id === id) : undefined

  const direction: PaymentDirection = existing?.direction ?? (search.get('dir') === 'out' ? 'out' : 'in')
  const [partyId, setPartyId] = useState(existing?.partyId ?? search.get('party') ?? '')
  const [amount, setAmount] = useState<number | null>(existing?.amount ?? null)
  const [date, setDate] = useState(existing?.date ?? todayIso())
  const defaultAccount = accounts.find((a) => a.type === 'cash' && !a.archived) ?? accounts[0]
  const [accountId, setAccountId] = useState(existing?.accountId ?? defaultAccount?.id ?? '')
  const preBill = search.get('bill')
  const [applyMode, setApplyMode] = useState<'auto' | 'pick'>(existing ? (existing.allocations.length ? 'pick' : 'auto') : preBill ? 'pick' : 'auto')
  const [alloc, setAlloc] = useState<Record<string, number>>(() =>
    Object.fromEntries((existing?.allocations ?? []).map((a) => [a.billId, a.amount])),
  )
  const [note, setNote] = useState(existing?.note ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const party = partyById.get(partyId)
  const ledger = useMemo(
    () => (party ? computePartyLedger(party, bills, payments.filter((p) => p.id !== existing?.id)) : undefined),
    [party, bills, payments, existing],
  )
  const openDocs = useMemo(() => (ledger?.docs ?? []).filter((d) => d.remaining > 0 && d.kind !== 'refund'), [ledger])

  const [prefilled, setPrefilled] = useState(false)
  if (!prefilled && preBill && ledger && !existing) {
    const doc = openDocs.find((d) => d.id === preBill)
    if (doc) {
      setAlloc({ [doc.id]: doc.remaining })
      setAmount((a) => a ?? doc.remaining)
    }
    setPrefilled(true)
  }

  if (mode === 'edit' && !existing) return <NotFound />

  const allocated = applyMode === 'pick' ? Object.values(alloc).reduce((s, v) => s + v, 0) : 0
  const unapplied = (amount ?? 0) - (applyMode === 'pick' ? allocated : Math.min(amount ?? 0, ledger?.outstanding ?? 0))

  const toggleDoc = (docId: string, remaining: number) => {
    setAlloc((cur) => {
      const next = { ...cur }
      if (next[docId]) delete next[docId]
      else {
        const used = Object.values(next).reduce((s, v) => s + v, 0)
        const left = Math.max(0, (amount ?? 0) - used)
        next[docId] = amount ? Math.min(remaining, left) || remaining : remaining
      }
      if (!amount) setAmount(Object.values(next).reduce((s, v) => s + v, 0) || null)
      return next
    })
  }

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!partyId) e.party = t('err_party_required')
    if (!amount || amount <= 0) e.amount = t('err_amount_required')
    if (!accountId) e.account = t('err_account_required')
    if (applyMode === 'pick' && allocated > (amount ?? 0)) e.alloc = t('err_allocation_too_large')
    setErrors(e)
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0])
      return
    }
    try {
      const account = accountById.get(accountId)!
      await savePayment({
        ...(existing ?? {}),
        id: existing?.id,
        direction,
        partyId,
        date,
        amount: amount!,
        accountId,
        method: account.type,
        allocations: applyMode === 'pick' ? Object.entries(alloc).map(([billId, a]) => ({ billId, amount: a })) : [],
        note,
      })
      toast.success(t('payment_saved'))
      navigate(`/parties/${partyId}`, { replace: true })
    } catch (err) {
      toast.error(errorMessage(err, t))
    }
  }

  return (
    <Page title={direction === 'in' ? t('receive_payment') : t('make_payment')} back>
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault()
          void submit()
        }}
      >
        <Panel className="flex flex-col gap-4">
          <Field label={direction === 'in' ? t('customer') : t('supplier')} error={errors.party}>
            <PartyPicker
              id="payment-party"
              type={direction === 'in' ? 'customer' : 'supplier'}
              value={partyId}
              invalid={!!errors.party}
              onChange={(p) => {
                setPartyId(p.id)
                setAlloc({})
              }}
            />
            {ledger && <p className="text-base text-muted-foreground">{t('outstanding_now', { amount: money(ledger.outstanding) })}</p>}
          </Field>
          <Field label={t('amount')} error={errors.amount}>
            <AmountField id="payment-amount" value={amount} onChange={setAmount} label={t('amount')} invalid={!!errors.amount} />
          </Field>
          <Field label={t('date')}>
            <DateField value={date} onChange={setDate} label={t('date')} />
          </Field>
          <Field label={direction === 'in' ? t('received_in') : t('paid_from')} error={errors.account}>
            <AccountPicker id="payment-account" value={accountId} onChange={(a) => setAccountId(a.id)} />
          </Field>
        </Panel>

        {party && (
          <Panel className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('apply_to')}</h2>
            {openDocs.length === 0 ? (
              <p className="text-muted-foreground">{t('no_open_bills')}</p>
            ) : (
              <>
                <Segmented
                  value={applyMode}
                  onChange={setApplyMode}
                  options={[
                    { value: 'auto', label: t('apply_auto') },
                    { value: 'pick', label: t('apply_pick') },
                  ]}
                />
                {applyMode === 'pick' && (
                  <div className="flex flex-col gap-2">
                    {openDocs.map((d) => {
                      const on = alloc[d.id] !== undefined
                      return (
                        <div key={d.id} className={cn('flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center', on && 'border-primary bg-primary/5')}>
                          <button type="button" className="flex flex-1 items-center gap-3 text-left" onClick={() => toggleDoc(d.id, d.remaining)} data-testid="alloc-toggle">
                            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg border-2', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                              {on && <Check className="size-5" />}
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold">
                                {d.id === openingDocId(party.id) ? t('opening_entry') : `${t('bill_no')} ${digitsOf(d.bill?.billNo ?? '')}`} · {fmtDate(d.date)}
                              </span>
                              <span className="block text-sm text-muted-foreground">
                                {t('remaining')}: {money(d.remaining)} / {money(d.total)}
                              </span>
                            </span>
                          </button>
                          {on && (
                            <div className="sm:w-44">
                              <AmountField
                                size="md"
                                label={`${t('amount')} — ${d.bill ? digitsOf(d.bill.billNo) : t('opening_entry')}`}
                                value={alloc[d.id]}
                                onChange={(v) => setAlloc((cur) => ({ ...cur, [d.id]: Math.min(v ?? 0, d.remaining) }))}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <p className={cn('font-medium', errors.alloc ? 'text-destructive' : 'text-muted-foreground')}>
                      {t('applied_total', { applied: money(allocated), amount: money(amount ?? 0) })}
                    </p>
                  </div>
                )}
              </>
            )}
            {unapplied > 0 && (
              <p className="rounded-xl bg-secondary p-3 font-medium text-secondary-foreground">{t('unapplied_note', { amount: money(unapplied) })}</p>
            )}
          </Panel>
        )}

        <Panel>
          <Field label={t('note')} optional={t('optional')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Panel>

        {amount !== null && amount > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-muted px-4 py-3">
            <span className="text-lg">{direction === 'in' ? t('payment_in') : t('payment_out')}</span>
            <Amount value={amount} className="text-2xl font-bold" />
          </div>
        )}

        <FormActions>
          <Button type="button" variant="outline" size="xl" onClick={() => navigate(-1)}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="xl" data-testid="save-payment">
            {t('save')}
          </Button>
        </FormActions>
      </form>
    </Page>
  )
}
