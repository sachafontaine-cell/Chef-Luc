// Courses: the coming dinners (from the Control Center), extra recipes, batch-prep tips, and the
// merged shopping list, sent to Cozi in one tap (or copied / shared).
import { useEffect, useState } from 'preact/hooks'
import { Icon, Sheet } from '../ui'
import { comingDinners, family, familyAction, familyKey, refreshFamily, sentFor, type Dinner } from '../lib/family'
import { emptyQuery, fold, pad, RECIPES, recipe as findRecipe, search, type Recipe } from '../lib/recipes'
import { current, versions } from '../lib/versions'
import { factor } from '../lib/portions'
import { drafts, portionsFor } from '../lib/session'
import { kidShare, settings } from '../lib/settings'
import { buildList, listText, shared, showItem, type Item } from '../lib/shopping'
import { afterSend, dinnerKey, setPicked, setStore, shop, toggleExtra, toggleHave, toggleNeed } from '../lib/shop'
import { answerText, generate, LucError, withModels } from '../lib/gemini'
import { parsePrep, prepBody, readJson } from '../lib/luc'
import { go } from '../lib/engine'

const byTitle = new Map(RECIPES.map((r) => [fold(r.title), r]))
export const recipeForDish = (dish: string) => (dish ? byTitle.get(fold(dish)) : undefined)

