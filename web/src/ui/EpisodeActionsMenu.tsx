import {
  CheckCircleIcon,
  ChecklistIcon,
  CircleIcon,
  DownloadIcon,
  LockIcon,
  type MenuEntry,
  TrashIcon,
} from '@gcp/web-components'
import { useDownloadProgress, useHasToken, useServices } from '../app/hooks'
import { Copy } from '../copy/copy'
import { markAllPreviousPlayed, markPlayed } from '../data/actions'
import { isDownloaded, isLocked } from '../data/logic'
import type { Episode } from '../data/types'
import { Menu } from './Localized'
import { useOpenOnYouTube, watchOnYouTubeEntry } from './WatchOnYouTube'

/** The "…" menu for an episode, on list rows and the episode screen. */
export function EpisodeActionsMenu({
  episode,
  className = '',
  children,
}: {
  episode: Episode
  className?: string
  children: React.ReactNode
}) {
  const { library } = useServices()
  const download = useDownloadEntry(episode)
  const youtube = watchOnYouTubeEntry(useOpenOnYouTube(episode))
  const above = [...download, ...youtube]
  const entries: MenuEntry[] = [
    ...above,
    ...(above.length ? (['divider'] as const) : []),
    {
      key: 'played',
      label: episode.isPlayed ? Copy.Actions.markUnplayed : Copy.Actions.markPlayed,
      icon: episode.isPlayed ? <CircleIcon size={20} /> : <CheckCircleIcon size={20} />,
      onSelect: () => void markPlayed(library, episode.guid, !episode.isPlayed),
    },
    {
      key: 'previous',
      label: Copy.Actions.markPreviousPlayed,
      icon: <ChecklistIcon size={20} />,
      onSelect: () => void markAllPreviousPlayed(library, episode.guid),
    },
  ]
  return (
    <Menu entries={entries} label={Copy.Actions.a11yMenu} className={className}>
      {children}
    </Menu>
  )
}

/** Download, Remove Download, or why neither is on offer. None where the browser can't keep files. */
function useDownloadEntry(episode: Episode): MenuEntry[] {
  const { downloads } = useServices()
  const hasToken = useHasToken()
  const progress = useDownloadProgress(episode.guid)
  if (!downloads.isAvailable) return []

  if (isDownloaded(episode)) {
    return [
      {
        key: 'download',
        label: Copy.Actions.removeDownload,
        icon: <TrashIcon size={20} />,
        destructive: true,
        onSelect: () => downloads.remove(episode.guid),
      },
    ]
  }
  if (progress !== undefined) {
    // Nothing to do but wait — say so rather than offer a button that would be ignored.
    return [
      {
        key: 'download',
        label: Copy.Actions.downloading,
        icon: <DownloadIcon size={20} />,
        disabled: true,
      },
    ]
  }
  if (isLocked(episode, hasToken)) {
    // Nothing to download without a Patreon token.
    return [
      {
        key: 'download',
        label: Copy.Actions.patreonOnly,
        icon: <LockIcon size={20} />,
        disabled: true,
      },
    ]
  }
  return [
    {
      key: 'download',
      label: Copy.Actions.download,
      icon: <DownloadIcon size={20} />,
      onSelect: () => downloads.download(episode.guid, { manual: true }),
    },
  ]
}
