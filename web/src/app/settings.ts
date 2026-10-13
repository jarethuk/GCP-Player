/**
 * The download preferences — the phones' three switches — kept in
 * localStorage under the iOS app's UserDefaults keys. They're about this
 * browser, not the catalogue, so they stay out of IndexedDB, and the player
 * and the downloads read them outside any screen.
 *
 * All three default on, as on the phones. Storage can refuse (a private
 * window, site data blocked): the setting then lasts as long as the page.
 */

import { useSyncExternalStore } from 'react'

export type SettingKey =
  | 'downloadOverWiFiOnly'
  | 'autoDownloadCurrentEpisode'
  | 'autoDownloadNextEpisode'

const DEFAULTS: Record<SettingKey, boolean> = {
  downloadOverWiFiOnly: true,
  autoDownloadCurrentEpisode: true,
  autoDownloadNextEpisode: true,
}

const memory = new Map<SettingKey, boolean>()
const listeners = new Set<() => void>()

export function getSetting(key: SettingKey): boolean {
  const held = memory.get(key)
  if (held !== undefined) return held
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) return stored === 'true'
  } catch {
    // Storage refused; the default stands.
  }
  return DEFAULTS[key]
}

export function setSetting(key: SettingKey, value: boolean): void {
  memory.set(key, value)
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // Kept in memory for this page.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab flipping it.
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key in DEFAULTS) {
      memory.delete(event.key as SettingKey)
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSetting(key: SettingKey): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => getSetting(key),
    () => DEFAULTS[key],
  )
  return [value, (next) => setSetting(key, next)]
}
