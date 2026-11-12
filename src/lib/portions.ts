// How much to cook. The card's own yield is the starting point; changing the people or the
// portion size gives one multiplier applied to every amount.
import type { Recipe } from './recipes'

export type Size = 'light' | 'normal' | 'generous'
export interface Portions { adults: number; kids: number; lunches: number; size: Size; mult: number }

export const SIZES: Record<Size, number> = { light: 0.8, normal: 1, generous: 1.2 }
/** A child's plate, and a next-day lunch, as a share of an adult's plate. */
export const KID = 0.75
/** The household every "Dinner 4" card is written for. */
export const FAMILY = { adults: 2, kids: 2 }

/** Cards written for the family dinner get people counters; batches get a plain multiplier. */
export function yieldKind(y: string): { family: boolean; lunches: number } {
  if (/^Dinner 4 \+ 2 small lunches/i.test(y)) return { family: true, lunches: 2 }
  if (/^Dinner 4\b/i.test(y)) return { family: true, lunches: 0 }
  return { family: false, lunches: 0 }
}

export function cardPortions(r: Pick<Recipe, 'yield'>): Portions {
  return { ...FAMILY, lunches: yieldKind(r.yield).lunches, size: 'normal', mult: 1 }
}

const units = (p: Pick<Portions, 'adults' | 'kids' | 'lunches'>) => p.adults + KID * (p.kids + p.lunches)

export function factor(r: Pick<Recipe, 'yield'>, p: Portions): number {
  if (!yieldKind(r.yield).family) return p.mult
  const base = units(cardPortions(r))
  return (units(p) / base) * SIZES[p.size]
}

export const isCard = (r: Pick<Recipe, 'yield'>, p: Portions) => Math.abs(factor(r, p) - 1) < 0.005

/** "×1,4" the French way. */
export const times = (f: number) => '×' + String(parseFloat(f.toFixed(2))).replace('.', ',')
