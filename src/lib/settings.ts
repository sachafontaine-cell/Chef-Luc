// Everything the cook sets up once. Each thing has exactly one place: Réglages.
// Stored only on this phone (the Gemini key included); never in the public repository.
import { createStore } from './store'

export interface Member { id: string; name: string; adult: boolean; /** yyyy-mm-dd */ birth?: string }
export interface Settings {
  rules: string
  family: Member[]
  tools: string[]
  pantry: string[]
  stores: string[]
  geminiKey?: string
  geminiModel?: string
}

export const DEFAULT_RULES = `I am a master chef focused on maximum flavor with minimum active prep time and minimum cleanup.

CORE PHILOSOPHY
- Preserve 90%+ of the flavor and success of a recipe.
- Eliminate low-value steps.
- Reduce cleanup by overlapping, in logical order, the reuse of cutting boards, bowls, knives, etc., accounting for cross-contamination.
- Optimize workflow like a professional kitchen: prep overlaps with cook time and idle time (boiling, preheating, pressure build).
- Size each recipe for one family meal plus 2 small lunches the next day (about 75 g protein each). No more leftovers than that.
- We follow the FDA MyPlate balance: if a meal is not balanced, suggest a way to balance it (veggies, side salad, etc.).

MISE EN PLACE
- Cut vegetables → aromatics → cooked foods → proteins (raw last) to avoid cross-contamination.
- Avoid unnecessary bowls, plates and tools. One pan when possible.
- Ingredients in grams for the scale (less cleanup, more precision), or whole units like 1 onion.

WORKFLOW
- Prep during oven preheat. Chop while water boils.
- Use carryover heat intelligently. Rest meat properly.
- Avoid steps that add little payoff.

TOOLS
- Use a tool only if it improves flavor, texture or speed, or reduces effort. No gadget just for novelty.
- Rice: the Zojirushi rice cooker is my preferred method. Tell me how much water to add once rice is rinsed (I rinse in the cooker pot, so some water is left over).

TECHNIQUE (HIGH-ROI DEFAULTS)
- Measurements in grams, kitchen units (e.g. tsp) and whole units (e.g. 1 medium onion).
- Dry meat before searing. Bloom spices only if worthwhile. Velveting protein is worthwhile.
- Rest meat correctly. Use air fry or convection when it improves results or speed.

WRITING
- Extremely concise language, optimized for reading on a phone. Numbered lists.
- Start with the mise en place, including tools and washing ingredients, clockwise in order of use. Combine mise items when sensible. Prepped ingredients go on a plate or board in order of use.
- Steps in logical chronological order with the amounts inside the instructions; prep each ingredient at the most efficient moment.
- Precise temperatures and durations (no time ranges).`

export const DEFAULT_TOOLS = [
  'Kitchen scale',
  'Sous-vide wand',
  'Gas BBQ with motorized rotisserie',
  'Mobile pizza oven (on the grill or in the oven), removable ceramic stone',
  'Instant Pot IP-Duo80',
  'Zojirushi NP-HBC10 rice cooker',
  'Gas oven: air fry, convection bake, convection roast; large air-fryer basket',
  '12" non-stick skillets',
  '12" polished cast iron skillet',
  'Large flat-bottomed wok',
  'Large and small Dutch ovens',
  'Meater Duo thermometers',
]

export const DEFAULT_PANTRY = [
  'Salt', 'Black pepper', 'Olive oil', 'Neutral oil', 'Sugar', 'Brown sugar', 'Flour', 'Baking soda', 'Baking powder',
  'Dried spices', 'Frozen garlic', 'Frozen ginger', 'Soy sauce', 'Vinegar', 'Honey', 'Mustard', 'Ketchup', 'Mayonnaise', 'Vanilla',
]

export const DEFAULT_STORES = ['Aldi', 'Costco', 'Balboa/99Ranch/TJ']

export const defaultSettings = (): Settings => ({
  rules: DEFAULT_RULES,
  family: [
    { id: 'a1', name: 'Adulte 1', adult: true }, { id: 'a2', name: 'Adulte 2', adult: true },
    { id: 'k1', name: 'Enfant 1', adult: false }, { id: 'k2', name: 'Enfant 2', adult: false },
  ],
  tools: DEFAULT_TOOLS, pantry: DEFAULT_PANTRY, stores: DEFAULT_STORES,
})

export const settings = createStore<Settings>(defaultSettings(), 'settings')
// Fields added in later versions get their default.
settings.set({ ...defaultSettings(), ...settings.get() })

export function age(birth: string | undefined, today = new Date()): number | undefined {
  const m = birth?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  let a = today.getFullYear() - +m[1]
  if (today.getMonth() + 1 < +m[2] || (today.getMonth() + 1 === +m[2] && today.getDate() < +m[3])) a--
  return a >= 0 && a < 120 ? a : undefined
}

/** A child's plate as a share of an adult's, by age (roughly the USDA calorie needs). */
export function shareForAge(a: number): number {
  if (a < 4) return 0.5
  if (a < 9) return 0.65
  if (a < 14) return 0.8
  return 1
}

/** The family's average child plate. Next-day lunches count as one child plate each. */
export function kidShare(s: Settings = settings.get(), today = new Date()): number {
  const ages = s.family.filter((m) => !m.adult).map((m) => age(m.birth, today)).filter((a): a is number => a !== undefined)
  if (!ages.length) return 0.75
  return ages.reduce((t, a) => t + shareForAge(a), 0) / ages.length
}

export const familyCounts = (s: Settings = settings.get()) => ({
  adults: Math.max(1, s.family.filter((m) => m.adult).length),
  kids: s.family.filter((m) => !m.adult).length,
})

/** "2 adults; kids aged 10 and 8" for Luc. */
export function familyText(s: Settings = settings.get(), today = new Date()): string {
  const { adults, kids } = familyCounts(s)
  const ages = s.family.filter((m) => !m.adult).map((m) => age(m.birth, today))
  const known = ages.filter((a) => a !== undefined)
  const kidPart = !kids ? 'no kids' : known.length === kids ? `kids aged ${known.join(' and ')}` : `${kids} kid${kids > 1 ? 's' : ''}`
  return `${adults} adult${adults > 1 ? 's' : ''}; ${kidPart}`
}

/** Text areas hold one item per line. */
export const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)
