import { toLatinDigits } from './money'
import { digitsOnly, phoneKey } from './search'
import type { Party } from './types'

/** Phones are kept with Latin digits, whatever keyboard they were typed on. */
export function cleanPhone(s: string): string {
  return toLatinDigits(s).trim().replace(/\s+/g, ' ')
}

/** PANs are kept as Latin digits without spaces. */
export function cleanPan(s: string): string {
  return toLatinDigits(s).replace(/\s+/g, '')
}

export interface PartyDuplicates {
  pan?: Party
  phone?: Party
}

/** Another saved party that already has this PAN or phone number, if any. */
export function findDuplicates(parties: Party[], draft: { id?: string; pan: string; phone: string }): PartyDuplicates {
  const pan = digitsOnly(draft.pan)
  const phone = phoneKey(draft.phone)
  const others = parties.filter((p) => p.id !== draft.id && !p.archived)
  return {
    pan: pan.length >= 5 ? others.find((p) => digitsOnly(p.pan) === pan) : undefined,
    phone: phone.length >= 6 ? others.find((p) => phoneKey(p.phone) === phone) : undefined,
  }
}
