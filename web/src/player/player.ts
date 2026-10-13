/**
 * The single source of truth for playback, backed by one <audio> element.
 * The web port of iOS/GCP Player/PlayerModel.swift. A downloaded episode plays
 * from this browser's copy; anything else streams — the public enclosure, or
 * with a Patreon token, Patreon's ad-free copy from the patron's own feed.
 *
 * It also tells the browser what is playing (the Media Session API), which is
 * how the lock screen, a Bluetooth headset or the keyboard's media keys reach
 * it — the web's MPNowPlayingInfoCenter and MPRemoteCommandCenter.
 */

import { artworkUrl } from '@gcp/web-components'
import { getSetting } from '../app/settings'
import { Copy } from '../copy/copy'
import {
  markPlayed,
  nextEpisodeAfter,
  positionInShow,
  setStarred,
  updatePosition,
} from '../data/actions'
import type { Library } from '../data/library'
import { effectiveDurationSeconds, isDownloaded, isLocked, playsFromPatreon } from '../data/logic'
import type { Episode } from '../data/types'
import type { Downloads } from '../downloads/downloads'
import type { PatreonFeeds } from '../patreon/feeds'

export interface PlayerState {
  readonly currentGuid: string | null
  readonly isPlaying: boolean
  /** Waiting on the patron's feed for the audio URL, or on the downloaded file. */
  readonly isPreparing: boolean
  /** Seconds. */
  readonly currentTime: number
  readonly duration: number
  /** Why the last play didn't start, for the screen to say. */
  readonly playbackError: string | null
}

const IDLE: PlayerState = {
  currentGuid: null,
  isPlaying: false,
  isPreparing: false,
  currentTime: 0,
  duration: 0,
  playbackError: null,
}

/**
 * A tenth of a second of silence. Safari only lets an audio element start
 * from inside a tap — and a Patreon episode's URL arrives a round trip after
 * the tap. Playing this in the tap itself unlocks the element for the real
 * audio when it lands.
 */
