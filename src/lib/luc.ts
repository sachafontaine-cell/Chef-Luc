// What Chef Luc is sent, and how his answers are read. Every call carries the cook's rules,
// tools and family, the recipe as cooked right now, the current step, and the question.
import type { Recipe } from './recipes'
import { familyText, type Settings } from './settings'
import type { LineEdit, Patch } from './versions'

export interface Option { title: string; why: string; patch: Patch; rule: string }
export interface Reply { answer: string; options: Option[] }

export interface Context {
  /** The recipe as cooked right now (version and tonight's changes applied), card amounts. */
  recipe: Recipe
  done: number[]
  current: number
  /** Multiplier the app applies on screen, and the people it is for. */
  factor: number
  portions: string
}
export interface Turn { q: string; a: string }

const EDIT = { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, label: { type: 'STRING' }, text: { type: 'STRING' } }, required: ['i', 'text'] }
export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    options: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      title: { type: 'STRING' }, why: { type: 'STRING' },
      mise: { type: 'ARRAY', items: EDIT }, steps: { type: 'ARRAY', items: EDIT }, rule: { type: 'STRING' },
    }, required: ['title', 'why', 'mise', 'steps', 'rule'] } },
  },
  required: ['answer', 'options'],
}

export function systemText(s: Settings): string {
  return `You are Chef Luc, the cook's assistant in the kitchen while they cook. Follow THE COOK'S RULES below.

HOW TO ANSWER
- Write "answer" in French, very short: the cook reads it on a phone with wet hands. At most 5 short lines, or a short numbered list. No preamble.
- Recipe text you write (mise en place lines and steps) stays in English, in the card's concise style and units (grams first, then kitchen or whole units).
- Amounts in recipe text are for the card's yield. The app scales them on screen; never rescale them yourself.
- Put any change to the recipe in "options". Each option lists only the lines that change, by their number as shown (starting at 0). To add a line, use the next number after the last one. Never renumber, never delete: rewrite a line instead. Keep step labels short.
- No change needed: "options" is empty.
- "rule": one short English sentence for the cook's general rules, only when the change reflects a lasting preference that applies to every recipe. Otherwise "".

THE COOK'S RULES
${s.rules.trim()}

KITCHEN TOOLS
${s.tools.map((t) => '- ' + t).join('\n')}

PANTRY STAPLES (always at home)
${s.pantry.join(', ')}

FAMILY
${familyText(s)}`
}

export function recipeText(c: Context): string {
  const r = c.recipe
  const step = c.current >= 0 ? `${c.current} (${r.steps[c.current]?.label})` : 'all done'
  return [
    `RECIPE ${String(r.number).padStart(3, '0')} ${r.title} — card yield: ${r.yield}`,
    `Cooking tonight for: ${c.portions} (the app shows amounts ×${parseFloat(c.factor.toFixed(2))})`,
    `TOOLS: ${r.tools.join(', ')}`,
    'MISE EN PLACE (number: line)',
    ...r.mise.map((m, i) => `${i}: ${m}`),
    'STEPS (number: label — text)',
    ...r.steps.map((st, i) => `${i}: ${st.label} — ${st.text}${c.done.includes(i) ? '  [done]' : ''}`),
    `CURRENT STEP: ${step}`,
    ...(r.notes.length ? ['NOTES: ' + r.notes.join(' ')] : []),
  ].join('\n')
}

export function askBody(s: Settings, c: Context, question: string, previous?: Turn): Record<string, unknown> {
  const contents = []
  if (previous) contents.push({ role: 'user', parts: [{ text: previous.q }] }, { role: 'model', parts: [{ text: previous.a }] })
  contents.push({ role: 'user', parts: [{ text: `${recipeText(c)}\n\nQUESTION: ${question.trim()}` }] })
  return {
    systemInstruction: { parts: [{ text: systemText(s) }] },
    contents,
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.3, maxOutputTokens: 3000 },
  }
}

export const swapQuestion = (ingredient: string, line: number) =>
  `I don't have: ${ingredient} (mise en place line ${line}). Give 1 to 3 substitutes, best first, using what is on the card, the pantry staples or my tools. Each option: the new amounts (rewrite the mise line) and any step that must change. In "answer", one short line per option.`

/** Keeps only what the app can use: valid line numbers, text present, at most 3 options. */
export function parseReply(raw: unknown, r: Pick<Recipe, 'mise' | 'steps'>): Reply {
  const j = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const edits = (list: unknown, max: number): LineEdit[] =>
    (Array.isArray(list) ? list : [])
      .filter((e) => e && Number.isInteger(e.i) && e.i >= 0 && e.i <= max && typeof e.text === 'string' && e.text.trim())
      .map((e) => ({ i: e.i, text: String(e.text).trim(), ...(typeof e.label === 'string' && e.label.trim() ? { label: e.label.trim() } : {}) }))
  const options: Option[] = (Array.isArray(j.options) ? j.options : []).map((o: any) => ({
    title: String(o?.title ?? '').trim() || 'Modification',
    why: String(o?.why ?? '').trim(),
    patch: { mise: edits(o?.mise, r.mise.length), steps: edits(o?.steps, r.steps.length) },
    rule: String(o?.rule ?? '').trim(),
  })).filter((o: Option) => o.patch.mise!.length || o.patch.steps!.length || o.rule).slice(0, 3)
  return { answer: String(j.answer ?? '').trim(), options }
}

