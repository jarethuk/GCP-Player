import { useState } from 'react'
import { ApiError, RESYNC_CONFIRMATION } from '../api/client.js'
import { useFeeds, useResync, useRunSync, useSyncRuns } from '../api/hooks.js'
import { Badge, SyncStatusBadge } from '../components/Badge.js'
import { Button } from '../components/Button.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { PageHeader } from '../components/PageHeader.js'
import { Panel } from '../components/Panel.js'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States.js'
import { Cell, Table } from '../components/Table.js'
import { useToast } from '../components/Toast.js'
import { formatCount, formatDateTime, formatElapsed } from '../lib/format.js'
import styles from './SyncsPage.module.css'

/** One of the run's counts. `attention` marks the ones that mean "look at me". */
function RunCount({
  label,
  value,
  attention = false,
}: {
  label: string
  value: number
  attention?: boolean
}) {
  return (
    <span
      className={attention && value > 0 ? `${styles.number} ${styles.attention}` : styles.number}
    >
      <span className={styles.numberValue}>{formatCount(value)}</span>
      {label}
    </span>
  )
}

/**
 * The ingest: what it read, and what it has been doing.
 *
 * The numbers on each run are the cheapest check that the feeds still parse
 * the way they did — a jump in unattributed episodes, or a collapse in
 * cross-posts skipped, is a format change showing up as arithmetic before
 * anyone notices it on a phone.
 */
