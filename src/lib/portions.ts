// How much to cook. Every card is written for the family dinner (2 adults, 2 kids, plus
// lunches when it says so). Changing the people or the portion size gives one multiplier
// applied to every amount. Children's plates follow their ages (from Réglages → Famille).
import type { Recipe } from './recipes'

export type Size = 'light' | 'normal' | 'generous'
export interface Portions { adults: number; kids: number; lunches: number; size: Size; mult: number }

export const SIZES: Record<Size, number> = { light: 0.8, normal: 1, generous: 1.2 }
/** A child's plate (and a next-day lunch) as a share of an adult's, when ages are unknown. */
export const KID = 0.75
/** The household every "Dinner 4" card is written for. */
export const CARD = { adults: 2, kids: 2 }

/** Cards written for the family dinner get people counters; batches get a plain multiplier. */
export function yieldKind(y: string): { family: boolean; lunches: number } {
  if (/^Dinner 4 \+ 2 small lunches/i.test(y)) return { family: true, lunches: 2 }
  if (/^Dinner 4\b/i.test(y)) return { family: true, lunches: 0 }
  return { family: false, lunches: 0 }
}

/** Exactly what the card makes. */
export function cardPortions(r: Pick<Recipe, 'yield'>): Portions {
  return { ...CARD, lunches: yieldKind(r.yield).lunches, size: 'normal', mult: 1 }
}

/** Where a new cooking session starts: today's family, the card's lunches. */
export function familyPortions(r: Pick<Recipe, 'yield'>, family: { adults: number; kids: number }): Portions {
  return { ...cardPortions(r), adults: family.adults, kids: family.kids }
}

const units = (p: Pick<Portions, 'adults' | 'kids' | 'lunches'>, kid: number) => p.adults + kid * (p.kids + p.lunches)

export function factor(r: Pick<Recipe, 'yield'>, p: Portions, kid = KID): number {
  if (!yieldKind(r.yield).family) return p.mult
  return (units(p, kid) / units(cardPortions(r), kid)) * SIZES[p.size]
}

export const isCard = (r: Pick<Recipe, 'yield'>, p: Portions, kid = KID) => Math.abs(factor(r, p, kid) - 1) < 0.005

/** "×1,4" the French way. */
export const times = (f: number) => '×' + String(parseFloat(f.toFixed(2))).replace('.', ',')
