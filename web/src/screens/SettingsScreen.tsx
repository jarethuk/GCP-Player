/**
 * Settings: the downloads, the Patreon link, and a line on what this browser
 * keeps.
 *
 * The phones' three download switches, "Wi-Fi only" only where the browser
 * says which network it's on. iCloud isn't here: with no account yet, what you've
 * played stays in this browser, and the screen says so where the phones say
 * what iCloud is doing.
 *
 * A page on a phone, and a sheet over the wide layout: the same content, and
 * its back button closes whichever it is.
 */

import {
  CheckmarkIcon,
  CheckSealIcon,
  ChevronLeftIcon,
  CircleIconButton,
  circleIconClass,
  DisplayHeader,
  EllipsisIcon,
  MetaLabel,
  PasteIcon,
  PillButton,
  RefreshIcon,
  Spinner,
  Switch,
} from '@gcp/web-components'
import { type FormEvent, useId, useState } from 'react'
import { useHasToken, useIsWide, useServices } from '../app/hooks'
import { type SettingKey, useSetting } from '../app/settings'
import { Copy } from '../copy/copy'
import { RichText } from '../copy/RichText'
import type { Markdown } from '../copy/runtime'
import { canTellNetworkType } from '../downloads/downloads'
import { AlertDialog, ConfirmDialog, Menu } from '../ui/Localized'
import { useDocumentTitle } from './useDocumentTitle'

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { catalogue } = useServices()
  const isWide = useIsWide()
  const [isConfirmingReset, setConfirmingReset] = useState(false)
  const [isResetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  useDocumentTitle(Copy.Settings.title)

  const clearAndResync = async () => {
    setConfirmingReset(false)
    setResetting(true)
    try {
      const result = await catalogue.clearAndResync()
      console.info(`[reset] +${result.episodesCreated} episodes, +${result.showsCreated} shows`)
      onClose()
    } catch (error) {
      setResetError(error instanceof Error ? error.message : String(error))
    } finally {
      setResetting(false)
    }
  }

  return (
    <div
      className={`relative bg-ground-gradient pb-7 ${isWide ? 'min-h-full pt-safe' : 'min-h-dvh pt-(--top-inset)'}`}
    >
      {/* Back and overflow, in the app's round-icon treatment. */}
      <div className="flex items-center justify-between px-4 pt-2 pb-[18px]">
        <CircleIconButton onClick={onClose} aria-label={Copy.Common.back} disabled={isResetting}>
          <ChevronLeftIcon size={18} />
        </CircleIconButton>
        <Menu
          label={Copy.Common.more}
          className={circleIconClass}
          entries={[
            {
              key: 'reset',
              label: Copy.Settings.clearData,
              icon: <RefreshIcon size={18} />,
              destructive: true,
              onSelect: () => setConfirmingReset(true),
            },
          ]}
        >
          <EllipsisIcon size={17} />
        </Menu>
      </div>

      <div className="px-4 pb-5">
        <DisplayHeader eyebrow={Copy.Settings.eyebrow} title={Copy.Settings.title} size={30} />
      </div>

      <DownloadSettings />

      <div className="px-3 pt-[26px]">
        <PatreonSettings />
      </div>

      <div className="flex flex-col gap-[5px] px-[18px] pt-[22px]">
        <MetaLabel showsTick={false} tone="sky">
          {Copy.Settings.browser}
        </MetaLabel>
        <p className="font-body text-[12px] leading-[1.45] text-muted">
          {Copy.Settings.browserStorage}
        </p>
      </div>

      {isConfirmingReset && (
        // Destructive and not undoable, so it asks — and says what goes.
        <ConfirmDialog
          title={Copy.Settings.clearDataConfirmTitle}
          message={Copy.Settings.clearDataMessage}
          confirmLabel={Copy.Settings.clearDataConfirm}
          onConfirm={() => void clearAndResync()}
          onCancel={() => setConfirmingReset(false)}
        />
      )}

      {resetError !== null && (
        // The local copy is already gone by now, so it says so.
        <AlertDialog
          title={Copy.Settings.clearDataFailedTitle}
          message={`${resetError}\n\n${Copy.Settings.clearDataFailedNote}`}
          onDismiss={() => setResetError(null)}
        />
      )}

      {isResetting && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3.5 bg-ink/80"
          role="status"
        >
          <Spinner />
          <MetaLabel showsTick={false}>{Copy.Settings.clearing}</MetaLabel>
        </div>
      )}
    </div>
  )
}

function DownloadSettings() {
  const { downloads } = useServices()
  if (!downloads.isAvailable) return null
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 px-3">
        {canTellNetworkType() && (
          <SettingRow
            setting="downloadOverWiFiOnly"
            title={Copy.Settings.wifiOnlyTitle}
            detail={Copy.Settings.wifiOnlyDetail}
          />
        )}
        <SettingRow
          setting="autoDownloadCurrentEpisode"
          title={Copy.Settings.currentEpisodeTitle}
          detail={Copy.Settings.currentEpisodeDetail}
        />
        <SettingRow
          setting="autoDownloadNextEpisode"
          title={Copy.Settings.nextEpisodeTitle}
          detail={Copy.Settings.nextEpisodeDetail}
        />
      </div>
      <p className="px-[18px] pt-[18px] font-body text-[12px] leading-[1.45] text-muted">
        {Copy.Settings.downloadsNote}
      </p>
    </div>
  )
}

