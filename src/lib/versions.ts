// Recipe edits. "Save to recipe" makes a new version; the card itself never changes, so any
// version (or the original card) can be brought back. Kept on this phone and in backups.
import { createStore } from './store'
import type { Recipe, Step } from './recipes'

/** Lines to replace (or add at the end), by position. */
export interface LineEdit { i: number; label?: string; text: string }
export interface Patch { mise?: LineEdit[]; steps?: LineEdit[] }

export interface Version { at: number; summary: string; mise: string[]; steps: Step[] }
/** active: which version is in use; -1 is the original card. */
export interface History { list: Version[]; active: number }

export const versions = createStore<Record<string, History>>({}, 'versions')

export function applyPatch<T extends Pick<Recipe, 'mise' | 'steps'>>(r: T, p?: Patch): T {
  if (!p || (!p.mise?.length && !p.steps?.length)) return r
  const mise = [...r.mise], steps = [...r.steps]
  for (const e of [...(p.mise ?? [])].sort((a, b) => a.i - b.i)) {
    const text = e.text.trim()
    if (!text) continue
    if (e.i >= 0 && e.i < mise.length) mise[e.i] = text; else mise.push(text)
  }
  for (const e of [...(p.steps ?? [])].sort((a, b) => a.i - b.i)) {
    const text = e.text.trim()
    if (!text) continue
    if (e.i >= 0 && e.i < steps.length) steps[e.i] = { label: e.label?.trim() || steps[e.i].label, text }
    else steps.push({ label: e.label?.trim() || 'Extra', text })
  }
  return { ...r, mise, steps }
}

/** Patches stack: a later edit to the same line wins. */
export function mergePatch(a: Patch | undefined, b: Patch): Patch {
  const join = (x: LineEdit[] = [], y: LineEdit[] = []) => [...x.filter((e) => !y.some((f) => f.i === e.i)), ...y]
  return { mise: join(a?.mise, b.mise), steps: join(a?.steps, b.steps) }
}

export const historyOf = (n: number, all = versions.get()): History | undefined => all[String(n)]

/** The recipe as currently used: the active version, or the card. */
export function current(r: Recipe, all = versions.get()): Recipe {
  const h = historyOf(r.number, all)
  const v = h && h.active >= 0 ? h.list[h.active] : undefined
  return v ? { ...r, mise: v.mise, steps: v.steps } : r
}
export const versionNumber = (r: Recipe, all = versions.get()) => (historyOf(r.number, all)?.active ?? -1) + 1

/** Positions whose text differs between two versions of a recipe. */
export function changed(before: Pick<Recipe, 'mise' | 'steps'>, after: Pick<Recipe, 'mise' | 'steps'>) {
  return {
    mise: after.mise.map((m, i) => (m !== before.mise[i] ? i : -1)).filter((i) => i >= 0),
    steps: after.steps.map((s, i) => (s.text !== before.steps[i]?.text || s.label !== before.steps[i]?.label ? i : -1)).filter((i) => i >= 0),
  }
}

export function saveVersion(base: Recipe, patch: Patch, summary: string, now = Date.now()) {
  const next = applyPatch(current(base), patch)
  const h = historyOf(base.number) ?? { list: [], active: -1 }
  const list = [...h.list, { at: now, summary: summary.trim() || 'Modifiée', mise: next.mise, steps: next.steps }]
  versions.set({ ...versions.get(), [base.number]: { list, active: list.length - 1 } })
}

/** Use another version; -1 brings back the original card. */
export function useVersion(n: number, index: number) {
  const h = historyOf(n)
  if (!h || index < -1 || index >= h.list.length) return
  versions.set({ ...versions.get(), [n]: { ...h, active: index } })
}
