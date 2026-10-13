import { useEffect, useState } from 'react'
import { ApiError, type EpisodeInput } from '../api/client.js'
import { useShows, useUpdateEpisode } from '../api/hooks.js'
import type { Episode } from '../api/types.js'
import { OverriddenBadge } from '../components/Badge.js'
import { Button } from '../components/Button.js'
import { Dialog } from '../components/Dialog.js'
import { SelectField, TextArea, TextField } from '../components/Field.js'
import { useToast } from '../components/Toast.js'
import { numberOrNull, positiveOrNull } from '../lib/format.js'

const trimmed = (value: string): string | null => value.trim() || null

interface Draft {
  showId: string
  title: string
  description: string
  audioUrl: string
  publishedAt: string
  durationSeconds: string
  season: string
  number: string
  artworkUrl: string
  videoUrl: string
}

/**
 * `<input type="datetime-local">` wants `YYYY-MM-DDTHH:mm` with no zone, and
 * reads it as local time. The API speaks ISO-8601 with an offset, so both ends
 * of the conversion happen here rather than being spread through the form.
 */
const toLocalInput = (iso: string): string => {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const draftFrom = (episode: Episode): Draft => ({
  showId: episode.showId ?? '',
  title: episode.title,
  description: episode.description ?? '',
  audioUrl: episode.audioUrl ?? '',
  publishedAt: toLocalInput(episode.publishedAt),
  durationSeconds: episode.durationSeconds === null ? '' : String(episode.durationSeconds),
  season: episode.season === null ? '' : String(episode.season),
  number: episode.number === null ? '' : String(episode.number),
  artworkUrl: episode.artworkUrl ?? '',
  videoUrl: episode.videoUrl ?? '',
})

export interface EpisodeDialogProps {
  open: boolean
  episode: Episode | null
  onClose: () => void
}

/**
 * Editing one episode — and above all, attributing one.
 *
 * Re-attributing is the single most useful edit this whole product offers:
 * nine episodes currently have no show, because their titles don't carry one
 * in any form the parser recognises. That is what the Show field at the top is
 * for, and why it is the first thing in the dialog rather than buried under
 * the metadata.
 */
export function EpisodeDialog({ open, episode, onClose }: EpisodeDialogProps) {
  const toast = useToast()
  const update = useUpdateEpisode()
  const { data: showData } = useShows()

  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !episode) return
    setDraft(draftFrom(episode))
    setError(null)
  }, [open, episode])

  if (!draft || !episode) {
    // Nothing to edit yet. The dialog element still has to exist so that
    // opening it is a state change rather than a mount.
    return (
      <Dialog open={false} title="Edit episode" onConfirm={() => undefined} onClose={onClose}>
        {null}
      </Dialog>
    )
  }

  const set = (field: keyof Draft) => (value: string) =>
    setDraft((current) => (current ? { ...current, [field]: value } : current))

  const input: Partial<EpisodeInput> = {
    showId: draft.showId || null,
    title: draft.title.trim(),
    description: trimmed(draft.description),
    publishedAt: new Date(draft.publishedAt).toISOString(),
    durationSeconds: positiveOrNull(draft.durationSeconds),
    season: positiveOrNull(draft.season),
    number: numberOrNull(draft.number),
    artworkUrl: trimmed(draft.artworkUrl),
    videoUrl: trimmed(draft.videoUrl),
    // Left out when empty — see EpisodeInput.audioUrl.
    ...(draft.audioUrl.trim() ? { audioUrl: draft.audioUrl.trim() } : {}),
  }

  /**
   * Hands the episode back to the feeds.
   *
   * Deliberately not part of Save — saving is an edit, and an edit is what set
   * the flag in the first place. This sends nothing but the release, so
   * whatever is half-typed in the form is discarded rather than quietly
   * committed on the way out.
   *
   * Worth knowing before clicking it: on an episode that was attributed by
   * hand, releasing it lets the next sync attribute it from its title again —
   * which for the nine that parse to no show at all means losing the show it
   * was given.
   */
  const release = async () => {
    setError(null)
    try {
      await update.mutateAsync({ id: episode.id, input: { overridden: false } })
      toast.succeeded(`${episode.title} follows the feeds again`)
      onClose()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That could not be saved.')
    }
  }

  const save = async () => {
    setError(null)
    try {
      await update.mutateAsync({ id: episode.id, input })
      toast.succeeded(`Saved ${input.title}`)
      onClose()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That could not be saved.')
    }
  }

  return (
    <Dialog
      open={open}
      title="Edit episode"
      subtitle={
        <>
          {episode.rawTitle}
          {episode.overridden && (
            <>
              {' '}
              <OverriddenBadge />
            </>
          )}
        </>
      }
      confirmDisabled={
        !draft.title.trim() ||
        // A Patreon episode has no public audio to give, and needs none.
        (!draft.audioUrl.trim() && !episode.patreonPostId) ||
        !draft.publishedAt
      }
      secondary={
        episode.overridden ? (
          <Button variant="quiet" onClick={() => void release()} disabled={update.isPending}>
            Let the feeds manage this again
          </Button>
        ) : null
      }
      busy={update.isPending}
      error={error}
      onConfirm={() => void save()}
      onClose={onClose}
    >
      <SelectField
        label="Show"
        value={draft.showId}
        onChange={(event) => set('showId')(event.target.value)}
        hint={
          episode.showId === null
            ? 'This episode could not be attributed from its title. Giving it a show here is the fix.'
            : 'Moving it marks both shows, so every phone holding either one is told.'
        }
      >
        <option value="">— Unattributed —</option>
        {(showData?.shows ?? []).map((show) => (
          <option key={show.id} value={show.id}>
            {show.title}
          </option>
        ))}
      </SelectField>

      <TextField
        label="Title"
        value={draft.title}
        required
        onChange={(event) => set('title')(event.target.value)}
        hint="The cleaned title, with the show and system segments stripped off."
      />

      <TextField
        label="Published"
        type="datetime-local"
        value={draft.publishedAt}
        required
        onChange={(event) => set('publishedAt')(event.target.value)}
        hint="Listening order comes from this, and most shows have no published numbering to fall back on."
      />

      <TextField
        label="Season"
        type="number"
        min={1}
        value={draft.season}
        onChange={(event) => set('season')(event.target.value)}
      />

      <TextField
        label="Number"
        type="number"
        min={0}
        value={draft.number}
        onChange={(event) => set('number')(event.target.value)}
        hint={
          episode.numberIsDerived
            ? 'This number was derived from release order, not published in the feed. Setting it by hand makes it real.'
            : undefined
        }
      />

      <TextField
        label="Duration (seconds)"
        type="number"
        min={1}
        value={draft.durationSeconds}
        onChange={(event) => set('durationSeconds')(event.target.value)}
      />

      <TextField
        label="Audio URL"
        type="url"
        value={draft.audioUrl}
        required={!episode.patreonPostId}
        onChange={(event) => set('audioUrl')(event.target.value)}
        hint={
          episode.patreonPostId
            ? `Patreon post ${episode.patreonPostId}. Empty until the public feed carries it — patrons play it from their own feed.`
            : undefined
        }
      />

      <TextField
        label="Artwork URL"
        type="url"
        value={draft.artworkUrl}
        onChange={(event) => set('artworkUrl')(event.target.value)}
      />

      <TextField
        label="Video URL"
        type="url"
        value={draft.videoUrl}
        onChange={(event) => set('videoUrl')(event.target.value)}
        hint="The episode's video version, which both apps offer as a link out. Empty is normal — nothing before 2020 was filmed, and some shows never are."
      />

      <TextArea
        label="Description"
        value={draft.description}
        onChange={(event) => set('description')(event.target.value)}
      />
    </Dialog>
  )
}
