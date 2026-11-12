// Running timers, always on screen above the tab bar, whatever the page.
import { Icon } from '../ui'
import { addTime, isRunning, session, stopTimer } from '../lib/session'
import { countdown } from '../lib/durations'
import { clock } from '../lib/engine'

export function TimerDock() {
  const s = session.use()
  clock.use()
  const now = Date.now()
  if (!s || !s.timers.length) return null
  const list = [...s.timers].sort((a, b) => a.endAt - b.endAt)
  return (
    <div class="dock" role="region" aria-label="Minuteurs">
      {list.map((t) => {
        const running = isRunning(t, now)
        return (
          <div class={`timer${running ? '' : ' rang'}`} role={running ? undefined : 'alert'}>
            <Icon.timer />
            <span class="grow timer-label">{t.label}</span>
            <span class="timer-left num">{running ? countdown(t.endAt - now) : 'Terminé'}</span>
            <button class="timer-btn press" onClick={() => addTime(t.id, 60000)} aria-label={`Ajouter 1 minute : ${t.label}`}>+1 min</button>
            <button class="timer-btn timer-stop press" onClick={() => stopTimer(t.id)} aria-label={`${running ? 'Annuler' : 'Arrêter'} : ${t.label}`}>{running ? <Icon.x /> : 'Arrêter'}</button>
          </div>
        )
      })}
    </div>
  )
}
