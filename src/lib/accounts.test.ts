import { beforeEach, describe, expect, it } from 'vitest'
import { presetExists, quickAddAccounts } from './accounts'
import { db, KhataDB, swapDatabase } from './db'
import { saveAccount } from './repo'

let n = 0
beforeEach(() => swapDatabase(new KhataDB(`accounts-${++n}`)))

describe('quick-add banks and wallets', () => {
  it('treats eSewa and Khalti as one account each, whatever they are called', async () => {
    const esewa = await saveAccount({ type: 'esewa', name: 'इसेवा', openingBalance: 0, openingDate: '2024-07-16' })
    expect(presetExists({ name: 'eSewa', type: 'esewa' }, [esewa])).toBe(true)
    expect(presetExists({ name: 'Khalti', type: 'khalti' }, [esewa])).toBe(false)
  })

  it('matches banks by name, ignoring "Bank", "Ltd" and spacing', async () => {
    const nic = await saveAccount({ type: 'bank', name: 'NIC ASIA Bank Ltd.', openingBalance: 0, openingDate: '2024-07-16' })
    expect(presetExists({ name: 'NIC Asia Bank', type: 'bank' }, [nic])).toBe(true)
    expect(presetExists({ name: 'Nabil Bank', type: 'bank' }, [nic])).toBe(false)
  })

  it('still recognises a bank whose name is only filler words', async () => {
    const nepal = await saveAccount({ type: 'bank', name: 'Nepal Bank Ltd', openingBalance: 0, openingDate: '2024-07-16' })
    expect(presetExists({ name: 'Nepal Bank', type: 'bank' }, [nepal])).toBe(true)
    expect(presetExists({ name: 'Nepal SBI Bank', type: 'bank' }, [nepal])).toBe(false)
  })

  it('adds only the accounts the shop does not have, with their opening balances', async () => {
    const existing = [await saveAccount({ type: 'bank', name: 'Global IME Bank', openingBalance: 0, openingDate: '2024-07-16' })]
    const added = await quickAddAccounts(
      [
        { name: 'Global IME Bank', type: 'bank', openingBalance: 100 },
        { name: 'Nabil Bank', type: 'bank', openingBalance: 2500000 },
        { name: 'IME Pay', type: 'wallet', openingBalance: 0 },
        { name: 'IME Pay', type: 'wallet', openingBalance: 0 },
        { name: '  ', type: 'wallet', openingBalance: 0 },
      ],
      existing,
      '2024-08-01',
    )
    expect(added.map((a) => [a.name, a.type, a.openingBalance])).toEqual([
      ['Nabil Bank', 'bank', 2500000],
      ['IME Pay', 'wallet', 0],
    ])
    expect(await db.accounts.count()).toBe(3)
    expect((await db.accounts.toArray()).every((a) => a.openingDate === '2024-08-01' || a.name === 'Global IME Bank')).toBe(true)
  })
})
