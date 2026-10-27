import { percentOf, type Paisa } from './money'
import type { BillLine, BillTotals } from './types'

export const DEFAULT_VAT_RATE = 1300

export function lineGross(line: Pick<BillLine, 'qty' | 'rate'>): Paisa {
  return Math.round(line.qty * line.rate)
}

export function lineAmount(line: Pick<BillLine, 'qty' | 'rate' | 'discount'>): Paisa {
  return Math.max(0, lineGross(line) - line.discount)
}

/**
 * VAT is charged once on the bill's taxable subtotal (rates exclude VAT),
 * which matches how the VAT is written in the handwritten bill book.
 */
export function computeTotals(lines: BillLine[], vatRate: number = DEFAULT_VAT_RATE): BillTotals {
  let gross = 0
  let discount = 0
  let taxable = 0
  let exempt = 0
  for (const line of lines) {
    const g = lineGross(line)
    const d = Math.min(line.discount, g)
    gross += g
    discount += d
    if (line.taxable) taxable += g - d
    else exempt += g - d
  }
  const vat = percentOf(taxable, vatRate)
  return { gross, discount, taxable, exempt, vat, total: taxable + exempt + vat }
}
