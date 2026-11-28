// The recipe library: the card file exactly as kept in Drive ("Recipes AI-ready" folder), plus what
// the app derives from it (minutes, dishes to wash, search text).
// A copy is built in, so the app works offline from the first launch; when the family script has a
// newer chef_luc_recipes_vN.json, that one replaces it (and is kept on the phone).
import raw from '../data/recipes.json'
import { createStore } from './store'

/** The version of the built-in copy (src/data/recipes.json). */
export const BUNDLED_VERSION = 16

export interface Step { label: string; text: string }
export interface Recipe {
  number: number
  title: string
  category: string
  yield: string
  active: string
  total: string
  household: boolean
  tools: string[]
  /** Mise en place lines, in order of use. */
  mise: string[]
  miseLabel: string
  steps: Step[]
  notes: string[]
  image: string
  /** Last change saved from Chef Luc: date and name. */
  edited: string
  editNote: string
  /** Derived */
  activeMin: number | null
  wash: string[]
  washCount: number
  group: Group
  search: string
}

export type Group = 'main' | 'side' | 'soup' | 'dessert' | 'breakfast' | 'basics' | 'batch' | 'household'
export const GROUPS: [Group, string][] = [
  ['main', 'Plats'], ['side', 'Accompagnements'], ['soup', 'Soupes'], ['dessert', 'Desserts'],
  ['breakfast', 'Petit-déjeuner'], ['basics', 'Sauces et bases'], ['batch', 'En lot'], ['household', 'Maison'],
]
const groupOf = (c: string): Group =>
  /^main/i.test(c) ? 'main' : /^side/i.test(c) ? 'side' : /^soup/i.test(c) ? 'soup' : /^dessert/i.test(c) ? 'dessert'
  : /^breakfast/i.test(c) ? 'breakfast' : /^batch/i.test(c) ? 'batch' : /^household/i.test(c) ? 'household' : 'basics'

/** Same folding as the Control Center, so a dish name matches in both apps. */
export const fold = (t: string) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Things on the tools line that never go in the sink.
const NO_WASH = /^(meater|thermometer|instant thermometer|scale|foil|parchment|paper towels?|towels?|twine|microwave|oven|oven broiler|gas bbq|mobile pizza oven|wood chip pouch|plastic wrap|cheesecloth)\b|\b(zip|freezer|vacuum) bags?\b|^bag$/i

