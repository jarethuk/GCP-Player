import { Analytics } from '@vercel/analytics/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, ScrollRestoration } from 'react-router'
import { App } from './App'
import { ServicesContext } from './app/hooks'
import { startInstallSupport } from './app/install'
import { startServices } from './app/services'
import './index.css'

const root = createRoot(document.getElementById('root') as HTMLElement)

// One route: both layouts route the same URLs themselves, beneath it.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <>
        <App />
        {/* Back to a list finds it where it was left. By path, so a list is
            one place however it was reached. */}
        <ScrollRestoration getKey={(location) => location.pathname} />
      </>
    ),
  },
])

startInstallSupport()

startServices()
  .then((services) => {
    root.render(
      <StrictMode>
        <ServicesContext value={services}>
          <RouterProvider router={router} />
        </ServicesContext>
        {/* Vercel Web Analytics: page views, route changes included. Sends
            nothing in development. */}
        <Analytics />
      </StrictMode>,
    )
  })
  .catch((error: unknown) => {
    // IndexedDB refused: a private window in an older browser, or storage
    // switched off. There is nothing to show without it.
    console.error(error)
    root.render(
      <p style={{ padding: 24, fontFamily: 'system-ui', color: '#9db8cc' }}>
        GCN Player needs this browser's storage to keep the catalogue, and couldn't open it.
      </p>,
    )
  })
