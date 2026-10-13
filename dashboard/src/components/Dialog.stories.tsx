import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button.js'
import { Dialog } from './Dialog.js'
import { TextField } from './Field.js'

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    title: 'Edit show',
    onConfirm: () => undefined,
    onClose: () => undefined,
  },
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    subtitle: 'Saving hands this show to you: feed syncs will stop updating it.',
    children: <TextField label="Title" value="Haunted City" onChange={() => undefined} />,
  },
}

/**
 * An action belonging to the record rather than to the form. It sits at the
 * far end of the footer so it reads as a different kind of thing from Cancel
 * and Save, which are both ways of finishing the edit.
 */
export const WithSecondaryAction: Story = {
  args: {
    subtitle: 'Edited here, so feed syncs no longer touch this show — in any field.',
    secondary: <Button variant="quiet">Let the feeds manage this again</Button>,
    children: <TextField label="Title" value="Haunted City" onChange={() => undefined} />,
  },
}
