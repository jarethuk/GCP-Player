import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useShows } from '../api/hooks.js'
import type { ShowWithCounts } from '../api/types.js'
import { Artwork } from '../components/Artwork.js'
import { Badge, OverriddenBadge } from '../components/Badge.js'
import { Button } from '../components/Button.js'
import { MetaLabel } from '../components/MetaLabel.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States.js'
import { Cell, Table } from '../components/Table.js'
import { formatCount, formatDate } from '../lib/format.js'
import { ShowDialog } from './ShowDialog.js'
import styles from './ShowsPage.module.css'

/**
 * Matches the apps' NEW rule: published in the last five days. Kept in step
 * with `recentWindow` in iOS/GCP Player/ShowsView.swift and
 * RecentWindowMillis in the Android ShowsScreen — this page exists to show
 * what a phone would show, so a different window here would quietly lie.
 */
const RECENT_MS = 5 * 24 * 60 * 60 * 1000

export function ShowsPage() {
  const navigate = useNavigate()
  const { data, isPending, isError, error, refetch } = useShows()

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<ShowWithCounts | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const shows = useMemo(() => {
    const rows = data?.shows ?? []
    const needle = search.trim().toLowerCase()
    if (!needle) return rows

    return rows.filter(
      (show) =>
        show.title.toLowerCase().includes(needle) ||
        show.slug.includes(needle) ||
        (show.system?.toLowerCase().includes(needle) ?? false),
    )
  }, [data, search])

  const episodeTotal = (data?.shows ?? []).reduce((sum, show) => sum + show.episodeCount, 0)

  const openNew = () => {
    setEditing(null)
    setIsDialogOpen(true)
  }

  const openEdit = (show: ShowWithCounts) => {
    setEditing(show)
    setIsDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        title="Shows"
        subtitle="The reconciled catalogue: what the phone apps sync, and everything the feeds could be talked into getting wrong."
        actions={
          <>
            <input
              className={styles.search}
              type="search"
              value={search}
              placeholder="Filter shows"
              aria-label="Filter shows"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="primary" onClick={openNew}>
              Add show
            </Button>
          </>
        }
      />

      {data && (
        <Panel>
          <div className={styles.summary}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{formatCount(data.shows.length)}</span>
              <MetaLabel>Shows</MetaLabel>
            </div>
            <div className={styles.stat}>
              <span className={styles.statValue}>{formatCount(episodeTotal)}</span>
              <MetaLabel>Episodes</MetaLabel>
            </div>
            <div className={styles.stat}>
              <span
                className={`${styles.statValue} ${data.unattributedCount > 0 ? styles.attention : ''}`}
              >
                {formatCount(data.unattributedCount)}
              </span>
              <MetaLabel tone={data.unattributedCount > 0 ? 'ember' : 'muted'}>
                Unattributed
              </MetaLabel>
            </div>
          </div>
        </Panel>
      )}

      <Panel flush>
        {isPending && <SkeletonRows rows={8} />}

        {isError && (
          <ErrorState detail={error instanceof Error ? error.message : null} onRetry={refetch} />
        )}

        {data && shows.length === 0 && (
          <EmptyState
            title={search ? 'Nothing matches that' : 'No shows yet'}
            detail={
              search
                ? 'Try a shorter search, or part of the slug.'
                : 'Run a feed sync and the network’s shows appear here.'
            }
          />
        )}

        {shows.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>Show</th>
                <th>System</th>
                <th className={styles.numericHead}>Episodes</th>
                <th>Latest episode</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shows.map((show) => {
                const isRecent =
                  show.latestEpisodeAt !== null &&
                  Date.now() - new Date(show.latestEpisodeAt).getTime() < RECENT_MS

                return (
                  <tr key={show.id}>
                    <Cell>
                      <button
                        type="button"
                        className={styles.title}
                        onClick={() => navigate(`/shows/${show.slug}`)}
                      >
                        <Artwork url={show.artworkUrl} title={show.title} size={36} />
                        <span className={styles.titleText}>
                          <span className={styles.nameRow}>
                            <span className={styles.name}>{show.title}</span>
                            {show.overridden && <OverriddenBadge />}
                          </span>
                          <span className={styles.slug}>{show.slug}</span>
                        </span>
                      </button>
                    </Cell>
                    <Cell dim>{show.system ?? '—'}</Cell>
                    <Cell numeric>{formatCount(show.episodeCount)}</Cell>
                    <Cell dim>
                      {formatDate(show.latestEpisodeAt)}{' '}
                      {/* The same rule the apps use for the NEW chip. */}
                      {isRecent && <Badge tone="sky">New</Badge>}
                    </Cell>
                    <Cell actions>
                      <Button variant="quiet" size="small" onClick={() => openEdit(show)}>
                        Edit
                      </Button>
                    </Cell>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <ShowDialog open={isDialogOpen} show={editing} onClose={() => setIsDialogOpen(false)} />
    </>
  )
}
