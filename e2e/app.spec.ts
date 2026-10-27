import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { loadSample, numpad, pickParty } from './helpers'

const cardValue = (page: Page, key: string) => page.getByTestId(`card-${key}`).getByTestId('card-value')
const rupees = (s: string) => Number(s.replace(/[^0-9.]/g, ''))

test('dashboard shows balances with good/bad trend arrows', async ({ page }) => {
  await loadSample(page)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('New Laxmi Electronics')
  expect(rupees(await cardValue(page, 'sales').innerText())).toBeGreaterThan(0)
  expect(rupees(await cardValue(page, 'receive').innerText())).toBeGreaterThan(0)
  expect(rupees(await cardValue(page, 'pay').innerText())).toBeGreaterThan(0)
  // Sales went up compared to yesterday, which is good (green).
  const salesTrend = page.getByTestId('card-sales').locator('[data-trend]')
  await expect(salesTrend).toHaveAttribute('data-trend', 'up')
  await expect(salesTrend).toHaveAttribute('data-good', 'true')
  await expect(page.getByText('Overdue parties')).toBeVisible()
  await expect(page.getByText('Low stock')).toBeVisible()
})

test('expense lowers cash and transfer moves money between accounts', async ({ page }) => {
  await loadSample(page)
  const cashBefore = rupees(await cardValue(page, 'cash').innerText())

  await page.getByTestId('quick-expense').click()
  await page.getByTestId('entry-amount').click()
  await numpad(page, '1500')
  await page.getByTestId('cat-transport').click()
  await page.getByTestId('save-entry').click()
  await expect(page.getByTestId('entry-row').first()).toContainText('Transport')

  await page.goto('/#/')
  await expect(cardValue(page, 'cash')).toHaveText(`Rs ${(cashBefore - 1500).toLocaleString('en-IN')}`)

  await page.goto('/#/money')
  await page.getByTestId('new-transfer').click()
  await page.getByTestId('transfer-amount').click()
  await numpad(page, '2000')
  await page.getByTestId('save-transfer').click()
  await expect(page.getByTestId('entry-row').first()).toContainText('Cash → NIC Asia Bank')
  await page.goto('/#/')
  await expect(cardValue(page, 'cash')).toHaveText(`Rs ${(cashBefore - 3500).toLocaleString('en-IN')}`)
})

test('selling a saved item reduces stock', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/stock')
  const fanQty = page.getByTestId('item-row').filter({ hasText: 'Havells Ceiling Fan' }).getByTestId('item-qty')
  const before = Number(await fanQty.innerText())
  await page.goto('/#/bills/new/sale')
  await pickParty(page, 'bill-party', 'Maharjan Light House')
  await page.getByTestId('add-line').click()
  await page.getByRole('dialog').getByRole('button', { name: /Havells Ceiling Fan/ }).click()
  await page.getByTestId('bill-line').last().getByRole('button', { name: 'Qty', exact: true }).click()
  await numpad(page, '3')
  await expect(page.getByTestId('bill-total')).toHaveText('Rs 13,051.50')
  await page.getByRole('radio', { name: 'Full' }).click()
  await page.getByTestId('save-bill').click()
  await expect(page.locator('[data-status="paid"]')).toBeVisible()

  await page.goto('/#/stock')
  await expect(fanQty).toHaveText(String(before - 3))
})

test('reports: summary, VAT by month and sales book export', async ({ page }) => {
  await loadSample(page)
  await page.getByTestId('quick-reports').click()
  await expect(page.getByTestId('profit-table')).toContainText('Net profit')
  await expect(page.getByTestId('sales-chart')).toBeVisible()
  await expect(page.getByTestId('top-debtors')).toContainText('Gurung Hardware')

  await page.getByTestId('period-prev').click()
  await expect(page.getByTestId('period-label')).not.toBeEmpty()

  await page.getByRole('radio', { name: 'VAT' }).click()
  await expect(page.getByTestId('vat-row').first()).toBeVisible()

  await page.getByRole('radio', { name: 'Books' }).click()
  await page.getByRole('radio', { name: 'Year' }).click()
  await expect(page.getByTestId('document')).toContainText('Sales book')
  const download = page.waitForEvent('download')
  await page.getByTestId('export-excel').click()
  expect((await download).suggestedFilename()).toMatch(/^sales-book-.*\.xlsx$/)
})

test('settings: language switch, PIN lock and backup', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/settings')

  await page.getByRole('radio', { name: 'नेपाली' }).first().click()
  await expect(page.getByRole('heading', { name: 'सेटिङ' })).toBeVisible()
  await page.getByRole('radio', { name: 'English' }).first().click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  await page.getByTestId('set-pin').click()
  for (const d of '2468') await page.getByRole('dialog').getByRole('button', { name: d, exact: true }).click()
  await expect(page.getByRole('dialog').getByText('Enter the same PIN again')).toBeVisible()
  for (const d of '2468') await page.getByRole('dialog').getByRole('button', { name: d, exact: true }).click()
  await expect(page.getByTestId('pin-status')).toContainText('PIN is on')

  await page.getByTestId('lock-now').click()
  await expect(page.getByText('Enter your PIN')).toBeVisible()
  for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click()
  await expect(page.getByText('Wrong PIN. Try again.')).toBeVisible()
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click()
  await expect(page.getByTestId('pin-status')).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByTestId('download-backup').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^khata-backup-\d{4}-\d{2}-\d{2}\.json$/)

  await page.getByTestId('restore-input').setInputFiles((await file.path())!)
  await expect(page.getByText(/Restored: 0 new, 0 updated/)).toBeVisible()
})

test('Nepali mode shows Nepali digits and BS dates', async ({ page }) => {
  await loadSample(page, 'नेपाली')
  await expect(page.getByTestId('quick-sale')).toContainText('बिक्री')
  await expect(cardValue(page, 'cash')).toHaveText(/^रु [०-९,]+$/)
  await page.goto('/#/settings')
  await page.getByRole('radio', { name: 'ई.सं.' }).click()
  await page.getByRole('radio', { name: '123' }).click()
  await page.goto('/#/')
  await expect(cardValue(page, 'cash')).toHaveText(/^रु [0-9,]+$/)
})
