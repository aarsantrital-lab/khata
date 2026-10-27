import { isIos } from './install'

/** Converts a Nepali phone number into international form for WhatsApp links. */
export function intlPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('977')) return d
  if (d.length === 10 && d.startsWith('9')) return `977${d}`
  if (d.startsWith('0')) return `977${d.slice(1)}`
  return d
}

export function whatsappLink(phone: string, text: string) {
  const p = intlPhone(phone)
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`
}

export function viberLink(text: string) {
  return `viber://forward?text=${encodeURIComponent(text)}`
}

export function smsLink(phone: string, text: string) {
  return `sms:${phone.replace(/[^\d+]/g, '')}?body=${encodeURIComponent(text)}`
}

/** Copies text, falling back to the old copy command where the clipboard API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denied or insecure page: try the fallback below.
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  return ok
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Saves a file. On iPhone and iPad the share sheet comes first: it has "Save to Files", and a
 * Home Screen app cannot always download. If the share sheet cannot open, it downloads instead.
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  if (isIos() && (await shareFile(blob, filename))) return
  downloadBlob(blob, filename)
}

/** Opens the phone's share sheet with a file when supported. Returns false if not supported. */
export async function shareFile(blob: Blob, filename: string, text?: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title: filename })
      return true
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return true
    }
  }
  return false
}
