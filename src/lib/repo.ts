import { todayIso } from './bsdate'
import { db } from './db'
import type { Paisa } from './money'
import { cleanPan, cleanPhone } from './party'
import type {
  Account,
  Allocation,
  BankCheck,
  Base,
  Bill,
  BillPhoto,
  HistoryAction,
  HistoryEntry,
  Item,
  MoneyEntry,
  Party,
  Payment,
  PhotoKind,
  Settings,
  StockAdjustment,
  TableName,
  Transfer,
} from './types'
import { computeTotals, DEFAULT_VAT_RATE } from './vat'

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'transport',
  'electricity',
  'phone_internet',
  'tea_snacks',
  'repair',
  'tax_fees',
  'bank_charges',
  'household',
  'personal',
  'other',
]
export const PERSONAL_CATEGORIES = new Set(['household', 'personal'])
export const INCOME_CATEGORIES = ['commission', 'interest', 'discount_received', 'other_income']

export const DEFAULT_SETTINGS: Settings = {
  id: 'shop',
  createdAt: 0,
  updatedAt: 0,
  shopName: '',
  pan: '',
  address: '',
  phone: '',
  language: 'ne',
  digits: 'ne',
  calendar: 'bs',
  vatRate: DEFAULT_VAT_RATE,
  defaultCreditDays: 30,
  vatFiled: [],
  expenseCategories: [],
  incomeCategories: [],
  onboarded: false,
}

type Listener = () => void
const listeners = new Set<Listener>()
export function onLocalChange(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

type Row = Base & Record<string, unknown>

/**
 * Every write goes through here: it stamps timestamps, keeps the previous version
 * in the history table, and queues the row for cloud sync.
 */
async function write<T extends Base>(table: TableName, row: T, action: HistoryAction, note?: string): Promise<T> {
  const tbl = db.table<Row, string>(table)
  const saved = await db.transaction('rw', [tbl, db.history, db.outbox], async () => {
    const before = await tbl.get(row.id)
    const now = Date.now()
    const next = {
      ...row,
      createdAt: before?.createdAt ?? (row.createdAt || now),
      updatedAt: Math.max(now, (before?.updatedAt ?? 0) + 1),
    } as T
    await tbl.put(next as unknown as Row)
    await db.outbox.put({ key: `${table}:${next.id}`, table, id: next.id, at: now })
    if (table !== 'settings' && table !== 'history') {
      // The row's updatedAt rises with every save, so history stays in order even within one millisecond.
      const entry: HistoryEntry = {
        id: uid(),
        createdAt: next.updatedAt,
        updatedAt: next.updatedAt,
        entity: table,
        entityId: next.id,
        action,
        before: before ? slimForHistory(table, before) : undefined,
        after: slimForHistory(table, next),
        note,
      }
      await db.history.put(entry)
      await db.outbox.put({ key: `history:${entry.id}`, table: 'history', id: entry.id, at: now })
    }
    return next
  })
  for (const fn of listeners) fn()
  return saved
}

const fresh = () => ({ id: uid(), createdAt: Date.now(), updatedAt: 0 })

/** A photo's preview is the same in every version, so history does not keep a copy of it. */
function slimForHistory<T extends Base>(table: TableName, row: T): T {
  return table === 'photos' ? { ...row, thumb: '' } : row
}

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get('shop')) ?? {}) }
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  return write('settings', { ...current, ...patch, id: 'shop' }, 'update')
}

// ---------------------------------------------------------------- Parties

export type PartyInput = Omit<Party, keyof Base> & Partial<Pick<Base, 'id'>>

export interface SavePartyOptions {
  /** Copy a changed PAN onto earlier bills that carried the old PAN (or none). */
  panOnOldBills?: boolean
}

