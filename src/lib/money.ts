/** All money in the app is an integer number of paisa (1 rupee = 100 paisa). */
export type Paisa = number

export type DigitStyle = 'ne' | 'en'

const NE_DIGITS = '०१२३४५६७८९'

export function toNepaliDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => NE_DIGITS[Number(d)])
}

export function toLatinDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(NE_DIGITS.indexOf(d)))
}

export function localizeDigits(s: string, digits: DigitStyle): string {
  return digits === 'ne' ? toNepaliDigits(s) : s
}

/** Groups an unsigned integer string the South Asian way: 1234567 -> 12,34,567 */
export function groupSouthAsian(intStr: string): string {
  if (intStr.length <= 3) return intStr
  const last3 = intStr.slice(-3)
  let rest = intStr.slice(0, -3)
  const parts: string[] = []
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2))
    rest = rest.slice(0, -2)
  }
  if (rest) parts.unshift(rest)
  return `${parts.join(',')},${last3}`
}

export interface FormatMoneyOptions {
  digits?: DigitStyle
  /** Prefix with रु / Rs */
  symbol?: boolean
  /** Always show two decimals (for printed documents). */
  decimals?: boolean
  /** Language of the currency sign (रु / Rs). Defaults to the digit style. */
  lang?: DigitStyle
}

export function formatPaisa(p: Paisa, opts: FormatMoneyOptions = {}): string {
  const { digits = 'en', symbol = true, decimals = false, lang = digits } = opts
  const neg = p < 0
  const abs = Math.abs(Math.trunc(p))
  const rupees = Math.floor(abs / 100)
  const paisa = abs % 100
  let s = groupSouthAsian(String(rupees))
  if (paisa !== 0 || decimals) s += `.${String(paisa).padStart(2, '0')}`
  s = localizeDigits(s, digits)
  const sym = symbol ? (lang === 'ne' ? 'रु ' : 'Rs ') : ''
  return `${neg ? '−' : ''}${sym}${s}`
}

export function formatNumber(n: number, digits: DigitStyle = 'en'): string {
  const neg = n < 0
  const [i, f] = String(Math.abs(n)).split('.')
  let s = groupSouthAsian(i)
  if (f) s += `.${f}`
  return `${neg ? '−' : ''}${localizeDigits(s, digits)}`
}

/**
 * Parses user text like "1,234.5" or "१२३४.५०" into paisa without floating point.
 * Returns null for empty or invalid input.
 */
export function parseRupees(input: string): Paisa | null {
  const s = toLatinDigits(input).replace(/[,\s]/g, '').replace(/^(rs\.?|रु\.?)/i, '')
  if (!s) return null
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s)
  if (!m) return null
  const [, neg, whole = '', frac = ''] = m
  if (!whole && !frac) return null
  const rupees = whole ? Number(whole) : 0
  const paisa = Number((frac + '00').slice(0, 2))
  const value = rupees * 100 + paisa
  if (!Number.isSafeInteger(value)) return null
  return neg ? -value : value
}

/** Paisa -> plain editable rupee string, e.g. 123450 -> "1234.5" */
export function paisaToInput(p: Paisa): string {
  const neg = p < 0
  const abs = Math.abs(p)
  const r = Math.floor(abs / 100)
  const f = abs % 100
  let s = String(r)
  if (f) s += `.${String(f).padStart(2, '0').replace(/0$/, '')}`
  return neg ? `-${s}` : s
}

/** Rounds half up to whole paisa: amount × basisPoints / 10000. */
export function percentOf(amount: Paisa, basisPoints: number): Paisa {
  const num = amount * basisPoints
  if (num >= 0) return Math.floor((num + 5000) / 10000)
  return -Math.floor((-num + 5000) / 10000)
}

export function sum(values: Iterable<number>): number {
  let total = 0
  for (const v of values) total += v
  return total
}
