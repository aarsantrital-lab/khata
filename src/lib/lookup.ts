import { digitsOnly, foldText, phoneKey } from './search'
import type { Bill, Party } from './types'

export type LookupField = 'pan' | 'phone' | 'name' | 'address' | 'bill_pan'

export interface LookupResult {
  party: Party
  score: number
  matchedOn: LookupField
  /** An older PAN found on one of the party's bills, when that is what matched. */
  billPan?: string
}

/**
 * Finds parties from any one detail: a name, phone number or PAN (in either digit style).
 * Exact phone and PAN matches come first, then names that start with the query.
 */
export function lookupParties(q: string, parties: Party[], bills: Bill[], limit = 20): LookupResult[] {
  const query = foldText(q.trim())
  if (!query) return []
  const qDigits = /^[\d\s\-+().]+$/.test(query) ? digitsOnly(query) : ''
  const qPhone = qDigits ? phoneKey(query) : ''

  const oldPans = new Map<string, Set<string>>()
  for (const b of bills) {
    if (!b.partyPan) continue
    const set = oldPans.get(b.partyId) ?? new Set<string>()
    set.add(b.partyPan)
    oldPans.set(b.partyId, set)
  }

  const results: LookupResult[] = []
  for (const party of parties) {
    if (party.archived) continue
    const name = foldText(party.name)
    const pan = digitsOnly(party.pan)
    const phone = phoneKey(party.phone)
    const hits: LookupResult[] = []
    const consider = (score: number, matchedOn: LookupField, billPan?: string) => hits.push({ party, score, matchedOn, billPan })

    if (qDigits.length >= 2) {
      if (pan && pan === qDigits) consider(100, 'pan')
      else if (pan.includes(qDigits)) consider(55, 'pan')
      if (phone && phone === qPhone) consider(95, 'phone')
      else if (qPhone && phone.includes(qPhone)) consider(50, 'phone')
      for (const old of oldPans.get(party.id) ?? []) {
        const d = digitsOnly(old)
        if (d === pan) continue
        if (d === qDigits) consider(40, 'bill_pan', old)
        else if (d.includes(qDigits)) consider(25, 'bill_pan', old)
      }
    }
    if (name.startsWith(query)) consider(80, 'name')
    else if (name.split(/[\s.&,()-]+/).some((w) => w.startsWith(query))) consider(70, 'name')
    else if (name.includes(query)) consider(60, 'name')
    if (foldText(party.address).includes(query)) consider(30, 'address')

    if (hits.length) results.push(hits.reduce((a, b) => (b.score > a.score ? b : a)))
  }
  return results.sort((a, b) => b.score - a.score || a.party.name.localeCompare(b.party.name)).slice(0, limit)
}
