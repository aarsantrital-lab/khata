import { AlertTriangle, Camera, Plus, Repeat, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/DateField'
import { Field, Segmented } from '@/components/Field'
import { AmountField, QtyField } from '@/components/NumPad'
import { FormActions, Page, Panel } from '@/components/Page'
import { PhotoImage, PhotoViewer } from '@/components/Photos'
import { AccountPicker, ItemPicker, PartyPicker } from '@/components/Pickers'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso } from '@/lib/bsdate'
import { markPhotoEntered, nextBillNo, saveBill, uid } from '@/lib/repo'
import type { Bill, BillKind, BillLine, BillPhoto, Item } from '@/lib/types'
import { computeTotals, lineAmount } from '@/lib/vat'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'
import { errorMessage } from './util'

type PayMode = 'full' | 'partial' | 'none'

export function BillForm({ mode }: { mode: 'new' | 'edit' | 'return' }) {
  const params = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { t, money, num, digitsOf, date: showDate } = useLocale()
  const { billById, partyById, accounts, settings, bills, ledgers, photoById, itemById, photos } = useData()

  const source = mode !== 'new' ? billById.get(params.id ?? '') : undefined
  const photo =
    mode === 'new'
      ? photoById.get(search.get('photo') ?? '')
      : mode === 'edit'
        ? photos.find((p) => p.billId === source?.id && !p.voided)
        : undefined
  const repeatOf = mode === 'new' ? billById.get(search.get('repeat') ?? '') : undefined
  const initialKind: BillKind =
    mode === 'new'
      ? params.kind === 'purchase'
        ? 'purchase'
        : 'sale'
      : mode === 'return'
        ? source?.kind === 'purchase'
          ? 'purchase_return'
          : 'sale_return'
        : (source?.kind ?? 'sale')
  const kind = initialKind
  const isSaleSide = kind === 'sale' || kind === 'sale_return'
  const isReturn = kind === 'sale_return' || kind === 'purchase_return'

  const initialParty = mode === 'new' ? (search.get('party') ?? repeatOf?.partyId ?? photo?.partyId ?? '') : (source?.partyId ?? '')
  const [partyId, setPartyId] = useState(initialParty)
  const [partyPan, setPartyPan] = useState(
    mode === 'edit' ? (source?.partyPan ?? '') : (partyById.get(initialParty)?.pan ?? ''),
  )
  const [billNo, setBillNo] = useState(mode === 'edit' ? (source?.billNo ?? '') : mode === 'return' ? `CN-${source?.billNo ?? ''}` : '')
  const [date, setDate] = useState(mode === 'edit' ? (source?.date ?? todayIso()) : (photo?.date ?? todayIso()))
  // A repeated bill keeps its rates; the cost for profit follows today's item cost.
  const copyLines = (from: Bill): BillLine[] =>
    from.lines.map((l) => ({ ...l, id: uid(), cost: l.itemId && isSaleSide ? (itemById.get(l.itemId)?.costPrice ?? l.cost) : l.cost }))
  const [lines, setLines] = useState<BillLine[]>(() => {
    if (mode === 'edit' && source) return source.lines.map((l) => ({ ...l }))
    if (mode === 'return' && source) return source.lines.map((l) => ({ ...l, id: uid(), qty: 0, discount: 0 }))
    if (repeatOf) return copyLines(repeatOf)
    return []
  })
  const [copiedFrom, setCopiedFrom] = useState<Bill | undefined>(repeatOf)
  const [note, setNote] = useState(mode === 'edit' ? (source?.note ?? '') : '')
  const [payMode, setPayMode] = useState<PayMode>('none')
  const [payAmount, setPayAmount] = useState<number | null>(null)
  const cashAccount = accounts.find((a) => a.type === 'cash' && !a.archived) ?? accounts[0]
  const [accountId, setAccountId] = useState(cashAccount?.id ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [photoOffScreen, setPhotoOffScreen] = useState(false)
  const [photoViewer, setPhotoViewer] = useState(false)

  useEffect(() => {
    if (mode === 'new' && kind === 'sale') void nextBillNo('sale').then((n) => setBillNo((cur) => cur || n))
  }, [mode, kind])

  const totals = useMemo(() => computeTotals(lines.filter((l) => l.qty > 0), settings.vatRate), [lines, settings.vatRate])
  const duplicate = useMemo(
    () =>
      billNo.trim() &&
      bills.some((b) => b.kind === kind && !b.voided && b.id !== source?.id && b.billNo.trim() === billNo.trim() && (kind === 'sale' || b.partyId === partyId)),
    [bills, billNo, kind, source, partyId],
  )

  const lastBill = useMemo(
    () =>
      mode === 'new' && partyId
        ? bills
            .filter((b) => b.partyId === partyId && b.kind === kind && !b.voided)
            .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0]
        : undefined,
    [mode, partyId, bills, kind],
  )

  if (mode !== 'new' && !source) return <NotFound />

  const updateLine = (id: string, patch: Partial<BillLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const addItem = (item: Item) =>
    setLines((ls) => [
      ...ls,
      {
        id: uid(),
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        qty: 1,
        rate: isSaleSide ? item.salePrice : item.costPrice,
        discount: 0,
        taxable: item.taxable,
        cost: isSaleSide ? item.costPrice : undefined,
      },
    ])
  const addFree = (name: string) => setLines((ls) => [...ls, { id: uid(), name: name.trim(), unit: 'pcs', qty: 1, rate: 0, discount: 0, taxable: true }])

  const payNowAmount = payMode === 'full' ? totals.total : payMode === 'partial' ? (payAmount ?? 0) : 0

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!partyId) e.party = t('err_party_required')
    if (!isReturn && !billNo.trim()) e.billNo = t('err_bill_no_required')
    if (!lines.some((l) => l.qty > 0 && l.name.trim())) e.items = t('err_items_required')
    if (payNowAmount > 0 && !accountId) e.account = t('err_account_required')
    setErrors(e)
    if (Object.keys(e).length) {
      toast.error(Object.values(e)[0])
      return
    }
    setSaving(true)
    try {
      const saved = await saveBill(
        {
          id: mode === 'edit' ? source?.id : undefined,
          kind,
          billNo: billNo.trim(),
          date,
          partyId,
          partyPan: partyPan.trim(),
          lines: mode === 'return' ? lines.filter((l) => l.qty > 0) : lines,
          refBillId: mode === 'return' ? source?.id : source?.refBillId,
          note,
          ...(mode === 'edit' && source?.voided ? { voided: source.voided } : {}),
        },
        mode === 'new' && payNowAmount > 0 ? { amount: payNowAmount, accountId } : undefined,
        settings.vatRate,
      )
      if (photo && mode === 'new') await markPhotoEntered(photo.id, saved)
      toast.success(t('saved'))
      navigate(`/bills/${saved.id}`, { replace: true })
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  const title =
    mode === 'edit' ? t('edit_bill') : mode === 'return' ? t(kind) : kind === 'sale' ? t('new_sale') : t('new_purchase')
  const ledger = ledgers.get(partyId)

  return (
    <Page title={title} back wide={Boolean(photo)}>
      <div className={cn(photo && 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,42%)] lg:items-start')}>
        {photo && <BillPhotoAside photo={photo} entering={mode === 'new'} onOffScreen={setPhotoOffScreen} onOpen={() => setPhotoViewer(true)} />}
        <form
          className="flex min-w-0 flex-col gap-4 lg:order-1"
          onSubmit={(ev) => {
            ev.preventDefault()
            void submit()
          }}
        >
          <Panel className="flex flex-col gap-4">
            <Field label={isSaleSide ? t('customer') : t('supplier')} error={errors.party}>
              {mode === 'return' ? (
                <div className="flex h-14 items-center rounded-xl bg-muted px-3 text-lg font-semibold">{partyById.get(partyId)?.name}</div>
              ) : (
                <PartyPicker
                  id="bill-party"
                  type={isSaleSide ? 'customer' : 'supplier'}
                  value={partyId}
                  invalid={!!errors.party}
                  onChange={(p) => {
                    setPartyId(p.id)
                    setPartyPan(p.pan)
                  }}
                />
              )}
              {ledger && mode === 'new' && ledger.balance !== 0 && (
                <p className="text-sm text-muted-foreground">
                  {ledger.balance > 0 ? t('they_owe') : t('you_owe')}: {money(Math.abs(ledger.balance))}
                  {ledger.advance > 0 && ` · ${t('advance_credit', { amount: money(ledger.advance) })}`}
                </p>
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label={kind === 'purchase' ? t('supplier_bill_no') : t('bill_no')}
                htmlFor="bill-no"
                hint={kind === 'sale' ? t('bill_no_hint') : undefined}
                error={errors.billNo}
              >
                <Input id="bill-no" value={billNo} onChange={(e) => setBillNo(e.target.value)} aria-invalid={!!errors.billNo} />
              </Field>
              <Field label={t('date')}>
                <DateField id="bill-date" value={date} onChange={setDate} label={t('date')} />
              </Field>
              <Field label={t('party_pan')} htmlFor="bill-pan" optional={t('optional')}>
                <Input id="bill-pan" inputMode="numeric" value={partyPan} onChange={(e) => setPartyPan(e.target.value)} />
              </Field>
            </div>
            {duplicate && (
              <p className="flex items-center gap-2 rounded-xl bg-warn/10 p-3 text-sm font-medium">
                <AlertTriangle className="size-5 text-warn" />
                {t('duplicate_bill_no', { no: digitsOf(billNo.trim()) })}
              </p>
            )}
          </Panel>

          <Panel className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{mode === 'return' ? t('return_items') : t('items')}</h2>
              {errors.items && <span className="text-sm text-destructive">{errors.items}</span>}
            </div>
            {copiedFrom && (
              <p className="rounded-xl bg-primary/8 p-3 text-sm font-medium" data-testid="repeated-from">
                {t('repeated_from', { no: digitsOf(copiedFrom.billNo) })}
              </p>
            )}
            {lastBill && lines.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setLines(copyLines(lastBill))
                  setCopiedFrom(lastBill)
                }}
                className="flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10"
                data-testid="repeat-last-bill"
              >
                <Repeat className="size-6 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block font-semibold text-primary">{t('repeat_last_bill')}</span>
                  <span className="block text-sm text-muted-foreground">
                    {t('repeat_last_detail', { no: digitsOf(lastBill.billNo), date: showDate(lastBill.date), amount: money(lastBill.totals.total) })}
                  </span>
                </span>
              </button>
            )}
            {lines.map((line, idx) => {
              const max = mode === 'return' ? source?.lines.find((l) => l.itemId === line.itemId && l.name === line.name)?.qty : undefined
              return (
                <div key={line.id} className={cn('flex flex-col gap-3 rounded-xl border p-3', mode === 'return' && line.qty === 0 && 'opacity-70')} data-testid="bill-line">
                  <div className="flex items-start gap-2">
                    <span className="mt-3 text-sm text-muted-foreground">{num(idx + 1)}.</span>
                    {line.itemId || mode === 'return' ? (
                      <div className="min-w-0 flex-1 py-2.5 text-lg font-semibold">{line.name}</div>
                    ) : (
                      <Input
                        className="flex-1"
                        value={line.name}
                        placeholder={t('item_name')}
                        onChange={(e) => updateLine(line.id, { name: e.target.value })}
                        aria-label={t('item_name')}
                      />
                    )}
                    {mode !== 'return' && (
                      <Button type="button" variant="ghost" size="icon-touch" aria-label={t('remove')} onClick={() => setLines((ls) => ls.filter((l) => l.id !== line.id))}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field label={`${t('qty')}${max !== undefined ? ` (≤ ${num(max)})` : ''}`}>
                      <QtyField
                        label={t('qty')}
                        value={line.qty}
                        suffix={t(line.unit)}
                        onChange={(q) => updateLine(line.id, { qty: max !== undefined ? Math.min(q, max) : q })}
                      />
                    </Field>
                    <Field label={t('rate')}>
                      <AmountField size="md" label={`${t('rate')} — ${line.name}`} value={line.rate} onChange={(v) => updateLine(line.id, { rate: v ?? 0 })} />
                    </Field>
                    <Field label={t('discount')}>
                      <AmountField size="md" label={`${t('discount')} — ${line.name}`} value={line.discount || null} placeholder="—" onChange={(v) => updateLine(line.id, { discount: v ?? 0 })} />
                    </Field>
                    <Field label={t('amount')}>
                      <div className="tabular flex h-12 items-center justify-end rounded-xl bg-muted px-3 text-lg font-semibold">{money(lineAmount(line))}</div>
                    </Field>
                  </div>
                  <Segmented
                    value={line.taxable ? 'taxable' : 'exempt'}
                    onChange={(v) => updateLine(line.id, { taxable: v === 'taxable' })}
                    options={[
                      { value: 'taxable', label: t('taxable') },
                      { value: 'exempt', label: t('vat_exempt') },
                    ]}
                  />
                </div>
              )
            })}
            {mode !== 'return' && (
              <Button type="button" variant="secondary" size="xl" onClick={() => setPickerOpen(true)} data-testid="add-line">
                <Plus />
                {t('add_line')}
              </Button>
            )}
          </Panel>

          <Panel className="flex flex-col gap-2 text-lg" data-testid="bill-totals">
            <Row label={t('subtotal')} value={money(totals.gross)} />
            {totals.discount > 0 && <Row label={t('discount')} value={`− ${money(totals.discount)}`} />}
            <Row label={t('taxable_amount')} value={money(totals.taxable)} />
            {totals.exempt > 0 && <Row label={t('exempt_amount')} value={money(totals.exempt)} />}
            <Row label={`${t('vat')} ${num(settings.vatRate / 100)}%`} value={money(totals.vat)} />
            <div className="mt-1 flex items-center justify-between border-t pt-3">
              <span className="text-xl font-semibold">{t('grand_total')}</span>
              <span className="tabular text-3xl font-bold" data-testid="bill-total">
                {money(totals.total)}
              </span>
            </div>
          </Panel>

          {mode === 'new' && (
            <Panel className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">{t('payment_now')}</h2>
              <Segmented
                size="lg"
                value={payMode}
                onChange={setPayMode}
                options={[
                  { value: 'full', label: t('pay_full') },
                  { value: 'partial', label: t('pay_partial') },
                  { value: 'none', label: t('pay_none') },
                ]}
              />
              {payMode === 'partial' && (
                <Field label={t('paid_now_amount')}>
                  <AmountField id="pay-now" value={payAmount} onChange={setPayAmount} label={t('paid_now_amount')} />
                </Field>
              )}
              {payMode !== 'none' && (
                <Field label={kind === 'sale' ? t('received_in') : t('paid_from')} error={errors.account}>
                  <AccountPicker value={accountId} onChange={(a) => setAccountId(a.id)} />
                </Field>
              )}
              {payMode === 'partial' && payAmount !== null && payAmount < totals.total && (
                <p className="text-base font-medium text-warn-strong">{t('partial_remaining', { amount: money(totals.total - payAmount) })}</p>
              )}
            </Panel>
          )}

          <Panel>
            <Field label={t('note')} optional={t('optional')}>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </Panel>

          <FormActions>
            {photo && photoOffScreen && (
              <Button
                type="button"
                variant="secondary"
                size="xl"
                className="flex-none! px-4 lg:hidden"
                aria-label={t('show_photo')}
                onClick={() => setPhotoViewer(true)}
                data-testid="photo-fab"
              >
                <Camera className="size-6" />
              </Button>
            )}
            <Button type="button" variant="outline" size="xl" onClick={() => navigate(-1)}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="xl" disabled={saving} data-testid="save-bill">
              {t('save')}
            </Button>
          </FormActions>
        </form>
      </div>
      <ItemPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={addItem} onNewLine={addFree} />
      {photo && <PhotoViewer photo={photo} open={photoViewer} onOpenChange={setPhotoViewer} />}
    </Page>
  )
}

/** The bill photo beside the form: on top on a phone, a sticky column on a laptop. */
function BillPhotoAside({
  photo,
  entering,
  onOffScreen,
  onOpen,
}: {
  photo: BillPhoto
  entering: boolean
  onOffScreen: (offScreen: boolean) => void
  onOpen: () => void
}) {
  const { t } = useLocale()
  const [shown, setShown] = useState(true)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => onOffScreen(!e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [onOffScreen])
  return (
    <aside ref={ref} className="flex flex-col gap-2 lg:sticky lg:top-20 lg:order-2" data-testid="bill-photo-aside">
      <Panel className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <Camera className="size-5 text-primary" />
            {t('bill_photo')}
          </span>
          <Button type="button" variant="ghost" className="lg:hidden" onClick={() => setShown((v) => !v)} data-testid="toggle-bill-photo">
            {shown ? t('hide_photo') : t('show_photo')}
          </Button>
        </div>
        <div className={cn(!shown && 'max-lg:hidden')}>
          <PhotoImage photo={photo} className="h-[42dvh] lg:h-[calc(100dvh-12rem)]" onOpen={onOpen} />
        </div>
        {entering && <p className="text-sm text-muted-foreground">{t('enter_from_photo_hint')}</p>}
      </Panel>
    </aside>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  )
}
