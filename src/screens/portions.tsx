// The one place portions are changed. Opened from a recipe page and from Cook mode.
import { Sheet, Stepper } from '../ui'
import { cardPortions, factor, isCard, SIZES, times, yieldKind, type Portions, type Size } from '../lib/portions'
import type { Recipe } from '../lib/recipes'
import { portionsFor, setPortions } from '../lib/session'

const SIZE_LABEL: Record<Size, string> = { light: 'Légères', normal: 'Normales', generous: 'Généreuses' }
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

/** "2 adultes · 2 enfants · 2 lunchs", or "Quantité ×2" for a batch. */
export function portionsText(r: Recipe, p: Portions): string {
  if (!yieldKind(r.yield).family) return `Quantité ${times(p.mult)}`
  const parts = [plural(p.adults, 'adulte', 'adultes')]
  if (p.kids) parts.push(plural(p.kids, 'enfant', 'enfants'))
  if (p.lunches) parts.push(plural(p.lunches, 'lunch', 'lunchs'))
  if (p.size !== 'normal') parts.push(`portions ${SIZE_LABEL[p.size].toLowerCase()}`)
  return parts.join(' · ')
}

export function PortionsSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const p = portionsFor(recipe)
  const set = (change: Partial<Portions>) => setPortions(recipe, { ...p, ...change })
  const family = yieldKind(recipe.yield).family
  const f = factor(recipe, p)
  return (
    <Sheet title="Portions" onClose={onClose} foot={<>
      <button class="btn btn-secondary grow press" disabled={isCard(recipe, p)} onClick={() => setPortions(recipe, cardPortions(recipe))}>Comme la fiche</button>
      <button class="btn btn-primary grow press" onClick={onClose}>OK</button>
    </>}>
      <div class="muted">Fiche : {recipe.yield}</div>
      {family ? <>
        <div class="card">
          <Stepper label="Adultes" value={p.adults} min={1} max={12} onChange={(adults) => set({ adults })} />
          <Stepper label="Enfants" value={p.kids} min={0} max={12} onChange={(kids) => set({ kids })} />
          <Stepper label="Lunchs du lendemain" hint="Une portion d'enfant chacun" value={p.lunches} min={0} max={8} onChange={(lunches) => set({ lunches })} />
        </div>
        <div>
          <div class="label">Taille des portions</div>
          <div class="seg" role="group" aria-label="Taille des portions">
            {(Object.keys(SIZES) as Size[]).map((s) => <button class={`press${p.size === s ? ' on' : ''}`} aria-pressed={p.size === s} onClick={() => set({ size: s })}>{SIZE_LABEL[s]}</button>)}
          </div>
        </div>
      </> : (
        <div class="card"><Stepper label="Quantité" hint="Multiplie toute la recette" value={p.mult} min={0.5} max={4} step={0.5} show={times} onChange={(mult) => set({ mult })} /></div>
      )}
      <div class={`scale-note${isCard(recipe, p) ? '' : ' on'}`} aria-live="polite">
        {isCard(recipe, p) ? 'Quantités de la fiche.' : `Quantités ${times(f)}. Les temps de cuisson et la taille des plats ne changent pas : à surveiller.`}
      </div>
    </Sheet>
  )
}
