import { useState } from 'preact/hooks'
import { Icon } from '../ui'
import { pad, photo, type Recipe } from '../lib/recipes'
import { scaleText } from '../lib/amounts'
import { factor, isCard, times } from '../lib/portions'
import { cooking, drafts, portionsFor, session, startCooking } from '../lib/session'
import { go } from '../lib/engine'
import { PortionsSheet, portionsText } from './portions'
import { groupLabel } from './recipes'

export function RecipePage({ recipe: r }: { recipe: Recipe }) {
  const s = session.use()
  drafts.use()
  const [sheet, setSheet] = useState(false)
  const [ask, setAsk] = useState(false)
  const p = portionsFor(r), f = factor(r, p)
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
            <span class="pic rphoto"><img src={photo(r)} alt="" width="120" height="90" /></span>
            <div class="grow"><div class="rnum num">{pad(r.number)}</div><h1 class="headline">{r.title}</h1></div>
          </div>
          <div class="muted">{meta.join(' · ')}</div>
          {r.washCount > 0 && <div class="fact"><Icon.sink /><span><b>{r.washCount} à laver</b> : {r.wash.join(', ')}</span></div>}
          <button class="fact fact-btn press" onClick={() => setSheet(true)}>
            <Icon.people /><span class="grow"><b>{portionsText(r, p)}</b>{!isCard(r, p) && <span class="scaled"> · quantités {times(f)}</span>}<br /><span class="muted">Fiche : {r.yield}</span></span><span class="link">Changer</span>
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