export function readJson(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return undefined }
}

// ---- Batch prep: one call per set of recipes (cached by the Épicerie tab).

export const PREP_SCHEMA = { type: 'OBJECT', properties: { tips: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['tips'] }

export function prepBody(s: Settings, recipes: Recipe[], sharedText: string): Record<string, unknown> {
  const list = recipes.map((r) => [`RECIPE ${String(r.number).padStart(3, '0')} ${r.title}`, ...r.mise.map((m) => '- ' + m)].join('\n')).join('\n\n')
  return {
    systemInstruction: { parts: [{ text: `${systemText(s)}

TASK
The cook is shopping for these recipes this week. Suggest batch prep that saves time and dishes across the week: what to prep once for several recipes (chop onions once for 3 meals, rice once for 2, a marinade made ahead), when to do it, and how to store it so it stays good. Also say how to use up a whole bunch or pack shared by several recipes.
"tips": 3 to 6 short tips in French, most useful first, each naming the recipes by number (e.g. 083, 159). No generic advice.` }] },
    contents: [{ role: 'user', parts: [{ text: `${list}\n\nINGREDIENTS IN SEVERAL RECIPES: ${sharedText || 'none'}` }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: PREP_SCHEMA, temperature: 0.3, maxOutputTokens: 1500 },
  }
}

export function parsePrep(raw: unknown): string[] {
  const t = (raw as { tips?: unknown })?.tips
  return (Array.isArray(t) ? t : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
}

// ---- New recipe: Luc turns pasted text or photos into a Chef Luc card (one call, plus one per correction).

export const CATEGORIES = ['Main', 'Main (vegetarian)', 'Side', 'Soup', 'Dessert', 'Breakfast', 'Sauce', 'Dip', 'Batch', 'Basic'] as const
// The Control Center's own lists (its Recettes sheet), so a new main dish can be voted for and filtered.
export const PROTEINS = ['Poulet', 'Bœuf', 'Porc', 'Agneau', 'Dinde', 'Poisson', 'Sans viande', 'Autre'] as const
export const CUISINES = ['Libanais', 'Méditerranéen', 'Français', 'Italien', 'Américain', 'Mexicain', 'Latino', 'Asiatique', 'Indien'] as const
export const STYLES = ['Rapide', 'Instant Pot', 'Grill', 'Four', 'Mijoté', 'Soupe', 'Salade', 'Sandwich', 'Pâtes', 'Riz', 'Nouilles'] as const
export interface Card {
  title: string; category: string; yield: string; active: string; total: string
  tools: string[]; mise: string[]; steps: { label: string; text: string }[]; notes: string[]
  /** For the cook, in French: what Luc changed or had to guess. */
  remarks: string
  /** For the Control Center's Recettes sheet. */
  protein: string; cuisine: string; styles: string[]; kid: boolean
}

const LIST = { type: 'ARRAY', items: { type: 'STRING' } }
export const CARD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' }, category: { type: 'STRING', enum: [...CATEGORIES] }, yield: { type: 'STRING' }, active: { type: 'STRING' }, total: { type: 'STRING' },
    tools: LIST, mise: LIST, steps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, text: { type: 'STRING' } }, required: ['label', 'text'] } },
    notes: LIST, remarks: { type: 'STRING' },
    protein: { type: 'STRING', enum: [...PROTEINS] }, cuisine: { type: 'STRING', enum: [...CUISINES] },
    styles: { type: 'ARRAY', items: { type: 'STRING', enum: [...STYLES] } }, kid: { type: 'BOOLEAN' },
  },
  required: ['title', 'category', 'yield', 'active', 'total', 'tools', 'mise', 'steps', 'notes', 'remarks', 'protein', 'cuisine', 'styles', 'kid'],
}

