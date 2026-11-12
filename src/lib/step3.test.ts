// @vitest-environment node
import { describe, expect, it } from 'vitest'

const saved = new Map<string, string>()
;(globalThis as any).localStorage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) }, removeItem: (k: string) => { saved.delete(k) } }
const { buildList, defaultStore, inPantry, itemKey, listText, readAmount, shared, showAmount, showItem } = await import('./shopping')
const { comingDinners, fromState, sentFor } = await import('./family')
const { prepBody, parsePrep } = await import('./luc')
const { DEFAULT_PANTRY, DEFAULT_STORES, settings } = await import('./settings')
const { recipe } = await import('./recipes')

const plan = (...n: number[]) => n.map((x) => ({ recipe: recipe(x)!, factor: 1 }))

describe('amounts', () => {
  it('converts units so duplicates add up', () => {
    expect(readAmount('1¾ lb')).toEqual({ qty: 1.75 * 454, unit: 'g' })
    expect(readAmount('2 tbsp')).toEqual({ qty: 30, unit: 'ml' })
    expect(readAmount('1.5 L')).toEqual({ qty: 1500, unit: 'ml' })
    expect(readAmount('2 cans')).toEqual({ qty: 2, unit: 'can' })
    expect(readAmount('3')).toEqual({ qty: 3, unit: 'each' })
    expect(readAmount('2 bunches')).toEqual({ qty: 2, unit: 'bunch' })
  })
  it('shows shop-friendly amounts', () => {
    expect(showAmount({ qty: 1234, unit: 'g' })).toBe('1,2 kg')
    expect(showAmount({ qty: 333, unit: 'g' })).toBe('335 g')
    expect(showAmount({ qty: 2.1, unit: 'can' })).toBe('2 cans')
    expect(showAmount({ qty: 2.4, unit: 'each' })).toBe('3')
    expect(showAmount({ qty: 2, unit: 'bunch' })).toBe('2 bunches')
  })
  it('treats plurals and sizes as the same ingredient', () => {
    expect(itemKey('Onions')).toBe(itemKey('medium onion'))
    expect(itemKey('Cherry tomatoes')).toBe('cherry tomato')
  })
})

describe('pantry and stores', () => {
  it('leaves staples out', () => {
    expect(inPantry(itemKey('Fine salt'), DEFAULT_PANTRY)).toBe(true)
    expect(inPantry(itemKey('Garlic'), DEFAULT_PANTRY)).toBe(true)
    expect(inPantry(itemKey('Cumin'), DEFAULT_PANTRY)).toBe(true)
    expect(inPantry(itemKey('Pepper'), DEFAULT_PANTRY)).toBe(true)
    expect(inPantry(itemKey('Sesame oil'), DEFAULT_PANTRY)).toBe(false)
    expect(inPantry(itemKey('Red pepper'), DEFAULT_PANTRY)).toBe(false)
    expect(inPantry(itemKey('Chicken thighs'), DEFAULT_PANTRY)).toBe(false)
  })
  it('sends specialty items to the specialty store, the rest to the first store', () => {
    expect(defaultStore('Tahini', DEFAULT_STORES)).toBe('Balboa/99Ranch/TJ')
    expect(defaultStore('Fish sauce', DEFAULT_STORES)).toBe('Balboa/99Ranch/TJ')
    expect(defaultStore('Chicken thighs', DEFAULT_STORES)).toBe('Aldi')
    expect(defaultStore('Chicken thighs', ['Costco', 'Aldi'])).toBe('Costco')
  })
})

