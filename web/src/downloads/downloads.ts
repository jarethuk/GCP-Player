/**
 * Keeps episode audio in this browser so playback doesn't need the network.
 * The web port of iOS/GCP Player/DownloadManager.swift.
 *
 * The files live in Cache Storage, one entry per episode under a made-up
 * same-origin URL: Cache Storage writes a streamed response to disk as it
 * arrives, where IndexedDB would want the whole 80 MB in memory first. The
 * row in the library says when it landed; the cache holds the bytes. Either
 * can go without the other — the browser can evict the cache, a sync can
 * delete the row — so the player checks the cache before believing the row,
 * and the launch sweep deletes files no row claims.
 *
 * Unlike the phones, nothing downloads in the background: a download runs
 * while a page of the app is open, and one cut off by closing it starts over.
 */

import type { SettingKey } from '../app/settings'
import type { Library } from '../data/library'
import { isDownloaded, isLocked, playsFromPatreon } from '../data/logic'
import type { Episode } from '../data/types'
import type { PatreonFeeds } from '../patreon/feeds'

/** Kept apart from the service worker's own cache, which it clears on every update. */
export const AUDIO_CACHE = 'gcp-player-audio'

/** Downloads older than this are swept, heard or not. */
export const MAXIMUM_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** The Network Information API: Chrome on Android says which network it's on; Safari doesn't. */
interface Connection extends EventTarget {
  readonly type?: string
}

function connection(): Connection | undefined {
  return (navigator as Navigator & { connection?: Connection }).connection
}

/** Whether this browser says when it's on mobile data. Elsewhere "Wi-Fi only" can't be kept. */
export function canTellNetworkType(): boolean {
  return typeof connection()?.type === 'string'
}

function onMobileData(): boolean {
  return connection()?.type === 'cellular'
}

/** Where an episode's file sits in the cache. Never fetched: nothing serves it. */
function keyFor(guid: string): string {
  return new URL(`/offline-audio/${encodeURIComponent(guid)}`, self.location.origin).href
}

export class Downloads {
  /** Fraction complete per episode guid, present only while a download is under way. */
  private progress: ReadonlyMap<string, number> = new Map()
  private readonly listeners = new Set<() => void>()
  /** Cancels a download in flight. */
  private readonly running = new Map<string, AbortController>()
  /** Asked for on mobile data with "Wi-Fi only" on, by guid: whether by hand. */
  private readonly waitingForWifi = new Map<string, boolean>()
  /** The file handed to the player last, released when the next one is. */
  private objectUrl: string | null = null
  /** The episodes as last seen, to notice one becoming played. */
  private seen: ReadonlyMap<string, Episode>

