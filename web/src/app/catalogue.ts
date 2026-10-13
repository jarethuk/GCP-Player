/**
 * The catalogue sync and its state, shared by whatever is showing the shows —
 * one screen on a phone, the sidebar and the poster wall at once on a wider
 * window. The web's ShowsModel: one owner, so two views appearing together
 * don't mean two syncs, and a second caller while one runs is a no-op.
 */

import type { CatalogueClient } from '../data/api'
import type { Library } from '../data/library'
import { clearAndResync, type SyncResult, sync } from '../data/sync'
import type { Downloads } from '../downloads/downloads'
import type { Player } from '../player/player'

export interface CatalogueState {
  readonly isSyncing: boolean
  readonly syncError: string | null
  readonly lastSyncedAt: number | null
}

export class Catalogue {
  private state: CatalogueState = { isSyncing: false, syncError: null, lastSyncedAt: null }
  private readonly listeners = new Set<() => void>()
  private running: Promise<void> | null = null

  constructor(
    private readonly library: Library,
    private readonly api: CatalogueClient,
    private readonly player: Player,
    private readonly downloads: Downloads,
  ) {}

  readonly getState = (): CatalogueState => this.state

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(patch: Partial<CatalogueState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Brings the catalogue in line with the API. Idempotent; safe to call from anywhere. */
  sync(): Promise<void> {
    this.running ??= this.run(() => sync(this.library, this.api)).finally(() => {
      this.running = null
    })
    return this.running
  }

  /** Syncs if the last one was longer ago than `ms` — for a tab that has sat open for hours. */
  syncIfOlderThan(ms: number): Promise<void> {
    const { lastSyncedAt } = this.state
    if (lastSyncedAt !== null && Date.now() - lastSyncedAt < ms) return Promise.resolve()
    return this.sync()
  }

  /**
   * Throws away everything held and fetches it again. Rejects with the error
   * so Settings can say the local copy is already gone.
   */
  async clearAndResync(): Promise<SyncResult> {
    await this.running
    // Nothing may still be holding a row that is about to be deleted.
    this.player.stop()
    this.setState({ isSyncing: true })
    try {
      // The files go with the rows that point at them.
      await this.downloads.clear()
      const result = await clearAndResync(this.library, this.api)
      this.setState({ isSyncing: false, syncError: null, lastSyncedAt: Date.now() })
      return result
    } catch (error) {
      this.setState({ isSyncing: false, syncError: message(error) })
      throw error
    }
  }

  private async run(work: () => Promise<SyncResult>): Promise<void> {
    this.setState({ isSyncing: true })
    try {
      const result = await work()
      this.setState({ isSyncing: false, syncError: null, lastSyncedAt: Date.now() })
      const shows = this.library.getSnapshot().shows.size
      console.info(
        `[sync] ${result.showsChecked} of ${shows} shows checked, episodes +${result.episodesCreated}/~${result.episodesUpdated}/-${result.episodesRemoved}, shows +${result.showsCreated}/-${result.showsRemoved}`,
      )
      if (result.failedShows.length) {
        console.warn(`[sync] shows that failed to sync: ${result.failedShows.join(', ')}`)
      }
    } catch (error) {
      this.setState({ isSyncing: false, syncError: message(error) })
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
