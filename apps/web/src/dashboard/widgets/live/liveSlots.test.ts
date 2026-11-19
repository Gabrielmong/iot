import { EMPTY_SLOTS, release, request, take } from './liveSlots'

describe('live slots', () => {
  it('grants two and keeps the third waiting', () => {
    const s = request(request(request(EMPTY_SLOTS, 'a'), 'b'), 'c')
    expect(s.live).toEqual(['a', 'b'])
    expect(s.waiting).toEqual(['c'])
  })

  it('asking again changes nothing', () => {
    const s = request(request(EMPTY_SLOTS, 'a'), 'a')
    expect(s).toEqual({ live: ['a'], waiting: [] })
  })

  it('a tap takes a slot, stopping the oldest live one (which waits for a free slot)', () => {
    const s = take(request(request(request(EMPTY_SLOTS, 'a'), 'b'), 'c'), 'c')
    expect(s.live).toEqual(['b', 'c'])
    expect(s.waiting).toEqual(['a'])
  })

  it('releasing frees the slot for the first one waiting', () => {
    const s = release(request(request(request(EMPTY_SLOTS, 'a'), 'b'), 'c'), 'a')
    expect(s.live).toEqual(['b', 'c'])
    expect(s.waiting).toEqual([])
  })

  it('releasing a waiting key just drops it', () => {
    const s = release(request(request(request(EMPTY_SLOTS, 'a'), 'b'), 'c'), 'c')
    expect(s).toEqual({ live: ['a', 'b'], waiting: [] })
  })
})
