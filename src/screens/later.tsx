import { useState } from 'preact/hooks'
import { Icon } from '../ui'
import { familyKey } from '../lib/family'
import { applyUpdate, checkForUpdate } from '../lib/update'

declare const __VERSION__: string

export function Shop() {
  return (
    <div class="main"><div class="stack">
      <h1 class="headline">Courses</h1>
      <div class="empty">Le menu de la semaine et la liste de courses fusionnée arrivent à l'étape 3.</div>
    </div></div>
  )
}

export function Settings() {
  const [state, setState] = useState('')
  const check = async () => {
    setState('…')
    const fresh = await checkForUpdate()
    if (fresh) { setState('Mise à jour…'); setTimeout(applyUpdate, 1500) } else setState('À jour')
  }
  return (
    <div class="main"><div class="stack">
      <h1 class="headline">Réglages</h1>
      <div class="empty">Règles de Chef Luc, famille, outils, garde-manger et clé Gemini arrivent à l'étape 2.</div>
      <div class="card">
        <div class="kv"><span class="k">Version</span><span class="row ver"><span class="muted">{state}</span><span class="num">{__VERSION__}</span><button class={`refresh press${state === '…' ? ' spin' : ''}`} onClick={check} aria-label="Chercher une mise à jour"><Icon.refresh /></button></span></div>
        <div class="kv"><span class="k">Lien famille (Control Center)</span><span class="v">{familyKey() ? 'Trouvé' : 'Absent'}</span></div>
      </div>
    </div></div>
  )
}
