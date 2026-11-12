// Link to the Fontaine Control Center. Both apps live at the same web address, so the family
// key the Control Center saved on this phone can be read here: nothing to type.
// Step 1 only borrows what the family's Recettes sheet says about each dish (protein, cuisine,
// style, kid-friendly, last cooked) for the recipe filters. Without the key the app works the
// same, just without those filters.
import { createStore } from './store'
import { fold, type Facet, type Facets } from './recipes'

const DEFAULT_API = 'https://script.google.com/macros/s/AKfycbyqk4Wwqj7C2pxTX6XD_UjwMJEgzaooRA6A-zTXOYjN92Lu7v6szQhilxJrP4fr2z6hEA/exec'
const STALE_MS = 6 * 3600000

function controlCenter(name: string): string {
  try { const v = localStorage.getItem('fcc-' + name); return v ? String(JSON.parse(v) || '') : '' } catch { return '' }
}
export const familyKey = () => controlCenter('key')

interface Saved { at: number; facets: Facets }
export const family = createStore<Saved>({ at: 0, facets: {} }, 'family')

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

let busy = false
export async function refreshFamily(now = Date.now()) {
  const key = familyKey()
  if (!key || busy || now - family.get().at < STALE_MS || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
  busy = true
  try {
    const api = controlCenter('api') || DEFAULT_API
    const j = await (await fetch(`${api}?k=${encodeURIComponent(key)}`, { cache: 'no-store' })).json()
    if (j && !j.error && Array.isArray(j.recipes)) family.set({ at: now, facets: toFacets(j.recipes) })
  } catch { /* offline or the script is busy: keep what we had */ }
  busy = false
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
