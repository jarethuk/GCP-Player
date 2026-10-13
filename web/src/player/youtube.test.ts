import { videoLink, youTubeLink } from './youtube'

describe('youTubeLink', () => {
  it('starts the video where the listener has got to', () => {
    expect(youTubeLink('https://www.youtube.com/watch?v=abc', 754.8)).toBe(
      'https://www.youtube.com/watch?v=abc&t=754',
    )
  })

  it("replaces a start time the feed's link already had", () => {
    expect(youTubeLink('https://youtu.be/abc?t=30&start=5', 100)).toBe('https://youtu.be/abc?t=100')
  })

  it('opens at the start for the first few seconds', () => {
    expect(youTubeLink('https://youtu.be/abc?t=30', 3)).toBe('https://youtu.be/abc')
  })

  it('ignores a link that is not one', () => {
    expect(videoLink('nope')).toBeNull()
    expect(videoLink(null)).toBeNull()
  })
})