export function SyncsPage() {
  const toast = useToast()
  const runs = useSyncRuns()
  const feeds = useFeeds()
  const runSync = useRunSync()
  const resync = useResync()
  const [error, setError] = useState<string | null>(null)
  const [isResyncOpen, setIsResyncOpen] = useState(false)
  const [resyncError, setResyncError] = useState<string | null>(null)

  const sync = async () => {
    setError(null)
    try {
      const result = await runSync.mutateAsync()
      toast.succeeded(
        result.itemsCreated === 0
          ? 'Sync finished — nothing new in the feeds.'
          : `Sync finished — ${formatCount(result.itemsCreated)} new episodes.`,
      )
    } catch (cause) {
      const message = cause instanceof ApiError ? cause.message : 'The sync could not be run.'
      setError(message)
      toast.failed(message)
    }
  }

  const rebuild = async () => {
    setResyncError(null)
    try {
      const result = await resync.mutateAsync()
      setIsResyncOpen(false)
      toast.succeeded(
        `Rebuilt — ${formatCount(result.deleted.episodes)} episodes deleted, ` +
          `${formatCount(result.resynced.itemsCreated)} re-ingested.`,
      )
    } catch (cause) {
      const message =
        cause instanceof ApiError ? cause.message : 'The catalogue could not be rebuilt.'
      // Kept in the dialog rather than only in a toast: this one is worth
      // reading twice, and the dialog stays open so it can be.
      setResyncError(message)
    }
  }

  return (
    <>
      <PageHeader
        title="Feed syncs"
        subtitle="The ingest runs every 10 minutes around the network's release times (04:00–05:20 and 13:00–22:50 UTC) and hourly otherwise. Only runs that changed something or had a feed fail are kept, for seven days. It reconciles the catalogue against the feeds and writes only what genuinely changed, so running it again against an unchanged catalogue writes nothing at all."
        actions={
          <Button variant="primary" busy={runSync.isPending} onClick={() => void sync()}>
            Run sync now
          </Button>
        }
      />

      {error && <ErrorState title="The sync failed" detail={error} />}

      <Panel title="Recent runs" flush>
        {runs.isPending && <SkeletonRows rows={5} />}

        {runs.isError && (
          <ErrorState
            detail={runs.error instanceof Error ? runs.error.message : null}
            onRetry={runs.refetch}
          />
        )}

        {runs.data && runs.data.runs.length === 0 && (
          <EmptyState title="Nothing has run yet" detail="The first sync writes the first row." />
        )}

        {runs.data && runs.data.runs.length > 0 && (
          <Table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Status</th>
                <th>Took</th>
                <th>What it did</th>
              </tr>
            </thead>
            <tbody>
              {runs.data.runs.map((run) => (
                <tr key={run.id}>
                  <Cell dim>{formatDateTime(run.startedAt)}</Cell>
                  <Cell>
                    <SyncStatusBadge status={run.status} />
                  </Cell>
                  <Cell dim>{formatElapsed(run.startedAt, run.finishedAt)}</Cell>
                  <Cell>
                    <div className={styles.numbers}>
                      <RunCount label="seen" value={run.itemsSeen} />
                      <RunCount label="created" value={run.itemsCreated} />
                      {/* Not zero means the network edited something already
                          published, and the correction reached the phones. */}
                      <RunCount label="updated" value={run.episodesUpdated} />
                      <RunCount label="cross-posts" value={run.duplicatesSkipped} />
                      <RunCount label="unattributed" value={run.itemsUnattributed} attention />
                      <RunCount label="numbers derived" value={run.numbersDerived} />
                      {run.showsUpdated > 0 && (
                        <RunCount label="shows updated" value={run.showsUpdated} />
                      )}
                      {run.overriddenSkipped > 0 && (
                        <RunCount label="left to edits" value={run.overriddenSkipped} />
                      )}
                      {run.showsCreated > 0 && (
                        <RunCount label="new shows" value={run.showsCreated} />
                      )}
                    </div>
                    {run.failedFeeds.length > 0 && (
                      <p className={styles.failure}>
                        Could not fetch: {run.failedFeeds.join(', ')}
                      </p>
                    )}
                    {run.error && <p className={styles.failure}>{run.error}</p>}
                  </Cell>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <Panel
        title="Feeds"
        subtitle="The sources the ingest reads, in the order it applies them. The main feed must sort first: the network cross-posts, and the copy that gets inserted is the first one seen."
        action={
          <Button
            variant="danger"
            busy={resync.isPending}
            onClick={() => {
              setResyncError(null)
              setIsResyncOpen(true)
            }}
          >
            Rebuild from feeds
          </Button>
        }
        flush
      >
        {feeds.isPending && <SkeletonRows rows={4} />}

        {feeds.isError && (
          <ErrorState
            detail={feeds.error instanceof Error ? feeds.error.message : null}
            onRetry={feeds.refetch}
          />
        )}

        {feeds.data && (
          <Table>
            <thead>
              <tr>
                <th>Feed</th>
                <th>Show</th>
                <th>Last fetched</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {feeds.data.feeds.map((feed) => (
                <tr key={feed.id}>
                  <Cell>
                    <span className={styles.feedName}>
                      <span>{feed.name}</span>
                      <span className={styles.feedUrl}>{feed.url}</span>
                    </span>
                  </Cell>
                  {/* No show means the main Megaphone feed, which interleaves
                      the whole network and encodes the show in each title. */}
                  <Cell dim>{feed.showTitle ?? 'All shows'}</Cell>
                  <Cell dim>{formatDateTime(feed.lastFetchedAt)}</Cell>
                  <Cell>
                    {!feed.isEnabled ? (
                      <Badge>Disabled</Badge>
                    ) : feed.lastError ? (
                      <Badge tone="ember" dot>
                        {feed.lastError.slice(0, 48)}
                      </Badge>
                    ) : (
                      <Badge tone="moss" dot>
                        OK
                      </Badge>
                    )}
                  </Cell>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>

      <ConfirmDialog
        open={isResyncOpen}
        title="Rebuild the catalogue from the feeds"
        body={
          <>
            <p>
              Every show and episode is <strong>deleted outright</strong> — not tombstoned — and
              then rebuilt by reading the feeds from scratch. It takes about a minute.
            </p>
            <p>
              <strong>Everything edited here is lost.</strong> Corrected titles, episodes attributed
              by hand, video links, descriptions: all of it comes back as the feeds have it, and
              every row marked <em>Edited</em> stops being marked.
            </p>
            <p>
              Phones are fine. They key on guid and slug, which the rebuild reproduces exactly, so
              what was played, where you had got to and anything downloaded all survive — but every
              row's timestamp moves, so each one re-downloads the whole catalogue once.
            </p>
          </>
        }
        confirmLabel="Delete everything and rebuild"
        // The API demands this same string in the body and refuses without it.
        // Typing it here is the half a person does knowingly.
        requireTyping={RESYNC_CONFIRMATION}
        busy={resync.isPending}
        error={resyncError}
        onConfirm={() => void rebuild()}
        onClose={() => setIsResyncOpen(false)}
      />
    </>
  )
}
