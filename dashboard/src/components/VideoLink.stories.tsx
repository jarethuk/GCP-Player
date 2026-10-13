import type { Meta, StoryObj } from '@storybook/react-vite'
import { OverriddenBadge } from './Badge.js'
import { VideoLink } from './VideoLink.js'

const meta = {
  title: 'Components/VideoLink',
  component: VideoLink,
  args: { url: 'https://youtu.be/EXAMPLEvideo42' },
} satisfies Meta<typeof VideoLink>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

const Row = ({ title, url, edited }: { title: string; url: string | null; edited?: boolean }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span>{title}</span>
      <VideoLink url={url} />
      {edited && <OverriddenBadge />}
    </span>
    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
      {title} | Haunted City S2 E20 | Blades in the Dark
    </span>
  </div>
)

/**
 * How it actually reads: a marker in a list where only some rows have one.
 * The rows without a video draw nothing, which is what makes the column
 * scannable — a greyed-out icon on six hundred rows would say nothing at all.
 */
export const InEpisodeRows: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
      <Row title="Tsunami of Evil" url="https://youtu.be/EXAMPLEvideo42" />
      <Row title="Sky King" url={null} />
      <Row title="Walkabout" url="https://youtu.be/EXAMPLEvideo43" edited />
    </div>
  ),
}
