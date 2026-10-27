import { addDays, todayIso } from './bsdate'
import { computeTotals } from './vat'
import {
  saveAccount,
  saveBill,
  saveEntry,
  saveItem,
  saveParty,
  savePayment,
  saveSettings,
  saveTransfer,
  uid,
  type ItemInput,
  type PartyInput,
} from './repo'
import type { BillLine, Item } from './types'

const rs = (n: number) => Math.round(n * 100)

/** Example data for trying the app. Uses the same save functions as the screens. */
export async function loadSampleData(language: 'ne' | 'en') {
  const today = todayIso()
  const ago = (n: number) => addDays(today, -n)

  await saveSettings({
    shopName: language === 'ne' ? 'न्यू लक्ष्मी इलेक्ट्रोनिक्स' : 'New Laxmi Electronics',
    pan: '301234567',
    address: language === 'ne' ? 'भोटाहिटी, काठमाडौं' : 'Bhotahity, Kathmandu',
    phone: '9851012345',
    language,
    digits: language,
    calendar: 'bs',
  })

  const cash = await saveAccount({ type: 'cash', name: language === 'ne' ? 'नगद' : 'Cash', openingBalance: rs(45000), openingDate: ago(60) })
  const nic = await saveAccount({ type: 'bank', name: 'NIC Asia Bank', openingBalance: rs(250000), openingDate: ago(60) })
  await saveAccount({ type: 'bank', name: 'Global IME Bank', openingBalance: rs(80000), openingDate: ago(60) })
  const esewa = await saveAccount({ type: 'esewa', name: 'eSewa', openingBalance: rs(5000), openingDate: ago(60) })

  const itemDefs: ItemInput[] = [
    { name: 'Philips LED Bulb 9W', brand: 'Philips', model: '9W B22', category: 'Lighting', unit: 'pcs', salePrice: rs(145), costPrice: rs(118), taxable: true, openingQty: 400, lowStockAt: 100 },
    { name: 'Havells Ceiling Fan 1200mm', brand: 'Havells', model: 'Andria 1200', category: 'Fans', unit: 'pcs', salePrice: rs(3850), costPrice: rs(3250), taxable: true, openingQty: 24, lowStockAt: 10 },
    { name: 'Anchor Roma 6A Switch (20)', brand: 'Anchor', model: 'Roma 6A', category: 'Switches', unit: 'box', salePrice: rs(1150), costPrice: rs(920), taxable: true, openingQty: 30, lowStockAt: 10 },
    { name: 'Finolex Wire 1.5 sq mm 90m', brand: 'Finolex', model: '1.5 sq mm', category: 'Wires', unit: 'box', salePrice: rs(2450), costPrice: rs(2050), taxable: true, openingQty: 15, lowStockAt: 5 },
    { name: 'Syska 4-way Extension Board', brand: 'Syska', model: 'EB-0440', category: 'Accessories', unit: 'pcs', salePrice: rs(480), costPrice: rs(370), taxable: true, openingQty: 60, lowStockAt: 20 },
    { name: 'Eveready AA Battery (10)', brand: 'Eveready', model: 'AA 1015', category: 'Batteries', unit: 'box', salePrice: rs(220), costPrice: rs(170), taxable: true, openingQty: 14, lowStockAt: 10 },
    { name: 'Sun King Solar Lantern', brand: 'Sun King', model: 'Pro 400', category: 'Solar', unit: 'pcs', salePrice: rs(1800), costPrice: rs(1450), taxable: false, openingQty: 12, lowStockAt: 4 },
  ]
  const items: Item[] = []
  for (const def of itemDefs) items.push(await saveItem(def))
  const [bulb, fan, sw, wire, ext, battery, solar] = items

  const party = (p: Partial<PartyInput> & Pick<PartyInput, 'name' | 'type'>) =>
    saveParty({ phone: '', pan: '', address: '', openingBalance: 0, openingDate: ago(60), creditDays: 30, note: '', ...p })

  const shrestha = await party({ type: 'customer', name: 'Shrestha Electric Store', phone: '9841234567', pan: '302345678', address: 'Kalimati, Kathmandu' })
  const gurung = await party({ type: 'customer', name: 'Gurung Hardware & Electricals', phone: '9856012345', pan: '303456789', address: 'Mahendrapul, Pokhara', openingBalance: rs(12500) })
  const tamang = await party({ type: 'customer', name: 'Tamang Mobile & Electronics', phone: '9813456789', address: 'Banepa, Kavre' })
  const maharjan = await party({ type: 'customer', name: 'Maharjan Light House', phone: '9803344556', pan: '304567890', address: 'Mangal Bazar, Lalitpur' })
  const himalayan = await party({ type: 'supplier', name: 'Himalayan Distributors Pvt. Ltd.', phone: '014231234', pan: '600123456', address: 'Teku, Kathmandu', creditDays: 45 })
  const everest = await party({ type: 'supplier', name: 'Everest Electricals Trading', phone: '9851098765', pan: '601234567', address: 'Birgunj', openingBalance: -rs(40000) })

  const line = (item: Item, qty: number, discount = 0, rate = item.salePrice): BillLine => ({
    id: uid(),
    itemId: item.id,
    name: item.name,
    unit: item.unit,
    qty,
    rate,
    discount: rs(discount),
    taxable: item.taxable,
    cost: item.costPrice,
  })
  const buy = (item: Item, qty: number): BillLine => ({ ...line(item, qty, 0, item.costPrice), cost: undefined })

  await saveBill(
    { kind: 'purchase', billNo: 'HD-2231', date: ago(40), partyId: himalayan.id, lines: [buy(fan, 20), buy(bulb, 300)], note: '' },
    { amount: rs(50000), accountId: nic.id },
  )
  await saveBill({ kind: 'purchase', billNo: 'ET-884', date: ago(12), partyId: everest.id, lines: [buy(wire, 10), buy(sw, 20)], note: '' })

  const s1 = await saveBill({ kind: 'sale', billNo: '1041', date: ago(45), partyId: gurung.id, lines: [line(fan, 6), line(bulb, 100, 500)], note: '' })
  await saveBill({ kind: 'sale', billNo: '1052', date: ago(20), partyId: shrestha.id, lines: [line(wire, 3), line(sw, 4)], note: '' }, { amount: rs(9000), accountId: cash.id })
  await saveBill({ kind: 'sale', billNo: '1058', date: ago(9), partyId: maharjan.id, lines: [line(bulb, 120), line(ext, 10)], note: '' }, { amount: computeTotals([line(bulb, 120), line(ext, 10)]).total, accountId: esewa.id })
  await saveBill({ kind: 'sale', billNo: '1063', date: ago(3), partyId: tamang.id, lines: [line(battery, 6), line(solar, 2), line(ext, 5)], note: '' })
  await saveBill({ kind: 'sale', billNo: '1066', date: ago(1), partyId: shrestha.id, lines: [line(fan, 2), line(bulb, 50)], note: '' }, { amount: rs(5000), accountId: cash.id })
  await saveBill({ kind: 'sale', billNo: '1067', date: today, partyId: gurung.id, lines: [line(fan, 4), line(sw, 3)], note: '' })
  await saveBill({ kind: 'sale', billNo: '1068', date: today, partyId: maharjan.id, lines: [line(bulb, 80), line(battery, 4)], note: '' }, { amount: rs(6000), accountId: cash.id })

  await saveBill({
    kind: 'sale_return',
    billNo: 'CN-1041',
    date: ago(40),
    partyId: gurung.id,
    refBillId: s1.id,
    lines: [line(fan, 1)],
    note: language === 'ne' ? 'एउटा पंखा बिग्रेको' : 'One fan damaged',
  })

  await savePayment({ direction: 'in', partyId: gurung.id, date: ago(30), amount: rs(15000), accountId: nic.id, method: 'bank', allocations: [], note: '' })
  await savePayment({ direction: 'in', partyId: tamang.id, date: ago(5), amount: rs(3000), accountId: esewa.id, method: 'esewa', allocations: [], note: language === 'ne' ? 'पेस्की' : 'Advance' })
  await savePayment({ direction: 'out', partyId: himalayan.id, date: ago(15), amount: rs(40000), accountId: nic.id, method: 'bank', allocations: [], note: '' })

  const expense = (category: string, amount: number, daysAgo: number, scope: 'business' | 'personal' = 'business', accountId = cash.id) =>
    saveEntry({ type: 'expense', category, scope, accountId, amount: rs(amount), date: ago(daysAgo), note: '' })
  await expense('rent', 25000, 28, 'business', nic.id)
  await expense('salary', 18000, 27)
  await expense('electricity', 2100, 18)
  await expense('transport', 1200, 9)
  await expense('tea_snacks', 350, 1)
  await expense('transport', 800, 0)
  await expense('household', 5000, 6, 'personal')
  await saveEntry({ type: 'income', category: 'commission', scope: 'business', accountId: nic.id, amount: rs(2500), date: ago(14), note: '' })

  await saveTransfer({ fromAccountId: cash.id, toAccountId: nic.id, amount: rs(30000), date: ago(7), note: '' })

  // Last, so the app only leaves the welcome screen once everything is in place.
  await saveSettings({ onboarded: true })
}
