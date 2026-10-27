import { db } from './db'
import { base64ToBytes, bytesToBase64 } from './photo'
import { SYNC_TABLES, type Base, type TableName } from './types'

export interface BackupFile {
  app: 'khata'
  version: 1
  exportedAt: number
  tables: Partial<Record<TableName, Base[]>>
  /** Bill photo images, base64. Missing in backups made before bill photos existed. */
  files?: { id: string; type: string; data: string }[]
}

export async function createBackup(): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {}
  for (const name of SYNC_TABLES) tables[name] = (await db.table(name).toArray()) as Base[]
  const files = (await db.photoFiles.toArray()).map((f) => ({ id: f.id, type: f.type, data: bytesToBase64(f.data) }))
  return { app: 'khata', version: 1, exportedAt: Date.now(), tables, files }
}

export async function backupBlob(): Promise<Blob> {
  return new Blob([JSON.stringify(await createBackup())], { type: 'application/json' })
}

export function parseBackup(text: string): BackupFile {
  const data = JSON.parse(text) as BackupFile
  if (data?.app !== 'khata' || data.version !== 1 || typeof data.tables !== 'object') throw new Error('not_a_backup')
  return data
}

/**
 * Restoring merges rather than replaces: a row from the file is only written when it is
 * newer than the copy on this device, so restoring an old backup never loses recent work.
 */
export async function restoreBackup(
  backup: BackupFile,
): Promise<{ added: number; updated: number; skipped: number; photos: number }> {
  let added = 0
  let updated = 0
  let skipped = 0
  let photos = 0
  const now = Date.now()
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.outbox, db.photoFiles], async () => {
    for (const file of backup.files ?? []) {
      if (!file?.id || typeof file.data !== 'string' || (await db.photoFiles.get(file.id))) continue
      await db.photoFiles.put({ id: file.id, type: file.type, data: base64ToBytes(file.data), uploaded: 0 })
      photos++
    }
    for (const name of SYNC_TABLES) {
      const rows = backup.tables[name] ?? []
      const table = db.table(name)
      for (const row of rows) {
        if (!row?.id) continue
        const local = (await table.get(row.id)) as Base | undefined
        if (local && local.updatedAt >= row.updatedAt) {
          skipped++
          continue
        }
        await table.put(row)
        await db.outbox.put({ key: `${name}:${row.id}`, table: name, id: row.id, at: now })
        if (local) updated++
        else added++
      }
    }
  })
  return { added, updated, skipped, photos }
}

export async function eraseAllData() {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.table(t)), db.outbox, db.meta, db.photoFiles], async () => {
    for (const name of SYNC_TABLES) await db.table(name).clear()
    await db.outbox.clear()
    await db.photoFiles.clear()
    await db.meta.clear()
  })
}
