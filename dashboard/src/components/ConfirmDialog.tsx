import { useEffect, useState } from 'react'
import { Dialog } from './Dialog.js'
import { TextField } from './Field.js'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** What is about to happen, and what it means downstream. */
  body: React.ReactNode
  confirmLabel: string
  /**
   * When set, the confirm stays disabled until this exact text is typed. For
   * the handful of actions where a mis-click would cost real work.
   */
  requireTyping?: string
  busy?: boolean
  error?: string | null | undefined
  onConfirm: () => void
  onClose: () => void
}

/** A destructive action, always in red, and never the default focus. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  requireTyping,
  busy = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  return (
    <Dialog
      open={open}
      title={title}
      confirmLabel={confirmLabel}
      confirmVariant="danger"
      confirmDisabled={requireTyping !== undefined && typed !== requireTyping}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      {body}
      {requireTyping !== undefined && (
        <TextField
          label={`Type "${requireTyping}" to confirm`}
          value={typed}
          autoComplete="off"
          onChange={(event) => setTyped(event.target.value)}
        />
      )}
    </Dialog>
  )
}
