import { isMessageKey, type MessageKey } from '@/lib/i18n'

export function errorMessage(err: unknown, t: (k: MessageKey) => string): string {
  const code = err instanceof Error ? err.message : String(err)
  const key = `err_${code}`
  return isMessageKey(key) ? t(key) : t('err_generic')
}
