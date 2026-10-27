import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { DateField } from '@/components/DateField'
import { DocumentViewer } from '@/components/DocumentViewer'
import { Field, Segmented } from '@/components/Field'
import { Page, Panel } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { addDays, adToBs, bsMonthRange, fiscalYearOf, fiscalYearRange, todayIso } from '@/lib/bsdate'
import { computePartyLedger, openingDocId, partySide } from '@/lib/ledger'
import { NotFound } from '@/pages/NotFound'
import { DocHeader, Signature, Stamp, td, tdNum, th } from './parts'

type Preset = 'month' | 'fy' | 'all' | 'custom'

export function StatementPage() {
  const { id = '' } = useParams()
  const { t, money, date, digitsOf } = useLocale()
  const { partyById, bills, payments, settings, accountById } = useData()
  const party = partyById.get(id)
  const today = todayIso()
  const [preset, setPreset] = useState<Preset>('fy')
  const [customFrom, setCustomFrom] = useState(addDays(today, -30))
  const [customTo, setCustomTo] = useState(today)

  const earliest = useMemo(() => {
    const dates = [party?.openingDate ?? today, ...bills.filter((b) => b.partyId === id).map((b) => b.date), ...payments.filter((p) => p.partyId === id).map((p) => p.date)]
    return dates.sort()[0]
  }, [bills, payments, id, party, today])

  const range = useMemo(() => {
    if (preset === 'month') {
      const bs = adToBs(today)
      return { from: bsMonthRange(bs.y, bs.m).from, to: today }
    }
    if (preset === 'fy') return { from: fiscalYearRange(fiscalYearOf(today)).from, to: today }
    if (preset === 'all') return { from: earliest, to: today }
    return { from: customFrom, to: customTo }
  }, [preset, today, earliest, customFrom, customTo])

  const data = useMemo(() => {
    if (!party) return null
    const at = computePartyLedger(party, bills, payments, range.to)
    const before = computePartyLedger(party, bills, payments, addDays(range.from, -1))
    const inRange = (d: string) => d >= range.from && d <= range.to
    const periodBills = at.docs.filter((d) => d.kind === 'bill' && inRange(d.date))
    const periodCredits = at.credits.filter((c) => c.kind !== 'opening' && inRange(c.date))
    const periodRefunds = at.docs.filter((d) => d.kind === 'refund' && inRange(d.date))
    const openingInRange = at.docs.find((d) => d.kind === 'opening' && inRange(d.date))
    const sign = partySide(party.type).sign
    return {
      at,
      previous: before.balance * sign,
      billed: periodBills.reduce((s, d) => s + d.total, 0) + periodRefunds.reduce((s, d) => s + d.total, 0) + (openingInRange?.total ?? 0),
      paid: periodCredits.reduce((s, c) => s + c.amount, 0),
      openDocs: at.docs.filter((d) => d.remaining > 0),
      periodPayments: periodCredits.filter((c) => c.kind === 'payment'),
      periodNotes: periodCredits.filter((c) => c.kind === 'credit_note'),
      due: at.balance * sign,
    }
  }, [party, bills, payments, range])

  if (!party || !data) return <NotFound />
  const isCustomer = party.type === 'customer'
  const m = (p: number) => money(p, { decimals: true, symbol: false })
  const shareText = `${settings.shopName} — ${t('statement_title')}: ${party.name}. ${t('total_due')} ${money(Math.max(0, data.due))} (${date(range.to)}).`

  return (
    <Page title={`${t('statement')} · ${party.name}`} back>
      <div className="flex flex-col gap-4">
        <Panel className="flex flex-col gap-3">
          <Segmented
            value={preset}
            onChange={setPreset}
            options={[
              { value: 'month', label: t('period_month') },
              { value: 'fy', label: t('period_fy_short') },
              { value: 'all', label: t('all') },
              { value: 'custom', label: t('period_range_short') },
            ]}
          />
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('from')}>
                <DateField value={customFrom} onChange={setCustomFrom} label={t('from')} />
              </Field>
              <Field label={t('to')}>
                <DateField value={customTo} onChange={setCustomTo} label={t('to')} />
              </Field>
            </div>
          )}
        </Panel>

        <DocumentViewer filename={`statement-${party.name.replace(/\W+/g, '-').toLowerCase()}`} shareText={shareText} phone={party.phone}>
          <div className="flex flex-col gap-4 p-8">
            <DocHeader
              settings={settings}
              title={t('statement_title')}
              right={<div className="mt-2 text-[14px]">{t('statement_period', { from: date(range.from), to: date(range.to) })}</div>}
            />
            <div className="flex items-start justify-between">
              <div className="text-[15px]">
                <div className="text-[19px] font-bold">{party.name}</div>
                {party.address && <div>{party.address}</div>}
                {party.phone && <div>{digitsOf(party.phone)}</div>}
                {party.pan && (
                  <div className="font-semibold">
                    {t('pan')}: {digitsOf(party.pan)}
                  </div>
                )}
              </div>
              <div className="rounded-xl border-2 border-[#0f766e] px-5 py-3 text-right">
                <div className="text-[14px]">{t('total_due')}</div>
                <div className="tabular text-[28px] font-extrabold text-[#0f4f4a]" data-testid="statement-due">
                  {money(data.due, { decimals: true })}
                </div>
              </div>
            </div>

            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className={td}>{t('opening_balance')} ({date(range.from)})</td>
                  <td className={tdNum}>{m(data.previous)}</td>
                </tr>
                <tr>
                  <td className={td}>{isCustomer ? t('sales') : t('purchases')}</td>
                  <td className={tdNum}>+ {m(data.billed)}</td>
                </tr>
                <tr>
                  <td className={td}>
                    {isCustomer ? t('payments_received') : t('payments_made')} / {t('returns')}
                  </td>
                  <td className={tdNum}>− {m(data.paid)}</td>
                </tr>
                <tr className="font-bold">
                  <td className={td}>{t('total_due')}</td>
                  <td className={tdNum}>{m(data.due)}</td>
                </tr>
              </tbody>
            </table>

            <div>
              <div className="mb-1.5 text-[16px] font-bold">{t('open_bills')}</div>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>{t('bill_no')}</th>
                    <th className={th}>{t('date')}</th>
                    <th className={`${th} text-right`}>{t('total')}</th>
                    <th className={`${th} text-right`}>{t('paid_so_far')}</th>
                    <th className={`${th} text-right`}>{t('remaining')}</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {data.openDocs.length === 0 && (
                    <tr>
                      <td className={td} colSpan={6}>
                        —
                      </td>
                    </tr>
                  )}
                  {data.openDocs.map((d) => (
                    <tr key={d.id}>
                      <td className={td}>{d.id === openingDocId(party.id) ? t('opening_entry') : d.kind === 'refund' ? t('refund_entry') : digitsOf(d.bill?.billNo ?? '')}</td>
                      <td className={td}>{date(d.date)}</td>
                      <td className={tdNum}>{m(d.total)}</td>
                      <td className={tdNum}>{m(d.settled)}</td>
                      <td className={`${tdNum} font-semibold`}>{m(d.remaining)}</td>
                      <td className={td}>
                        <span className={d.status === 'partial' ? 'font-semibold text-[#b45309]' : 'font-semibold text-[#b91c1c]'}>
                          {d.status === 'partial' ? t('status_partial') : t('status_unpaid')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.periodPayments.length > 0 && (
              <div>
                <div className="mb-1.5 text-[16px] font-bold">{isCustomer ? t('payments_received') : t('payments_made')}</div>
                <table className="w-full border-collapse">
                  <tbody>
                    {data.periodPayments.map((c) => (
                      <tr key={c.id}>
                        <td className={td}>{date(c.date)}</td>
                        <td className={td}>{accountById.get(c.payment?.accountId ?? '')?.name ?? t(c.payment?.method ?? 'cash')}</td>
                        <td className={tdNum}>{m(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(data.periodNotes.length > 0 || data.at.advance > 0) && (
              <div>
                <div className="mb-1.5 text-[16px] font-bold">{t('advances_credits')}</div>
                <table className="w-full border-collapse">
                  <tbody>
                    {data.periodNotes.map((c) => (
                      <tr key={c.id}>
                        <td className={td}>{date(c.date)}</td>
                        <td className={td}>
                          {isCustomer ? t('credit_note') : t('debit_note')} {digitsOf(c.bill?.billNo ?? '')}
                        </td>
                        <td className={tdNum}>{m(c.amount)}</td>
                      </tr>
                    ))}
                    {data.at.advance > 0 && (
                      <tr className="font-semibold">
                        <td className={td} colSpan={2}>
                          {t('advance')}
                        </td>
                        <td className={tdNum}>{m(data.at.advance)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-2 flex items-end justify-between">
              {data.due > 0 ? <Stamp status={data.at.docs.some((d) => d.settled > 0 && d.remaining > 0) ? 'partial' : 'unpaid'} /> : <Stamp status="paid" />}
              <Signature settings={settings} />
            </div>
            <div className="border-t pt-2 text-center text-[13px] text-[#444]">
              {t('statement_disclaimer')} · {t('printed_on', { date: date(today) })}
            </div>
          </div>
        </DocumentViewer>
      </div>
    </Page>
  )
}
