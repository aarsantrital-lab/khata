import { useCallback, useMemo } from 'react'
import { formatDate, type FormatDateOptions, type ISODate } from '@/lib/bsdate'
import { isMessageKey, translate, type MessageKey } from '@/lib/i18n'
import { formatNumber, formatPaisa, localizeDigits, type FormatMoneyOptions } from '@/lib/money'
import { useData } from './data'

export function useLocale() {
  const { settings } = useData()
  const { language: lang, digits, calendar } = settings

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  )
  const money = useCallback((p: number, opts: FormatMoneyOptions = {}) => formatPaisa(p, { digits, lang, ...opts }), [digits, lang])
  const num = useCallback((n: number) => formatNumber(n, digits), [digits])
  const digitsOf = useCallback((s: string) => localizeDigits(s, digits), [digits])
  const date = useCallback(
    (iso: ISODate, style: FormatDateOptions['style'] = 'long') => formatDate(iso, { calendar, lang, digits, style }),
    [calendar, lang, digits],
  )
  const category = useCallback(
    (key: string) => {
      const k = `cat_${key}`
      return isMessageKey(k) ? translate(lang, k) : key
    },
    [lang],
  )
  const time = useCallback(
    (ms: number) =>
      localizeDigits(new Date(ms).toLocaleTimeString(lang === 'ne' ? 'en-GB' : 'en-US', { hour: 'numeric', minute: '2-digit' }), digits),
    [lang, digits],
  )

  return useMemo(
    () => ({ t, lang, digits, calendar, money, num, date, digitsOf, category, time }),
    [t, lang, digits, calendar, money, num, date, digitsOf, category, time],
  )
}

export type Locale = ReturnType<typeof useLocale>
