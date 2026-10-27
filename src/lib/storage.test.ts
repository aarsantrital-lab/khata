import { beforeEach, describe, expect, it } from 'vitest'
import { createBackup, parseBackup, restoreBackup } from './backup'
import { KhataDB, swapDatabase, db } from './db'
import { computePartyLedger } from './ledger'
import { markPhotoEntered, saveAccount, saveBill, saveParty, savePayment, savePhoto, saveSettings, voidRow } from './repo'
import { downloadPhoto, pendingCount, prepareJoin, syncOnce, uploadPhotos, type PushRow, type RemoteRow, type Transport } from './sync'
import type { BillLine } from './types'

let n = 0
const freshDb = () => new KhataDB(`test-${++n}`)

const line = (rate: number): BillLine => ({ id: 'l1', name: 'Ceiling fan', unit: 'pcs', qty: 1, rate, discount: 0, taxable: true })

async function seedCustomer() {
  const cash = await saveAccount({ type: 'cash', name: 'Cash', openingBalance: 0, openingDate: '2024-07-16' })
  const party = await saveParty({
    type: 'customer',
    name: 'Ram Traders',
    phone: '9841000000',
    pan: '301234567',
    address: 'Butwal',
    openingBalance: 0,
    openingDate: '2024-07-16',
    creditDays: 30,
    note: '',
  })
  return { cash, party }
}

beforeEach(() => {
  swapDatabase(freshDb())
})

describe('saving records', () => {
  it('saves a sale with partial payment at the time of the bill', async () => {
    const { cash, party } = await seedCustomer()
    const bill = await saveBill(
      { kind: 'sale', billNo: '101', date: '2024-08-01', partyId: party.id, lines: [line(796460)], note: '' },
      { amount: 400000, accountId: cash.id },
    )
    expect(bill.totals.total).toBe(900000) // 7,964.60 + 13% VAT
    expect(bill.partyPan).toBe('301234567')
    const payments = await db.payments.toArray()
    expect(payments).toHaveLength(1)
    expect(payments[0].allocations).toEqual([{ billId: bill.id, amount: 400000 }])
    const ledger = computePartyLedger(party, await db.bills.toArray(), payments)
    expect(ledger.docs[0].status).toBe('partial')
    expect(ledger.docs[0].remaining).toBe(500000)
  })

  it('keeps the previous version in history and never deletes', async () => {
    const { party } = await seedCustomer()
    const bill = await saveBill({ kind: 'sale', billNo: '7', date: '2024-08-01', partyId: party.id, lines: [line(10000)], note: '' })
    await saveBill({ ...bill, billNo: '8' })
    await voidRow('bills', (await db.bills.get(bill.id))!, 'Entered twice')
    const stored = await db.bills.get(bill.id)
    expect(stored?.voided?.reason).toBe('Entered twice')
    const history = (await db.history.where('entityId').equals(bill.id).toArray()).sort((a, b) => a.createdAt - b.createdAt)
    expect(history.map((h) => h.action)).toEqual(['create', 'update', 'void'])
    expect((history[1].before as { billNo: string }).billNo).toBe('7')
  })

  it('rejects allocations larger than the payment', async () => {
    const { cash, party } = await seedCustomer()
    await expect(
      savePayment({
        direction: 'in',
        partyId: party.id,
        date: '2024-08-01',
        amount: 100,
        accountId: cash.id,
        method: 'cash',
        allocations: [{ billId: 'x', amount: 200 }],
        note: '',
      }),
    ).rejects.toThrow('allocation_too_large')
  })
})

class MemoryServer implements Transport {
  rows = new Map<string, RemoteRow>()
  seq = 0
  async push(shopId: string, rows: PushRow[]) {
    for (const r of rows) {
      const key = `${shopId}|${r.tbl}|${r.id}`
      const existing = this.rows.get(key)
      if (!existing || existing.updated_at < r.updated_at) this.rows.set(key, { ...structuredClone(r), server_seq: ++this.seq })
    }
  }
  async pull(shopId: string, since: number, limit: number) {
    return [...this.rows.entries()]
      .filter(([k, r]) => k.startsWith(`${shopId}|`) && r.server_seq > since)
      .map(([, r]) => structuredClone(r))
      .sort((a, b) => a.server_seq - b.server_seq)
      .slice(0, limit)
  }
  photos = new Map<string, { type: string; data: string }>()
  maxPhoto = Infinity
  async putPhoto(shopId: string, id: string, type: string, data: string) {
    if (data.length > this.maxPhoto) throw new Error('400 {"message":"photo_too_large"}')
    if (!this.photos.has(`${shopId}|${id}`)) this.photos.set(`${shopId}|${id}`, { type, data })
  }
  async getPhoto(shopId: string, id: string) {
    return this.photos.get(`${shopId}|${id}`) ?? null
  }
}

