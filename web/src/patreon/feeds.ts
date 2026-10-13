/**
 * The patron's feeds, one per show, fetched when something needs audio from
 * them and kept for half an hour — a show's feed is a few hundred kilobytes,
 * and playing one episode then the next asks for the same one twice.
 *
 * Fetched through this app's own origin (`/patreon/rss`): Patreon's feed has
 * no CORS header, so the browser can't read it cross-origin. vercel.json
 * rewrites the path to Patreon in production, and vite.config.ts proxies it
 * in development. The token rides along in the query string, as it does in
 * the link Patreon hands out; nothing logs it.
 */

import { Copy } from '../copy/copy'
import { type PatreonAudio, parsePatreonFeed } from './parser'

export type PatreonErrorKind = 'noToken' | 'notOnPatreon' | 'rejected' | 'notInFeed' | 'unreachable'

export class PatreonError extends Error {
  constructor(
    readonly kind: PatreonErrorKind,
    readonly status?: number,
  ) {
    super(PatreonError.describe(kind, status))
  }

  private static describe(kind: PatreonErrorKind, status?: number): string {
    switch (kind) {
      case 'noToken':
        return Copy.Patreon.errorNoToken
      case 'notOnPatreon':
        return Copy.Patreon.errorNotOnPatreon
      case 'rejected':
        return status === 401 || status === 403 || status === 404 || status === undefined
          ? Copy.Patreon.errorRejected
          : Copy.Patreon.errorStatus(status)
      case 'notInFeed':
        return Copy.Patreon.errorNotInFeed
      case 'unreachable':
        return Copy.Patreon.errorUnreachable
    }
  }
}

/** Long enough to cover a listening session, short enough that a new post shows up. */
const LIFETIME_MS = 30 * 60 * 1000

type Items = Map<string, PatreonAudio>

export class PatreonFeeds {
  private feeds = new Map<string, { fetchedAt: number; token: string; items: Items }>()
  private inFlight = new Map<string, Promise<Items>>()

  constructor(
    private readonly endpoint = '/patreon/rss',
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  /**
   * Where to play `postId` from on Patreon, and how long Patreon's copy runs.
   * A post missing from a cached feed may have been published since, so the
   * feed is fetched again before giving up on it.
   */
  async audio(token: string, showId: string, postId: string): Promise<PatreonAudio> {
    let items = await this.feed(token, showId, true)
    const cached = this.feeds.get(showId)
    if (!items.has(postId) && (!cached || Date.now() - cached.fetchedAt > 5_000)) {
      items = await this.feed(token, showId, false)
    }
    const audio = items.get(postId)
    if (!audio) throw new PatreonError('notInFeed')
    return audio
  }

  /**
   * Whether `token` opens this show's feed — asked before a pasted link is
   * kept, so a wrong one is caught in Settings rather than on the first play.
   */
  async check(token: string, showId: string): Promise<void> {
    const items = await this.feed(token, showId, false)
    if (!items.size) throw new PatreonError('rejected', 403)
  }

  /** Drops everything fetched: the URLs inside carry the old token. */
  forget(): void {
    this.feeds.clear()
    this.inFlight.clear()
  }

  private feed(token: string, showId: string, allowCached: boolean): Promise<Items> {
    const cached = this.feeds.get(showId)
    if (
      allowCached &&
      cached &&
      cached.token === token &&
      Date.now() - cached.fetchedAt < LIFETIME_MS
    ) {
      return Promise.resolve(cached.items)
    }
    const key = `${token}:${showId}`
    const running = this.inFlight.get(key)
    if (running) return running

    const request = this.fetchFeed(token, showId)
      .then((items) => {
        if (this.inFlight.get(key) === request) {
          this.feeds.set(showId, { fetchedAt: Date.now(), token, items })
        }
        return items
      })
      .finally(() => {
        if (this.inFlight.get(key) === request) this.inFlight.delete(key)
      })
    this.inFlight.set(key, request)
    return request
  }

  private async fetchFeed(token: string, showId: string): Promise<Items> {
    const query = new URLSearchParams({ auth: token, show: showId })
    let response: Response
    try {
      response = await this.fetcher(`${this.endpoint}?${query}`, {
        signal: AbortSignal.timeout(20_000),
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      })
    } catch {
      throw new PatreonError('unreachable')
    }
    if (!response.ok) throw new PatreonError('rejected', response.status)
    const items = parsePatreonFeed(await response.text())
    console.info(`[patreon] feed for show ${showId}: ${items.size} items`)
    return items
  }
}
