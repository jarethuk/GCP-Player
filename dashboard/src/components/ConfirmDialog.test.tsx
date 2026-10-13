import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog.js'

const onConfirm = vi.fn()

const open = (requireTyping?: string) =>
  render(
    <ConfirmDialog
      open
      title="Rebuild the catalogue from the feeds"
      body={<p>Every show and episode is deleted outright.</p>}
      confirmLabel="Delete everything and rebuild"
      {...(requireTyping === undefined ? {} : { requireTyping })}
      onConfirm={onConfirm}
      onClose={() => undefined}
    />,
  )

const confirmButton = () => screen.getByRole('button', { name: 'Delete everything and rebuild' })

/**
 * The gate in front of the worst thing the dashboard can do. A rebuild throws
 * away every hand edit in the catalogue, and unlike a delete there is nothing
 * to undo it with — so "confirm cannot fire by accident" is worth a test of
 * its own rather than being left to the component that happens to implement it.
 */
describe('a typed confirmation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('holds the action back until the exact words are typed', async () => {
    const user = userEvent.setup()
    open('delete-everything-and-resync')

    await user.click(confirmButton())
    expect(onConfirm).not.toHaveBeenCalled()

    // Most of the way there is still not there.
    await user.type(screen.getByRole('textbox'), 'delete-everything')
    await user.click(confirmButton())
    expect(onConfirm).not.toHaveBeenCalled()

    await user.type(screen.getByRole('textbox'), '-and-resync')
    await user.click(confirmButton())
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  // Enter submits from any field in these dialogs, which is a convenience
  // everywhere else and would be a loaded gun here.
  it('cannot be reached by pressing Enter in the field', async () => {
    const user = userEvent.setup()
    open('delete-everything-and-resync')

    await user.type(screen.getByRole('textbox'), 'nearly{Enter}')

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('leaves an ordinary confirmation alone', async () => {
    const user = userEvent.setup()
    open()

    await user.click(confirmButton())

    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
