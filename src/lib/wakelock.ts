// Keeps the phone screen on while cooking.
// On in Cook mode; back on when the app returns to the screen; released when the last step is
// done, when leaving Cook mode, or after 20 minutes with no tap and no running timer.
// A running timer also keeps the screen on, so it can always ring.
import { createStore } from './store'

export const IDLE_MS = 20 * 60000

export interface LockInput {
  visible: boolean
  /** The Cook screen is showing a recipe. */
  inCook: boolean
  /** Every step is checked off. */
  finished: boolean
  /** The cook's own switch (the small icon). */
  userOn: boolean
  timerRunning: boolean
  lastTouch: number
  now: number
}

export function wantLock(i: LockInput): boolean {
  if (!i.visible || !i.userOn) return false
  if (i.timerRunning) return true
  return i.inCook && !i.finished && i.now - i.lastTouch < IDLE_MS
}

export const lockHeld = createStore(false)
export const lockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator

let sentinel: WakeLockSentinel | null = null
let asking = false

export async function applyLock(want: boolean) {
  if (!lockSupported()) return
  if (want && !sentinel && !asking) {
    asking = true
    try {
      const s = await navigator.wakeLock.request('screen')
      sentinel = s
      lockHeld.set(true)
      // The phone releases it by itself when the app is hidden.
      s.addEventListener('release', () => { if (sentinel === s) { sentinel = null; lockHeld.set(false) } })
    } catch { /* refused (battery saver, hidden tab): try again on the next change */ }
    asking = false
  } else if (!want && sentinel) {
    const s = sentinel
    sentinel = null
    lockHeld.set(false)
    try { await s.release() } catch { /* already gone */ }
  }
}
