import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  // Beside the component each one documents, as in the dashboard.
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  staticDirs: ['../public'],
}

export default config
