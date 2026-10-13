/**
 * An on/off switch in iOS's manner: a pill that fills sky when on, the knob
 * sliding across. A real checkbox underneath, so it is a switch to a screen
 * reader and a click anywhere on the label that wraps it flips it.
 */
export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  /** The accessible name, where no visible label wraps the switch. */
  label?: string
  /** For a label elsewhere to name it with htmlFor. */
  id?: string
}) {
  return (
    <span className="relative inline-flex h-[31px] w-[51px] shrink-0">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        aria-checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="peer absolute inset-0 z-10 cursor-pointer appearance-none rounded-full"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-bone/15 transition-colors duration-200 peer-checked:bg-sky peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky"
      />
      <span
        aria-hidden="true"
        className="absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.3)] transition-transform duration-200 peer-checked:translate-x-5"
      />
    </span>
  )
}
