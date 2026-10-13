import { useEffect } from 'react'
import { Copy } from '../copy/copy'

/** "Blood of the Wild · GCP Player", or the app's name alone. */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${Copy.App.name}` : Copy.App.name
  }, [title])
}
