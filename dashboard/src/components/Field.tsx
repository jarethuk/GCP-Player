import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'

interface FieldShell {
  label: string
  /** Sits under the control. Explains what the field is for. */
  hint?: ReactNode
  /** Replaces the hint, in red, and marks the control invalid. */
  error?: string | null | undefined
}

/**
 * The web app's text field — the Patreon link box in Settings: ink well,
 * hairline edge, the edge brightening to sky while it has focus.
 */
const control =
  'w-full rounded-lg border bg-ink px-2.5 py-2.5 font-body text-[13px] text-bone outline-none transition-colors placeholder:text-muted/60 hover:border-sky/35 focus:border-sky/60 disabled:cursor-not-allowed disabled:opacity-50'

const edge = (error: FieldShell['error']) => (error ? 'border-ember' : 'border-line')

function Shell({
  label,
  hint,
  error,
  id,
  children,
}: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="meta text-muted" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-ember" id={`${id}-message`}>
          {error}
        </p>
      ) : (
        hint && (
          <p className="text-[12px] text-muted" id={`${id}-message`}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export type TextFieldProps = FieldShell &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> & {
    /** The sign-in code: one value, set large and widely tracked. */
    variant?: 'default' | 'code'
  }

export function TextField({ label, hint, error, variant = 'default', ...rest }: TextFieldProps) {
  const id = useId()
  // The tracking follows the last character too; the indent puts the block
  // back in the middle.
  const code =
    variant === 'code'
      ? 'py-3.5 text-center text-[28px] font-bold tracking-[0.4em] indent-[0.4em]'
      : ''

  return (
    <Shell label={label} hint={hint} error={error} id={id}>
      <input
        id={id}
        className={`${control} ${edge(error)} ${code}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-message` : undefined}
        {...rest}
      />
    </Shell>
  )
}

export type TextAreaProps = FieldShell &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id'>

export function TextArea({ label, hint, error, ...rest }: TextAreaProps) {
  const id = useId()

  return (
    <Shell label={label} hint={hint} error={error} id={id}>
      <textarea
        id={id}
        className={`${control} ${edge(error)} min-h-[92px] resize-y leading-[1.55]`}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-message` : undefined}
        {...rest}
      />
    </Shell>
  )
}

export type SelectFieldProps = FieldShell &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id'> & { children: ReactNode }

/** The native arrow is drawn in the platform's colour; this one is muted like the rest. */
const arrow =
  'appearance-none bg-[length:5px_5px,5px_5px] bg-[position:calc(100%-16px)_50%,calc(100%-11px)_50%] bg-no-repeat bg-[image:linear-gradient(45deg,transparent_50%,var(--color-muted)_50%),linear-gradient(135deg,var(--color-muted)_50%,transparent_50%)] pr-8'

export function SelectField({ label, hint, error, children, ...rest }: SelectFieldProps) {
  const id = useId()

  return (
    <Shell label={label} hint={hint} error={error} id={id}>
      <select
        id={id}
        className={`${control} ${edge(error)} ${arrow}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-message` : undefined}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  )
}
