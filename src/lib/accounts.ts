import type { ISODate } from './bsdate'
import { saveAccount } from './repo'
import type { Account, AccountType } from './types'

export interface AccountPreset {
  name: string
  type: AccountType
}

/** Banks a wholesale shop in Nepal is likely to use, for the quick-add screen. */
export const COMMON_BANKS: string[] = [
  'NIC Asia Bank',
  'Global IME Bank',
  'Nabil Bank',
  'Himalayan Bank',
  'NMB Bank',
  'Prabhu Bank',
  'Kumari Bank',
  'Laxmi Sunrise Bank',
  'Siddhartha Bank',
  'Sanima Bank',
  'Everest Bank',
  'Machhapuchchhre Bank',
  'Citizens Bank',
  'Prime Commercial Bank',
  'Nepal Investment Mega Bank',
  'Nepal SBI Bank',
  'Standard Chartered Nepal',
  'Nepal Bank',
  'Rastriya Banijya Bank',
  'Agricultural Development Bank',
]

export const COMMON_WALLETS: AccountPreset[] = [
  { name: 'eSewa', type: 'esewa' },
  { name: 'Khalti', type: 'khalti' },
  { name: 'IME Pay', type: 'wallet' },
  { name: 'PrabhuPAY', type: 'wallet' },
  { name: 'MyPay', type: 'wallet' },
  { name: 'CellPay', type: 'wallet' },
  { name: 'Namaste Pay', type: 'wallet' },
]

/** Wallet-like accounts: money on the phone rather than in a bank or the drawer. */
export const WALLET_TYPES: AccountType[] = ['esewa', 'khalti', 'wallet']

const plainName = (s: string, filler: RegExp) => s.toLowerCase().replace(filler, '').replace(/[^a-z0-9\u0900-\u097f]+/g, '')
// "Nepal Bank" is nothing but filler words, so it keeps those and drops only "Ltd".
const normalizeName = (s: string) => plainName(s, /\b(bank|limited|ltd|pvt|nepal)\b/g) || plainName(s, /\b(limited|ltd|pvt)\b/g)

/** eSewa and Khalti are one account each however they were named; others match by name. */
export function presetExists(preset: AccountPreset, accounts: Account[]): boolean {
  const live = accounts.filter((a) => !a.archived)
  if (preset.type === 'esewa' || preset.type === 'khalti') return live.some((a) => a.type === preset.type)
  const key = normalizeName(preset.name)
  return key !== '' && live.some((a) => normalizeName(a.name) === key)
}

export interface QuickAddRow extends AccountPreset {
  openingBalance: number
}

/** Saves every chosen account that the shop does not have yet. Returns the new accounts. */
export async function quickAddAccounts(rows: QuickAddRow[], existing: Account[], openingDate: ISODate): Promise<Account[]> {
  const added: Account[] = []
  for (const row of rows) {
    const name = row.name.trim()
    if (!name || presetExists(row, [...existing, ...added])) continue
    added.push(await saveAccount({ type: row.type, name, openingBalance: row.openingBalance, openingDate }))
  }
  return added
}
