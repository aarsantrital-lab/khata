import { ArrowDownLeft, ArrowUpRight, BellRing, FileText, MapPin, MessageCircle, MessageSquare, Pencil, Phone, ShoppingCart, Smartphone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Amount, StatusBadge } from '@/components/Amount'
import { EmptyState, Segmented } from '@/components/Field'
import { HistoryList } from '@/components/HistoryList'
import { Page } from '@/components/Page'
import { PhotoCapture, PhotoCard } from '@/components/Photos'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso } from '@/lib/bsdate'
import { partySide } from '@/lib/ledger'
import { smsLink, viberLink, whatsappLink } from '@/lib/share'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'

export function PartyDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, money, date, num, digitsOf } = useLocale()
  const { partyById, ledgers, bills, payments, accountById, settings, photos } = useData()
  const party = partyById.get(id)
  const ledger = ledgers.get(id)
  const [tab, setTab] = useState<'bills' | 'payments' | 'photos'>('bills')
  const [remindOpen, setRemindOpen] = useState(false)

  const cancelledBills = useMemo(() => bills.filter((b) => b.partyId === id && b.voided), [bills, id])
  const cancelledPayments = useMemo(() => payments.filter((p) => p.partyId === id && p.voided), [payments, id])
  const partyPhotos = useMemo(() => photos.filter((p) => p.partyId === id && !p.voided), [photos, id])

  if (!party || !ledger) return <NotFound />
  const isCustomer = party.type === 'customer'
  const owed = ledger.balance * partySide(party.type).sign
  const message = t('reminder_message', {
    name: party.name,
    shop: settings.shopName || t('app_name'),
    amount: money(Math.max(0, ledger.balance)),
    date: date(todayIso()),
  })

  const billRows = [
    ...ledger.docs.filter((d) => d.kind !== 'refund').map((d) => ({ type: 'doc' as const, d })),
    ...ledger.credits.filter((c) => c.kind === 'credit_note').map((c) => ({ type: 'credit' as const, c })),
  ].sort((a, b) => {
    const da = a.type === 'doc' ? a.d.date : a.c.date
    const db = b.type === 'doc' ? b.d.date : b.c.date
    return db.localeCompare(da)
  })

  const paymentRows = [
    ...ledger.credits.filter((c) => c.kind === 'payment').map((c) => ({ id: c.id, date: c.date, amount: c.amount, payment: c.payment!, incoming: isCustomer, unapplied: c.unapplied })),
    ...ledger.docs.filter((d) => d.kind === 'refund').map((d) => ({ id: d.id, date: d.date, amount: d.total, payment: d.payment!, incoming: !isCustomer, unapplied: 0 })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.payment.createdAt - a.payment.createdAt)

  return (
    <Page
      title={party.name}
      back="/parties"
      actions={
        <Button variant="ghost" size="icon-touch" aria-label={t('edit')} onClick={() => navigate(`/parties/${id}/edit`)}>
          <Pencil />
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-medium text-secondary-foreground">
            {isCustomer ? t('customer') : t('supplier')}
          </span>
          {party.phone && (
            <a href={`tel:${party.phone}`} className="flex items-center gap-1 text-primary">
              <Phone className="size-4" />
              {digitsOf(party.phone)}
            </a>
          )}
          {party.pan && (
            <span>
              {t('pan')}: {digitsOf(party.pan)}
            </span>
          )}
          {party.address && (
            <span className="flex items-center gap-1">
              <MapPin className="size-4" />
              {party.address}
            </span>
          )}
        </div>

        <div
          className={cn(
            'flex flex-col gap-1 rounded-2xl p-5',
            ledger.balance > 0 ? 'bg-good/10' : ledger.balance < 0 ? 'bg-bad/8' : 'bg-muted',
          )}
          data-testid="party-balance"
        >
          <span className="text-lg font-medium">
            {ledger.balance > 0 ? t('they_owe') : ledger.balance < 0 ? t('you_owe') : t('settled_up')}
          </span>
          <span className={cn('tabular text-4xl font-bold', ledger.balance > 0 ? 'text-good' : ledger.balance < 0 ? 'text-bad' : '')}>
            {money(Math.abs(ledger.balance))}
          </span>
          {ledger.advance > 0 && <span className="text-base font-medium">{t('advance_credit', { amount: money(ledger.advance) })}</span>}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button size="xl" className="h-18 flex-col gap-0.5 text-base" onClick={() => navigate(`/bills/new/${isCustomer ? 'sale' : 'purchase'}?party=${id}`)}>
            <ShoppingCart />
            {isCustomer ? t('new_sale_for') : t('new_purchase_for')}
          </Button>
          <Button
            size="xl"
            variant="outline"
            className="h-18 flex-col gap-0.5 text-base"
            onClick={() => navigate(`/payments/new?dir=${isCustomer ? 'in' : 'out'}&party=${id}`)}
            data-testid="party-payment"
          >
            {isCustomer ? <ArrowDownLeft /> : <ArrowUpRight />}
            {isCustomer ? t('receive_payment') : t('make_payment')}
          </Button>
          <Button size="xl" variant="outline" className="h-18 flex-col gap-0.5 text-base" onClick={() => setRemindOpen(true)} disabled={!isCustomer || owed <= 0}>
            <BellRing />
            {t('remind')}
          </Button>
          <Button size="xl" variant="outline" className="h-18 flex-col gap-0.5 text-base" onClick={() => navigate(`/parties/${id}/statement`)} data-testid="party-statement">
            <FileText />
            {t('statement')}
          </Button>
        </div>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'bills', label: `${t('party_bills')} (${num(billRows.length)})` },
            { value: 'payments', label: `${t('party_payments')} (${num(paymentRows.length)})` },
            { value: 'photos', label: `${t('photos_of_party')} (${num(partyPhotos.length)})` },
          ]}
        />

        {tab === 'photos' && (
          <div className="flex flex-col gap-3" data-testid="party-photos">
            <PhotoCapture size="md" defaults={{ partyId: id, kind: isCustomer ? 'sale' : 'purchase' }} />
            {partyPhotos.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {partyPhotos.map((p) => (
                  <PhotoCard key={p.id} photo={p} />
                ))}
              </div>
            ) : (
              <EmptyState title={t('no_party_photos')} />
            )}
          </div>
        )}

        {tab === 'bills' &&
          (billRows.length === 0 && cancelledBills.length === 0 ? (
            <EmptyState title={t('no_bills')} />
          ) : (
            <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
              {billRows.map((row) =>
                row.type === 'doc' ? (
                  <Link
                    key={row.d.id}
                    to={row.d.bill ? `/bills/${row.d.bill.id}` : '#'}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted"
                    data-testid="party-bill-row"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold">
                        {row.d.kind === 'opening' ? t('opening_entry') : `${t('bill_no')} ${digitsOf(row.d.bill?.billNo ?? '')}`}
                      </div>
                      <div className="text-sm text-muted-foreground">{date(row.d.date)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Amount value={row.d.total} className="text-lg font-semibold" />
                      {row.d.status === 'partial' ? (
                        <span className="text-sm font-semibold text-warn-strong">{t('partial_remaining', { amount: money(row.d.remaining) })}</span>
                      ) : (
                        <StatusBadge status={row.d.status} />
                      )}
                    </div>
                  </Link>
                ) : (
                  <Link key={row.c.id} to={`/bills/${row.c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-semibold">
                        {isCustomer ? t('credit_note') : t('debit_note')} {digitsOf(row.c.bill?.billNo ?? '')}
                      </div>
                      <div className="text-sm text-muted-foreground">{date(row.c.date)}</div>
                    </div>
                    <Amount value={-row.c.amount} className="text-lg font-semibold text-good" />
                  </Link>
                ),
              )}
              {cancelledBills.map((b) => (
                <Link key={b.id} to={`/bills/${b.id}`} className="flex items-center gap-3 px-4 py-3 opacity-60 hover:bg-muted">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg line-through">
                      {t('bill_no')} {digitsOf(b.billNo)}
                    </div>
                    <div className="text-sm text-muted-foreground">{date(b.date)}</div>
                  </div>
                  <StatusBadge cancelled />
                </Link>
              ))}
            </div>
          ))}

        {tab === 'payments' &&
          (paymentRows.length === 0 && cancelledPayments.length === 0 ? (
            <EmptyState title={t('nothing_yet')} />
          ) : (
            <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
              {paymentRows.map((p) => (
                <Link key={p.id} to={`/payments/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                  {p.incoming ? <ArrowDownLeft className="size-6 text-good" /> : <ArrowUpRight className="size-6 text-bad" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{accountById.get(p.payment.accountId)?.name ?? t(p.payment.method)}</div>
                    <div className="text-sm text-muted-foreground">
                      {date(p.date)}
                      {p.unapplied > 0 && ` · ${t('advance')} ${money(p.unapplied)}`}
                    </div>
                  </div>
                  <Amount value={p.amount} className={cn('text-lg font-semibold', p.incoming ? 'text-good' : 'text-bad')} />
                </Link>
              ))}
              {cancelledPayments.map((p) => (
                <Link key={p.id} to={`/payments/${p.id}`} className="flex items-center gap-3 px-4 py-3 opacity-60 hover:bg-muted">
                  <div className="min-w-0 flex-1 text-lg line-through">{date(p.date)}</div>
                  <Amount value={p.amount} />
                  <StatusBadge cancelled />
                </Link>
              ))}
            </div>
          ))}

        <HistoryList
          entityId={party.id}
          fields={{
            name: (v) => String(v ?? ''),
            phone: (v) => String(v ?? ''),
            pan: (v) => String(v ?? ''),
            address: (v) => String(v ?? ''),
            openingBalance: (v) => money(Number(v ?? 0)),
            creditDays: (v) => num(Number(v ?? 0)),
          }}
        />
      </div>

      <Dialog open={remindOpen} onOpenChange={setRemindOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('remind')}</DialogTitle>
            <DialogDescription>{party.phone ? party.phone : t('no_phone')}</DialogDescription>
          </DialogHeader>
          <p className="rounded-xl bg-muted p-3 text-base">{message}</p>
          <div className="grid gap-2">
            <Button size="xl" className="justify-start bg-[#25D366] text-white hover:bg-[#1ebe5b]" render={<a href={whatsappLink(party.phone, message)} target="_blank" rel="noreferrer" />} nativeButton={false}>
              <MessageCircle />
              {t('whatsapp')}
            </Button>
            <Button size="xl" className="justify-start bg-[#7360f2] text-white hover:bg-[#6150d8]" render={<a href={viberLink(message)} />} nativeButton={false}>
              <Smartphone />
              {t('viber')}
            </Button>
            <Button size="xl" variant="outline" className="justify-start" render={<a href={smsLink(party.phone, message)} />} nativeButton={false} disabled={!party.phone}>
              <MessageSquare />
              {t('sms')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
