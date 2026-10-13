import type { Meta, StoryObj } from '@storybook/react-vite'
import { sampleShow } from '../test/storyServices'
import { ShowRow, ShowTile, SidebarShowRow } from './ShowRows'

const now = Date.now()
const old = now - 30 * 24 * 60 * 60 * 1000
const isNew = sampleShow
const plain = {
  ...sampleShow,
  latestPublicEpisodeAt: old,
  latestAnyEpisodeAt: old,
  latestEpisodeAt: old,
}
const earlyRelease = { ...plain, latestAnyEpisodeAt: now - 1000 }
const patreonOnly = {
  ...plain,
  isPublic: false,
  title: 'Legacy of the Ancients',
  system: 'Pathfinder 1E',
}

const meta: Meta = { title: 'Shows' }
export default meta

export const PhoneRows: StoryObj = {
  render: () => (
    <div className="flex w-[370px] flex-col gap-2">
      <ShowRow show={isNew} unplayed={3} hasToken={false} />
      <ShowRow show={earlyRelease} unplayed={3} hasToken={false} />
      <ShowRow show={patreonOnly} unplayed={0} hasToken={false} />
      <ShowRow show={plain} unplayed={3} hasToken={false} />
    </div>
  ),
}

export const SidebarRows: StoryObj = {
  parameters: { backgrounds: { value: 'deep' } },
  render: () => (
    <div className="flex w-[320px] flex-col gap-1.5">
      <SidebarShowRow show={isNew} unplayed={3} hasToken={false} selected={false} />
      <SidebarShowRow show={earlyRelease} unplayed={3} hasToken={false} selected />
      <SidebarShowRow show={patreonOnly} unplayed={0} hasToken={false} selected={false} />
      <SidebarShowRow show={plain} unplayed={3} hasToken={false} selected={false} />
    </div>
  ),
}

export const Tiles: StoryObj = {
  render: () => (
    <div className="grid w-[640px] grid-cols-3 gap-4">
      <ShowTile show={isNew} unplayed={3} hasToken={false} />
      <ShowTile show={patreonOnly} unplayed={0} hasToken={false} />
      <ShowTile show={plain} unplayed={3} hasToken={false} />
    </div>
  ),
}
