import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShowWithCounts } from '../api/types.js'
import { ToastProvider } from '../components/Toast.js'
import { ShowDialog } from './ShowDialog.js'

const updateMutate = vi.fn()
const createMutate = vi.fn()

vi.mock('../api/hooks.js', () => ({
  useCreateShow: () => ({ mutateAsync: createMutate, isPending: false }),
  useUpdateShow: () => ({ mutateAsync: updateMutate, isPending: false }),
}))

const show: ShowWithCounts = {
  id: 'show_1',
  slug: 'haunted-city',
  title: 'Haunted City',
  system: 'Blades in the Dark',
  description: null,
  artworkUrl: null,
  matchPattern: null,
  patreonShowId: null,
  isPublic: true,
  overridden: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  episodeCount: 45,
  latestEpisodeAt: '2026-01-01T00:00:00.000Z',
}

const open = (overrides: Partial<ShowWithCounts> = {}) =>
  render(
    <ToastProvider>
      <ShowDialog open show={{ ...show, ...overrides }} onClose={() => undefined} />
    </ToastProvider>,
  )

const releaseButton = () => screen.queryByRole('button', { name: /let the feeds manage this/i })

describe('releasing a show back to the feeds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateMutate.mockResolvedValue(undefined)
  })

  // The flag is only safe to set automatically if there is a way back, and the
  // way back has to be visible from the row it applies to.
  it('offers the release only on a show that has been edited', () => {
    open({ overridden: false })
    expect(releaseButton()).toBeNull()
  })

  it('offers it once the show is overridden', () => {
    open({ overridden: true })
    expect(releaseButton()).not.toBeNull()
  })

  it('sends the release alone, discarding anything half-typed', async () => {
    const user = userEvent.setup()
    open({ overridden: true })

    // A change nobody asked to save. Releasing is not a save, and committing
    // this on the way out would be the opposite of handing the row back.
    await user.clear(screen.getByLabelText(/^System/i))
    await user.type(screen.getByLabelText(/^System/i), 'Something else')

    const button = releaseButton()
    if (!button) throw new Error('expected the release control')
    await user.click(button)

    expect(updateMutate).toHaveBeenCalledWith({
      id: 'show_1',
      input: { overridden: false },
    })
  })

  it('still marks the row as edited when Save is used instead', async () => {
    const user = userEvent.setup()
    open({ overridden: true })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    // The server sets `overridden` on any edit, so the dialog says nothing
    // about it — sending false here would release the row by accident.
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.not.objectContaining({ overridden: false }) }),
    )
  })
})
