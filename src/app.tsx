import { Icon } from './ui'
import { route, go } from './lib/engine'
import { session } from './lib/session'
import { recipe } from './lib/recipes'
import { current, versions } from './lib/versions'
import { Recipes } from './screens/recipes'
import { RecipePage } from './screens/recipe'
import { Cook } from './screens/cook'
import { TimerDock } from './screens/timers'
import { Shop } from './screens/later'
import { Settings } from './screens/settings'

export function App() {
  const r = route.use(), s = session.use(), all = versions.use()
  const base = r.name === 'recipe' ? recipe(r.id!) : undefined
  const found = base && current(base, all)
  const tab = r.name === 'recipe' ? 'recipes' : r.name
  const tabs = [
    ['recipes', '#/', 'Recettes', Icon.book], ['cook', '#/cook', 'Cuisiner', Icon.pot],
    ['shop', '#/shop', 'Courses', Icon.cart], ['settings', '#/settings', 'Réglages', Icon.gear],
  ] as const
  return (
    <div class="shell">
      {r.name === 'recipe' && found ? <RecipePage key={found.number} recipe={found} />
        : r.name === 'cook' ? <Cook />
        : r.name === 'shop' ? <Shop />
        : r.name === 'settings' ? <Settings />
        : <Recipes />}
      <TimerDock />
      <nav class="tabbar" aria-label="Sections">
        {tabs.map(([name, hash, label, I]) => (
          <button class={`tab press${tab === name ? ' on' : ''}`} aria-current={tab === name ? 'page' : undefined} onClick={() => go(hash)}>
            <span class="tab-icon"><I />{name === 'cook' && s && <span class="tab-dot" />}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  )
}