  constructor(
    private readonly library: Library,
    private readonly feeds: PatreonFeeds,
    private readonly setting: (key: SettingKey) => boolean,
    private readonly storage: CacheStorage | null = typeof caches === 'undefined' ? null : caches,
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {
    this.seen = library.getSnapshot().episodes
    // Hearing an episode frees its file, as marking it played does on the phones.
    library.subscribe(() => this.releasePlayed())
    connection()?.addEventListener('change', () => this.resumeWaiting())
  }

  /** False where the browser has no Cache Storage (an insecure origin, an old browser). */
  get isAvailable(): boolean {
    return this.storage !== null && typeof TransformStream !== 'undefined'
  }

  // -- Observing ---------------------------------------------------------------

  readonly getProgress = (): ReadonlyMap<string, number> => this.progress

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  isDownloading(guid: string): boolean {
    return this.progress.has(guid)
  }

  private setProgress(guid: string, fraction: number | null): void {
    const next = new Map(this.progress)
    if (fraction === null) {
      if (!next.delete(guid)) return
    } else {
      next.set(guid, fraction)
    }
    this.progress = next
    for (const listener of this.listeners) listener()
  }

  // -- Reading -----------------------------------------------------------------

  /**
   * A playable URL for the downloaded file, or null when the episode isn't
   * downloaded. Checks the cache really has it: the row can outlive the file
   * when the browser evicts the cache, and then the row is put right.
   */
  async localUrl(episode: Episode): Promise<string | null> {
    if (!isDownloaded(episode) || !this.storage) return null
    let response: Response | undefined
    try {
      response = await (await this.storage.open(AUDIO_CACHE)).match(keyFor(episode.guid))
    } catch {
      response = undefined
    }
    if (!response) {
      void this.forget(episode.guid)
      return null
    }
    const blob = await response.blob()
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = URL.createObjectURL(blob)
    return this.objectUrl
  }

  // -- Fetching ----------------------------------------------------------------

  /**
   * Starts a download unless the episode is already held or already
   * downloading. Automatic downloads also skip anything already heard; a
   * request made by hand doesn't — wanting a second listen is a perfectly good
   * reason to keep a file.
   */
  download(guid: string, { manual = false } = {}): void {
    const snapshot = this.library.getSnapshot()
    const episode = snapshot.episodes.get(guid)
    if (
      !episode ||
      !this.isAvailable ||
      isLocked(episode, snapshot.patreonToken !== null) ||
      (!manual && episode.isPlayed) ||
      isDownloaded(episode) ||
      this.progress.has(guid)
    ) {
      return
    }

    // The phones hold a download barred from cellular until Wi-Fi comes back;
    // so does this, for as long as the page is open.
    this.setProgress(guid, 0)
    if (this.setting('downloadOverWiFiOnly') && onMobileData()) {
      this.waitingForWifi.set(guid, manual)
      return
    }
    this.start(guid, manual)
  }

  private start(guid: string, manual: boolean): void {
    const controller = new AbortController()
    this.running.set(guid, controller)
    void this.fetchAndStore(guid, manual, controller.signal).finally(() => {
      if (this.running.get(guid) !== controller) return
      this.running.delete(guid)
      this.setProgress(guid, null)
    })
  }

  private resumeWaiting(): void {
    if (onMobileData()) return
    const waiting = [...this.waitingForWifi]
    this.waitingForWifi.clear()
    for (const [guid, manual] of waiting) this.start(guid, manual)
  }

  private async fetchAndStore(guid: string, manual: boolean, signal: AbortSignal): Promise<void> {
    const episode = this.library.getSnapshot().episodes.get(guid)
    if (!episode || !this.storage) return
    const cache = await this.storage.open(AUDIO_CACHE)

    for (const url of await this.sources(episode)) {
      if (signal.aborted) return
      try {
        await this.store(cache, guid, url, signal)
      } catch (error) {
        if (signal.aborted) return
        console.warn(`[downloads] ${episode.title} from ${new URL(url).host} failed`, error)
        continue
      }

      const latest = this.library.getSnapshot().episodes.get(guid)
      // Removed while it downloaded, its row deleted by a sync, or heard to
      // the end in the meantime: nothing should keep it.
      if (signal.aborted || !latest || (latest.isPlayed && !manual)) {
        await cache.delete(keyFor(guid))
        return
      }
      await this.library.updateEpisode(guid, { downloadedAt: Date.now(), downloadIsManual: manual })
      console.info(`[downloads] ${episode.title} downloaded`)
      return
    }
  }

  /**
   * Where to fetch from, best first. With a Patreon token, Patreon's ad-free
   * copy, whose URL comes from the patron's feed — then the public copy, if
   * Patreon won't answer or won't let the browser read its file.
   */
  private async sources(episode: Episode): Promise<string[]> {
    const snapshot = this.library.getSnapshot()
    const token = snapshot.patreonToken
    const urls: string[] = []
    if (playsFromPatreon(episode, token !== null) && token) {
      const showId = episode.showSlug ? snapshot.shows.get(episode.showSlug)?.patreonShowId : null
      if (showId && episode.patreonPostId) {
        try {
          urls.push((await this.feeds.audio(token, showId, episode.patreonPostId)).url)
        } catch (error) {
          console.warn(`[downloads] Patreon failed for ${episode.title}`, error)
        }
      }
    }
    if (episode.audioUrl && !urls.includes(episode.audioUrl)) urls.push(episode.audioUrl)
    return urls
  }

  /** Streams the file into the cache, reporting progress as the bytes pass. */
  private async store(cache: Cache, guid: string, url: string, signal: AbortSignal): Promise<void> {
    const response = await this.fetcher(url, { signal })
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

    const total = Number(response.headers.get('Content-Length')) || 0
    let received = 0
    let reported = 0
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        received += chunk.byteLength
        // A percent at a time: every chunk would re-render every row.
        const fraction = total > 0 ? Math.min(received / total, 1) : 0
        if (fraction - reported >= 0.01) {
          reported = fraction
          this.setProgress(guid, fraction)
        }
        controller.enqueue(chunk)
      },
    })

    // The player hands the cached file to <audio> as a blob, whose type is
    // what picks the decoder.
    const type = response.headers.get('Content-Type') ?? ''
    await cache.put(
      keyFor(guid),
      new Response(response.body.pipeThrough(counter), {
        headers: { 'Content-Type': type.startsWith('audio/') ? type : 'audio/mpeg' },
      }),
    )
  }

  // -- Removing ----------------------------------------------------------------

  remove(guid: string): void {
    this.running.get(guid)?.abort()
    this.running.delete(guid)
    this.waitingForWifi.delete(guid)
    this.setProgress(guid, null)
    void this.forget(guid)
  }

  /** The file and the row's claim to it, both gone. */
  private async forget(guid: string): Promise<void> {
    const episode = this.library.getSnapshot().episodes.get(guid)
    if (episode && (isDownloaded(episode) || episode.downloadIsManual)) {
      void this.library.updateEpisode(guid, { downloadedAt: null, downloadIsManual: false })
    }
    try {
      await (await this.storage?.open(AUDIO_CACHE))?.delete(keyFor(guid))
    } catch {
      // Already gone with the rest of the cache.
    }
  }

  /** An episode just marked played lets its file go. */
  private releasePlayed(): void {
    const { episodes } = this.library.getSnapshot()
    if (episodes === this.seen) return
    const before = this.seen
    this.seen = episodes
    const heard = [...episodes.values()].filter(
      (episode) =>
        episode.isPlayed && isDownloaded(episode) && before.get(episode.guid)?.isPlayed === false,
    )
    // After this write has reached every listener, not in the middle of it.
    if (heard.length)
      queueMicrotask(() => {
        for (const episode of heard) this.remove(episode.guid)
      })
  }

  /**
   * The housekeeping pass: drop anything heard (unless it was asked for by
   * hand) or older than a week, and any file no episode claims. Runs at start.
   */
  async purgeExpired(now = Date.now()): Promise<void> {
    if (!this.storage) return
    const cutoff = now - MAXIMUM_AGE_MS
    const kept = new Set<string>()
    for (const episode of this.library.getSnapshot().episodes.values()) {
      if (!isDownloaded(episode)) continue
      const expired = (episode.downloadedAt ?? 0) < cutoff
      if ((episode.isPlayed && !episode.downloadIsManual) || expired) this.remove(episode.guid)
      else kept.add(keyFor(episode.guid))
    }
    for (const guid of this.running.keys()) kept.add(keyFor(guid))

    // Files with no episode pointing at them: a download that landed after
    // its episode was deleted, or one cut off by closing the page.
    try {
      const cache = await this.storage.open(AUDIO_CACHE)
      for (const request of await cache.keys()) {
        if (!kept.has(request.url)) await cache.delete(request)
      }
    } catch (error) {
      console.warn('[downloads] sweep failed', error)
    }
  }

  /** Every download, gone — before Clear Data wipes the rows that point at them. */
  async clear(): Promise<void> {
    for (const controller of this.running.values()) controller.abort()
    this.running.clear()
    this.waitingForWifi.clear()
    this.progress = new Map()
    for (const listener of this.listeners) listener()
    await this.storage?.delete(AUDIO_CACHE)
  }
}
