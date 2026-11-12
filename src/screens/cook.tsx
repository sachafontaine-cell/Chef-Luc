import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon } from '../ui'
import { pad } from '../lib/recipes'
import { scaleText } from '../lib/amounts'
import { findDurations } from '../lib/durations'
import { factor, isCard, times } from '../lib/portions'
import { allDone, cooking, currentStep, endCooking, session, startTimer, toggleLock, toggleMise, toggleStep } from '../lib/session'
import { kidShare, settings } from '../lib/settings'
import { changed, current, versions } from '../lib/versions'
import { recipe as baseRecipe } from '../lib/recipes'
import { LucSheet, type LucMode } from './luc'
import { lockHeld, lockSupported } from '../lib/wakelock'
import { askNotify } from '../lib/alarm'
import { go } from '../lib/engine'
import { PortionsSheet, portionsText } from './portions'

/** Start buttons for every time written in a line. */
function TimerButtons({ text, label, step }: { text: string; label: string; step?: number }) {
  const found = findDurations(text)
  if (!found.length) return null
  return (
    <span class="tbuttons">
      {found.map((d) => <button class="tbtn press" onClick={(e) => { e.stopPropagation(); askNotify(); startTimer(label, d.ms, step) }} aria-label={`Démarrer un minuteur de ${d.label}`}><Icon.timer />{d.label}</button>)}
    </span>
  )
}

export function Cook() {
  const s = session.use(), r = cooking(s)
  const held = lockHeld.use()
  const [sheet, setSheet] = useState(false)
  const [quit, setQuit] = useState(false)
  const [luc, setLuc] = useState<LucMode | null>(null)
  settings.use(); versions.use()
  const nowRef = useRef<HTMLDivElement>(null)
  const at = s && r ? currentStep(s, r) : -1
  // When a step is checked off, bring the next one into view.
  useEffect(() => { if (s && s.steps.length) nowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [at])

  if (!s || !r) {
    return (
      <div class="main"><div class="stack">
        <h1 class="headline">Cuisiner</h1>
        <div class="empty">Aucune recette en cours.<button class="btn btn-primary press" onClick={() => go('#/')}>Choisir une recette</button></div>
      </div></div>
    )
  }
  const kid = kidShare(), f = factor(r, s.portions, kid), done = allDone(s, r)
  // Lines changed for tonight only get a small tag.
  const tonight = changed(current(baseRecipe(r.number)!), r)
  const ctx = { recipe: r, done: s.steps, current: at, factor: f, portions: portionsText(r, s.portions) }
  const miseLeft = r.mise.length - s.mise.length
  return (
    <div class="main cook">
      <div class="stack">
        <div class="row">
          <div class="grow"><div class="rnum num">{pad(r.number)} · {s.steps.length}/{r.steps.length} étapes</div><h1 class="headline">{r.title}</h1></div>
          {lockSupported() && <button class={`iconbtn lock press${held ? ' on' : ''}`} onClick={toggleLock} aria-pressed={!s.lockOff} aria-label={s.lockOff ? "Garder l'écran allumé : désactivé" : held ? "L'écran reste allumé" : "Écran allumé : en pause"}><Icon.sun /></button>}
        </div>
        <button class="fact fact-btn press" onClick={() => setSheet(true)}>
          <Icon.people /><span class="grow"><b>{portionsText(r, s.portions)}</b>{!isCard(r, s.portions, kid) && <span class="scaled"> · quantités {times(f)}</span>}</span><span class="link">Changer</span>
        </button>

        {r.tools.length > 0 && <section><h2 class="label">Outils</h2><p class="text">{r.tools.join(', ')}</p></section>}

        {r.mise.length > 0 && <section>
          <h2 class="label">{r.miseLabel}{miseLeft === 0 ? ' · prête' : ''}</h2>
          <div class="card checks">
            {r.mise.map((m, i) => {
              const on = s.mise.includes(i), text = scaleText(m, f, 'ingredient')
              return (
                <div class={`check${on ? ' done' : ''}`}>
                  <div class="row-line">
                    <button class="check-main press" role="checkbox" aria-checked={on} onClick={() => toggleMise(i)}>
                      <span class="box">{on ? <Icon.check /> : <span class="num">{i + 1}</span>}</span><span class="check-text">{tonight.mise.includes(i) && <span class="tag">ce soir</span>}{text}</span>
                    </button>
                    {!on && <button class="swapbtn press" onClick={() => setLuc({ kind: 'swap', line: i })} aria-label={`Il me manque un ingrédient : ligne ${i + 1}`}><Icon.swap /></button>}
                  </div>
                  {!on && <TimerButtons text={m} label={`Mise en place ${i + 1}`} />}
                </div>
              )
            })}
          </div>
        </section>}

        <section>
          <h2 class="label">Étapes</h2>
          <div class="steps">
            {r.steps.map((st, i) => {
              const on = s.steps.includes(i), now = i === at
              return (
                <div class={`step${on ? ' done' : ''}${now ? ' now' : ''}`} ref={now ? nowRef : undefined}>
                  <button class="step-main press" role="checkbox" aria-checked={on} onClick={() => toggleStep(i)}>
                    <span class="box">{on ? <Icon.check /> : <span class="num">{i + 1}</span>}</span>
                    <span class="step-text">{tonight.steps.includes(i) && <span class="tag">ce soir</span>}<b>{st.label}</b>{!on && <><br />{scaleText(st.text, f, 'step')}</>}</span>
                  </button>
                  {!on && <TimerButtons text={st.text} label={`${i + 1}. ${st.label}`} step={i} />}
                </div>
              )
            })}
          </div>
        </section>

        {done && <div class="card card-pad finish">
          <h2 class="title">Terminé. Bon appétit !</h2>
          <button class="btn btn-primary press" onClick={() => { endCooking(); go('#/') }}>Fermer la recette</button>
        </div>}

        {r.notes.length > 0 && <section><h2 class="label">Notes</h2>{r.notes.map((n) => <p class="text">{n}</p>)}</section>}

        <button class="askbtn press" onClick={() => setLuc({ kind: 'ask' })}><Icon.chat />Demander à Luc</button>

        {!done && (quit ? <div class="card card-pad stack">
          <div class="text">Arrêter cette recette ? Les étapes cochées et les minuteurs seront effacés.</div>
          <div class="row"><button class="btn btn-secondary btn-sm grow press" onClick={() => setQuit(false)}>Continuer</button><button class="btn btn-danger btn-sm grow press" onClick={() => { endCooking(); go('#/') }}>Arrêter</button></div>
        </div> : <button class="link center" onClick={() => setQuit(true)}>Arrêter cette recette</button>)}
      </div>
      {sheet && <PortionsSheet recipe={r} onClose={() => setSheet(false)} />}
      {luc && <LucSheet mode={luc} ctx={ctx} onClose={() => setLuc(null)} />}
    </div>
  )
}
