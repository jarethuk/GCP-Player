/** The app's URLs. Shared by both layouts, so a link works whichever one opens it. */

export const paths = {
  shows: '/',
  settings: '/settings',
  show: (slug: string) => `/shows/${encodeURIComponent(slug)}`,
  episode: (slug: string, episodeId: string) =>
    `/shows/${encodeURIComponent(slug)}/episodes/${encodeURIComponent(episodeId)}`,
}
