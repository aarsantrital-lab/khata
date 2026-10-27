import { describe, expect, it } from 'vitest'
import { formatPaisa, groupSouthAsian, paisaToInput, parseRupees, percentOf, toLatinDigits, toNepaliDigits } from './money'
import { computeTotals } from './vat'
import type { BillLine } from './types'

describe('money in whole paisa', () => {
  it('parses rupee text without floating point drift', () => {
    expect(parseRupees('0.1')).toBe(10)
    expect(parseRupees('0.29')).toBe(29)
    expect(parseRupees('1,23,456.78')).toBe(12345678)
    expect(parseRupees('१२३४.५')).toBe(123450)
    expect(parseRupees('Rs 50')).toBe(5000)
    expect(parseRupees('12.345')).toBe(1234)
    expect(parseRupees('')).toBeNull()
    expect(parseRupees('abc')).toBeNull()
    expect(parseRupees('.')).toBeNull()
  })

  it('adds up exactly where floats would not', () => {
    const values = Array.from({ length: 10 }, () => parseRupees('0.1')!)
    expect(values.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('groups digits the South Asian way', () => {
    expect(groupSouthAsian('999')).toBe('999')
    expect(groupSouthAsian('1000')).toBe('1,000')
    expect(groupSouthAsian('100000')).toBe('1,00,000')
    expect(groupSouthAsian('12345678')).toBe('1,23,45,678')
  })

  it('formats with Nepali or English digits', () => {
    expect(formatPaisa(900000)).toBe('Rs 9,000')
    expect(formatPaisa(900050, { decimals: true })).toBe('Rs 9,000.50')
    expect(formatPaisa(1234567, { digits: 'ne' })).toBe('रु १२,३४५.६७')
    expect(formatPaisa(-500000)).toBe('−Rs 5,000')
    expect(formatPaisa(250000, { digits: 'en', lang: 'ne' })).toBe('रु 2,500')
    expect(toLatinDigits(toNepaliDigits('2081/04/01'))).toBe('2081/04/01')
  })

  it('round-trips editable values', () => {
    expect(paisaToInput(123450)).toBe('1234.5')
    expect(paisaToInput(123405)).toBe('1234.05')
    expect(parseRupees(paisaToInput(987654321))).toBe(987654321)
  })

  it('rounds percentages half up to the paisa', () => {
    expect(percentOf(10000, 1300)).toBe(1300)
    expect(percentOf(50, 1300)).toBe(7) // 6.5 paisa -> 7
    expect(percentOf(49, 1300)).toBe(6) // 6.37 -> 6
  })
})

const line = (over: Partial<BillLine>): BillLine => ({
  id: Math.random().toString(36),
  name: 'Item',
  unit: 'pcs',
  qty: 1,
  rate: 0,
  discount: 0,
  taxable: true,
  ...over,
})

describe('VAT at 13%', () => {
  it('charges 13% on the taxable subtotal only', () => {
    const t = computeTotals([
      line({ qty: 10, rate: 50000 }), // Rs 5,000 taxable
      line({ qty: 2, rate: 100000, discount: 10000 }), // Rs 1,900 taxable after discount
      line({ qty: 4, rate: 25000, taxable: false }), // Rs 1,000 exempt
    ])
    expect(t.gross).toBe(800000)
    expect(t.discount).toBe(10000)
    expect(t.taxable).toBe(690000)
    expect(t.exempt).toBe(100000)
    expect(t.vat).toBe(89700)
    expect(t.total).toBe(879700)
  })

  it('rounds VAT to whole paisa', () => {
    const t = computeTotals([line({ qty: 1, rate: 12345 })])
    expect(t.vat).toBe(1605) // 1604.85
    expect(t.total).toBe(13950)
  })

  it('never lets a discount make a line negative', () => {
    const t = computeTotals([line({ qty: 1, rate: 1000, discount: 5000 })])
    expect(t.taxable).toBe(0)
    expect(t.total).toBe(0)
  })

  it('handles a fully exempt bill', () => {
    const t = computeTotals([line({ qty: 3, rate: 33333, taxable: false })])
    expect(t.vat).toBe(0)
    expect(t.total).toBe(99999)
  })
})
