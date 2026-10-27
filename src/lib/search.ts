import { toLatinDigits } from './money'

/** Lower-case text with Nepali digits turned into Latin ones, so १२३ and 123 compare equal. */
export function foldText(s: string): string {
  return toLatinDigits(s).toLowerCase()
}

export function digitsOnly(s: string): string {
  return toLatinDigits(s).replace(/\D+/g, '')
}

/** The last ten digits of a Nepali phone number, so +977-984… and 984… compare equal. */
export function phoneKey(s: string): string {
  const d = digitsOnly(s)
  if (d.startsWith('977') && d.length > 10) return d.slice(3)
  return d.length > 10 ? d.slice(-10) : d
}

const NUMBERISH = /^[\d\s\-+().]+$/

/**
 * True when any field contains the query. Nepali digits match Latin digits, and a number
 * typed with or without spaces, dashes or +977 still finds the phone or PAN.
 */
export function matches(q: string, ...fields: (string | undefined)[]): boolean {
  const query = foldText(q.trim())
  if (!query) return true
  const queryDigits = NUMBERISH.test(query) ? phoneKey(query) : ''
  return fields.some((f) => {
    if (!f) return false
    if (foldText(f).includes(query)) return true
    return queryDigits.length >= 3 && digitsOnly(f).includes(queryDigits)
  })
}
