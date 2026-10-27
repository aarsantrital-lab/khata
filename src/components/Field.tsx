import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
  optional?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-base font-medium text-foreground/85">
        {label}
        {optional && <span className="ml-1.5 text-sm font-normal text-muted-foreground">({optional})</span>}
      </label>
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

/** Large toggle buttons — easier than dropdowns on a phone. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  name,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentOption<T>[]
  className?: string
  name?: string
  size?: 'md' | 'lg'
}) {
  return (
    <div role="radiogroup" aria-label={name} className={cn('grid gap-1.5 rounded-xl bg-muted p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-5 [&_svg]:shrink-0',
              size === 'lg' ? 'min-h-14 text-lg' : 'min-h-11 text-base',
              active ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/10' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon}
            <span className="min-w-0 text-center leading-tight text-balance">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function EmptyState({ icon, title, action }: { icon?: ReactNode; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-10">{icon}</div>}
      <p className="max-w-xs text-base text-muted-foreground">{title}</p>
      {action}
    </div>
  )
}
