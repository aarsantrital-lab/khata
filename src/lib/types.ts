import type { Calendar, ISODate, Lang } from './bsdate'
import type { DigitStyle, Paisa } from './money'

export interface Base {
  id: string
  createdAt: number
  updatedAt: number
}

export type PartyType = 'customer' | 'supplier'

export interface Party extends Base {
  type: PartyType
  name: string
  phone: string
  pan: string
  address: string
  /** Signed: positive means the party owes the shop, negative means the shop owes the party. */
  openingBalance: Paisa
  openingDate: ISODate
  /** Days after the bill date before it counts as overdue. */
  creditDays: number
  note: string
  archived?: boolean
}

export type BillKind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return'
export type Unit = 'pcs' | 'box'

export interface BillLine {
  id: string
  itemId?: string
  name: string
  unit: Unit
  qty: number
  rate: Paisa
  /** Discount for the whole line, in paisa. */
  discount: Paisa
  taxable: boolean
  /** Cost price per unit at the time of the bill (sales only), used for profit. */
  cost?: Paisa
}

export interface BillTotals {
  gross: Paisa
  discount: Paisa
  taxable: Paisa
  exempt: Paisa
  vat: Paisa
  total: Paisa
}

export interface Voided {
  at: number
  reason: string
}

export interface Bill extends Base {
  kind: BillKind
  /** Number from the handwritten VAT bill book (or the supplier's bill number). */
  billNo: string
  date: ISODate
  partyId: string
  partyName: string
  partyPan: string
  lines: BillLine[]
  totals: BillTotals
  /** For credit/debit notes: the bill being returned against. */
  refBillId?: string
  note: string
  voided?: Voided
}

/** 'wallet' covers any other phone wallet (IME Pay, PrabhuPAY, …). */
export type AccountType = 'cash' | 'bank' | 'esewa' | 'khalti' | 'wallet'

export interface Account extends Base {
  type: AccountType
  name: string
  openingBalance: Paisa
  openingDate: ISODate
  archived?: boolean
}

export interface Allocation {
  billId: string
  amount: Paisa
}

export type PaymentDirection = 'in' | 'out'

export interface Payment extends Base {
  direction: PaymentDirection
  partyId: string
  date: ISODate
  amount: Paisa
  accountId: string
  method: AccountType
  /** Empty means "apply automatically to the oldest bills first". */
  allocations: Allocation[]
  note: string
  voided?: Voided
}

export type EntryType = 'expense' | 'income'
export type Scope = 'business' | 'personal'

export interface MoneyEntry extends Base {
  type: EntryType
  category: string
  scope: Scope
  accountId: string
  amount: Paisa
  date: ISODate
  note: string
  voided?: Voided
}

export interface Transfer extends Base {
  fromAccountId: string
  toAccountId: string
  amount: Paisa
  date: ISODate
  note: string
  voided?: Voided
}

export interface BankCheck extends Base {
  accountId: string
  date: ISODate
  bankBalance: Paisa
  appBalance: Paisa
  note: string
}

export interface Item extends Base {
  name: string
  brand: string
  model: string
  category: string
  unit: Unit
  salePrice: Paisa
  costPrice: Paisa
  taxable: boolean
  openingQty: number
  lowStockAt: number
  archived?: boolean
}

export interface StockAdjustment extends Base {
  itemId: string
  date: ISODate
  qty: number
  reason: string
}

export type PhotoStatus = 'pending' | 'done'
export type PhotoKind = 'sale' | 'purchase' | 'other'

/** A photo of a handwritten bill. The image itself lives in the photoFiles table. */
export interface BillPhoto extends Base {
  status: PhotoStatus
  kind: PhotoKind
  partyId?: string
  /** The bill that was entered from this photo, or that it was attached to. */
  billId?: string
  date: ISODate
  note: string
  /** A tiny JPEG data URL, so lists never need to load the full image. */
  thumb: string
  /** MIME type and size of the full image. */
  type: string
  bytes: number
  width: number
  height: number
  voided?: Voided
}

export type HistoryAction = 'create' | 'update' | 'void' | 'restore'

export interface HistoryEntry extends Base {
  entity: TableName
  entityId: string
  action: HistoryAction
  before?: unknown
  after?: unknown
  note?: string
}

export interface Settings extends Base {
  shopName: string
  pan: string
  address: string
  phone: string
  logo?: string
  signature?: string
  language: Lang
  digits: DigitStyle
  calendar: Calendar
  /** VAT rate in basis points (13% = 1300). */
  vatRate: number
  defaultCreditDays: number
  /** BS month keys (YYYY-MM) whose VAT return is marked as filed. */
  vatFiled: string[]
  expenseCategories: string[]
  incomeCategories: string[]
  onboarded: boolean
}

export type TableName =
  | 'parties'
  | 'bills'
  | 'payments'
  | 'accounts'
  | 'entries'
  | 'transfers'
  | 'bankChecks'
  | 'items'
  | 'adjustments'
  | 'photos'
  | 'history'
  | 'settings'

export const SYNC_TABLES: TableName[] = [
  'parties',
  'bills',
  'payments',
  'accounts',
  'entries',
  'transfers',
  'bankChecks',
  'items',
  'adjustments',
  'photos',
  'history',
  'settings',
]
