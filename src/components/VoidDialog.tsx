import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/app/locale'

export function VoidDialog({
  open,
  onOpenChange,
  title,
  description,
  extra,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  extra?: string
  onConfirm: (reason: string) => Promise<void> | void
}) {
  const { t } = useLocale()
  const [reason, setReason] = useState('')
  const [error, setError] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('')
          setError(false)
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? t('cancel_explain')}</DialogDescription>
        </DialogHeader>
        {extra && <p className="rounded-xl bg-warn/10 p-3 text-base">{extra}</p>}
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">{t('cancel_reason')}</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={error} autoFocus data-testid="void-reason" />
          {error && <span className="text-sm text-destructive">{t('err_reason_required')}</span>}
        </label>
        <div className="flex gap-2">
          <Button variant="outline" size="touch" className="flex-1" onClick={() => onOpenChange(false)}>
            {t('back')}
          </Button>
          <Button
            variant="destructive"
            size="touch"
            className="flex-1"
            onClick={async () => {
              if (!reason.trim()) {
                setError(true)
                return
              }
              await onConfirm(reason.trim())
              setReason('')
              onOpenChange(false)
            }}
            data-testid="void-confirm"
          >
            {t('confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
