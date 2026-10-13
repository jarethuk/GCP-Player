import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * The dark glass every floating surface is made of — menus, dialogs, sheets,
 * toasts: the navy thinned and blurred, with a hairline edge.
 */
export const glassPanelClass =
  'relative overflow-hidden border border-sky/15 bg-[rgb(10_32_52/0.92)] shadow-[0_20px_60px_rgb(0_0_0/0.55)] backdrop-blur-2xl'

/** A modal layer: a dimmed backdrop, Escape to dismiss, focus kept inside and handed back. */
export function Modal({
  onDismiss,
  label,
  dismissLabel,
  children,
  placement,
}: {
  onDismiss: () => void
  /** The dialog's accessible name. */
  label: string
  /** The backdrop's, which dismisses when clicked. */
  dismissLabel: string
  children: ReactNode
  placement: 'center' | 'bottom'
}) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    root.current?.querySelector<HTMLElement>('[data-autofocus], button, [href], input')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onDismiss()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      previous?.focus?.()
    }
  }, [onDismiss])

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className={`fixed inset-0 z-50 flex ${placement === 'center' ? 'items-center justify-center p-4' : 'items-end justify-center'}`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={dismissLabel}
        className="absolute inset-0 animate-fade-in cursor-default bg-black/45"
        onClick={onDismiss}
      />
      {children}
    </div>,
    document.body,
  )
}

/**
 * SwiftUI's confirmationDialog: as a sheet, an action sheet from the bottom —
 * what goes, the destructive button, and Cancel on its own; centred, the same
 * thing as a small card.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  presentation,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  /** A phone-sized window's action sheet, or a wide one's card. */
  presentation: 'sheet' | 'centered'
  onConfirm: () => void
  onCancel: () => void
}) {
  const body = (
    <>
      <div className="px-6 pt-5 pb-4 text-center">
        <p className="font-body text-[13px] font-semibold text-muted">{title}</p>
        <p className="mt-1.5 font-body text-[13px] leading-snug text-muted">{message}</p>
      </div>
      <div className="h-px bg-sky/15" />
      <button
        type="button"
        onClick={onConfirm}
        className="w-full py-4 font-body text-[18px] text-ember hover:bg-sky/5"
      >
        {confirmLabel}
      </button>
    </>
  )

  if (presentation === 'centered') {
    return (
      <Modal onDismiss={onCancel} label={title} dismissLabel={cancelLabel} placement="center">
        <div className={`${glassPanelClass} w-[320px] animate-dialog-in rounded-[26px]`}>
          {body}
          <div className="h-px bg-sky/15" />
          <button
            type="button"
            data-autofocus
            onClick={onCancel}
            className="w-full py-4 font-body text-[18px] font-semibold text-sky hover:bg-sky/5"
          >
            {cancelLabel}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal onDismiss={onCancel} label={title} dismissLabel={cancelLabel} placement="bottom">
      <div className="relative w-full max-w-[500px] animate-sheet-up px-2 pb-[max(8px,env(safe-area-inset-bottom))]">
        <div className={`${glassPanelClass} rounded-[26px]`}>{body}</div>
        <button
          type="button"
          data-autofocus
          onClick={onCancel}
          className={`${glassPanelClass} mt-2 w-full rounded-[26px] py-4 font-body text-[18px] font-semibold text-sky`}
        >
          {cancelLabel}
        </button>
      </div>
    </Modal>
  )
}

/** SwiftUI's alert: a title, a message and OK. */
export function AlertDialog({
  title,
  message,
  okLabel,
  onDismiss,
}: {
  title: string
  message: string
  okLabel: string
  onDismiss: () => void
}) {
  return (
    <Modal onDismiss={onDismiss} label={title} dismissLabel={okLabel} placement="center">
      <div className={`${glassPanelClass} w-[300px] animate-dialog-in rounded-[26px] text-center`}>
        <div className="px-6 pt-5 pb-4">
          <p className="font-body text-[17px] font-semibold text-bone">{title}</p>
          <p className="mt-1.5 font-body text-[13px] leading-snug whitespace-pre-line text-bone/85">
            {message}
          </p>
        </div>
        <div className="h-px bg-sky/15" />
        <button
          type="button"
          onClick={onDismiss}
          className="w-full py-3.5 font-body text-[17px] font-semibold text-sky hover:bg-sky/5"
        >
          {okLabel}
        </button>
      </div>
    </Modal>
  )
}
