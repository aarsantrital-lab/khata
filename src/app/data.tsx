import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { db } from '@/lib/db'
import { accountBalances, computeAllLedgers, stockLevels, type PartyLedger } from '@/lib/ledger'
import { DEFAULT_SETTINGS } from '@/lib/repo'
import type {
  Account,
  BankCheck,
  Bill,
  BillPhoto,
  Item,
  MoneyEntry,
  Party,
  Payment,
  Settings,
  StockAdjustment,
  Transfer,
} from '@/lib/types'

export interface AppData {
  ready: boolean
  settings: Settings
  parties: Party[]
  bills: Bill[]
  payments: Payment[]
  accounts: Account[]
  entries: MoneyEntry[]
  transfers: Transfer[]
  bankChecks: BankCheck[]
  items: Item[]
  adjustments: StockAdjustment[]
  /** Newest first. Only the small preview is loaded here, never the full image. */
  photos: BillPhoto[]
  ledgers: Map<string, PartyLedger>
  balances: Map<string, number>
  stock: Map<string, number>
  partyById: Map<string, Party>
  accountById: Map<string, Account>
  billById: Map<string, Bill>
  itemById: Map<string, Item>
  photoById: Map<string, BillPhoto>
}

const DataContext = createContext<AppData | null>(null)

const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))

export function DataProvider({ children }: { children: ReactNode }) {
  // undefined while loading, null when this device has no settings yet
  const settings = useLiveQuery(async () => (await db.settings.get('shop')) ?? null, [])
  const parties = useLiveQuery(() => db.parties.toArray(), [])
  const bills = useLiveQuery(() => db.bills.toArray(), [])
  const payments = useLiveQuery(() => db.payments.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const transfers = useLiveQuery(() => db.transfers.toArray(), [])
  const bankChecks = useLiveQuery(() => db.bankChecks.toArray(), [])
  const items = useLiveQuery(() => db.items.toArray(), [])
  const adjustments = useLiveQuery(() => db.adjustments.toArray(), [])
  const photos = useLiveQuery(() => db.photos.toArray(), [])

  const value = useMemo<AppData>(() => {
    const ready = [settings, parties, bills, payments, accounts, entries, transfers, bankChecks, items, adjustments, photos].every(
      (x) => x !== undefined,
    )
    const p = parties ?? []
    const b = bills ?? []
    const pay = payments ?? []
    const acc = (accounts ?? []).sort((x, y) => x.createdAt - y.createdAt)
    const ent = entries ?? []
    const tr = transfers ?? []
    const it = (items ?? []).sort((x, y) => x.name.localeCompare(y.name))
    const adj = adjustments ?? []
    const ph = (photos ?? []).sort((x, y) => y.date.localeCompare(x.date) || y.createdAt - x.createdAt)
    return {
      ready,
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
      parties: p.sort((x, y) => x.name.localeCompare(y.name)),
      bills: b,
      payments: pay,
      accounts: acc,
      entries: ent,
      transfers: tr,
      bankChecks: bankChecks ?? [],
      items: it,
      adjustments: adj,
      photos: ph,
      ledgers: computeAllLedgers({ parties: p, bills: b, payments: pay }),
      balances: accountBalances(acc, { payments: pay, entries: ent, transfers: tr }),
      stock: stockLevels(it, b, adj),
      partyById: byId(p),
      accountById: byId(acc),
      billById: byId(b),
      itemById: byId(it),
      photoById: byId(ph),
    }
  }, [settings, parties, bills, payments, accounts, entries, transfers, bankChecks, items, adjustments, photos])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): AppData {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}
