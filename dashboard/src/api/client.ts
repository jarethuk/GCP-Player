import type {
  Episode,
  FeedSource,
  ResyncResult,
  Session,
  Show,
  ShowWithCounts,
  Staff,
  SyncResult,
  SyncRun,
} from './types.js'

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:7331'

/**
 * Where the session token lives between page loads.
 *
 * `localStorage`, not a cookie: the API is a different origin from this app,
 * and a cross-site cookie would need `SameSite=None` plus a credentialed CORS
 * allow-list — machinery whose only purpose would be to reintroduce the CSRF
 * surface that a header-borne token doesn't have. The trade is XSS: anything
 * that can run script in this page can read the token. For an internal
 * catalogue editor with no user content on the page, that is the right side of
 * the trade; if this ever renders something a stranger wrote, revisit it.
 */
const TOKEN_KEY = 'gcp.dashboard.session'

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Safari in private mode, and anything with site data blocked.
    return null
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // The session still works for this tab; it just won't survive a reload.
  }
}

/** An error carrying the status, so callers can tell 401 from everything else. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** The session is gone or was never there. The app signs out on this. */
  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  /** Sign-in itself, which has no token yet and must not be signed out on 401. */
  anonymous?: boolean
}

/** Called when any request comes back 401, so the app can drop its session. */
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false } = options
  const token = anonymous ? null : readToken()

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

  if (!response.ok) {
    // Every error this API raises is `{ error }`; anything else came from the
    // platform in front of it, and the status is all there is to say.
    const detail = await response
      .json()
      .then((parsed: unknown) =>
        typeof parsed === 'object' && parsed !== null && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : null,
      )
      .catch(() => null)

    if (response.status === 401 && !anonymous) onUnauthorized?.()

    throw new ApiError(response.status, detail ?? `Request failed (${response.status})`)
  }

  // 204 on every delete, and on asking for a sign-in code.
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/**
 * What `POST /admin/resync` demands in its body before it will do anything.
 * Must match CONFIRMATION in the API's `src/routes/admin.ts`.
 */
export const RESYNC_CONFIRMATION = 'delete-everything-and-resync'

/** Fields a show can be created or edited with. */
export interface ShowInput {
  slug: string
  title: string
  system: string | null
  description: string | null
  artworkUrl: string | null
  /** Case-insensitive regex claiming episodes whose titles skip the show name. */
  matchPattern: string | null
  /** The Patreon collection id. Ingest fills it in for most shows by itself. */
  patreonShowId?: string | null
  /**
   * Edit only, and only ever sent as `false`.
   *
   * Any edit sets it to true on the server without being asked, so there is
   * nothing to send for the normal case. Sending false is the release: it
   * hands the row back to the feeds, and the next sync reconciles it.
   */
  overridden?: boolean
}

/** Fields an episode can be edited with. `guid` is the feed's and never moves. */
export interface EpisodeInput {
  showId: string | null
  title: string
  description: string | null
  /**
   * Left out, rather than sent empty, for an episode with no public audio:
   * the API has nothing to set it to, and the field is not clearable.
   */
  audioUrl?: string
  durationSeconds: number | null
  publishedAt: string
  season: number | null
  number: number | null
  artworkUrl: string | null
  /**
   * The episode's video version. Editable because the feeds get it wrong: a
   * link can point at a trailer, at the wrong part of a two-parter, or at a
   * video the network has since taken down, and ingest has no way to know.
   */
  videoUrl: string | null
  /** See ShowInput.overridden. */
  overridden?: boolean
}

export const api = {
  // ── Signing in ────────────────────────────────────────────────────────
  /** Always resolves, for any address. See the API's own note on why. */
  requestCode: (email: string) =>
    request<void>('/auth/code', { method: 'POST', body: { email }, anonymous: true }),

  verifyCode: (email: string, code: string) =>
    request<Session>('/auth/session', {
      method: 'POST',
      body: { email, code },
      anonymous: true,
    }),

  signOut: () => request<void>('/auth/session', { method: 'DELETE' }),

  me: () => request<{ staff: Session['staff'] }>('/auth/me'),

  // ── The catalogue ─────────────────────────────────────────────────────
  shows: () => request<{ shows: ShowWithCounts[]; unattributedCount: number }>('/admin/shows'),

  /**
   * Public, and the only read here that isn't under /admin. `patreon=1`, or the
   * episodes with no public audio — Patreon-only and early releases — are left
   * out, as they are for the phones that predate Patreon.
   */
  episodes: (showId: string) =>
    request<{ episodes: Episode[] }>(`/shows/${encodeURIComponent(showId)}/episodes?patreon=1`),

  unattributedEpisodes: () => request<{ episodes: Episode[] }>('/episodes/unattributed'),

  createShow: (input: ShowInput) => request<Show>('/shows', { method: 'POST', body: input }),

  updateShow: (id: string, input: Partial<ShowInput>) =>
    request<Show>(`/shows/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),

  deleteShow: (id: string) =>
    request<void>(`/shows/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  updateEpisode: (id: string, input: Partial<EpisodeInput>) =>
    request<Episode>(`/episodes/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),

  deleteEpisode: (id: string) =>
    request<void>(`/episodes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // ── The feeds ─────────────────────────────────────────────────────────
  syncRuns: (limit = 20) => request<{ runs: SyncRun[] }>(`/admin/syncs?limit=${limit}`),

  feeds: () => request<{ feeds: FeedSource[] }>('/admin/feeds'),

  runSync: () => request<SyncResult>('/admin/sync', { method: 'POST' }),

  /**
   * Deletes every show and episode, then rebuilds from the feeds.
   *
   * The confirmation string is the API's, not this client's: the endpoint
   * rejects a body without it, precisely so that a session left open on an
   * unattended laptop is not one stray request away from emptying the
   * catalogue. Sending it from here is the second half of that handshake, and
   * the dialog makes a person type it first.
   */
  resync: () =>
    request<ResyncResult>('/admin/resync', {
      method: 'POST',
      body: { confirm: RESYNC_CONFIRMATION },
    }),

  // ── Staff ─────────────────────────────────────────────────────────────
  staff: () => request<{ staff: Staff[] }>('/staff'),

  addStaff: (email: string, name: string) =>
    request<Staff>('/staff', { method: 'POST', body: { email, name } }),

  updateStaff: (id: string, input: { email?: string; name?: string }) =>
    request<Staff>(`/staff/${encodeURIComponent(id)}`, { method: 'PATCH', body: input }),

  removeStaff: (id: string) =>
    request<void>(`/staff/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
