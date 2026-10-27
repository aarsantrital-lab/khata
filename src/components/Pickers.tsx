import { Banknote, Building2, ChevronDown, Package, Plus, Search, Smartphone, UserPlus, Wallet, WalletCards } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { todayIso } from '@/lib/bsdate'
import { saveParty } from '@/lib/repo'
import { matches } from '@/lib/search'
import type { Account, AccountType, Item, Party, PartyType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Balance } from './Amount'

export const ACCOUNT_ICONS: Record<AccountType, typeof Wallet> = {
  cash: Banknote,
  bank: Building2,
  esewa: Smartphone,
  khalti: Wallet,
  wallet: WalletCards,
}

export function PartyPicker({
  value,
  onChange,
  type,
  id,
  invalid,
}: {
  value: string
  onChange: (party: Party) => void
  type: PartyType
  id?: string
  invalid?: boolean
}) {
  const { t } = useLocale()
  const { parties, partyById, ledgers, settings } = useData()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const selected = partyById.get(value)
  const list = useMemo(
    () => parties.filter((p) => p.type === type && !p.archived && matches(q, p.name, p.phone, p.pan, p.address)),
    [parties, type, q],
  )

  const create = async () => {
    if (!name.trim()) return
    const party = await saveParty({
      type,
      name,
      phone,
      pan: '',
      address: '',
      openingBalance: 0,
      openingDate: todayIso(),
      creditDays: settings.defaultCreditDays,
      note: '',
    })
    onChange(party)
    setAdding(false)
    setName('')
    setPhone('')
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        id={id}
        data-testid={id}
        onClick={() => {
          setQ('')
          setAdding(false)
          setOpen(true)
        }}
        className={cn(
          'flex h-14 w-full items-center gap-3 rounded-xl border border-input bg-card px-3 text-left hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          invalid && 'border-destructive ring-3 ring-destructive/20',
        )}
      >
        <div className="min-w-0 flex-1">
          {selected ? (
            <>
              <div className="truncate text-lg font-semibold">{selected.name}</div>
              {selected.phone && <div className="truncate text-sm text-muted-foreground">{selected.phone}</div>}
            </>
          ) : (
            <span className="text-lg text-muted-foreground">{t('pick_party')}</span>
          )}
        </div>
        <ChevronDown className="size-5 text-muted-foreground" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{type === 'customer' ? t('customers') : t('suppliers')}</DialogTitle>
          </DialogHeader>
          {adding ? (
            <div className="flex flex-col gap-3">
              <Input autoFocus placeholder={t('party_name')} value={name} onChange={(e) => setName(e.target.value)} aria-label={t('party_name')} />
              <Input placeholder={t('phone')} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label={t('phone')} />
              <div className="flex gap-2">
                <Button variant="outline" size="touch" className="flex-1" onClick={() => setAdding(false)}>
                  {t('back')}
                </Button>
                <Button size="touch" className="flex-1" onClick={create} disabled={!name.trim()}>
                  {t('save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-10" autoFocus placeholder={t('search_parties')} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto">
                {list.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p)
                      setOpen(false)
                    }}
                    className={cn('flex items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-muted', p.id === value && 'bg-accent')}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-lg font-medium">{p.name}</div>
                      <div className="truncate text-sm text-muted-foreground">{[p.phone, p.address].filter(Boolean).join(' · ')}</div>
                    </div>
                    <Balance value={ledgers.get(p.id)?.balance ?? 0} />
                  </button>
                ))}
                {!list.length && <p className="px-2 py-6 text-center text-muted-foreground">{t('nothing_yet')}</p>}
              </div>
              <Button
                variant="secondary"
                size="touch"
                onClick={() => {
                  setName(q)
                  setAdding(true)
                }}
              >
                <UserPlus />
                {type === 'customer' ? t('new_customer') : t('new_supplier')}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AccountPicker({
  value,
  onChange,
  exclude,
  id,
}: {
  value: string
  onChange: (account: Account) => void
  exclude?: string
  id?: string
}) {
  const { accounts, balances } = useData()
  const { money } = useLocale()
  const list = accounts.filter((a) => !a.archived && a.id !== exclude)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" id={id}>
      {list.map((a) => {
        const Icon = ACCOUNT_ICONS[a.type]
        const active = a.id === value
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(a)}
            className={cn(
              'flex min-h-16 items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-left transition-colors',
              active ? 'border-primary bg-primary/8 ring-2 ring-primary' : 'hover:border-ring',
            )}
          >
            <Icon className={cn('size-6 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{a.name}</span>
              <span className="tabular block truncate text-sm text-muted-foreground">{money(balances.get(a.id) ?? 0)}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ItemPicker({
  open,
  onOpenChange,
  onPick,
  onNewLine,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (item: Item) => void
  onNewLine: (name: string) => void
}) {
  const { t, money, num } = useLocale()
  const { items, stock } = useData()
  const [q, setQ] = useState('')
  const list = items.filter((i) => !i.archived && matches(q, i.name, i.brand, i.model, i.category))
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setQ('')
        onOpenChange(o)
      }}
    >
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pick_item')}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" autoFocus placeholder={t('search_items')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto">
          {list.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => {
                onPick(i)
                setQ('')
                onOpenChange(false)
              }}
              className="flex items-center gap-3 rounded-xl px-2 py-3 text-left hover:bg-muted"
            >
              <Package className="size-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-medium">{i.name}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {[i.brand, i.model].filter(Boolean).join(' · ')} · {t('in_stock')} {num(stock.get(i.id) ?? 0)}
                </div>
              </div>
              <span className="tabular font-semibold">{money(i.salePrice)}</span>
            </button>
          ))}
          {!list.length && <p className="px-2 py-6 text-center text-muted-foreground">{t('nothing_yet')}</p>}
        </div>
        <Button
          variant="secondary"
          size="touch"
          onClick={() => {
            onNewLine(q)
            setQ('')
            onOpenChange(false)
          }}
        >
          <Plus />
          {q.trim() ? `${t('new_item_line')}: ${q.trim()}` : t('new_item_line')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
