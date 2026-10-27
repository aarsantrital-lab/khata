import {
  Check,
  Cloud,
  CloudOff,
  Copy,
  Download,
  HardDrive,
  ImagePlus,
  Info,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field, Segmented } from '@/components/Field'
import { Page, Panel } from '@/components/Page'
import { PinPad } from '@/components/PinPad'
import { useSyncStatus } from '@/components/SyncIndicator'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { backupBlob, eraseAllData, parseBackup, restoreBackup } from '@/lib/backup'
import { isoFromDate, todayIso } from '@/lib/bsdate'
import { isMessageKey } from '@/lib/i18n'
import { canInstall, needsIosInstallHint, onInstallChange, promptInstall } from '@/lib/install'
import { checkPin, clearPin, hasPin, setPin } from '@/lib/pin'
import { saveSettings } from '@/lib/repo'
import { loadSampleData } from '@/lib/sample'
import { saveFile } from '@/lib/share'
import {
  checkServer,
  effectiveServer,
  generateSyncCode,
  getStoredSyncConfig,
  hasBuiltInSupabase,
  isSecretKey,
  prepareJoin,
  setSyncConfig,
  shopIdFromCode,
  supabaseTransport,
  syncManager,
  syncProblem,
  type SyncConfig,
} from '@/lib/sync'
import { THEME_CHOICES, THEME_SWATCHES, useTheme, type ResolvedTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { errorMessage } from './util'

export function Settings() {
  const { t } = useLocale()
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  }, [hash])

  return (
    <Page title={t('nav_settings')}>
      <div className="flex flex-col gap-5">
        <ShopSection />
        <DisplaySection />
        <VatSection />
        <PinSection />
        <SyncSection />
        <BackupSection />
        <InstallSection />
        <StartOverSection />
        <AboutSection />
      </div>
    </Page>
  )
}

function Block({ id, icon, title, hint, children }: { id?: string; icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <Panel id={id} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">{icon}</div>
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </Panel>
  )
}

// ---------------------------------------------------------------- Images

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('generic'))
    }
    img.src = url
  })
}

/**
 * Shrinks an uploaded picture so it stays small enough to sync. For signatures the paper
 * is made transparent and the picture cropped to the ink, so a phone photo of a signature
 * on white paper looks clean on documents.
 */
async function imageToDataUrl(file: File, maxSide: number, signature: boolean): Promise<string> {
  const img = await loadImage(file)
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  if (!signature) return canvas.toDataURL('image/png')

  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  let total = 0
  for (let i = 0; i < px.length; i += 4) total += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
  const paper = total / (px.length / 4)
  const cut = paper * 0.78
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      if (lum >= cut) {
        px[i + 3] = 0
        continue
      }
      const strength = Math.min(1, (cut - lum) / (cut * 0.45))
      px[i] = Math.round(px[i] * 0.35)
      px[i + 1] = Math.round(px[i + 1] * 0.35)
      px[i + 2] = Math.round(px[i + 2] * 0.5 + 40)
      px[i + 3] = Math.round(255 * Math.max(0.25, strength))
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  ctx.putImageData(data, 0, 0)
  if (maxX < 0) return canvas.toDataURL('image/png')
  const pad = 6
  const cx = Math.max(0, minX - pad)
  const cy = Math.max(0, minY - pad)
  const cw = Math.min(w, maxX + pad) - cx
  const ch = Math.min(h, maxY + pad) - cy
  const out = document.createElement('canvas')
  out.width = cw
  out.height = ch
  out.getContext('2d')!.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch)
  return out.toDataURL('image/png')
}

