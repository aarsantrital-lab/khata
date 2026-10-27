import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLocale } from '@/app/locale'
import type { BillStatus } from '@/lib/ledger'
import type { Trend } from '@/lib/ledger'

export function Amount({ value, className, decimals }: { value: number; className?: string; decimals?: boolean }) {
  const { money } = useLocale()
  return <span className={cn('tabular whitespace-nowrap', className)}>{money(value, { decimals })}</span>
}

/** Party balance: green when they owe the shop, red when the shop owes them. */
export function Balance({ value, className, showLabel = true }: { value: number; className?: string; showLabel?: boolean }) {
  const { money, t } = useLocale()
  const tone = value > 0 ? 'text-good' : value < 0 ? 'text-bad' : 'text-muted-foreground'
  return (
    <span className={cn('flex flex-col items-end leading-tight', className)}>
      <span className={cn('tabular text-lg font-semibold whitespace-nowrap', tone)}>{money(Math.abs(value))}</span>
      {showLabel && (
        <span className={cn('text-sm', tone)}>{value > 0 ? t('they_owe') : value < 0 ? t('you_owe') : t('settled_up')}</span>
      )}
    </span>
  )
}

export function TrendArrow({
  trend,
  label,
  className,
  format = 'money',
}: {
  trend: Trend
  label: string
  className?: string
  format?: 'money' | 'number'
}) {
  const { money, num, t } = useLocale()
  const Icon = trend.direction === 'up' ? ArrowUp : trend.direction === 'down' ? ArrowDown : Minus
  const tone = trend.good === null ? 'text-muted-foreground bg-muted' : trend.good ? 'text-good bg-good/10' : 'text-bad bg-bad/10'
  const amount = format === 'money' ? money(Math.abs(trend.delta)) : num(Math.abs(trend.delta))
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm', className)} data-trend={trend.direction} data-good={String(trend.good)}>
      <span className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold whitespace-nowrap', tone)}>
        <Icon className="size-4" strokeWidth={3} aria-hidden />
        {trend.direction !== 'flat' && <span className="tabular">{amount}</span>}
      </span>
      <span className="text-muted-foreground">{trend.direction === 'flat' ? t('no_change') : label}</span>
    </span>
  )
}

export function StatusBadge({ status, cancelled, className }: { status?: BillStatus; cancelled?: boolean; className?: string }) {
  const { t } = useLocale()
  if (cancelled)
    return <span className={cn('rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold text-muted-foreground', className)}>{t('cancelled')}</span>
  if (!status) return null
  const styles: Record<BillStatus, string> = {
    paid: 'bg-good/12 text-good',
    partial: 'bg-warn/15 text-warn-strong',
    unpaid: 'bg-bad/10 text-bad',
  }
  const key = status === 'paid' ? 'status_paid' : status === 'partial' ? 'status_partial' : 'status_unpaid'
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap', styles[status], className)} data-status={status}>
      {t(key)}
    </span>
  )
}
