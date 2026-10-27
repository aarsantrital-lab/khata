import { Camera, ExternalLink, ImageOff, ImagePlus, Loader2, RefreshCw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso, type ISODate } from '@/lib/bsdate'
import { isIos } from '@/lib/install'
import { compressPhoto, enterBillPath, formatBytes, photoKindKey, startingPhotoStatus, type CompressedPhoto } from '@/lib/photo'
import { savePhoto } from '@/lib/repo'
import { loadPhoto } from '@/lib/sync'
import type { BillPhoto, PartyType, PhotoKind } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DateField } from './DateField'
import { Field, Segmented } from './Field'
import { PartyPicker } from './Pickers'

type ImageState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'missing' } | { status: 'error' }

/** Loads a photo's full image from this device, or from the sync server the first time it is opened here. */
function usePhotoImage(id: string, attempt: number): ImageState {
  const [state, setState] = useState<{ key: string; value: ImageState }>({ key: '', value: { status: 'loading' } })
  const key = `${id}:${attempt}`
  useEffect(() => {
    let alive = true
    let url: string | undefined
    void loadPhoto(id).then((r) => {
      if (!alive) return
      if (r.state === 'ready') {
        url = URL.createObjectURL(r.blob)
        setState({ key, value: { status: 'ready', url } })
      } else {
        setState({ key, value: { status: r.state } })
      }
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, key])
  return state.key === key ? state.value : { status: 'loading' }
}

/** The full photo, with the small preview shown until it loads. */
export function PhotoImage({ photo, className, onOpen }: { photo: BillPhoto; className?: string; onOpen?: () => void }) {
  const { t } = useLocale()
  const [attempt, setAttempt] = useState(0)
  const image = usePhotoImage(photo.id, attempt)
  const src = image.status === 'ready' ? image.url : photo.thumb
  return (
    <div className={cn('relative flex items-center justify-center overflow-hidden rounded-2xl border bg-muted', className)} data-testid="photo-image">
      <button
        type="button"
        className="flex size-full cursor-zoom-in items-center justify-center disabled:cursor-default"
        onClick={onOpen}
        disabled={!onOpen || image.status !== 'ready'}
        aria-label={t('photo_open_full')}
      >
        <img
          src={src}
          alt={t('bill_photo')}
          className={cn('max-h-full max-w-full object-contain', image.status !== 'ready' && 'size-full object-cover blur-[2px]')}
          style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
          data-state={image.status}
        />
      </button>
      {image.status === 'loading' && (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2 rounded-xl bg-background/90 p-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" />
          {t('photo_loading')}
        </div>
      )}
      {(image.status === 'missing' || image.status === 'error') && (
        <div className="absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 rounded-xl bg-background/95 p-3 text-center text-sm" data-testid="photo-missing">
          <span className="flex items-center gap-2 font-medium">
            <ImageOff className="size-4 shrink-0" />
            {t('photo_missing')}
          </span>
          <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw />
            {t('retry')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Full-screen photo. Tap the image to switch between fitting the screen and its real size. */
export function PhotoViewer({ photo, open, onOpenChange }: { photo: BillPhoto; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useLocale()
  const image = usePhotoImage(photo.id, open ? 1 : 0)
  const [zoom, setZoom] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setZoom(false)
        onOpenChange(o)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 rounded-none bg-black p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white ring-0 sm:max-w-none"
        data-testid="photo-viewer"
      >
        <DialogTitle className="sr-only">{t('bill_photo')}</DialogTitle>
        <DialogDescription className="sr-only">{t('photo_open_full')}</DialogDescription>
        <div className="flex items-center gap-1 p-2">
          <Button variant="ghost" size="icon-touch" className="text-white hover:bg-white/15 hover:text-white" onClick={() => onOpenChange(false)} aria-label={t('close')}>
            <X />
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" size="icon-touch" className="text-white hover:bg-white/15 hover:text-white" onClick={() => setZoom((z) => !z)} aria-label={zoom ? t('zoom_out') : t('zoom_in')}>
            {zoom ? <ZoomOut /> : <ZoomIn />}
          </Button>
          {/* An installed iPhone app cannot open an image in a new tab; zoom covers it there. */}
          {image.status === 'ready' && !isIos() && (
            <Button
              variant="ghost"
              size="icon-touch"
              className="text-white hover:bg-white/15 hover:text-white"
              render={<a href={image.url} target="_blank" rel="noreferrer" />}
              nativeButton={false}
              aria-label={t('photo_open_full')}
            >
              <ExternalLink />
            </Button>
          )}
        </div>
        <div className={cn('min-h-0 flex-1 overflow-auto', !zoom && 'flex items-center justify-center p-2')}>
          <img
            src={image.status === 'ready' ? image.url : photo.thumb}
            alt={t('bill_photo')}
            onClick={() => setZoom((z) => !z)}
            className={cn(zoom ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain')}
            style={zoom ? { width: Math.max(photo.width, 1200) } : undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export interface PhotoDetails {
  kind: PhotoKind
  partyId: string
  date: ISODate
  note: string
}

const partyTypeFor = (kind: PhotoKind): PartyType | null => (kind === 'sale' ? 'customer' : kind === 'purchase' ? 'supplier' : null)

/** Kind, party, date and note for a photo, asked right after it is taken and editable later. */
export function PhotoDetailsDialog({
  open,
  onOpenChange,
  preview,
  initial,
  lockParty,
  sizeLabel,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  preview: string
  initial: PhotoDetails
  /** Set when the photo is being added from a party's page, so the party cannot change. */
  lockParty?: boolean
  sizeLabel?: string
  onSave: (details: PhotoDetails) => Promise<void>
}) {
  const { t } = useLocale()
  const { partyById } = useData()
  const [d, setD] = useState(initial)
  const [saving, setSaving] = useState(false)
  const party = partyById.get(d.partyId)
  const partyType = partyTypeFor(d.kind)
  const kinds: PhotoKind[] = lockParty && party ? [party.type === 'customer' ? 'sale' : 'purchase', 'other'] : ['sale', 'purchase', 'other']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 p-0 sm:max-w-lg" data-testid="photo-details">
        <DialogHeader className="flex-row items-center gap-3 border-b p-4 pr-12">
          <img src={preview} alt={t('bill_photo')} className="size-16 shrink-0 rounded-lg border object-cover" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>{t('photo_details')}</DialogTitle>
            {sizeLabel && <DialogDescription>{sizeLabel}</DialogDescription>}
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <Field label={t('photo_kind')}>
            <Segmented
              name={t('photo_kind')}
              value={d.kind}
              onChange={(kind) => {
                const keep = lockParty || (party && party.type === partyTypeFor(kind))
                setD({ ...d, kind, partyId: keep ? d.partyId : '' })
              }}
              options={kinds.map((k) => ({ value: k, label: t(photoKindKey(k)) }))}
            />
          </Field>
          {lockParty && party ? (
            <Field label={t('photo_party')}>
              <div className="flex h-14 items-center rounded-xl bg-muted px-3 text-lg font-semibold">{party.name}</div>
            </Field>
          ) : (
            partyType && (
              <Field label={t('photo_party')} optional={t('optional')}>
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <PartyPicker id="photo-party" type={partyType} value={d.partyId} onChange={(p) => setD({ ...d, partyId: p.id })} />
                  </div>
                  {d.partyId && (
                    <Button type="button" variant="ghost" size="icon-touch" className="h-14" aria-label={t('remove')} onClick={() => setD({ ...d, partyId: '' })}>
                      <X />
                    </Button>
                  )}
                </div>
              </Field>
            )
          )}
          <Field label={t('date')}>
            <DateField id="photo-date" value={d.date} onChange={(date) => setD({ ...d, date })} label={t('date')} />
          </Field>
          <Field label={t('note')} htmlFor="photo-note" optional={t('optional')}>
            <Input id="photo-note" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} data-testid="photo-note" />
          </Field>
        </div>
        <div className="flex gap-2 border-t p-4">
          <Button variant="outline" size="touch" className="flex-1" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            size="touch"
            className="flex-1"
            disabled={saving}
            data-testid="save-photo"
            onClick={async () => {
              setSaving(true)
              try {
                await onSave(d)
              } finally {
                setSaving(false)
              }
            }}
          >
            {t('save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Take or choose bill photos. One photo asks for its details; several chosen at once are
 * saved straight away with the defaults. With a bill given, photos attach to it directly.
 */
export function PhotoCapture({
  defaults = {},
  size = 'lg',
  onSaved,
}: {
  defaults?: { kind?: PhotoKind; partyId?: string; billId?: string }
  size?: 'lg' | 'md'
  onSaved?: (photo: BillPhoto) => void
}) {
  const { t, digitsOf } = useLocale()
  const navigate = useNavigate()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<CompressedPhoto | null>(null)
  const attachToBill = Boolean(defaults.billId)

  const store = async (c: CompressedPhoto, d: PhotoDetails) => {
    const photo = await savePhoto(
      {
        status: startingPhotoStatus(d.kind, defaults.billId),
        kind: d.kind,
        partyId: d.partyId || undefined,
        billId: defaults.billId,
        date: d.date,
        note: d.note.trim(),
        thumb: c.thumb,
        type: c.type,
        bytes: c.data.length,
        width: c.width,
        height: c.height,
      },
      { data: c.data, type: c.type },
    )
    onSaved?.(photo)
    return photo
  }

  const baseDetails = (): PhotoDetails => ({ kind: defaults.kind ?? 'sale', partyId: defaults.partyId ?? '', date: todayIso(), note: '' })

  const onFiles = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!files.length) return
    setBusy(true)
    try {
      if (files.length === 1 && !attachToBill) {
        setDraft(await compressPhoto(files[0]))
        return
      }
      let bytes = 0
      let last: BillPhoto | undefined
      for (const file of files) {
        const c = await compressPhoto(file)
        last = await store(c, baseDetails())
        bytes += c.data.length
      }
      if (files.length === 1 && last) toast.success(t('photo_saved', { size: formatBytes(bytes, digitsOf) }))
      else toast.success(t('photo_size_total', { n: digitsOf(String(files.length)), size: formatBytes(bytes, digitsOf) }))
    } catch (err) {
      console.error(err)
      toast.error(t('photo_err'))
    } finally {
      setBusy(false)
    }
  }

  const big = size === 'lg'
  return (
    <>
      {big ? (
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" size="xl" className="h-20 flex-col gap-1 text-lg" disabled={busy} onClick={() => camera.current?.click()} data-testid="take-photo">
            {busy ? <Loader2 className="animate-spin" /> : <Camera />}
            {t('take_photo')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xl"
            className="h-20 flex-col gap-1 text-lg"
            disabled={busy}
            onClick={() => gallery.current?.click()}
            data-testid="choose-photo"
          >
            <ImagePlus />
            {t('choose_photo')}
          </Button>
        </div>
      ) : (
        // A plain file picker already offers the camera or the gallery on phones.
        <Button type="button" variant="outline" size="touch" disabled={busy} onClick={() => gallery.current?.click()} data-testid="add-photo">
          {busy ? <Loader2 className="animate-spin" /> : <Camera />}
          {t('add_photo')}
        </Button>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFiles(e.currentTarget)} data-testid="photo-input-camera" />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.currentTarget)} data-testid="photo-input-file" />
      {draft && (
        <PhotoDetailsDialog
          open
          onOpenChange={(o) => !o && setDraft(null)}
          preview={draft.thumb}
          initial={baseDetails()}
          lockParty={Boolean(defaults.partyId)}
          sizeLabel={formatBytes(draft.data.length, digitsOf)}
          onSave={async (d) => {
            const photo = await store(draft, d)
            setDraft(null)
            toast.success(
              t('photo_saved', { size: formatBytes(draft.data.length, digitsOf) }),
              photo.kind !== 'other' ? { action: { label: t('enter_bill_now'), onClick: () => navigate(enterBillPath(photo)) } } : undefined,
            )
          }}
        />
      )}
    </>
  )
}

/** A photo in a grid: preview, party and date. */
export function PhotoCard({ photo, className }: { photo: BillPhoto; className?: string }) {
  const { t, date, digitsOf } = useLocale()
  const { partyById, billById } = useData()
  const party = photo.partyId ? partyById.get(photo.partyId) : undefined
  const bill = photo.billId ? billById.get(photo.billId) : undefined
  return (
    <Link
      to={`/photos/${photo.id}`}
      className={cn('group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-colors hover:border-ring', className)}
      data-testid="photo-card"
    >
      <div className="aspect-[3/4] overflow-hidden bg-muted">
        <img src={photo.thumb} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
      </div>
      <div className="flex flex-col gap-0.5 p-2.5">
        <div className="truncate font-semibold">{party?.name ?? t(photoKindKey(photo.kind))}</div>
        <div className="truncate text-sm text-muted-foreground">
          {date(photo.date)}
          {party && ` · ${t(photoKindKey(photo.kind))}`}
        </div>
        {bill ? (
          <div className="truncate text-sm font-medium text-good">{t('photo_linked_bill', { no: digitsOf(bill.billNo) })}</div>
        ) : (
          photo.note && <div className="truncate text-sm">{photo.note}</div>
        )}
      </div>
    </Link>
  )
}
