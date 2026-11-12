import { render } from 'preact'
import './styles.css'
import { App } from './app'
import { startEngine } from './lib/engine'
import { session } from './lib/session'
import { refreshFamily } from './lib/family'
import { setHomeCheck, startUpdates } from './lib/update'

// A recipe was being cooked when the app closed: come straight back to it.
if (session.get() && !location.hash.replace(/^#\/?/, '')) history.replaceState(null, '', '#/cook')

startEngine()
render(<App />, document.getElementById('app')!)

// Never reload for a new version in the middle of cooking.
setHomeCheck(() => !session.get())
startUpdates()
refreshFamily()
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshFamily() })
