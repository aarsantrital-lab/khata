import { Cloud, CloudOff, HardDrive, Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLocale } from '@/app/locale'
import { syncManager, type SyncStatus } from '@/lib/sync'
import { cn } from '@/lib/utils'

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(syncManager.status)
  useEffect(() => syncManager.subscribe(setStatus), [])
  return status
}

export function SyncIndicator() {
  const status = useSyncStatus()
  const { t, num } = useLocale()
  const map = {
    off: { icon: HardDrive, label: t('sync_off'), tone: 'text-muted-foreground' },
    idle: { icon: Cloud, label: t('sync_on'), tone: 'text-good' },
    syncing: { icon: Loader2, label: t('sync_syncing'), tone: 'text-primary' },
    offline: { icon: CloudOff, label: t('sync_offline'), tone: 'text-warn' },
    error: { icon: TriangleAlert, label: t('sync_error'), tone: 'text-bad' },
  } as const
  const { icon: Icon, label, tone } = map[status.state]
  return (
    <Link
      to="/settings#sync"
      title={status.pending ? `${label} · ${t('sync_pending', { n: num(status.pending) })}` : label}
      aria-label={label}
      className={cn('relative flex size-10 items-center justify-center rounded-xl hover:bg-muted', tone)}
    >
      <Icon className={cn('size-5', status.state === 'syncing' && 'animate-spin')} />
      {status.state !== 'off' && status.pending > 0 && (
        <span className="absolute top-1 right-1 size-2.5 rounded-full bg-warn ring-2 ring-background" />
      )}
    </Link>
  )
}
