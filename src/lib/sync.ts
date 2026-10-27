import { db, getMeta, setMeta } from './db'
import { base64ToBytes, bytesToBase64 } from './photo'
import { onLocalChange } from './repo'
import { SYNC_TABLES, type Base, type TableName } from './types'

export interface PushRow {
  tbl: TableName
  id: string
  data: unknown
  updated_at: number
}

export interface RemoteRow extends PushRow {
  server_seq: number
}

export interface Transport {
  push(shopId: string, rows: PushRow[]): Promise<void>
  pull(shopId: string, since: number, limit: number): Promise<RemoteRow[]>
  /** Stores a bill photo's image. Storing the same id again is a no-op. */
  putPhoto(shopId: string, id: string, type: string, base64: string): Promise<void>
  getPhoto(shopId: string, id: string): Promise<{ type: string; data: string } | null>
}

/** The server's refusal for an image over its size cap; such photos stay on this device only. */
export const PHOTO_TOO_LARGE = 'photo_too_large'

export interface SyncConfig {
  url: string
  anonKey: string
  code: string
}

const PULL_LIMIT = 500
const PUSH_BATCH = 200

const ENV_URL = (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? ''
const ENV_KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

/** Publishable keys (sb_publishable_…) are not JWTs, so only the legacy anon key also goes in Authorization. */
export function apiHeaders(key: string): Record<string, string> {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` }
}

/** Keys that bypass Row Level Security. A web page is public, so these must never be put in the app. */
export function isSecretKey(key: string): boolean {
  const k = key.trim()
  if (k.startsWith('sb_secret_')) return true
  const payload = k.startsWith('eyJ') ? k.split('.')[1] : undefined
  if (!payload) return false
  try {
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'
  } catch {
    return false
  }
}

/** Names the usual setup mistakes behind a failed sync call, so the message says what to fix. */
export function syncProblem(message: string): 'sync_unreachable' | 'sync_bad_key' | 'sync_no_schema' | null {
  if (/failed to fetch|load failed|networkerror/i.test(message)) return 'sync_unreachable'
  if (/^40[13]\b/.test(message) && /api key|apikey|jwt|unauthori[sz]ed/i.test(message)) return 'sync_bad_key'
  if (/^404\b/.test(message) && /khata_/.test(message)) return 'sync_no_schema'
  return null
}

/** Talks to the SQL functions in supabase/schema.sql through Supabase's REST endpoint. */
export function supabaseTransport(url: string, anonKey: string): Transport {
  const base = url.replace(/\/+$/, '')
  const rpc = async (fn: string, body: unknown) => {
    const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...apiHeaders(anonKey.trim()), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim())
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  return {
    async push(shopId, rows) {
      await rpc('khata_push', { p_shop: shopId, p_rows: rows })
    },
    async pull(shopId, since, limit) {
      const rows = (await rpc('khata_pull', { p_shop: shopId, p_since: since, p_limit: limit })) as RemoteRow[] | null
      return (rows ?? []).map((r) => ({ ...r, updated_at: Number(r.updated_at), server_seq: Number(r.server_seq) }))
    },
    async putPhoto(shopId, id, type, base64) {
      await rpc('khata_photo_put', { p_shop: shopId, p_id: id, p_type: type, p_data: base64 })
    },
    async getPhoto(shopId, id) {
      const rows = (await rpc('khata_photo_get', { p_shop: shopId, p_id: id })) as { type: string; data: string }[] | null
      return rows?.[0] ?? null
    },
  }
}

export async function shopIdFromCode(code: string): Promise<string> {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const bytes = new TextEncoder().encode(`khata:${normalized}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  return chars.match(/.{4}/g)!.join('-')
}

export async function pendingCount(): Promise<number> {
  return (await db.outbox.count()) + (await db.photoFiles.where('uploaded').equals(0).count())
}

/** Uploads photo images taken on this device. Runs after the rows sync, so other devices know the photo exists. */
export async function uploadPhotos(transport: Transport, shopId: string): Promise<{ uploaded: number; refused: number }> {
  let uploaded = 0
  let refused = 0
  const waiting = await db.photoFiles.where('uploaded').equals(0).primaryKeys()
  for (const id of waiting) {
    const file = await db.photoFiles.get(id)
    if (!file || file.uploaded !== 0) continue
    try {
      await transport.putPhoto(shopId, id, file.type, bytesToBase64(file.data))
      await db.photoFiles.update(id, { uploaded: 1 })
      uploaded++
    } catch (err) {
      if (!(err instanceof Error && err.message.includes(PHOTO_TOO_LARGE))) throw err
      await db.photoFiles.update(id, { uploaded: 2 })
      refused++
    }
  }
  return { uploaded, refused }
}

/** Downloads one photo's image from the sync server and keeps it on this device. */
export async function downloadPhoto(transport: Transport, shopId: string, id: string): Promise<boolean> {
  const remote = await transport.getPhoto(shopId, id)
  if (!remote) return false
  await db.photoFiles.put({ id, type: remote.type, data: base64ToBytes(remote.data), uploaded: 1 })
  return true
}

export type PhotoLoad = { state: 'ready'; blob: Blob } | { state: 'missing' } | { state: 'error'; error: string }

/** The image for a photo: from this device, else from the sync server when one is set up. */
export async function loadPhoto(id: string): Promise<PhotoLoad> {
  const local = await db.photoFiles.get(id)
  if (local) return { state: 'ready', blob: new Blob([local.data as BlobPart], { type: local.type }) }
  const config = await getSyncConfig()
  if (!config) return { state: 'missing' }
  try {
    const found = await downloadPhoto(supabaseTransport(config.url, config.anonKey), await shopIdFromCode(config.code), id)
    const file = found ? await db.photoFiles.get(id) : undefined
    return file ? { state: 'ready', blob: new Blob([file.data as BlobPart], { type: file.type }) } : { state: 'missing' }
  } catch (err) {
    return { state: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

/** Pushes local changes, then pulls everything newer from the server. Last write wins per row. */
export async function syncOnce(transport: Transport, shopId: string): Promise<{ pushed: number; pulled: number }> {
  let pushed = 0
  const outbox = await db.outbox.orderBy('at').toArray()
  for (let i = 0; i < outbox.length; i += PUSH_BATCH) {
    const batch = outbox.slice(i, i + PUSH_BATCH)
    const rows: PushRow[] = []
    for (const entry of batch) {
      const data = (await db.table(entry.table).get(entry.id)) as Base | undefined
      if (data) rows.push({ tbl: entry.table, id: entry.id, data, updated_at: data.updatedAt })
    }
    if (rows.length) await transport.push(shopId, rows)
    await db.transaction('rw', db.outbox, async () => {
      for (const entry of batch) {
        const current = await db.outbox.get(entry.key)
        if (current && current.at === entry.at) await db.outbox.delete(entry.key)
      }
    })
    pushed += rows.length
  }

  let pulled = 0
  let since = await getMeta<number>(`sync.seq.${shopId}`, 0)
  for (;;) {
    const rows = await transport.pull(shopId, since, PULL_LIMIT)
    if (!rows.length) break
    await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
      for (const row of rows) {
        if (!SYNC_TABLES.includes(row.tbl)) continue
        const table = db.table(row.tbl)
        const local = (await table.get(row.id)) as Base | undefined
        if (!local || local.updatedAt < row.updated_at) {
          await table.put(row.data)
          pulled++
        }
      }
    })
    since = Math.max(since, ...rows.map((r) => r.server_seq))
    await setMeta(`sync.seq.${shopId}`, since)
    if (rows.length < PULL_LIMIT) break
  }
  return { pushed, pulled }
}

/**
 * Prepares this device to join a shop that another device already syncs. Fails with
 * `sync_code_not_found` when the server has nothing for the code. A device holding only
 * setup data (no parties, bills, payments or entries) drops it so the shop's own accounts
 * and settings come down instead of being duplicated or overwritten.
 */
export async function prepareJoin(transport: Transport, shopId: string): Promise<{ cleared: boolean }> {
  const probe = await transport.pull(shopId, 0, 1)
  if (!probe.length) throw new Error('sync_code_not_found')
  const counts = await Promise.all([
    db.parties.count(),
    db.bills.count(),
    db.payments.count(),
    db.entries.count(),
    db.transfers.count(),
    db.photos.count(),
  ])
  if (counts.some((n) => n > 0)) return { cleared: false }
  await db.transaction('rw', [db.accounts, db.items, db.adjustments, db.bankChecks, db.history, db.settings, db.outbox], async () => {
    await Promise.all([db.accounts.clear(), db.items.clear(), db.adjustments.clear(), db.bankChecks.clear(), db.history.clear(), db.outbox.clear()])
    await db.settings.toCollection().modify((s) => {
      s.updatedAt = 0
    })
  })
  return { cleared: true }
}

/** Reads one empty page for the shop: proves the URL, the key and the SQL functions all work. */
export async function checkServer(server: { url: string; anonKey: string }, shopId: string): Promise<void> {
  await supabaseTransport(server.url, server.anonKey).pull(shopId, 0, 1)
}

export function effectiveServer(stored: Partial<SyncConfig>): { url: string; anonKey: string } | null {
  const url = stored.url || ENV_URL
  const anonKey = stored.anonKey || ENV_KEY
  return url && anonKey ? { url, anonKey } : null
}

// ---------------------------------------------------------------- Background sync manager

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncStatus {
  state: SyncState
  pending: number
  lastSyncAt?: number
  error?: string
  /** Records synced but photo images did not, e.g. the server lacks the photo functions. */
  photoError?: string
}

export async function getSyncConfig(): Promise<SyncConfig | null> {
  const stored = await getMeta<Partial<SyncConfig> | null>('sync.config', null)
  const url = stored?.url || ENV_URL
  const anonKey = stored?.anonKey || ENV_KEY
  if (!stored?.code || !url || !anonKey) return null
  return { url, anonKey, code: stored.code }
}

export async function getStoredSyncConfig(): Promise<Partial<SyncConfig>> {
  const stored = await getMeta<Partial<SyncConfig> | null>('sync.config', null)
  return { url: stored?.url ?? '', anonKey: stored?.anonKey ?? '', code: stored?.code ?? '' }
}

export const hasBuiltInSupabase = () => Boolean(ENV_URL && ENV_KEY)

export async function setSyncConfig(config: Partial<SyncConfig> | null) {
  await setMeta('sync.config', config)
  void syncManager.run()
}

class SyncManager {
  status: SyncStatus = { state: 'off', pending: 0 }
  private subs = new Set<(s: SyncStatus) => void>()
  private running = false
  private again = false
  private timer?: ReturnType<typeof setTimeout>
  private started = false

  subscribe(fn: (s: SyncStatus) => void) {
    this.subs.add(fn)
    fn(this.status)
    return () => {
      this.subs.delete(fn)
    }
  }

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch }
    for (const fn of this.subs) fn(this.status)
  }

  start() {
    if (this.started || typeof window === 'undefined') return
    this.started = true
    onLocalChange(() => {
      void this.refreshPending()
      clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.run(), 2000)
    })
    window.addEventListener('online', () => void this.run())
    window.addEventListener('offline', () => this.set({ state: 'offline' }))
    setInterval(() => void this.run(), 60_000)
    void this.run()
  }

  async refreshPending() {
    this.set({ pending: await pendingCount() })
  }

  async run(): Promise<void> {
    if (this.running) {
      this.again = true
      return
    }
    this.running = true
    try {
      await this.refreshPending()
      const config = await getSyncConfig()
      if (!config) {
        this.set({ state: 'off', error: undefined })
        return
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.set({ state: 'offline' })
        return
      }
      this.set({ state: 'syncing' })
      const transport = supabaseTransport(config.url, config.anonKey)
      const shopId = await shopIdFromCode(config.code)
      await syncOnce(transport, shopId)
      let photoError: string | undefined
      try {
        await uploadPhotos(transport, shopId)
      } catch (err) {
        photoError = err instanceof Error ? err.message : String(err)
      }
      this.set({ state: 'idle', lastSyncAt: Date.now(), error: undefined, photoError, pending: await pendingCount() })
    } catch (err) {
      this.set({ state: 'error', error: err instanceof Error ? err.message : String(err) })
    } finally {
      this.running = false
      if (this.again) {
        this.again = false
        void this.run()
      }
    }
  }
}

export const syncManager = new SyncManager()
