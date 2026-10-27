import { describe, expect, it } from 'vitest'
import {
  accountBalance,
  computePartyLedger,
  openingDocId,
  overdueParties,
  computeAllLedgers,
  receivablePayable,
  stockLevels,
  summarizePeriod,
  trend,
  vatByMonth,
} from './ledger'
import { computeTotals } from './vat'
import type { Account, Bill, BillKind, BillLine, Item, MoneyEntry, Party, Payment, Transfer } from './types'

let seq = 0
const base = () => ({ id: `id${++seq}`, createdAt: ++seq, updatedAt: seq })

const customer = (over: Partial<Party> = {}): Party => ({
  ...base(),
  type: 'customer',
  name: 'Shrestha Electronics',
  phone: '9800000000',
  pan: '',
  address: '',
  openingBalance: 0,
  openingDate: '2024-07-16',
  creditDays: 30,
  note: '',
  ...over,
})

const lines = (amount: number, taxable = false): BillLine[] => [
  { id: 'l', name: 'Goods', unit: 'pcs', qty: 1, rate: amount, discount: 0, taxable },
]

const bill = (party: Party, kind: BillKind, amount: number, date: string, over: Partial<Bill> = {}): Bill => {
  const l = over.lines ?? lines(amount)
  return {
    ...base(),
    kind,
    billNo: String(seq),
    date,
    partyId: party.id,
    partyName: party.name,
    partyPan: party.pan,
    lines: l,
    totals: computeTotals(l),
    note: '',
    ...over,
  }
}

const pay = (party: Party, amount: number, date: string, over: Partial<Payment> = {}): Payment => ({
  ...base(),
  direction: party.type === 'customer' ? 'in' : 'out',
  partyId: party.id,
  date,
  amount,
  accountId: 'cash',
  method: 'cash',
  allocations: [],
  note: '',
  ...over,
})

describe('partial payments', () => {
  it('shows a Rs 9,000 bill with Rs 4,000 paid as partial with Rs 5,000 remaining', () => {
    const p = customer()
    const b = bill(p, 'sale', 900000, '2024-08-01')
    const l = computePartyLedger(p, [b], [pay(p, 400000, '2024-08-02', { allocations: [{ billId: b.id, amount: 400000 }] })])
    const doc = l.docs[0]
    expect(doc.status).toBe('partial')
    expect(doc.settled).toBe(400000)
    expect(doc.remaining).toBe(500000)
    expect(l.balance).toBe(500000)
  })

  it('marks bills unpaid, partial and paid', () => {
    const p = customer()
    const b1 = bill(p, 'sale', 100000, '2024-08-01')
    const b2 = bill(p, 'sale', 100000, '2024-08-02')
    const b3 = bill(p, 'sale', 100000, '2024-08-03')
    const l = computePartyLedger(p, [b1, b2, b3], [pay(p, 150000, '2024-08-04')])
    expect(l.docs.map((d) => d.status)).toEqual(['paid', 'partial', 'unpaid'])
    expect(l.balance).toBe(150000)
  })

  it('applies an unallocated payment to the oldest bills first, regardless of entry order', () => {
    const p = customer()
    const newer = bill(p, 'sale', 300000, '2024-09-10')
    const older = bill(p, 'sale', 200000, '2024-08-10')
    const l = computePartyLedger(p, [newer, older], [pay(p, 250000, '2024-09-15')])
    const byId = new Map(l.docs.map((d) => [d.id, d]))
    expect(byId.get(older.id)!.status).toBe('paid')
    expect(byId.get(newer.id)!.remaining).toBe(250000)
  })

  it('respects payments applied to specific bills, then sends any extra to the oldest bill', () => {
    const p = customer()
    const b1 = bill(p, 'sale', 100000, '2024-08-01')
    const b2 = bill(p, 'sale', 100000, '2024-08-02')
    const l = computePartyLedger(p, [b1, b2], [pay(p, 150000, '2024-08-03', { allocations: [{ billId: b2.id, amount: 150000 }] })])
    const byId = new Map(l.docs.map((d) => [d.id, d]))
    expect(byId.get(b2.id)!.status).toBe('paid')
    expect(byId.get(b1.id)!.remaining).toBe(50000)
    expect(byId.get(b1.id)!.applications[0].auto).toBe(true)
  })

  it('ignores voided bills and payments', () => {
    const p = customer()
    const b = bill(p, 'sale', 100000, '2024-08-01', { voided: { at: 1, reason: 'wrong party' } })
    const l = computePartyLedger(p, [b], [pay(p, 50000, '2024-08-01', { voided: { at: 1, reason: 'typo' } })])
    expect(l.docs).toHaveLength(0)
    expect(l.balance).toBe(0)
  })
})

