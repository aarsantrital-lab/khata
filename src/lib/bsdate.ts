import NepaliDate, { dateConfigMap } from 'nepali-date-converter'
import { localizeDigits, type DigitStyle } from './money'

/** Dates are stored as AD ISO strings (YYYY-MM-DD) and shown in BS or AD. */
export type ISODate = string
export type Calendar = 'bs' | 'ad'
export type Lang = 'ne' | 'en'

export interface BSDate {
  y: number
  /** 1 = Baisakh … 12 = Chaitra */
  m: number
  d: number
}

const CONFIG_KEYS = [
  'Baisakh',
  'Jestha',
  'Asar',
  'Shrawan',
  'Bhadra',
  'Aswin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
] as const

export const BS_MONTHS: Record<Lang, string[]> = {
  ne: ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत'],
  en: ['Baisakh', 'Jestha', 'Asar', 'Shrawan', 'Bhadra', 'Asoj', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'],
}

export const AD_MONTHS: Record<Lang, string[]> = {
  ne: ['जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन', 'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

export const WEEKDAYS: Record<Lang, string[]> = {
  ne: ['आइत', 'सोम', 'मंगल', 'बुध', 'बिही', 'शुक्र', 'शनि'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}

export const BS_MIN_YEAR = 2000
export const BS_MAX_YEAR = 2090

const pad = (n: number) => String(n).padStart(2, '0')

export function isoFromParts(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`
}

export function isoFromDate(date: Date): ISODate {
  return isoFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function dateFromIso(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayIso(): ISODate {
  return isoFromDate(new Date())
}

export function addDays(iso: ISODate, n: number): ISODate {
  const dt = dateFromIso(iso)
  dt.setDate(dt.getDate() + n)
  return isoFromDate(dt)
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = dateFromIso(from)
  const b = dateFromIso(to)
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000)
}

export function adToBs(iso: ISODate): BSDate {
  const nd = new NepaliDate(dateFromIso(iso))
  return { y: nd.getYear(), m: nd.getMonth() + 1, d: nd.getDate() }
}

export function bsToAd(bs: BSDate): ISODate {
  const nd = new NepaliDate(bs.y, bs.m - 1, bs.d)
  return isoFromDate(nd.toJsDate())
}

export function bsMonthDays(y: number, m: number): number {
  const row = dateConfigMap[String(y)]
  if (!row) throw new Error(`BS year ${y} is outside the supported range`)
  return row[CONFIG_KEYS[m - 1]]
}

export function bsWeekday(bs: BSDate): number {
  return dateFromIso(bsToAd(bs)).getDay()
}

export function isValidBs(bs: BSDate): boolean {
  if (bs.y < BS_MIN_YEAR || bs.y > BS_MAX_YEAR || bs.m < 1 || bs.m > 12 || bs.d < 1) return false
  return bs.d <= bsMonthDays(bs.y, bs.m)
}

export function shiftBsMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 }
}

export interface DateRange {
  from: ISODate
  to: ISODate
}

export function bsMonthRange(y: number, m: number): DateRange {
  return { from: bsToAd({ y, m, d: 1 }), to: bsToAd({ y, m, d: bsMonthDays(y, m) }) }
}

/** Nepali fiscal year runs from 1 Shrawan to the last day of Asar. Returns the starting BS year. */
export function fiscalYearOf(iso: ISODate): number {
  const bs = adToBs(iso)
  return bs.m >= 4 ? bs.y : bs.y - 1
}

export function fiscalYearRange(fy: number): DateRange {
  return { from: bsToAd({ y: fy, m: 4, d: 1 }), to: bsToAd({ y: fy + 1, m: 3, d: bsMonthDays(fy + 1, 3) }) }
}

export function fiscalYearLabel(fy: number, digits: DigitStyle = 'en'): string {
  return localizeDigits(`${fy}/${String((fy + 1) % 100).padStart(2, '0')}`, digits)
}

/** BS months (y, m) of a fiscal year in order: Shrawan … Asar */
export function fiscalYearMonths(fy: number): { y: number; m: number }[] {
  return Array.from({ length: 12 }, (_, i) => shiftBsMonth(fy, 4, i))
}

export function monthKey(y: number, m: number): string {
  return `${y}-${pad(m)}`
}

export interface FormatDateOptions {
  calendar: Calendar
  lang: Lang
  digits: DigitStyle
  style?: 'long' | 'short' | 'month'
}

export function formatDate(iso: ISODate, { calendar, lang, digits, style = 'long' }: FormatDateOptions): string {
  if (!iso) return ''
  let out: string
  if (calendar === 'bs') {
    try {
      const bs = adToBs(iso)
      if (style === 'short') out = `${bs.y}/${pad(bs.m)}/${pad(bs.d)}`
      else if (style === 'month') out = `${BS_MONTHS[lang][bs.m - 1]} ${bs.y}`
      else out = `${bs.d} ${BS_MONTHS[lang][bs.m - 1]} ${bs.y}`
      return localizeDigits(out, digits)
    } catch {
      // Outside the BS table: fall back to AD so the date is still readable.
    }
  }
  const [y, m, d] = iso.split('-').map(Number)
  if (style === 'short') out = `${y}-${pad(m)}-${pad(d)}`
  else if (style === 'month') out = `${AD_MONTHS[lang][m - 1]} ${y}`
  else out = `${d} ${AD_MONTHS[lang][m - 1]} ${y}`
  return localizeDigits(out, digits)
}

export function formatBsMonth(y: number, m: number, lang: Lang, digits: DigitStyle): string {
  return localizeDigits(`${BS_MONTHS[lang][m - 1]} ${y}`, digits)
}
