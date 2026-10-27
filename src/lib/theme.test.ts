import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DARK_THEMES, resolveTheme, THEME_BAR_COLORS, THEME_CHOICES, THEME_STORAGE_KEY, type ThemeChoice } from './theme'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const bootScript = /<script id="theme-boot">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

/** Runs the index.html boot script against a tiny fake page and reports what it set. */
function runBoot(stored: string | null, prefersDark: boolean) {
  const attrs: Record<string, string> = {}
  const classes = new Set<string>()
  const meta = { content: '', setAttribute: (_: string, v: string) => (meta.content = v) }
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      classList: { add: (c: string) => classes.add(c) },
      style: { colorScheme: '' },
    },
    querySelector: () => meta,
  }
  const localStorage = { getItem: (k: string) => (k === THEME_STORAGE_KEY ? stored : null) }
  const window = { matchMedia: () => ({ matches: prefersDark }) }
  new Function('window', 'document', 'localStorage', bootScript)(window, document, localStorage)
  return { theme: attrs['data-theme'], dark: classes.has('dark'), bar: meta.content, scheme: document.documentElement.style.colorScheme }
}

describe('themes', () => {
  it('follows the system when set to automatic', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
    expect(resolveTheme('night', false)).toBe('night')
  })

  it('boot script in index.html picks the same theme as the app, before the app paints', () => {
    expect(bootScript).not.toBe('')
    for (const choice of THEME_CHOICES) {
      for (const prefersDark of [false, true]) {
        const resolved = resolveTheme(choice, prefersDark)
        const out = runBoot(choice, prefersDark)
        expect(out.theme, `${choice} / dark system: ${prefersDark}`).toBe(resolved)
        expect(out.dark).toBe(DARK_THEMES.has(resolved))
        expect(out.scheme).toBe(DARK_THEMES.has(resolved) ? 'dark' : 'light')
        expect(out.bar).toBe(THEME_BAR_COLORS[resolved])
      }
    }
  })

  it('falls back to automatic for a missing or unknown stored value', () => {
    expect(runBoot(null, true).theme).toBe('dark')
    expect(runBoot('neon' as ThemeChoice, false).theme).toBe('light')
  })
})
