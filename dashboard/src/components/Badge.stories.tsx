import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge, OverriddenBadge, SyncStatusBadge } from './Badge.js'

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'New' },
} satisfies Meta<typeof Badge>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <Badge>Disabled</Badge>
      <Badge tone="sky">New</Badge>
      <Badge tone="ember">9</Badge>
      <Badge tone="moss" dot>
        OK
      </Badge>
    </div>
  ),
}

/** The three states a sync run can be in, and the only green in the product. */
export const SyncStatuses: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      <SyncStatusBadge status="RUNNING" />
      <SyncStatusBadge status="SUCCEEDED" />
      <SyncStatusBadge status="FAILED" />
    </div>
  ),
}

/**
 * A row ingest no longer touches. Neutral on purpose — it is a state someone
 * chose, not something that needs attention, and red in this product means
 * only the second thing.
 */
export const Overridden: Story = {
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontWeight: 600 }}>Haunted City</span>
      <OverriddenBadge />
    </div>
  ),
}
