import { addDays, daysBetween, type DateRange, type ISODate } from './bsdate'
import type { Paisa } from './money'
import type {
  Account,
  Bill,
  BillKind,
  Item,
  MoneyEntry,
  Party,
  Payment,
  PaymentDirection,
  StockAdjustment,
  Transfer,
} from './types'

export type BillStatus = 'paid' | 'partial' | 'unpaid'

export interface Application {
  sourceId: string
  sourceType: 'payment' | 'credit_note' | 'opening'
  date: ISODate
  amount: Paisa
  /** True when applied by "oldest bill first", false when chosen explicitly. */
  auto: boolean
}

export interface DocState {
  id: string
  kind: 'bill' | 'opening' | 'refund'
  date: ISODate
  dueDate: ISODate
  total: Paisa
  settled: Paisa
  remaining: Paisa
  status: BillStatus
  applications: Application[]
  bill?: Bill
  payment?: Payment
}

export interface CreditApplication {
  docId: string
  amount: Paisa
  auto: boolean
}

export interface CreditState {
  id: string
  kind: 'payment' | 'credit_note' | 'opening'
  date: ISODate
  amount: Paisa
  applied: Paisa
  unapplied: Paisa
  applications: CreditApplication[]
  payment?: Payment
  bill?: Bill
}

export interface PartyLedger {
  partyId: string
  docs: DocState[]
  credits: CreditState[]
  /** Sum of what is still unpaid on bills. */
  outstanding: Paisa
  /** Money received (or credit notes) not yet used by any bill. */
  advance: Paisa
  /** Positive: the party owes the shop. Negative: the shop owes the party. */
  balance: Paisa
  /** Oldest unpaid due date, if any. */
  oldestDue?: ISODate
}

interface Side {
  docBill: BillKind
  creditBill: BillKind
  creditPayment: PaymentDirection
  docPayment: PaymentDirection
  /** Multiplier that converts this side's "owed" into the signed receivable convention. */
  sign: 1 | -1
}

export function partySide(type: Party['type']): Side {
  return type === 'customer'
    ? { docBill: 'sale', creditBill: 'sale_return', creditPayment: 'in', docPayment: 'out', sign: 1 }
    : { docBill: 'purchase', creditBill: 'purchase_return', creditPayment: 'out', docPayment: 'in', sign: -1 }
}

export const openingDocId = (partyId: string) => `opening:${partyId}`

const byDateThenCreated = <T extends { date: ISODate; createdAt: number }>(a: T, b: T) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt

function statusOf(total: Paisa, remaining: Paisa): BillStatus {
  if (remaining <= 0) return 'paid'
  if (remaining < total) return 'partial'
  return 'unpaid'
}

/**
 * Works out every bill's paid / partial / unpaid status for one party.
 *
 * 1. Payments and credit notes that name specific bills are applied to those bills first.
 * 2. Everything left over (unallocated payments, advances, extra credit) is applied
 *    to the oldest unpaid bills first, including bills made after the advance.
 * 3. Whatever still remains is the party's advance credit.
 */