export async function saveParty(input: PartyInput, opts: SavePartyOptions = {}): Promise<Party> {
  if (!input.name.trim()) throw new Error('name_required')
  const existing = input.id ? await db.parties.get(input.id) : undefined
  const row: Party = {
    ...(existing ?? fresh()),
    ...input,
    name: input.name.trim(),
    phone: cleanPhone(input.phone ?? ''),
    pan: cleanPan(input.pan ?? ''),
    id: existing?.id ?? input.id ?? uid(),
  } as Party
  const saved = await write('parties', row, existing ? 'update' : 'create')
  if (!existing) return saved

  // Bills keep a copy of the party's name and PAN as written at the time.
  const renamed = existing.name !== saved.name
  const panChanged = Boolean(opts.panOnOldBills) && existing.pan !== saved.pan
  if (renamed || panChanged) {
    const bills = await db.bills.where('partyId').equals(saved.id).toArray()
    for (const b of bills) {
      const patch: Partial<Bill> = {}
      if (renamed && b.partyName !== saved.name) patch.partyName = saved.name
      if (panChanged && (b.partyPan === existing.pan || !b.partyPan) && b.partyPan !== saved.pan) patch.partyPan = saved.pan
      if (Object.keys(patch).length) await write('bills', { ...b, ...patch }, 'update', patch.partyName ? 'note_party_renamed' : 'note_party_pan_changed')
    }
  }
  return saved
}

/** Bills whose stored PAN would change if the party's PAN changed and the user agreed. */
export function billsCarryingPan(bills: Bill[], partyId: string, oldPan: string): Bill[] {
  return bills.filter((b) => b.partyId === partyId && (b.partyPan === oldPan || !b.partyPan))
}

// ---------------------------------------------------------------- Bills

export type BillInput = Omit<Bill, keyof Base | 'totals' | 'partyName' | 'partyPan'> & {
  id?: string
  partyPan?: string
}

export interface PayNow {
  amount: Paisa
  accountId: string
}

export async function saveBill(input: BillInput, payNow?: PayNow, vatRate = DEFAULT_VAT_RATE): Promise<Bill> {
  const party = await db.parties.get(input.partyId)
  if (!party) throw new Error('party_required')
  const lines = input.lines.filter((l) => l.name.trim() && l.qty > 0)
  if (!lines.length) throw new Error('items_required')
  const existing = input.id ? await db.bills.get(input.id) : undefined
  const bill: Bill = {
    ...(existing ?? fresh()),
    ...input,
    id: existing?.id ?? input.id ?? uid(),
    lines,
    partyName: party.name,
    partyPan: cleanPan(input.partyPan ?? party.pan),
    totals: computeTotals(lines, vatRate),
  } as Bill
  const saved = await write('bills', bill, existing ? 'update' : 'create')
  if (payNow && payNow.amount > 0 && (saved.kind === 'sale' || saved.kind === 'purchase')) {
    const account = await db.accounts.get(payNow.accountId)
    if (!account) throw new Error('account_required')
    await savePayment({
      direction: saved.kind === 'sale' ? 'in' : 'out',
      partyId: saved.partyId,
      date: saved.date,
      amount: payNow.amount,
      accountId: account.id,
      method: account.type,
      allocations: [{ billId: saved.id, amount: Math.min(payNow.amount, saved.totals.total) }],
      note: '',
    })
  }
  return saved
}

type VoidableTable = 'bills' | 'payments' | 'entries' | 'transfers' | 'photos'

export async function voidRow<T extends Base & { voided?: { at: number; reason: string } }>(
  table: VoidableTable,
  row: T,
  reason: string,
) {
  return write(table, { ...row, voided: { at: Date.now(), reason } }, 'void', reason)
}

export async function restoreRow<T extends Base & { voided?: { at: number; reason: string } }>(
  table: VoidableTable,
  row: T,
) {
  const { voided: _voided, ...rest } = row
  void _voided
  return write(table, rest as T, 'restore')
}

// ---------------------------------------------------------------- Payments

export type PaymentInput = Omit<Payment, keyof Base> & { id?: string }

export async function savePayment(input: PaymentInput): Promise<Payment> {
  if (!(input.amount > 0)) throw new Error('amount_required')
  const allocations: Allocation[] = input.allocations.filter((a) => a.amount > 0)
  const allocated = allocations.reduce((s, a) => s + a.amount, 0)
  if (allocated > input.amount) throw new Error('allocation_too_large')
  const existing = input.id ? await db.payments.get(input.id) : undefined
  const row: Payment = { ...(existing ?? fresh()), ...input, allocations, id: existing?.id ?? input.id ?? uid() } as Payment
  return write('payments', row, existing ? 'update' : 'create')
}

// ---------------------------------------------------------------- Money

export type AccountInput = Omit<Account, keyof Base> & { id?: string }