describe('advances', () => {
  it('holds an advance as credit and uses it on the next bill', () => {
    const p = customer()
    const advance = pay(p, 500000, '2024-08-01')
    const before = computePartyLedger(p, [], [advance])
    expect(before.advance).toBe(500000)
    expect(before.balance).toBe(-500000)

    const b = bill(p, 'sale', 300000, '2024-08-05')
    const after = computePartyLedger(p, [b], [advance])
    expect(after.docs[0].status).toBe('paid')
    expect(after.advance).toBe(200000)
    expect(after.balance).toBe(-200000)

    const b2 = bill(p, 'sale', 300000, '2024-08-06')
    const later = computePartyLedger(p, [b, b2], [advance])
    expect(later.docs[1].status).toBe('partial')
    expect(later.docs[1].remaining).toBe(100000)
    expect(later.advance).toBe(0)
  })

  it('treats a negative opening balance as an advance', () => {
    const p = customer({ openingBalance: -100000 })
    const l = computePartyLedger(p, [bill(p, 'sale', 250000, '2024-08-01')], [])
    expect(l.docs[0].remaining).toBe(150000)
    expect(l.balance).toBe(150000)
  })

  it('a refund of an advance brings the balance back to zero', () => {
    const p = customer()
    const l = computePartyLedger(p, [], [pay(p, 100000, '2024-08-01'), pay(p, 100000, '2024-08-02', { direction: 'out' })])
    expect(l.balance).toBe(0)
    expect(l.advance).toBe(0)
  })

  it('collects a positive opening balance before newer bills', () => {
    const p = customer({ openingBalance: 200000 })
    const b = bill(p, 'sale', 100000, '2024-08-01')
    const l = computePartyLedger(p, [b], [pay(p, 250000, '2024-08-02')])
    expect(l.docs.find((d) => d.id === openingDocId(p.id))!.status).toBe('paid')
    expect(l.docs.find((d) => d.id === b.id)!.remaining).toBe(50000)
  })
})

describe('credit notes (returns)', () => {
  it('reduces the bill it was returned against', () => {
    const p = customer()
    const b = bill(p, 'sale', 900000, '2024-08-01')
    const cn = bill(p, 'sale_return', 200000, '2024-08-03', { refBillId: b.id })
    const l = computePartyLedger(p, [b, cn], [])
    expect(l.docs[0].remaining).toBe(700000)
    expect(l.docs[0].status).toBe('partial')
    expect(l.docs[0].applications[0].sourceType).toBe('credit_note')
    expect(l.balance).toBe(700000)
  })

  it('turns a return on an already paid bill into advance credit', () => {
    const p = customer()
    const b = bill(p, 'sale', 500000, '2024-08-01')
    const payment = pay(p, 500000, '2024-08-01', { allocations: [{ billId: b.id, amount: 500000 }] })
    const cn = bill(p, 'sale_return', 100000, '2024-08-03', { refBillId: b.id })
    const l = computePartyLedger(p, [b, cn], [payment])
    expect(l.docs[0].status).toBe('paid')
    expect(l.advance).toBe(100000)
    expect(l.balance).toBe(-100000)
  })

  it('handles supplier debit notes and payments in the payable direction', () => {
    const s = customer({ type: 'supplier', name: 'Kathmandu Distributors' })
    const purchase = bill(s, 'purchase', 1000000, '2024-08-01')
    const ret = bill(s, 'purchase_return', 100000, '2024-08-02', { refBillId: purchase.id })
    const l = computePartyLedger(s, [purchase, ret], [pay(s, 400000, '2024-08-03')])
    expect(l.docs[0].remaining).toBe(500000)
    expect(l.balance).toBe(-500000) // the shop owes the supplier Rs 5,000
  })
})

