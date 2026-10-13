import { useEffect, useState } from 'react'
import { ApiError, type ShowInput } from '../api/client.js'
import { useCreateShow, useUpdateShow } from '../api/hooks.js'
import type { ShowWithCounts } from '../api/types.js'
import { Button } from '../components/Button.js'
import { Dialog } from '../components/Dialog.js'
import { TextArea, TextField } from '../components/Field.js'
import { useToast } from '../components/Toast.js'
import { toSlug } from '../lib/format.js'

/** Empty strings on the wire mean "no value", not "the empty string". */
const trimmed = (value: string): string | null => value.trim() || null

interface Draft {
  slug: string
  title: string
  system: string
  description: string
  artworkUrl: string
  matchPattern: string
  patreonShowId: string
}

const emptyDraft: Draft = {
  slug: '',
  title: '',
  system: '',
  description: '',
  artworkUrl: '',
  matchPattern: '',
  patreonShowId: '',
}

const draftFrom = (show: ShowWithCounts): Draft => ({
  slug: show.slug,
  title: show.title,
  system: show.system ?? '',
  description: show.description ?? '',
  artworkUrl: show.artworkUrl ?? '',
  matchPattern: show.matchPattern ?? '',
  patreonShowId: show.patreonShowId ?? '',
})

export interface ShowDialogProps {
  open: boolean
  /**
   * The show being edited, or null to create one. The dashboard's shape rather
   * than the public one, because `matchPattern` is only on that.
   */
  show: ShowWithCounts | null
  onClose: () => void
}

/**
 * Creating or editing a show.
 *
 * Two fields here are not cosmetic, and both are called out in the form:
 *
 * - **Title** is how episodes are attributed. The main feed encodes the show in
 *   the middle segment of every item's title, and the parser matches on this
 *   string exactly — changing it silently orphans the next sync's episodes.
 * - **Match pattern** claims episodes whose titles never use that format at all
 *   (Cannon Fodder, GCN News Minute, Strange Aeons…).
 */
export function ShowDialog({ open, show, onClose }: ShowDialogProps) {
  const toast = useToast()
  const create = useCreateShow()
  const update = useUpdateShow()

  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState<string | null>(null)
  // A slug the person has typed is theirs; one this dialog derived follows the
  // title until they touch it.
  const [slugIsOwn, setSlugIsOwn] = useState(false)

  // Reset every time it opens, so the previous show's values never linger.
  useEffect(() => {
    if (!open) return
    setDraft(show ? draftFrom(show) : emptyDraft)
    setSlugIsOwn(show !== null)
    setError(null)
  }, [open, show])

  const set = (field: keyof Draft) => (value: string) =>
    setDraft((current) => ({ ...current, [field]: value }))

  const setTitle = (title: string) =>
    setDraft((current) => ({
      ...current,
      title,
      ...(slugIsOwn ? {} : { slug: toSlug(title) }),
    }))

  const input: ShowInput = {
    slug: draft.slug.trim(),
    title: draft.title.trim(),
    system: trimmed(draft.system),
    description: trimmed(draft.description),
    artworkUrl: trimmed(draft.artworkUrl),
    matchPattern: trimmed(draft.matchPattern),
    patreonShowId: trimmed(draft.patreonShowId),
  }

  /**
   * Hands the show back to the feeds.
   *
   * Deliberately not part of Save — saving is an edit, and an edit is what set
   * the flag in the first place. This sends nothing but the release, so
   * whatever is half-typed in the form is discarded rather than quietly
   * committed on the way out.
   */
  const release = async () => {
    if (!show) return
    setError(null)

    try {
      await update.mutateAsync({ id: show.id, input: { overridden: false } })
      toast.succeeded(`${show.title} follows the feeds again`)
      onClose()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That could not be saved.')
    }
  }

  const save = async () => {
    setError(null)

    // A bad regex reaches the API as a perfectly valid string and only fails
    // on the next sync, hours later and nowhere near this form.
    if (input.matchPattern !== null) {
      try {
        new RegExp(input.matchPattern, 'i')
      } catch (cause) {
        setError(`That match pattern is not a valid regular expression: ${String(cause)}`)
        return
      }
    }

    try {
      if (show) {
        await update.mutateAsync({ id: show.id, input })
        toast.succeeded(`Saved ${input.title}`)
      } else {
        await create.mutateAsync(input)
        toast.succeeded(`Added ${input.title}`)
      }
      onClose()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That could not be saved.')
    }
  }

  return (
    <Dialog
      open={open}
      title={show ? 'Edit show' : 'Add show'}
      subtitle={
        show?.overridden
          ? 'Edited here, so feed syncs no longer touch this show — in any field.'
          : show
            ? 'Saving hands this show to you: feed syncs will stop updating it.'
            : 'A show the feeds do not create on their own.'
      }
      confirmLabel={show ? 'Save' : 'Add show'}
      confirmDisabled={!input.title || !input.slug}
      secondary={
        show?.overridden ? (
          <Button variant="quiet" onClick={() => void release()} disabled={update.isPending}>
            Let the feeds manage this again
          </Button>
        ) : null
      }
      busy={create.isPending || update.isPending}
      error={error}
      onConfirm={() => void save()}
      onClose={onClose}
    >
      <TextField
        label="Title"
        value={draft.title}
        required
        onChange={(event) => setTitle(event.target.value)}
        hint="Exactly as it appears in the middle segment of a feed item's title — this string is how episodes are attributed."
      />
      <TextField
        label="Slug"
        value={draft.slug}
        required
        maxLength={80}
        onChange={(event) => {
          setSlugIsOwn(true)
          set('slug')(event.target.value)
        }}
        hint="Part of the URL the phone apps key on. Changing it on an existing show is a migration, not a rename."
      />
      <TextField
        label="System"
        value={draft.system}
        onChange={(event) => set('system')(event.target.value)}
        hint="Game system or campaign. Display only."
      />
      <TextArea
        label="Description"
        value={draft.description}
        onChange={(event) => set('description')(event.target.value)}
      />
      <TextField
        label="Artwork URL"
        type="url"
        value={draft.artworkUrl}
        onChange={(event) => set('artworkUrl')(event.target.value)}
      />
      <TextField
        label="Match pattern"
        value={draft.matchPattern}
        onChange={(event) => set('matchPattern')(event.target.value)}
        hint="A case-insensitive regex claiming episodes whose titles never carry the show name. Leave empty unless the show needs one."
      />
      <TextField
        label="Patreon collection"
        value={draft.patreonShowId}
        inputMode="numeric"
        onChange={(event) => set('patreonShowId')(event.target.value)}
        hint="The number in patreon.com/collection/… — and the show= in a patron's feed URL. Syncs fill it in for most shows; set it when a collection's title names a different show."
      />
    </Dialog>
  )
}
