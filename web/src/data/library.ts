/**
 * The catalogue and this browser's listening state, held in memory and
 * written through to IndexedDB.
 *
 * The phones read a database that tells the screens when it changes
 * (SwiftData's @Query, Room's Flows). IndexedDB can't do that, and at this
 * size it doesn't have to: 32 shows and ~1,300 episodes load in one go at
 * start, every read is from memory, and every write lands in memory first —
 * so the screen moves at once — then in IndexedDB.
 *
 * The snapshot is immutable. A write replaces the records it touches, and the
 * per-show episode lists of only the shows it touches, so a screen can tell
 * what changed by identity.
 *
 * Two tabs share one database, so each tells the other what it wrote over a
 * BroadcastChannel, and the other reads those rows back.
 */

import { type Database, deleteMeta, getMeta, type MetaKey, type MetaValues, setMeta } from './db'
import type { Episode, PatreonCredential, Show } from './types'

export interface Snapshot {
  readonly shows: ReadonlyMap<string, Show>
  readonly episodes: ReadonlyMap<string, Episode>
  /** Each show's episodes, unsorted. A show with none has no entry. */
  readonly episodesByShow: ReadonlyMap<string, readonly Episode[]>
  /** The patron's Patreon feed token, or null. See patreon/account.ts. */
  readonly patreonToken: string | null
}

export interface Changes {
  putShows?: readonly Show[]
  putEpisodes?: readonly Episode[]
  deleteShows?: readonly string[]
  deleteEpisodes?: readonly string[]
}

interface Broadcast {
  shows: string[]
  episodes: string[]
  meta: MetaKey[]
  cleared: boolean
}

const NO_EPISODES: readonly Episode[] = []

export class Library {
  private snapshot: Snapshot
  private readonly listeners = new Set<() => void>()
  private readonly channel: BroadcastChannel | null
  /** IndexedDB writes, in the order they were made. */
  private queue: Promise<void> = Promise.resolve()

