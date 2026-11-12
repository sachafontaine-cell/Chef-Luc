// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const saved = new Map<string, string>()
;(globalThis as any).localStorage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => { saved.set(k, v) }, removeItem: (k: string) => { saved.delete(k) } }
const { age, defaultSettings, familyText, kidShare, settings, shareForAge } = await import('./settings')
const { applyPatch, changed, current, mergePatch, saveVersion, useVersion, versions } = await import('./versions')
const { askBody, parseReply, readJson, recipeText, swapQuestion, systemText } = await import('./luc')
const { ingredientsIn } = await import('./ingredients')
const { makeBackup, readBackup, restoreBackup } = await import('./backup')
const { generate, withModels, LucError, RETRY, modelOrder } = await import('./gemini')
RETRY.pauseMs = 1
const { recipe } = await import('./recipes')
const { addRule } = await import('../screens/luc')
const { factor, familyPortions } = await import('./portions')

const satay = recipe(27)!
const ctx = { recipe: satay, done: [0], current: 1, factor: 1.4, portions: '4 adultes · 2 enfants' }

describe('family and ages', () => {
  const today = new Date(2026, 10, 12)
  it('computes ages from birthdays', () => {
    expect(age('2016-07-07', today)).toBe(10)
    expect(age('2017-12-08', today)).toBe(8)
    expect(age('2017-12-08', new Date(2026, 11, 8))).toBe(9)
    expect(age(undefined, today)).toBeUndefined()
  })
  it('sizes a child plate by age, ¾ when unknown', () => {
    expect(shareForAge(10)).toBe(0.8)
    expect(shareForAge(8)).toBe(0.65)
    expect(kidShare(defaultSettings(), today)).toBe(0.75)
    const s = { ...defaultSettings(), family: [{ id: 'a', name: 'A', adult: true }, { id: 'k', name: 'K', adult: false, birth: '2016-07-07' }, { id: 'l', name: 'L', adult: false, birth: '2017-12-08' }] }
    expect(kidShare(s, today)).toBeCloseTo(0.725)
    expect(familyText(s, today)).toBe('1 adult; kids aged 10 and 8')
  })
  it('the card stays ×1 for the family it was written for, whatever the ages', () => {
    expect(factor(satay, familyPortions(satay, { adults: 2, kids: 2 }), 0.65)).toBeCloseTo(1)
    expect(factor(satay, familyPortions(satay, { adults: 2, kids: 3 }), 0.8)).toBeGreaterThan(1)
  })
})

describe('recipe versions', () => {
  beforeEach(() => versions.set({}))
  it('replaces and adds lines without renumbering', () => {
    const out = applyPatch(satay, { mise: [{ i: 1, text: 'Chicken breast 800 g' }], steps: [{ i: 6, label: 'Garnish', text: 'Cilantro on top.' }] })
    expect(out.mise[1]).toBe('Chicken breast 800 g')
    expect(out.mise.length).toBe(satay.mise.length)
    expect(out.steps.at(-1)).toEqual({ label: 'Garnish', text: 'Cilantro on top.' })
    expect(changed(satay, out)).toEqual({ mise: [1], steps: [6] })
  })
  it('later edits to the same line win', () => {
    expect(mergePatch({ mise: [{ i: 0, text: 'a' }] }, { mise: [{ i: 0, text: 'b' }] }).mise).toEqual([{ i: 0, text: 'b' }])
  })
  it('saving creates a version that can be undone and restored', () => {
    saveVersion(satay, { mise: [{ i: 1, text: 'Chicken breast 800 g' }] }, 'Poitrine', 1)
    expect(current(satay).mise[1]).toBe('Chicken breast 800 g')
    saveVersion(satay, { steps: [{ i: 4, text: 'Rest 10 min.' }] }, 'Repos', 2)
    expect(current(satay).mise[1]).toBe('Chicken breast 800 g')
    expect(current(satay).steps[4].text).toBe('Rest 10 min.')
    useVersion(27, 0)
    expect(current(satay).steps[4].text).toBe(satay.steps[4].text)
    useVersion(27, -1)
    expect(current(satay)).toEqual(satay)
    useVersion(27, 1)
    expect(current(satay).steps[4].text).toBe('Rest 10 min.')
    expect(recipe(27)!.mise[1]).toBe('Boneless chicken thighs 800 g (1¾ lb)')
  })
})

