/**
 * Installing the web app to a home screen or desktop.
 *
 * Chromium browsers (Android, desktop Chrome and Edge) can offer it through
 * `beforeinstallprompt`, which fires once, early, and is ours to keep and
 * replay from a button. But Chrome holds the event back whenever it likes —
 * the app already installed, a prompt dismissed before, too little engagement
 * — and Safari never sends it. So without one the button explains where the
 * browser keeps its own install command instead. Once the app is running
 * installed, or has just been installed from this tab, there is nothing to
 * offer; nor in desktop Firefox, which can't install web apps at all.
 */

import { useSyncExternalStore } from 'react'

/** Chromium's install prompt; not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallOffer =
  /** Running installed, just installed, or a browser that can't install. */
  | 'none'
  /** Chromium: the button shows the browser's own install prompt. */
  | 'prompt'
  /** Safari on iPhone or iPad: Share, then Add to Home Screen. */
  | 'ios'
  /** Safari on a Mac: File, then Add to Dock. */
  | 'macSafari'
  /** Anything else: the browser's own install command, wherever it keeps it. */
  | 'other'

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone, iPod, or an iPad (which reports itself as a Mac with a touch screen). */
function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

function getOffer(): InstallOffer {
  if (isStandalone() || installed) return 'none'
  if (deferred) return 'prompt'
  if (isIOS()) return 'ios'
  const ua = navigator.userAgent
  if (/Firefox\//.test(ua) && !/Android/.test(ua)) return 'none'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) {
    return 'macSafari'
  }
  return 'other'
}

/**
 * Listens for the install prompt and registers the service worker. Called once,
 * before the first render: the prompt can fire before React would be listening.
 */
export function startInstallSupport() {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep it for the button rather than letting the browser show its own mini-infobar.
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    installed = true
    notify()
  })
  window.matchMedia('(display-mode: standalone)').addEventListener('change', notify)

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.warn('Service worker registration failed', error)
      })
    })
  }
}

/** Shows the browser's install prompt. Each prompt can only be shown once. */
export async function promptInstall(): Promise<void> {
  const event = deferred
  if (!event) return
  deferred = null
  notify()
  await event.prompt()
  await event.userChoice
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useInstallOffer(): InstallOffer {
  return useSyncExternalStore(subscribe, getOffer, () => 'none')
}
