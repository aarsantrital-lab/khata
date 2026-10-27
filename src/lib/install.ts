interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const subs = new Set<() => void>()
const notify = () => subs.forEach((fn) => fn())

/** Call once at startup: browsers fire the install event early and only once. */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export const canInstall = () => deferred !== null

/** iPhone and iPad (iPadOS reports itself as a Mac with touch). */
export const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

/** Safari has no install prompt; the app must be added from the Share menu. */
export const needsIosInstallHint = () => isIos() && !isStandalone()

export function onInstallChange(fn: () => void) {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  notify()
  return outcome === 'accepted'
}