const pad2 = (n: number) => String(n).padStart(2, '0')
export const ymdLocal = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const addDays = (ymd: string, n: number) => { const d = new Date(ymd + 'T12:00'); d.setDate(d.getDate() + n); return ymdLocal(d) }
export const dayLabel = (ymd: string, today: string) => ymd === today ? "Ce soir" : ymd === addDays(today, 1) ? 'Demain' : new Date(ymd + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const when = (at: number) => new Date(at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

interface Row { d: Dinner; r?: Recipe; key: string; sent?: { at: number; by: string }; on: boolean }

function AddSheet({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const list = search(RECIPES.filter((r) => !r.household), { ...emptyQuery(), q, sort: 'number' }).slice(0, 60)
  const extras = shop.use().extras
  return (
    <Sheet title="Ajouter une recette" onClose={onClose}>
      <input class="field" type="search" placeholder="Titre ou ingrédient" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      <div class="card">{list.map((r) => (
        <button class="kv press" onClick={() => toggleExtra(r.number)}>
          <span class="grow"><span class="rnum num">{pad(r.number)}</span> {r.title}</span>
          <span class={extras.includes(r.number) ? 'tag' : 'link'}>{extras.includes(r.number) ? 'ajoutée' : 'Ajouter'}</span>
        </button>))}</div>
    </Sheet>
  )
}

export function Shop() {
  const fam = family.use(), sh = shop.use(), cfg = settings.use()
  versions.use(); drafts.use()
  const [adding, setAdding] = useState(false)
  const [send, setSend] = useState<{ s: 'idle' } | { s: 'confirm' } | { s: 'busy' } | { s: 'done'; msg: string } | { s: 'error'; msg: string }>({ s: 'idle' })
  const [prepState, setPrepState] = useState<{ busy?: boolean; err?: string }>({})
  const [showPantry, setShowPantry] = useState(false)
  const [copied, setCopied] = useState('')
  const key = familyKey()
  useEffect(() => { refreshFamily(Date.now() - family.get().at > 60000) }, [])

  const today = ymdLocal(), week = addDays(today, 6)
  const rows: Row[] = comingDinners(fam, today).filter((d) => d.dish).map((d) => {
    const r = recipeForDish(d.dish), s = sentFor(fam, d), k = dinnerKey(d)
    const on = !!r && (sh.picked[k] ?? (!s && d.date <= week))
    return { d, r, key: k, sent: s, on }
  })
  const extras = sh.extras.map((n) => findRecipe(n)).filter((r): r is Recipe => !!r)
  const kid = kidShare(cfg)
  const chosen = [...rows.filter((x) => x.on).map((x) => x.r!), ...extras]
  const planned = chosen.map((r) => { const cur = current(r); return { recipe: cur, factor: factor(r, portionsFor(r), kid) } })
  const list = buildList(planned, cfg.pantry, cfg.stores, sh.storeFor)
  const toBuy = [...list.items.filter((it) => !sh.have.includes(it.key)), ...list.pantry.filter((it) => sh.need.includes(it.key))]
  const both = shared(list)
  const prepKey = chosen.map((r) => r.number).sort((a, b) => a - b).join(',')
  const tips = sh.prep?.key === prepKey ? sh.prep.tips : undefined
  const resend = rows.filter((x) => x.on && x.sent)
  const extrasResend = extras.filter((r) => sh.extrasSent.includes(r.number))

  const askPrep = async () => {
    if (!cfg.geminiKey) { setPrepState({ err: 'Ajoutez votre clé Gemini dans Réglages.' }); return }
    if (navigator.onLine === false) { setPrepState({ err: 'Pas de connexion internet.' }); return }
    setPrepState({ busy: true })
    try {
      const k = cfg.geminiKey, body = prepBody(cfg, planned.map((p) => p.recipe), both.map((it) => `${it.name} (${it.from.map(pad).join(', ')})`).join('; '))
      const { out } = await withModels(k, cfg.geminiModel, (m) => generate(k, m, body))
      const t = parsePrep(readJson(answerText(out)))
      if (!t.length) throw new LucError("Luc n'a pas répondu. Réessayez.")
      shop.set({ ...shop.get(), prep: { key: prepKey, at: Date.now(), tips: t } })
      setPrepState({})
    } catch (e) { setPrepState({ err: e instanceof LucError ? e.message : 'Erreur inattendue.' }) }
  }

  const doSend = async () => {
    setSend({ s: 'busy' })
    const groups = cfg.stores.map((st) => ({ st, items: toBuy.filter((it) => it.store === st).map(showItem) })).filter((g) => g.items.length)
    const other = toBuy.filter((it) => !cfg.stores.includes(it.store)).map(showItem)
    if (other.length) groups.push({ st: cfg.stores[0], items: other })
    try {
      let n = 0
      for (const g of groups) for (let i = 0; i < g.items.length; i += 40) {
        await familyAction({ a: 'cozi', who: '', store: g.st, items: g.items.slice(i, i + 40), by: 'Chef Luc' })
        n += Math.min(40, g.items.length - i)
      }
      const meals = rows.filter((x) => x.on).map((x) => ({ date: x.d.date, dish: x.d.dish }))
      let note = ''
      if (meals.length) {
        try { await familyAction({ a: 'sent', meals, by: 'Chef Luc' }) } catch { note = ' (Pour marquer les repas « envoyés », mettez à jour le script Google.)' }
      }
      afterSend(extras.map((r) => r.number))
      await refreshFamily(true)
      setSend({ s: 'done', msg: `${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} à Cozi.${note}` })
    } catch (e) {
      setSend({ s: 'error', msg: `Pas envoyé à Cozi : ${(e as Error).message}.` })
    }
  }
  const tapSend = () => (resend.length || extrasResend.length ? setSend({ s: 'confirm' }) : doSend())
  const text = () => listText(toBuy, cfg.stores)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); setCopied('Liste copiée.') } catch { setCopied('Copie impossible.') }
    setTimeout(() => setCopied(''), 2500)
  }
  const shareList = async () => { try { await navigator.share({ title: 'Courses', text: text() }) } catch { /* cancelled */ } }
  const cycleStore = (it: Item) => { const i = cfg.stores.indexOf(it.store); setStore(it.key, cfg.stores[(i + 1) % cfg.stores.length]) }

  return (
    <>
      <div class="main"><div class="stack">
        <h1 class="headline">Courses</h1>

        <section>
          <h2 class="label">Repas à venir</h2>
          {!key ? <div class="answer">Ouvrez une fois le lien famille du Control Center dans Chrome sur ce téléphone : les repas de la semaine apparaîtront ici.</div>
            : !rows.length ? <div class="muted">{fam.at ? 'Aucun repas prévu pour les prochains jours.' : 'Chargement…'}</div>
            : <div class="card">{rows.map((x) => (
              <div class={`meal${x.on ? ' on' : ''}`}>
                <button class="check-main press" role="checkbox" aria-checked={x.on} disabled={!x.r} onClick={() => setPicked(x.key, !x.on)}>
                  <span class="box">{x.on && <Icon.check />}</span>
                  <span class="grow"><span class="mday">{dayLabel(x.d.date, today)} · {x.d.cook}</span><span class="mdish">{x.d.dish}</span>
                    {x.sent ? <span class="tag sent">envoyé le {when(x.sent.at)}{x.sent.by ? ` · ${x.sent.by}` : ''}</span> : !x.r ? <span class="muted"> · pas de fiche Chef Luc</span> : null}</span>
                </button>
                {x.r && <button class="swapbtn press" onClick={() => go(`#/r/${x.r!.number}`)} aria-label={`Voir la recette ${x.d.dish}`}><Icon.book /></button>}
              </div>))}</div>}
          {key && fam.at > 0 && !fam.linked && <div class="muted small">Pour voir aussi la semaine prochaine et éviter les doublons dans Cozi, mettez à jour le script Google (v0.3.5).</div>}
        </section>

        <section>
          <h2 class="label">Autres recettes</h2>
          {extras.length > 0 && <div class="card">{extras.map((r) => (
            <div class="kv"><button class="grow press left" onClick={() => go(`#/r/${r.number}`)}><span class="rnum num">{pad(r.number)}</span> {r.title}{sh.extrasSent.includes(r.number) && <span class="tag sent">déjà envoyée</span>}</button>
              <button class="iconbtn press" onClick={() => toggleExtra(r.number)} aria-label={`Retirer ${r.title}`}><Icon.x /></button></div>))}</div>}
          <button class="btn btn-secondary btn-sm press" onClick={() => setAdding(true)}>+ Ajouter une recette</button>
        </section>

        {chosen.length > 1 && <section>
          <h2 class="label">Préparation groupée</h2>
          {both.length > 0 && <div class="muted">Dans plusieurs recettes : {both.map((it) => `${it.name} (${it.from.map(pad).join(', ')})`).join(' · ')}</div>}
          {tips ? <ol class="lines tips">{tips.map((t) => <li>{t}</li>)}</ol>
            : <button class="btn btn-secondary btn-sm press" disabled={prepState.busy} onClick={askPrep}>{prepState.busy ? <><span class="spinner" />Luc réfléchit…</> : <><Icon.chat />Idées de Luc</>}</button>}
          {prepState.err && <div class="answer err">{prepState.err}</div>}
        </section>}

        <section>
          <h2 class="label">Liste · {toBuy.length} article{toBuy.length > 1 ? 's' : ''}</h2>
          {!chosen.length ? <div class="muted">Cochez des repas ou ajoutez des recettes.</div> : <>
            {cfg.stores.map((st) => {
              const items = list.items.filter((it) => it.store === st)
              if (!items.length) return null
              return <div class="card store">
                <div class="store-h">{st}</div>
                {items.map((it) => {
                  const have = sh.have.includes(it.key)
                  return <div class={`item${have ? ' have' : ''}`}>
                    <button class="check-main press" role="checkbox" aria-checked={!have} onClick={() => toggleHave(it.key)}>
                      <span class="box">{!have && <Icon.check />}</span><span class="grow">{showItem(it)}<span class="from num"> {it.from.map(pad).join(', ')}</span></span>
                    </button>
                    {cfg.stores.length > 1 && <button class="storebtn press" onClick={() => cycleStore(it)} aria-label={`Magasin pour ${it.name} : ${it.store}. Changer`}>{it.store.split('/')[0]}</button>}
                  </div>
                })}
              </div>
            })}
            {list.pantry.length > 0 && <div class="card store">
              <button class="store-h press pantry-h" onClick={() => setShowPantry(!showPantry)} aria-expanded={showPantry}>Garde-manger : pas sur la liste ({list.pantry.length}) <span class="link">{showPantry ? 'Masquer' : 'Voir'}</span></button>
              {showPantry && list.pantry.map((it) => {
                const need = sh.need.includes(it.key)
                return <div class={`item${need ? '' : ' have'}`}>
                  <button class="check-main press" role="checkbox" aria-checked={need} onClick={() => toggleNeed(it.key)}>
                    <span class="box">{need && <Icon.check />}</span><span class="grow">{showItem(it)}</span>
                  </button>
                  {need && <span class="storebtn">{it.store.split('/')[0]}</span>}
                </div>
              })}
            </div>}
            <div class="muted small">Décochez ce que vous avez déjà. Touchez le magasin pour le changer (retenu pour la prochaine fois).</div>
          </>}
        </section>
      </div></div>

      {(toBuy.length > 0 || send.s === 'done' || send.s === 'error') && <div class="actionbar stack">
        {send.s === 'confirm' ? <>
          <div class="text">Déjà envoyé à Cozi : {[...resend.map((x) => `${x.d.dish} (${when(x.sent!.at)})`), ...extrasResend.map((r) => r.title)].join(', ')}. Renvoyer quand même ?</div>
          <div class="row"><button class="btn btn-secondary grow press" onClick={() => setSend({ s: 'idle' })}>Annuler</button><button class="btn btn-primary grow press" onClick={doSend}>Renvoyer</button></div>
        </> : send.s === 'done' || send.s === 'error' ? <>
          <div class={`answer${send.s === 'error' ? ' err' : ' ok'}`}>{send.s === 'done' && <Icon.check />}{send.msg}</div>
          <button class="btn btn-secondary press" onClick={() => setSend({ s: 'idle' })}>OK</button>
        </> : <>
          {copied && <div class="muted center">{copied}</div>}
          <div class="row">
            {key && fam.cozi && <button class="btn btn-primary grow press" disabled={send.s === 'busy'} onClick={tapSend}><Icon.cart />{send.s === 'busy' ? 'Envoi…' : `Envoyer à Cozi (${toBuy.length})`}</button>}
            <button class={`btn ${key && fam.cozi ? 'btn-secondary' : 'btn-primary grow'} press`} onClick={copy}>Copier</button>
            {'share' in navigator && <button class="btn btn-secondary press" onClick={shareList} aria-label="Partager la liste">Partager</button>}
          </div>
        </>}
      </div>}
      {adding && <AddSheet onClose={() => setAdding(false)} />}
    </>
  )
}
