import { useEffect, useRef, useState } from 'preact/hooks'
import { Chips, Icon, Sheet } from '../ui'
import { createStore } from '../lib/store'
import { emptyQuery, GROUPS, pad, photo, RECIPES, search, type Group, type Query, type Recipe, type Sort } from '../lib/recipes'
import { cuisines, family, proteins, styles } from '../lib/family'
import { go } from '../lib/engine'

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
  const extra = q.prot.length + q.cui.length + q.style.length + (q.kid ? 1 : 0) + (q.sort !== 'number' ? 1 : 0)
  const sorts: [Sort, string][] = [['number', 'Numéro'], ['active', 'Temps actif'], ['wash', 'Moins de vaisselle']]
  if (linked) sorts.push(['old', 'Pas fait depuis longtemps'])
  return (
    <div class="main" ref={main} onScroll={(e) => { scrollTop = (e.currentTarget as HTMLElement).scrollTop }}>
      <div class="stack">
        <div class="row"><h1 class="headline grow">Recettes</h1><span class="muted num">{list.length} sur {RECIPES.length}</span></div>
        <div class="row">
          <label class="searchbox grow"><Icon.search /><input type="search" class="field" placeholder="Titre ou ingrédient" autocomplete="off" enterkeyhint="search" value={q.q} onInput={(e) => set({ q: (e.target as HTMLInputElement).value })} aria-label="Chercher une recette" /></label>
          <button class={`iconbtn press${extra ? ' on' : ''}`} onClick={() => setFilters(true)} aria-label="Trier et filtrer"><Icon.sliders />{extra > 0 && <span class="count num">{extra}</span>}</button>
        </div>
        <div class="strip" role="group" aria-label="Catégories">
          <button class={`chip press${q.groups.length ? '' : ' on'}`} onClick={() => set({ groups: [] })}>Tout</button>
          {GROUPS.map(([g, label]) => <button class={`chip press${q.groups.includes(g) ? ' on' : ''}`} aria-pressed={q.groups.includes(g)} onClick={() => set({ groups: flip(q.groups, g) })}>{label}</button>)}
        </div>
        {list.length ? <div class="card rlist">{list.map((r) => <Row key={r.number} r={r} />)}</div>
          : <div class="empty">Aucune recette.<button class="link" onClick={() => query.set(emptyQuery())}>Tout afficher</button></div>}
      </div>
      {filters && (
        <Sheet title="Trier et filtrer" onClose={() => setFilters(false)} foot={<>
          <button class="btn btn-secondary grow press" onClick={() => query.set({ ...emptyQuery(), q: q.q, groups: q.groups })}>Effacer</button>
          <button class="btn btn-primary grow press" onClick={() => setFilters(false)}>Voir {list.length} recette{list.length > 1 ? 's' : ''}</button>
        </>}>
          <div><div class="label">Trier par</div><Chips options={sorts} value={[q.sort]} onToggle={(sort) => set({ sort })} /></div>
          {linked ? <>
            <div><div class="label">Protéine</div><Chips options={pairs(proteins(fam.facets))} value={q.prot} onToggle={(v) => set({ prot: flip(q.prot, v) })} /></div>
            <div><div class="label">Cuisine</div><Chips options={pairs(cuisines(fam.facets))} value={q.cui} onToggle={(v) => set({ cui: flip(q.cui, v) })} /></div>
            <div><div class="label">Style</div><Chips options={pairs(styles(fam.facets))} value={q.style} onToggle={(v) => set({ style: flip(q.style, v) })} /></div>
            <div><div class="label">Aussi</div><Chips options={[['kid', 'Facile pour enfants']]} value={q.kid ? ['kid'] : []} onToggle={() => set({ kid: !q.kid })} /></div>
          </> : <div class="muted">Les filtres Protéine, Cuisine et Style apparaissent une fois le lien famille du Control Center ouvert sur ce téléphone.</div>}
        </Sheet>
      )}
    </div>
  )
}
