import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type EpisodeInput, type ShowInput } from './client.js'

/**
 * The query keys, in one place.
 *
 * Every mutation below invalidates by key rather than writing into the cache
 * by hand. The API does more on a write than the response shows — editing an
 * episode moves its show's `updatedAt`, re-attributing one moves two shows —
 * so patching the cache from a response would drift from what the server
 * actually holds. Refetching is a few kilobytes and always right.
 */
export const keys = {
  shows: ['shows'] as const,
  episodes: (showId: string) => ['episodes', showId] as const,
  unattributed: ['episodes', 'unattributed'] as const,
  syncs: ['syncs'] as const,
  feeds: ['feeds'] as const,
  staff: ['staff'] as const,
}

export function useShows() {
  return useQuery({ queryKey: keys.shows, queryFn: api.shows })
}

export function useEpisodes(showId: string) {
  return useQuery({
    queryKey: keys.episodes(showId),
    queryFn: () => api.episodes(showId),
    enabled: Boolean(showId),
  })
}

export function useUnattributedEpisodes() {
  return useQuery({ queryKey: keys.unattributed, queryFn: api.unattributedEpisodes })
}

export function useSyncRuns() {
  return useQuery({ queryKey: keys.syncs, queryFn: () => api.syncRuns(20) })
}

export function useFeeds() {
  return useQuery({ queryKey: keys.feeds, queryFn: api.feeds })
}

export function useStaff() {
  return useQuery({ queryKey: keys.staff, queryFn: api.staff })
}

// ─── Writes ───────────────────────────────────────────────────────────────

export function useCreateShow() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: ShowInput) => api.createShow(input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.shows }),
  })
}

export function useUpdateShow() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ShowInput> }) =>
      api.updateShow(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.shows }),
  })
}

export function useDeleteShow() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteShow(id),
    // Deleting a show tombstones every episode under it, so the episode
    // listings are stale too — including the unattributed worklist, which is
    // a listing of episodes like any other.
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.shows })
      client.invalidateQueries({ queryKey: ['episodes'] })
    },
  })
}

export function useUpdateEpisode() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<EpisodeInput> }) =>
      api.updateEpisode(id, input),
    // Re-attributing an episode changes the show it left and the one it
    // joined, and takes it out of the unattributed worklist — so every episode
    // list is suspect, not just the one it was edited from.
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['episodes'] })
      client.invalidateQueries({ queryKey: keys.shows })
    },
  })
}

export function useDeleteEpisode() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteEpisode(id),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['episodes'] })
      client.invalidateQueries({ queryKey: keys.shows })
    },
  })
}

export function useRunSync() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.runSync,
    // A sync can insert episodes and create shows, and always writes a run.
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.syncs })
      client.invalidateQueries({ queryKey: keys.feeds })
      client.invalidateQueries({ queryKey: keys.shows })
      client.invalidateQueries({ queryKey: ['episodes'] })
    },
  })
}

/**
 * Wipe and rebuild. Every query is invalidated because every row is a new row:
 * the ids change even where the guids and slugs don't, so nothing already in
 * the cache still points at something real.
 */
export function useResync() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: api.resync,
    onSuccess: () => client.invalidateQueries(),
  })
}

export function useAddStaff() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ email, name }: { email: string; name: string }) => api.addStaff(email, name),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.staff }),
  })
}

export function useUpdateStaff() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { email?: string; name?: string } }) =>
      api.updateStaff(id, input),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.staff }),
  })
}

export function useRemoveStaff() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.removeStaff(id),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.staff }),
  })
}
