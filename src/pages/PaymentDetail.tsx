import { Ban, Pencil, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Amount, StatusBadge } from '@/components/Amount'
import { HistoryList } from '@/components/HistoryList'
import { Page, Panel } from '@/components/Page'
import { VoidDialog } from '@/components/VoidDialog'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { findBillState, openingDocId, type CreditState } from '@/lib/ledger'
import { restoreRow, voidRow } from '@/lib/repo'
import { NotFound } from './NotFound'

export function PaymentDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, money, date, digitsOf } = useLocale()
  const { payments, partyById, accountById, ledgers, billById } = useData()
  const [voidOpen, setVoidOpen] = useState(false)
  const payment = payments.find((p) => p.id === id)
  if (!payment) return <NotFound />
  const party = partyById.get(payment.partyId)
  const credit = findBillState(ledgers.get(payment.partyId), payment.id) as CreditState | undefined

  return (
    <Page
      title={payment.direction === 'in' ? t('payment_in') : t('payment_out')}
      back
      actions={
        !payment.voided && (
          <Button variant="ghost" size="icon-touch" aria-label={t('edit')} onClick={() => navigate(`/payments/${id}/edit`)}>
            <Pencil />
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {payment.voided && (
          <div className="flex flex-col gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="font-semibold text-bad">{t('cancelled')}</div>
              <div>{payment.voided.reason}</div>
            </div>
            <Button variant="outline" onClick={() => restoreRow('payments', payment).then(() => toast.success(t('restored')))}>
              <Undo2 />
              {t('restore_entry')}
            </Button>
          </div>
        )}
        <Panel className="flex flex-col gap-2">
          <Link to={`/parties/${payment.partyId}`} className="text-xl font-semibold text-primary">
            {party?.name}
          </Link>
          <Amount value={payment.amount} className={payment.direction === 'in' ? 'text-4xl font-bold text-good' : 'text-4xl font-bold text-bad'} />
          <div className="text-lg">
            {date(payment.date)} · {accountById.get(payment.accountId)?.name ?? t(payment.method)}
          </div>
          {payment.note && <p className="rounded-xl bg-muted p-3">{payment.note}</p>}
          {payment.voided && <StatusBadge cancelled />}
        </Panel>

        {credit && (
          <Panel className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t('apply_to')}</h2>
            {credit.applications.map((a) => (
              <Link key={a.docId} to={a.docId === openingDocId(payment.partyId) ? '#' : `/bills/${a.docId}`} className="flex justify-between rounded-lg px-1 py-1.5 hover:bg-muted">
                <span>
                  {a.docId === openingDocId(payment.partyId) ? t('opening_entry') : `${t('bill_no')} ${digitsOf(billById.get(a.docId)?.billNo ?? '—')}`}
                  {a.auto && <span className="ml-1.5 text-sm text-muted-foreground">({t('auto_applied')})</span>}
                </span>
                <span className="tabular font-semibold">{money(a.amount)}</span>
              </Link>
            ))}
            {credit.unapplied > 0 && (
              <div className="flex justify-between px-1">
                <span>{t('credit_as_advance')}</span>
                <span className="tabular font-semibold">{money(credit.unapplied)}</span>
              </div>
            )}
          </Panel>
        )}

        {!payment.voided && (
          <Button variant="outline" size="xl" className="text-bad" onClick={() => setVoidOpen(true)}>
            <Ban />
            {t('cancel_entry')}
          </Button>
        )}
        <HistoryList
          entityId={payment.id}
          fields={{ amount: (v) => money(Number(v ?? 0)), date: (v) => (v ? date(String(v)) : ''), note: (v) => String(v ?? '') }}
        />
      </div>
      <VoidDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={t('cancel_entry')}
        onConfirm={async (reason) => {
          await voidRow('payments', payment, reason)
          toast.success(t('voided'))
        }}
      />
    </Page>
  )
}
