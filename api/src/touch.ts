import { invalidateTags, tags } from './cache.js'
import { prisma } from './db.js'

/**
 * Marks shows as changed because their *episodes* changed.
 *
 * This is the invariant the clients' sync depends on: a client asks for the
 * show list, then only fetches episodes for shows whose `updatedAt` has moved
 * since it last looked. So **every write that adds, removes or re-attributes an
 * episode must call this**, or that episode is invisible to every client until
 * something else happens to touch its show.
 *
 * It does not weaken the additive rule. A cron run that inserts nothing calls
 * this with nothing and writes nothing, so an unchanged catalogue still
 * produces an empty delta; and bumping a timestamp cannot undo an edit, because
 * it changes no editable field.
 *
 * `updatedAt` is set explicitly rather than left to `@updatedAt`, so one
 * statement stamps every row with the same instant — rows sharing a timestamp
 * cannot straddle a client's cursor.
 *
 * It also purges the cache entries it just made stale — the show list, whose
 * rows carry these timestamps, and each show's episode list. Bumping a cursor
 * that the edge then serves from an hour-old copy would move the data without
 * anyone being able to see it, which is the same failure as not bumping it.
 */
export async function touchShows(ids: Iterable<string | null | undefined>): Promise<number> {
  const unique = [...new Set([...ids].filter((id): id is string => typeof id === 'string'))]
  if (unique.length === 0) return 0

  const { count } = await prisma.show.updateMany({
    where: { id: { in: unique } },
    data: { updatedAt: new Date() },
  })

  await invalidateTags([tags.shows, ...unique.map(tags.show)])

  return count
}
