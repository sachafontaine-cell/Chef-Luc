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

// ---- Batch prep: one call per set of recipes (cached by the Courses tab).

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