/** "2 small bowls, sheet pan + parchment, Meater" → ["2 small bowls", "sheet pan"], 3 things to wash. */
export function dishes(tools: string[]): { wash: string[]; count: number } {
  const wash: string[] = []
  let count = 0
  for (const line of tools) {
    for (const item of line.split(/,(?![^(]*\))/)) {
      for (const part of item.split(/\s\+\s/)) {
        const name = part.replace(/\s*\([^)]*\)/g, '').trim()
        // "blender or food processor": only one of them gets used.
        const first = name.split(/\s+or\s+/i)[0].trim()
        if (!first || NO_WASH.test(first)) continue
        const n = first.match(/^(\d+)\s(?!cm|ml|["″])(?:×\s)?/)
        count += n ? Math.min(+n[1], 9) : 1
        wash.push(first)
      }
    }
  }
  return { wash, count }
}

interface Raw {
  number: number; title: string; category: string; yield: string; active: string; total: string; household: boolean
  tools: string[]; mise: string[]; steps: Step[]; notes: string[]; image?: string
  /** Photo of a recipe added from the app (small JPEG). */
  image_data?: string
  edited?: string; edit_note?: string
  ingredient_groups: { label: string; items: string[] }[]
}

function derive(r: Raw): Recipe {
  // Household mixes have no "mise en place": their ingredients sit in a group of their own.
  const group = (r.ingredient_groups || []).find((g) => !/^tools$/i.test(g.label))
  const mise = r.mise?.length ? r.mise : group ? group.items : []
  const m = (r.active || '').match(/^(\d+) min/)
  const d = dishes(r.tools || [])
  return {
    number: r.number, title: r.title, category: r.category, yield: r.yield, active: r.active, total: r.total, household: r.household,
    tools: (r.tools || []).flatMap((t) => t.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean)),
    mise, miseLabel: group && !/^mise/i.test(group.label) ? group.label : 'Mise en place',
    steps: r.steps || [], notes: r.notes || [], image: r.image_data || (r.image ? import.meta.env.BASE_URL + r.image : ''),
    edited: r.edited || '', editNote: r.edit_note || '',
    activeMin: m ? +m[1] : null, wash: d.wash, washCount: d.count, group: groupOf(r.category),
    search: fold([r.title, String(r.number), ...mise].join(' ')),
  }
}

/** The current list. Replaced in place when a newer recipe file arrives, so every import sees it. */
export const RECIPES: Recipe[] = []
const byNumber = new Map<number, Recipe>()
/** Changes whenever the list is replaced (screens subscribe to it to redraw). */
export const library = createStore({ version: BUNDLED_VERSION })
/** The newest list read from Drive, kept on the phone for offline use. */
const saved = createStore<{ version: number; raw: unknown[] } | null>(null, 'library')

const usable = (r: any): r is Raw => !!r && Number.isInteger(r.number) && typeof r.title === 'string' && Array.isArray(r.steps)
export function setLibrary(list: unknown[], version: number) {
  const next = list.filter(usable).map(derive).sort((a, b) => a.number - b.number)
  if (!next.length) return
  RECIPES.splice(0, RECIPES.length, ...next)
  byNumber.clear()
  next.forEach((r) => byNumber.set(r.number, r))
  library.set({ version })
}
/** A newer recipe file from Drive: use it now and keep it for next time. */
export function useRemoteLibrary(list: unknown[], version: number) {
  if (version <= library.get().version || !Array.isArray(list)) return false
  setLibrary(list, version)
  saved.set({ version, raw: list })
  return true
}

setLibrary(raw as unknown[], BUNDLED_VERSION)
const kept = saved.get()
if (kept && kept.version > BUNDLED_VERSION && Array.isArray(kept.raw)) setLibrary(kept.raw, kept.version)

export const recipe = (n: number) => byNumber.get(n)
export const recipeByTitle = (title: string) => (title ? RECIPES.find((r) => fold(r.title) === fold(title)) : undefined)
export const pad = (n: number) => String(n).padStart(3, '0')
/** The recipe's photo, or '' when it has none (the tile then stays plain). */
export const photo = (r: Recipe) => r.image

export type Sort = 'number' | 'active' | 'wash' | 'old'
export interface Query { q: string; groups: Group[]; prot: string[]; cui: string[]; style: string[]; kid: boolean; sort: Sort }
/** Default: what hasn't been cooked for the longest time (falls back to card order without the family link). */
export const emptyQuery = (): Query => ({ q: '', groups: [], prot: [], cui: [], style: [], kid: false, sort: 'old' })
/** The sort actually used: "not cooked lately" needs the Control Center's history. */
export const effectiveSort = (q: Query, facets: Facets): Sort => (q.sort === 'old' && !Object.keys(facets).length ? 'number' : q.sort)

/** What the family's Recettes sheet says about a dish (filled in by the Control Center link). */
export interface Facet { prot?: string; cui?: string; style?: string[]; kid?: boolean; last?: string }
export type Facets = Record<string, Facet>

export function search(list: Recipe[], query: Query, facets: Facets = {}): Recipe[] {
  const words = fold(query.q).split(' ').filter(Boolean)
  const any = (want: string[], have: string[]) => !want.length || have.some((v) => want.includes(v))
  const out = list.filter((r) => {
    const f = facets[fold(r.title)] || {}
    return words.every((w) => r.search.includes(w))
      && (!query.groups.length || query.groups.includes(r.group))
      && any(query.prot, f.prot ? [f.prot] : []) && any(query.cui, f.cui ? [f.cui] : []) && any(query.style, f.style || [])
      && (!query.kid || !!f.kid)
  })
  const big = 1e9, sort = effectiveSort(query, facets)
  if (sort === 'active') out.sort((a, b) => (a.activeMin ?? big) - (b.activeMin ?? big) || a.number - b.number)
  else if (sort === 'wash') out.sort((a, b) => (a.washCount || big) - (b.washCount || big) || a.number - b.number)
  else if (sort === 'old') {
    // Dishes on the family list first: never cooked, then the longest ago. Everything else after, in card order.
    const rank = (r: Recipe) => { const f = facets[fold(r.title)]; return f ? (f.last ? '1' + f.last : '0') : '2' }
    out.sort((a, b) => rank(a).localeCompare(rank(b)) || a.number - b.number)
  }
  return out
}
