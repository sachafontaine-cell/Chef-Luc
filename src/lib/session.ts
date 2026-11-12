// The recipe being cooked right now: what is checked off, the portions, the timers.
// Saved on every change, so closing the app (or the phone restarting) loses nothing.
import { createStore } from './store'
import { familyPortions, type Portions } from './portions'
import { recipe as findRecipe, type Recipe } from './recipes'
import { familyCounts } from './settings'
import { applyPatch, current, mergePatch, type Patch } from './versions'

export interface Timer { id: string; label: string; ms: number; endAt: number; step?: number; quiet?: boolean }
export interface Session {
  recipe: number
  portions: Portions
  /** Checked mise en place lines and finished steps, by position. */
  mise: number[]
  steps: number[]
  timers: Timer[]
  startedAt: number
  /** The cook turned "keep the screen on" off. */
  lockOff?: boolean
  /** Changes for tonight only ("Juste ce soir"). */
  patch?: Patch
}

export const session = createStore<Session | null>(null, 'session')

/** Portions picked on a recipe page before cooking starts (not kept after the app closes). */
export const drafts = createStore<Record<number, Portions>>({})

export function portionsFor(r: Recipe): Portions {
  const s = session.get()
  return s && s.recipe === r.number ? s.portions : drafts.get()[r.number] ?? familyPortions(r, familyCounts())
}
/** The one place portions are changed, whether cooking has started or not. */
export function setPortions(r: Recipe, p: Portions) {
  const s = session.get()
  if (s && s.recipe === r.number) session.set({ ...s, portions: p })
  else drafts.set({ ...drafts.get(), [r.number]: p })
}

export function startCooking(r: Recipe, now = Date.now()) {
  session.set({ recipe: r.number, portions: portionsFor(r), mise: [], steps: [], timers: [], startedAt: now })
  const { [r.number]: _used, ...rest } = drafts.get()
  drafts.set(rest)
}
export const endCooking = () => session.set(null)

/** The recipe being cooked: its version in use, plus tonight's changes. */
export function cooking(s: Session | null): Recipe | undefined {
  const base = s ? findRecipe(s.recipe) : undefined
  return base && applyPatch(current(base), s!.patch)
}
export const addTonight = (p: Patch) => edit((s) => ({ ...s, patch: mergePatch(s.patch, p) }))
/** Back to the recipe as written, for tonight. */
export const clearTonight = () => edit((s) => ({ ...s, patch: undefined }))
export const allDone = (s: Session, r: Recipe) => r.steps.length > 0 && r.steps.every((_, i) => s.steps.includes(i))
/** The first step not done yet: what the cook should be looking at. */
export const currentStep = (s: Session, r: Recipe) => r.steps.findIndex((_, i) => !s.steps.includes(i))

const flip = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i])
const edit = (fn: (s: Session) => Session) => session.set((s) => (s ? fn(s) : s))

export const toggleMise = (i: number) => edit((s) => ({ ...s, mise: flip(s.mise, i) }))
export const toggleStep = (i: number) => edit((s) => ({ ...s, steps: flip(s.steps, i) }))
export const toggleLock = () => edit((s) => ({ ...s, lockOff: !s.lockOff }))

let seq = 0
export function startTimer(label: string, ms: number, step?: number, now = Date.now()) {
  edit((s) => ({ ...s, timers: [...s.timers, { id: `${now}-${seq++}`, label, ms, endAt: now + ms, step }] }))
}
export const stopTimer = (id: string) => edit((s) => ({ ...s, timers: s.timers.filter((t) => t.id !== id) }))
/** Add time. A timer that already rang restarts from now. */
export function addTime(id: string, ms: number, now = Date.now()) {
  edit((s) => ({ ...s, timers: s.timers.map((t) => (t.id === id ? { ...t, endAt: Math.max(t.endAt, now) + ms, quiet: false } : t)) }))
}
export const quietTimer = (id: string) => edit((s) => ({ ...s, timers: s.timers.map((t) => (t.id === id ? { ...t, quiet: true } : t)) }))

export const isRunning = (t: Timer, now: number) => now < t.endAt
export const isRinging = (t: Timer, now: number) => now >= t.endAt && !t.quiet
