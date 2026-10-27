import { beforeEach, describe, expect, it } from 'vitest'
import { db, KhataDB, swapDatabase } from './db'
import { findDuplicates } from './party'
import { saveBill, saveParty, type PartyInput } from './repo'
import { matches } from './search'
import type { BillLine } from './types'

let n = 0
beforeEach(() => swapDatabase(new KhataDB(`party-${++n}`)))

const line: BillLine = { id: 'l1', name: 'LED bulb', unit: 'pcs', qty: 10, rate: 14500, discount: 0, taxable: true }
const base: PartyInput = {
  type: 'customer',
  name: 'Ram Traders',
  phone: '9841000000',
  pan: '301234567',
  address: 'Butwal',
  openingBalance: 0,
  openingDate: '2024-07-16',
  creditDays: 30,
  note: '',
}

describe('search', () => {
  it('finds a party by name, phone or PAN typed in Nepali or Latin digits', () => {
    const p = { name: 'Gurung Hardware', phone: '9856012345', pan: '303456789', address: 'Pokhara' }
    const hit = (q: string) => matches(q, p.name, p.phone, p.pan, p.address)
    expect(hit('gurung')).toBe(true)
    expect(hit('९८५६०१')).toBe(true)
    expect(hit('३०३४५६७८९')).toBe(true)
    expect(hit('303 456 789')).toBe(true)
    expect(hit('+977-9856012345')).toBe(true)
    expect(hit('9800')).toBe(false)
    expect(hit('')).toBe(true)
  })

  it('matches bill numbers typed in Nepali digits', () => {
    expect(matches('१०६७', '1067', 'Gurung')).toBe(true)
  })
})

describe('editing a party', () => {
  it('stores phone and PAN with Latin digits even when typed in Nepali', async () => {
    const p = await saveParty({ ...base, phone: '९८४१ ०००००१', pan: '३०१ २३४ ५६७' })
    expect(p.phone).toBe('9841 000001')
    expect(p.pan).toBe('301234567')
  })

  it('copies a new name onto the party’s earlier bills and records why', async () => {
    const p = await saveParty(base)
    const bill = await saveBill({ kind: 'sale', billNo: '1', date: '2024-08-01', partyId: p.id, lines: [line], note: '' })
    await saveParty({ ...p, name: 'Ram Traders Pvt. Ltd.' })
    expect((await db.bills.get(bill.id))!.partyName).toBe('Ram Traders Pvt. Ltd.')
    const notes = (await db.history.where('entityId').equals(bill.id).toArray()).map((h) => h.note)
    expect(notes).toContain('note_party_renamed')
  })

  it('copies a new PAN onto earlier bills only when asked', async () => {
    const p = await saveParty(base)
    const keep = await saveBill({ kind: 'sale', billNo: '1', date: '2024-08-01', partyId: p.id, lines: [line], note: '' })
    const other = await saveBill({ kind: 'sale', billNo: '2', date: '2024-08-02', partyId: p.id, partyPan: '999999999', lines: [line], note: '' })

    await saveParty({ ...p, pan: '305555555' })
    expect((await db.bills.get(keep.id))!.partyPan).toBe('301234567')

    await saveParty({ ...(await db.parties.get(p.id))!, pan: '306666666' }, { panOnOldBills: true })
    expect((await db.bills.get(keep.id))!.partyPan).toBe('301234567')

    await saveParty({ ...(await db.parties.get(p.id))!, pan: '301234567' })
    await saveParty({ ...(await db.parties.get(p.id))!, pan: '307777777' }, { panOnOldBills: true })
    expect((await db.bills.get(keep.id))!.partyPan).toBe('307777777')
    // A bill written with a different PAN on purpose is left alone.
    expect((await db.bills.get(other.id))!.partyPan).toBe('999999999')
  })

  it('warns when the PAN or phone already belongs to someone else', async () => {
    const ram = await saveParty(base)
    const sita = await saveParty({ ...base, name: 'Sita Store', phone: '01-4231234', pan: '' })
    const parties = await db.parties.toArray()
    expect(findDuplicates(parties, { pan: '३०१२३४५६७', phone: '' }).pan?.id).toBe(ram.id)
    expect(findDuplicates(parties, { pan: '', phone: '+977 9841000000' }).phone?.id).toBe(ram.id)
    expect(findDuplicates(parties, { pan: '', phone: '014231234' }).phone?.id).toBe(sita.id)
    expect(findDuplicates(parties, { id: ram.id, pan: '301234567', phone: '9841000000' })).toEqual({ pan: undefined, phone: undefined })
    expect(findDuplicates(parties, { pan: '30', phone: '98' })).toEqual({ pan: undefined, phone: undefined })
  })
})
