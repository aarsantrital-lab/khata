import { Camera, CheckCircle2, FileText, Pencil, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState, Segmented } from '@/components/Field'
import { HistoryList } from '@/components/HistoryList'
import { Page, Panel } from '@/components/Page'
import { PhotoCapture, PhotoCard, PhotoDetailsDialog, PhotoImage, PhotoViewer } from '@/components/Photos'
import { VoidDialog } from '@/components/VoidDialog'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { enterBillPath, formatBytes, photoKindKey, startingPhotoStatus } from '@/lib/photo'
import { restoreRow, savePhoto, voidRow } from '@/lib/repo'
import type { BillPhoto } from '@/lib/types'
import { NotFound } from './NotFound'

type Tab = 'pending' | 'done' | 'removed'

const tabOf = (p: BillPhoto): Tab => (p.voided ? 'removed' : p.status)

export function Photos() {
  const { t, num, digitsOf } = useLocale()
  const { photos } = useData()
  const [search, setSearch] = useSearchParams()
  const tab = (['pending', 'done', 'removed'] as const).find((x) => x === search.get('tab')) ?? 'pending'
  const counts = useMemo(() => {
    const c = { pending: 0, done: 0, removed: 0 }
    for (const p of photos) c[tabOf(p)]++
    return c
  }, [photos])
  const list = photos.filter((p) => tabOf(p) === tab)
  const totalBytes = photos.reduce((s, p) => s + (p.voided ? 0 : p.bytes), 0)
  const empty = { pending: t('no_photos_to_enter'), done: t('no_photos_entered'), removed: t('no_photos_removed') }[tab]

  return (
    <Page title={t('nav_photos')}>
      <div className="flex flex-col gap-4">
        <Panel className="flex flex-col gap-3">
          <p className="text-base text-muted-foreground">{t('photos_hint')}</p>
          <PhotoCapture
            onSaved={() => {
              if (tab !== 'pending') setSearch({}, { replace: true })
            }}
          />
        </Panel>

        <Segmented
          name={t('nav_photos')}
          value={tab}
          onChange={(v) => setSearch(v === 'pending' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'pending', label: `${t('photos_to_enter')} (${num(counts.pending)})` },
            { value: 'done', label: `${t('photos_entered')} (${num(counts.done)})` },
            { value: 'removed', label: `${t('photos_removed')} (${num(counts.removed)})` },
          ]}
        />

        {tab === 'pending' && list.length > 0 && <p className="text-sm text-muted-foreground">{t('photos_waiting_hint')}</p>}

        {list.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid={`photos-${tab}`}>
            {list.map((p) => (
              <PhotoCard key={p.id} photo={p} className={p.voided ? 'opacity-70' : undefined} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Camera />} title={empty} />
        )}

        {photos.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {t('photo_size_total', { n: num(photos.length - counts.removed), size: formatBytes(totalBytes, digitsOf) })}
          </p>
        )}
      </div>
    </Page>
  )
}