export function computePartyLedger(party: Party, bills: Bill[], payments: Payment[], asOf?: ISODate): PartyLedger {
  const side = partySide(party.type)
  const within = (date: ISODate) => !asOf || date <= asOf

  type MutableDoc = DocState
  const docs: MutableDoc[] = []
  const credits: CreditState[] = []
  const openingOwed = party.openingBalance * side.sign

  if (openingOwed > 0 && within(party.openingDate)) {
    docs.push({
      id: openingDocId(party.id),
      kind: 'opening',
      date: party.openingDate,
      dueDate: party.openingDate,
      total: openingOwed,
      settled: 0,
      remaining: openingOwed,
      status: 'unpaid',
      applications: [],
    })
  } else if (openingOwed < 0 && within(party.openingDate)) {
    credits.push({
      id: openingDocId(party.id),
      kind: 'opening',
      date: party.openingDate,
      amount: -openingOwed,
      applied: 0,
      unapplied: -openingOwed,
      applications: [],
    })
  }

  const partyBills = bills.filter((b) => b.partyId === party.id && !b.voided && within(b.date)).sort(byDateThenCreated)
  const partyPayments = payments
    .filter((p) => p.partyId === party.id && !p.voided && within(p.date))
    .sort(byDateThenCreated)

  for (const bill of partyBills) {
    if (bill.kind === side.docBill) {
      docs.push({
        id: bill.id,
        kind: 'bill',
        date: bill.date,
        dueDate: addDays(bill.date, party.creditDays),
        total: bill.totals.total,
        settled: 0,
        remaining: bill.totals.total,
        status: 'unpaid',
        applications: [],
        bill,
      })
    } else if (bill.kind === side.creditBill) {
      credits.push({
        id: bill.id,
        kind: 'credit_note',
        date: bill.date,
        amount: bill.totals.total,
        applied: 0,
        unapplied: bill.totals.total,
        applications: [],
        bill,
      })
    }
  }
  for (const payment of partyPayments) {
    if (payment.direction === side.creditPayment) {
      credits.push({
        id: payment.id,
        kind: 'payment',
        date: payment.date,
        amount: payment.amount,
        applied: 0,
        unapplied: payment.amount,
        applications: [],
        payment,
      })
    } else {
      // Money paid back to the party (e.g. refunding an advance) increases what they owe.
      docs.push({
        id: payment.id,
        kind: 'refund',
        date: payment.date,
        dueDate: payment.date,
        total: payment.amount,
        settled: 0,
        remaining: payment.amount,
        status: 'unpaid',
        applications: [],
        payment,
      })
    }
  }

  const docOrder = (a: DocState, b: DocState) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : (a.bill?.createdAt ?? a.payment?.createdAt ?? 0) - (b.bill?.createdAt ?? b.payment?.createdAt ?? 0)
  docs.sort((a, b) => (a.kind === 'opening' ? -1 : b.kind === 'opening' ? 1 : docOrder(a, b)))
  credits.sort((a, b) => {
    if (a.kind === 'opening') return -1
    if (b.kind === 'opening') return 1
    const ca = a.payment?.createdAt ?? a.bill?.createdAt ?? 0
    const cb = b.payment?.createdAt ?? b.bill?.createdAt ?? 0
    return a.date < b.date ? -1 : a.date > b.date ? 1 : ca - cb
  })

  const docById = new Map(docs.map((d) => [d.id, d]))

  const apply = (credit: CreditState, doc: DocState, wanted: Paisa, auto: boolean) => {
    const amount = Math.min(wanted, credit.unapplied, doc.remaining)
    if (amount <= 0) return
    credit.unapplied -= amount
    credit.applied += amount
    credit.applications.push({ docId: doc.id, amount, auto })
    doc.remaining -= amount
    doc.settled += amount
    doc.applications.push({
      sourceId: credit.id,
      sourceType: credit.kind,
      date: credit.date,
      amount,
      auto,
    })
  }

  for (const credit of credits) {
    if (credit.payment) {
      for (const alloc of credit.payment.allocations) {
        const doc = docById.get(alloc.billId)
        if (doc) apply(credit, doc, alloc.amount, false)
      }
    } else if (credit.bill?.refBillId) {
      const doc = docById.get(credit.bill.refBillId)
      if (doc) apply(credit, doc, credit.amount, false)
    }
  }

  for (const credit of credits) {
    for (const doc of docs) {
      if (credit.unapplied <= 0) break
      if (doc.remaining > 0) apply(credit, doc, credit.unapplied, true)
    }
  }

  let outstanding = 0
  let oldestDue: ISODate | undefined
  for (const doc of docs) {
    doc.status = statusOf(doc.total, doc.remaining)
    outstanding += doc.remaining
    if (doc.remaining > 0 && (!oldestDue || doc.dueDate < oldestDue)) oldestDue = doc.dueDate
  }
  const advance = credits.reduce((s, c) => s + c.unapplied, 0)
  const owed = outstanding - advance

  return {
    partyId: party.id,
    docs,
    credits,
    outstanding,
    advance,
    balance: owed * side.sign,
    oldestDue,
  }
}

