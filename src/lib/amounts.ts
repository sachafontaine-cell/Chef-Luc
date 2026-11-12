// Rescales the amounts written inside recipe text ("Chicken thighs 800 g (1¾ lb)") by plain
// math. Times, temperatures, sizes and recipe numbers are left alone. No AI involved.

const FRACS: [string, number][] = [['⅛', 1 / 8], ['¼', 1 / 4], ['⅓', 1 / 3], ['⅜', 3 / 8], ['½', 1 / 2], ['⅝', 5 / 8], ['⅔', 2 / 3], ['¾', 3 / 4], ['⅞', 7 / 8]]
const F = FRACS.map((f) => f[0]).join('')
export const NUM = `(?:\\d+(?:\\.\\d+)?[${F}]?|[${F}])`

export function parseNum(s: string): number {
  let v = 0
  const m = s.match(/^\d+(?:\.\d+)?/)
  if (m) v = parseFloat(m[0])
  const last = s[s.length - 1]
  const f = FRACS.find((x) => x[0] === last)
  return f ? v + f[1] : v
}

type Unit = 'mass' | 'big' | 'spoon' | 'oz' | 'count'

const trim = (v: number, d: number) => String(parseFloat(v.toFixed(d)))
const step = (v: number, s: number) => Math.max(s, Math.round(v / s) * s)

/** A mixed number with a kitchen fraction: 1.4 → "1½", 0.3 → "⅓". */
export function fraction(v: number, eighths = false): string {
  const whole = Math.floor(v + 1e-9), rest = v - whole
  const options: [string, number][] = [['', 0], ...FRACS.filter((f) => eighths || ![1 / 8, 3 / 8, 5 / 8, 7 / 8].includes(f[1])), ['', 1]]
  let best = options[0]
  for (const o of options) if (Math.abs(o[1] - rest) < Math.abs(best[1] - rest)) best = o
  if (best[1] === 1) return String(whole + 1)
  if (whole === 0 && best[1] === 0) return eighths ? '⅛' : '¼'
  return (whole ? String(whole) : '') + best[0]
}

export function format(v: number, unit: Unit): string {
  if (unit === 'mass') {
    if (v < 1) return trim(Math.max(0.1, v), 1)
    if (v < 10) return trim(step(v, 0.5), 1)
    if (v < 50) return String(step(v, 1))
    if (v < 250) return String(step(v, 5))
    if (v < 1000) return String(step(v, 10))
    return String(step(v, 50))
  }
  if (unit === 'big') return trim(step(v, 0.05), 2)
  if (unit === 'spoon') return fraction(v, v < 0.2)
  if (unit === 'oz') return v < 4 ? fraction(step(v, 0.5)) : String(Math.round(v))
  if (v < 1) return fraction(step(v, 0.25))
  if (v < 6) return fraction(step(v, 0.5))
  return String(Math.round(v))
}

// What follows a number decides whether it is an amount, and how to round it.
const NEVER = /^\s?(?:cm|mm|min|mins|minutes?|sec|secs|seconds?|hr|hrs|hours?|h|days?|weeks?|months?|times|x|inch|in|qt|quart|st|nd|rd|th)\b|^\s?[°%"″×-]|^\s?\/\s?\d/i
const UNITS: [RegExp, Unit][] = [
  [/^\s?(?:g|ml)\b/i, 'mass'],
  [/^\s?(?:kg|l|litres?|liters?)\b/i, 'big'],
  [/^\s?(?:tsp|tbsp|cups?|rice cups?|lbs?|pinch(?:es)?)\b/i, 'spoon'],
  [/^\s?oz\b/i, 'oz'],
]
// In a step, a bare count is only rescaled when it clearly counts food.
const FOOD = /^\s?(?:(?:small|medium|large|whole|big)\s)?(?:cloves?|cans?|eggs?|yolks?|whites?|onions?|shallots?|carrots?|potato(?:es)?|tomato(?:es)?|lemons?|limes?|oranges?|peppers?|zucchini|avocados?|apples?|bananas?|tortillas?|pitas?|buns?|slices?|sprigs?|leaves|bay|bunch(?:es)?|stalks?|ribs?|fillets?|breasts?|thighs?|drumsticks?|packs?|packages?|bags?|sheets?|sticks?|pieces?|heads?|ears?|strips?|links?|sausages?|patties|balls?|skewers?)\b/i
const SIZE = /^\s?(?:small|medium|large)\b/i

const NUM_RE = new RegExp(`(?<![\\w.,/×-])(${NUM})(?![\\d/.])`, 'g')

export type Mode = 'ingredient' | 'step'

/**
 * Multiplies the amounts in one line of recipe text.
 * 'ingredient' lines rescale every amount; 'step' lines only those with a unit or a food word.
 */
export function scaleText(text: string, factor: number, mode: Mode): string {
  if (!text || Math.abs(factor - 1) < 0.005) return text
  return text.replace(NUM_RE, (raw: string, _n: string, at: number) => {
    const after = text.slice(at + raw.length), before = text.slice(0, at)
    if (NEVER.test(after)) return raw
    // "(032)" points at another recipe.
    if (/\($/.test(before) && /^\d{3}$/.test(raw) && after[0] === ')') return raw
    const v = parseNum(raw)
    if (!v) return raw
    const unit = UNITS.find((u) => u[0].test(after))
    if (unit) return format(v * factor, unit[1])
    // The rice cooker's water line follows the rice.
    if (/\bline $/i.test(before)) return format(v * factor, 'spoon')
    if (mode === 'step' && !FOOD.test(after) && !SIZE.test(after)) return raw
    return format(v * factor, 'count')
  })
}
