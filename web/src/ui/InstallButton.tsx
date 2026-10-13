/**
 * The install control beside Settings: the browser's own install prompt where
 * there is one, and otherwise where that browser keeps its install command.
 * Absent once the app is installed, or in a browser that can't install it.
 */

import { CircleIconButton, InstallIcon } from '@gcp/web-components'
import { useState } from 'react'
import { type InstallOffer, promptInstall, useInstallOffer } from '../app/install'
import { Copy } from '../copy/copy'
import { AlertDialog } from './Localized'

const INSTRUCTIONS: Record<Exclude<InstallOffer, 'none' | 'prompt'>, string> = {
  ios: Copy.Install.iosMessage,
  macSafari: Copy.Install.macSafariMessage,
  other: Copy.Install.otherMessage,
}

export function InstallButton() {
  const offer = useInstallOffer()
  const [instructions, setInstructions] = useState<string | null>(null)

  return (
    <>
      {offer !== 'none' && (
        <CircleIconButton
          aria-label={Copy.Install.button}
          title={Copy.Install.button}
          onClick={() => {
            if (offer === 'prompt') void promptInstall()
            else setInstructions(INSTRUCTIONS[offer])
          }}
        >
          <InstallIcon size={19} />
        </CircleIconButton>
      )}
      {instructions && (
        <AlertDialog
          title={Copy.Install.title}
          message={instructions}
          onDismiss={() => setInstructions(null)}
        />
      )}
    </>
  )
}