  private constructor(
    readonly db: Database,
    shows: Show[],
    episodes: Episode[],
    credential: PatreonCredential | undefined,
  ) {
    this.snapshot = {
      shows: new Map(shows.map((show) => [show.slug, show])),
      episodes: new Map(episodes.map((episode) => [episode.guid, episode])),
      episodesByShow: groupByShow(episodes),
      patreonToken: credential?.token ?? null,
    }
    this.channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`${db.name}:changes`)
    this.channel?.addEventListener('message', (event: MessageEvent<Broadcast>) => {
      void this.receive(event.data)
    })
  }

  static async open(db: Database): Promise<Library> {
    const [shows, episodes, credential] = await Promise.all([
      db.getAll('shows'),
      db.getAll('episodes'),
      getMeta(db, 'patreonCredential'),
    ])
    return new Library(db, shows, episodes, credential)
  }

  // -- Reading -------------------------------------------------------------

  readonly getSnapshot = (): Snapshot => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  episodesOf(slug: string): readonly Episode[] {
    return this.snapshot.episodesByShow.get(slug) ?? NO_EPISODES
  }

  // -- Writing -------------------------------------------------------------

  /** Applies `changes` in memory at once, then in IndexedDB as one transaction. */
  write(changes: Changes): Promise<void> {
    const touched = this.apply(changes)
    if (!touched) return this.queue
    const { putShows = [], putEpisodes = [], deleteShows = [], deleteEpisodes = [] } = changes
    return this.persist(async () => {
      const tx = this.db.transaction(['shows', 'episodes'], 'readwrite')
      const shows = tx.objectStore('shows')
      const episodes = tx.objectStore('episodes')
      await Promise.all([
        ...deleteEpisodes.map((guid) => episodes.delete(guid)),
        ...deleteShows.map((slug) => shows.delete(slug)),
        ...putShows.map((show) => shows.put(show)),
        ...putEpisodes.map((episode) => episodes.put(episode)),
        tx.done,
      ])
      this.broadcast({
        shows: [...putShows.map((show) => show.slug), ...deleteShows],
        episodes: [...putEpisodes.map((episode) => episode.guid), ...deleteEpisodes],
        meta: [],
        cleared: false,
      })
    })
  }

  updateEpisode(guid: string, patch: Partial<Episode>): Promise<void> {
    const episode = this.snapshot.episodes.get(guid)
    if (!episode) return this.queue
    return this.write({ putEpisodes: [{ ...episode, ...patch }] })
  }

  updateShow(slug: string, patch: Partial<Show>): Promise<void> {
    const show = this.snapshot.shows.get(slug)
    if (!show) return this.queue
    return this.write({ putShows: [{ ...show, ...patch }] })
  }

  /** Every show and episode, gone — in memory and on disk. Meta is the caller's to clear. */
  clear(): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      shows: new Map(),
      episodes: new Map(),
      episodesByShow: new Map(),
    }
    this.emit()
    return this.persist(async () => {
      const tx = this.db.transaction(['shows', 'episodes'], 'readwrite')
      await Promise.all([
        tx.objectStore('shows').clear(),
        tx.objectStore('episodes').clear(),
        tx.done,
      ])
      this.broadcast({ shows: [], episodes: [], meta: [], cleared: true })
    })
  }

  // -- Meta ----------------------------------------------------------------

  getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined> {
    return this.queue.then(() => getMeta(this.db, key))
  }

  setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void> {
    if (key === 'patreonCredential') this.adoptCredential(value as PatreonCredential)
    return this.persist(async () => {
      await setMeta(this.db, key, value)
      this.broadcast({ shows: [], episodes: [], meta: [key], cleared: false })
    })
  }

  deleteMeta(key: MetaKey): Promise<void> {
    if (key === 'patreonCredential') this.adoptCredential(undefined)
    return this.persist(async () => {
      await deleteMeta(this.db, key)
      this.broadcast({ shows: [], episodes: [], meta: [key], cleared: false })
    })
  }

  /** Resolves once everything written so far is in IndexedDB. */
  flushed(): Promise<void> {
    return this.queue
  }

  close(): void {
    this.channel?.close()
  }

  // -- Internals -----------------------------------------------------------

  private adoptCredential(credential: PatreonCredential | undefined): void {
    const token = credential?.token ?? null
    if (token === this.snapshot.patreonToken) return
    this.snapshot = { ...this.snapshot, patreonToken: token }
    this.emit()
  }

  /** The in-memory half of a write. False if it changed nothing. */
  private apply(changes: Changes): boolean {
    const { putShows = [], putEpisodes = [], deleteShows = [], deleteEpisodes = [] } = changes
    if (!putShows.length && !putEpisodes.length && !deleteShows.length && !deleteEpisodes.length) {
      return false
    }

    const shows = new Map(this.snapshot.shows)
    for (const slug of deleteShows) shows.delete(slug)
    for (const show of putShows) shows.set(show.slug, show)

    let episodes = this.snapshot.episodes
    let episodesByShow = this.snapshot.episodesByShow
    if (putEpisodes.length || deleteEpisodes.length) {
      const next = new Map(episodes)
      // Both the show an episode was in and the one it is in now: an episode
      // can be re-attributed on the server.
      const affected = new Set<string>()
      for (const guid of deleteEpisodes) {
        const slug = next.get(guid)?.showSlug
        if (slug) affected.add(slug)
        next.delete(guid)
      }
      for (const episode of putEpisodes) {
        const previous = next.get(episode.guid)?.showSlug
        if (previous) affected.add(previous)
        if (episode.showSlug) affected.add(episode.showSlug)
        next.set(episode.guid, episode)
      }
      episodes = next
      episodesByShow = regroup(episodesByShow, next, affected)
    }

    this.snapshot = { ...this.snapshot, shows, episodes, episodesByShow }
    this.emit()
    return true
  }

  private persist(work: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(work).catch((error: unknown) => {
      console.error('[library] write failed', error)
    })
    return this.queue
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private broadcast(message: Broadcast): void {
    this.channel?.postMessage(message)
  }

  /** Another tab wrote: read what it wrote back from IndexedDB. */
  private async receive(message: Broadcast): Promise<void> {
    if (message.cleared) {
      const [shows, episodes] = await Promise.all([
        this.db.getAll('shows'),
        this.db.getAll('episodes'),
      ])
      this.snapshot = {
        ...this.snapshot,
        shows: new Map(shows.map((show) => [show.slug, show])),
        episodes: new Map(episodes.map((episode) => [episode.guid, episode])),
        episodesByShow: groupByShow(episodes),
      }
      this.emit()
      return
    }

    const [shows, episodes] = await Promise.all([
      Promise.all(
        message.shows.map(async (slug) => [slug, await this.db.get('shows', slug)] as const),
      ),
      Promise.all(
        message.episodes.map(async (guid) => [guid, await this.db.get('episodes', guid)] as const),
      ),
    ])
    this.apply({
      putShows: shows.flatMap(([, show]) => (show ? [show] : [])),
      deleteShows: shows.flatMap(([slug, show]) => (show ? [] : [slug])),
      putEpisodes: episodes.flatMap(([, episode]) => (episode ? [episode] : [])),
      deleteEpisodes: episodes.flatMap(([guid, episode]) => (episode ? [] : [guid])),
    })
    if (message.meta.includes('patreonCredential')) {
      this.adoptCredential(await getMeta(this.db, 'patreonCredential'))
    }
  }
}

function groupByShow(episodes: Iterable<Episode>): Map<string, Episode[]> {
  const grouped = new Map<string, Episode[]>()
  for (const episode of episodes) {
    if (!episode.showSlug) continue
    const list = grouped.get(episode.showSlug)
    if (list) list.push(episode)
    else grouped.set(episode.showSlug, [episode])
  }
  return grouped
}

/** Rebuilds only the affected shows' lists; every other list keeps its identity. */
function regroup(
  previous: ReadonlyMap<string, readonly Episode[]>,
  episodes: ReadonlyMap<string, Episode>,
  affected: Set<string>,
): ReadonlyMap<string, readonly Episode[]> {
  if (!affected.size) return previous
  const next = new Map(previous)
  const rebuilt = new Map<string, Episode[]>([...affected].map((slug) => [slug, []]))
  for (const episode of episodes.values()) {
    if (episode.showSlug) rebuilt.get(episode.showSlug)?.push(episode)
  }
  for (const [slug, list] of rebuilt) {
    if (list.length) next.set(slug, list)
    else next.delete(slug)
  }
  return next
}
