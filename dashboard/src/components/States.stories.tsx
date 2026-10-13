import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button.js'
import { EmptyState, ErrorState, Loading, SkeletonRows } from './States.js'

const meta = {
  title: 'Components/States',
  component: EmptyState,
  args: { title: 'Everything is attributed' },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: { detail: 'Every episode in the catalogue belongs to a show.' },
}

export const EmptyWithAction: Story = {
  args: {
    title: 'No shows yet',
    detail: 'Run a feed sync and the network’s shows appear here.',
    action: <Button variant="primary">Run sync now</Button>,
  },
}

export const Failed: Story = {
  render: () => <ErrorState detail="Could not reach the API." onRetry={() => undefined} />,
}

export const Spinner: Story = {
  render: () => <Loading label="Loading the show" />,
}

/** Rows that aren't there yet, at the size they will be. */
export const Skeleton: Story = {
  render: () => <SkeletonRows rows={5} />,
}
