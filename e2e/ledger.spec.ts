import { expect, test } from './fixtures'
import { addCustomer, addFreeLine, numpad, onboardEnglish, pickParty } from './helpers'

test('bill with partial payment, advance and credit note', async ({ page }) => {
  await onboardEnglish(page)
  await addCustomer(page, 'Shrestha Electric Store')

  // Sale of Rs 7,964.60 + 13% VAT = Rs 9,000, with Rs 4,000 paid at the counter.
  await page.goto('/#/bills/new/sale')
  await pickParty(page, 'bill-party', 'Shrestha Electric Store')
  await page.locator('#bill-no').fill('1001')
  await addFreeLine(page, 'Ceiling fan', '7964.60')
  await expect(page.getByTestId('bill-total')).toHaveText('Rs 9,000')
  await page.getByRole('radio', { name: 'Partial' }).click()
  await page.getByTestId('pay-now').click()
  await numpad(page, '4000')
  await expect(page.getByText('Partial, Rs 5,000 remaining')).toBeVisible()
  await page.getByTestId('save-bill').click()

  await expect(page.locator('[data-status="partial"]')).toBeVisible()
  await expect(page.getByText('Paid so far').locator('..')).toContainText('Rs 4,000')
  await expect(page.getByText('Remaining', { exact: true }).locator('..')).toContainText('Rs 5,000')

  // Payment of Rs 7,000 clears the bill; Rs 2,000 is kept as advance.
  await page.getByRole('link', { name: 'Shrestha Electric Store' }).click()
  await expect(page.getByTestId('party-balance')).toContainText('Rs 5,000')
  await page.getByTestId('party-payment').click()
  await page.getByTestId('payment-amount').click()
  await numpad(page, '7000')
  await expect(page.getByText('Rs 2,000 not applied to a bill will be kept as advance.')).toBeVisible()
  await page.getByTestId('save-payment').click()
  await expect(page.getByTestId('party-balance')).toContainText('Advance credit: Rs 2,000')

  // The next bill uses the advance automatically.
  await page.goto('/#/bills/new/sale')
  await pickParty(page, 'bill-party', 'Shrestha Electric Store')
  await expect(page.locator('#bill-no')).toHaveValue('1002')
  await addFreeLine(page, 'LED bulb', '100', '10')
  await expect(page.getByTestId('bill-total')).toHaveText('Rs 1,130')
  await page.getByTestId('save-bill').click()
  await expect(page.locator('[data-status="paid"]')).toBeVisible()
  await expect(page.getByText('(auto)')).toBeVisible()

  // Return 4 bulbs: a credit note against bill 1002, which becomes advance again.
  await page.getByTestId('bill-return').click()
  await page.getByTestId('bill-line').first().getByRole('button', { name: 'Qty', exact: true }).click()
  await numpad(page, '4')
  await expect(page.getByTestId('bill-total')).toHaveText('Rs 452')
  await page.getByTestId('save-bill').click()
  await expect(page.getByText('Return against bill 1002')).toBeVisible()

  await page.getByRole('link', { name: 'Shrestha Electric Store' }).click()
  await expect(page.getByTestId('party-balance')).toContainText('Advance credit: Rs 1,322')

  // Bill copy carries the VAT disclaimer with the handwritten bill number.
  await page.goto('/#/bills')
  await page.getByTestId('bill-row').filter({ hasText: '1001' }).click()
  await page.getByTestId('bill-copy').click()
  await expect(page.getByTestId('vat-footer')).toContainText('This is a payment statement, not a tax invoice. Ref. Bill No. 1001')
  await expect(page.getByTestId('document').locator('[data-stamp="paid"]')).toHaveText('PAID')
  const download = page.waitForEvent('download')
  await page.getByTestId('doc-pdf').click()
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
})

test('cancelled bills stay in history and can be restored', async ({ page }) => {
  await onboardEnglish(page)
  await addCustomer(page, 'Gurung Hardware')
  await page.goto('/#/bills/new/sale')
  await pickParty(page, 'bill-party', 'Gurung Hardware')
  await page.locator('#bill-no').fill('55')
  await addFreeLine(page, 'Switch box', '1000')
  await page.getByTestId('save-bill').click()
  await expect(page.locator('[data-status="unpaid"]')).toBeVisible()

  await page.getByTestId('bill-cancel').click()
  await page.getByTestId('void-reason').fill('Entered twice')
  await page.getByTestId('void-confirm').click()
  await expect(page.getByText('Entered twice').first()).toBeVisible()

  await page.getByRole('link', { name: 'Gurung Hardware' }).click()
  await expect(page.getByTestId('party-balance')).toContainText('Settled')

  await page.goto('/#/bills')
  await page.getByTestId('bill-row').filter({ hasText: '55' }).click()
  await page.getByRole('button', { name: 'Restore entry' }).click()
  await expect(page.locator('[data-status="unpaid"]')).toBeVisible()
  await page.getByText(/Change history/).click()
  await expect(page.getByText('Cancelled').first()).toBeVisible()
  await expect(page.getByText('Restored').first()).toBeVisible()
})

test('statement shows what the party owes for the chosen period', async ({ page }) => {
  await onboardEnglish(page)
  await addCustomer(page, 'Tamang Mobile')
  await page.goto('/#/bills/new/sale')
  await pickParty(page, 'bill-party', 'Tamang Mobile')
  await page.locator('#bill-no').fill('7')
  await addFreeLine(page, 'Extension board', '1000', '2')
  await page.getByTestId('save-bill').click()
  await page.getByRole('link', { name: 'Tamang Mobile' }).click()
  await page.getByTestId('party-statement').click()
  await expect(page.getByTestId('statement-due')).toHaveText('Rs 2,260.00')
  await expect(page.getByTestId('document')).toContainText('This is a payment statement, not a tax invoice.')
})
