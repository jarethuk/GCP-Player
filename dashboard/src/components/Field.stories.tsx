import type { Meta, StoryObj } from '@storybook/react-vite'
import { SelectField, TextArea, TextField } from './Field.js'

const meta = {
  title: 'Components/Fields',
  component: TextField,
  args: { label: 'Title', defaultValue: 'Haunted City' },
} satisfies Meta<typeof TextField>

export default meta
type Story = StoryObj<typeof meta>

export const Text: Story = {
  args: {
    hint: "Exactly as it appears in the middle segment of a feed item's title.",
  },
}

export const Invalid: Story = {
  args: { error: 'A show with that title already exists.' },
}

export const Disabled: Story = {
  args: { disabled: true },
}

/** The sign-in code: one value, read a character at a time. */
export const Code: Story = {
  args: {
    label: 'Code',
    variant: 'code',
    defaultValue: '042196',
    hint: 'Sent to ada@example.com. It expires in ten minutes.',
  },
}

export const Everything: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
      <TextField label="Slug" defaultValue="haunted-city" />
      <SelectField label="Show" defaultValue="" hint="Unattributed until you pick one.">
        <option value="">— Unattributed —</option>
        <option value="1">Haunted City</option>
        <option value="2">Androids &amp; Aliens</option>
      </SelectField>
      <TextArea label="Description" defaultValue="Blades in the Dark, in a city that remembers." />
    </div>
  ),
}