describe('the merged list', () => {
  it('a 3-recipe week has no duplicate lines', () => {
    const l = buildList(plan(27, 83, 1), DEFAULT_PANTRY, DEFAULT_STORES)
    const keys = [...l.items, ...l.pantry].map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    const lines = listText(l.items, DEFAULT_STORES).split('\n').filter((x) => x && x === x.replace(/^[A-Z/0-9]+$/, ''))
    expect(new Set(lines).size).toBe(lines.length)
  })
  it('adds up the same ingredient across recipes, scaled', () => {
    const one = buildList(plan(1), [], DEFAULT_STORES).items.find((i) => i.key === 'fine salt')
    const two = buildList([{ recipe: recipe(1)!, factor: 1 }, { recipe: recipe(1)!, factor: 0.5 }], [], DEFAULT_STORES).items.find((i) => i.key === 'fine salt')
    expect(two!.amounts[0].qty).toBeCloseTo(one!.amounts[0].qty * 1.5)
  })
  it('names where each item comes from, and what several recipes share', () => {
    const l = buildList(plan(27, 127), DEFAULT_PANTRY, DEFAULT_STORES)
    expect(l.items.find((i) => i.key === 'chicken thigh')!.from).toEqual([27])
    expect(shared(l).map((i) => i.key)).toContain('cayenne')
  })
  it('remembers a store chosen by hand', () => {
    const l = buildList(plan(27), DEFAULT_PANTRY, DEFAULT_STORES, { 'jasmine rice': 'Costco' })
    expect(l.items.find((i) => i.key === 'jasmine rice')!.store).toBe('Costco')
  })
  it('writes one item per line, grouped by store in store order', () => {
    const l = buildList(plan(27), DEFAULT_PANTRY, DEFAULT_STORES)
    const t = listText(l.items, DEFAULT_STORES)
    expect(t.startsWith('ALDI\n')).toBe(true)
    expect(t).toContain('Boneless chicken thighs 800 g')
    expect(showItem(l.items[0])).not.toMatch(/\s$/)
  })
})

describe('the Control Center link', () => {
  const j = {
    recipes: [{ t: 'Chicken Satay Bake', prot: 'Poulet' }], cozi: true,
    menu: [{ date: '2026-11-09', cook: 'Papa', dish: 'Old' }, { date: '2026-11-12', cook: 'Maman', dish: 'Chicken Satay Bake' }],
    upcoming: [{ date: '2026-11-12', cook: 'Maman', dish: 'Chicken Satay Bake' }, { date: '2026-11-17', cook: 'Papa', dish: 'Macaroni Salad' }],
    sent: [{ date: '2026-11-12', dish: 'chicken satay bake', at: 5, by: 'Control Center' }],
  }
  it('reads the coming dinners and what was already sent', () => {
    const f = fromState(j, 1)
    expect(f.linked).toBe(true)
    expect(comingDinners(f, '2026-11-12').map((d) => d.dish)).toEqual(['Chicken Satay Bake', 'Macaroni Salad'])
    expect(sentFor(f, { date: '2026-11-12', dish: 'Chicken Satay Bake' })?.by).toBe('Control Center')
    expect(sentFor(f, { date: '2026-11-17', dish: 'Macaroni Salad' })).toBeUndefined()
  })
  it('falls back to this week with the older script', () => {
    const f = fromState({ ...j, upcoming: undefined, sent: undefined }, 1)
    expect(f.linked).toBe(false)
    expect(comingDinners(f, '2026-11-12').map((d) => d.dish)).toEqual(['Chicken Satay Bake'])
  })
})

describe('batch prep: one AI call', () => {
  it('sends every chosen recipe and what they share', () => {
    const b: any = prepBody(settings.get(), [recipe(27)!, recipe(83)!], 'Onion (027, 083)')
    const text = b.contents[0].parts[0].text
    expect(text).toContain('RECIPE 027 Chicken Satay Bake')
    expect(text).toContain('RECIPE 083 Macaroni Salad')
    expect(text).toContain('INGREDIENTS IN SEVERAL RECIPES: Onion (027, 083)')
    expect(parsePrep({ tips: [' Riz : une fois pour 027 et 083 ', ''] })).toEqual(['Riz : une fois pour 027 et 083'])
    expect(parsePrep(null)).toEqual([])
  })
})
