// Link to the Fontaine Control Center. Both apps live at the same web address, so the family
// key the Control Center saved on this phone is read here: nothing to type.
// From it: the dish tags of the Recettes sheet (filters, "not cooked lately"), the coming
// dinners, which dinners already went to Cozi, and sending to Cozi.
// Without the key, Chef Luc works the same, minus those.
import { createStore } from './store'
import { fold, type Facet, type Facets } from './recipes'

const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbyqk4Wwqj7C2pxTX6XD_UjwMJEgzaooRA6A-zTXOYjN92Lu7v6szQhilxJrP4fr2z6hEA/exec'
const STALE_MS = 6 * 3600000

function controlCenter(name: string): string {
  try { const v = localStorage.getItem('fcc-' + name); return v ? String(JSON.parse(v) || '') : '' } catch { return '' }
}
export const familyKey = () => controlCenter('key')
const api = () => controlCenter('api') || DEFAULT_API

export interface Dinner { date: string; cook: string; dish: string }
export interface Sent { date: string; dish: string; at: number; by: string }
export interface Family {
  at: number
  facets: Facets
  /** Today and the next 13 days (needs the script update v0.3.5; empty before). */
  upcoming: Dinner[]
  sent: Sent[]
  /** This week Monday → Sunday (works with every script version). */
  menu: Dinner[]
  /** The Control Center can add to Cozi. */
  cozi: boolean
  /** The script knows about Chef Luc (v0.3.5 or later). */
  linked: boolean
}
const EMPTY: Family = { at: 0, facets: {}, upcoming: [], sent: [], menu: [], cozi: false, linked: false }
export const family = createStore<Family>(EMPTY, 'family')
// Fields added later get a default.
family.set({ ...EMPTY, ...(family.get() as Partial<Family>) })

/** Turns the Control Center's dish list into filters keyed by folded title. */
export function toFacets(recipes: unknown): Facets {
  const out: Facets = {}
  if (!Array.isArray(recipes)) return out
  for (const r of recipes) {
    if (!r || typeof r !== 'object' || !r.t) continue
    const f: Facet = {}
    if (r.prot) f.prot = String(r.prot)
    if (r.cui) f.cui = String(r.cui)
    if (Array.isArray(r.style) && r.style.length) f.style = r.style.map(String)
    if (r.kid === true) f.kid = true
    if (r.last) f.last = String(r.last)
    out[fold(String(r.t))] = f
  }
  return out
}

const dinners = (v: unknown): Dinner[] => (Array.isArray(v) ? v : [])
  .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.date)))
  .map((d) => ({ date: String(d.date), cook: String(d.cook ?? ''), dish: String(d.dish ?? '') }))

/** What Chef Luc keeps from the Control Center's answer. */
export function fromState(j: any, now: number): Family {
  return {
    at: now,
    facets: toFacets(j?.recipes),
    upcoming: dinners(j?.upcoming),
    menu: dinners(j?.menu),
    sent: (Array.isArray(j?.sent) ? j.sent : []).filter((x: any) => x && x.date && x.dish).map((x: any) => ({ date: String(x.date), dish: String(x.dish), at: +x.at || 0, by: String(x.by ?? '') })),
    cozi: !!j?.cozi,
    linked: Array.isArray(j?.upcoming),
  }
}

let busy: Promise<void> | undefined
/** Fetches the family data when stale (or always, with force). */
export function refreshFamily(force = false, now = Date.now()): Promise<void> {
  const key = familyKey()
  if (!key || (!force && now - family.get().at < STALE_MS) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve()
  busy ??= (async () => {
    try {
      const j = await (await fetch(`${api()}?k=${encodeURIComponent(key)}`, { cache: 'no-store' })).json()
      if (j && !j.error) family.set(fromState(j, Date.now()))
    } catch { /* offline or the script is busy: keep what we had */ }
    busy = undefined
  })()
  return busy
}

/** One action on the family script (same format as the Control Center). */
export async function familyAction(body: Record<string, unknown>): Promise<any> {
  const key = familyKey()
  if (!key) throw new Error('Lien famille absent')
  let j: any
  try {
    // text/plain avoids a CORS preflight, which Apps Script does not answer.
    j = await (await fetch(api(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, k: key }) })).json()
  } catch { throw new Error('pas de connexion') }
  if (j?.error) throw new Error(String(j.error))
  return j
}

/** Was this dinner already sent to Cozi, from either app? */
export const sentFor = (f: Family, d: Pick<Dinner, 'date' | 'dish'>) => f.sent.find((s) => s.date === d.date && fold(s.dish) === fold(d.dish))

/** Coming dinners: the 14-day list when the script provides it, else what is left of this week. */
export function comingDinners(f: Family, today: string): Dinner[] {
  const list = f.upcoming.length ? f.upcoming : f.menu
  return list.filter((d) => d.date >= today)
}

const values = (facets: Facets, pick: (f: Facet) => string[]) => {
  const count = new Map<string, number>()
  Object.values(facets).forEach((f) => pick(f).forEach((v) => count.set(v, (count.get(v) || 0) + 1)))
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((x) => x[0])
}
// Same order as the Control Center's dish picker.
const PROTS = ['Poulet', 'Bœuf', 'Porc', 'Agneau', 'Dinde', 'Poisson', 'Sans viande', 'Autre']
export const proteins = (f: Facets) => {
  const found = values(f, (x) => (x.prot ? [x.prot] : []))
  return [...PROTS.filter((p) => found.includes(p)), ...found.filter((p) => !PROTS.includes(p))]
}
export const cuisines = (f: Facets) => values(f, (x) => (x.cui ? [x.cui] : []))
export const styles = (f: Facets) => values(f, (x) => x.style || [])
