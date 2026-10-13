import type { Meta, StoryObj } from '@storybook/react-vite'
import { RESYNC_CONFIRMATION } from '../api/client.js'
import { ConfirmDialog } from './ConfirmDialog.js'

const meta = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onConfirm: () => undefined,
    onClose: () => undefined,
  },
} satisfies Meta<typeof ConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: 'Delete episode',
    body: (
      <p>
        “Tsunami of Evil” is removed from the catalogue, and every phone holding it drops its copy
        on the next sync — including anything it had downloaded.
      </p>
    ),
    confirmLabel: 'Delete episode',
  },
}

/**
 * The most destructive thing the dashboard can do, and the only one that can
 * lose work rather than just data: a rebuild throws away every hand edit.
 * Confirm stays disabled until the exact string is typed, so it cannot be
 * reached by a mis-click or by pressing Enter on an open dialog.
 */
export const RebuildTheCatalogue: Story = {
  args: {
    title: 'Rebuild the catalogue from the feeds',
    body: (
      <>
        <p>
          Every show and episode is <strong>deleted outright</strong> — not tombstoned — and then
          rebuilt by reading the feeds from scratch. It takes about a minute.
        </p>
        <p>
          <strong>Everything edited here is lost.</strong> Corrected titles, episodes attributed by
          hand, video links, descriptions: all of it comes back as the feeds have it, and every row
          marked <em>Edited</em> stops being marked.
        </p>
        <p>
          Phones are fine. They key on guid and slug, which the rebuild reproduces exactly, so what
          was played, where you had got to and anything downloaded all survive — but every row's
          timestamp moves, so each one re-downloads the whole catalogue once.
        </p>
      </>
    ),
    confirmLabel: 'Delete everything and rebuild',
    requireTyping: RESYNC_CONFIRMATION,
  },
}
