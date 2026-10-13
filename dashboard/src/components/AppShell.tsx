import {
  Button,
  Chip,
  DisplayHeader,
  GridIcon,
  MetaLabel,
  PeopleIcon,
  RefreshIcon,
  TrayIcon,
} from '@gcp/web-components'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useUnattributedEpisodes } from '../api/hooks.js'
import { useAuth } from '../auth/AuthContext.js'

interface Section {
  heading: string
  links: { to: string; label: string; detail: string; icon: ReactNode }[]
}

const SECTIONS: Section[] = [
  {
    heading: 'Catalogue',
    links: [
      {
        to: '/shows',
        label: 'Shows',
        detail: 'Every show and its episodes',
        icon: <GridIcon size={17} />,
      },
      {
        to: '/unattributed',
        label: 'Unattributed',
        detail: 'Episodes no show has claimed',
        icon: <TrayIcon size={18} />,
      },
    ],
  },
  {
    heading: 'Operations',
    links: [
      {
        to: '/syncs',
        label: 'Feed syncs',
        detail: 'Runs and the feeds they read',
        icon: <RefreshIcon size={18} />,
      },
      {
        to: '/staff',
        label: 'Staff',
        detail: 'Who can sign in here',
        icon: <PeopleIcon size={18} />,
      },
    ],
  },
]

/**
 * The frame every signed-in page sits in: the web app's wide layout, with the
 * sections where the web app lists its shows. The same header — eyebrow,
 * display heading, gradient rule — over the same rows: a rail, a 40-pixel
 * tile, a title in display caps and a line under it.
 *
 * The unattributed count rides in the navigation rather than waiting to be
 * found: it is the one number in this product that means "a person needs to do
 * something", so it gets the apps' red — the rail and the chip a show with
 * something new wears.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { staff, signOut } = useAuth()
  const { data } = useUnattributedEpisodes()
  const unattributed = data?.episodes.length ?? 0

  return (
    <div className="grid min-h-dvh grid-cols-[clamp(280px,26vw,320px)_1fr] max-[860px]:grid-cols-1">
      <aside className="sticky top-0 flex h-dvh flex-col overflow-y-auto border-r border-line/60 bg-ink-deep pr-2.5 max-[860px]:static max-[860px]:h-auto max-[860px]:border-r-0 max-[860px]:border-b">
        <header className="pt-[22px] pb-2 pl-2.5">
          <DisplayHeader
            eyebrow="Glass Cannon Network"
            title="Manage"
            size={24}
            ruleWidth={44}
            as="h2"
          />
        </header>

        <nav
          aria-label="Sections"
          className="flex-1 max-[860px]:flex max-[860px]:flex-wrap max-[860px]:gap-x-4"
        >
          {SECTIONS.map((section) => (
            <section key={section.heading} className="mt-2">
              <h3 className="px-2.5 pt-3 pb-2 font-body">
                <MetaLabel showsTick={false}>{section.heading}</MetaLabel>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {section.links.map((link) => {
                  const attention = link.to === '/unattributed' ? unattributed : 0
                  return (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        className="group block rounded-[10px] no-underline hover:no-underline"
                      >
                        {({ isActive }) => (
                          <span
                            className={`flex items-center gap-[7px] rounded-[10px] py-[5px] pr-2.5 transition-colors ${isActive ? 'bg-sky/15' : 'group-hover:bg-sky/5'}`}
                          >
                            <span
                              className={`h-[34px] w-[3px] shrink-0 rounded-full ${attention > 0 ? 'bg-ember' : 'bg-transparent'}`}
                            />
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-[6px] border border-line bg-surface text-sky">
                              {link.icon}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="font-display text-[11px] leading-[1.25] text-bone uppercase">
                                {link.label}
                              </span>
                              <span className="truncate font-body text-[10px] text-muted">
                                {link.detail}
                              </span>
                            </span>
                            {attention > 0 && <Chip tone="new">{attention}</Chip>}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </nav>

        <footer className="mx-2.5 mt-6 mb-4 flex flex-col items-start gap-2 border-t border-line pt-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-[13px] font-semibold text-bone">{staff?.name}</span>
            <span className="truncate text-[11.5px] text-muted">{staff?.email}</span>
          </div>
          <Button variant="quiet" size="small" onClick={() => void signOut()}>
            Sign out
          </Button>
        </footer>
      </aside>

      <main className="min-w-0 px-10 pt-10 pb-16 max-[860px]:px-4 max-[860px]:pt-6">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6">{children}</div>
      </main>
    </div>
  )
}
