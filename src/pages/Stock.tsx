import { Boxes, ChevronRight, Pencil, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Amount } from '@/components/Amount'
import { DateField } from '@/components/DateField'
import { EmptyState, Field, Segmented } from '@/components/Field'
import { HistoryList } from '@/components/HistoryList'
import { AmountField, QtyField } from '@/components/NumPad'
import { FormActions, Page, Panel } from '@/components/Page'
import { useData } from '@/app/data'
import { useLocale } from '@/app/locale'
import { matches } from '@/lib/search'
import { todayIso } from '@/lib/bsdate'
import { saveAdjustment, saveItem } from '@/lib/repo'
import type { Unit } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NotFound } from './NotFound'
import { errorMessage } from './util'

export function Stock() {
  const { t, num, money } = useLocale()
  const { items, stock } = useData()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const onlyLow = params.get('filter') === 'low'
  const list = useMemo(
    () =>
      items.filter(
        (i) => !i.archived && matches(q, i.name, i.brand, i.model, i.category) && (!onlyLow || (stock.get(i.id) ?? 0) <= i.lowStockAt),
      ),
    [items, q, onlyLow, stock],
  )
  const lowCount = items.filter((i) => !i.archived && (stock.get(i.id) ?? 0) <= i.lowStockAt).length
  const value = items.reduce((s, i) => s + Math.max(0, stock.get(i.id) ?? 0) * i.costPrice, 0)

  return (
    <Page
      title={t('nav_stock')}
      back="/more"
      actions={
        <Button onClick={() => navigate('/stock/new')} data-testid="new-item">
          <Plus />
          <span className="hidden sm:inline">{t('new_stock_item')}</span>
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
          <span className="text-lg text-secondary-foreground">{t('stock_value')}</span>
          <span className="tabular text-2xl font-bold">{money(value)}</span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-10" placeholder={t('search_items')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {lowCount > 0 && (
            <Button
              size="touch"
              variant={onlyLow ? 'default' : 'outline'}
              onClick={() => setParams(onlyLow ? {} : { filter: 'low' }, { replace: true })}
            >
              {t('low_stock')} ({num(lowCount)})
            </Button>
          )}
        </div>
        {list.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title={t('no_items')}
            action={
              <Button size="touch" onClick={() => navigate('/stock/new')}>
                <Plus />
                {t('new_stock_item')}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {list.map((i) => {
              const qty = stock.get(i.id) ?? 0
              const low = qty <= i.lowStockAt
              return (
                <Link key={i.id} to={`/stock/${i.id}`} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted', low && 'border-l-4 border-l-warn')} data-testid="item-row">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{i.name}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {[i.brand, i.model, i.category].filter(Boolean).join(' · ')} · {money(i.salePrice)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={cn('tabular text-xl font-bold', low && 'text-warn')} data-testid="item-qty">
                      {num(qty)}
                    </span>
                    <span className="text-sm text-muted-foreground">{t(i.unit)}</span>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </Page>
  )
}

export function ItemForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLocale()
  const { itemById } = useData()
  const existing = id ? itemById.get(id) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [brand, setBrand] = useState(existing?.brand ?? '')
  const [model, setModel] = useState(existing?.model ?? '')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [unit, setUnit] = useState<Unit>(existing?.unit ?? 'pcs')
  const [salePrice, setSalePrice] = useState<number | null>(existing?.salePrice ?? null)
  const [costPrice, setCostPrice] = useState<number | null>(existing?.costPrice ?? null)
  const [taxable, setTaxable] = useState(existing?.taxable ?? true)
  const [openingQty, setOpeningQty] = useState(existing?.openingQty ?? 0)
  const [lowStockAt, setLowStockAt] = useState(existing?.lowStockAt ?? 5)
  const [error, setError] = useState<string | null>(null)

  if (id && !existing) return <NotFound />

  return (
    <Page title={existing ? t('edit_stock_item') : t('new_stock_item')} back>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            const autoName = name.trim() || [brand, model].filter(Boolean).join(' ')
            const saved = await saveItem({
              ...(existing ?? {}),
              id: existing?.id,
              name: autoName,
              brand: brand.trim(),
              model: model.trim(),
              category: category.trim(),
              unit,
              salePrice: salePrice ?? 0,
              costPrice: costPrice ?? 0,
              taxable,
              openingQty,
              lowStockAt,
            })
            toast.success(t('saved'))
            navigate(`/stock/${saved.id}`, { replace: true })
          } catch (err) {
            setError(errorMessage(err, t))
          }
        }}
      >
        <Panel className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('brand')} htmlFor="item-brand">
              <Input id="item-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Philips, Havells…" />
            </Field>
            <Field label={t('model')} htmlFor="item-model">
              <Input id="item-model" value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
          </div>
          <Field label={t('item_name')} htmlFor="item-name" error={error}>
            <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={[brand, model].filter(Boolean).join(' ')} />
          </Field>
          <Field label={t('category')} htmlFor="item-category" optional={t('optional')}>
            <Input id="item-category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label={t('unit')}>
            <Segmented
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'pcs', label: t('pcs') },
                { value: 'box', label: t('box') },
              ]}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('wholesale_price')}>
              <AmountField id="item-sale" value={salePrice} onChange={setSalePrice} label={t('wholesale_price')} />
            </Field>
            <Field label={t('cost_price')}>
              <AmountField id="item-cost" value={costPrice} onChange={setCostPrice} label={t('cost_price')} />
            </Field>
          </div>
          <Field label={t('vat')}>
            <Segmented
              value={taxable ? 'yes' : 'no'}
              onChange={(v) => setTaxable(v === 'yes')}
              options={[
                { value: 'yes', label: t('vat_applies') },
                { value: 'no', label: t('vat_exempt') },
              ]}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('opening_qty')}>
              <QtyField value={openingQty} onChange={setOpeningQty} label={t('opening_qty')} suffix={t(unit)} />
            </Field>
            <Field label={t('low_stock_at')}>
              <QtyField value={lowStockAt} onChange={setLowStockAt} label={t('low_stock_at')} suffix={t(unit)} />
            </Field>
          </div>
        </Panel>
        <FormActions>
          <Button type="button" variant="outline" size="xl" onClick={() => navigate(-1)}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="xl" data-testid="save-item">
            {t('save')}
          </Button>
        </FormActions>
      </form>
    </Page>
  )
}