/** The card a new recipe should look like (recipe 169, as kept in the recipe file). */
const EXAMPLE: Omit<Card, 'remarks' | 'protein' | 'cuisine' | 'styles' | 'kid'> = {
  title: 'Marry Me Chicken', category: 'Main', yield: 'Dinner 4 + 2 small lunches', active: '20 min Active', total: '50 min Total (rice)',
  tools: ['Zojirushi rice cooker', '12" cast iron skillet', 'tongs', 'microplane', 'small bowl', 'garlic press', 'Meater'],
  mise: [
    'Thai jasmine white rice 300 g (2 rice cups)',
    'Frozen garlic 4 cloves: set out to thaw',
    'Boneless skinless chicken thighs 750 g (1⅔ lb, about 7): pat dry, season on the tray: salt 5 g (¾ tsp), smoked paprika 2 g (1 tsp), Italian seasoning 2 g (1 tsp), pepper 1 g (½ tsp)',
    'Julienned sun-dried tomatoes 70 g (½ cup, packed in oil): drain, keep 15 g (1 tbsp) of the oil',
    'Parmigiano-Reggiano wedge 50 g (½ cup grated); keep the rind',
    'Chicken broth 180 ml (¾ cup); heavy cream 180 ml (¾ cup); red pepper flakes 0.5 g (¼ tsp)',
    'Baby spinach 140 g (5 oz)',
  ],
  steps: [
    { label: 'Rice', text: 'Rinse 300 g rice in the cooker pot, drain, water to line 2 (White). Start. Set the garlic out.' },
    { label: 'Sear', text: 'Cast iron medium-high 3 min. Tomato oil, thighs smooth side down; leave 5 min (grate the parmesan). Flip, 4 min. Meater in; thighs to a plate.' },
    { label: 'Sauce', text: 'Medium. Press in garlic; sun-dried tomatoes 1 min. Broth; scrape 30 sec. Cream, flakes, parmesan rind; simmer 3 min.' },
    { label: 'Finish', text: 'Chicken + juices back. Simmer uncovered 6 min, spooning sauce, to 175°F (79°C).' },
    { label: 'Greens', text: 'Off heat: rind out; parmesan, then spinach 1 min.' },
    { label: 'Serve', text: 'Lunches: 75 g chicken (1 thigh) + sauce over rice, x2. MyPlate: balanced.' },
  ],
  notes: ['Rind = extra umami; thighs stay juicy; no board.'],
}

export function cardBody(s: Settings, source: { text: string; images: { mime: string; data: string }[] }, previous?: Card, fix?: string): Record<string, unknown> {
  const task = `${systemText(s)}

TASK: NEW RECIPE CARD
The cook gives you a recipe (pasted text and/or photos of a page or screen). Rewrite it as a Chef Luc card following THE COOK'S RULES, in English, in exactly the style of the EXAMPLE.
- title: the dish's usual English name.
- category: one of ${CATEGORIES.join(', ')}.
- yield: "Dinner 4 + 2 small lunches" for a family dinner, sized for the FAMILY plus 2 small next-day lunches (about 75 g protein each); otherwise "Serves …" or "Makes …".
- active: "N min Active". total: "N min Total" or "N hr N min Total", with the reason in brackets when long, e.g. "(marinade)".
- tools: short items, only from KITCHEN TOOLS or basic gear (board, knife, bowls). Fewest dishes possible.
- mise: in order of use (clockwise on the board), washing included; each line "Ingredient grams g (kitchen or whole units): prep". Group a spice mix or a sauce on one line.
- steps: short label + text, amounts and precise times and temperatures inside (no time ranges), prep at the most efficient moment.
- notes: 0 to 2 short lines (why it works, a swap, MyPlate balance).
- If the source is incomplete, fill in sensibly and say so in "remarks".
- remarks: one or two short sentences in French for the cook: what you changed, scaled or guessed.
- protein, cuisine, styles (1 to 3), kid (easy for children aged 8 to 10): tags for the family menu, from the allowed values only.

EXAMPLE
${JSON.stringify(EXAMPLE)}`
  const parts: Record<string, unknown>[] = []
  if (source.text.trim()) parts.push({ text: `RECIPE FROM THE COOK:\n${source.text.trim().slice(0, 12000)}` })
  for (const im of source.images.slice(0, 4)) parts.push({ inline_data: { mime_type: im.mime, data: im.data } })
  if (previous) parts.push({ text: `YOUR PREVIOUS CARD:\n${JSON.stringify({ ...previous, remarks: undefined })}\n\nCORRECTION FROM THE COOK (apply it, keep everything else): ${fix?.trim() || 'Improve it.'}` })
  return {
    systemInstruction: { parts: [{ text: task }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: CARD_SCHEMA, temperature: 0.3, maxOutputTokens: 6000 },
  }
}

/** Keeps a usable card, or nothing. */
export function parseCard(raw: unknown): Card | undefined {
  const j = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const str = (v: unknown, max = 600) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const list = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => str(x)).filter(Boolean)
  const steps = (Array.isArray(j.steps) ? j.steps : []).map((x: any) => ({ label: str(x?.label, 40) || 'Step', text: str(x?.text, 900) })).filter((x: { text: string }) => x.text)
  const title = str(j.title, 120)
  if (!title || !steps.length) return undefined
  const category = (CATEGORIES as readonly string[]).includes(j.category) ? j.category : 'Main'
  const pick = <T extends string>(v: unknown, from: readonly T[], or: T) => ((from as readonly string[]).includes(v as string) ? (v as T) : or)
  return {
    title, category, yield: str(j.yield, 80) || 'Dinner 4 + 2 small lunches', active: str(j.active, 40), total: str(j.total, 60), tools: list(j.tools), mise: list(j.mise), steps, notes: list(j.notes), remarks: str(j.remarks, 400),
    protein: pick(j.protein, PROTEINS, 'Autre'), cuisine: pick(j.cuisine, CUISINES, 'Américain'),
    styles: [...new Set(list(j.styles).filter((x) => (STYLES as readonly string[]).includes(x)))].slice(0, 3), kid: j.kid === true,
  }
}
