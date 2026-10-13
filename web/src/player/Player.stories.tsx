import type { Meta, StoryObj } from '@storybook/react-vite'
import { withServices } from '../test/storyServices'
import { MiniPlayerBar } from './MiniPlayerBar'
import { NowPlaying } from './NowPlaying'

const meta: Meta = { title: 'Player', parameters: { layout: 'fullscreen' } }
export default meta

export const MiniBar: StoryObj = {
  decorators: [withServices({ playing: true })],
  render: () => <MiniPlayerBar onOpen={() => {}} />,
}

export const NowPlayingSheet: StoryObj = {
  decorators: [withServices({ playing: true })],
  render: () => <NowPlaying onClose={() => {}} onGoToShow={() => {}} />,
}

export const NowPlayingDialog: StoryObj = {
  decorators: [withServices({ playing: true, wide: true })],
  render: () => <NowPlaying onClose={() => {}} onGoToShow={() => {}} />,
}
