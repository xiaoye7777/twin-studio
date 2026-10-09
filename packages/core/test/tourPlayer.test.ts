import { describe, expect, it, vi } from 'vitest'
import type { CameraBookmark, Tour } from '../src/domain/scene'
import { type TourHost, TourPlayer, type TourState } from '../src/runtime/tour/TourPlayer'

const bookmark = (id: string): CameraBookmark => ({
  id,
  name: id,
  view: { position: [Number(id.slice(1)), 5, 5], target: [0, 0, 0] },
})
const step = (id: string, bookmarkId: string | null, patch: Partial<Tour['steps'][number]> = {}) => ({
  id,
  bookmarkId,
  nodeId: null,
  duration: 0.5,
  hold: 0.02,
  caption: `说明 ${id}`,
  show: [],
  hide: [],
  highlightNodeId: null,
  ...patch,
})

function setup(tour: Tour, flight: (index: number) => Promise<boolean> = async () => true) {
  const calls: string[] = []
  const visible = new Map<string, boolean>()
  let flights = 0
  const host: TourHost = {
    getTours: () => [tour],
    getBookmarks: () => [bookmark('v1'), bookmark('v2'), bookmark('v3')],
    flyTo: vi.fn((view, duration) => {
      calls.push(`fly:${view.position[0]}:${duration}`)
      return flight(flights++)
    }),
    frameNode: vi.fn(async id => {
      calls.push(`frame:${id}`)
      return true
    }),
    setNodeVisible: (id, value) => void visible.set(id, value),
    restoreVisibility: () => visible.clear(),
    setHighlight: id => void calls.push(`highlight:${id}`),
  }
  const states: TourState[] = []
  const player = new TourPlayer(host, state => states.push(state))
  return { player, calls, visible, states, host }
}

const tour = (patch: Partial<Tour> = {}): Tour => ({
  id: 't',
  name: '园区导览',
  loop: false,
  steps: [
    step('s1', 'v1', { show: ['A'], hide: ['B'], highlightNodeId: 'A' }),
    step('s2', null, { nodeId: 'n1' }),
    step('s3', 'v3'),
  ],
  ...patch,
})

describe('TourPlayer', () => {
  it('plays every step in order and ends idle', async () => {
    const { player, calls, states, visible } = setup(tour())
    const done = await player.play('t')
    expect(done).toBe(true)
    expect(calls.filter(call => !call.startsWith('highlight'))).toEqual(['fly:1:0.5', 'frame:n1', 'fly:3:0.5'])
    expect(states.map(state => state.caption).filter(Boolean)).toContain('说明 s2')
    expect(states.at(-1)).toMatchObject({ playing: false, tourId: null })
    // Layer changes are undone when the tour ends.
    expect(visible.size).toBe(0)
  })

  it('applies layers and highlights per step', async () => {
    const { player, visible, calls } = setup(tour(), async index => {
      if (index === 0) {
        expect(visible.get('A')).toBe(true)
        expect(visible.get('B')).toBe(false)
      }
      return true
    })
    await player.play('t')
    expect(calls).toContain('highlight:A')
    expect(calls.at(-1)).toBe('highlight:null')
  })

  it('stops when the user takes over the camera', async () => {
    const { player, calls } = setup(tour(), async index => index !== 0)
    expect(await player.play('t')).toBe(false)
    // Nothing after the interrupted flight runs.
    expect(calls.filter(call => call.startsWith('fly') || call.startsWith('frame'))).toEqual(['fly:1:0.5'])
    expect(player.getState().playing).toBe(false)
  })

  it('can be stopped from outside', async () => {
    const { player } = setup(tour({ steps: [step('s1', 'v1', { hold: 5 }), step('s2', 'v2')] }))
    const playing = player.play('t')
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(player.getState()).toMatchObject({ playing: true, stepIndex: 0 })
    player.stop()
    expect(await playing).toBe(false)
    expect(player.getState().playing).toBe(false)
  })

  it('holds while paused', async () => {
    const { player } = setup(tour({ steps: [step('s1', 'v1', { hold: 0.08 }), step('s2', 'v2')] }))
    const playing = player.play('t')
    await new Promise(resolve => setTimeout(resolve, 20))
    player.pause()
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(player.getState()).toMatchObject({ paused: true, stepIndex: 0 })
    player.resume()
    expect(await playing).toBe(true)
  })

  it('loops until stopped', async () => {
    const { player, calls } = setup(tour({ loop: true, steps: [step('s1', 'v1'), step('s2', 'v2')] }))
    const playing = player.play('t')
    await vi.waitFor(() => expect(calls.filter(call => call.startsWith('fly')).length).toBeGreaterThanOrEqual(4))
    player.stop()
    expect(await playing).toBe(false)
  })

  it('ignores unknown or empty tours', async () => {
    const { player } = setup(tour({ steps: [] }))
    expect(await player.play('t')).toBe(false)
    expect(await player.play('missing')).toBe(false)
  })
})
