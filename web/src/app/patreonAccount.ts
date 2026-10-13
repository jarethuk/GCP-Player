/**
 * The patron's token: kept in IndexedDB beside everything else this browser
 * holds, and never sent to the catalogue API.
 *
 * A removal is kept as a credential with a null token rather than deleted, as
 * on the phones: once there's an account to sync it through, the removal has to
 * win against an older copy elsewhere, and a missing row has no time to win with.
 */

import { Copy } from '../copy/copy'
import type { Library } from '../data/library'
import type { PatreonFeeds } from '../patreon/feeds'
import { tokenFromFeedLink } from '../patreon/parser'

export class PatreonAccount {
  constructor(
    private readonly library: Library,
    private readonly feeds: PatreonFeeds,
  ) {}

  get token(): string | null {
    return this.library.getSnapshot().patreonToken
  }

  async setToken(token: string | null): Promise<void> {
    this.feeds.forget()
    await this.library.setMeta('patreonCredential', { token, updatedAt: Date.now() })
    console.info(`[patreon] token ${token ? 'set' : 'removed'}`)
  }

  /**
   * Takes the token out of a pasted link, makes sure Patreon accepts it, and
   * keeps it. Throws with the message Settings shows.
   *
   * Checked against one of the shows Patreon carries, where the catalogue has
   * one yet; with nothing synced it is kept unchecked rather than refused.
   */
  async saveFromLink(link: string): Promise<void> {
    const token = tokenFromFeedLink(link)
    if (!token) throw new Error(Copy.Patreon.invalidLink)
    const showId = [...this.library.getSnapshot().shows.values()].find(
      (show) => show.patreonShowId !== null,
    )?.patreonShowId
    if (showId) await this.feeds.check(token, showId)
    await this.setToken(token)
  }
}
