import type { ReactNode } from 'react'
import { useLocale } from '@/app/locale'
import type { BillStatus } from '@/lib/ledger'
import type { Settings } from '@/lib/types'
import { cn } from '@/lib/utils'

export function DocHeader({ settings, title, right }: { settings: Settings; title: string; right?: ReactNode }) {
  const { t, digitsOf } = useLocale()
  return (
    <div className="flex items-start gap-4 border-b-2 border-[#0f766e] pb-4">
      {settings.logo && <img src={settings.logo} alt="" className="size-20 object-contain" />}
      <div className="min-w-0 flex-1">
        <div className="text-[26px] leading-tight font-bold text-[#0f4f4a]">{settings.shopName}</div>
        {settings.address && <div className="text-[15px]">{settings.address}</div>}
        <div className="text-[15px]">
          {settings.phone && <span>{digitsOf(settings.phone)}</span>}
          {settings.pan && (
            <span className="ml-3 font-semibold">
              {t('shop_pan')}: {digitsOf(settings.pan)}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="inline-block rounded-md bg-[#0f766e] px-3 py-1 text-[18px] font-bold text-white">{title}</div>
        {right}
      </div>
    </div>
  )
}

export function Stamp({ status, className }: { status: BillStatus; className?: string }) {
  const { t } = useLocale()
  const color = status === 'paid' ? '#15803d' : status === 'partial' ? '#b45309' : '#b91c1c'
  const label = status === 'paid' ? t('stamp_paid') : status === 'partial' ? t('stamp_partial') : t('stamp_unpaid')
  return (
    <div
      className={cn('inline-block -rotate-12 rounded-lg border-[3px] px-4 py-1 text-[26px] font-extrabold tracking-wider', className)}
      style={{ color, borderColor: color, opacity: 0.85 }}
      data-stamp={status}
    >
      {label}
    </div>
  )
}

export function Signature({ settings }: { settings: Settings }) {
  const { t } = useLocale()
  return (
    <div className="flex w-48 flex-col items-center">
      <div className="flex h-16 items-end justify-center">
        {settings.signature && <img src={settings.signature} alt="" className="max-h-16 max-w-44 object-contain" />}
      </div>
      <div className="w-full border-t border-[#333] pt-1 text-center text-[14px]">{t('signature')}</div>
    </div>
  )
}

export const th = 'border border-[#cbd5d1] bg-[#eef6f5] px-2 py-1.5 text-left text-[14px] font-semibold'
export const td = 'border border-[#cbd5d1] px-2 py-1.5 text-[14px] align-top'
export const tdNum = `${td} text-right tabular whitespace-nowrap`
