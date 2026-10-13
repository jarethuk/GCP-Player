import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ApiError } from './api/client.js'
import { AuthProvider, useAuth } from './auth/AuthContext.js'
import { SignInPage } from './auth/SignInPage.js'
import { AppShell } from './components/AppShell.js'
import { Loading } from './components/States.js'
import { ToastProvider } from './components/Toast.js'
import { ShowPage } from './pages/ShowPage.js'
import { ShowsPage } from './pages/ShowsPage.js'
import { StaffPage } from './pages/StaffPage.js'
import { SyncsPage } from './pages/SyncsPage.js'
import { UnattributedPage } from './pages/UnattributedPage.js'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * The catalogue changes once a day, by cron, plus whatever somebody
       * edits here — and every edit invalidates the keys it touched. A minute
       * is long enough that moving between pages doesn't refetch the same
       * thirty-two rows, and short enough that two people editing at once
       * converge quickly.
       */
      staleTime: 60_000,
      // A 401 is not a blip: the session is gone, and the app is already on
      // its way to the sign-in page. Retrying just delays that.
      retry: (failureCount, error) =>
        error instanceof ApiError && error.isUnauthorized ? false : failureCount < 2,
    },
  },
})

/** The signed-in half of the app. Nothing here renders without a session. */
function SignedIn() {
  return (
    <AppShell>
      <Routes>
        <Route path="/shows" element={<ShowsPage />} />
        <Route path="/shows/:slug" element={<ShowPage />} />
        <Route path="/unattributed" element={<UnattributedPage />} />
        <Route path="/syncs" element={<SyncsPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="*" element={<Navigate to="/shows" replace />} />
      </Routes>
    </AppShell>
  )
}

function Gate() {
  const { staff, isRestoring } = useAuth()

  // A stored token is only a claim until the API has agreed with it. Showing
  // the sign-in page first would flash it at somebody who is already signed in.
  if (isRestoring) return <Loading label="Signing you in" />

  return staff ? <SignedIn /> : <SignInPage />
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
