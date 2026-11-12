import { useEffect, useRef, useState } from 'preact/hooks'
import { Chips, Icon, Sheet } from '../ui'
import { createStore } from '../lib/store'
import { effectiveSort, emptyQuery, GROUPS, pad, photo, RECIPES, search, type Group, type Query, type Recipe, type Sort } from '../lib/recipes'
import { cuisines, family, proteins, styles } from '../lib/family'
import { go } from '../lib/engine'
import { comingDinners } from '../lib/family'
import { session, startCooking } from '../lib/session'
import { current } from '../lib/versions'
import { recipeForDish, ymdLocal } from './shop'

/** Tonight's dinner from the family menu, one tap from cooking. */
function Tonight() {
  const fam = family.use(), s = session.use()
  const d = comingDinners(fam, ymdLocal()).find((x) => x.date === ymdLocal() && x.dish)
  if (!d) return null
  const r = recipeForDish(d.dish)
  const cooking = !!r && s?.recipe === r.number
  return (
    <div class="card tonight">
      {r && <span class="pic rthumb"><img src={photo(r)} alt="" width="96" height="72" /></span>}
      <button class="grow press left" onClick={() => r && go(`#/r/${r.number}`)} disabled={!r}>
        <span class="mday">Ce soir · {d.cook}</span><span class="mdish">{d.dish}</span>
      </button>
      {r && <button class="btn btn-primary btn-sm press" onClick={() => { if (!cooking) { if (s) return go(`#/r/${r.number}`); startCooking(current(r)) } go('#/cook') }}>{cooking ? 'Reprendre' : 'Cuisiner'}</button>}
    </div>
  )
}

// Kept while the app is open, so coming back from a recipe shows the same list at the same place.
const query = createStore<Query>(emptyQuery())
let scrollTop = 0

const GROUP_ONE: Record<Group, string> = { main: 'Plat', side: 'Accompagnement', soup: 'Soupe', dessert: 'Dessert', breakfast: 'Petit-déjeuner', basics: 'Sauce ou base', batch: 'En lot', household: 'Maison' }
export const groupLabel = (r: Recipe) => GROUP_ONE[r.group]
export const washLabel = (r: Recipe) => (r.washCount ? `${r.washCount} à laver` : '')

const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
const pairs = (list: string[]): [string, string][] => list.map((v) => [v, v])

export function Row({ r }: { r: Recipe }) {
  const meta = [groupLabel(r), r.activeMin != null ? `${r.activeMin} min actif` : '', washLabel(r)].filter(Boolean)
  return (
    <button class="rrow press" onClick={() => go(`#/r/${r.number}`)}>
      <span class="pic rthumb"><img src={photo(r)} alt="" loading="lazy" width="96" height="72" /></span>
      <span class="grow">
        <span class="rtitle"><span class="rnum num">{pad(r.number)}</span> {r.title}</span>
        <span class="rmeta">{meta.join(' · ')}</span>
      </span>
    </button>
  )
}

export function Recipes() {
  const q = query.use(), fam = family.use()
  const [filters, setFilters] = useState(false)
  const main = useRef<HTMLDivElement>(null)
  useEffect(() => { if (main.current) main.current.scrollTop = scrollTop }, [])
  const set = (change: Partial<Query>) => { query.set({ ...q, ...change }); if (main.current) main.current.scrollTop = 0 }
  const list = search(RECIPES, q, fam.facets)
  const linked = Object.keys(fam.facets).length > 0
  const prots = proteins(fam.facets)
  const sort = effectiveSort(q, fam.facets)
  const defaultSort = effectiveSort(emptyQuery(), fam.facets)
  const extra = q.groups.length + q.cui.length + q.style.length + (q.kid ? 1 : 0) + (sort !== defaultSort ? 1 : 0)
  const sorts: [Sort, string][] = []
  if (linked) sorts.push(['old', 'Pas fait depuis longtemps'])
  sorts.push(['number', 'Numéro'], ['active', 'Temps actif'], ['wash', 'Moins de vaisselle'])
  return (
    <div class="main" ref={main} onScroll={(e) => { scrollTop = (e.currentTarget as HTMLElement).scrollTop }}>
      <div class="stack">
        <div class="row"><h1 class="headline grow">Recettes</h1><span class="muted num">{list.length} sur {RECIPES.length}</span></div>
        <Tonight />
        <div class="row">
          <label class="searchbox grow"><Icon.search /><input type="search" class="field" placeholder="Titre ou ingrédient" autocomplete="off" enterkeyhint="search" value={q.q} onInput={(e) => set({ q: (e.target as HTMLInputElement).value })} aria-label="Chercher une recette" /></label>
          <button class={`iconbtn press${extra ? ' on' : ''}`} onClick={() => setFilters(true)} aria-label="Trier et filtrer"><Icon.sliders />{extra > 0 && <span class="count num">{extra}</span>}</button>
        </div>
        {prots.length > 0 && (
          <div class="strip" role="group" aria-label="Protéine">
            <button class={`chip press${q.prot.length ? '' : ' on'}`} onClick={() => set({ prot: [] })}>Tout</button>
            {prots.map((p) => <button class={`chip press${q.prot.includes(p) ? ' on' : ''}`} aria-pressed={q.prot.includes(p)} onClick={() => set({ prot: flip(q.prot, p) })}>{p}</button>)}
          </div>
        )}
        {list.length ? <div class="card rlist">{list.map((r) => <Row key={r.number} r={r} />)}</div>
          : <div class="empty">Aucune recette.<button class="link" onClick={() => query.set(emptyQuery())}>Tout afficher</button></div>}
      </div>
      {filters && (
        <Sheet title="Trier et filtrer" onClose={() => setFilters(false)} foot={<>
          <button class="btn btn-secondary grow press" onClick={() => query.set({ ...emptyQuery(), q: q.q, prot: q.prot })}>Effacer</button>
          <button class="btn btn-primary grow press" onClick={() => setFilters(false)}>Voir {list.length} recette{list.length > 1 ? 's' : ''}</button>
        </>}>
          <div><div class="label">Trier par</div><Chips options={sorts} value={[sort]} onToggle={(v) => set({ sort: v })} /></div>
          <div><div class="label">Catégorie</div><Chips options={GROUPS} value={q.groups} onToggle={(g) => set({ groups: flip(q.groups, g) })} /></div>
          {linked ? <>
            <div><div class="label">Cuisine</div><Chips options={pairs(cuisines(fam.facets))} value={q.cui} onToggle={(v) => set({ cui: flip(q.cui, v) })} /></div>
            <div><div class="label">Style</div><Chips options={pairs(styles(fam.facets))} value={q.style} onToggle={(v) => set({ style: flip(q.style, v) })} /></div>
            <div><div class="label">Aussi</div><Chips options={[['kid', 'Facile pour enfants']]} value={q.kid ? ['kid'] : []} onToggle={() => set({ kid: !q.kid })} /></div>
          </> : <div class="muted">Protéine, Cuisine, Style et « Pas fait depuis longtemps » viennent du Control Center : ouvrez une fois le lien famille dans Chrome sur ce téléphone.</div>}
        </Sheet>
      )}
    </div>
  )
}
