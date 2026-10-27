import { useEffect, useState } from 'react'

export type ThemeChoice = 'auto' | 'light' | 'dark' | 'purple' | 'night' | 'marigold'
export type ResolvedTheme = Exclude<ThemeChoice, 'auto'>

export const THEME_CHOICES: ThemeChoice[] = ['auto', 'light', 'dark', 'purple', 'night', 'marigold']

/** Kept in sync with the boot script in index.html, which runs before the app paints. */
export const THEME_STORAGE_KEY = 'khata.theme'
export const DARK_THEMES: ReadonlySet<ResolvedTheme> = new Set(['dark', 'night'])

/** Browser toolbar colour on Android for each theme. */
export const THEME_BAR_COLORS: Record<ResolvedTheme, string> = {
  light: '#0f766e',
  dark: '#14201f',
  purple: '#6d28d9',
  night: '#0c1230',
  marigold: '#c2410c',
}

/** Small preview swatches for the picker: page background, card, and accent. */
export const THEME_SWATCHES: Record<ResolvedTheme, [string, string, string]> = {
  light: ['#f6fafa', '#ffffff', '#0f766e'],
  dark: ['#141c1d', '#1d2728', '#4fc4b4'],
  purple: ['#faf7fd', '#ffffff', '#6d28d9'],
  night: ['#0c1230', '#18204a', '#8ec5ff'],
  marigold: ['#fdf8ef', '#fffdf8', '#c2410c'],
}

const isChoice = (v: unknown): v is ThemeChoice => typeof v === 'string' && (THEME_CHOICES as string[]).includes(v)

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === 'auto') return prefersDark ? 'dark' : 'light'
  return choice
}

export function getThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    return isChoice(v) ? v : 'auto'
  } catch {
    return 'auto'
  }
}

const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

export function applyTheme(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolveTheme(choice, darkQuery()?.matches ?? false)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.classList.toggle('dark', DARK_THEMES.has(resolved))
  root.style.colorScheme = DARK_THEMES.has(resolved) ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BAR_COLORS[resolved])
  return resolved
}

const listeners = new Set<() => void>()

/** The theme belongs to the device (like the PIN), so it is not synced or backed up. */
export function setThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Private mode: the theme still applies until the app is closed.
  }
  applyTheme(choice)
  for (const fn of listeners) fn()
}

export function useTheme(): { choice: ThemeChoice; resolved: ResolvedTheme; setChoice: (c: ThemeChoice) => void } {
  const [choice, setChoiceState] = useState<ThemeChoice>(getThemeChoice)
  const [prefersDark, setPrefersDark] = useState(() => darkQuery()?.matches ?? false)

  useEffect(() => {
    const onChange = () => setChoiceState(getThemeChoice())
    listeners.add(onChange)
    const mq = darkQuery()
    const onSystem = (e: MediaQueryListEvent) => {
      setPrefersDark(e.matches)
      if (getThemeChoice() === 'auto') applyTheme('auto')
    }
    mq?.addEventListener('change', onSystem)
    return () => {
      listeners.delete(onChange)
      mq?.removeEventListener('change', onSystem)
    }
  }, [])

  return { choice, resolved: resolveTheme(choice, prefersDark), setChoice: setThemeChoice }
}
