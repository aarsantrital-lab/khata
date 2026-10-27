import { useLocale } from '@/app/locale'
import type { DateRange } from '@/lib/bsdate'
import type { Bill, Settings } from '@/lib/types'
import { td, tdNum, th } from './parts'

const ROWS_PER_PAGE = 28

/** IRD-style sales / purchase register, split into printable pages. */
export function BookDocument({
  kind,
  bills,
  range,
  settings,
}: {
  kind: 'sale' | 'purchase'
  bills: Bill[]
  range: DateRange
  settings: Settings
}) {
  const { t, date, money, digitsOf, num } = useLocale()
  const m = (p: number) => money(p, { decimals: true, symbol: false })
  const sign = (b: Bill) => (b.kind === kind ? 1 : -1)
  const totals = bills.reduce(
    (s, b) => ({
      total: s.total + sign(b) * b.totals.total,
      exempt: s.exempt + sign(b) * b.totals.exempt,
      taxable: s.taxable + sign(b) * b.totals.taxable,
      vat: s.vat + sign(b) * b.totals.vat,
    }),
    { total: 0, exempt: 0, taxable: 0, vat: 0 },
  )
  const pages: Bill[][] = []
  for (let i = 0; i < Math.max(bills.length, 1); i += ROWS_PER_PAGE) pages.push(bills.slice(i, i + ROWS_PER_PAGE))
  const title = kind === 'sale' ? t('sales_book') : t('purchase_book')

  return (
    <div className="flex flex-col">
      {pages.map((rows, pageIdx) => (
        <div key={pageIdx} data-pdf-page className="flex flex-col gap-3 border-b border-dashed p-8 last:border-b-0">
          <div className="flex items-end justify-between border-b-2 border-[#0f766e] pb-2">
            <div>
              <div className="text-[20px] font-bold">{settings.shopName}</div>
              <div className="text-[14px]">
                {t('shop_pan')}: {digitsOf(settings.pan || '—')}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[18px] font-bold">{title}</div>
              <div className="text-[13px]">
                {date(range.from)} – {date(range.to)}
              </div>
              <div className="text-[12px] text-[#555]">
                {num(pageIdx + 1)} / {num(pages.length)}
              </div>
            </div>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>{t('sn')}</th>
                <th className={th}>{t('date')}</th>
                <th className={th}>{t('bill_no')}</th>
                <th className={th}>{kind === 'sale' ? t('customer') : t('supplier')}</th>
                <th className={th}>{t('pan')}</th>
                <th className={`${th} text-right`}>{t('total')}</th>
                <th className={`${th} text-right`}>{t('exempt_amount')}</th>
                <th className={`${th} text-right`}>{t('taxable_amount')}</th>
                <th className={`${th} text-right`}>{t('vat')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b, i) => {
                const s = sign(b)
                return (
                  <tr key={b.id}>
                    <td className={td}>{num(pageIdx * ROWS_PER_PAGE + i + 1)}</td>
                    <td className={`${td} whitespace-nowrap`}>{date(b.date, 'short')}</td>
                    <td className={td}>{digitsOf(b.billNo)}</td>
                    <td className={td}>
                      {b.partyName}
                      {s < 0 && <span className="text-[12px] text-[#b91c1c]"> ({t('returns')})</span>}
                    </td>
                    <td className={td}>{digitsOf(b.partyPan || '')}</td>
                    <td className={tdNum}>{m(s * b.totals.total)}</td>
                    <td className={tdNum}>{m(s * b.totals.exempt)}</td>
                    <td className={tdNum}>{m(s * b.totals.taxable)}</td>
                    <td className={tdNum}>{m(s * b.totals.vat)}</td>
                  </tr>
                )
              })}
              {pageIdx === pages.length - 1 && (
                <tr className="font-bold">
                  <td className={td} colSpan={5}>
                    {t('total')}
                  </td>
                  <td className={tdNum}>{m(totals.total)}</td>
                  <td className={tdNum}>{m(totals.exempt)}</td>
                  <td className={tdNum}>{m(totals.taxable)}</td>
                  <td className={tdNum}>{m(totals.vat)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
