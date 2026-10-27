import { Delete } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLocale } from '@/app/locale'
import { localizeDigits, paisaToInput, parseRupees } from '@/lib/money'
import { cn } from '@/lib/utils'

type Mode = 'money' | 'qty'

interface NumPadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initial: string
  mode: Mode
  signed?: boolean
  onDone: (text: string) => void
}

function NumPadDialog({ open, onOpenChange, title, initial, mode, signed, onDone }: NumPadDialogProps) {
  const { t, digits, lang } = useLocale()
  const [text, setText] = useState(initial)
  const [fresh, setFresh] = useState(true)

  useEffect(() => {
    if (open) {
      setText(initial)
      setFresh(true)
    }
  }, [open, initial])

  const press = useCallback(
    (key: string) => {
      setText((cur) => {
        const base = fresh ? '' : cur
        if (key === 'back') return fresh ? '' : cur.slice(0, -1)
        if (key === 'clear') return ''
        if (key === '-') return cur.startsWith('-') ? cur.slice(1) : `-${cur}`
        if (key === '.') {
          if (mode === 'qty' || base.includes('.')) return base
          return `${base || '0'}.`
        }
        const next = base + key
        const [, frac] = next.split('.')
        if (frac && frac.length > 2) return base
        if (next.replace(/[^0-9]/g, '').length > 12) return base
        return next.replace(/^(-?)0+(?=\d)/, '$1')
      })
      setFresh(false)
    },
    [fresh, mode],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === '.' || e.key === ',') press('.')
      else if (e.key === 'Backspace') press('back')
      else if (e.key === 'Delete') press('clear')
      else if (e.key === '-' && signed) press('-')
      else if (e.key === 'Enter') {
        e.preventDefault()
        onDone(text)
        onOpenChange(false)
        return
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, press, text, onDone, onOpenChange, signed])

  const display = (() => {
    if (!text) return localizeDigits('0', digits)
    if (mode === 'qty') return localizeDigits(text, digits)
    const [w, f] = text.replace('-', '').split('.')
    const grouped = w ? Number(w).toLocaleString('en-IN') : '0'
    return `${text.startsWith('-') ? '−' : ''}${localizeDigits(grouped + (f !== undefined ? `.${f}` : ''), digits)}`
  })()

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', mode === 'money' ? '.' : signed ? '-' : '00', '0', 'back']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-4 sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-medium text-muted-foreground">{title}</DialogTitle>
        </DialogHeader>
        <div
          className="tabular rounded-xl bg-muted px-4 py-3 text-right text-4xl font-semibold tracking-tight"
          data-testid="numpad-display"
          aria-live="polite"
        >
          {mode === 'money' && <span className="mr-2 text-2xl text-muted-foreground">{lang === 'ne' ? 'रु' : 'Rs'}</span>}
          {display}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k) => (
            <Button
              key={k}
              type="button"
              variant={k === 'back' ? 'secondary' : 'outline'}
              className="h-16 text-3xl font-semibold"
              onClick={() => press(k === '00' ? '00' : k)}
              aria-label={k === 'back' ? 'Backspace' : k}
            >
              {k === 'back' ? <Delete className="size-7" /> : k === '-' ? '±' : localizeDigits(k, digits)}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant="ghost" size="touch" onClick={() => press('clear')}>
            {t('clear')}
          </Button>
          <Button
            type="button"
            size="touch"
            className="col-span-2"
            onClick={() => {
              onDone(text)
              onOpenChange(false)
            }}
          >
            {t('done')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface FieldButtonProps {
  label: string
  placeholder?: string
  className?: string
  id?: string
  invalid?: boolean
  size?: 'lg' | 'md'
}

export function AmountField({
  value,
  onChange,
  label,
  placeholder,
  className,
  id,
  invalid,
  size = 'lg',
}: FieldButtonProps & { value: number | null; onChange: (p: number | null) => void }) {
  const { money } = useLocale()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        id={id}
        onClick={() => setOpen(true)}
        aria-label={label}
        data-testid={id}
        className={cn(
          'tabular flex w-full items-center justify-end rounded-xl border border-input bg-card px-3 text-right font-semibold transition-colors hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          size === 'lg' ? 'h-14 text-2xl' : 'h-12 text-lg',
          invalid && 'border-destructive ring-3 ring-destructive/20',
          value === null && 'text-muted-foreground',
          className,
        )}
      >
        {value === null ? (placeholder ?? money(0)) : money(value)}
      </button>
      <NumPadDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        mode="money"
        initial={value === null || value === 0 ? '' : paisaToInput(value)}
        onDone={(text) => onChange(parseRupees(text))}
      />
    </>
  )
}

export function QtyField({
  value,
  onChange,
  label,
  className,
  id,
  signed,
  suffix,
  size = 'md',
}: FieldButtonProps & { value: number; onChange: (n: number) => void; signed?: boolean; suffix?: string }) {
  const { num } = useLocale()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        id={id}
        data-testid={id}
        aria-label={label}
        onClick={() => setOpen(true)}
        className={cn(
          'tabular flex w-full items-center justify-end gap-1 rounded-xl border border-input bg-card px-3 text-right font-semibold hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          size === 'lg' ? 'h-14 text-2xl' : 'h-12 text-lg',
          className,
        )}
      >
        {num(value)}
        {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
      </button>
      <NumPadDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        mode="qty"
        signed={signed}
        initial={value ? String(value) : ''}
        onDone={(text) => {
          const n = Number.parseInt(text || '0', 10)
          onChange(Number.isFinite(n) ? n : 0)
        }}
      />
    </>
  )
}