/** A switch on a card, its title and what it does beside it — the whole card flips it. */
function SettingRow({
  setting,
  title,
  detail,
}: {
  setting: SettingKey
  title: string
  detail: string
}) {
  const [isOn, setOn] = useSetting(setting)
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3.5 rounded-[10px] border border-line bg-surface p-3.5"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-body text-[14px] font-semibold text-bone">{title}</span>
        <span className="font-body text-[11.5px] leading-[1.45] text-muted">{detail}</span>
      </span>
      <Switch id={id} checked={isOn} onChange={setOn} />
    </label>
  )
}

/** The Patreon feed link: pasted once, reduced to its token, kept in this browser. */
function PatreonSettings() {
  const hasToken = useHasToken()
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="patreon-heading">
      <h2 id="patreon-heading" className="px-1.5">
        <MetaLabel showsTick={false} tone="sky">
          {Copy.Patreon.label}
        </MetaLabel>
      </h2>
      <div className="rounded-[10px] border border-line bg-surface p-3.5">
        {hasToken ? <PatreonConnected /> : <PatreonEntry />}
      </div>
    </section>
  )
}

function PatreonConnected() {
  const { patreon } = useServices()
  const [isConfirming, setConfirming] = useState(false)
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="flex items-center gap-2 font-body text-[14px] font-semibold text-bone">
        <span className="text-sky">
          <CheckSealIcon size={18} />
        </span>
        {Copy.Patreon.connected}
      </p>
      <p className="font-body text-[11.5px] leading-[1.45] text-muted">
        {Copy.Patreon.connectedDetail}
      </p>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="font-body text-[13px] font-semibold text-ember hover:underline"
      >
        {Copy.Patreon.removeLink}
      </button>
      {isConfirming && (
        <ConfirmDialog
          title={Copy.Patreon.removeConfirmTitle}
          message={Copy.Patreon.removeConfirmMessage}
          confirmLabel={Copy.Common.remove}
          onConfirm={() => {
            setConfirming(false)
            void patreon.setToken(null)
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  )
}

/** Paste needs the async clipboard, which not every browser lets a page read. */
const canPaste =
  typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function'

function PatreonEntry() {
  const { patreon } = useServices()
  const [link, setLink] = useState('')
  const [isChecking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (text = link) => {
    setError(null)
    setChecking(true)
    try {
      await patreon.saveFromLink(text)
      setLink('')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setChecking(false)
    }
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      setLink(text)
      await save(text)
    } catch {
      // Refused: the field is still there to paste into.
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (link.trim() && !isChecking) void save()
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={onSubmit}>
      <p className="font-body text-[11.5px] leading-[1.45] text-muted">{Copy.Patreon.intro}</p>
      <PatreonLinkSteps />
      <input
        type="url"
        inputMode="url"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={link}
        onChange={(event) => setLink(event.target.value)}
        placeholder="https://www.patreon.com/rss/…"
        aria-label={Copy.Patreon.a11yField}
        className="w-full rounded-lg border border-line bg-ink p-2.5 font-body text-[13px] text-bone outline-none placeholder:text-muted/60 focus:border-sky/50"
      />
      {error && (
        <p className="font-body text-[11.5px] leading-snug text-ember" role="alert">
          {error}
        </p>
      )}
      {/* The two side by side, the same size as each other. */}
      <div className="flex gap-2.5">
        {canPaste && (
          <PillButton tone="tinted" onClick={() => void paste()} disabled={isChecking}>
            <PasteIcon size={15} />
            {Copy.Common.paste}
          </PillButton>
        )}
        <PillButton type="submit" disabled={!link.trim() || isChecking}>
          {isChecking ? (
            <Spinner size={15} className="text-ink-deep" />
          ) : (
            <CheckmarkIcon size={15} />
          )}
          {isChecking ? Copy.Common.checking : Copy.Common.save}
        </PillButton>
      </div>
    </form>
  )
}

/**
 * Where the RSS link is on Patreon: several taps deep, and nothing on
 * Patreon's side calls it what this screen does, so the steps are spelled out
 * with the button names as Patreon shows them.
 */
function PatreonLinkSteps() {
  const steps: (Markdown | string)[] = [
    Copy.Patreon.stepLogin,
    Copy.Patreon.stepOpenShow,
    Copy.Patreon.stepListen,
    Copy.Patreon.stepOtherApps,
    Copy.Patreon.stepCopy,
    Copy.Patreon.stepPaste,
  ]
  return (
    <ol className="flex flex-col gap-[7px]">
      {steps.map((step, index) => (
        <li key={step} className="flex items-baseline gap-2.5">
          <span className="w-3.5 shrink-0 text-right font-body text-[11px] font-bold text-sky tabular-nums">
            {index + 1}
          </span>
          <span className="font-body text-[12.5px] leading-snug text-bone">
            <RichText text={step as Markdown} />
          </span>
        </li>
      ))}
    </ol>
  )
}
