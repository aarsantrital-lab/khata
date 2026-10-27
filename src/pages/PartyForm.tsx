import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DateField } from '@/components/DateField'
import { Field, Segmented } from '@/components/Field'
import { AmountField, QtyField } from '@/components/NumPad'
import { FormActions, Page, Panel } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso } from '@/lib/bsdate'
import { cleanPan, findDuplicates } from '@/lib/party'
import { billsCarryingPan, saveParty } from '@/lib/repo'
import type { Party, PartyType } from '@/lib/types'
import { errorMessage } from './util'

export function PartyForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { t, num } = useLocale()
  const { partyById, parties, bills, settings } = useData()
  const existing = id ? partyById.get(id) : undefined

  const [type, setType] = useState<PartyType>(existing?.type ?? ((params.get('type') as PartyType) || 'customer'))
  const [name, setName] = useState(existing?.name ?? '')
  const [phone, setPhone] = useState(existing?.phone ?? '')
  const [pan, setPan] = useState(existing?.pan ?? '')
  const [address, setAddress] = useState(existing?.address ?? '')
  const [opening, setOpening] = useState<number | null>(existing ? Math.abs(existing.openingBalance) || null : null)
  const [openingSide, setOpeningSide] = useState<'owes_me' | 'i_owe'>(
    existing ? (existing.openingBalance < 0 ? 'i_owe' : 'owes_me') : type === 'supplier' ? 'i_owe' : 'owes_me',
  )
  const [openingDate, setOpeningDate] = useState(existing?.openingDate ?? todayIso())
  const [creditDays, setCreditDays] = useState(existing?.creditDays ?? settings.defaultCreditDays)
  const [note, setNote] = useState(existing?.note ?? '')
  const [panOnOldBills, setPanOnOldBills] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dupes = useMemo(() => findDuplicates(parties, { id: existing?.id, pan, phone }), [parties, existing?.id, pan, phone])
  const partyBills = useMemo(() => (existing ? bills.filter((b) => b.partyId === existing.id) : []), [bills, existing])
  const renaming = Boolean(existing && name.trim() && name.trim() !== existing.name && partyBills.length)
  const panBills = existing && cleanPan(pan) !== existing.pan ? billsCarryingPan(partyBills, existing.id, existing.pan) : []

  const submit = async () => {
    try {
      const signed = (opening ?? 0) * (openingSide === 'owes_me' ? 1 : -1)
      const saved = await saveParty(
        {
          ...(existing ?? {}),
          id: existing?.id,
          type,
          name,
          phone,
          pan,
          address: address.trim(),
          openingBalance: signed,
          openingDate,
          creditDays,
          note,
        },
        { panOnOldBills: panOnOldBills && panBills.length > 0 },
      )
      toast.success(t('saved'))
      const back = params.get('back')
      navigate(back ? `${back}${back.includes('?') ? '&' : '?'}party=${saved.id}` : `/parties/${saved.id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err, t))
    }
  }

  return (
    <Page title={existing ? t('edit_party') : type === 'customer' ? t('new_customer') : t('new_supplier')} back>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Panel className="flex flex-col gap-4">
          {!existing && (
            <Segmented
              value={type}
              onChange={(v) => {
                setType(v)
                setOpeningSide(v === 'supplier' ? 'i_owe' : 'owes_me')
              }}
              options={[
                { value: 'customer', label: t('customer') },
                { value: 'supplier', label: t('supplier') },
              ]}
            />
          )}
          <Field label={t('party_name')} htmlFor="party-name" error={error} hint={renaming ? t('rename_on_old_bills', { n: num(partyBills.length) }) : undefined}>
            <Input id="party-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!existing} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('phone')} htmlFor="party-phone" optional={t('optional')}>
              <Input id="party-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {dupes.phone && <DuplicateNote party={dupes.phone} text={t('phone_belongs_to', { name: dupes.phone.name })} testId="dup-phone" />}
            </Field>
            <Field label={t('pan')} htmlFor="party-pan" optional={t('optional')}>
              <Input id="party-pan" inputMode="numeric" value={pan} onChange={(e) => setPan(e.target.value)} />
              {dupes.pan && <DuplicateNote party={dupes.pan} text={t('pan_belongs_to', { name: dupes.pan.name })} testId="dup-pan" />}
            </Field>
          </div>
          {panBills.length > 0 && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/40 p-3" data-testid="pan-old-bills">
              <Checkbox checked={panOnOldBills} onCheckedChange={(v) => setPanOnOldBills(v === true)} className="mt-0.5 size-6" />
              <span className="flex flex-col">
                <span className="font-medium">{t('pan_on_old_bills', { n: num(panBills.length) })}</span>
                <span className="text-sm text-muted-foreground">{t('pan_on_old_bills_hint')}</span>
              </span>
            </label>
          )}
          <Field label={t('address')} htmlFor="party-address" optional={t('optional')}>
            <Input id="party-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
        </Panel>

        <Panel className="flex flex-col gap-4">
          <Field label={t('opening_balance')} hint={t('opening_balance_hint')}>
            <AmountField value={opening} onChange={setOpening} label={t('opening_balance')} id="party-opening" />
          </Field>
          <Segmented
            value={openingSide}
            onChange={setOpeningSide}
            options={[
              { value: 'owes_me', label: t('they_owe') },
              { value: 'i_owe', label: t('you_owe') },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('date')}>
              <DateField value={openingDate} onChange={setOpeningDate} label={t('opening_balance')} />
            </Field>
            <Field label={t('credit_days')}>
              <QtyField value={creditDays} onChange={setCreditDays} label={t('credit_days')} />
            </Field>
          </div>
          <Field label={t('note')} optional={t('optional')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Panel>

        <FormActions>
          <Button type="button" variant="outline" size="xl" onClick={() => navigate(-1)}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="xl" data-testid="save-party">
            {t('save')}
          </Button>
        </FormActions>
      </form>
    </Page>
  )
}

function DuplicateNote({ party, text, testId }: { party: Party; text: string; testId: string }) {
  const { t } = useLocale()
  return (
    <p className="flex items-start gap-2 rounded-xl bg-warn/10 p-2.5 text-sm font-medium" role="status" data-testid={testId}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
      <span className="min-w-0 flex-1">{text}</span>
      <Link to={`/parties/${party.id}`} className="shrink-0 text-primary underline-offset-2 hover:underline">
        {t('open_party')}
      </Link>
    </p>
  )
}
