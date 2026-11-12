// Runs once per second and on every change: makes timers ring, and holds or releases the screen lock.
import { createStore } from './store'
import { allDone, cooking, isRinging, isRunning, quietTimer, session } from './session'
import { applyLock, wantLock } from './wakelock'
import { clearNotify, notify, setSound } from './alarm'

export interface Route { name: 'recipes' | 'recipe' | 'cook' | 'shop' | 'settings'; id?: number }
export function parseRoute(hash: string): Route {
  const p = hash.replace(/^#\/?/, '').split('/')
  if (p[0] === 'r' && /^\d+$/.test(p[1] || '')) return { name: 'recipe', id: +p[1] }
  if (p[0] === 'cook' || p[0] === 'shop' || p[0] === 'settings') return { name: p[0] }
  return { name: 'recipes' }
}
export const route = createStore<Route>({ name: 'recipes' })
export const go = (hash: string) => { location.hash = hash }

/** The clock the timers are drawn from. */
export const clock = createStore(Date.now())

/** A finished timer stops making noise by itself after this long (it stays on screen). */
const RING_MS = 3 * 60000

let lastTouch = Date.now()
const told = new Set<string>()

export function sync() {
  const now = Date.now(), s = session.get(), r = cooking(s)
  const timers = s?.timers ?? []
  for (const t of timers) {
    if (isRinging(t, now) && now - t.endAt > RING_MS) { quietTimer(t.id); return }
    if (now >= t.endAt && !told.has(t.id)) { told.add(t.id); if (!t.quiet) notify(t.id, t.label) }
  }
  for (const id of [...told]) if (!timers.some((t) => t.id === id && now >= t.endAt)) { told.delete(id); clearNotify(id) }
  const running = timers.some((t) => isRunning(t, now)), ringing = timers.some((t) => isRinging(t, now))
  setSound(running, ringing)
  applyLock(wantLock({
    visible: document.visibilityState === 'visible',
    inCook: route.get().name === 'cook' && !!r,
    finished: !!(s && r && allDone(s, r)),
    userOn: !s?.lockOff,
    timerRunning: running || ringing,
    lastTouch, now,
  }))
}

export function startEngine() {
  const onHash = () => { route.set(parseRoute(location.hash)); sync() }
  addEventListener('hashchange', onHash)
  route.set(parseRoute(location.hash))
  session.subscribe(sync)
  document.addEventListener('visibilitychange', sync)
  addEventListener('pointerdown', () => { lastTouch = Date.now(); sync() }, { passive: true })
  setInterval(() => { clock.set(Date.now()); sync() }, 1000)
  sync()
}
