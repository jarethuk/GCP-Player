import type { Meta, StoryObj } from '@storybook/react-vite'
import { chipTemplate } from '../data/logic'
import { sampleEpisodes, withServices } from '../test/storyServices'
import { EpisodeActionsMenu } from './EpisodeActionsMenu'
import { EpisodeRow } from './EpisodeRow'

const meta: Meta = { title: 'Episodes', decorators: [withServices()] }
export default meta

const template = chipTemplate(sampleEpisodes)

function List({ hasToken }: { hasToken: boolean }) {
  return (
    <ul className="w-[390px] bg-ink">
      {sampleEpisodes.map((episode) => (
        <li key={episode.guid}>
          <EpisodeRow
            episode={episode}
            hasToken={hasToken}
            template={template}
            menu={(face) => (
              <EpisodeActionsMenu
                episode={episode}
                className="flex size-9 items-center justify-center rounded-full text-muted hover:text-bone"
              >
                {face}
              </EpisodeActionsMenu>
            )}
          />
          <div className="mx-4 h-px bg-line" />
        </li>
      ))}
    </ul>
  )
}

/** Played, part-way, and an early release — padlocked, with no token. */
export const WithoutPatreon: StoryObj = { render: () => <List hasToken={false} /> }

/** The early release unlocked, and marked as Patreon's. */
export const WithPatreon: StoryObj = { render: () => <List hasToken /> }
