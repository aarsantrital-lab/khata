const KEY = 'khata.pin'

interface StoredPin {
  salt: string
  hash: string
}

async function digest(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  // Plain-HTTP fallback (e.g. opening the dev server over the LAN): a simple FNV-1a hash.
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** The PIN is stored only on this device, as a salted hash. */
export function hasPin(): boolean {
  return Boolean(localStorage.getItem(KEY))
}

export async function setPin(pin: string) {
  const salt = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const stored: StoredPin = { salt, hash: await digest(`${salt}:${pin}`) }
  localStorage.setItem(KEY, JSON.stringify(stored))
}

export function clearPin() {
  localStorage.removeItem(KEY)
}

export async function checkPin(pin: string): Promise<boolean> {
  const raw = localStorage.getItem(KEY)
  if (!raw) return true
  const stored = JSON.parse(raw) as StoredPin
  return (await digest(`${stored.salt}:${pin}`)) === stored.hash
}