describe('totals, history and overdue', () => {
  it('splits balances into receivable and payable', () => {
    const c = customer()
    const s = customer({ type: 'supplier' })
    const bills = [bill(c, 'sale', 300000, '2024-08-01'), bill(s, 'purchase', 120000, '2024-08-01')]
    const ledgers = computeAllLedgers({ parties: [c, s], bills, payments: [] })
    expect(receivablePayable(ledgers.values())).toEqual({ receivable: 300000, payable: 120000 })
  })

  it('computes balances as of an earlier date', () => {
    const c = customer()
    const bills = [bill(c, 'sale', 100000, '2024-08-01'), bill(c, 'sale', 100000, '2024-08-05')]
    expect(computePartyLedger(c, bills, [], '2024-08-02').balance).toBe(100000)
    expect(computePartyLedger(c, bills, []).balance).toBe(200000)
  })

  it('lists overdue parties after their credit days', () => {
    const c = customer({ creditDays: 15 })
    const ledgers = computeAllLedgers({ parties: [c], bills: [bill(c, 'sale', 100000, '2024-08-01')], payments: [] })
    expect(overdueParties([c], ledgers, '2024-08-10')).toHaveLength(0)
    const overdue = overdueParties([c], ledgers, '2024-08-26')
    expect(overdue).toHaveLength(1)
    expect(overdue[0].daysOverdue).toBe(10)
    expect(overdue[0].overdueAmount).toBe(100000)
  })
})

describe('money accounts', () => {
  const cash: Account = { ...base(), id: 'cash', type: 'cash', name: 'Cash', openingBalance: 1000000, openingDate: '2024-07-16' }
  const bank: Account = { ...base(), id: 'bank', type: 'bank', name: 'NIC Asia', openingBalance: 0, openingDate: '2024-07-16' }
  const entry = (type: MoneyEntry['type'], amount: number, accountId = 'cash'): MoneyEntry => ({
    ...base(),
    type,
    category: 'rent',
    scope: 'business',
    accountId,
    amount,
    date: '2024-08-01',
    note: '',
  })

  it('updates balances from payments, expenses, income and transfers', () => {
    const c = customer()
    const transfer: Transfer = { ...base(), fromAccountId: 'cash', toAccountId: 'bank', amount: 500000, date: '2024-08-02', note: '' }
    const data = {
      payments: [pay(c, 200000, '2024-08-01'), pay(c, 50000, '2024-08-01', { direction: 'out' })],
      entries: [entry('expense', 30000), entry('income', 10000), { ...entry('expense', 99999), voided: { at: 1, reason: 'x' } }],
      transfers: [transfer],
    }
    expect(accountBalance(cash, data)).toBe(1000000 + 200000 - 50000 - 30000 + 10000 - 500000)
    expect(accountBalance(bank, data)).toBe(500000)
    expect(accountBalance(cash, data, '2024-08-01')).toBe(1000000 + 200000 - 50000 - 30000 + 10000)
  })
})

