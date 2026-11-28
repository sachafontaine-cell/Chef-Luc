// "Garder dans la recette": a change is saved in the family recipe file in Drive (the one card both
// apps and the printed cards come from). The new text replaces the old one; no history is kept.
import { familyAction, familyKey, refreshLibrary } from './family'
import type { Recipe, Step } from './recipes'
import { applyPatch, versions, type Patch } from './versions'

export async function saveEdit(number: number, mise: string[], steps: Step[], summary: string): Promise<void> {
  if (!familyKey()) throw new Error('lien famille absent : ouvrez une fois le lien du Control Center dans Chrome')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('pas de connexion internet')
  const r = await familyAction({ a: 'updateRecipe', number, mise, steps, summary })
  if (!r?.ok) throw new Error(r?.error === 'action' ? 'le script Google n’est pas encore à jour (v1.5.0) ; réessayez dans 5 minutes' : String(r?.error || 'refusé'))
  await refreshLibrary(true)
}

export const saveToRecipe = (r: Recipe, patch: Patch, summary: string) => {
  const next = applyPatch(r, patch)
  return saveEdit(r.number, next.mise, next.steps, summary)
}

/**
 * One time: changes that earlier versions of the app kept only on this phone go to Drive, then
 * the phone copy is cleared. Anything that cannot be sent yet stays for the next try.
 */
export async function migrateLocalVersions() {
  const all = versions.get()
  for (const [n, h] of Object.entries(all)) {
    if (h.active >= 0) {
      const v = h.list[h.active]
      try { await saveEdit(+n, v.mise, v.steps, v.summary) } catch { continue }
    }
    const { [n]: _done, ...rest } = versions.get()
    versions.set(rest)
  }
}
