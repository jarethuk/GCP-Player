import { useState } from 'react'
import { useUnattributedEpisodes } from '../api/hooks.js'
import type { Episode } from '../api/types.js'
import { OverriddenBadge } from '../components/Badge.js'
import { Button } from '../components/Button.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States.js'
import { Cell, Table } from '../components/Table.js'
import { VideoLink } from '../components/VideoLink.js'
import { formatDate, formatDuration } from '../lib/format.js'
import { EpisodeDialog } from './EpisodeDialog.js'
import styles from './ShowPage.module.css'

/**
 * The editing worklist.
 *
 * Episodes whose titles the parser couldn't attribute to any show are kept
 * rather than dropped, precisely so they end up here — a feed format change
 * surfaces as a number on this page instead of episodes quietly vanishing off
 * people's phones.
 *
 * The full published title is the whole point of the table: it is what the
 * parser was given, and reading it is how you work out which show it belongs
 * to — or whether the parser needs a match pattern rather than this episode
 * needing a hand.
 */
export function UnattributedPage() {
  const { data, isPending, isError, error, refetch } = useUnattributedEpisodes()
  const [editing, setEditing] = useState<Episode | null>(null)

  const episodes = data?.episodes ?? []

  return (
    <>
      <PageHeader
        title="Unattributed"
        subtitle="Episodes the title parser could not place. Giving one a show is the single most useful edit here — and if several arrive at once, the feed's format has probably changed."
      />

      <Panel flush>
        {isPending && <SkeletonRows rows={5} />}

        {isError && (
          <ErrorState detail={error instanceof Error ? error.message : null} onRetry={refetch} />
        )}

        {data && episodes.length === 0 && (
          <EmptyState
            title="Everything is attributed"
            detail="Every episode in the catalogue belongs to a show."
          />
        )}

        {episodes.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>Published title</th>
                <th>Published</th>
                <th>Length</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {episodes.map((episode) => (
                <tr key={episode.id}>
                  <Cell>
                    <span className={styles.episodeTitle}>
                      <span className={styles.titleRow}>
                        <span>{episode.rawTitle}</span>
                        <VideoLink url={episode.videoUrl} />
                        {/* Rare but worth saying: an episode edited without
                            being attributed stays on this list, and no future
                            sync will try to claim it either. */}
                        {episode.overridden && <OverriddenBadge />}
                      </span>
                      <span className={styles.raw}>{episode.guid}</span>
                    </span>
                  </Cell>
                  <Cell dim>{formatDate(episode.publishedAt)}</Cell>
                  <Cell dim>{formatDuration(episode.durationSeconds)}</Cell>
                  <Cell actions>
                    <Button variant="primary" size="small" onClick={() => setEditing(episode)}>
                      Attribute
                    </Button>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <EpisodeDialog open={editing !== null} episode={editing} onClose={() => setEditing(null)} />
    </>
  )
}
