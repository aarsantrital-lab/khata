import { describe, expect, it } from 'vitest'
import { apiHeaders, isSecretKey, syncProblem } from './sync'

const jwt = (payload: object) =>
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.sig`

describe('Supabase keys', () => {
  it('sends a publishable key only as apikey, and a legacy anon key in both headers', () => {
    expect(apiHeaders('sb_publishable_abc')).toEqual({ apikey: 'sb_publishable_abc' })
    const anon = jwt({ iss: 'supabase', role: 'anon' })
    expect(apiHeaders(anon)).toEqual({ apikey: anon, Authorization: `Bearer ${anon}` })
  })

  it('spots secret keys of both kinds', () => {
    expect(isSecretKey('sb_secret_abc')).toBe(true)
    expect(isSecretKey(jwt({ iss: 'supabase', role: 'service_role' }))).toBe(true)
    expect(isSecretKey(jwt({ iss: 'supabase', role: 'anon' }))).toBe(false)
    expect(isSecretKey('sb_publishable_abc')).toBe(false)
    expect(isSecretKey('eyJnot-a-jwt')).toBe(false)
  })

  it('explains the usual setup mistakes', () => {
    expect(syncProblem('Failed to fetch')).toBe('sync_unreachable')
    expect(syncProblem('Load failed')).toBe('sync_unreachable')
    expect(syncProblem('401 {"message":"Invalid API key"}')).toBe('sync_bad_key')
    expect(syncProblem('404 {"code":"PGRST202","message":"Could not find the function public.khata_pull(p_limit, p_shop, p_since)"}')).toBe(
      'sync_no_schema',
    )
    expect(syncProblem('500 boom')).toBeNull()
  })
})
