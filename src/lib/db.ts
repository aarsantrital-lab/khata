import Dexie, { type Table } from 'dexie'
import type {
  Account,
  BankCheck,
  Bill,
  BillPhoto,
  HistoryEntry,
  Item,
  MoneyEntry,
  Party,
  Payment,
  Settings,
  StockAdjustment,
  TableName,
  Transfer,
} from './types'

export interface OutboxRow {
  key: string
  table: TableName
  id: string
  at: number
}

/** Full image bytes for a BillPhoto. Kept apart so lists of photos stay quick to load. */
export interface PhotoFile {
  id: string
  type: string
  data: Uint8Array
  /** 0 = waiting to upload, 1 = on the sync server (or came from it), 2 = server refused it. */
  uploaded: 0 | 1 | 2
}

export interface MetaRow {
  key: string
  value: unknown
}

export class KhataDB extends Dexie {
  parties!: Table<Party, string>
  bills!: Table<Bill, string>
  payments!: Table<Payment, string>
  accounts!: Table<Account, string>
  entries!: Table<MoneyEntry, string>
  transfers!: Table<Transfer, string>
  bankChecks!: Table<BankCheck, string>
  items!: Table<Item, string>
  adjustments!: Table<StockAdjustment, string>
  photos!: Table<BillPhoto, string>
  photoFiles!: Table<PhotoFile, string>
  history!: Table<HistoryEntry, string>
  settings!: Table<Settings, string>
  outbox!: Table<OutboxRow, string>
  meta!: Table<MetaRow, string>

  constructor(name = 'khata') {
    super(name)
    this.version(1).stores({
      parties: 'id, type, updatedAt',
      bills: 'id, kind, date, partyId, refBillId, updatedAt',
      payments: 'id, date, partyId, accountId, updatedAt',
      accounts: 'id, updatedAt',
      entries: 'id, date, accountId, updatedAt',
      transfers: 'id, date, updatedAt',
      bankChecks: 'id, accountId, date, updatedAt',
      items: 'id, updatedAt',
      adjustments: 'id, itemId, updatedAt',
      history: 'id, entityId, entity, updatedAt',
      settings: 'id',
      outbox: 'key, at',
      meta: 'key',
    })
    this.version(2).stores({
      photos: 'id, status, partyId, billId, date, updatedAt',
      photoFiles: 'id, uploaded',
    })
  }
}

export let db = new KhataDB()

/** Swaps the database (used by tests to simulate a second device). */
export function swapDatabase(next: KhataDB) {
  db = next
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
