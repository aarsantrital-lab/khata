import { Delete } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/app/locale'
import { localizeDigits } from '@/lib/money'
import { cn } from '@/lib/utils'

export function PinPad({
  title,
  error,
  onComplete,
  length = 4,
}: {
  title: string
  error?: string | null
  onComplete: (pin: string) => void
  length?: number
}) {
  const { digits } = useLocale()
  const [pin, setPin] = useState('')

  useEffect(() => {
    if (pin.length === length) {
      const p = pin
      const timer = setTimeout(() => {
        setPin('')
        onComplete(p)
      }, 120)
      return () => clearTimeout(timer)
    }
  }, [pin, length, onComplete])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < length ? p + e.key : p))
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [length])

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6">
      <h2 className="text-center text-2xl font-semibold">{title}</h2>
      <div className="flex gap-4" aria-label={`${pin.length} of ${length}`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cn('size-5 rounded-full border-2 border-primary', i < pin.length && 'bg-primary')} />
        ))}
      </div>
      <p className={cn('min-h-6 text-center font-medium text-destructive', !error && 'invisible')} role="alert">
        {error ?? '.'}
      </p>
      <div className="grid w-full grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'].map((k) =>
          k === '' ? (
            <span key="blank" />
          ) : (
            <Button
              key={k}
              variant={k === 'back' ? 'ghost' : 'outline'}
              className="h-18 rounded-2xl text-3xl font-semibold"
              aria-label={k === 'back' ? 'Backspace' : k}
              onClick={() => setPin((p) => (k === 'back' ? p.slice(0, -1) : p.length < length ? p + k : p))}
            >
              {k === 'back' ? <Delete className="size-7" /> : localizeDigits(k, digits)}
            </Button>
          ),
        )}
      </div>
    </div>
  )
}
