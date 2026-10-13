import type { Meta, StoryObj } from '@storybook/react-vite'
import { Artwork } from './Artwork.js'

const meta = {
  title: 'Components/Artwork',
  component: Artwork,
  args: { url: null, title: 'Haunted City' },
} satisfies Meta<typeof Artwork>

export default meta
type Story = StoryObj<typeof meta>

/**
 * A show with no artwork, or artwork that failed to load: its initial, not a
 * broken-image glyph.
 */
export const Placeholder: Story = {}

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
      <Artwork url={null} title="Haunted City" size={28} />
      <Artwork url={null} title="Androids & Aliens" size={40} />
      <Artwork url={null} title="Get in the Trunk" size={96} />
    </div>
  ),
}
