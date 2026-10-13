import type { ReactNode } from 'react'
import type { Markdown } from './runtime'

/**
 * Renders a `Markdown` string from the copy file: **bold** as bold, and
 * [links](url) as links in the app's sky blue, opening in a new tab — signing
 * in to Patreon is not something to do inside someone else's app.
 */
export function RichText({ text }: { text: Markdown }) {
  const parts: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    if (match[1] !== undefined) {
      parts.push(
        <strong key={index} className="font-bold">
          {match[1]}
        </strong>,
      )
    } else {
      parts.push(
        <a
          key={index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky hover:underline"
        >
          {match[2]}
        </a>,
      )
    }
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
