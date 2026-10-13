import { useEffect } from 'react'
import { useServices } from '../app/hooks'

/**
 * The keys the iPad answers on a keyboard: space to play or pause, ← and →
 * for the same 15/30 as the lock screen, ⇧→ for the next episode. (⌘R, which
 * syncs on the iPad, is left to the browser: reloading syncs anyway.)
 *
 * Not while typing, not inside a menu, and space not on a focused control,
 * where it already means "press this".
 */
export function useKeyboardShortcuts(): void {
  const { player } = useServices()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="menu"]'))
        return
      if (!player.getState().currentGuid) return

      if (event.key === ' ') {
        if (target?.closest('button, a')) return
        player.togglePlayPause()
      } else if (event.key === 'ArrowLeft' && !event.shiftKey) {
        player.skip(-15)
      } else if (event.key === 'ArrowRight') {
        if (event.shiftKey) player.playNext()
        else player.skip(30)
      } else {
        return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player])
}
