// Ajouter une recette: paste a recipe (or photograph it), Luc writes it as a Chef Luc card, you check it,
// and it is saved in the family's recipe file in Drive, where both apps (and the card kit) find it.
import { useState } from 'preact/hooks'
import { Icon } from '../ui'
import { createStore } from '../lib/store'
import { settings } from '../lib/settings'
import { answerText, generate, LucError, withModels } from '../lib/gemini'
import { CATEGORIES, CUISINES, PROTEINS, cardBody, parseCard, readJson, type Card } from '../lib/luc'
import { forReading, thumbnail } from '../lib/images'
import { familyAction, familyKey, refreshLibrary } from '../lib/family'
import { recipe as findRecipe, recipeByTitle } from '../lib/recipes'
import { go } from '../lib/engine'

/** What was typed survives leaving the page (photos do not: they are re-picked). */
const draft = createStore('', 'addDraft')

type Stage =
  | { s: 'input' }
  | { s: 'wait' }
  | { s: 'review'; card: Card }
  | { s: 'saving'; card: Card }
  | { s: 'error'; msg: string; card?: Card }

export function AddRecipe() {
  const cfg = settings.use()
  const text = draft.use()
  const [pages, setPages] = useState<File[]>([])
  const [dish, setDish] = useState<{ file: File; url: string } | null>(null)
  const [stage, setStage] = useState<Stage>({ s: 'input' })
  const [fix, setFix] = useState('')

  const convert = async (previous?: Card) => {
    if (!cfg.geminiKey) return setStage({ s: 'error', msg: 'nokey', card: previous })
    if (navigator.onLine === false) return setStage({ s: 'error', msg: 'Pas de connexion internet.', card: previous })
    setStage({ s: 'wait' })
    try {
      const images = await Promise.all(pages.map((f) => forReading(f).catch(() => { throw new LucError(`Photo illisible : ${f.name}. Retirez-la ou prenez-en une autre.`) })))
      const key = cfg.geminiKey
      const body = cardBody(cfg, { text, images }, previous, fix)
      const { out } = await withModels(key, cfg.geminiModel, (m) => generate(key, m, body, { timeoutMs: 90000 }))
      const card = parseCard(readJson(answerText(out)))
      if (!card) throw new LucError("Luc n'a pas pu lire cette recette. Ajoutez du texte ou une photo plus nette.")
      setFix('')
      setStage({ s: 'review', card })
    } catch (e) {
      console.error(e)
      setStage({ s: 'error', msg: e instanceof LucError ? e.message : `Erreur inattendue (${String((e as Error)?.message || e).slice(0, 80)}).`, card: previous })
    }
  }

  const save = async (card: Card) => {
    if (recipeByTitle(card.title)) return setStage({ s: 'error', msg: `Une recette s'appelle déjà « ${card.title} ». Changez le titre.`, card })
    setStage({ s: 'saving', card })
    try {
      const image_data = dish ? await thumbnail(dish.file).catch(() => undefined) : undefined
      const { remarks: _r, ...fields } = card
      const r = await familyAction({ a: 'addRecipe', recipe: { ...fields, image_data, original_text: text.slice(0, 4000) } })
      if (!r?.ok) throw new Error(r?.error === 'action' ? 'le script Google n’est pas encore à jour (v1.4.0). Réessayez dans 5 minutes' : String(r?.error || 'refusé'))
      await refreshLibrary(true)
      draft.set(''); setPages([]); setDish(null); setStage({ s: 'input' })
      go(findRecipe(r.number) ? `#/r/${r.number}` : '#/')
    } catch (e) {
      setStage({ s: 'error', msg: `Pas enregistrée : ${(e as Error).message}.`, card })
    }
  }

  const edit = (change: Partial<Card>) => { if (stage.s === 'review') setStage({ s: 'review', card: { ...stage.card, ...change } }) }
  const card = 'card' in stage ? stage.card : undefined

  return (
    <div class="main"><div class="stack">
      <button class="back press" onClick={() => go('#/')}><Icon.back />Recettes</button>
      <h1 class="headline">Nouvelle recette</h1>

      {!familyKey() && <div class="answer err">Pour enregistrer une recette dans Drive, ouvrez d'abord une fois le lien famille du Control Center dans Chrome sur ce téléphone.</div>}

      {(stage.s === 'input' || stage.s === 'wait' || (stage.s === 'error' && !card)) && <>
        <div class="muted">Collez la recette (d'un site, d'un message, d'un document) ou prenez en photo la page. Luc l'écrit au format Chef Luc, avec vos règles et vos outils.</div>
        <textarea class="field area" rows={9} placeholder="Collez la recette ici" value={text} onInput={(e) => draft.set((e.target as HTMLTextAreaElement).value)} />
        <div class="row wrap">
          <label class="btn btn-secondary btn-sm press"><Icon.book />Photos de la recette{pages.length ? ` (${pages.length})` : ''}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => setPages([...pages, ...Array.from((e.target as HTMLInputElement).files || [])].slice(0, 4))} /></label>
          {pages.length > 0 && <button class="link" onClick={() => setPages([])}>Retirer les photos</button>}
        </div>
        <button class="btn btn-primary press" disabled={stage.s === 'wait' || (!text.trim() && !pages.length)} onClick={() => convert()}>
          {stage.s === 'wait' ? <><span class="spinner" />Luc écrit la fiche… (jusqu'à 1 min)</> : <><Icon.chat />Écrire la fiche avec Luc</>}
        </button>
      </>}

      {stage.s === 'error' && (stage.msg === 'nokey'
        ? <div class="answer err">Ajoutez d'abord votre clé Gemini.<button class="btn btn-secondary btn-sm press" onClick={() => go('#/settings')}>Aller aux Réglages</button></div>
        : <div class="answer err">{stage.msg}{stage.card && <button class="btn btn-secondary btn-sm press" onClick={() => setStage({ s: 'review', card: stage.card! })}>Revenir à la fiche</button>}</div>)}

      {card && <>
        {card.remarks && <div class="answer"><b>Luc :</b> {card.remarks}</div>}
        <label class="stack"><span class="label">Titre</span><input class="field" value={card.title} disabled={stage.s !== 'review'} onInput={(e) => edit({ title: (e.target as HTMLInputElement).value })} /></label>
        <label class="stack"><span class="label">Catégorie</span>
          <select class="field" value={card.category} disabled={stage.s !== 'review'} onChange={(e) => edit({ category: (e.target as HTMLSelectElement).value })}>{CATEGORIES.map((c) => <option value={c}>{c}</option>)}</select></label>
        <div class="muted">{[card.yield, card.active, card.total].filter(Boolean).join(' · ')}</div>
        {card.category.startsWith('Main') && <div class="card card-pad stack">
          <div class="label">Pour le menu de la famille (Control Center)</div>
          <div class="row wrap">
            <select class="field grow" value={card.protein} disabled={stage.s !== 'review'} onChange={(e) => edit({ protein: (e.target as HTMLSelectElement).value })} aria-label="Protéine">{PROTEINS.map((c) => <option value={c}>{c}</option>)}</select>
            <select class="field grow" value={card.cuisine} disabled={stage.s !== 'review'} onChange={(e) => edit({ cuisine: (e.target as HTMLSelectElement).value })} aria-label="Cuisine">{CUISINES.map((c) => <option value={c}>{c}</option>)}</select>
          </div>
          <div class="muted">{[card.styles.join(', '), card.kid ? 'facile pour enfants' : ''].filter(Boolean).join(' · ')}</div>
        </div>}
        {card.tools.length > 0 && <section><h2 class="label">Outils</h2><p class="text">{card.tools.join(', ')}</p></section>}
        <section><h2 class="label">Mise en place</h2><ol class="lines">{card.mise.map((m) => <li>{m}</li>)}</ol></section>
        <section><h2 class="label">Étapes</h2><ol class="lines">{card.steps.map((st) => <li><b>{st.label}.</b> {st.text}</li>)}</ol></section>
        {card.notes.length > 0 && <section><h2 class="label">Notes</h2>{card.notes.map((n) => <p class="text">{n}</p>)}</section>}

        <section class="stack">
          <h2 class="label">Photo du plat (facultatif)</h2>
          <div class="row">
            <span class="pic rthumb">{dish && <img src={dish.url} alt="" width="96" height="72" />}</span>
            <label class="btn btn-secondary btn-sm press">{dish ? 'Changer' : 'Ajouter une photo'}
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) setDish({ file: f, url: URL.createObjectURL(f) }) }} /></label>
          </div>
        </section>

        <section class="stack">
          <h2 class="label">Une correction ?</h2>
          <div class="row ask">
            <textarea class="field area grow" rows={2} placeholder="Ex. : sans four, au Instant Pot ; moins de piment" value={fix} onInput={(e) => setFix((e.target as HTMLTextAreaElement).value)} />
            <button class="send press" disabled={!fix.trim() || stage.s !== 'review'} onClick={() => convert(card)} aria-label="Refaire la fiche">›</button>
          </div>
        </section>

        <div class="row">
          <button class="btn btn-secondary grow press" disabled={stage.s === 'saving'} onClick={() => setStage({ s: 'input' })}>Recommencer</button>
          <button class="btn btn-primary grow press" disabled={stage.s === 'saving' || !familyKey() || !card.title.trim()} onClick={() => save(card)}>
            {stage.s === 'saving' ? <><span class="spinner" />Enregistrement…</> : 'Ajouter à mes recettes'}</button>
        </div>
        <div class="muted small">Elle est ajoutée au fichier de recettes dans Drive (« Recipes AI-ready ») : Chef Luc et le Control Center la voient. Pour l'imprimer en fiche, voir le mode d'emploi dans ce dossier.</div>
      </>}
    </div></div>
  )
}