describe('sync between phone and laptop', () => {
  it('copies changes made offline on one device to the other', async () => {
    const server = new MemoryServer()
    const phone = freshDb()
    const laptop = freshDb()

    swapDatabase(phone)
    const { party } = await seedCustomer()
    await saveBill({ kind: 'sale', billNo: '1', date: '2024-08-01', partyId: party.id, lines: [line(10000)], note: '' })
    expect(await phone.outbox.count()).toBeGreaterThan(0)
    await syncOnce(server, 'shop')
    expect(await phone.outbox.count()).toBe(0)

    swapDatabase(laptop)
    await syncOnce(server, 'shop')
    expect(await laptop.parties.count()).toBe(1)
    expect(await laptop.bills.count()).toBe(1)
    expect(await laptop.outbox.count()).toBe(0)

    const p = (await laptop.parties.get(party.id))!
    await saveParty({ ...p, phone: '9800000001' })
    await syncOnce(server, 'shop')

    swapDatabase(phone)
    await syncOnce(server, 'shop')
    expect((await phone.parties.get(party.id))!.phone).toBe('9800000001')
  })

  it('keeps the newest edit when both devices change the same record', async () => {
    const server = new MemoryServer()
    const phone = freshDb()
    const laptop = freshDb()
    swapDatabase(phone)
    const { party } = await seedCustomer()
    await syncOnce(server, 'shop')
    swapDatabase(laptop)
    await syncOnce(server, 'shop')

    swapDatabase(phone)
    await saveParty({ ...(await phone.parties.get(party.id))!, address: 'Old edit' })
    await new Promise((r) => setTimeout(r, 5))
    swapDatabase(laptop)
    await saveParty({ ...(await laptop.parties.get(party.id))!, address: 'Newest edit' })

    await syncOnce(server, 'shop')
    swapDatabase(phone)
    await syncOnce(server, 'shop')
    swapDatabase(laptop)
    await syncOnce(server, 'shop')

    expect((await phone.parties.get(party.id))!.address).toBe('Newest edit')
    expect((await laptop.parties.get(party.id))!.address).toBe('Newest edit')
  })

  it('joins a second device without duplicating its setup data', async () => {
    const server = new MemoryServer()
    const phone = freshDb()
    swapDatabase(phone)
    await saveSettings({ shopName: 'Laxmi Electronics', onboarded: true })
    await seedCustomer()
    await syncOnce(server, 'shop')

    const laptop = freshDb()
    swapDatabase(laptop)
    await saveSettings({ shopName: '', onboarded: true })
    await saveAccount({ type: 'cash', name: 'नगद', openingBalance: 0, openingDate: '2024-07-16' })

    await expect(prepareJoin(server, 'wrong-code')).rejects.toThrow('sync_code_not_found')
    expect(await laptop.accounts.count()).toBe(1)

    expect(await prepareJoin(server, 'shop')).toEqual({ cleared: true })
    await syncOnce(server, 'shop')
    expect(await laptop.accounts.count()).toBe(1)
    expect((await laptop.accounts.toArray())[0].name).toBe('Cash')
    expect((await laptop.settings.get('shop'))?.shopName).toBe('Laxmi Electronics')
    expect(await laptop.parties.count()).toBe(1)
  })

  it('keeps existing work when joining from a device that already has records', async () => {
    const server = new MemoryServer()
    swapDatabase(freshDb())
    await seedCustomer()
    await syncOnce(server, 'shop')
    const laptop = freshDb()
    swapDatabase(laptop)
    await seedCustomer()
    expect(await prepareJoin(server, 'shop')).toEqual({ cleared: false })
    await syncOnce(server, 'shop')
    expect(await laptop.parties.count()).toBe(2)
  })

  it('keeps shops separate', async () => {
    const server = new MemoryServer()
    swapDatabase(freshDb())
    await seedCustomer()
    await syncOnce(server, 'shop-a')
    const other = freshDb()
    swapDatabase(other)
    await syncOnce(server, 'shop-b')
    expect(await other.parties.count()).toBe(0)
  })
})

describe('backup and restore', () => {
  it('restores into an empty device and does not overwrite newer data', async () => {
    const { party } = await seedCustomer()
    const backup = await createBackup()

    const target = freshDb()
    swapDatabase(target)
    const first = await restoreBackup(backup)
    expect(first.added).toBeGreaterThan(0)
    expect(await target.parties.count()).toBe(1)

    await saveParty({ ...(await target.parties.get(party.id))!, name: 'Ram Traders Pvt Ltd' })
    const again = await restoreBackup(backup)
    expect(again.added).toBe(0)
    expect((await target.parties.get(party.id))!.name).toBe('Ram Traders Pvt Ltd')
  })
})

