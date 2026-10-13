import { prisma } from './db.js'
import { FEED_SOURCE_SEEDS, SEEDED_SHOWS } from './feed/sources.js'

/**
 * Ensures the rows the ingest cannot derive for itself: the feed list, and the
 * shows that can only be attributed by regex.
 *
 * Idempotent and deliberately non-destructive — it creates what is missing and
 * leaves everything else alone. Re-running must not overwrite an edit, for the
 * same reason ingest doesn't: that would bump `updatedAt` and make every client
 * re-download the row.
 *
 * Shared by `prisma/seed.ts` and by the resync endpoint, which wipes the
 * catalogue and would otherwise lose the six match patterns — leaving Cannon
 * Fodder, GCN News Minute and the rest unattributable on the run that follows.
 */
export async function seedFeedSources(): Promise<number> {
  for (const source of FEED_SOURCE_SEEDS) {
    await prisma.feedSource.upsert({
      where: { url: source.url },
      update: {},
      create: {
        url: source.url,
        name: source.name,
        showTitle: source.showTitle,
        sortIndex: source.sortIndex,
        isEnabled: source.isEnabled ?? true,
      },
    })
  }
  return FEED_SOURCE_SEEDS.length
}

export async function seedShows(): Promise<number> {
  for (const show of SEEDED_SHOWS) {
    await prisma.show.upsert({
      where: { slug: show.slug },
      update: {},
      create: {
        slug: show.slug,
        title: show.title,
        system: show.system,
        matchPattern: show.matchPattern,
      },
    })
  }
  return SEEDED_SHOWS.length
}