export interface LedgerData {
  parties: Party[]
  bills: Bill[]
  payments: Payment[]
}

export function computeAllLedgers({ parties, bills, payments }: LedgerData, asOf?: ISODate): Map<string, PartyLedger> {
  const billsByParty = groupBy(bills, (b) => b.partyId)
  const paymentsByParty = groupBy(payments, (p) => p.partyId)
  const out = new Map<string, PartyLedger>()
  for (const party of parties) {
    out.set(party.id, computePartyLedger(party, billsByParty.get(party.id) ?? [], paymentsByParty.get(party.id) ?? [], asOf))
  }
  return out
}

export function receivablePayable(ledgers: Iterable<PartyLedger>): { receivable: Paisa; payable: Paisa } {
  let receivable = 0
  let payable = 0
  for (const l of ledgers) {
    if (l.balance > 0) receivable += l.balance
    else payable -= l.balance
  }
  return { receivable, payable }
}

export interface OverdueParty {
  party: Party
  ledger: PartyLedger
  overdueAmount: Paisa
  daysOverdue: number
}

export function overdueParties(parties: Party[], ledgers: Map<string, PartyLedger>, today: ISODate): OverdueParty[] {
  const out: OverdueParty[] = []
  for (const party of parties) {
    if (party.archived) continue
    const ledger = ledgers.get(party.id)
    if (!ledger || ledger.balance * partySide(party.type).sign <= 0) continue
    const overdueDocs = ledger.docs.filter((d) => d.remaining > 0 && d.dueDate < today)
    if (!overdueDocs.length) continue
    const overdueAmount = Math.min(
      overdueDocs.reduce((s, d) => s + d.remaining, 0),
      ledger.balance * partySide(party.type).sign,
    )
    const daysOverdue = Math.max(...overdueDocs.map((d) => daysBetween(d.dueDate, today)))
    out.push({ party, ledger, overdueAmount, daysOverdue })
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue || b.overdueAmount - a.overdueAmount)
}

export function findBillState(ledger: PartyLedger | undefined, billId: string): DocState | CreditState | undefined {
  if (!ledger) return undefined
  return ledger.docs.find((d) => d.id === billId) ?? ledger.credits.find((c) => c.id === billId)
}

// ---------------------------------------------------------------- Accounts

export interface MoneyData {
  payments: Payment[]
  entries: MoneyEntry[]
  transfers: Transfer[]
}

export interface AccountMovement {
  id: string
  date: ISODate
  createdAt: number
  kind: 'opening' | 'payment_in' | 'payment_out' | 'income' | 'expense' | 'transfer_in' | 'transfer_out'
  amount: Paisa
  balance: Paisa
  refId?: string
  partyId?: string
  label: string
}

