import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export type MenuEntry =
  | {
      key: string
      label: string
      icon?: ReactNode
      onSelect?: () => void
      destructive?: boolean
      /** Shown, but only as information — "Patreon Only". */
      disabled?: boolean
    }
  | 'divider'

/**
 * A pull-down menu in iOS 26's manner: a dark glass panel opening over its
 * button, right edges aligned, the icon ahead of each label.
 */
export function Menu({
  entries,
  label,
  dismissLabel,
  className = '',
  children,
}: {
  entries: readonly MenuEntry[]
  /** The button's accessible name. */
  label: string
  /** The name of the invisible layer that closes the menu when clicked. */
  dismissLabel: string
  className?: string
  /** The button's face. */
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()

  const close = useCallback(() => {
    setOpen(false)
    trigger.current?.focus()
  }, [])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          // Rows are links; the menu inside one mustn't follow it.
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
        className={className}
      >
        {children}
      </button>
      {open && trigger.current && (
        <MenuPanel
          id={id}
          entries={entries}
          anchor={trigger.current}
          dismissLabel={dismissLabel}
          onClose={close}
        />
      )}
    </>
  )
}

function MenuPanel({
  id,
  entries,
  anchor,
  dismissLabel,
  onClose,
}: {
  id: string
  entries: readonly MenuEntry[]
  anchor: HTMLElement
  dismissLabel: string
  onClose: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null)

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect()
    const height = panel.current?.offsetHeight ?? 0
    const margin = 8
    const right = Math.max(margin, window.innerWidth - rect.right)
    // Over the button where it fits below; otherwise its bottom edge on the button's.
    let top = rect.top
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.bottom - height)
    setPosition({ top, right })
  }, [anchor])

  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const dismiss = () => onClose()
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [onClose])

  const onKeyDown = (event: KeyboardEvent) => {
    const items = [
      ...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(index + 1) % items.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(index - 1 + items.length) % items.length]?.focus()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        tabIndex={-1}
        aria-label={dismissLabel}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        ref={panel}
        id={id}
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="absolute min-w-[250px] max-w-[min(320px,calc(100vw-16px))] origin-top-right animate-dialog-in overflow-hidden rounded-[26px] border border-sky/20 bg-[rgb(10_32_52/0.86)] py-2 shadow-[0_18px_50px_rgb(0_0_0/0.5)] backdrop-blur-2xl"
        style={
          position
            ? { top: position.top, right: position.right }
            : { top: -9999, right: 0, visibility: 'hidden' }
        }
      >
        {entries.map((entry, index) =>
          entry === 'divider' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: dividers have no identity of their own
            <hr key={`divider-${index}`} className="mx-6 my-2 h-px border-0 bg-sky/15" />
          ) : (
            <button
              key={entry.key}
              type="button"
              role="menuitem"
              disabled={entry.disabled}
              onClick={() => {
                onClose()
                entry.onSelect?.()
              }}
              className={`flex w-full items-center gap-4 px-6 py-[11px] text-left font-body text-[17px] leading-snug outline-none hover:bg-sky/10 focus-visible:bg-sky/10 disabled:hover:bg-transparent ${
                entry.destructive ? 'text-ember' : entry.disabled ? 'text-bone/55' : 'text-bone'
              }`}
            >
              <span
                className={`flex w-5 shrink-0 justify-center ${entry.destructive ? 'text-ember' : 'text-sky'}`}
              >
                {entry.icon}
              </span>
              <span>{entry.label}</span>
            </button>
          ),
        )}
      </div>
    </div>,
    document.body,
  )
}
