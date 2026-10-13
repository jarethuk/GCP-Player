import type { Meta, StoryObj } from '@storybook/react-vite'
import { Route, Routes } from 'react-router'
import { withServices } from '../test/storyServices'
import { SettingsScreen } from './SettingsScreen'
import { ShowScreen } from './ShowScreen'

const meta: Meta = { title: 'Screens', parameters: { layout: 'fullscreen' } }
export default meta

export const Settings: StoryObj = {
  decorators: [withServices()],
  render: () => <SettingsScreen onClose={() => {}} />,
}

function AtShow() {
  return (
    <Routes location="/shows/blood-of-the-wild">
      <Route path="/shows/:slug" element={<ShowScreen />} />
    </Routes>
  )
}

export const Show: StoryObj = { decorators: [withServices()], render: () => <AtShow /> }

export const ShowWide: StoryObj = {
  decorators: [withServices({ wide: true })],
  render: () => <AtShow />,
}
