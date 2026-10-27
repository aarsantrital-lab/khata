import { test as base, expect } from '@playwright/test'

/** Every test fails if the app throws or logs an error, even when the screen looks fine. */
export const test = base.extend<{ crashGuard: void }>({
  crashGuard: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return
        // Tests fake Supabase failures on purpose; the browser logs those responses itself.
        if (msg.text().startsWith('Failed to load resource') && msg.location().url.includes('.supabase.co/')) return
        errors.push(`console.error: ${msg.text()}`)
      })
      await use()
      expect(errors, 'browser errors during the test').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
