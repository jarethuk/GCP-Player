import { type FormEvent, type ReactNode, useEffect, useRef } from 'react'
import { Button } from './Button.js'

export interface DialogProps {
  open: boolean
  title: string
  subtitle?: ReactNode
  /** Shown above the footer, in red. A failed save, usually. */
  error?: string | null | undefined
  confirmLabel?: string
  confirmVariant?: 'primary' | 'danger'
  /** Disables the confirm — an incomplete form, or a typed confirmation. */
  confirmDisabled?: boolean
  /**
   * An action that belongs to this record rather than to the form — it sits
   * apart from Cancel and Save, at the far end of the footer, because it is
   * not another way of finishing the edit.
   */
  secondary?: ReactNode
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
  children: ReactNode
}

/**
 * The native `<dialog>`, which brings the modal behaviour with it: the focus
 * trap, the inert background, Escape to close, and a backdrop that is a real
 * pseudo-element rather than a div this app has to stack correctly.
 *
 * The body is a form, so Enter submits from any field — every dialog here is
 * one short form, and reaching for the mouse to save is a papercut that adds
 * up over an afternoon of re-attributing episodes.
 */
export function Dialog({
  open,
  title,
  subtitle,
  error,
  confirmLabel = 'Save',
  confirmVariant = 'primary',
  confirmDisabled = false,
  secondary,
  busy = false,
  onConfirm,
  onClose,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  // `showModal()` rather than the `open` attribute: only the method call gets
  // the focus trap, the backdrop and the top layer.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!confirmDisabled && !busy) onConfirm()
  }

  return (
    <dialog
      ref={ref}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-[26px] border border-sky/15 bg-[rgb(10_32_52/0.94)] p-0 text-bone shadow-[0_30px_80px_rgb(0_0_0/0.55)] backdrop-blur-2xl backdrop:bg-black/45 backdrop:backdrop-blur-[2px] open:animate-dialog-in"
      // Escape closes the dialog itself; this is how the app hears about it.
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      aria-labelledby={`${title}-heading`}
    >
      <form onSubmit={submit}>
        <div className="px-6 pt-6">
          <h2 id={`${title}-heading`} className="text-[19px]">
            {title}
          </h2>
          {subtitle && <p className="mt-1.5 text-[13px] text-muted">{subtitle}</p>}
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          {children}
          {error && (
            <p className="rounded-lg border border-ember/45 bg-ember/12 px-3 py-2.5 text-[13px] text-ember">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-sky/15 px-6 py-4">
          {/* Pushed to the far end, away from Cancel and Save. */}
          {secondary && <div className="mr-auto">{secondary}</div>}
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant={confirmVariant} busy={busy} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