export function accountMovements(account: Account, data: MoneyData, asOf?: ISODate): AccountMovement[] {
  const within = (date: ISODate) => !asOf || date <= asOf
  const rows: Omit<AccountMovement, 'balance'>[] = []
  if (within(account.openingDate)) {
    rows.push({ id: `opening:${account.id}`, date: account.openingDate, createdAt: 0, kind: 'opening', amount: account.openingBalance, label: '' })
  }
  for (const p of data.payments) {
    if (p.voided || p.accountId !== account.id || !within(p.date)) continue
    rows.push({
      id: p.id,
      date: p.date,
      createdAt: p.createdAt,
      kind: p.direction === 'in' ? 'payment_in' : 'payment_out',
      amount: p.direction === 'in' ? p.amount : -p.amount,
      refId: p.id,
      partyId: p.partyId,
      label: p.note,
    })
  }
  for (const e of data.entries) {
    if (e.voided || e.accountId !== account.id || !within(e.date)) continue
    rows.push({
      id: e.id,
      date: e.date,
      createdAt: e.createdAt,
      kind: e.type,
      amount: e.type === 'income' ? e.amount : -e.amount,
      refId: e.id,
      label: e.category,
    })
  }
  for (const t of data.transfers) {
    if (t.voided || !within(t.date)) continue
    if (t.toAccountId === account.id) {
      rows.push({ id: `${t.id}:in`, date: t.date, createdAt: t.createdAt, kind: 'transfer_in', amount: t.amount, refId: t.id, label: t.fromAccountId })
    }
    if (t.fromAccountId === account.id) {
      rows.push({ id: `${t.id}:out`, date: t.date, createdAt: t.createdAt, kind: 'transfer_out', amount: -t.amount, refId: t.id, label: t.toAccountId })
    }
  }
  rows.sort(byDateThenCreated)
  let balance = 0
  return rows.map((r) => {
    balance += r.amount
    return { ...r, balance }
  })
}

export function accountBalance(account: Account, data: MoneyData, asOf?: ISODate): Paisa {
  const moves = accountMovements(account, data, asOf)
  return moves.length ? moves[moves.length - 1].balance : 0
}

export function accountBalances(accounts: Account[], data: MoneyData, asOf?: ISODate): Map<string, Paisa> {
  return new Map(accounts.map((a) => [a.id, accountBalance(a, data, asOf)]))
}

// ---------------------------------------------------------------- Stock

const STOCK_SIGN: Record<BillKind, number> = { purchase: 1, sale: -1, sale_return: 1, purchase_return: -1 }

export function stockLevels(items: Item[], bills: Bill[], adjustments: StockAdjustment[]): Map<string, number> {
  const levels = new Map(items.map((i) => [i.id, i.openingQty]))
  for (const bill of bills) {
    if (bill.voided) continue
    for (const line of bill.lines) {
      if (!line.itemId || !levels.has(line.itemId)) continue
      levels.set(line.itemId, (levels.get(line.itemId) ?? 0) + STOCK_SIGN[bill.kind] * line.qty)
    }
  }
  for (const adj of adjustments) {
    if (levels.has(adj.itemId)) levels.set(adj.itemId, (levels.get(adj.itemId) ?? 0) + adj.qty)
  }
  return levels
}

// ---------------------------------------------------------------- Reports

export interface PeriodSummary {
  sales: Paisa
  salesReturns: Paisa
  netSales: Paisa
  /** Bill totals including VAT, net of returns. */
  salesWithVat: Paisa
  outputVat: Paisa
  purchases: Paisa
  purchaseReturns: Paisa
  netPurchases: Paisa
  inputVat: Paisa
  cogs: Paisa
  grossProfit: Paisa
  businessExpenses: Paisa
  personalExpenses: Paisa
  businessIncome: Paisa
  personalIncome: Paisa
  netProfit: Paisa
  saleCount: number
  purchaseCount: number
  expensesByCategory: Record<string, Paisa>
}

const inRange = (date: ISODate, r: DateRange) => date >= r.from && date <= r.to

