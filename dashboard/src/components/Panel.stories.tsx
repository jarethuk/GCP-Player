import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button.js'
import { Panel } from './Panel.js'
import { Cell, Table } from './Table.js'

const meta = {
  title: 'Components/Panel',
  component: Panel,
} satisfies Meta<typeof Panel>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Recent runs',
    subtitle: 'The ingest runs daily at 06:00 UTC.',
    children: 'Anything at all.',
  },
}

export const WithAction: Story = {
  args: {
    title: 'Episodes',
    action: <Button size="small">Add episode</Button>,
    children: 'Anything at all.',
  },
}

/** A panel wrapping a table drops its padding so the rows own their edges. */
export const AroundATable: Story = {
  args: {
    title: 'Shows',
    flush: true,
    children: (
      <Table>
        <thead>
          <tr>
            <th>Show</th>
            <th>System</th>
            <th style={{ textAlign: 'right' }}>Episodes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Cell>Haunted City</Cell>
            <Cell dim>Blades in the Dark</Cell>
            <Cell numeric>45</Cell>
          </tr>
          <tr>
            <Cell>Androids &amp; Aliens</Cell>
            <Cell dim>Starfinder</Cell>
            <Cell numeric>156</Cell>
          </tr>
        </tbody>
      </Table>
    ),
  },
}
