import { describe, expect, it } from 'vitest'
import { dishes, emptyQuery, fold, recipe, RECIPES, search } from './recipes'
import { toFacets } from './family'

describe('the recipe library', () => {
  it('loads every card with steps and a photo', () => {
    expect(RECIPES.length).toBe(168)
    for (const r of RECIPES) {
      expect(r.title, `recipe ${r.number}`).toBeTruthy()
      expect(r.steps.length, `recipe ${r.number}`).toBeGreaterThan(0)
      expect(r.image, `recipe ${r.number}`).toMatch(/^thumbs\/\d{3}\.jpg$/)
    }
  })
  it('reads active minutes', () => {
    expect(recipe(27)!.activeMin).toBe(15)
  })
  it('shows the ingredients of household mixes too', () => {
    expect(recipe(154)!.mise).toEqual(['Dawn dish soap 1 cup', 'White vinegar 1 cup'])
    expect(recipe(154)!.group).toBe('household')
  })
})

describe('dishes to wash, read from the tools line (no AI)', () => {
  it('counts what goes in the sink', () => {
    expect(dishes(['Zojirushi rice cooker, baking dish, microplane or box grater, whisk, Meater'])).toEqual({ wash: ['Zojirushi rice cooker', 'baking dish', 'microplane', 'whisk'], count: 4 })
  })
  it('counts numbers and skips foil, parchment and bags', () => {
    expect(dishes(['2 small bowls, sheet pan + parchment, 4 freezer bags, 12" cast iron skillet (or BBQ)']).count).toBe(4)
  })
})

describe('searching', () => {
  const q = (change: object) => ({ ...emptyQuery(), ...change })
  it('finds by title', () => {
    expect(search(RECIPES, q({ q: 'satay' })).map((r) => r.number)).toContain(27)
  })
  it('finds by ingredient, ignoring accents and case', () => {
    expect(search(RECIPES, q({ q: 'Peanut Butter' })).map((r) => r.number)).toContain(27)
    expect(search(RECIPES, q({ q: 'zzzz' }))).toEqual([])
  })
  it('filters by category', () => {
    const soups = search(RECIPES, q({ groups: ['soup'] }))
    expect(soups.length).toBe(9)
    expect(soups.every((r) => r.group === 'soup')).toBe(true)
  })
  it('sorts by active time, then by fewest dishes', () => {
    const byTime = search(RECIPES, q({ groups: ['main'], sort: 'active' })).map((r) => r.activeMin!)
    expect(byTime).toEqual([...byTime].sort((a, b) => a - b))
    const byWash = search(RECIPES, q({ groups: ['main'], sort: 'wash' })).map((r) => r.washCount)
    expect(byWash).toEqual([...byWash].sort((a, b) => a - b))
  })
  it('uses the Control Center tags when the family link is there', () => {
    const facets = toFacets([{ t: 'Chicken Satay Bake', prot: 'Poulet', cui: 'Asiatique', style: ['Four', 'Riz'], kid: true, last: '2026-10-01' }, { t: 'Macaroni Salad', prot: 'Sans viande' }])
    expect(facets[fold('Chicken Satay Bake')].style).toEqual(['Four', 'Riz'])
    expect(search(RECIPES, q({ prot: ['Poulet'] }), facets).map((r) => r.number)).toEqual([27])
    expect(search(RECIPES, q({ style: ['Riz'], kid: true }), facets).map((r) => r.number)).toEqual([27])
    expect(search(RECIPES, q({ cui: ['Italien'] }), facets)).toEqual([])
  })
  it('survives odd answers from the Control Center', () => {
    expect(toFacets(undefined)).toEqual({})
    expect(toFacets(['Tacos', null, { prot: 'x' }])).toEqual({})
  })
})
