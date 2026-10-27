import { expect, test } from './fixtures'
import { handBillPhoto, loadSample, numpad, pickParty, tap } from './helpers'

test('the chosen theme survives a reload', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/settings')
  await page.getByTestId('theme-night').click()
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-theme', 'night')
  await expect(html).toHaveClass(/dark/)
  await page.reload()
  await expect(page.getByTestId('theme-night')).toHaveAttribute('aria-checked', 'true')
  await expect(html).toHaveAttribute('data-theme', 'night')

  await page.getByTestId('theme-light').click()
  await expect(html).not.toHaveClass(/dark/)
})

test('the phone menu slides out with every page', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'laptop', 'The laptop always shows the sidebar')
  await loadSample(page)
  await page.getByTestId('menu-button').click()
  const drawer = page.getByTestId('nav-drawer')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByTestId('nav-photos')).toBeVisible()
  await drawer.getByTestId('nav-lookup').click()
  await expect(drawer).toBeHidden()
  await expect(page).toHaveURL(/#\/lookup/)
})

test('quick-add a wallet and a bank, then see each balance on the dashboard', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/money')
  await tap(page, 'quick-add-accounts')
  // The sample shop already has eSewa and NIC Asia, so those cannot be added twice.
  await expect(page.getByTestId('quick-account').filter({ hasText: 'eSewa' })).toBeDisabled()
  await page.getByTestId('quick-account').filter({ hasText: 'Khalti' }).click()
  await page.getByTestId('quick-account').filter({ hasText: 'Nabil Bank' }).click()
  await page.getByRole('button', { name: 'Opening balance — Khalti' }).click()
  await numpad(page, '1200')
  await page.getByTestId('save-quick-accounts').click()
  await expect(page.getByTestId('account-row').filter({ hasText: 'Khalti' })).toBeVisible()
  await expect(page.getByTestId('account-row').filter({ hasText: 'Nabil Bank' })).toBeVisible()

  await page.goto('/#/')
  await expect(page.getByTestId('account-chip').filter({ hasText: 'Khalti' })).toContainText('Rs 1,200')
})

test('find a party by PAN or phone typed in Nepali digits', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/lookup')
  await page.getByTestId('lookup-input').fill('३०४५६७')
  const first = page.getByTestId('lookup-result').first()
  await expect(first).toContainText('Maharjan Light House')
  await expect(first.getByTestId('lookup-pan')).toHaveText('304567890')
  await expect(first.getByTestId('lookup-last-bill')).toBeVisible()

  await page.getByTestId('lookup-input').fill('९८०३३')
  await expect(page.getByTestId('lookup-result').first()).toContainText('Maharjan Light House')
  await expect(page.getByTestId('lookup-phone').first()).toHaveText('9803344556')
})

test('warns about a PAN already used and can put a new PAN on old bills', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/parties/new?type=customer')
  await page.locator('#party-name').fill('New Maharjan')
  await page.locator('#party-pan').fill('३०४५६७८९०')
  await expect(page.getByTestId('dup-pan')).toContainText('Maharjan Light House')

  await page.goto('/#/parties?tab=customer')
  await page.getByTestId('party-row').filter({ hasText: 'Shrestha Electric Store' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.locator('#party-pan').fill('302345699')
  await page.getByTestId('pan-old-bills').click()
  await tap(page, 'save-party')
  await expect(page.getByTestId('party-balance')).toBeVisible()
  await page.getByTestId('party-bill-row').first().click()
  await expect(page.getByText('PAN 302345699')).toBeVisible()
})

test('photograph a bill now, enter it later beside the photo', async ({ page }, testInfo) => {
  await loadSample(page)
  await page.goto('/#/photos')
  await expect(page.getByText('No photos waiting')).toBeVisible()
  await page.getByTestId('photo-input-camera').setInputFiles(await handBillPhoto(page))

  const details = page.getByTestId('photo-details')
  await expect(details).toBeVisible()
  await expect(details).toContainText('KB')
  await details.getByTestId('photo-party').click()
  const customers = page.getByRole('dialog', { name: 'Customers' })
  await customers.getByRole('button', { name: /Maharjan Light House/ }).click()
  await expect(customers).toBeHidden()
  await details.getByTestId('photo-note').fill('Bill book 1044')
  await details.getByTestId('save-photo').click()
  await expect(details).toBeHidden()

  const card = page.getByTestId('photos-pending').getByTestId('photo-card')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Maharjan Light House')
  await page.goto('/#/')
  await expect(page.getByTestId('photos-pending')).toContainText('1 bill photo to enter')
  await page.getByTestId('photos-pending').click()

  await page.getByTestId('photo-card').click()
  await expect(page.getByTestId('photo-image').locator('img')).toHaveAttribute('data-state', 'ready')
  await tap(page, 'enter-bill')
  await expect(page.getByTestId('bill-photo-aside')).toBeVisible()
  await expect(page.getByTestId('bill-party')).toContainText('Maharjan Light House')
  await page.locator('#bill-no').fill('1044')
  await page.getByTestId('add-line').click()
  await page.getByRole('dialog').getByRole('button', { name: /Havells Ceiling Fan/ }).click()
  if (!testInfo.project.name.includes('laptop')) {
    // Scrolled past the photo, the action bar offers it again.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(page.getByTestId('photo-fab')).toHaveCount(0)
    await page.getByTestId('bill-total').scrollIntoViewIfNeeded()
    await page.getByTestId('photo-fab').click()
    await expect(page.getByTestId('photo-viewer')).toBeVisible()
    await page.getByTestId('photo-viewer').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('photo-viewer')).toBeHidden()
  }
  await tap(page, 'save-bill')

  await expect(page.getByTestId('bill-photos').getByTestId('photo-card')).toHaveCount(1)
  // Correcting the bill later shows its photo again.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByTestId('bill-photo-aside')).toBeVisible()
  await page.goBack()
  await page.getByTestId('bill-photos').getByTestId('photo-card').click()
  await expect(page.getByTestId('photo-status')).toHaveText('Entered')
  await expect(page.getByTestId('photo-bill-link')).toContainText('1044')

  await page.goto('/#/photos?tab=done')
  await expect(page.getByTestId('photos-done').getByTestId('photo-card')).toHaveCount(1)
  await page.goto('/#/')
  await expect(page.getByTestId('photos-pending')).toHaveCount(0)
})

