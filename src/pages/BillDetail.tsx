import { Ban, FileImage, HandCoins, Pencil, Repeat, RotateCcw, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Amount, StatusBadge } from '@/components/Amount'
import { HistoryList } from '@/components/HistoryList'
import { Page, Panel, Section } from '@/components/Page'
import { PhotoCapture, PhotoCard } from '@/components/Photos'
import { VoidDialog } from '@/components/VoidDialog'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { findBillState, type CreditState, type DocState } from '@/lib/ledger'
import { restoreRow, voidRow } from '@/lib/repo'
import { lineAmount } from '@/lib/vat'
import { NotFound } from './NotFound'

export function BillDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, money, date, num, digitsOf } = useLocale()
  const { billById, partyById, ledgers, bills, settings, photos } = useData()
  const [voidOpen, setVoidOpen] = useState(false)
  const bill = billById.get(id)
  if (!bill) return <NotFound />
  const party = partyById.get(bill.partyId)
  const state = findBillState(ledgers.get(bill.partyId), bill.id)
  const isDoc = bill.kind === 'sale' || bill.kind === 'purchase'
  const doc = isDoc ? (state as DocState | undefined) : undefined
  const credit = !isDoc ? (state as CreditState | undefined) : undefined
  const ref = bill.refBillId ? billById.get(bill.refBillId) : undefined
  const returns = bills.filter((b) => b.refBillId === bill.id && !b.voided)
  const billPhotos = photos.filter((p) => p.billId === bill.id && !p.voided)

  const title = `${t(bill.kind)} · ${digitsOf(bill.billNo)}`

  return (
    <Page
      title={title}
      back
      actions={
        !bill.voided && (
          <Button variant="ghost" size="icon-touch" aria-label={t('edit')} onClick={() => navigate(`/bills/${id}/edit`)}>
            <Pencil />
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {bill.voided && (
          <div className="flex flex-col gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="font-semibold text-bad">{t('cancelled')}</div>
              <div>{bill.voided.reason}</div>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await restoreRow('bills', bill)
                toast.success(t('restored'))
              }}
            >
              <Undo2 />
              {t('restore_entry')}
            </Button>
          </div>
        )}

        <Panel className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link to={`/parties/${bill.partyId}`} className="text-xl font-semibold text-primary">
                {party?.name ?? bill.partyName}
              </Link>
              <div className="text-muted-foreground">
                {date(bill.date)}
                {bill.partyPan && ` · ${t('pan')} ${digitsOf(bill.partyPan)}`}
              </div>
            </div>
            {doc && !bill.voided && <StatusBadge status={doc.status} className="text-base" />}
          </div>
          {ref && (
            <Link to={`/bills/${ref.id}`} className="text-primary">
              {t('returned_against', { no: digitsOf(ref.billNo) })}
            </Link>
          )}
          <div className="flex flex-col divide-y">
            {bill.lines.map((l, i) => (
              <div key={l.id} className="flex items-start gap-3 py-2.5">
                <span className="w-6 text-muted-foreground">{num(i + 1)}.</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {num(l.qty)} {t(l.unit)} × {money(l.rate)}
                    {l.discount > 0 && ` − ${money(l.discount)}`}
                    {!l.taxable && ` · ${t('vat_exempt')}`}
                  </div>
                </div>
                <Amount value={lineAmount(l)} className="font-semibold" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 border-t pt-3">
            <TotalRow label={t('taxable_amount')} value={money(bill.totals.taxable)} />
            {bill.totals.exempt > 0 && <TotalRow label={t('exempt_amount')} value={money(bill.totals.exempt)} />}
            <TotalRow label={`${bill.kind === 'purchase' ? t('vat_paid_claim') : t('vat')} ${num(settings.vatRate / 100)}%`} value={money(bill.totals.vat)} />
            <div className="flex items-center justify-between pt-1">
              <span className="text-lg font-semibold">{t('grand_total')}</span>
              <Amount value={bill.totals.total} className="text-2xl font-bold" />
            </div>
          </div>
          {bill.note && <p className="rounded-xl bg-muted p-3">{bill.note}</p>}
        </Panel>

        {doc && !bill.voided && (
          <Section title={t('payment_history')}>
            <Panel className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-good/10 p-3">
                  <div className="text-sm text-muted-foreground">{t('paid_so_far')}</div>
                  <Amount value={doc.settled} className="text-xl font-bold text-good" />
                </div>
                <div className="rounded-xl bg-bad/8 p-3">
                  <div className="text-sm text-muted-foreground">{t('remaining')}</div>
                  <Amount value={doc.remaining} className="text-xl font-bold text-bad" />
                </div>
              </div>
              {doc.applications.map((a, i) => (
                <Link
                  key={`${a.sourceId}-${i}`}
                  to={a.sourceType === 'payment' ? `/payments/${a.sourceId}` : a.sourceType === 'credit_note' ? `/bills/${a.sourceId}` : '#'}
                  className="flex items-center justify-between rounded-xl px-1 py-2 hover:bg-muted"
                >
                  <span>
                    {date(a.date)} · {a.sourceType === 'payment' ? t('payment') : a.sourceType === 'credit_note' ? t('credit_note') : t('advance')}
                    {a.auto && <span className="ml-1.5 text-sm text-muted-foreground">({t('auto_applied')})</span>}
                  </span>
                  <Amount value={a.amount} className="font-semibold" />
                </Link>
              ))}
            </Panel>
          </Section>
        )}

        {credit && !bill.voided && (
          <Panel className="flex flex-col gap-2">
            {credit.applications.map((a) => (
              <div key={a.docId} className="flex justify-between">
                <span>{t('credit_applied', { no: digitsOf(billById.get(a.docId)?.billNo ?? '—') })}</span>
                <Amount value={a.amount} className="font-semibold" />
              </div>
            ))}
            {credit.unapplied > 0 && (
              <div className="flex justify-between">
                <span>{t('credit_as_advance')}</span>
                <Amount value={credit.unapplied} className="font-semibold" />
              </div>
            )}
          </Panel>
        )}

        {returns.length > 0 && (
          <Section title={t('returns')}>
            <div className="flex flex-col divide-y rounded-2xl border bg-card">
              {returns.map((r) => (
                <Link key={r.id} to={`/bills/${r.id}`} className="flex justify-between px-4 py-3 hover:bg-muted">
                  <span>
                    {digitsOf(r.billNo)} · {date(r.date)}
                  </span>
                  <Amount value={r.totals.total} className="font-semibold" />
                </Link>
              ))}
            </div>
          </Section>
        )}

        {!bill.voided && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {isDoc && (
              <Button
                size="xl"
                className="h-18 flex-col gap-0.5 text-base"
                disabled={!doc || doc.remaining <= 0}
                onClick={() => navigate(`/payments/new?dir=${bill.kind === 'sale' ? 'in' : 'out'}&party=${bill.partyId}&bill=${bill.id}`)}
                data-testid="bill-record-payment"
              >
                <HandCoins />
                {bill.kind === 'sale' ? t('receive_payment') : t('make_payment')}
              </Button>
            )}
            <Button size="xl" variant="outline" className="h-18 flex-col gap-0.5 text-base" onClick={() => navigate(`/bills/${id}/copy`)} data-testid="bill-copy">
              <FileImage />
              {t('bill_copy')}
            </Button>
            {isDoc && (
              <Button size="xl" variant="outline" className="h-18 flex-col gap-0.5 text-base" onClick={() => navigate(`/bills/${id}/return`)} data-testid="bill-return">
                <RotateCcw />
                {t('record_return')}
              </Button>
            )}
            <Button size="xl" variant="outline" className="h-18 flex-col gap-0.5 text-base text-bad" onClick={() => setVoidOpen(true)} data-testid="bill-cancel">
              <Ban />
              {t('cancel_bill')}
            </Button>
          </div>
        )}

        {(billPhotos.length > 0 || !bill.voided) && (
          <Section title={billPhotos.length ? t('bill_photo') : undefined}>
            {billPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="bill-photos">
                {billPhotos.map((p) => (
                  <PhotoCard key={p.id} photo={p} />
                ))}
              </div>
            )}
            {!bill.voided && (
              <div className="grid grid-cols-2 gap-2">
                {isDoc && (
                  <Button size="touch" variant="outline" onClick={() => navigate(`/bills/new/${bill.kind}?repeat=${bill.id}`)} data-testid="bill-repeat">
                    <Repeat />
                    {t('repeat_bill')}
                  </Button>
                )}
                <PhotoCapture size="md" defaults={{ billId: bill.id, partyId: bill.partyId, kind: bill.kind === 'purchase' || bill.kind === 'purchase_return' ? 'purchase' : 'sale' }} />
              </div>
            )}
          </Section>
        )}

        <HistoryList
          entityId={bill.id}
          fields={{
            billNo: (v) => digitsOf(String(v ?? '')),
            date: (v) => (v ? date(String(v)) : ''),
            partyName: (v) => String(v ?? ''),
            partyPan: (v) => digitsOf(String(v ?? '')),
            totals: (v) => money((v as { total?: number } | undefined)?.total ?? 0),
            note: (v) => String(v ?? ''),
          }}
        />
      </div>
      <VoidDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={`${t('cancel_bill')} ${digitsOf(bill.billNo)}`}
        extra={doc && doc.settled > 0 ? t('cancel_bill_payment_note') : undefined}
        onConfirm={async (reason) => {
          await voidRow('bills', bill, reason)
          toast.success(t('voided'))
        }}
      />
    </Page>
  )
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular font-medium">{value}</span>
    </div>
  )
}
