import { describe, expect, it } from 'vitest'
import { clock, countdown, findDurations } from './durations'

const found = (t: string) => findDurations(t).map((d) => [d.ms / 1000, d.label])

describe('finding times in a step', () => {
  it('finds minutes, seconds and hours', () => {
    expect(found('Sear chicken 12 min, then 90 sec per side. Fridge 2 hr.')).toEqual([[720, '12 min'], [90, '90 s'], [7200, '2 h']])
  })
  it('joins hours with minutes', () => {
    expect(found('Braise 2 hr 45 min.')).toEqual([[9900, '2 h 45']])
    expect(found('Cook 1½ hr')).toEqual([[5400, '1 h 30']])
  })
  it('offers each time once', () => {
    expect(found('3 min per side, flip, 3 min more')).toEqual([[180, '3 min']])
  })
  it('ignores temperatures, sizes and amounts', () => {
    expect(found('Bake at 375°F (190°C) in a 12" skillet with 30 g oil, 2 cm apart')).toEqual([])
  })
})

describe('showing time', () => {
  it('labels durations', () => {
    expect(clock(150000)).toBe('2 min 30')
    expect(clock(45000)).toBe('45 s')
  })
  it('counts down', () => {
    expect(countdown(725000)).toBe('12:05')
    expect(countdown(3909000)).toBe('1:05:09')
    expect(countdown(-5)).toBe('0:00')
  })
})
