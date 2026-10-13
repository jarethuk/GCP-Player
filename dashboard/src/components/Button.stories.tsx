import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button.js'

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Run sync now' },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The gradient, and the one place in the whole dashboard it appears. In the
 * phone apps the rule is "once per screen, on the thing that plays"; here it
 * marks the one action a page is actually for.
 */
export const Primary: Story = {
  args: { variant: 'primary' },
}

/** The workhorse: everything a page offers that isn't its headline action. */
export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Edit show' },
}

/** Red means one thing only. Here, that this destroys something. */
export const Danger: Story = {
  args: { variant: 'danger', children: 'Delete show' },
}

/** Row-level actions, where a pill would out-shout the row it sits in. */
export const Quiet: Story = {
  args: { variant: 'quiet', size: 'small', children: 'Edit' },
}

/** The spinner replaces the label, so the button doesn't change width. */
export const Busy: Story = {
  args: { variant: 'primary', busy: true },
}

export const Disabled: Story = {
  args: { variant: 'primary', disabled: true },
}

export const EveryVariant: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="quiet">Quiet</Button>
    </div>
  ),
}