test('remove a photo and bring it back', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/photos')
  await page.getByTestId('photo-input-file').setInputFiles(await handBillPhoto(page))
  await page.getByTestId('photo-details').getByTestId('save-photo').click()
  await page.getByTestId('photo-card').click()
  await tap(page, 'remove-photo')
  await page.getByTestId('void-reason').fill('Blurry, took another')
  await page.getByTestId('void-confirm').click()
  await expect(page.getByText('Blurry, took another').first()).toBeVisible()
  await page.getByTestId('restore-photo').click()
  await expect(page.getByTestId('enter-bill')).toBeVisible()
})

test('attach a photo to a party', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/parties?tab=supplier')
  await page.getByTestId('party-row').filter({ hasText: 'Everest Electricals' }).click()
  await page.getByRole('radio', { name: /Photos/ }).click()
  await page.getByTestId('party-photos').getByTestId('photo-input-file').setInputFiles(await handBillPhoto(page))
  const details = page.getByTestId('photo-details')
  await expect(details).toContainText('Everest Electricals Trading')
  await details.getByRole('radio', { name: 'Other paper' }).click()
  await details.getByTestId('save-photo').click()
  await expect(page.getByTestId('party-photos').getByTestId('photo-card')).toHaveCount(1)
  await expect(page.getByRole('radio', { name: /Photos \(1\)/ })).toBeVisible()

  // A cheque or letter has no bill to type in, so it is filed straight away.
  await page.getByTestId('party-photos').getByTestId('photo-card').click()
  await expect(page.getByTestId('photo-status')).toHaveText('Kept')
  await expect(page.getByTestId('enter-bill')).toHaveCount(0)
  await page.goto('/#/')
  await expect(page.getByTestId('photos-pending')).toHaveCount(0)
})

test('repeat a bill, and repeat the last bill for a party', async ({ page }) => {
  await loadSample(page)
  await page.goto('/#/bills/new/sale')
  await pickParty(page, 'bill-party', 'Maharjan Light House')
  await page.getByTestId('add-line').click()
  await page.getByRole('dialog').getByRole('button', { name: /Philips LED Bulb/ }).click()
  await page.getByTestId('bill-line').last().getByRole('button', { name: 'Qty', exact: true }).click()
  await numpad(page, '20')
  const total = await page.getByTestId('bill-total').innerText()
  await tap(page, 'save-bill')
  await expect(page.getByTestId('bill-repeat')).toBeVisible()

  await tap(page, 'bill-repeat')
  await expect(page.getByTestId('repeated-from')).toBeVisible()
  await expect(page.getByTestId('bill-party')).toContainText('Maharjan Light House')
  await expect(page.getByTestId('bill-line')).toHaveCount(1)
  await expect(page.getByTestId('bill-total')).toHaveText(total)
  await tap(page, 'save-bill')
  await expect(page.getByTestId('bill-repeat')).toBeVisible()

  await page.goto('/#/bills/new/sale')
  await pickParty(page, 'bill-party', 'Maharjan Light House')
  await expect(page.getByTestId('repeat-last-bill')).toContainText(total)
  await page.getByTestId('repeat-last-bill').click()
  await expect(page.getByTestId('bill-line')).toHaveCount(1)
  await expect(page.getByTestId('repeat-last-bill')).toHaveCount(0)
  await expect(page.getByTestId('bill-total')).toHaveText(total)
})

test('starting sync checks the Supabase project first', async ({ page }) => {
  await loadSample(page)
  let schemaRun = false
  const calls: Record<string, string>[] = []
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
  }
  await page.route('https://demo-shop.supabase.co/rest/v1/rpc/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    calls.push(route.request().headers())
    if (!schemaRun) {
      const body = { code: 'PGRST202', message: 'Could not find the function public.khata_pull(p_limit, p_shop, p_since) in the schema cache' }
      return route.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: JSON.stringify(body) })
    }
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' })
  })
  await page.goto('/#/settings')
  await page.locator('#sync-url').fill('https://demo-shop.supabase.co')

  await page.locator('#sync-key').fill('sb_secret_abc123')
  await page.getByTestId('sync-start').click()
  await expect(page.getByText('That is the secret key')).toBeVisible()
  expect(calls).toHaveLength(0)

  await page.locator('#sync-key').fill('sb_publishable_abc123')
  await page.getByTestId('sync-start').click()
  await expect(page.getByText('does not have Khata’s functions yet')).toBeVisible()
  expect(calls[0].apikey).toBe('sb_publishable_abc123')
  expect(calls[0].authorization).toBeUndefined()

  schemaRun = true
  await page.getByTestId('sync-start').click()
  await expect(page.getByText('Sync is on. Use this code on your other device.')).toBeVisible()
})