describe('stock', () => {
  it('goes up with purchases and down with sales and returns', () => {
    const c = customer()
    const item: Item = {
      ...base(),
      name: 'LED Bulb 9W',
      brand: 'Philips',
      model: '9W',
      category: 'Lighting',
      unit: 'pcs',
      salePrice: 15000,
      costPrice: 12000,
      taxable: true,
      openingQty: 10,
      lowStockAt: 5,
    }
    const withItem = (qty: number): BillLine[] => [{ id: 'l', itemId: item.id, name: item.name, unit: 'pcs', qty, rate: 15000, discount: 0, taxable: true }]
    const bills = [
      bill(c, 'purchase', 0, '2024-08-01', { lines: withItem(20) }),
      bill(c, 'sale', 0, '2024-08-02', { lines: withItem(12) }),
      bill(c, 'sale_return', 0, '2024-08-03', { lines: withItem(2) }),
      bill(c, 'sale', 0, '2024-08-03', { lines: withItem(5), voided: { at: 1, reason: 'x' } }),
    ]
    const levels = stockLevels([item], bills, [{ ...base(), itemId: item.id, date: '2024-08-04', qty: -1, reason: 'damaged' }])
    expect(levels.get(item.id)).toBe(10 + 20 - 12 + 2 - 1)
  })
})

describe('reports and VAT summary', () => {
  it('computes profit from sales, cost and business expenses only', () => {
    const c = customer()
    const sale = bill(c, 'sale', 0, '2024-08-01', {
      lines: [{ id: 'l', name: 'Fan', unit: 'pcs', qty: 2, rate: 300000, discount: 0, taxable: true, cost: 200000 }],
    })
    const entries: MoneyEntry[] = [
      { ...base(), type: 'expense', category: 'rent', scope: 'business', accountId: 'cash', amount: 50000, date: '2024-08-01', note: '' },
      { ...base(), type: 'expense', category: 'personal', scope: 'personal', accountId: 'cash', amount: 70000, date: '2024-08-01', note: '' },
    ]
    const s = summarizePeriod({ from: '2024-08-01', to: '2024-08-31' }, [sale], entries)
    expect(s.netSales).toBe(600000)
    expect(s.outputVat).toBe(78000)
    expect(s.cogs).toBe(400000)
    expect(s.grossProfit).toBe(200000)
    expect(s.netProfit).toBe(150000)
    expect(s.personalExpenses).toBe(70000)
  })

  it('calculates VAT due as collected minus paid, carrying credit forward', () => {
    const c = customer()
    const s = customer({ type: 'supplier' })
    const t = (amount: number) => lines(amount, true)
    const bills = [
      bill(s, 'purchase', 0, '2024-07-20', { lines: t(1000000) }), // input 1,30,000 paisa
      bill(c, 'sale', 0, '2024-07-25', { lines: t(500000) }), // output 65,000
      bill(c, 'sale', 0, '2024-08-20', { lines: t(1000000) }), // output 1,30,000
      bill(c, 'sale_return', 0, '2024-08-21', { lines: t(100000) }), // -13,000
    ]
    const [m1, m2] = vatByMonth(bills, [
      { y: 2081, m: 4, range: { from: '2024-07-16', to: '2024-08-16' } },
      { y: 2081, m: 5, range: { from: '2024-08-17', to: '2024-09-16' } },
    ])
    expect(m1.outputVat).toBe(65000)
    expect(m1.inputVat).toBe(130000)
    expect(m1.payable).toBe(0)
    expect(m1.carriedOut).toBe(65000)
    expect(m2.outputVat).toBe(117000)
    expect(m2.carriedIn).toBe(65000)
    expect(m2.payable).toBe(52000)
  })

  it('colours trends by whether the change is good', () => {
    expect(trend(200, 100, true)).toMatchObject({ direction: 'up', good: true })
    expect(trend(200, 100, false)).toMatchObject({ direction: 'up', good: false })
    expect(trend(50, 100, false)).toMatchObject({ direction: 'down', good: true })
    expect(trend(5, 5, true)).toMatchObject({ direction: 'flat', good: null })
  })
})
