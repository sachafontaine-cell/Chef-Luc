import { hideImg } from '../ui'
import { useState } from 'preact/hooks'
import { Icon } from '../ui'
import { pad, photo, type Recipe } from '../lib/recipes'
import { scaleText } from '../lib/amounts'
import { factor, isCard, times } from '../lib/portions'
import { kidShare, settings } from '../lib/settings'
import { restoreWording } from '../lib/edits'
import { cooking, drafts, portionsFor, session, startCooking } from '../lib/session'
import { go } from '../lib/engine'
import { PortionsSheet, portionsText } from './portions'
import { groupLabel } from './recipes'

export function RecipePage({ recipe: r }: { recipe: Recipe }) {
  const s = session.use()
  drafts.use(); settings.use()
  const [restoring, setRestoring] = useState<number | null>(null)
  const [restoreErr, setRestoreErr] = useState('')
  const restore = async (i: number) => {
    setRestoring(i); setRestoreErr('')
    try { await restoreWording(r, i) } catch (e) { setRestoreErr((e as Error).message) }
    setRestoring(null)
  }
  const day = (d: string) => new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const [sheet, setSheet] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [ask, setAsk] = useState(false)
  const p = portionsFor(r), kid = kidShare(), f = factor(r, p, kid)
  const mine = s?.recipe === r.number, other = !mine ? cooking(s) : undefined
  const cook = () => {
    if (mine) return go('#/cook')
    if (other && !ask) return setAsk(true)
    startCooking(r)
    go('#/cook')
  }
  const meta = [groupLabel(r), r.active, r.total].filter(Boolean)
  return (
    <>
      <div class="main">
        <div class="stack">
          <button class="back press" onClick={() => (history.length > 1 ? history.back() : go('#/'))}><Icon.back />Recettes</button>
          <div class="row rhead">
            <span class="pic rphoto">{photo(r) && <img onError={hideImg} src={photo(r)} alt="" width="120" height="90" />}</span>
            <div class="grow"><div class="rnum num">{pad(r.number)}</div><h1 class="headline">{r.title}</h1></div>
          </div>
          <div class="muted">{meta.join(' · ')}</div>
          {(r.editNote || r.history.length > 0) && <button class="fact fact-btn press" onClick={() => setShowVersions(!showVersions)} aria-expanded={showVersions}>
            <Icon.book /><span class="grow"><b>{r.editNote ? `Modifiée : ${r.editNote}` : "Fiche d'origine"}</b>{r.edited && <span class="muted"> · {day(r.edited)}</span>}<br /><span class="muted">{r.history.length} version{r.history.length > 1 ? 's' : ''} précédente{r.history.length > 1 ? 's' : ''}</span></span><span class="link">{showVersions ? 'Fermer' : 'Versions'}</span>
          </button>}
          {showVersions && r.history.length > 0 && <div class="card">
            {r.history.map((v, i) => (
              <button class="kv press" disabled={restoring !== null} onClick={() => restore(i)}>
                <span class="grow">{v.summary || 'Version précédente'}{v.at && <span class="muted"> · {day(v.at)}</span>}</span><span class="link">{restoring === i ? '…' : 'Rétablir'}</span>
              </button>))}
          </div>}
          {restoreErr && <div class="answer err">Pas rétablie : {restoreErr}.</div>}
          {r.washCount > 0 && <div class="fact"><Icon.sink /><span><b>{r.washCount} à laver</b> : {r.wash.join(', ')}</span></div>}
          <button class="fact fact-btn press" onClick={() => setSheet(true)}>
            <Icon.people /><span class="grow"><b>{portionsText(r, p)}</b>{!isCard(r, p, kid) && <span class="scaled"> · quantités {times(f)}</span>}<br /><span class="muted">Fiche : {r.yield}</span></span><span class="link">Changer</span>
          </button>
          {r.tools.length > 0 && <section><h2 class="label">Outils</h2><p class="text">{r.tools.join(', ')}</p></section>}
          {r.mise.length > 0 && <section><h2 class="label">{r.miseLabel}</h2><ol class="lines">{r.mise.map((m) => <li>{scaleText(m, f, 'ingredient')}</li>)}</ol></section>}
          <section><h2 class="label">Étapes</h2><ol class="lines">{r.steps.map((st) => <li><b>{st.label}.</b> {scaleText(st.text, f, 'step')}</li>)}</ol></section>
          {r.notes.length > 0 && <section><h2 class="label">Notes</h2>{r.notes.map((n) => <p class="text">{n}</p>)}</section>}
        </div>
      </div>
      <div class="actionbar">
        {ask && other ? <div class="stack grow">
          <div class="text">« {other.title} » est en cours. Le remplacer ? Les étapes cochées et les minuteurs seront effacés.</div>
          <div class="row"><button class="btn btn-secondary grow press" onClick={() => setAsk(false)}>Annuler</button><button class="btn btn-primary grow press" onClick={cook}>Remplacer</button></div>
        </div> : <button class="btn btn-primary grow press" onClick={cook}><Icon.pot />{mine ? 'Reprendre' : 'Cuisiner'}</button>}
      </div>
      {sheet && <PortionsSheet recipe={r} onClose={() => setSheet(false)} />}
    </>
  )
}
