import { describe, expect, it } from 'vitest'
import { lookupParties } from './lookup'
import type { Bill, Party } from './types'

const party = (id: string, name: string, phone: string, pan: string, address = ''): Party => ({
  id,
  createdAt: 0,
  updatedAt: 0,
  type: 'customer',
  name,
  phone,
  pan,
  address,
  openingBalance: 0,
  openingDate: '2024-07-16',
  creditDays: 30,
  note: '',
})

const parties = [
  party('a', 'Shrestha Electric Store', '9841234567', '302345678', 'Kalimati'),
  party('b', 'Gurung Hardware & Electricals', '9856012345', '303456789', 'Pokhara'),
  party('c', 'Maharjan Light House', '9803344556', '304567890', 'Lalitpur'),
]
const bills = [{ partyId: 'c', partyPan: '600000001' } as Bill]

describe('party lookup', () => {
  it('finds the party from a PAN typed in Nepali digits and puts the exact match first', () => {
    const r = lookupParties('३०३४५६७८९', parties, bills)
    expect(r[0].party.id).toBe('b')
    expect(r[0].matchedOn).toBe('pan')
  })

  it('finds the party from a phone number with +977 and dashes', () => {
    const r = lookupParties('+977-980-3344556', parties, bills)
    expect(r.map((x) => x.party.id)).toEqual(['c'])
    expect(r[0].matchedOn).toBe('phone')
  })

  it('ranks names that start with the query above names that only contain it', () => {
    // "Hardware" starts with "ha"; "Maharjan" and "Shrestha" only contain it.
    const r = lookupParties('ha', parties, bills)
    expect(r.map((x) => x.party.id)).toEqual(['b', 'c', 'a'])
  })

  it('finds a party by an older PAN that only appears on a bill', () => {
    const r = lookupParties('600000001', parties, bills)
    expect(r[0]).toMatchObject({ matchedOn: 'bill_pan', billPan: '600000001' })
  })

  it('returns nothing for an empty query', () => {
    expect(lookupParties('  ', parties, bills)).toEqual([])
  })
})
