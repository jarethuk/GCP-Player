import { useIsWideWindow, WideLayoutContext } from './app/hooks'
import { PhoneLayout } from './layout/PhoneLayout'
import { useKeyboardShortcuts } from './layout/useKeyboardShortcuts'
import { WideLayout } from './layout/WideLayout'

/**
 * Where the app decides what shape it is — by the window, never the device,
 * as the iOS app decides by size class.
 */
export function App() {
  const isWide = useIsWideWindow()
  useKeyboardShortcuts()
  return (
    <WideLayoutContext value={isWide}>
      {isWide ? <WideLayout /> : <PhoneLayout />}
    </WideLayoutContext>
  )
}
