/**
 * The network's pill toggle: a gradient slug behind the selected option,
 * spaced uppercase labels either side.
 */
export function SegmentedPicker<T extends string>({
  options,
  selection,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[]
  selection: T
  onChange: (value: T) => void
  label?: string
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === selection),
  )
  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative flex gap-1 rounded-lg border border-line bg-ink-deep/70 p-[3px]"
    >
      <span
        aria-hidden="true"
        className="absolute top-[3px] bottom-[3px] left-[3px] rounded-md bg-accent-gradient transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 6px - ${(options.length - 1) * 4}px) / ${options.length})`,
          transform: `translateX(calc(${index} * (100% + 4px)))`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === selection
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`relative flex-1 py-[7px] font-body text-[10px] leading-[14px] font-bold tracking-[1.6px] uppercase transition-colors duration-200 ${selected ? 'text-ink-deep' : 'text-muted hover:text-bone'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