describe('what Luc is sent', () => {
  it('carries the rules, tools, family, the numbered recipe and the current step', () => {
    const sys = systemText(settings.get())
    expect(sys).toContain('master chef focused on maximum flavor')
    expect(sys).toContain('Instant Pot IP-Duo80')
    expect(sys).toContain('2 adults; 2 kids')
    expect(sys).toMatch(/answer" in French/)
    const t = recipeText(ctx)
    expect(t).toContain('1: Boneless chicken thighs 800 g')
    expect(t).toContain('0: Marinade — Whisk everything in the baking dish until smooth.  [done]')
    expect(t).toContain('CURRENT STEP: 1 (Marinate)')
    expect(t).toContain('×1.4')
  })
  it('asks for structured JSON and keeps the previous exchange for a follow-up', () => {
    const b: any = askBody(settings.get(), ctx, 'Combien de riz ?', { q: 'Avant', a: 'Réponse' })
    expect(b.generationConfig.responseMimeType).toBe('application/json')
    expect(b.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user'])
    expect(b.contents[2].parts[0].text).toMatch(/QUESTION: Combien de riz \?$/)
  })
  it('asks for 1 to 3 substitutes on a swap', () => {
    expect(swapQuestion('Peanut butter', 0)).toMatch(/I don't have: Peanut butter \(mise en place line 0\)\. Give 1 to 3 substitutes/)
  })
})

describe("reading Luc's answer", () => {
  it('keeps valid edits only', () => {
    const r = parseReply({ answer: ' Tahini. ', options: [
      { title: 'Tahini', why: 'Même onctuosité', mise: [{ i: 0, text: 'Marinade: tahini 90 g' }, { i: 99, text: 'bad' }, { i: 1, text: ' ' }], steps: [{ i: 6, label: 'Serve', text: 'Add sesame.' }], rule: '' },
      { title: 'Rien', why: '', mise: [], steps: [], rule: '' },
      { title: 'B' }, { title: 'C', mise: [{ i: 0, text: 'x' }], steps: [], rule: '' }, { title: 'D', mise: [{ i: 0, text: 'y' }], steps: [], rule: '' },
    ] }, satay)
    expect(r.answer).toBe('Tahini.')
    expect(r.options.map((o) => o.title)).toEqual(['Tahini', 'C', 'D'])
    expect(r.options[0].patch).toEqual({ mise: [{ i: 0, text: 'Marinade: tahini 90 g' }], steps: [{ i: 6, label: 'Serve', text: 'Add sesame.' }] })
  })
  it('survives broken answers', () => {
    expect(parseReply(undefined, satay)).toEqual({ answer: '', options: [] })
    expect(readJson('```json\n{"answer":"ok","options":[]}\n```')).toEqual({ answer: 'ok', options: [] })
    expect(readJson('nope')).toBeUndefined()
  })
  it('adds a rule at the end of the rules, under one heading', () => {
    const once = addRule('RULES', 'Use ghee')
    expect(once).toBe('RULES\n\nADDED RULES\n- Use ghee')
    expect(addRule(once, '- No cilantro')).toBe('RULES\n\nADDED RULES\n- Use ghee\n- No cilantro')
  })
})

describe('ingredients on a line, for "Il me manque…"', () => {
  it('names each ingredient', () => {
    expect(ingredientsIn(satay.mise[0])).toEqual(['Onion', 'Garlic', 'Soy sauce', 'Neutral oil', 'Peanut butter', 'Brown sugar', 'Lemon juice', 'Cayenne', 'Cumin'])
    expect(ingredientsIn('Celery 100 g (1 cup): rinse, slice; green onions 50 g: slice')).toEqual(['Celery', 'Green onions'])
    expect(ingredientsIn('Kidney beans 2 cans: rinse')).toEqual(['Kidney beans'])
    expect(ingredientsIn('Chicken breast 600 g (1⅓ lb), thin-sliced cutlets (raw, last on board)')).toEqual(['Chicken breast'])
  })
})

describe('backup', () => {
  it('round-trips everything but the Gemini key', () => {
    settings.set({ ...settings.get(), rules: 'MY RULES', geminiKey: 'secret' })
    versions.set({ 27: { list: [{ at: 1, summary: 'x', mise: ['a'], steps: [] }], active: 0 } })
    const b = JSON.parse(JSON.stringify(makeBackup()))
    expect(JSON.stringify(b)).not.toContain('secret')
    settings.set({ ...settings.get(), rules: 'OTHER' }); versions.set({})
    const r = readBackup(b)
    expect(r.ok).toBe(true)
    if (r.ok) restoreBackup(r.data)
    expect(settings.get().rules).toBe('MY RULES')
    expect(settings.get().geminiKey).toBe('secret')
    expect(versions.get()['27'].list[0].summary).toBe('x')
  })
  it('refuses other files', () => {
    expect(readBackup({ app: 'wardrobe' }).ok).toBe(false)
    expect(readBackup({ app: 'chef-luc', format: 1, settings: { rules: 1 }, versions: {} }).ok).toBe(false)
  })
})

describe('Gemini calls', () => {
  const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text, thought: false }] } }] }))
  it('moves to the next model when one is busy', async () => {
    const used: string[] = []
    vi.stubGlobal('fetch', async (u: string) => {
      if (u.includes('/models?')) return new Response(JSON.stringify({ models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }))
      const m = u.match(/models\/([^:]+):/)![1]; used.push(m)
      return m === 'gemini-3.8-flash' ? new Response('{"error":{"message":"high demand"}}', { status: 503 }) : ok('{"answer":"oui","options":[]}')
    })
    const r = await withModels('k', undefined, (m) => generate('k', m, {}))
    expect(used).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash'])
    expect(r.model).toBe('gemini-3.6-flash')
  })
  it('tries every model, then once more after a pause, before giving up with a clear message', async () => {
    saved.delete('chef-luc:models')
    const used: string[] = []
    let calls = 0
    vi.stubGlobal('fetch', async (u: string) => {
      if (u.includes('/models?')) return new Response(JSON.stringify({ models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.9-flash-preview'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }))
      const m = u.match(/models\/([^:]+):/)![1]; used.push(m); calls++
      return new Response('{"error":{"message":"This model is currently experiencing high demand."}}', { status: 503 })
    })
    await expect(withModels('k', 'gemini-3.8-flash', (m) => generate('k', m, {}))).rejects.toThrow(/surchargé en ce moment \(5 modèles essayés\)/)
    expect(used).toEqual(['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.9-flash-preview', 'gemini-3.8-flash'])
  })
  it('starts with the model that answered last, and skips busy ones for a while', async () => {
    saved.delete('chef-luc:models')
    vi.stubGlobal('fetch', async (u: string) => {
      if (u.includes('/models?')) return new Response(JSON.stringify({ models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'].map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }))
      return u.includes('3.8') ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }))
    })
    expect((await withModels('k', 'gemini-3.8-flash', (m) => generate('k', m, {}))).model).toBe('gemini-3.5-flash-lite')
    expect(modelOrder('gemini-3.8-flash', ['gemini-3.8-flash', 'gemini-3.5-flash-lite'])).toEqual(['gemini-3.5-flash-lite', 'gemini-3.8-flash'])
  })
  it('stops at once on a refused key, with a French message', async () => {
    vi.stubGlobal('fetch', async (u: string) => u.includes('/models?') ? new Response('{}', { status: 400 }) : new Response('{"error":{"message":"API key not valid."}}', { status: 400 }))
    await expect(withModels('bad', 'gemini-3.8-flash', (m) => generate('bad', m, {}))).rejects.toThrow(/Clé Gemini refusée/)
  })
  it('turns a free-tier limit into a readable message', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":{"message":"quota"}}', { status: 429 }))
    await expect(generate('k', 'gemini-3.8-flash', {})).rejects.toBeInstanceOf(LucError)
    await expect(generate('k', 'gemini-3.8-flash', {})).rejects.toThrow(/Limite gratuite/)
  })
})
