import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlertDialog, ConfirmDialog } from './Dialogs'
import { RefreshIcon } from './Icons'
import { Menu } from './Menu'

const meta: Meta = { title: 'Dialogs' }
export default meta

const confirm = (presentation: 'sheet' | 'centered') => (
  <ConfirmDialog
    title="Clear data and resync?"
    message="Everything this browser holds is deleted and fetched again."
    confirmLabel="Clear and Resync"
    cancelLabel="Cancel"
    presentation={presentation}
    onConfirm={() => {}}
    onCancel={() => {}}
  />
)

export const ActionSheet: StoryObj = { render: () => confirm('sheet') }

export const ConfirmCentered: StoryObj = { render: () => confirm('centered') }

export const Alert: StoryObj = {
  render: () => (
    <AlertDialog
      title="Couldn't resync"
      message={"Couldn't reach the catalogue.\n\nThe local copy has been cleared."}
      okLabel="OK"
      onDismiss={() => {}}
    />
  ),
}

export const PullDownMenu: StoryObj = {
  render: () => (
    <div className="flex justify-end">
      <Menu
        label="More"
        dismissLabel="Close"
        className="rounded-full border border-line bg-surface px-4 py-2 text-sky"
        entries={[
          { key: 'a', label: 'Mark as Played', icon: <RefreshIcon size={18} /> },
          'divider',
          {
            key: 'b',
            label: 'Clear Data and Resync',
            icon: <RefreshIcon size={18} />,
            destructive: true,
          },
        ]}
      >
        Open the menu
      </Menu>
    </div>
  ),
}
