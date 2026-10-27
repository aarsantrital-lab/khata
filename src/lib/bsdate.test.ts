import { describe, expect, it } from 'vitest'
import {
  addDays,
  adToBs,
  bsMonthDays,
  bsMonthRange,
  bsToAd,
  daysBetween,
  fiscalYearLabel,
  fiscalYearMonths,
  fiscalYearOf,
  fiscalYearRange,
  formatDate,
  isValidBs,
  shiftBsMonth,
} from './bsdate'

describe('BS ⇄ AD conversion', () => {
  const known: [string, { y: number; m: number; d: number }][] = [
    ['1943-04-14', { y: 2000, m: 1, d: 1 }],
    ['2022-04-14', { y: 2079, m: 1, d: 1 }],
    ['2023-04-14', { y: 2080, m: 1, d: 1 }],
    ['2023-07-17', { y: 2080, m: 4, d: 1 }],
    ['2024-04-13', { y: 2081, m: 1, d: 1 }],
    ['2024-07-16', { y: 2081, m: 4, d: 1 }],
    ['2025-04-14', { y: 2082, m: 1, d: 1 }],
  ]

  it.each(known)('%s AD is %o BS', (ad, bs) => {
    expect(adToBs(ad)).toEqual(bs)
    expect(bsToAd(bs)).toBe(ad)
  })

  it('round-trips every day for several years', () => {
    let iso = '2020-01-01'
    for (let i = 0; i < 365 * 8; i++) {
      expect(bsToAd(adToBs(iso))).toBe(iso)
      iso = addDays(iso, 1)
    }
  })

  it('consecutive AD days map to consecutive BS days', () => {
    let iso = '2025-04-01'
    let prev = adToBs(iso)
    for (let i = 0; i < 400; i++) {
      iso = addDays(iso, 1)
      const cur = adToBs(iso)
      if (cur.d === 1) {
        expect(prev.d).toBe(bsMonthDays(prev.y, prev.m))
        expect(shiftBsMonth(prev.y, prev.m, 1)).toEqual({ y: cur.y, m: cur.m })
      } else {
        expect(cur).toEqual({ ...prev, d: prev.d + 1 })
      }
      prev = cur
    }
  })

  it('validates BS dates against month lengths', () => {
    expect(isValidBs({ y: 2081, m: 1, d: 31 })).toBe(true)
    expect(isValidBs({ y: 2081, m: 1, d: 32 })).toBe(false)
    expect(isValidBs({ y: 2081, m: 13, d: 1 })).toBe(false)
    expect(isValidBs({ y: 1999, m: 1, d: 1 })).toBe(false)
  })
})

describe('months and fiscal years', () => {
  it('builds month ranges that cover the whole month', () => {
    const r = bsMonthRange(2081, 4)
    expect(r.from).toBe('2024-07-16')
    expect(daysBetween(r.from, r.to) + 1).toBe(bsMonthDays(2081, 4))
  })

  it('shifts across year boundaries', () => {
    expect(shiftBsMonth(2081, 12, 1)).toEqual({ y: 2082, m: 1 })
    expect(shiftBsMonth(2081, 1, -1)).toEqual({ y: 2080, m: 12 })
  })

  it('starts the fiscal year on 1 Shrawan', () => {
    expect(fiscalYearOf('2024-07-15')).toBe(2080) // 31 Asar 2081
    expect(fiscalYearOf('2024-07-16')).toBe(2081) // 1 Shrawan 2081
    const fy = fiscalYearRange(2081)
    expect(fy.from).toBe('2024-07-16')
    expect(adToBs(fy.to)).toEqual({ y: 2082, m: 3, d: bsMonthDays(2082, 3) })
    expect(fiscalYearLabel(2081)).toBe('2081/82')
    expect(fiscalYearLabel(2081, 'ne')).toBe('२०८१/८२')
    const months = fiscalYearMonths(2081)
    expect(months[0]).toEqual({ y: 2081, m: 4 })
    expect(months[11]).toEqual({ y: 2082, m: 3 })
  })
})

describe('formatting', () => {
  it('formats BS dates in Nepali and English', () => {
    expect(formatDate('2024-07-16', { calendar: 'bs', lang: 'ne', digits: 'ne' })).toBe('१ साउन २०८१')
    expect(formatDate('2024-07-16', { calendar: 'bs', lang: 'en', digits: 'en' })).toBe('1 Shrawan 2081')
    expect(formatDate('2024-07-16', { calendar: 'bs', lang: 'en', digits: 'en', style: 'short' })).toBe('2081/04/01')
  })

  it('formats AD dates when chosen', () => {
    expect(formatDate('2024-07-16', { calendar: 'ad', lang: 'en', digits: 'en' })).toBe('16 Jul 2024')
    expect(formatDate('2024-07-16', { calendar: 'ad', lang: 'ne', digits: 'ne' })).toBe('१६ जुलाई २०२४')
  })
})
