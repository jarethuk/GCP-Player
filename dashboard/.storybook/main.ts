import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  // Stories sit beside the component they document, not in a parallel tree:
  // a component and its stories go stale together or not at all.
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
}

export default config
