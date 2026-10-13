import { createContext, type ReactNode, use, useCallback, useEffect, useState } from 'react'
import { api, readToken, setUnauthorizedHandler, writeToken } from '../api/client.js'
import type { Session } from '../api/types.js'

type SignedInStaff = Session['staff']

interface AuthValue {
  staff: SignedInStaff | null
  /** True until the stored token has been checked against the API. */
  isRestoring: boolean
  signIn: (session: Session) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<SignedInStaff | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)

  /**
   * Forgets the session locally, without asking the API to.
   *
   * This is what a 401 from anywhere lands on: the token is already no good,
   * so there is nothing to end, and calling the API would only produce another
   * 401 to handle.
   */
  const forget = useCallback(() => {
    writeToken(null)
    setStaff(null)
  }, [])

  /**
   * A stored token is only a claim. It may have expired, or the person may
   * have been removed since — both of which only the API can say — so the app
   * asks once on load rather than trusting what is in storage.
   */
  useEffect(() => {
    if (!readToken()) {
      setIsRestoring(false)
      return
    }

    let cancelled = false

    api
      .me()
      .then(({ staff: restored }) => {
        if (!cancelled) setStaff(restored)
      })
      .catch(() => {
        if (!cancelled) forget()
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false)
      })

    return () => {
      cancelled = true
    }
  }, [forget])

  // Any request coming back 401 — a session that expired mid-edit, a staff row
  // deleted from another browser — drops straight through to the sign-in page.
  useEffect(() => {
    setUnauthorizedHandler(forget)
    return () => setUnauthorizedHandler(null)
  }, [forget])

  const signIn = useCallback((session: Session) => {
    writeToken(session.token)
    setStaff(session.staff)
  }, [])

  const signOut = useCallback(async () => {
    // Best effort: the session row should go, but a network failure must not
    // leave somebody looking at a dashboard they have asked to leave.
    await api.signOut().catch(() => undefined)
    forget()
  }, [forget])

  return <AuthContext value={{ staff, isRestoring, signIn, signOut }}>{children}</AuthContext>
}

export function useAuth(): AuthValue {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an AuthProvider')
  return value
}
