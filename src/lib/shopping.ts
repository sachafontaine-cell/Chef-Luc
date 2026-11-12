// The merged shopping list: every ingredient of the chosen dinners, scaled to the portions,
// duplicates combined (units converted), pantry staples left out, grouped by store.
// Plain math, no AI.
import { parseNum } from './amounts'
import { piecesIn } from './ingredients'
import type { Recipe } from './recipes'

export type Unit = 'g' | 'ml' | 'each' | string
export interface Amount { qty: number; unit: Unit }
export interface Item {
  key: string
  name: string
  amounts: Amount[]
  /** Amounts that could not be read, kept as written. */
  notes: string[]
  store: string
  /** Recipe numbers it comes from. */
  from: number[]
}
export interface ShopList { items: Item[]; pantry: Item[] }

const TO_G: Record<string, number> = { g: 1, kg: 1000, lb: 454, lbs: 454, oz: 28 }
const TO_ML: Record<string, number> = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240, cups: 240 }
const EACH = /^(?:small|medium|large|whole|x)?$/i

/** "1¾ lb" → 794 g; "2 cans" → 2 can; "3" → 3 each. Unknown text → undefined. */
export function readAmount(text: string): Amount | undefined {
  const m = text.trim().match(/^(?:~|about\s)?([\d½⅓⅔¼¾⅛⅜⅝⅞.]+)(?:\s*[–-]\s*[\d½⅓⅔¼¾.]+)?\s*([a-z]*)/i)
  if (!m) return undefined
  const qty = parseNum(m[1].replace(/^(\d+)\s+/, '$1'))
  if (!qty) return undefined
  const u = m[2].toLowerCase()
  if (u in TO_G) return { qty: qty * TO_G[u], unit: 'g' }
  if (u in TO_ML) return { qty: qty * TO_ML[u], unit: 'ml' }
  if (EACH.test(u)) return { qty, unit: 'each' }
  return { qty, unit: u.replace(/(ch|sh)es$/, '$1').replace(/s$/, '') }
}

const round = (v: number, step: number) => Math.max(step, Math.round(v / step) * step)
const trim = (v: number) => String(parseFloat(v.toFixed(1))).replace('.', ',')

export function showAmount(a: Amount): string {
  if (a.unit === 'g') return a.qty >= 1000 ? `${trim(round(a.qty, 100) / 1000)} kg` : `${round(a.qty, a.qty < 50 ? 1 : 5)} g`
  if (a.unit === 'ml') return a.qty >= 1000 ? `${trim(round(a.qty, 100) / 1000)} L` : `${round(a.qty, a.qty < 50 ? 1 : 5)} ml`
  const n = a.qty < 1 ? 1 : Math.ceil(a.qty - 0.15)
  if (a.unit === 'each') return String(n)
  return `${n} ${a.unit}${n > 1 ? (/(ch|sh)$/.test(a.unit) ? 'es' : 's') : ''}`
}
export const showItem = (it: Item) => [it.name, [...it.amounts.map(showAmount), ...it.notes].join(' + ')].filter(Boolean).join(' ')

const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const DROP = /^(?:fresh|large|small|medium|boneless|skinless|whole|ripe|cold|warm|hot|chopped|optional)$/
/** Same ingredient, however it is written: "Onions", "onion", "medium onion" → "onion". */
export function itemKey(name: string): string {
  return fold(name).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !DROP.test(w))
    .map((w) => (w.length > 3 ? w.replace(/oes$/, 'o').replace(/ies$/, 'y').replace(/(?<![su])s$/, '') : w)).join(' ')
}

