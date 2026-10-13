import type { Meta, StoryObj } from '@storybook/react-vite'
import { MetaLabel } from './MetaLabel.js'

const meta = {
  title: 'Components/MetaLabel',
  component: MetaLabel,
  args: { children: 'Pathfinder 2E' },
} satisfies Meta<typeof MetaLabel>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The site's own metadata treatment: bold uppercase, widely tracked, behind a
 * short blue tick. The same component as `MetaLabel` in the iOS app.
 */
export const Default: Story = {}

/** Inside a dense table cell, where the tick is one mark too many. */
export const WithoutTick: Story = {
  args: { tick: false },
}

export const Tones: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <MetaLabel>Muted</MetaLabel>
      <MetaLabel tone="sky">Sky</MetaLabel>
      <MetaLabel tone="bone">Bone</MetaLabel>
      <MetaLabel tone="ember">Nine unattributed</MetaLabel>
    </div>
  ),
}