const photoBytes = (n = 2000) => new Uint8Array(n).map((_, i) => (i * 7) % 256)

async function takePhoto(partyId?: string) {
  return savePhoto(
    { status: 'pending', kind: 'sale', partyId, date: '2024-08-01', note: 'Hand bill 44', thumb: 'data:image/jpeg;base64,AAAA', type: 'image/webp', bytes: 2000, width: 1200, height: 1600 },
    { data: photoBytes(), type: 'image/webp' },
  )
}

describe('bill photos', () => {
  it('keeps the image apart from the photo row and links it to the bill typed from it', async () => {
    const { party } = await seedCustomer()
    const photo = await takePhoto()
    expect((await db.photoFiles.get(photo.id))?.data).toEqual(photoBytes())
    expect(Object.keys(photo)).not.toContain('data')

    const bill = await saveBill({ kind: 'sale', billNo: '44', date: '2024-08-01', partyId: party.id, lines: [line(10000)], note: '' })
    await markPhotoEntered(photo.id, bill)
    const done = (await db.photos.get(photo.id))!
    expect(done).toMatchObject({ status: 'done', billId: bill.id, partyId: party.id, kind: 'sale' })
    const history = await db.history.where('entityId').equals(photo.id).toArray()
    expect(history.map((h) => h.note)).toContain('note_entered_from_photo')
    expect(history.every((h) => !(h.after as { thumb?: string }).thumb)).toBe(true)
  })

  it('removes a photo without deleting it', async () => {
    const photo = await takePhoto()
    await voidRow('photos', photo, 'Blurry')
    expect((await db.photos.get(photo.id))?.voided?.reason).toBe('Blurry')
    expect(await db.photoFiles.get(photo.id)).toBeTruthy()
  })

  it('puts photo images in the backup and restores them', async () => {
    const photo = await takePhoto()
    const backup = parseBackup(JSON.stringify(await createBackup()))
    expect(backup.files).toHaveLength(1)

    const target = freshDb()
    swapDatabase(target)
    const result = await restoreBackup(backup)
    expect(result.photos).toBe(1)
    expect((await target.photos.get(photo.id))?.note).toBe('Hand bill 44')
    expect((await target.photoFiles.get(photo.id))?.data).toEqual(photoBytes())
    expect((await restoreBackup(backup)).photos).toBe(0)
  })

  it('still restores backups made before photos existed', async () => {
    await seedCustomer()
    const old = await createBackup()
    delete old.files
    delete old.tables.photos
    swapDatabase(freshDb())
    expect((await restoreBackup(parseBackup(JSON.stringify(old)))).photos).toBe(0)
  })

  it('uploads images after the rows and downloads them on the other device only when opened', async () => {
    const server = new MemoryServer()
    const phone = freshDb()
    swapDatabase(phone)
    const photo = await takePhoto()
    expect(await pendingCount()).toBeGreaterThan(0)
    await syncOnce(server, 'shop')
    expect(await uploadPhotos(server, 'shop')).toEqual({ uploaded: 1, refused: 0 })
    expect(await pendingCount()).toBe(0)
    expect(await uploadPhotos(server, 'shop')).toEqual({ uploaded: 0, refused: 0 })

    const laptop = freshDb()
    swapDatabase(laptop)
    await syncOnce(server, 'shop')
    expect((await laptop.photos.get(photo.id))?.thumb).toBe('data:image/jpeg;base64,AAAA')
    expect(await laptop.photoFiles.count()).toBe(0)
    expect(await downloadPhoto(server, 'shop', photo.id)).toBe(true)
    expect((await laptop.photoFiles.get(photo.id))?.data).toEqual(photoBytes())
    expect(await downloadPhoto(server, 'shop-b', photo.id)).toBe(false)
  })

  it('keeps an image the server refuses as too large on this device and stops retrying', async () => {
    const server = new MemoryServer()
    server.maxPhoto = 100
    const photo = await takePhoto()
    expect(await uploadPhotos(server, 'shop')).toEqual({ uploaded: 0, refused: 1 })
    expect((await db.photoFiles.get(photo.id))?.uploaded).toBe(2)
    expect(await uploadPhotos(server, 'shop')).toEqual({ uploaded: 0, refused: 0 })
  })

  it('counts a photo as real work when joining a shop', async () => {
    const server = new MemoryServer()
    await seedCustomer()
    await syncOnce(server, 'shop')
    swapDatabase(freshDb())
    await takePhoto()
    expect(await prepareJoin(server, 'shop')).toEqual({ cleared: false })
  })
})