const SPICES = /\b(?:cumin|paprika|oregano|cinnamon|chili powder|chile powder|cayenne|turmeric|coriander|thyme|bay lea|nutmeg|clove powder|allspice|garlic powder|onion powder|curry powder|pepper flakes|chili flakes|red pepper flakes|italian seasoning|herbes de provence|dried \w+|ground \w+|black pepper|white pepper|peppercorns|sumac|za.?atar|seven spice|7.spice|baharat|cardamom|fennel seed|mustard seed|sesame seed)\b/
/** Is this ingredient one of the pantry staples ("Frozen garlic" covers garlic, "Dried spices" covers cumin…)? */
export function inPantry(key: string, pantry: string[]): boolean {
  return pantry.some((p) => {
    const k = itemKey(p.replace(/^(?:frozen|dried)\s+/i, ''))
    if (/^spice/.test(k)) return SPICES.test(key)
    // "Black pepper" also covers a plain "pepper"; "Olive oil" a plain "oil".
    if (k.includes(' ') && key === k.split(' ').pop()) return true
    return !!k && new RegExp(`(?:^| )${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`).test(key)
  })
}

// Same list as the Control Center's "Auto": specialty items go to the specialty store.
const SPECIALTY = /tahin|labneh|laban|sumac|za.?atar|freekeh|frik|mloukh|molokh|pomegranate molasses|halloumi|akkawi|bulgur|orange blossom|rose water|lavash|kaak|knafeh|kataifi|mahlab|nigella|aleppo|baharat|7.spice|seven spice|moughrab|soujouk|sujuk|basterma|mastic|sahlab|ghee|paneer|garam masala|curry leaves|fish sauce|gochujang|lemongrass|galangal|kaffir|sa cha|doubanjiang|shaoxing|kecap|tamarind|miso|mirin|rice paper|nori|bok choy|thai basil/i

export function defaultStore(name: string, stores: string[]): string {
  if (!stores.length) return ''
  if (SPECIALTY.test(name)) return stores.find((s) => /balboa|99|ranch|tj|asian|international|special/i.test(s)) ?? stores[stores.length - 1]
  return stores[0]
}

export interface Planned { recipe: Recipe; factor: number }

export function buildList(planned: Planned[], pantry: string[], stores: string[], storeFor: Record<string, string> = {}): ShopList {
  const byKey = new Map<string, Item>()
  for (const { recipe, factor } of planned) {
    for (const line of recipe.mise) {
      for (const p of piecesIn(line)) {
        const key = itemKey(p.name)
        if (!key) continue
        let it = byKey.get(key)
        if (!it) {
          const saved = storeFor[key]
          it = { key, name: p.name, amounts: [], notes: [], store: saved && stores.includes(saved) ? saved : defaultStore(p.name, stores), from: [] }
          byKey.set(key, it)
        }
        if (!it.from.includes(recipe.number)) it.from.push(recipe.number)
        const a = p.amount ? readAmount(p.amount) : undefined
        if (a) {
          const same = it.amounts.find((x) => x.unit === a.unit)
          if (same) same.qty += a.qty * factor; else it.amounts.push({ qty: a.qty * factor, unit: a.unit })
        } else if (p.amount && !it.notes.includes(p.amount)) it.notes.push(p.amount)
      }
    }
  }
  const all = [...byKey.values()]
  const order = (it: Item) => { const i = stores.indexOf(it.store); return i < 0 ? stores.length : i }
  const items = all.filter((it) => !inPantry(it.key, pantry)).sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
  const kept = all.filter((it) => inPantry(it.key, pantry)).sort((a, b) => a.name.localeCompare(b.name))
  return { items, pantry: kept }
}

/** Ingredients that appear in two or more of the chosen recipes (buy once, use up the bunch). */
export const shared = (list: ShopList) => [...list.items, ...list.pantry].filter((it) => it.from.length > 1)

/** One item per line, grouped by store, for pasting into Cozi or a message. */
export function listText(items: Item[], stores: string[]): string {
  const groups = stores.map((s) => ({ s, list: items.filter((it) => it.store === s) })).filter((g) => g.list.length)
  const other = items.filter((it) => !stores.includes(it.store))
  if (other.length) groups.push({ s: 'Autre', list: other })
  return groups.map((g) => `${g.s.toUpperCase()}\n${g.list.map(showItem).join('\n')}`).join('\n\n')
}
