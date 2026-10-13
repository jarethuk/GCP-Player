import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Artwork } from './Artwork'
import {
  Button,
  CircleIconButton,
  GradientPlayButton,
  OutlineButton,
  PillButton,
  SkipButton,
} from './Buttons'
import { Card } from './Card'
import { Chip, LockChip } from './Chips'
import { DisplayHeader } from './DisplayHeader'
import { EmptyState } from './EmptyState'
import {
  CheckCircleIcon,
  CheckmarkIcon,
  GearIcon,
  PasteIcon,
  PlayIcon,
  PlayRectangleIcon,
} from './Icons'
import { MetaLabel } from './MetaLabel'
import { SegmentedPicker } from './SegmentedPicker'
import { Spinner } from './Spinner'

const meta: Meta = { title: 'Primitives' }
export default meta

export const Header: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-8">
      <DisplayHeader eyebrow="Glass Cannon Network" title="Shows" />
      <DisplayHeader
        eyebrow="Glass Cannon Network"
        title="Manage"
        size={24}
        ruleWidth={44}
        as="h2"
      />
    </div>
  ),
}

export const MetaLabels: StoryObj = {
  render: () => (
    <div className="flex w-64 flex-col gap-3">
      <MetaLabel>Pathfinder 2E</MetaLabel>
      <MetaLabel showsTick={false} tone="sky">
        Glass Cannon Network
      </MetaLabel>
      <MetaLabel lines={2}>Pathfinder 2E Quest for the Frozen Flame, a long one</MetaLabel>
    </div>
  ),
}

export const Chips: StoryObj = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Chip tone="new">New</Chip>
      <LockChip label="Patreon only, locked" />
      <Chip tone="ember" dot>
        Failed
      </Chip>
      <Chip tone="sky" dot pulsing>
        Running
      </Chip>
      <Chip tone="moss" dot>
        Succeeded
      </Chip>
      <Chip>Edited</Chip>
    </div>
  ),
}

export const Buttons: StoryObj = {
  render: () => {
    const [playing, setPlaying] = useState(false)
    return (
      <div className="flex w-80 flex-col items-center gap-5">
        <div className="flex items-center gap-[30px]">
          <SkipButton seconds={15} forward={false} label="15 seconds" onClick={() => {}} />
          <GradientPlayButton
            isPlaying={playing}
            playLabel="Play"
            pauseLabel="Pause"
            onClick={() => setPlaying(!playing)}
          />
          <SkipButton seconds={30} forward label="30 seconds" onClick={() => {}} />
        </div>
        <Button variant="primary" full>
          <PlayIcon size={13} />
          Play
        </Button>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary">Save</Button>
          <Button>Cancel</Button>
          <Button variant="danger">Delete</Button>
          <Button variant="quiet">Edit</Button>
          <Button variant="primary" busy>
            Saving
          </Button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" size="small">
            Save
          </Button>
          <Button size="small">Cancel</Button>
          <Button variant="quiet" size="small">
            Edit
          </Button>
        </div>
        <div className="flex gap-2.5">
          <PillButton tone="tinted">
            <PasteIcon size={15} />
            Paste
          </PillButton>
          <PillButton>
            <CheckmarkIcon size={15} />
            Save
          </PillButton>
        </div>
        <CircleIconButton aria-label="Settings">
          <GearIcon size={19} />
        </CircleIconButton>
        <OutlineButton>Play Next Episode</OutlineButton>
        <OutlineButton>
          <PlayRectangleIcon size={14} />
          Watch on YouTube
        </OutlineButton>
      </div>
    )
  },
}

export const Picker: StoryObj = {
  render: () => {
    const [value, setValue] = useState<'a' | 'b'>('a')
    return (
      <div className="w-80">
        <SegmentedPicker
          options={[
            { value: 'a', label: 'Unplayed' },
            { value: 'b', label: 'Played' },
          ]}
          selection={value}
          onChange={setValue}
        />
      </div>
    )
  },
}

export const CardAndArtwork: StoryObj = {
  render: () => (
    <Card className="flex w-80 items-center gap-3 p-3">
      <Artwork url={null} size={56} title="Blood of the Wild" />
      <MetaLabel>No artwork yet</MetaLabel>
    </Card>
  ),
}

export const Empty: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-10">
      <EmptyState icon={<CheckCircleIcon size={44} />} title="All caught up" />
      <EmptyState
        tone="ember"
        title="That did not load"
        description="The catalogue service answered 502."
        action={<Button size="small">Try again</Button>}
      />
    </div>
  ),
}

export const Loading: StoryObj = {
  render: () => (
    <div className="flex flex-col items-center gap-3.5">
      <Spinner />
      <MetaLabel showsTick={false}>Loading shows</MetaLabel>
    </div>
  ),
}
