// Renders the PWA PNG icons from public/favicon.svg. Run: node scripts/make-icons.mjs
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
// Maskable icons are cropped to a circle by Android, so draw the mark smaller on a full-bleed tile.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('translate(96 104) scale(13.33)', 'translate(136 142) scale(10)')

const targets = [
  { file: 'pwa-192.png', size: 192, src: svg },
  { file: 'pwa-512.png', size: 512, src: svg },
  { file: 'pwa-maskable-512.png', size: 512, src: maskable },
  { file: 'apple-touch-icon.png', size: 180, src: maskable },
]

const browser = await chromium.launch()
const page = await browser.newPage()
for (const { file, size, src } of targets) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  )
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: true })
  console.log('wrote', file)
}
await browser.close()
