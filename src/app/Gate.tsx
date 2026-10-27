import { BookOpenCheck, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AmountField } from '@/components/NumPad'
import { Field, Segmented } from '@/components/Field'
import { PinPad } from '@/components/PinPad'
import { useData } from './data'
import { useLocale } from './locale'
import { translate } from '@/lib/i18n'
import { checkPin, clearPin, hasPin, setPin } from '@/lib/pin'
import { ensureCashAccount, saveSettings } from '@/lib/repo'
import { loadSampleData } from '@/lib/sample'

const RELOCK_AFTER_MS = 2 * 60 * 1000

export function Gate({ children }: { children: ReactNode }) {
  const { ready, settings } = useData()
  const [locked, setLocked] = useState(() => hasPin())
  const hiddenAt = useRef<number | null>(null)

  useEffect(() => {
    document.documentElement.lang = settings.language
  }, [settings.language])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now()
      else if (hiddenAt.current && Date.now() - hiddenAt.current > RELOCK_AFTER_MS && hasPin()) setLocked(true)
    }
    const onLock = () => hasPin() && setLocked(true)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('khata:lock', onLock)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('khata:lock', onLock)
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }
  if (!settings.onboarded) return <Onboarding />
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />
  return <>{children}</>
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t, digitsOf } = useLocale()
  const { settings } = useData()
  const [error, setError] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)
  const [pan, setPan] = useState('')

  const onComplete = useCallback(
    async (pin: string) => {
      if (await checkPin(pin)) onUnlock()
      else setError(t('wrong_pin'))
    },
    [onUnlock, t],
  )

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-6 py-10">
      <div className="flex flex-col items-center gap-2">
        {settings.logo ? (
          <img src={settings.logo} alt="" className="size-16 rounded-2xl object-contain" />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <BookOpenCheck className="size-9" />
          </div>
        )}
        <div className="text-xl font-semibold">{settings.shopName || t('app_name')}</div>
      </div>
      {forgot ? (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <p className="text-center">{t('forgot_pin_hint')}</p>
          <Input inputMode="numeric" value={pan} onChange={(e) => setPan(e.target.value)} aria-label={t('pan')} />
          <Button
            size="touch"
            onClick={() => {
              if (settings.pan && digitsOf(pan.trim()) === digitsOf(settings.pan.trim())) {
                clearPin()
                toast.success(t('pin_removed'))
                onUnlock()
              } else setError(t('wrong_pin'))
            }}
          >
            {t('confirm')}
          </Button>
          {error && <p className="text-center text-destructive">{error}</p>}
          <Button variant="ghost" onClick={() => setForgot(false)}>
            {t('back')}
          </Button>
        </div>
      ) : (
        <>
          <PinPad title={t('enter_pin')} error={error} onComplete={onComplete} />
          {settings.pan && (
            <Button variant="link" onClick={() => setForgot(true)}>
              {t('forgot_pin')}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

type Step = 'language' | 'shop' | 'pin'

function Onboarding() {
  const { settings } = useData()
  const [lang, setLang] = useState<'ne' | 'en'>(settings.language)
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate(lang, k, v)
  const [step, setStep] = useState<Step>('language')
  const [shopName, setShopName] = useState('')
  const [pan, setPan] = useState('')
  const [phone, setPhone] = useState('')
  const [cash, setCash] = useState<number | null>(null)
  const [firstPin, setFirstPin] = useState<string | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const chooseLanguage = async (l: 'ne' | 'en') => {
    setLang(l)
    await saveSettings({ language: l, digits: l })
  }

  const finish = async () => {
    setBusy(true)
    await ensureCashAccount(cash ?? 0, lang === 'ne' ? 'नगद' : 'Cash')
    await saveSettings({ shopName: shopName.trim(), pan: pan.trim(), phone: phone.trim(), onboarded: true })
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-primary/10 to-background px-5 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <BookOpenCheck className="size-9" />
          </div>
          <h1 className="text-3xl font-bold">{t('welcome_title')}</h1>
          <p className="text-lg text-muted-foreground">{t('welcome_text')}</p>
        </div>

        {step === 'language' && (
          <div className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-semibold">{t('choose_language')}</h2>
            <Segmented
              size="lg"
              value={lang}
              onChange={chooseLanguage}
              options={[
                { value: 'ne', label: 'नेपाली' },
                { value: 'en', label: 'English' },
              ]}
            />
            <Button size="xl" onClick={() => setStep('shop')}>
              {t('next')}
            </Button>
            <Button
              variant="ghost"
              size="touch"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await loadSampleData(lang)
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t('explore_sample')}
            </Button>
          </div>
        )}

        {step === 'shop' && (
          <div className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-sm">
            <h2 className="text-xl font-semibold">{t('setup_shop')}</h2>
            <Field label={t('shop_name')} htmlFor="shop-name">
              <Input id="shop-name" value={shopName} onChange={(e) => setShopName(e.target.value)} autoFocus />
            </Field>
            <Field label={t('pan')} htmlFor="shop-pan" optional={t('optional')}>
              <Input id="shop-pan" inputMode="numeric" value={pan} onChange={(e) => setPan(e.target.value)} />
            </Field>
            <Field label={t('phone')} htmlFor="shop-phone" optional={t('optional')}>
              <Input id="shop-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label={t('opening_cash')}>
              <AmountField value={cash} onChange={setCash} label={t('opening_cash')} id="opening-cash" />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" size="xl" className="flex-1" onClick={() => setStep('language')}>
                {t('back')}
              </Button>
              <Button size="xl" className="flex-1" disabled={!shopName.trim()} onClick={() => setStep('pin')}>
                {t('next')}
              </Button>
            </div>
          </div>
        )}

        {step === 'pin' && (
          <div className="flex flex-col items-center gap-4 rounded-3xl border bg-card p-5 shadow-sm">
            <PinPad
              title={firstPin ? t('confirm_pin') : t('create_pin')}
              error={pinError}
              onComplete={async (pin) => {
                if (!firstPin) {
                  setFirstPin(pin)
                  setPinError(null)
                } else if (firstPin === pin) {
                  await setPin(pin)
                  await finish()
                } else {
                  setFirstPin(null)
                  setPinError(t('pin_mismatch'))
                }
              }}
            />
            <Button variant="ghost" size="touch" disabled={busy} onClick={finish}>
              {t('skip')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
