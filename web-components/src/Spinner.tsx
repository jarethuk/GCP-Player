/** The system activity indicator: eight spokes, fading round. */
export function Spinner({
  size = 20,
  className = 'text-sky',
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin [animation-duration:0.9s] [animation-timing-function:steps(8)] ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed set of spokes
          key={i}
          x="11"
          y="2"
          width="2.4"
          height="6"
          rx="1.2"
          fill="currentColor"
          opacity={0.25 + (i / 8) * 0.75}
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
    </svg>
  )
}