export function ItemDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, num, money, date, digitsOf } = useLocale()
  const { itemById, stock, bills, adjustments } = useData()
  const item = itemById.get(id)
  const [adjOpen, setAdjOpen] = useState(false)
  const [adjQty, setAdjQty] = useState(0)
  const [adjReason, setAdjReason] = useState('')
  const [adjDate, setAdjDate] = useState(todayIso())

  const moves = useMemo(() => {
    const rows: { id: string; date: string; label: string; qty: number; to?: string }[] = []
    for (const b of bills) {
      if (b.voided) continue
      for (const l of b.lines) {
        if (l.itemId !== id) continue
        const sign = b.kind === 'purchase' || b.kind === 'sale_return' ? 1 : -1
        rows.push({ id: `${b.id}-${l.id}`, date: b.date, label: `${t(b.kind)} · ${digitsOf(b.billNo)} · ${b.partyName}`, qty: sign * l.qty, to: `/bills/${b.id}` })
      }
    }
    for (const a of adjustments) if (a.itemId === id) rows.push({ id: a.id, date: a.date, label: `${t('adjust_stock')} · ${a.reason}`, qty: a.qty })
    return rows.sort((a, b) => b.date.localeCompare(a.date))
  }, [bills, adjustments, id, t, digitsOf])

  if (!item) return <NotFound />
  const qty = stock.get(id) ?? 0

  return (
    <Page
      title={item.name}
      back="/stock"
      actions={
        <Button variant="ghost" size="icon-touch" aria-label={t('edit')} onClick={() => navigate(`/stock/${id}/edit`)}>
          <Pencil />
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Panel className={cn(qty <= item.lowStockAt && 'border-warn bg-warn/10')}>
            <div className="text-sm text-muted-foreground">{t('in_stock')}</div>
            <div className="tabular text-3xl font-bold" data-testid="item-qty">
              {num(qty)} <span className="text-base font-normal">{t(item.unit)}</span>
            </div>
          </Panel>
          <Panel>
            <div className="text-sm text-muted-foreground">{t('wholesale_price')}</div>
            <Amount value={item.salePrice} className="text-xl font-bold" />
          </Panel>
          <Panel>
            <div className="text-sm text-muted-foreground">{t('cost_price')}</div>
            <Amount value={item.costPrice} className="text-xl font-bold" />
          </Panel>
          <Panel>
            <div className="text-sm text-muted-foreground">{t('vat')}</div>
            <div className="text-xl font-bold">{item.taxable ? t('vat_applies') : t('vat_exempt')}</div>
          </Panel>
        </div>
        <Button
          size="xl"
          variant="outline"
          onClick={() => {
            setAdjQty(0)
            setAdjReason('')
            setAdjOpen(true)
          }}
        >
          <SlidersHorizontal />
          {t('adjust_stock')}
        </Button>
        <h2 className="text-lg font-semibold">{t('movements')}</h2>
        {moves.length === 0 ? (
          <EmptyState title={t('nothing_yet')} />
        ) : (
          <div className="flex flex-col divide-y overflow-hidden rounded-2xl border bg-card">
            {moves.map((m) => {
              const row = (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{m.label}</div>
                    <div className="text-sm text-muted-foreground">{date(m.date)}</div>
                  </div>
                  <span className={cn('tabular text-lg font-semibold', m.qty >= 0 ? 'text-good' : 'text-bad')}>
                    {m.qty > 0 ? '+' : ''}
                    {num(m.qty)}
                  </span>
                </>
              )
              return m.to ? (
                <Link key={m.id} to={m.to} className="flex items-center gap-3 px-4 py-3 hover:bg-muted">
                  {row}
                </Link>
              ) : (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  {row}
                </div>
              )
            })}
          </div>
        )}
        <div className="text-sm text-muted-foreground">
          {t('opening_qty')}: {num(item.openingQty)} · {t('low_stock_at')}: {num(item.lowStockAt)}
        </div>
        <HistoryList entityId={item.id} fields={{ salePrice: (v) => money(Number(v ?? 0)), costPrice: (v) => money(Number(v ?? 0)), name: (v) => String(v ?? '') }} />
      </div>
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('adjust_stock')}</DialogTitle>
            <DialogDescription>{t('adjust_hint')}</DialogDescription>
          </DialogHeader>
          <Field label={t('adjust_qty')}>
            <QtyField size="lg" signed value={adjQty} onChange={setAdjQty} label={t('adjust_qty')} suffix={t(item.unit)} />
          </Field>
          <Field label={t('adjust_reason')}>
            <Input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
          </Field>
          <Field label={t('date')}>
            <DateField value={adjDate} onChange={setAdjDate} label={t('date')} />
          </Field>
          <Button
            size="touch"
            disabled={!adjQty}
            onClick={async () => {
              await saveAdjustment({ itemId: id, qty: adjQty, reason: adjReason.trim(), date: adjDate })
              toast.success(t('saved'))
              setAdjOpen(false)
            }}
          >
            {t('save')}
          </Button>
        </DialogContent>
      </Dialog>
    </Page>
  )
}
