import { SegmentedPicker } from '@gcp/web-components'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { useDeleteEpisode, useDeleteShow, useEpisodes, useShows } from '../api/hooks.js'
import type { Episode } from '../api/types.js'
import { Artwork } from '../components/Artwork.js'
import { OverriddenBadge } from '../components/Badge.js'
import { Button } from '../components/Button.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { MetaLabel } from '../components/MetaLabel.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'
import { EmptyState, ErrorState, Loading, SkeletonRows } from '../components/States.js'
import { Cell, Table } from '../components/Table.js'
import { useToast } from '../components/Toast.js'
import { VideoLink } from '../components/VideoLink.js'
import { formatCount, formatDate, formatDuration, formatNumbering } from '../lib/format.js'
import { EpisodeDialog } from './EpisodeDialog.js'
import { ShowDialog } from './ShowDialog.js'
import styles from './ShowPage.module.css'

type Order = 'oldest' | 'newest'

const ORDERS = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'newest', label: 'Newest first' },
] as const

export function ShowPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const shows = useShows()
  const show = shows.data?.shows.find((candidate) => candidate.slug === slug)

  // The episode list is fetched by slug, which this endpoint accepts as well
  // as a cuid — so it doesn't have to wait for the show list to resolve.
  const episodes = useEpisodes(slug)
  const deleteShow = useDeleteShow()
  const deleteEpisode = useDeleteEpisode()

  const [order, setOrder] = useState<Order>('oldest')
  const [editingShow, setEditingShow] = useState(false)
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null)
  const [removingEpisode, setRemovingEpisode] = useState<Episode | null>(null)
  const [removingShow, setRemovingShow] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = useMemo(() => {
    const list = [...(episodes.data?.episodes ?? [])]
    // Oldest first by default — the order you'd listen to a campaign in, and
    // the order the app itself shows.
    list.sort((left, right) =>
      order === 'oldest'
        ? left.publishedAt.localeCompare(right.publishedAt)
        : right.publishedAt.localeCompare(left.publishedAt),
    )
    return list
  }, [episodes.data, order])

  const removeEpisode = async () => {
    if (!removingEpisode) return
    setError(null)

    try {
      await deleteEpisode.mutateAsync(removingEpisode.id)
      toast.succeeded(`Deleted ${removingEpisode.title}`)
      setRemovingEpisode(null)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That could not be deleted.')
    }
  }

  const removeShow = async () => {
    if (!show) return
    setError(null)

    try {
      await deleteShow.mutateAsync(show.id)
      toast.succeeded(`Deleted ${show.title}`)
      navigate('/shows')
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That could not be deleted.')
    }
  }

  if (shows.isPending) return <Loading label="Loading the show" />

  if (!show) {
    return (
      <>
        <PageHeader title="Not found" back={{ to: '/shows', label: 'Shows' }} />
        <Panel>
          <EmptyState
            title="No such show"
            detail={`Nothing in the catalogue has the slug "${slug}".`}
          />
        </Panel>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={show.title}
        back={{ to: '/shows', label: 'Shows' }}
        actions={
          <>
            <Button onClick={() => setEditingShow(true)}>Edit show</Button>
            <Button variant="danger" onClick={() => setRemovingShow(true)}>
              Delete
            </Button>
          </>
        }
      />

      <Panel>
        <div className={styles.hero}>
          <Artwork url={show.artworkUrl} title={show.title} size={96} />
          <div className={styles.heroText}>
            <div className={styles.meta}>
              <MetaLabel>{show.slug}</MetaLabel>
              {show.system && <MetaLabel tone="sky">{show.system}</MetaLabel>}
              <MetaLabel>{formatCount(show.episodeCount)} episodes</MetaLabel>
              <MetaLabel>Latest {formatDate(show.latestEpisodeAt)}</MetaLabel>
              {!show.isPublic && <MetaLabel tone="sky">Patreon only</MetaLabel>}
              {show.patreonShowId && <MetaLabel>Patreon {show.patreonShowId}</MetaLabel>}
              {show.overridden && <OverriddenBadge />}
            </div>
            <p className={styles.description}>
              {show.description ?? 'No description. The feeds rarely supply one.'}
            </p>
            {show.matchPattern && (
              <p className={styles.description}>
                Claims episodes matching <code>{show.matchPattern}</code>
              </p>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Episodes"
        subtitle="Deleting one is a tombstone: every phone holding it drops its copy, and frees whatever it had downloaded."
        action={
          <div className="w-72">
            <SegmentedPicker label="Order" options={ORDERS} selection={order} onChange={setOrder} />
          </div>
        }
        flush
      >
        {episodes.isPending && <SkeletonRows rows={6} />}

        {episodes.isError && (
          <ErrorState
            detail={episodes.error instanceof Error ? episodes.error.message : null}
            onRetry={episodes.refetch}
          />
        )}

        {episodes.data && rows.length === 0 && (
          <EmptyState
            title="No episodes"
            detail="Nothing in the feeds has been attributed to this show yet."
          />
        )}

        {rows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>Numbering</th>
                <th>Episode</th>
                <th>Published</th>
                <th>Length</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((episode) => (
                <tr key={episode.id}>
                  <Cell>
                    <span
                      className={
                        episode.numberIsDerived ? `${styles.chip} ${styles.derived}` : styles.chip
                      }
                      title={
                        episode.numberIsDerived
                          ? 'Derived from release order — the feed published no number'
                          : undefined
                      }
                    >
                      {formatNumbering(episode.season, episode.number)}
                    </span>
                  </Cell>
                  <Cell>
                    <span className={styles.episodeTitle}>
                      <span className={styles.titleRow}>
                        <span>{episode.title}</span>
                        <VideoLink url={episode.videoUrl} />
                        {episode.overridden && <OverriddenBadge />}
                      </span>
                      {/* The line the parser was actually given. Worth seeing
                          when a title has come out wrong. */}
                      <span className={styles.raw}>{episode.rawTitle}</span>
                    </span>
                  </Cell>
                  <Cell dim>{formatDate(episode.publishedAt)}</Cell>
                  <Cell dim>{formatDuration(episode.durationSeconds)}</Cell>
                  <Cell actions>
                    <Button variant="quiet" size="small" onClick={() => setEditingEpisode(episode)}>
                      Edit
                    </Button>
                    <Button
                      variant="quiet"
                      size="small"
                      onClick={() => setRemovingEpisode(episode)}
                    >
                      Delete
                    </Button>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <ShowDialog open={editingShow} show={show} onClose={() => setEditingShow(false)} />

      <EpisodeDialog
        open={editingEpisode !== null}
        episode={editingEpisode}
        onClose={() => setEditingEpisode(null)}
      />

      <ConfirmDialog
        open={removingEpisode !== null}
        title="Delete episode"
        body={
          <p>
            “{removingEpisode?.title}” is removed from the catalogue, and every phone holding it
            drops its copy on the next sync — including anything it had downloaded.
          </p>
        }
        confirmLabel="Delete episode"
        busy={deleteEpisode.isPending}
        error={error}
        onConfirm={() => void removeEpisode()}
        onClose={() => setRemovingEpisode(null)}
      />

      <ConfirmDialog
        open={removingShow}
        title="Delete show"
        body={
          <p>
            {show.title} and all {formatCount(show.episodeCount)} of its episodes are tombstoned.
            Every phone holding them drops its copies on the next sync.
          </p>
        }
        confirmLabel="Delete show"
        requireTyping={show.slug}
        busy={deleteShow.isPending}
        error={error}
        onConfirm={() => void removeShow()}
        onClose={() => setRemovingShow(false)}
      />
    </>
  )
}
