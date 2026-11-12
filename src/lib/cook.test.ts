// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { cardPortions, factor, isCard, times, yieldKind } from './portions'
import { recipe } from './recipes'
import { IDLE_MS, wantLock, type LockInput } from './wakelock'

// A stand-in for the phone's storage, so "close and reopen the app" can be tested.
const saved = new Map<string, string>()
;(globalThis as any).localStorage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) }, removeItem: (k: string) => { saved.delete(k) } }
const { addTime, allDone, currentStep, endCooking, isRinging, isRunning, portionsFor, quietTimer, session, setPortions, startCooking, startTimer, stopTimer, toggleMise, toggleStep } = await import('./session')
const { createStore } = await import('./store')

const satay = recipe(27)!

describe('portions', () => {
  it('starts from the card', () => {
    expect(cardPortions(satay)).toEqual({ adults: 2, kids: 2, lunches: 2, size: 'normal', mult: 1 })
    expect(factor(satay, cardPortions(satay))).toBe(1)
    expect(isCard(satay, cardPortions(satay))).toBe(true)
  })
  it('counts kids and lunches as three quarters of an adult', () => {
    expect(factor(satay, { ...cardPortions(satay), adults: 4 })).toBeCloseTo(7 / 5)
    expect(factor(satay, { ...cardPortions(satay), lunches: 0 })).toBeCloseTo(3.5 / 5)
  })
  it('light is 0.8 and generous is 1.2', () => {
    expect(factor(satay, { ...cardPortions(satay), size: 'light' })).toBeCloseTo(0.8)
    expect(factor(satay, { ...cardPortions(satay), size: 'generous' })).toBeCloseTo(1.2)
  })
  it('a dinner card without lunches starts at zero lunches', () => {
    expect(yieldKind('Dinner 4')).toEqual({ family: true, lunches: 0 })
    expect(factor({ yield: 'Dinner 4' }, { adults: 2, kids: 2, lunches: 2, size: 'normal', mult: 1 })).toBeCloseTo(5 / 3.5)
  })
  it('batches use a plain multiplier', () => {
    expect(yieldKind('Makes 36 cookies').family).toBe(false)
    expect(factor({ yield: 'Makes 36 cookies' }, { adults: 9, kids: 9, lunches: 9, size: 'generous', mult: 2 })).toBe(2)
    expect(times(1.4)).toBe('×1,4')
  })
})

describe('a cooking session', () => {
  beforeEach(() => endCooking())
  it('keeps portions chosen before cooking, in one place', () => {
    setPortions(satay, { ...cardPortions(satay), adults: 4 })
    expect(session.get()).toBeNull()
    startCooking(satay)
    expect(session.get()!.portions.adults).toBe(4)
    setPortions(satay, { ...portionsFor(satay), size: 'light' })
    expect(session.get()!.portions.size).toBe('light')
  })
  it('checks off mise and steps, and knows the current step', () => {
    startCooking(satay)
    toggleMise(0); toggleStep(0); toggleStep(1)
    expect(session.get()!.mise).toEqual([0])
    expect(currentStep(session.get()!, satay)).toBe(2)
    toggleStep(1)
    expect(currentStep(session.get()!, satay)).toBe(1)
    expect(allDone(session.get()!, satay)).toBe(false)
    satay.steps.forEach((_, i) => { if (!session.get()!.steps.includes(i)) toggleStep(i) })
    expect(allDone(session.get()!, satay)).toBe(true)
  })
  it('runs several timers at once', () => {
    startCooking(satay)
    startTimer('Rice', 60000, 2, 1000); startTimer('Bake', 1800000, 3, 1000)
    const [rice, bake] = session.get()!.timers
    expect(isRunning(rice, 30000)).toBe(true)
    expect(isRinging(rice, 61000)).toBe(true)
    expect(isRunning(bake, 61000)).toBe(true)
    addTime(rice.id, 60000, 61000)
    expect(isRunning(session.get()!.timers[0], 100000)).toBe(true)
    quietTimer(bake.id)
    expect(isRinging(session.get()!.timers[1], 9e9)).toBe(false)
    stopTimer(rice.id)
    expect(session.get()!.timers.map((t) => t.label)).toEqual(['Bake'])
  })
  it('survives closing the app: recipe, checks and timers come back', () => {
    startCooking(satay, 5000)
    toggleMise(1); toggleStep(0); startTimer('Bake', 1800000, 3, 5000)
    const reopened = createStore<any>(null, 'session').get()
    expect(reopened.recipe).toBe(27)
    expect(reopened.mise).toEqual([1])
    expect(reopened.steps).toEqual([0])
    expect(reopened.timers[0]).toMatchObject({ label: 'Bake', endAt: 1805000 })
    endCooking()
    expect(createStore<any>(null, 'session').get()).toBeNull()
  })
})

describe('keeping the screen on', () => {
  const base: LockInput = { visible: true, inCook: true, finished: false, userOn: true, timerRunning: false, lastTouch: 0, now: 1000 }
  it('is on in Cook mode', () => expect(wantLock(base)).toBe(true))
  it('is off outside Cook mode', () => expect(wantLock({ ...base, inCook: false })).toBe(false))
  it('is off when the cook switches it off', () => expect(wantLock({ ...base, userOn: false })).toBe(false))
  it('is released when the last step is done', () => expect(wantLock({ ...base, finished: true })).toBe(false))
  it('is released after 20 minutes without a tap', () => {
    expect(wantLock({ ...base, now: IDLE_MS - 1 })).toBe(true)
    expect(wantLock({ ...base, now: IDLE_MS + 1 })).toBe(false)
  })
  it('stays on past 20 minutes while a timer runs', () => expect(wantLock({ ...base, now: IDLE_MS * 3, timerRunning: true })).toBe(true))
  it('comes back with the next tap', () => expect(wantLock({ ...base, now: IDLE_MS * 3, lastTouch: IDLE_MS * 3 - 5 })).toBe(true))
  it('waits while the app is hidden, and returns when it is visible again', () => {
    expect(wantLock({ ...base, visible: false })).toBe(false)
    expect(wantLock({ ...base, visible: true })).toBe(true)
  })
})
