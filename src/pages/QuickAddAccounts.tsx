import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateField } from '@/components/DateField'
import { Field, Segmented } from '@/components/Field'
import { AmountField } from '@/components/NumPad'
import { FormActions, Page, Panel } from '@/components/Page'
import { ACCOUNT_ICONS } from '@/components/Pickers'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { COMMON_BANKS, COMMON_WALLETS, presetExists, quickAddAccounts, type AccountPreset } from '@/lib/accounts'
import { todayIso } from '@/lib/bsdate'
import { cn } from '@/lib/utils'
import { errorMessage } from './util'

interface Picked extends AccountPreset {
  opening: number | null
}

const keyOf = (p: AccountPreset) => `${p.type}:${p.name.trim().toLowerCase()}`

export function QuickAddAccounts() {
  const { t, num } = useLocale()
  const navigate = useNavigate()
  const { accounts } = useData()
  const [picked, setPicked] = useState<Picked[]>([])
  const [custom, setCustom] = useState<AccountPreset[]>([])
  const [otherName, setOtherName] = useState('')
  const [otherType, setOtherType] = useState<'bank' | 'wallet'>('bank')
  const [openingDate, setOpeningDate] = useState(todayIso())
  const [saving, setSaving] = useState(false)

  const label = (p: AccountPreset) => (p.type === 'esewa' || p.type === 'khalti' ? t(p.type) : p.name)
  const isPicked = (p: AccountPreset) => picked.some((x) => keyOf(x) === keyOf(p))
  const toggle = (p: AccountPreset) =>
    setPicked((cur) => (cur.some((x) => keyOf(x) === keyOf(p)) ? cur.filter((x) => keyOf(x) !== keyOf(p)) : [...cur, { ...p, name: label(p), opening: null }]))

  const banks: AccountPreset[] = [...COMMON_BANKS.map((name) => ({ name, type: 'bank' as const })), ...custom.filter((c) => c.type === 'bank')]
  const wallets: AccountPreset[] = [...COMMON_WALLETS, ...custom.filter((c) => c.type !== 'bank')]

  const addOther = () => {
    const name = otherName.trim()
    if (!name) return
    const preset: AccountPreset = { name, type: otherType }
    if (!custom.some((c) => keyOf(c) === keyOf(preset))) setCustom((c) => [...c, preset])
    if (!isPicked(preset) && !presetExists(preset, accounts)) setPicked((cur) => [...cur, { ...preset, opening: null }])
    setOtherName('')
  }

  const save = async () => {
    setSaving(true)
    try {
      const added = await quickAddAccounts(
        picked.map((p) => ({ name: p.name, type: p.type, openingBalance: p.opening ?? 0 })),
        accounts,
        openingDate,
      )
      toast.success(t('accounts_added', { n: num(added.length) }))
      navigate('/money', { replace: true })
    } catch (err) {
      toast.error(errorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  const chips = (list: AccountPreset[]) => (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {list.map((p) => {
        const exists = presetExists(p, accounts)
        const on = exists || isPicked(p)
        const Icon = ACCOUNT_ICONS[p.type]
        return (
          <button
            key={keyOf(p)}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={exists}
            onClick={() => toggle(p)}
            data-testid="quick-account"
            className={cn(
              'flex min-h-14 items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              on && !exists && 'border-primary bg-primary/8 ring-2 ring-primary',
              exists ? 'opacity-60' : 'hover:border-ring',
            )}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md border',
                on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
              )}
            >
              {on ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4 text-muted-foreground" />}
            </span>
            <span className="min-w-0">
              <span className="block leading-tight font-medium break-words">{label(p)}</span>
              {exists && <span className="block text-sm text-muted-foreground">{t('already_added')}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <Page title={t('quick_add_accounts')} back="/money">
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground">{t('quick_add_hint')}</p>

        <Panel className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('wallets')}</h2>
          {chips(wallets)}
        </Panel>

        <Panel className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('banks')}</h2>
          {chips(banks)}
        </Panel>

        <Panel className="flex flex-col gap-3">
          <Field label={t('other_account_name')} htmlFor="other-account">
            <div className="flex gap-2">
              <Input
                id="other-account"
                className="flex-1"
                value={otherName}
                placeholder={t('other_account_placeholder')}
                onChange={(e) => setOtherName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addOther()
                  }
                }}
              />
              <Button size="touch" variant="secondary" onClick={addOther} disabled={!otherName.trim()} aria-label={t('add')} data-testid="add-other-account">
                <Plus />
                <span className="hidden sm:inline">{t('add')}</span>
              </Button>
            </div>
          </Field>
          <Segmented
            value={otherType}
            onChange={setOtherType}
            options={[
              { value: 'bank', label: t('bank') },
              { value: 'wallet', label: t('wallet') },
            ]}
          />
        </Panel>

        {picked.length > 0 && (
          <Panel className="flex flex-col gap-3" data-testid="quick-picked">
            <h2 className="text-lg font-semibold">{t('opening_balance')}</h2>
            {picked.map((p) => {
              const Icon = ACCOUNT_ICONS[p.type]
              return (
                <div key={keyOf(p)} className="grid grid-cols-[1fr_minmax(0,11rem)] items-center gap-3">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <AmountField
                    size="md"
                    value={p.opening}
                    placeholder="0"
                    label={`${t('opening_balance')} — ${p.name}`}
                    onChange={(v) => setPicked((cur) => cur.map((x) => (keyOf(x) === keyOf(p) ? { ...x, opening: v } : x)))}
                  />
                </div>
              )
            })}
            <Field label={t('date')}>
              <DateField value={openingDate} onChange={setOpeningDate} label={t('date')} />
            </Field>
          </Panel>
        )}

        <FormActions>
          <Button type="button" variant="outline" size="xl" onClick={() => navigate(-1)}>
            {t('cancel')}
          </Button>
          <Button type="button" size="xl" disabled={!picked.length || saving} onClick={save} data-testid="save-quick-accounts">
            {t('add_n_accounts', { n: num(picked.length) })}
          </Button>
        </FormActions>
      </div>
    </Page>
  )
}
