import type { Decorator } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'
import { MemoryRouter } from 'react-router'
import { ServicesContext, WideLayoutContext } from '../app/hooks'
import { createServices, type Services } from '../app/services'
import { openDatabase } from '../data/db'
import { Library } from '../data/library'
import type { Episode, Show } from '../data/types'
import { episode, FakeCatalogue, show } from './fixtures'

const day = 24 * 60 * 60 * 1000

export const sampleShow: Show = show({
  slug: 'blood-of-the-wild',
  title: 'Blood of the Wild',
  system: 'Pathfinder 2E',
  artworkUrl:
    'https://megaphone.imgix.net/podcasts/cce8429a-a63d-11f1-93e9-eb0a85a2f8fc/image/f6a9c4938e7166216c2b3c61e94dabb3.jpg?ixlib=rails-4.3.1&max-w=3000&max-h=3000&fit=crop&auto=format,compress',
  latestEpisodeAt: Date.now() - day,
  latestPublicEpisodeAt: Date.now() - day,
  latestAnyEpisodeAt: Date.now() - day,
  isStarred: true,
})

export const sampleEpisodes: Episode[] = [
  episode({
    guid: 'e1',
    id: 'e1',
    title: "Shaggy's Fight",
    season: 1,
    number: 38,
    publishedAt: Date.now() - 14 * day,
    isPlayed: true,
  }),
  episode({
    guid: 'e2',
    id: 'e2',
    title: 'A-Moose Bouche',
    season: 1,
    number: 39,
    publishedAt: Date.now() - 7 * day,
    positionSeconds: 1742,
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    description: '<p>The party heads north. <b>Moose</b> ensue.</p>',
  }),
  episode({
    guid: 'patreon:1',
    id: 'e3',
    title: 'The Early One',
    season: 1,
    number: 40,
    audioUrl: null,
    patreonPostId: '1',
    publishedAt: Date.now() - day,
  }),
].map((item) => ({ ...item, showSlug: sampleShow.slug }))

/**
 * Real services on an IndexedDB of Storybook's own, seeded with a show and
 * three episodes, and a catalogue that answers with nothing — so a story can
 * use anything that needs the library or the player without the network.
 */
function StoryServices({ children, playing }: { children: ReactNode; playing: boolean }) {
  const [services, setServices] = useState<Services | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const library = await Library.open(await openDatabase('storybook'))
      await library.write({ putShows: [sampleShow], putEpisodes: sampleEpisodes })
      const next = createServices(library, new FakeCatalogue())
      if (playing) {
        await library.setMeta('lastPlayedEpisodeGuid', 'e2')
        await next.player.restoreLastEpisode()
      }
      if (!cancelled) setServices(next)
    })()
    return () => {
      cancelled = true
    }
  }, [playing])
  if (!services) return null
  return <ServicesContext value={services}>{children}</ServicesContext>
}

export function withServices({ playing = false, wide = false } = {}): Decorator {
  return (Story) => (
    <StoryServices playing={playing}>
      <WideLayoutContext value={wide}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </WideLayoutContext>
    </StoryServices>
  )
}