export function PhotoDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, date, digitsOf } = useLocale()
  const { photoById, partyById, billById } = useData()
  const [viewer, setViewer] = useState(false)
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const photo = photoById.get(id)
  if (!photo) return <NotFound />
  const party = photo.partyId ? partyById.get(photo.partyId) : undefined
  const bill = photo.billId ? billById.get(photo.billId) : undefined
  const kindLabel = t(photoKindKey(photo.kind))
  const paper = photo.kind === 'other'
  const statusLabel = (status: unknown) =>
    status === 'done' ? t(paper ? 'photo_status_kept' : 'photo_status_done') : status === 'pending' ? t('photo_status_pending') : ''

  const setStatus = async (status: BillPhoto['status']) => {
    await savePhoto({ ...photo, status, billId: status === 'pending' ? undefined : photo.billId })
    toast.success(t('saved'))
  }

  return (
    <Page
      title={t('bill_photo')}
      back
      wide
      actions={
        !photo.voided && (
          <Button variant="ghost" size="icon-touch" aria-label={t('edit_photo_details')} onClick={() => setEditing(true)} data-testid="edit-photo">
            <Pencil />
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {photo.voided && (
          <div className="flex flex-col gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="font-semibold text-bad">{t('photos_removed')}</div>
              <div>{photo.voided.reason}</div>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await restoreRow('photos', photo)
                toast.success(t('photo_restored'))
              }}
              data-testid="restore-photo"
            >
              <Undo2 />
              {t('restore')}
            </Button>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <PhotoImage photo={photo} className="h-[62dvh] lg:h-[calc(100dvh-8rem)]" onOpen={() => setViewer(true)} />

          <Panel className="flex flex-col gap-4 lg:sticky lg:top-20">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {party ? (
                  <Link to={`/parties/${party.id}`} className="text-xl font-semibold text-primary">
                    {party.name}
                  </Link>
                ) : (
                  <div className="text-xl font-semibold">{kindLabel}</div>
                )}
                <div className="text-muted-foreground">
                  {date(photo.date)}
                  {party && ` · ${kindLabel}`}
                </div>
              </div>
              <Badge variant={photo.status === 'done' ? 'secondary' : 'default'} className="text-sm" data-testid="photo-status">
                {statusLabel(photo.status)}
              </Badge>
            </div>
            {photo.note && <p className="rounded-xl bg-muted p-3">{photo.note}</p>}
            {bill && (
              <Link to={`/bills/${bill.id}`} className="flex items-center gap-2 font-medium text-good" data-testid="photo-bill-link">
                <FileText className="size-5" />
                {t('photo_linked_bill', { no: digitsOf(bill.billNo) })}
              </Link>
            )}
            <div className="text-sm text-muted-foreground">
              {t('photo_size')}: {formatBytes(photo.bytes, digitsOf)} · {digitsOf(`${photo.width}×${photo.height}`)}
            </div>

            {!photo.voided && (
              <div className="flex flex-col gap-2">
                {photo.status === 'pending' && !paper && (
                  <Button size="xl" onClick={() => navigate(enterBillPath(photo))} data-testid="enter-bill">
                    <FileText />
                    {t('enter_bill_now')}
                  </Button>
                )}
                {photo.status === 'pending' ? (
                  <Button size="touch" variant="outline" onClick={() => void setStatus('done')} data-testid="mark-entered">
                    <CheckCircle2 />
                    {t(paper ? 'mark_kept' : 'mark_entered')}
                  </Button>
                ) : paper ? null : (
                  <Button size="touch" variant="outline" onClick={() => void setStatus('pending')} data-testid="mark-to-enter">
                    <Undo2 />
                    {t('mark_to_enter')}
                  </Button>
                )}
                <Button size="touch" variant="ghost" className="text-bad" onClick={() => setRemoving(true)} data-testid="remove-photo">
                  <Trash2 />
                  {t('remove_photo')}
                </Button>
              </div>
            )}
          </Panel>
        </div>

        <HistoryList
          entityId={photo.id}
          fields={{
            status: statusLabel,
            kind: (v) => (v === 'sale' || v === 'purchase' || v === 'other' ? t(photoKindKey(v)) : ''),
            partyId: (v) => (v ? (partyById.get(String(v))?.name ?? '') : ''),
            date: (v) => (v ? date(String(v)) : ''),
            note: (v) => String(v ?? ''),
          }}
        />
      </div>

      <PhotoViewer photo={photo} open={viewer} onOpenChange={setViewer} />
      {editing && (
        <PhotoDetailsDialog
          open
          onOpenChange={setEditing}
          preview={photo.thumb}
          initial={{ kind: photo.kind, partyId: photo.partyId ?? '', date: photo.date, note: photo.note }}
          onSave={async (d) => {
            const status = d.kind !== photo.kind && !photo.billId ? startingPhotoStatus(d.kind) : photo.status
            await savePhoto({ ...photo, ...d, status, partyId: d.partyId || undefined, note: d.note.trim() })
            setEditing(false)
            toast.success(t('saved'))
          }}
        />
      )}
      <VoidDialog
        open={removing}
        onOpenChange={setRemoving}
        title={t('remove_photo')}
        description={t('remove_photo_explain')}
        onConfirm={async (reason) => {
          await voidRow('photos', photo, reason)
          toast.success(t('photo_removed'))
        }}
      />
    </Page>
  )
}
