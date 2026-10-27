import { useParams } from 'react-router-dom'
import { DocumentViewer } from '@/components/DocumentViewer'
import { Page } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso } from '@/lib/bsdate'
import { findBillState, type CreditState, type DocState } from '@/lib/ledger'
import { lineAmount } from '@/lib/vat'
import { NotFound } from '@/pages/NotFound'
import { DocHeader, Signature, Stamp, td, tdNum, th } from './parts'

export function BillCopyPage() {
  const { id = '' } = useParams()
  const { t, money, date, num, digitsOf } = useLocale()
  const { billById, partyById, ledgers, settings, payments, accountById } = useData()
  const bill = billById.get(id)
  if (!bill) return <NotFound />
  const party = partyById.get(bill.partyId)
  const state = findBillState(ledgers.get(bill.partyId), bill.id)
  const isDoc = bill.kind === 'sale' || bill.kind === 'purchase'
  const doc = isDoc ? (state as DocState | undefined) : undefined
  const credit = !isDoc ? (state as CreditState | undefined) : undefined
  const ref = bill.refBillId ? billById.get(bill.refBillId) : undefined
  const refNo = ref?.billNo ?? bill.billNo
  const title = bill.kind === 'sale_return' ? t('credit_note') : bill.kind === 'purchase_return' ? t('debit_note') : t('bill_copy_title')
  const paymentById = new Map(payments.map((p) => [p.id, p]))
  const m = (p: number) => money(p, { decimals: true, symbol: false })

  const shareText = doc
    ? `${settings.shopName} — ${t('bill_no')} ${digitsOf(bill.billNo)}, ${date(bill.date)}. ${t('grand_total')} ${money(bill.totals.total)}. ${t('remaining')} ${money(doc.remaining)}.`
    : `${settings.shopName} — ${title} ${digitsOf(bill.billNo)}`

  return (
    <Page title={`${title} · ${digitsOf(bill.billNo)}`} back>
      <DocumentViewer filename={`bill-${bill.billNo || bill.id.slice(0, 6)}`} shareText={shareText} phone={party?.phone}>
        <div className="relative flex flex-col gap-4 p-8 font-sans">
          <DocHeader
            settings={settings}
            title={title}
            right={
              <div className="mt-2 text-[15px]">
                <div>
                  {t('ref_bill_no')}: <b>{digitsOf(refNo)}</b>
                </div>
                {!isDoc && (
                  <div>
                    {t('bill_no')}: <b>{digitsOf(bill.billNo)}</b>
                  </div>
                )}
                <div>
                  {t('date')}: <b>{date(bill.date)}</b>
                </div>
              </div>
            }
          />

          <div className="flex items-start justify-between gap-4">
            <div className="text-[15px]">
              <div className="text-[13px] tracking-wide text-[#555] uppercase">{t('bill_to')}</div>
              <div className="text-[19px] font-bold">{party?.name ?? bill.partyName}</div>
              {party?.address && <div>{party.address}</div>}
              {party?.phone && <div>{digitsOf(party.phone)}</div>}
              {bill.partyPan && (
                <div className="font-semibold">
                  {t('pan')}: {digitsOf(bill.partyPan)}
                </div>
              )}
            </div>
            {doc && !bill.voided && <Stamp status={doc.status} className="mt-2 mr-4" />}
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} w-10`}>{t('sn')}</th>
                <th className={th}>{t('item_name')}</th>
                <th className={`${th} text-right`}>{t('qty')}</th>
                <th className={`${th} text-right`}>{t('rate')}</th>
                <th className={`${th} text-right`}>{t('discount')}</th>
                <th className={`${th} text-right`}>{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l, i) => (
                <tr key={l.id}>
                  <td className={td}>{num(i + 1)}</td>
                  <td className={td}>
                    {l.name}
                    {!l.taxable && <span className="ml-1 text-[12px] text-[#555]">({t('vat_exempt')})</span>}
                  </td>
                  <td className={tdNum}>
                    {num(l.qty)} {t(l.unit)}
                  </td>
                  <td className={tdNum}>{m(l.rate)}</td>
                  <td className={tdNum}>{l.discount ? m(l.discount) : '—'}</td>
                  <td className={tdNum}>{m(lineAmount(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <table className="w-80 border-collapse text-[15px]">
              <tbody>
                <tr>
                  <td className="py-0.5">{t('taxable_amount')}</td>
                  <td className="tabular py-0.5 text-right">{m(bill.totals.taxable)}</td>
                </tr>
                {bill.totals.exempt > 0 && (
                  <tr>
                    <td className="py-0.5">{t('exempt_amount')}</td>
                    <td className="tabular py-0.5 text-right">{m(bill.totals.exempt)}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-0.5">
                    {t('vat')} {num(settings.vatRate / 100)}%
                  </td>
                  <td className="tabular py-0.5 text-right">{m(bill.totals.vat)}</td>
                </tr>
                <tr className="border-t-2 border-[#0f766e] text-[19px] font-bold">
                  <td className="pt-1">{t('grand_total')}</td>
                  <td className="tabular pt-1 text-right">{money(bill.totals.total, { decimals: true })}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {doc && (
            <div className="rounded-lg border border-[#cbd5d1] p-3">
              <div className="mb-2 text-[16px] font-bold">{t('payment_history')}</div>
              {doc.applications.length === 0 ? (
                <div className="text-[14px] text-[#555]">—</div>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {doc.applications.map((a, i) => {
                      const p = a.sourceType === 'payment' ? paymentById.get(a.sourceId) : undefined
                      return (
                        <tr key={i}>
                          <td className="py-0.5 text-[14px]">{date(a.date)}</td>
                          <td className="py-0.5 text-[14px]">
                            {p ? (accountById.get(p.accountId)?.name ?? t(p.method)) : a.sourceType === 'credit_note' ? t('credit_note') : t('advance')}
                          </td>
                          <td className="tabular py-0.5 text-right text-[14px]">{m(a.amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              <div className="mt-2 flex justify-between border-t pt-2 text-[16px]">
                <span>
                  {t('paid_so_far')}: <b className="tabular">{money(doc.settled, { decimals: true })}</b>
                </span>
                <span>
                  {t('remaining')}: <b className="tabular">{money(doc.remaining, { decimals: true })}</b>
                </span>
              </div>
            </div>
          )}

          {credit && (
            <div className="rounded-lg border border-[#cbd5d1] p-3 text-[15px]">
              {credit.applications.map((a) => (
                <div key={a.docId} className="flex justify-between">
                  <span>{t('credit_applied', { no: digitsOf(billById.get(a.docId)?.billNo ?? '—') })}</span>
                  <b className="tabular">{m(a.amount)}</b>
                </div>
              ))}
              {credit.unapplied > 0 && (
                <div className="flex justify-between">
                  <span>{t('credit_as_advance')}</span>
                  <b className="tabular">{m(credit.unapplied)}</b>
                </div>
              )}
            </div>
          )}

          {bill.note && <div className="text-[14px]">{bill.note}</div>}

          <div className="mt-4 flex items-end justify-between">
            <div className="text-[13px] text-[#555]">{t('printed_on', { date: date(todayIso()) })}</div>
            <Signature settings={settings} />
          </div>

          <div className="border-t pt-2 text-center text-[13px] text-[#444]" data-testid="vat-footer">
            {t('footer_disclaimer', { no: digitsOf(refNo) })}
          </div>
        </div>
      </DocumentViewer>
    </Page>
  )
}
