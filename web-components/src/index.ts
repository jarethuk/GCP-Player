/**
 * The components the web app and the dashboard share, and the theme they're
 * drawn in (`@gcp/web-components/theme.css`).
 *
 * Nothing here carries text of its own: every label arrives as a prop, so the
 * web app's words still come from copy/strings.yaml and the dashboard's from
 * the dashboard.
 */

export { Artwork, WideArtwork } from './Artwork'
export { artworkUrl } from './artworkUrl'
export {
  Button,
  type ButtonVariant,
  CircleIconButton,
  circleIconClass,
  GlassIconButton,
  GradientPlayButton,
  OutlineButton,
  PillButton,
  SkipButton,
} from './Buttons'
export { Card, cardClass } from './Card'
export { Chip, type ChipTone, LockChip } from './Chips'
export { AlertDialog, ConfirmDialog, glassPanelClass, Modal } from './Dialogs'
export { DisplayHeader } from './DisplayHeader'
export { EmptyState } from './EmptyState'
export * from './Icons'
export { Menu, type MenuEntry } from './Menu'
export { MetaLabel, type MetaTone } from './MetaLabel'
export { SegmentedPicker } from './SegmentedPicker'
export { Spinner } from './Spinner'
export { Switch } from './Switch'
