import type { Decorator, Preview } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import '../src/index.css'

/**
 * Router context, for the components that link. Cheaper than teaching every
 * story about routing, and the components that don't link don't notice.
 */
const withRouter: Decorator = (Story) => (
  <MemoryRouter>
    <Story />
  </MemoryRouter>
)

/** The ground the components are drawn on. Without it they float on white. */
const onTheGround: Decorator = (Story) => (
  <div className="min-h-dvh bg-ground-gradient p-8 font-body text-bone">
    <Story />
  </div>
)

const preview: Preview = {
  decorators: [withRouter, onTheGround],
  parameters: {
    // The app is dark-only by design — the network has no light mode — so
    // Storybook's own canvas has to be too, or every story is judged against
    // a background the product never has.
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },
}

export default preview
