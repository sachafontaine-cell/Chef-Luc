// The recipe library: the card file exactly as exported to Drive, plus what the app derives
// from it once at startup (minutes, dishes to wash, search text). Replacing recipes.json with
// a newer card file is all it takes to update the library.
import raw from '../data/recipes.json'

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
  tools: string[]; mise: string[]; steps: Step[]; notes: string[]; image: string
  ingredient_groups: { label: string; items: string[] }[]
}

function derive(r: Raw): Recipe {
  // Household mixes have no "mise en place": their ingredients sit in a group of their own.
  const group = r.ingredient_groups.find((g) => !/^tools$/i.test(g.label))
  const mise = r.mise.length ? r.mise : group ? group.items : []
  const m = r.active.match(/^(\d+) min/)
  const d = dishes(r.tools)
  return {
    number: r.number, title: r.title, category: r.category, yield: r.yield, active: r.active, total: r.total, household: r.household,
    tools: r.tools.flatMap((t) => t.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean)),
    mise, miseLabel: group && !/^mise/i.test(group.label) ? group.label : 'Mise en place',
    steps: r.steps, notes: r.notes, image: r.image,
    activeMin: m ? +m[1] : null, wash: d.wash, washCount: d.count, group: groupOf(r.category),
    search: fold([r.title, String(r.number), ...mise].join(' ')),
  }
}

export const RECIPES: Recipe[] = (raw as Raw[]).map(derive).sort((a, b) => a.number - b.number)
const byNumber = new Map(RECIPES.map((r) => [r.number, r]))
export const recipe = (n: number) => byNumber.get(n)
export const pad = (n: number) => String(n).padStart(3, '0')
export const photo = (r: Recipe) => import.meta.env.BASE_URL + r.image

export type Sort = 'number' | 'active' | 'wash' | 'old'
export interface Query { q: string; groups: Group[]; prot: string[]; cui: string[]; style: string[]; kid: boolean; sort: Sort }
export const emptyQuery = (): Query => ({ q: '', groups: [], prot: [], cui: [], style: [], kid: false, sort: 'number' })

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
  const big = 1e9
  if (query.sort === 'active') out.sort((a, b) => (a.activeMin ?? big) - (b.activeMin ?? big) || a.number - b.number)
  else if (query.sort === 'wash') out.sort((a, b) => (a.washCount || big) - (b.washCount || big) || a.number - b.number)
  else if (query.sort === 'old') out.sort((a, b) => (facets[fold(a.title)]?.last || '').localeCompare(facets[fold(b.title)]?.last || '') || a.number - b.number)
  return out
}
