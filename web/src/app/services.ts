/**
 * Everything with a lifetime longer than a screen, built once at start.
 */

import { type CatalogueClient, createCatalogueClient } from '../data/api'
import { openDatabase } from '../data/db'
import { Library } from '../data/library'
import { Downloads } from '../downloads/downloads'
import { PatreonFeeds } from '../patreon/feeds'
import { Player } from '../player/player'
import { Catalogue } from './catalogue'
import { PatreonAccount } from './patreonAccount'
import { getSetting } from './settings'

export interface Services {
  library: Library
  catalogue: Catalogue
  player: Player
  patreon: PatreonAccount
  downloads: Downloads
}

export function createServices(
  library: Library,
  api: CatalogueClient = createCatalogueClient(),
  feeds = new PatreonFeeds(),
  audio?: HTMLAudioElement,
): Services {
  const downloads = new Downloads(library, feeds, getSetting)
  const player = new Player(library, feeds, audio, downloads)
  return {
    library,
    player,
    catalogue: new Catalogue(library, api, player, downloads),
    patreon: new PatreonAccount(library, feeds),
    downloads,
  }
}

export async function startServices(): Promise<Services> {
  const library = await Library.open(await openDatabase())
  const services = createServices(library)

  // Ask the browser not to evict this origin's storage under pressure: it
  // holds what has been played and where, and the downloads. A refusal
  // changes nothing.
  void navigator.storage?.persist?.().catch(() => {})

  // Drop downloads that have been heard or have sat for a week.
  void services.downloads.purgeExpired()

  // The two moments that matter: leaving (keep the position) and coming back
  // after a long time away (fetch what's new).
  const leave = () => services.player.flushPosition()
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') leave()
    else void services.catalogue.syncIfOlderThan(30 * 60 * 1000)
  })

  await services.player.restoreLastEpisode()
  return services
}
