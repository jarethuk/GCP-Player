/**
 * The IndexedDB database: the browser's equivalent of the phones' SwiftData
 * and Room stores, and like them the thing the app reads. The API is only
 * ever asked what changed.
 *
 * Three stores:
 *
 *   shows      keyed by slug
 *   episodes   keyed by guid, indexed by show
 *   meta       small values by name — the shows cursor, the last episode
 *              played, the Patreon credential
 */

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { Episode, PatreonCredential, Show } from './types'

export interface MetaValues {
  /** The shows delta's cursor: the `syncedAt` of the last shows response. */
  showsSyncedAt: string
  /** Set once this browser has fetched the catalogue with Patreon in it. */
  catalogueIncludesPatreon: boolean
  /** So the mini player comes back where the listener left it. */
  lastPlayedEpisodeGuid: string
  patreonCredential: PatreonCredential
}

export type MetaKey = keyof MetaValues

interface Schema extends DBSchema {
  shows: { key: string; value: Show }
  episodes: { key: string; value: Episode; indexes: { showSlug: string } }
  meta: { key: MetaKey; value: MetaValues[MetaKey] }
}

export type Database = IDBPDatabase<Schema>

const NAME = 'gcp-player'
const VERSION = 1

export function openDatabase(name = NAME): Promise<Database> {
  return openDB<Schema>(name, VERSION, {
    upgrade(db) {
      db.createObjectStore('shows', { keyPath: 'slug' })
      const episodes = db.createObjectStore('episodes', { keyPath: 'guid' })
      episodes.createIndex('showSlug', 'showSlug')
      db.createObjectStore('meta')
    },
  })
}

export async function getMeta<K extends MetaKey>(
  db: Database,
  key: K,
): Promise<MetaValues[K] | undefined> {
  return (await db.get('meta', key)) as MetaValues[K] | undefined
}

export async function setMeta<K extends MetaKey>(
  db: Database,
  key: K,
  value: MetaValues[K],
): Promise<void> {
  await db.put('meta', value, key)
}

export async function deleteMeta(db: Database, key: MetaKey): Promise<void> {
  await db.delete('meta', key)
}
