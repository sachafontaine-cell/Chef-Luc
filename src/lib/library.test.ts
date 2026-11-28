// @vitest-environment node
import { describe, expect, it } from 'vitest'

const saved = new Map<string, string>()
;(globalThis as any).localStorage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) }, removeItem: (k: string) => { saved.delete(k) } }
const { BUNDLED_VERSION, library, recipe, recipeByTitle, RECIPES, useRemoteLibrary } = await import('./recipes')
const { cardBody, parseCard } = await import('./luc')
const { defaultSettings } = await import('./settings')
const bundled = (await import('../data/recipes.json')).default as any[]

describe('recipes from Drive', () => {
  it('starts from the built-in copy', () => {
    expect(library.get().version).toBe(BUNDLED_VERSION)
    expect(recipe(169)!.title).toBe('Marry Me Chicken')
  })
  it('takes a newer recipe file, with a photo from the app, and keeps it for next time', () => {
    const added = { number: 170, title: 'Lentil Soup', meta: '', category: 'Soup', yield: 'Dinner 4 + 2 small lunches', active: '15 min Active', total: '40 min Total', household: false,
      tools: ['Instant Pot, board'], mise: ['Red lentils 300 g: rinse'], ingredient_groups: [], steps: [{ label: 'Cook', text: 'High 8 min.' }], notes: [], image_data: 'data:image/jpeg;base64,AAAA' }
    expect(useRemoteLibrary([...bundled, added], BUNDLED_VERSION + 1)).toBe(true)
    expect(RECIPES.length).toBe(170)
    expect(recipeByTitle('lentil soup')!.image).toBe('data:image/jpeg;base64,AAAA')
    expect(recipe(170)!.activeMin).toBe(15)
    expect(JSON.parse(saved.get('chef-luc:library')!).version).toBe(BUNDLED_VERSION + 1)
  })
  it('ignores an older file and broken entries', () => {
    expect(useRemoteLibrary([], BUNDLED_VERSION)).toBe(false)
    expect(useRemoteLibrary([{ title: 'no number' }, ...bundled], BUNDLED_VERSION + 2)).toBe(true)
    expect(RECIPES.length).toBe(169)
  })
})

describe('new recipe card from Luc', () => {
  it('sends the rules, the example card, the photos and a correction', () => {
    const b: any = cardBody(defaultSettings(), { text: 'Soupe aux lentilles de maman', images: [{ mime: 'image/jpeg', data: 'QQ==' }] }, parseCard({ title: 'Lentil Soup', steps: [{ label: 'Cook', text: 'x' }] }), 'sans oignon')
    const sys = b.systemInstruction.parts[0].text
    expect(sys).toContain('master chef focused on maximum flavor')
    expect(sys).toContain('"title":"Marry Me Chicken"')
    expect(b.contents[0].parts.map((p: any) => Object.keys(p)[0])).toEqual(['text', 'inline_data', 'text'])
    expect(b.contents[0].parts[2].text).toContain('sans oignon')
  })
  it('keeps only a usable card', () => {
    expect(parseCard({ title: 'X', steps: [] })).toBeUndefined()
    expect(parseCard({ title: ' Pho ', category: 'Weird', steps: [{ text: 'Boil.' }], tools: ['pot', ''], remarks: 'ok' })).toMatchObject({ title: 'Pho', category: 'Main', tools: ['pot'], steps: [{ label: 'Step', text: 'Boil.' }], yield: 'Dinner 4 + 2 small lunches' })
  })
})
