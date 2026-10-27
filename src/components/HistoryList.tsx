import { useLiveQuery } from 'dexie-react-hooks'
import { History } from 'lucide-react'
import { useLocale } from '@/app/locale'
import { db } from '@/lib/db'
import { isMessageKey } from '@/lib/i18n'
import type { HistoryAction } from '@/lib/types'

const ACTION_KEY: Record<HistoryAction, 'created' | 'updated' | 'voided' | 'restored'> = {
  create: 'created',
  update: 'updated',
  void: 'voided',
  restore: 'restored',
}

/** Shows what changed on a record, newest first, with the fields that differ. */
export function HistoryList({ entityId, fields }: { entityId: string; fields?: Record<string, (v: unknown) => string> }) {
  const { t, digitsOf, lang } = useLocale()
  const rows = useLiveQuery(() => db.history.where('entityId').equals(entityId).toArray(), [entityId])
  if (!rows?.length) return null
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt)
  return (
    <details className="rounded-2xl border bg-card p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-lg font-semibold">
        <History className="size-5" />
        {t('changes')} ({digitsOf(String(rows.length))})
      </summary>
      <ol className="mt-3 flex flex-col gap-3">
        {sorted.map((h) => {
          const before = (h.before ?? {}) as Record<string, unknown>
          const after = (h.after ?? {}) as Record<string, unknown>
          const changed =
            h.action === 'update' && fields
              ? Object.entries(fields).filter(([k, fmt]) => fmt(before[k]) !== fmt(after[k]))
              : []
          return (
            <li key={h.id} className="border-l-2 border-primary/40 pl-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{t(ACTION_KEY[h.action])}</span>
                <span className="text-sm text-muted-foreground">
                  {digitsOf(new Date(h.createdAt).toLocaleString(lang === 'ne' ? 'en-GB' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }))}
                </span>
              </div>
              {h.note && <div className="text-sm">{isMessageKey(h.note) ? t(h.note) : h.note}</div>}
              {changed.map(([k, fmt]) => (
                <div key={k} className="text-sm text-muted-foreground">
                  <span className="line-through">{fmt(before[k]) || '—'}</span> → <span className="text-foreground">{fmt(after[k]) || '—'}</span>
                </div>
              ))}
            </li>
          )
        })}
      </ol>
    </details>
  )
}