const SILENCE = (() => {
  const samples = 800
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true)
  view.setUint32(28, 8000, true)
  view.setUint16(32, 1, true)
  view.setUint16(34, 8, true)
  ascii(36, 'data')
  view.setUint32(40, samples, true)
  bytes.fill(128, 44)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:audio/wav;base64,${btoa(binary)}`
})()

export class Player {
  private state: PlayerState = IDLE
  private readonly listeners = new Set<() => void>()
  /** The episode whose audio is in the element. null while silent or empty. */
  private loadedGuid: string | null = null
  /** Bumped to cancel a play that is waiting on Patreon. */
  private preparation = 0
  /** A resume position, applied once the element knows the file's length. */
  private pendingSeek: number | null = null
  private isUnlocked = false

  constructor(
    private readonly library: Library,
    private readonly feeds: PatreonFeeds,
    private readonly audio: HTMLAudioElement = new Audio(),
    private readonly downloads: Downloads | null = null,
  ) {
    audio.preload = 'auto'
    this.listen()
    this.setUpMediaSession()
  }

  // -- Observing ---------------------------------------------------------------

  readonly getState = (): PlayerState => this.state

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setState(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private get currentEpisode(): Episode | undefined {
    const guid = this.state.currentGuid
    return guid ? this.library.getSnapshot().episodes.get(guid) : undefined
  }

  private get hasToken(): boolean {
    return this.library.getSnapshot().patreonToken !== null
  }

  /** The next episode in the current one's show, or null. */
  nextEpisodeGuid(): string | null {
    const guid = this.state.currentGuid
    return guid ? nextEpisodeAfter(this.library, guid) : null
  }

  // -- Controls ----------------------------------------------------------------

  play(guid: string): void {
    const episode = this.library.getSnapshot().episodes.get(guid)
    if (!episode) return
    const hasToken = this.hasToken
    // The screens don't offer play for a padlocked episode, but the keyboard
    // and the media keys can still ask.
    if (isLocked(episode, hasToken)) {
      this.setState({ playbackError: Copy.Patreon.errorNoToken })
      return
    }
    const ticket = ++this.preparation
    this.setState({ playbackError: null })

    // Downloaded wins over streaming: instant, and it works with no signal.
    // Reading the file back is a moment's wait, so it goes the way a Patreon
    // episode does.
    if (this.downloads && isDownloaded(episode)) {
      this.prepare(episode)
      void this.prepareFromDownload(this.downloads, episode, ticket)
      return
    }
    this.stream(episode, ticket)
  }

  private stream(episode: Episode, ticket: number): void {
    if (!playsFromPatreon(episode, this.hasToken)) {
      if (episode.audioUrl) this.start(episode, episode.audioUrl)
      return
    }
    // Patreon: the URL — and the runtime, shorter by the ads it hasn't got —
    // come from the patron's feed.
    this.prepare(episode)
    void this.prepareFromPatreon(episode, ticket)
  }

  /**
   * For audio that arrives a moment after the tap: the episode goes into the
   * player now, so the tap visibly did something, and whatever was playing
   * stops now.
   */
  private prepare(episode: Episode): void {
    this.unlock()
    this.loadedGuid = null
    this.setState({
      currentGuid: episode.guid,
      isPreparing: true,
      isPlaying: true,
      duration: effectiveDurationSeconds(episode, this.hasToken) ?? 0,
      currentTime: episode.positionSeconds,
    })
    this.updateMediaSession()
  }

  private async prepareFromDownload(
    downloads: Downloads,
    episode: Episode,
    ticket: number,
  ): Promise<void> {
    const url = await downloads.localUrl(episode).catch(() => null)
    if (ticket !== this.preparation || this.state.currentGuid !== episode.guid) return
    const latest = this.library.getSnapshot().episodes.get(episode.guid) ?? episode
    if (url) {
      console.info(`[player] playing the downloaded copy of ${episode.title}`)
      this.start(latest, url)
    } else {
      // The browser let the file go; the row has been put right.
      this.stream(latest, ticket)
    }
  }

  private async prepareFromPatreon(episode: Episode, ticket: number): Promise<void> {
    const snapshot = this.library.getSnapshot()
    const token = snapshot.patreonToken
    const showId = episode.showSlug ? snapshot.shows.get(episode.showSlug)?.patreonShowId : null
    let url: string
    try {
      if (!token) throw new Error(Copy.Patreon.errorNoToken)
      if (!showId || !episode.patreonPostId) throw new Error(Copy.Patreon.errorNotOnPatreon)
      const audio = await this.feeds.audio(token, showId, episode.patreonPostId)
      if (
        audio.durationSeconds !== null &&
        audio.durationSeconds !== episode.patreonDurationSeconds
      ) {
        void this.library.updateEpisode(episode.guid, {
          patreonDurationSeconds: audio.durationSeconds,
        })
      }
      url = audio.url
      console.info(`[player] streaming ${episode.title} from Patreon`)
    } catch (error) {
      if (ticket !== this.preparation) return
      // An early release has nothing to fall back on; a public episode still
      // has its public copy, ads and all.
      if (!episode.audioUrl) {
        this.setState({
          isPreparing: false,
          isPlaying: false,
          playbackError: error instanceof Error ? error.message : Copy.Errors.playFailed,
        })
        return
      }
      console.info('[player] Patreon failed; streaming the public copy', error)
      url = episode.audioUrl
    }
    if (ticket !== this.preparation || this.state.currentGuid !== episode.guid) return
    const latest = this.library.getSnapshot().episodes.get(episode.guid) ?? episode
    this.start(latest, url)
  }

  /** Hands a resolved URL to the element and does everything that goes with starting. */
  private start(episode: Episode, url: string): void {
    this.loadedGuid = episode.guid
    this.pendingSeek = episode.positionSeconds > 5 ? episode.positionSeconds : null
    this.audio.src = url
    this.audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (this.loadedGuid === episode.guid) this.setState({ isPlaying: false })
    })
    this.isUnlocked = true

    this.setState({
      currentGuid: episode.guid,
      isPlaying: true,
      isPreparing: false,
      currentTime: this.pendingSeek ?? 0,
      // The feed's runtime until the element learns the file's own.
      duration: effectiveDurationSeconds(episode, this.hasToken) ?? 0,
    })
    void this.library.setMeta('lastPlayedEpisodeGuid', episode.guid)

    // Starting something from a show is how a show joins My Shows.
    if (episode.showSlug) void setStarred(this.library, episode.showSlug, true)
    this.downloadAround(episode.guid)
    this.updateMediaSession()
  }

  /**
   * Keeps this one for offline, and gets the next one ready before the
   * listener arrives at it — both switchable in Settings.
   */
  private downloadAround(guid: string): void {
    if (!this.downloads) return
    if (getSetting('autoDownloadCurrentEpisode')) this.downloads.download(guid)
    const next = nextEpisodeAfter(this.library, guid)
    if (next && getSetting('autoDownloadNextEpisode')) this.downloads.download(next)
  }

  pause(): void {
    const episode = this.currentEpisode
    if (!episode) return
    if (this.state.isPreparing) {
      this.preparation += 1
      this.setState({ isPreparing: false, isPlaying: false })
      this.updateMediaSession()
      return
    }
    this.setState({ isPlaying: false })
    this.audio.pause()
    void updatePosition(this.library, episode.guid, this.state.currentTime)
    this.updateMediaSession()
  }

  resume(): void {
    const guid = this.state.currentGuid
    if (!guid) return
    // A restored episode has no audio loaded yet: start it properly, which
    // picks up its saved position.
    if (this.loadedGuid !== guid) {
      this.play(guid)
      return
    }
    this.setState({ isPlaying: true })
    this.audio.play().catch(() => this.setState({ isPlaying: false }))
    this.updateMediaSession()
  }

  togglePlayPause(): void {
    if (this.state.isPlaying) this.pause()
    else this.resume()
  }

  seek(seconds: number): void {
    const guid = this.state.currentGuid
    if (!guid) return
    const { duration } = this.state
    const clamped = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds)
    if (this.loadedGuid === guid) {
      if (this.pendingSeek !== null) this.pendingSeek = clamped
      else this.audio.currentTime = clamped
    }
    this.setState({ currentTime: clamped })
    void updatePosition(this.library, guid, clamped)
    this.updatePositionState()
  }

  skip(by: number): void {
    this.seek(this.state.currentTime + by)
  }

  /** Marks the current episode played and starts the show's next one. */
  playNext(): void {
    const current = this.state.currentGuid
    const next = this.nextEpisodeGuid()
    if (!current || !next) return
    void markPlayed(this.library, current)
    this.play(next)
  }

  /** Stops and forgets what was playing — before the library is wiped under it. */
  stop(): void {
    this.preparation += 1
    this.loadedGuid = null
    this.pendingSeek = null
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.setState(IDLE)
    void this.library.deleteMeta('lastPlayedEpisodeGuid')
    this.updateMediaSession()
  }

  /** Puts the position beyond doubt: the tab is going away, or into the background. */
  flushPosition(): void {
    const guid = this.state.currentGuid
    if (guid && this.loadedGuid === guid)
      void updatePosition(this.library, guid, this.state.currentTime)
  }

  /**
   * Puts the last-played episode back in the mini player at start, paused at
   * its saved position. Nothing loads until play is pressed.
   */
  async restoreLastEpisode(): Promise<void> {
    if (this.state.currentGuid) return
    const guid = await this.library.getMeta('lastPlayedEpisodeGuid')
    const episode = guid ? this.library.getSnapshot().episodes.get(guid) : undefined
    if (!episode || this.state.currentGuid) return
    this.setState({
      currentGuid: episode.guid,
      isPlaying: false,
      currentTime: episode.positionSeconds,
      duration: effectiveDurationSeconds(episode, this.hasToken) ?? 0,
    })
    this.updateMediaSession()
  }

  // -- The element ---------------------------------------------------------------

  /** Plays silence inside the tap, so Safari lets the real audio start later. */
  private unlock(): void {
    if (this.isUnlocked) return
    this.isUnlocked = true
    this.audio.pause()
    this.audio.src = SILENCE
    this.audio.play().catch(() => {})
  }

  private listen(): void {
    const audio = this.audio
    const isCurrent = () => this.loadedGuid !== null && this.loadedGuid === this.state.currentGuid

    audio.addEventListener('loadedmetadata', () => {
      if (!isCurrent()) return
      if (this.pendingSeek !== null) {
        audio.currentTime = this.pendingSeek
        this.pendingSeek = null
      }
    })

    audio.addEventListener('durationchange', () => {
      if (!isCurrent()) return
      // Once the file's headers load, prefer its length to the feed's claim.
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        this.setState({ duration: audio.duration })
      }
    })

    audio.addEventListener('timeupdate', () => {
      if (!isCurrent() || this.pendingSeek !== null) return
      const seconds = audio.currentTime
      this.setState({ currentTime: seconds })
      // Remembered every five seconds of drift, not every tick.
      const episode = this.currentEpisode
      if (this.state.isPlaying && episode && Math.abs(seconds - episode.positionSeconds) >= 5) {
        void updatePosition(this.library, episode.guid, seconds)
      }
      this.updatePositionState()
    })

    audio.addEventListener('play', () => {
      if (isCurrent() && !this.state.isPlaying) this.setState({ isPlaying: true })
    })

    // A pause that didn't come from here: headphones out, another tab's audio,
    // the OS. Mirrored, and the position kept.
    audio.addEventListener('pause', () => {
      // `paused` is checked as the event is handled: switching episodes queues a
      // pause for the old file that lands after the new one has started.
      if (!isCurrent() || audio.ended || !audio.paused || !this.state.isPlaying) return
      this.setState({ isPlaying: false })
      this.flushPosition()
      this.updateMediaSession()
    })

    // Only the end of the file marks it played and moves through the show.
    audio.addEventListener('ended', () => {
      if (!isCurrent()) return
      const current = this.state.currentGuid
      this.setState({ isPlaying: false })
      if (this.nextEpisodeGuid()) {
        this.playNext()
      } else if (current) {
        void markPlayed(this.library, current)
        this.updateMediaSession()
      }
    })

    audio.addEventListener('error', () => {
      if (!isCurrent()) return
      this.setState({ isPlaying: false, isPreparing: false, playbackError: Copy.Errors.playFailed })
      this.updateMediaSession()
    })
  }

  // -- Media Session: the lock screen, headsets, media keys ------------------------

  private setUpMediaSession(): void {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    const handle = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // Not every browser knows every action.
      }
    }
    handle('play', () => this.resume())
    handle('pause', () => this.pause())
    handle('seekbackward', (details) => this.skip(-(details.seekOffset ?? 15)))
    handle('seekforward', (details) => this.skip(details.seekOffset ?? 30))
    handle('seekto', (details) => {
      if (details.seekTime !== undefined) this.seek(details.seekTime)
    })
    handle('nexttrack', () => this.playNext())
  }

  private updateMediaSession(): void {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    const episode = this.currentEpisode
    if (!episode) {
      session.metadata = null
      session.playbackState = 'none'
      return
    }
    const show = episode.showSlug
      ? this.library.getSnapshot().shows.get(episode.showSlug)
      : undefined
    const position = positionInShow(this.library, episode.guid)
    const art = episode.artworkUrl ?? show?.artworkUrl
    session.metadata = new MediaMetadata({
      title: episode.title,
      artist: show?.title ?? '',
      // The show is already the artist, so album carries "12 of 45" — as it
      // does on the car's now-playing screen.
      album: position ? Copy.Player.positionInShow(position.index, position.total) : '',
      artwork: art ? [{ src: artworkUrl(art, 512), sizes: '512x512' }] : [],
    })
    session.playbackState = this.state.isPlaying ? 'playing' : 'paused'
    this.updatePositionState()
  }

  private updatePositionState(): void {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return
    const { duration, currentTime } = this.state
    if (!(duration > 0) || currentTime > duration) return
    try {
      navigator.mediaSession.setPositionState({ duration, position: currentTime, playbackRate: 1 })
    } catch {
      // A duration the browser disagrees with; the next tick will do.
    }
  }
}