export async function saveAccount(input: AccountInput): Promise<Account> {
  if (!input.name.trim()) throw new Error('name_required')
  const existing = input.id ? await db.accounts.get(input.id) : undefined
  const row = { ...(existing ?? fresh()), ...input, id: existing?.id ?? input.id ?? uid() } as Account
  return write('accounts', row, existing ? 'update' : 'create')
}

export type EntryInput = Omit<MoneyEntry, keyof Base> & { id?: string }

export async function saveEntry(input: EntryInput): Promise<MoneyEntry> {
  if (!(input.amount > 0)) throw new Error('amount_required')
  if (!input.accountId) throw new Error('account_required')
  const existing = input.id ? await db.entries.get(input.id) : undefined
  const row = { ...(existing ?? fresh()), ...input, id: existing?.id ?? input.id ?? uid() } as MoneyEntry
  return write('entries', row, existing ? 'update' : 'create')
}

export type TransferInput = Omit<Transfer, keyof Base> & { id?: string }

export async function saveTransfer(input: TransferInput): Promise<Transfer> {
  if (!(input.amount > 0)) throw new Error('amount_required')
  if (!input.fromAccountId || !input.toAccountId || input.fromAccountId === input.toAccountId) throw new Error('accounts_must_differ')
  const existing = input.id ? await db.transfers.get(input.id) : undefined
  const row = { ...(existing ?? fresh()), ...input, id: existing?.id ?? input.id ?? uid() } as Transfer
  return write('transfers', row, existing ? 'update' : 'create')
}

export async function saveBankCheck(input: Omit<BankCheck, keyof Base>): Promise<BankCheck> {
  return write('bankChecks', { ...fresh(), ...input } as BankCheck, 'create')
}

// ---------------------------------------------------------------- Stock

export type ItemInput = Omit<Item, keyof Base> & { id?: string }

export async function saveItem(input: ItemInput): Promise<Item> {
  if (!input.name.trim()) throw new Error('name_required')
  const existing = input.id ? await db.items.get(input.id) : undefined
  const row = { ...(existing ?? fresh()), ...input, name: input.name.trim(), id: existing?.id ?? input.id ?? uid() } as Item
  return write('items', row, existing ? 'update' : 'create')
}

export async function saveAdjustment(input: Omit<StockAdjustment, keyof Base>): Promise<StockAdjustment> {
  if (!input.qty) throw new Error('qty_required')
  return write('adjustments', { ...fresh(), ...input } as StockAdjustment, 'create')
}

// ---------------------------------------------------------------- Bill photos

export type PhotoInput = Omit<BillPhoto, keyof Base> & { id?: string }

/** Saves a photo's details, and the image bytes when given (only when the photo is first taken). */
export async function savePhoto(input: PhotoInput, file?: { data: Uint8Array; type: string }): Promise<BillPhoto> {
  const existing = input.id ? await db.photos.get(input.id) : undefined
  const row = { ...(existing ?? fresh()), ...input, id: existing?.id ?? input.id ?? uid() } as BillPhoto
  if (file) await db.photoFiles.put({ id: row.id, type: file.type, data: file.data, uploaded: 0 })
  return write('photos', row, existing ? 'update' : 'create')
}

/** Links a photo to the bill that was typed in from it and moves it to "entered". */
export async function markPhotoEntered(photoId: string, bill: Bill): Promise<BillPhoto | undefined> {
  const photo = await db.photos.get(photoId)
  if (!photo) return undefined
  const kind: PhotoKind = bill.kind === 'purchase' || bill.kind === 'purchase_return' ? 'purchase' : 'sale'
  const next: BillPhoto = { ...photo, status: 'done', billId: bill.id, partyId: bill.partyId, kind }
  return write('photos', next, 'update', 'note_entered_from_photo')
}

// ---------------------------------------------------------------- Setup

export async function ensureCashAccount(openingBalance: Paisa, name: string): Promise<Account> {
  const existing = (await db.accounts.toArray()).find((a) => a.type === 'cash')
  if (existing) return existing
  return saveAccount({ type: 'cash', name, openingBalance, openingDate: todayIso() })
}

export async function nextBillNo(kind: Bill['kind']): Promise<string> {
  const bills = await db.bills.where('kind').equals(kind).toArray()
  const nums = bills.map((b) => Number.parseInt(b.billNo.replace(/\D+/g, ''), 10)).filter((n) => Number.isFinite(n))
  return nums.length ? String(Math.max(...nums) + 1) : ''
}
