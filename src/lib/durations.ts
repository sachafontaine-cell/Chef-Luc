// Finds cooking times written in a step ("12 min", "90 sec", "2 hr 45 min") so each can start a timer.
import { NUM, parseNum } from './amounts'

export interface Duration { at: number; length: number; ms: number; label: string }

const UNIT = '(hours?|hrs?|h|minutes?|mins?|seconds?|secs?)'
const RE = new RegExp(`(?<![\\w.,/-])(${NUM})\\s?${UNIT}\\b(?:\\s(${NUM})\\s?${UNIT}\\b)?`, 'gi')
const ms = (n: string, u: string) => parseNum(n) * (/^h/i.test(u) ? 3600000 : /^m/i.test(u) ? 60000 : 1000)

/** "2 h 45", "12 min", "90 s", "1 min 30". */
export function clock(total: number): string {
  const s = Math.round(total / 1000)
  if (s >= 3600) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h` }
  if (s >= 120 || s % 60 === 0) { const m = Math.floor(s / 60), r = s % 60; return r ? `${m} min ${String(r).padStart(2, '0')}` : `${m} min` }
  return `${s} s`
}

/** Remaining time as a ticking clock: "1:05:09", "12:07", "0:45". */
export function countdown(left: number): string {
  const s = Math.max(0, Math.ceil(left / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`
}

export function findDurations(text: string): Duration[] {
  const out: Duration[] = []
  for (const m of text.matchAll(RE)) {
    let total = ms(m[1], m[2])
    if (m[3]) total += ms(m[3], m[4])
    if (total < 5000 || out.some((d) => d.ms === total)) continue
    out.push({ at: m.index, length: m[0].length, ms: total, label: clock(total) })
  }
  return out
}
