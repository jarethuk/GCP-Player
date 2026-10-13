import { glassPanelClass } from '@gcp/web-components'
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from 'react'

interface Toast {
  id: number
  message: string
  tone: 'success' | 'failure'
}

interface ToastValue {
  /** Confirms something that has already happened. */
  succeeded: (message: string) => void
  /** Reports something that didn't, and stays until dismissed. */
  failed: (message: string) => void
}

const ToastContext = createContext<ToastValue | null>(null)

const SUCCESS_MS = 4000

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((message: string, tone: Toast['tone']) => {
    setToasts((current) => [...current, { id: nextId++, message, tone }])
  }, [])

  const succeeded = useCallback((message: string) => push(message, 'success'), [push])
  const failed = useCallback((message: string) => push(message, 'failure'), [push])

  return (
    <ToastContext value={{ succeeded, failed }}>
      {children}
      {/* `status` rather than `alert`: these confirm work the person just did,
          and an assertive interruption for "Saved" is worse than useless. A
          failure is already reported in place, next to the thing that failed. */}
      <div
        className="pointer-events-none fixed right-6 bottom-6 z-10 flex flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  )
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  // A success is a confirmation and goes on its own; a failure is something to
  // read and act on, so it stays until it is dismissed.
  useEffect(() => {
    if (toast.tone !== 'success') return
    const timer = setTimeout(() => onDismiss(toast.id), SUCCESS_MS)
    return () => clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div
      className={`${glassPanelClass} pointer-events-auto flex max-w-[420px] min-w-[260px] animate-dialog-in items-center gap-3 rounded-2xl px-4 py-3 text-[13.5px] ${toast.tone === 'failure' ? 'border-ember/50 text-ember' : 'text-bone'}`}
    >
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        className="shrink-0 px-1 text-[16px] leading-none text-muted hover:text-bone"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}

export function useToast(): ToastValue {
  const value = use(ToastContext)
  if (!value) throw new Error('useToast must be used inside a ToastProvider')
  return value
}
