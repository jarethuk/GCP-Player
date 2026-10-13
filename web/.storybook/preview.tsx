import type { Preview } from '@storybook/react-vite'
import '../src/index.css'

const preview: Preview = {
  parameters: {
    layout: 'padded',
    // Dark only, like the app.
    backgrounds: {
      options: {
        ink: { name: 'Ink', value: '#03253f' },
        deep: { name: 'Ink deep', value: '#021a2e' },
      },
    },
  },
  initialGlobals: { backgrounds: { value: 'ink' } },
}

export default preview
