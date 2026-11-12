// Réglages: the one place for rules, family, tools, pantry, stores, the Gemini key and backups.
import { useState } from 'preact/hooks'
import { Icon, Sheet } from '../ui'
import { age, DEFAULT_RULES, kidShare, lines, settings, type Member, type Settings as S } from '../lib/settings'
import { answerText, flashModels, generate, LucError } from '../lib/gemini'
import { backupName, makeBackup, readBackup, restoreBackup, type Backup } from '../lib/backup'
import { familyKey } from '../lib/family'
import { versions } from '../lib/versions'
import { applyUpdate, checkForUpdate } from '../lib/update'

declare const __VERSION__: string

type Open = null | 'rules' | 'family' | 'tools' | 'pantry' | 'stores' | 'key' | 'backup'

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`

function familySummary(s: S): string {
  const adults = s.family.filter((m) => m.adult).length, kids = s.family.filter((m) => !m.adult)
  const ages = kids.map((k) => age(k.birth)).filter((a) => a !== undefined)
  return [plural(adults, 'adulte', 'adultes'), kids.length ? `${plural(kids.length, 'enfant', 'enfants')}${ages.length ? ` (${ages.join(' et ')} ans)` : ''}` : ''].filter(Boolean).join(' · ')
}

/** Text that is edited as a whole and saved only on "Enregistrer". */
function TextSheet({ title, hint, value, rows, onSave, onReset, onClose }: { title: string; hint: string; value: string; rows: number; onSave: (v: string) => void; onReset?: () => string; onClose: () => void }) {
  const [v, setV] = useState(value)
  return (
    <Sheet title={title} onClose={onClose} foot={<>
      <button class="btn btn-secondary grow press" onClick={onClose}>Annuler</button>
      <button class="btn btn-primary grow press" disabled={v === value} onClick={() => { onSave(v); onClose() }}>Enregistrer</button>
    </>}>
      <div class="muted">{hint}</div>
      <textarea class="field area" rows={rows} value={v} onInput={(e) => setV((e.target as HTMLTextAreaElement).value)} spellcheck={false} />
      {onReset && <button class="link" onClick={() => setV(onReset())}>Revenir au texte de départ</button>}
    </Sheet>
  )
}

function FamilySheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Member[]>(settings.get().family)
  const edit = (id: string, change: Partial<Member>) => setList(list.map((m) => (m.id === id ? { ...m, ...change } : m)))
  const add = (adult: boolean) => setList([...list, { id: Math.random().toString(36).slice(2, 8), name: adult ? 'Adulte' : 'Enfant', adult }])
  const share = kidShare({ ...settings.get(), family: list })
  return (
    <Sheet title="Famille" onClose={onClose} foot={<>
      <button class="btn btn-secondary grow press" onClick={onClose}>Annuler</button>
      <button class="btn btn-primary grow press" disabled={!list.some((m) => m.adult)} onClick={() => { settings.set({ ...settings.get(), family: list }); onClose() }}>Enregistrer</button>
    </>}>
      <div class="muted">Les portions de départ suivent la famille. L'âge des enfants règle la taille de leur assiette (et des lunchs) : aujourd'hui {Math.round(share * 100)} % d'une assiette d'adulte.</div>
      {list.map((m) => (
        <div class="card card-pad stack member">
          <div class="row">
            <input class="field grow" value={m.name} aria-label="Prénom" onInput={(e) => edit(m.id, { name: (e.target as HTMLInputElement).value })} />
            <button class="iconbtn press" onClick={() => setList(list.filter((x) => x.id !== m.id))} aria-label={`Retirer ${m.name}`}><Icon.x /></button>
          </div>
          {!m.adult && <label class="row"><span class="grow">Né(e) le{age(m.birth) !== undefined && <span class="muted"> · {age(m.birth)} ans</span>}</span><input class="field date" type="date" value={m.birth ?? ''} onInput={(e) => edit(m.id, { birth: (e.target as HTMLInputElement).value || undefined })} /></label>}
        </div>
      ))}
      <div class="row"><button class="btn btn-secondary btn-sm grow press" onClick={() => add(true)}>+ Adulte</button><button class="btn btn-secondary btn-sm grow press" onClick={() => add(false)}>+ Enfant</button></div>
    </Sheet>
  )
}

function StoresSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState(settings.get().stores)
  const move = (i: number, d: number) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; setList(l) }
  return (
    <Sheet title="Ordre des magasins" onClose={onClose} foot={<>
      <button class="btn btn-secondary grow press" onClick={onClose}>Annuler</button>
      <button class="btn btn-primary grow press" onClick={() => { settings.set({ ...settings.get(), stores: list }); onClose() }}>Enregistrer</button>
    </>}>
      <div class="muted">La liste de courses suit cet ordre. Les noms correspondent à vos listes Cozi.</div>
      <div class="card">{list.map((st, i) => (
        <div class="kv"><span class="grow"><span class="num muted">{i + 1}.</span> {st}</span>
          <button class="iconbtn press" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Monter ${st}`}>↑</button>
          <button class="iconbtn press" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre ${st}`}>↓</button>
        </div>))}</div>
    </Sheet>
  )
}

function KeySheet({ onClose }: { onClose: () => void }) {
  const cfg = settings.get()
  const [key, setKey] = useState(cfg.geminiKey ?? '')
  const [state, setState] = useState<{ busy?: boolean; ok?: string; err?: string }>({})
  const test = async () => {
    const k = key.trim()
    setState({ busy: true })
    try {
      const models = await flashModels(k)
      if (!models.length) throw new LucError('Aucun modèle Gemini Flash disponible pour cette clé.')
      let model = models[0], last: unknown
      for (const m of models.slice(0, 3)) {
        try { const j = await generate(k, m, { contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }] }, { timeoutMs: 20000 }); if (!answerText(j)) throw new LucError('Réponse vide.', 0, true); model = m; last = undefined; break }
        catch (e) { last = e; if (!(e instanceof LucError && e.retry)) break }
      }
      if (last) throw last
      settings.set({ ...settings.get(), geminiKey: k, geminiModel: model })
      setState({ ok: `Clé enregistrée. Modèle : ${model}.` })
    } catch (e) {
      setState({ err: e instanceof LucError ? e.message : 'Test impossible.' })
    }
  }
  return (
    <Sheet title="Clé Gemini" onClose={onClose} foot={<>
      {cfg.geminiKey && <button class="btn btn-danger grow press" onClick={() => { const { geminiKey: _k, geminiModel: _m, ...rest } = settings.get(); settings.set(rest); setKey(''); setState({}) }}>Effacer</button>}
      <button class="btn btn-primary grow press" disabled={!key.trim() || state.busy} onClick={test}>{state.busy ? 'Test…' : 'Tester et enregistrer'}</button>
    </>}>
      <div class="muted">Créée sur aistudio.google.com/apikey. Elle reste sur ce téléphone : elle n'est jamais envoyée ailleurs que chez Google, ni mise dans les sauvegardes.</div>
      <input class="field" type="password" autocomplete="off" spellcheck={false} placeholder="Collez la clé ici" value={key} onInput={(e) => { setKey((e.target as HTMLInputElement).value); setState({}) }} />
      {state.ok && <div class="answer ok"><Icon.check />{state.ok}</div>}
      {state.err && <div class="answer err">{state.err}</div>}
      {cfg.geminiModel && !state.ok && <div class="muted">Modèle utilisé : {cfg.geminiModel}</div>}
    </Sheet>
  )
}

function BackupSheet({ onClose }: { onClose: () => void }) {
  const [found, setFound] = useState<Backup | null>(null)
  const [msg, setMsg] = useState('')
  const save = () => {
    const blob = new Blob([JSON.stringify(makeBackup(), null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = backupName(); a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    setMsg('Sauvegarde téléchargée.')
  }
  const pick = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    ;(e.target as HTMLInputElement).value = ''
    if (!file) return
    let raw: unknown
    try { raw = JSON.parse(await file.text()) } catch { setFound(null); setMsg("Fichier illisible."); return }
    const r = readBackup(raw)
    if (r.ok) { setFound(r.data); setMsg('') } else { setFound(null); setMsg(r.why) }
  }
  const n = found ? Object.values(found.versions).reduce((t, h) => t + h.list.length, 0) : 0
  return (
    <Sheet title="Sauvegarde" onClose={onClose}>
      <div class="muted">Un fichier avec vos règles, la famille, les outils, le garde-manger, les magasins et les versions de recettes. Sans la clé Gemini.</div>
      <button class="btn btn-primary press" onClick={save}>Exporter</button>
      <label class="btn btn-secondary press">Importer…<input type="file" accept="application/json,.json" hidden onChange={pick} /></label>
      {msg && <div class="answer">{msg}</div>}
      {found && <div class="card card-pad stack">
        <div class="text">Remplacer les données de ce téléphone par la sauvegarde du {new Date(found.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} ({plural(n, 'version de recette', 'versions de recettes')}) ? La clé Gemini de ce téléphone est gardée.</div>
        <div class="row"><button class="btn btn-secondary btn-sm grow press" onClick={() => setFound(null)}>Annuler</button><button class="btn btn-primary btn-sm grow press" onClick={() => { restoreBackup(found); setFound(null); setMsg('Sauvegarde restaurée.') }}>Remplacer</button></div>
      </div>}
    </Sheet>
  )
}

export function Settings() {
  const s = settings.use(), all = versions.use()
  const [open, setOpen] = useState<Open>(null)
  const [upd, setUpd] = useState('')
  const check = async () => {
    setUpd('…')
    const fresh = await checkForUpdate()
    if (fresh) { setUpd('Mise à jour…'); setTimeout(applyUpdate, 1500) } else setUpd('À jour')
  }
  const edited = Object.values(all).filter((h) => h.list.length).length
  const row = (key: Open, label: string, value: string) => (
    <button class="kv press" onClick={() => setOpen(key)}><span class="k">{label}</span><span class="v">{value}</span></button>
  )
  const close = () => setOpen(null)
  return (
    <div class="main"><div class="stack">
      <h1 class="headline">Réglages</h1>
      <div><div class="label">Chef Luc</div><div class="card">
        {row('rules', 'Mes règles', s.rules === DEFAULT_RULES ? 'Texte de départ' : `${plural(lines(s.rules).length, 'ligne', 'lignes')}`)}
        {row('key', 'Clé Gemini', s.geminiKey ? 'Enregistrée' : 'À ajouter')}
      </div></div>
      <div><div class="label">Cuisine</div><div class="card">
        {row('family', 'Famille', familySummary(s))}
        {row('tools', 'Outils', plural(s.tools.length, 'outil', 'outils'))}
        {row('pantry', 'Garde-manger', plural(s.pantry.length, 'produit', 'produits'))}
        {row('stores', 'Magasins', s.stores.join(' → '))}
      </div></div>
      <div><div class="label">Données</div><div class="card">
        {row('backup', 'Sauvegarde', edited ? plural(edited, 'recette modifiée', 'recettes modifiées') : 'Exporter, importer')}
        <div class="kv"><span class="k">Lien famille (Control Center)</span><span class="v">{familyKey() ? 'Trouvé' : 'Absent'}</span></div>
        <div class="kv"><span class="k">Version</span><span class="row ver"><span class="muted">{upd}</span><span class="num">{__VERSION__}</span><button class={`refresh press${upd === '…' ? ' spin' : ''}`} onClick={check} aria-label="Chercher une mise à jour"><Icon.refresh /></button></span></div>
      </div></div>

      {open === 'rules' && <TextSheet title="Mes règles" hint="Chef Luc les reçoit à chaque question. « En faire une règle » ajoute ici." value={s.rules} rows={16} onReset={() => DEFAULT_RULES} onSave={(v) => settings.set({ ...settings.get(), rules: v.trim() || DEFAULT_RULES })} onClose={close} />}
      {open === 'tools' && <TextSheet title="Outils" hint="Un outil par ligne. Chef Luc ne propose que ceux-ci." value={s.tools.join('\n')} rows={12} onSave={(v) => settings.set({ ...settings.get(), tools: lines(v) })} onClose={close} />}
      {open === 'pantry' && <TextSheet title="Garde-manger" hint="Un produit par ligne : toujours à la maison, donc jamais sur la liste de courses." value={s.pantry.join('\n')} rows={12} onSave={(v) => settings.set({ ...settings.get(), pantry: lines(v) })} onClose={close} />}
      {open === 'family' && <FamilySheet onClose={close} />}
      {open === 'stores' && <StoresSheet onClose={close} />}
      {open === 'key' && <KeySheet onClose={close} />}
      {open === 'backup' && <BackupSheet onClose={close} />}
    </div></div>
  )
}
