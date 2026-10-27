import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLocale } from '@/app/locale'
import {
  AD_MONTHS,
  adToBs,
  bsMonthDays,
  bsToAd,
  bsWeekday,
  dateFromIso,
  formatDate,
  isoFromParts,
  shiftBsMonth,
  todayIso,
  WEEKDAYS,
  BS_MONTHS,
  type ISODate,
} from '@/lib/bsdate'
import { localizeDigits } from '@/lib/money'
import { cn } from '@/lib/utils'

interface Cell {
  iso: ISODate
  day: number
}

function monthCells(calendar: 'bs' | 'ad', y: number, m: number): { lead: number; cells: Cell[] } {
  if (calendar === 'bs') {
    const days = bsMonthDays(y, m)
    const lead = bsWeekday({ y, m, d: 1 })
    return { lead, cells: Array.from({ length: days }, (_, i) => ({ iso: bsToAd({ y, m, d: i + 1 }), day: i + 1 })) }
  }
  const days = new Date(y, m, 0).getDate()
  const lead = new Date(y, m - 1, 1).getDay()
  return { lead, cells: Array.from({ length: days }, (_, i) => ({ iso: isoFromParts(y, m, i + 1), day: i + 1 })) }
}

export function DateField({
  value,
  onChange,
  label,
  id,
  className,
}: {
  value: ISODate
  onChange: (iso: ISODate) => void
  label: string
  id?: string
  className?: string
}) {
  const { t, lang, digits, calendar, date } = useLocale()
  const [open, setOpen] = useState(false)
  const start = useMemo(() => {
    if (calendar === 'bs') {
      const bs = adToBs(value || todayIso())
      return { y: bs.y, m: bs.m }
    }
    const d = dateFromIso(value || todayIso())
    return { y: d.getFullYear(), m: d.getMonth() + 1 }
  }, [value, calendar])
  const [view, setView] = useState(start)

  const shift = (delta: number) =>
    setView((v) => (calendar === 'bs' ? shiftBsMonth(v.y, v.m, delta) : { y: v.y + Math.floor((v.m - 1 + delta) / 12), m: ((((v.m - 1 + delta) % 12) + 12) % 12) + 1 }))

  let grid: { lead: number; cells: Cell[] } = { lead: 0, cells: [] }
  try {
    grid = monthCells(calendar, view.y, view.m)
  } catch {
    // Month outside the supported BS range; leave the grid empty.
  }
  const title =
    calendar === 'bs'
      ? localizeDigits(`${BS_MONTHS[lang][view.m - 1]} ${view.y}`, digits)
      : localizeDigits(`${AD_MONTHS[lang][view.m - 1]} ${view.y}`, digits)
  const today = todayIso()
  const other = calendar === 'bs' ? 'ad' : 'bs'

  return (
    <>
      <button
        type="button"
        id={id}
        data-testid={id}
        aria-label={label}
        onClick={() => {
          setView(start)
          setOpen(true)
        }}
        className={cn(
          'flex h-12 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-left text-lg hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          className,
        )}
      >
        <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{date(value)}</span>
        {value === today && <span className="text-sm text-muted-foreground">{t('today')}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-4 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon-touch" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <div className="text-xl font-semibold">{title}</div>
            <Button variant="ghost" size="icon-touch" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight />
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm text-muted-foreground">
            {WEEKDAYS[lang].map((w, i) => (
              <div key={w} className={cn(i === 6 && 'text-bad')}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: grid.lead }, (_, i) => (
              <div key={`lead${i}`} />
            ))}
            {grid.cells.map((c) => (
              <button
                key={c.iso}
                type="button"
                onClick={() => {
                  onChange(c.iso)
                  setOpen(false)
                }}
                className={cn(
                  'tabular flex aspect-square items-center justify-center rounded-lg text-lg hover:bg-accent',
                  c.iso === value && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                  c.iso === today && c.iso !== value && 'ring-2 ring-primary/50',
                )}
              >
                {localizeDigits(String(c.day), digits)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{formatDate(value, { calendar: other, lang, digits })}</span>
            <Button
              variant="secondary"
              onClick={() => {
                onChange(today)
                setOpen(false)
              }}
            >
              {t('today')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
