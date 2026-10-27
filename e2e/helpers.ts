import { expect, type Page } from '@playwright/test'

/** Types an amount on the on-screen number pad the way Dad would, then taps Done. */
export async function numpad(page: Page, value: string) {
  const pad = page.getByRole('dialog')
  await expect(pad.getByTestId('numpad-display')).toBeVisible()
  for (const ch of value) await pad.getByRole('button', { name: ch, exact: true }).click()
  await pad.getByRole('button', { name: /^(Done|भयो)$/ }).click()
  await expect(pad).toBeHidden()
}

export async function onboardEnglish(page: Page, { shop = 'Laxmi Electronics', pan = '301234567', cash = '5000' } = {}) {
  await page.goto('/')
  await page.getByRole('radio', { name: 'English' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Shop name').fill(shop)
  await page.getByLabel('PAN').fill(pan)
  await page.getByTestId('opening-cash').click()
  await numpad(page, cash)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByTestId('quick-sale')).toBeVisible()
}

export async function loadSample(page: Page, language: 'English' | 'नेपाली' = 'English') {
  await page.goto('/')
  await page.getByRole('radio', { name: language }).click()
  await page.getByRole('button', { name: /Try with sample data|नमुना डाटासहित हेर्नुहोस्/ }).click()
  await expect(page.getByTestId('quick-sale')).toBeVisible({ timeout: 20_000 })
}

export async function addCustomer(page: Page, name: string, phone = '9841000000', pan = '302345678') {
  await page.goto('/#/parties?tab=customer')
  await page.getByTestId('add-party').click()
  await page.locator('#party-name').fill(name)
  await page.locator('#party-phone').fill(phone)
  await page.locator('#party-pan').fill(pan)
  await page.getByTestId('save-party').click()
  await expect(page.getByTestId('party-balance')).toBeVisible()
}

export async function pickParty(page: Page, pickerId: string, name: string) {
  await page.getByTestId(pickerId).click()
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(name) }).first().click()
  await expect(page.getByRole('dialog')).toBeHidden()
}

/** Adds a typed (unsaved) item line with a rate, on the bill form. */
export async function addFreeLine(page: Page, name: string, rate: string, qty?: string) {
  await page.getByTestId('add-line').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder(/Search brand, model or name/).fill(name)
  await dialog.getByRole('button', { name: new RegExp(`Type a new item: ${name}`) }).click()
  const line = page.getByTestId('bill-line').last()
  if (qty) {
    await line.getByRole('button', { name: 'Qty', exact: true }).click()
    await numpad(page, qty)
  }
  await line.getByRole('button', { name: `Rate — ${name}` }).click()
  await numpad(page, rate)
}

/** Clicks a link or button, scrolling past the sticky bottom bar on phones. */
export async function tap(page: Page, testId: string) {
  const el = page.getByTestId(testId)
  await el.scrollIntoViewIfNeeded()
  await el.click()
}

const HAND_BILL = `<body style="margin:0;background:#c9b98f;font:28px 'Comic Sans MS',cursive;color:#1d2a5a">
<div style="margin:50px 60px;padding:40px;background:#f3ead2;transform:rotate(-2deg)">
<div style="text-align:center;font-size:40px;font-weight:bold">Laxmi Electronics</div>
<div>Bill no. 1044 · Maharjan Light House</div><hr>
<div>1. Ceiling fan × 4 ........ 18,400</div><div>2. LED bulb 9W × 50 ...... 7,500</div>
<hr><div style="text-align:right"><b>Grand total 29,295</b></div></div></body>`

/** A phone-camera-like JPEG of a handwritten bill, drawn in the browser so the repo needs no image files. */
export async function handBillPhoto(page: Page) {
  const p = await page.context().newPage()
  await p.setViewportSize({ width: 800, height: 1100 })
  await p.setContent(HAND_BILL)
  const buffer = await p.screenshot({ type: 'jpeg', quality: 85 })
  await p.close()
  return { name: 'IMG_20241027_101500.jpg', mimeType: 'image/jpeg', buffer }
}