export function summarizePeriod(range: DateRange, bills: Bill[], entries: MoneyEntry[]): PeriodSummary {
  const s: PeriodSummary = {
    sales: 0,
    salesReturns: 0,
    netSales: 0,
    salesWithVat: 0,
    outputVat: 0,
    purchases: 0,
    purchaseReturns: 0,
    netPurchases: 0,
    inputVat: 0,
    cogs: 0,
    grossProfit: 0,
    businessExpenses: 0,
    personalExpenses: 0,
    businessIncome: 0,
    personalIncome: 0,
    netProfit: 0,
    saleCount: 0,
    purchaseCount: 0,
    expensesByCategory: {},
  }
  for (const b of bills) {
    if (b.voided || !inRange(b.date, range)) continue
    const net = b.totals.taxable + b.totals.exempt
    const cost = b.lines.reduce((acc, l) => acc + (l.cost ?? 0) * l.qty, 0)
    switch (b.kind) {
      case 'sale':
        s.sales += net
        s.salesWithVat += b.totals.total
        s.outputVat += b.totals.vat
        s.cogs += cost
        s.saleCount++
        break
      case 'sale_return':
        s.salesReturns += net
        s.salesWithVat -= b.totals.total
        s.outputVat -= b.totals.vat
        s.cogs -= cost
        break
      case 'purchase':
        s.purchases += net
        s.inputVat += b.totals.vat
        s.purchaseCount++
        break
      case 'purchase_return':
        s.purchaseReturns += net
        s.inputVat -= b.totals.vat
        break
    }
  }
  for (const e of entries) {
    if (e.voided || !inRange(e.date, range)) continue
    if (e.type === 'expense') {
      if (e.scope === 'business') {
        s.businessExpenses += e.amount
        s.expensesByCategory[e.category] = (s.expensesByCategory[e.category] ?? 0) + e.amount
      } else s.personalExpenses += e.amount
    } else if (e.scope === 'business') s.businessIncome += e.amount
    else s.personalIncome += e.amount
  }
  s.netSales = s.sales - s.salesReturns
  s.netPurchases = s.purchases - s.purchaseReturns
  s.grossProfit = s.netSales - s.cogs
  s.netProfit = s.grossProfit + s.businessIncome - s.businessExpenses
  return s
}

export interface VatMonth {
  key: string
  y: number
  m: number
  outputVat: Paisa
  inputVat: Paisa
  /** Credit carried in from earlier months where input VAT exceeded output VAT. */
  carriedIn: Paisa
  /** Positive: VAT to pay for the month. */
  payable: Paisa
  carriedOut: Paisa
  taxableSales: Paisa
  taxablePurchases: Paisa
}

/**
 * VAT per BS month. When input VAT is higher than output VAT the difference
 * is carried forward as credit into following months.
 */
export function vatByMonth(
  bills: Bill[],
  months: { y: number; m: number; range: DateRange }[],
  openingCredit: Paisa = 0,
): VatMonth[] {
  let carry = openingCredit
  return months.map(({ y, m, range }) => {
    let outputVat = 0
    let inputVat = 0
    let taxableSales = 0
    let taxablePurchases = 0
    for (const b of bills) {
      if (b.voided || !inRange(b.date, range)) continue
      if (b.kind === 'sale') {
        outputVat += b.totals.vat
        taxableSales += b.totals.taxable
      } else if (b.kind === 'sale_return') {
        outputVat -= b.totals.vat
        taxableSales -= b.totals.taxable
      } else if (b.kind === 'purchase') {
        inputVat += b.totals.vat
        taxablePurchases += b.totals.taxable
      } else {
        inputVat -= b.totals.vat
        taxablePurchases -= b.totals.taxable
      }
    }
    const net = outputVat - inputVat - carry
    const row: VatMonth = {
      key: `${y}-${String(m).padStart(2, '0')}`,
      y,
      m,
      outputVat,
      inputVat,
      carriedIn: carry,
      payable: Math.max(0, net),
      carriedOut: Math.max(0, -net),
      taxableSales,
      taxablePurchases,
    }
    carry = row.carriedOut
    return row
  })
}

// ---------------------------------------------------------------- Trends

export interface Trend {
  direction: 'up' | 'down' | 'flat'
  delta: number
  /** null when there is no change. */
  good: boolean | null
}

export function trend(current: number, previous: number, goodWhenUp: boolean): Trend {
  const delta = current - previous
  if (delta === 0) return { direction: 'flat', delta, good: null }
  const up = delta > 0
  return { direction: up ? 'up' : 'down', delta, good: up === goodWhenUp }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = out.get(k)
    if (list) list.push(row)
    else out.set(k, [row])
  }
  return out
}
