/**
 * The shared components that carry words, with the web app's words in them.
 *
 * @gcp/web-components takes every label as a prop, so the dashboard can bring
 * its own; this file is where the web app hands over its copy — from
 * copy/strings.yaml, like the phones — and, for the dialogs, whether it is
 * drawing the phone layout or the wide one.
 */

import {
  Chip,
  LockChip,
  AlertDialog as SharedAlertDialog,
  ConfirmDialog as SharedConfirmDialog,
  GradientPlayButton as SharedGradientPlayButton,
  Menu as SharedMenu,
  Modal as SharedModal,
  SkipButton as SharedSkipButton,
} from '@gcp/web-components'
import type { ComponentProps } from 'react'
import { useIsWide } from '../app/hooks'
import { Copy } from '../copy/copy'

/** Red means one thing only: a show has published something you haven't heard. */
export function NewChip() {
  return <Chip tone="new">{Copy.Shows.newChip}</Chip>
}

export function PatreonLockChip({ onArtwork = false }: { onArtwork?: boolean }) {
  return <LockChip label={Copy.Episode.a11yLocked} onArtwork={onArtwork} />
}

export function GradientPlayButton(
  props: Omit<ComponentProps<typeof SharedGradientPlayButton>, 'playLabel' | 'pauseLabel'>,
) {
  return (
    <SharedGradientPlayButton
      {...props}
      playLabel={Copy.Episode.play}
      pauseLabel={Copy.Episode.pause}
    />
  )
}

export function SkipButton(props: Omit<ComponentProps<typeof SharedSkipButton>, 'label'>) {
  return <SharedSkipButton {...props} label={Copy.Player.a11ySkip(props.seconds)} />
}

export function Menu(props: Omit<ComponentProps<typeof SharedMenu>, 'dismissLabel'>) {
  return <SharedMenu {...props} dismissLabel={Copy.Common.cancel} />
}

export function Modal(props: Omit<ComponentProps<typeof SharedModal>, 'dismissLabel'>) {
  return <SharedModal {...props} dismissLabel={Copy.Common.cancel} />
}

/** An action sheet on a phone, a small card in the wide layout. */
export function ConfirmDialog(
  props: Omit<ComponentProps<typeof SharedConfirmDialog>, 'cancelLabel' | 'presentation'>,
) {
  const isWide = useIsWide()
  return (
    <SharedConfirmDialog
      {...props}
      cancelLabel={Copy.Common.cancel}
      presentation={isWide ? 'centered' : 'sheet'}
    />
  )
}

export function AlertDialog(props: Omit<ComponentProps<typeof SharedAlertDialog>, 'okLabel'>) {
  return <SharedAlertDialog {...props} okLabel={Copy.Common.ok} />
}
