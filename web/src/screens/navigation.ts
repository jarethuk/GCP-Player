import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router'

/**
 * Back, as the phone's navigation bar means it: to the screen this one was
 * opened from. A page opened straight from a link has nothing behind it in
 * this app, so it goes up to `fallback` instead of out of the site.
 */
export function useBack(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    if (location.key !== 'default') navigate(-1)
    else navigate(fallback, { replace: true })
  }, [navigate, location.key, fallback])
}