function ImageSetting({ label, hint, value, onChange, signature, testId }: { label: string; hint: string; value?: string; onChange: (v: string | undefined) => void; signature?: boolean; testId: string }) {
  const { t } = useLocale()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-medium text-foreground/85">{label}</span>
      <div className="flex items-center gap-3">
        <div className={cn('flex h-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white', signature ? 'w-40' : 'w-20')}>
          {value ? <img src={value} alt={label} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="size-7 text-muted-foreground" />}
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={() => input.current?.click()} disabled={busy} data-testid={testId}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {t('upload')}
          </Button>
          {value && (
            <Button variant="ghost" className="text-destructive" onClick={() => onChange(undefined)}>
              {t('remove')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            onChange(await imageToDataUrl(file, signature ? 640 : 360, !!signature))
          } catch {
            toast.error(t('err_generic'))
          } finally {
            setBusy(false)
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------- Sections

function ShopSection() {
  const { t } = useLocale()
  const { settings } = useData()
  const [form, setForm] = useState({ shopName: settings.shopName, pan: settings.pan, phone: settings.phone, address: settings.address })
  const dirty = form.shopName !== settings.shopName || form.pan !== settings.pan || form.phone !== settings.phone || form.address !== settings.address
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <Block icon={<Store />} title={t('shop_details')}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('shop_name')} htmlFor="set-shop" className="sm:col-span-2">
          <Input id="set-shop" value={form.shopName} onChange={set('shopName')} />
        </Field>
        <Field label={t('pan')} htmlFor="set-pan">
          <Input id="set-pan" inputMode="numeric" value={form.pan} onChange={set('pan')} />
        </Field>
        <Field label={t('phone')} htmlFor="set-phone">
          <Input id="set-phone" inputMode="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label={t('address')} htmlFor="set-address" className="sm:col-span-2">
          <Textarea id="set-address" rows={2} value={form.address} onChange={set('address')} />
        </Field>
      </div>
      <Button
        size="touch"
        disabled={!dirty || !form.shopName.trim()}
        onClick={async () => {
          await saveSettings({ shopName: form.shopName.trim(), pan: form.pan.trim(), phone: form.phone.trim(), address: form.address.trim() })
          toast.success(t('saved'))
        }}
        data-testid="save-shop"
      >
        {t('save')}
      </Button>
      <div className="grid gap-5 border-t pt-4 sm:grid-cols-2">
        <ImageSetting label={t('logo')} hint={t('logo_hint')} value={settings.logo} onChange={(logo) => saveSettings({ logo })} testId="upload-logo" />
        <ImageSetting
          label={t('signature_upload')}
          hint={t('signature_hint')}
          value={settings.signature}
          onChange={(signature) => saveSettings({ signature })}
          signature
          testId="upload-signature"
        />
      </div>
    </Block>
  )
}

function ThemeSwatch({ theme }: { theme: ResolvedTheme }) {
  const [bg, card, accent] = THEME_SWATCHES[theme]
  return (
    <span className="flex h-full w-full items-end gap-1 p-1.5" style={{ background: bg }}>
      <span className="h-3/5 flex-1 rounded-md shadow-xs" style={{ background: card }} />
      <span className="size-3.5 shrink-0 rounded-full" style={{ background: accent }} />
    </span>
  )
}

function ThemePicker() {
  const { t } = useLocale()
  const { choice, setChoice } = useTheme()
  return (
    <Field label={t('theme')} hint={t('theme_hint')}>
      <div role="radiogroup" aria-label={t('theme')} className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="theme-picker">
        {THEME_CHOICES.map((c) => {
          const active = c === choice
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`theme-${c}`}
              onClick={() => setChoice(c)}
              className={cn(
                'flex flex-col items-stretch gap-1.5 rounded-xl border bg-card p-1.5 text-center transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                active ? 'border-primary ring-2 ring-primary' : 'hover:border-ring',
              )}
            >
              <span className="relative flex h-12 overflow-hidden rounded-lg border">
                {c === 'auto' ? (
                  <>
                    <span className="w-1/2 overflow-hidden">
                      <ThemeSwatch theme="light" />
                    </span>
                    <span className="w-1/2 overflow-hidden">
                      <ThemeSwatch theme="dark" />
                    </span>
                  </>
                ) : (
                  <ThemeSwatch theme={c} />
                )}
                {active && (
                  <span className="absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="text-sm leading-tight font-medium">{t(`theme_${c}`)}</span>
              {c === 'auto' && <span className="-mt-1 text-xs leading-tight text-muted-foreground">{t('theme_auto_hint')}</span>}
            </button>
          )
        })}
      </div>
    </Field>
  )
}

function DisplaySection() {
  const { t } = useLocale()
  const { settings } = useData()
  return (
    <Block icon={<Smartphone />} title={t('display')}>
      <ThemePicker />
      <Field label={t('language')}>
        <Segmented
          size="lg"
          name={t('language')}
          value={settings.language}
          onChange={(language) => saveSettings({ language })}
          options={[
            { value: 'ne', label: 'नेपाली' },
            { value: 'en', label: 'English' },
          ]}
        />
      </Field>
      <Field label={t('digits')}>
        <Segmented
          size="lg"
          name={t('digits')}
          value={settings.digits}
          onChange={(digits) => saveSettings({ digits })}
          options={[
            { value: 'ne', label: '१२३' },
            { value: 'en', label: '123' },
          ]}
        />
      </Field>
      <Field label={t('calendar')}>
        <Segmented
          size="lg"
          name={t('calendar')}
          value={settings.calendar}
          onChange={(calendar) => saveSettings({ calendar })}
          options={[
            { value: 'bs', label: t('calendar_bs') },
            { value: 'ad', label: t('calendar_ad') },
          ]}
        />
      </Field>
    </Block>
  )
}

function VatSection() {
  const { t } = useLocale()
  const { settings } = useData()
  const [rate, setRate] = useState(String(settings.vatRate / 100))
  const [days, setDays] = useState(String(settings.defaultCreditDays))
  const parsedRate = Math.round(Number(rate) * 100)
  const parsedDays = Math.round(Number(days))
  const valid = rate.trim() !== '' && Number.isFinite(parsedRate) && parsedRate >= 0 && parsedRate <= 5000 && Number.isFinite(parsedDays) && parsedDays >= 0
  const dirty = parsedRate !== settings.vatRate || parsedDays !== settings.defaultCreditDays

  return (
    <Block icon={<KeyRound />} title={t('vat_settings')}>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('vat_rate')} htmlFor="set-vat">
          <Input id="set-vat" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label={t('default_credit_days')} htmlFor="set-days">
          <Input id="set-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
      </div>
      <Button
        size="touch"
        disabled={!valid || !dirty}
        onClick={async () => {
          await saveSettings({ vatRate: parsedRate, defaultCreditDays: parsedDays })
          toast.success(t('saved'))
        }}
      >
        {t('save')}
      </Button>
    </Block>
  )
}

type PinFlow = 'set' | 'change' | 'remove'
type PinStep = 'current' | 'new' | 'confirm'

function PinSection() {
  const { t } = useLocale()
  const [on, setOn] = useState(hasPin)
  const [flow, setFlow] = useState<PinFlow | null>(null)
  const [step, setStep] = useState<PinStep>('new')
  const [first, setFirst] = useState('')
  const [error, setError] = useState<string | null>(null)

  const open = (f: PinFlow) => {
    setFlow(f)
    setStep(f === 'set' ? 'new' : 'current')
    setFirst('')
    setError(null)
  }
  const close = () => {
    setFlow(null)
    setOn(hasPin())
  }

  const onComplete = async (pin: string) => {
    if (step === 'current') {
      if (!(await checkPin(pin))) return setError(t('wrong_pin'))
      setError(null)
      if (flow === 'remove') {
        clearPin()
        toast.success(t('pin_removed'))
        return close()
      }
      return setStep('new')
    }
    if (step === 'new') {
      setFirst(pin)
      setError(null)
      return setStep('confirm')
    }
    if (pin !== first) {
      setError(t('pin_mismatch'))
      setFirst('')
      return setStep('new')
    }
    await setPin(pin)
    toast.success(t('pin_set'))
    close()
  }

  const title = step === 'current' ? t('enter_current_pin') : step === 'new' ? t('create_pin') : t('confirm_pin')

  return (
    <Block icon={<Lock />} title={t('pin_lock')} hint={on ? t('auto_lock_hint') : undefined}>
      <div className="flex items-center gap-2 font-medium" data-testid="pin-status">
        <span className={cn('size-2.5 rounded-full', on ? 'bg-good' : 'bg-muted-foreground/40')} />
        {on ? t('pin_on') : t('pin_off')}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {on ? (
          <>
            <Button size="touch" variant="outline" onClick={() => open('change')}>
              {t('change_pin')}
            </Button>
            <Button size="touch" variant="outline" onClick={() => open('remove')}>
              {t('remove_pin')}
            </Button>
            <Button size="touch" onClick={() => window.dispatchEvent(new Event('khata:lock'))} data-testid="lock-now">
              <Lock />
              {t('lock_now')}
            </Button>
          </>
        ) : (
          <Button size="touch" onClick={() => open('set')} data-testid="set-pin">
            {t('set_pin')}
          </Button>
        )}
      </div>
      <Dialog open={flow !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{flow === 'remove' ? t('remove_pin') : flow === 'change' ? t('change_pin') : t('set_pin')}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-2">
            <PinPad key={step} title={title} error={error} onComplete={onComplete} />
          </div>
        </DialogContent>
      </Dialog>
    </Block>
  )
}

function SyncSection() {
  const { t, num, time, date } = useLocale()
  const status = useSyncStatus()
  const builtIn = hasBuiltInSupabase()
  const [stored, setStored] = useState<Partial<SyncConfig> | null>(null)
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const s = await getStoredSyncConfig()
    setStored(s)
    setUrl(s.url ?? '')
    setAnonKey(s.anonKey ?? '')
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  if (!stored) return null
  const server = effectiveServer({ url: url.trim(), anonKey: anonKey.trim() })
  const active = Boolean(stored.code && effectiveServer(stored))
  const serverFields = { url: builtIn ? '' : url.trim(), anonKey: builtIn ? '' : anonKey.trim() }

  const guard = () => {
    if (!server) throw new Error('sync_needs_server')
    if (isSecretKey(server.anonKey)) throw new Error('secret_key')
    if (typeof crypto === 'undefined' || !crypto.subtle) throw new Error('insecure_context')
  }

  const failure = (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    if (isMessageKey(`err_${msg}`)) return errorMessage(err, t)
    const problem = syncProblem(msg)
    return problem ? t(`err_${problem}`) : `${t('sync_error')}: ${msg.slice(0, 120)}`
  }

  const start = async () => {
    setBusy('start')
    try {
      guard()
      const code = generateSyncCode()
      await checkServer(server!, await shopIdFromCode(code))
      await setSyncConfig({ ...serverFields, code })
      await reload()
      toast.success(t('sync_started'))
    } catch (err) {
      toast.error(failure(err))
    } finally {
      setBusy(null)
    }
  }

  const join = async () => {
    setBusy('join')
    try {
      guard()
      const code = joinCode.trim().toUpperCase()
      if (code.replace(/[^A-Z0-9]/g, '').length < 12) throw new Error('sync_code_invalid')
      await prepareJoin(supabaseTransport(server!.url, server!.anonKey), await shopIdFromCode(code))
      await setSyncConfig({ ...serverFields, code })
      await reload()
      setJoinOpen(false)
      setJoinCode('')
      toast.success(t('sync_joined'))
    } catch (err) {
      toast.error(failure(err))
    } finally {
      setBusy(null)
    }
  }

  const stop = async () => {
    await setSyncConfig({ ...serverFields, code: '' })
    await reload()
    toast.success(t('sync_stopped'))
  }

  const stateLine = {
    off: { icon: HardDrive, text: t('sync_off'), tone: 'text-muted-foreground' },
    idle: { icon: Cloud, text: t('sync_on'), tone: 'text-good' },
    syncing: { icon: Loader2, text: t('sync_syncing'), tone: 'text-primary' },
    offline: { icon: CloudOff, text: t('sync_offline'), tone: 'text-warn' },
    error: { icon: TriangleAlert, text: t('sync_error'), tone: 'text-bad' },
  }[status.state]

  const host = (() => {
    try {
      return new URL(effectiveServer(stored)?.url ?? '').host
    } catch {
      return ''
    }
  })()

  return (
    <Block id="sync" icon={<RefreshCw />} title={t('sync')} hint={t('sync_hint')}>
      <div className="flex flex-col gap-1 rounded-xl bg-muted/60 p-3" data-testid="sync-status">
        <div className={cn('flex items-center gap-2 font-semibold', stateLine.tone)}>
          <stateLine.icon className={cn('size-5', status.state === 'syncing' && 'animate-spin')} />
          {stateLine.text}
        </div>
        {active && status.pending > 0 && <span className="text-sm text-muted-foreground">{t('sync_pending', { n: num(status.pending) })}</span>}
        {active && status.photoError && (
          <span className="text-sm font-medium text-warn-strong" data-testid="sync-photo-error">
            {t('sync_photos_failed')}
          </span>
        )}
        {active && status.lastSyncAt && (
          <span className="text-sm text-muted-foreground">
            {t('sync_last', { time: `${date(isoFromDate(new Date(status.lastSyncAt)))} ${time(status.lastSyncAt)}` })}
          </span>
        )}
        {status.state === 'error' && status.error && (
          <span className="text-sm break-words text-bad" data-testid="sync-error">
            {syncProblem(status.error) ? t(`err_${syncProblem(status.error)!}`) : status.error.slice(0, 200)}
          </span>
        )}
        {!active && !server && <span className="text-sm text-muted-foreground">{t('sync_not_configured')}</span>}
      </div>

      {active ? (
        <>
          <Field label={t('sync_code')} hint={t('sync_code_hint')}>
            <div className="flex gap-2">
              <div className="tabular flex h-12 min-w-0 flex-1 items-center rounded-xl border bg-background px-3 font-mono text-lg font-semibold tracking-wider select-all" data-testid="sync-code">
                {stored.code}
              </div>
              <Button
                variant="outline"
                size="icon-touch"
                aria-label={t('copy')}
                onClick={async () => {
                  await navigator.clipboard?.writeText(stored.code ?? '')
                  toast.success(t('copied'))
                }}
              >
                <Copy />
              </Button>
            </div>
          </Field>
          {host && !builtIn && <p className="text-sm text-muted-foreground">{t('sync_project', { host })}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="touch" onClick={() => void syncManager.run()} disabled={status.state === 'syncing'}>
              <RefreshCw className={cn(status.state === 'syncing' && 'animate-spin')} />
              {t('sync_now')}
            </Button>
            <Button size="touch" variant="outline" onClick={stop}>
              {t('sync_stop')}
            </Button>
          </div>
        </>
      ) : (
        <>
          {!builtIn && (
            <div className="flex flex-col gap-3 rounded-xl border border-dashed p-3">
              <span className="font-semibold">{t('sync_server')}</span>
              <Field label={t('sync_url')} htmlFor="sync-url">
                <Input id="sync-url" inputMode="url" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
              </Field>
              <Field label={t('sync_key')} htmlFor="sync-key" hint={t('sync_key_hint')}>
                <Input id="sync-key" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} autoComplete="off" spellCheck={false} />
              </Field>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button size="touch" onClick={start} disabled={!server || !!busy} data-testid="sync-start">
              {busy === 'start' ? <Loader2 className="animate-spin" /> : <Cloud />}
              {t('sync_start')}
            </Button>
            <Button size="touch" variant="outline" onClick={() => setJoinOpen(true)} disabled={!server || !!busy}>
              {t('sync_join')}
            </Button>
          </div>
        </>
      )}

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('sync_join')}</DialogTitle>
            <DialogDescription>{t('sync_join_hint')}</DialogDescription>
          </DialogHeader>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABCD-EFGH-JKLM-NPQR-STUV"
            className="font-mono tracking-wider"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            aria-label={t('sync_code')}
          />
          <DialogFooter>
            <Button size="touch" onClick={join} disabled={busy === 'join' || !joinCode.trim()}>
              {busy === 'join' && <Loader2 className="animate-spin" />}
              {t('sync_join_button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Block>
  )
}

function BackupSection() {
  const { t, num } = useLocale()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <Block icon={<Download />} title={t('backup')} hint={t('backup_hint')}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          size="touch"
          onClick={async () => {
            await saveFile(await backupBlob(), `khata-backup-${todayIso()}.json`)
            toast.success(t('saved_file'))
          }}
          data-testid="download-backup"
        >
          <Download />
          {t('download_backup')}
        </Button>
        <Button size="touch" variant="outline" disabled={busy} onClick={() => input.current?.click()} data-testid="restore-backup">
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          {t('restore_backup')}
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="restore-input"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          try {
            const result = await restoreBackup(parseBackup(await file.text()))
            const done = t('restore_done', { added: num(result.added), updated: num(result.updated) })
            toast.success(result.photos ? `${done} · ${t('restore_photos', { n: num(result.photos) })}` : done)
          } catch (err) {
            toast.error(err instanceof SyntaxError ? t('err_not_a_backup') : errorMessage(err, t))
          } finally {
            setBusy(false)
          }
        }}
      />
    </Block>
  )
}

function InstallSection() {
  const { t } = useLocale()
  const [available, setAvailable] = useState(canInstall)
  useEffect(() => onInstallChange(() => setAvailable(canInstall())), [])
  if (!available && needsIosInstallHint()) {
    return (
      <Block icon={<Smartphone />} title={t('install_app')} hint={t('install_hint')}>
        <ol className="flex list-decimal flex-col gap-1.5 rounded-xl bg-muted/60 p-3 pl-8 text-base" data-testid="ios-install-steps">
          <li>{t('ios_install_1')}</li>
          <li>{t('ios_install_2')}</li>
          <li>{t('ios_install_3')}</li>
        </ol>
        <p className="text-sm font-medium text-warn-strong">{t('ios_install_why')}</p>
      </Block>
    )
  }
  if (!available) return null
  return (
    <Block icon={<Smartphone />} title={t('install_app')} hint={t('install_hint')}>
      <Button size="touch" onClick={() => void promptInstall()}>
        <Download />
        {t('install_app')}
      </Button>
    </Block>
  )
}

function StartOverSection() {
  const { t, lang } = useLocale()
  const { parties, bills, payments, entries, photos } = useData()
  const [eraseOpen, setEraseOpen] = useState(false)
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const empty = parties.length + bills.length + payments.length + entries.length + photos.length === 0

  return (
    <Block icon={<TriangleAlert />} title={t('danger_zone')}>
      {empty && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground">{t('sample_hint')}</p>
          <Button
            size="touch"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await loadSampleData(lang)
              } finally {
                setBusy(false)
              }
            }}
            data-testid="load-sample"
          >
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {t('sample_data')}
          </Button>
        </div>
      )}
      <Button size="touch" variant="destructive" onClick={() => setEraseOpen(true)} data-testid="erase-open">
        <Trash2 />
        {t('erase_all')}
      </Button>
      <Dialog open={eraseOpen} onOpenChange={setEraseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('erase_all')}</DialogTitle>
            <DialogDescription>{t('erase_confirm_hint')}</DialogDescription>
          </DialogHeader>
          <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder="ERASE" autoCapitalize="characters" aria-label="ERASE" data-testid="erase-word" />
          <DialogFooter>
            <Button
              size="touch"
              variant="destructive"
              disabled={word.trim().toUpperCase() !== 'ERASE' || busy}
              data-testid="erase-confirm"
              onClick={async () => {
                setBusy(true)
                try {
                  await eraseAllData()
                  clearPin()
                  await syncManager.run()
                  toast.success(t('erase_done'))
                } finally {
                  setBusy(false)
                  setEraseOpen(false)
                }
              }}
            >
              {t('erase_all')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Block>
  )
}

function AboutSection() {
  const { t, digitsOf } = useLocale()
  return (
    <Block icon={<Info />} title={t('about')}>
      <p>{t('about_text')}</p>
      <p className="text-sm text-muted-foreground">
        {t('app_name')} · {t('version', { v: digitsOf(__APP_VERSION__) })}
      </p>
    </Block>
  )
}
