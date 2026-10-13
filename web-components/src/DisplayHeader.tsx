import { MetaLabel } from './MetaLabel'

/**
 * The network opens every section with a spaced eyebrow over a heavy display
 * heading and a short gradient rule.
 */
export function DisplayHeader({
  eyebrow,
  title,
  size = 34,
  ruleWidth = 56,
  as: Heading = 'h1',
}: {
  eyebrow: string
  title: string
  size?: number
  ruleWidth?: number
  as?: 'h1' | 'h2'
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <MetaLabel showsTick={false} tone="sky">
        {eyebrow}
      </MetaLabel>
      <Heading
        className="font-display leading-none text-bone uppercase"
        style={{ fontSize: size, marginTop: size > 28 ? 2 : 0 }}
      >
        {title}
      </Heading>
      <span className="mt-1 h-[3px] rounded-full bg-accent-gradient" style={{ width: ruleWidth }} />
    </div>
  )
}
