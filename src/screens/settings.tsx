// Réglages: the one place for rules, family, tools, pantry, stores, the Gemini key and backups.
import { useEffect, useState } from 'preact/hooks'
import { Icon, Sheet } from '../ui'
import { age, DEFAULT_RULES, kidShare, lines, settings, type Member, type Settings as S } from '../lib/settings'
import { answerText, flashModels, generate, LucError, withModels } from '../lib/gemini'
import { backupName, makeBackup, readBackup, restoreBackup, type Backup } from '../lib/backup'
import { coziListNames, familyKey, missingStores } from '../lib/family'
import { specialtyStore } from '../lib/shopping'
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
  const cfg = settings.get()
  const [list, setList] = useState(cfg.stores)
  const [special, setSpecial] = useState(specialtyStore(cfg.stores, cfg.specialty))
  const [cozi, setCozi] = useState<string[] | null | undefined>(undefined)
  // The stores are your Cozi shopping lists: read their exact names, keep your order.
  useEffect(() => {
    coziListNames().then((names) => {
      setCozi(names)
      if (names) setList((l) => [...l.filter((x) => names.includes(x)), ...names.filter((n) => !l.includes(n))])
    })
  }, [])
  const move = (i: number, d: number) => { const l = [...list]; [l[i], l[i + d]] = [l[i + d], l[i]]; setList(l) }
  const missing = cozi ? missingStores(cfg.stores, cozi) : []
  return (
    <Sheet title="Magasins" onClose={onClose} foot={<>
      <button class="btn btn-secondary grow press" onClick={onClose}>Annuler</button>
      <button class="btn btn-primary grow press" disabled={!list.length} onClick={() => { settings.set({ ...settings.get(), stores: list, specialty: special }); onClose() }}>Enregistrer</button>
    </>}>
      {cozi === undefined ? <div class="row muted"><span class="spinner" />Lecture de vos listes Cozi…</div>
        : cozi ? <div class="muted">Ce sont vos listes de courses Cozi, avec leurs noms exacts. Renommer une liste dans Cozi la met à jour ici. L'ordre est celui de la liste de courses.</div>
        : <div class="answer err">Impossible de lire vos listes Cozi (lien famille absent, hors ligne, ou script Google pas à jour). Les noms ci-dessous doivent être exactement ceux de vos listes Cozi.</div>}
      {missing.length > 0 && <div class="answer">Plus dans Cozi : {missing.join(', ')}. Enregistrez pour les retirer.</div>}
      <div class="card">{list.map((st, i) => (
        <div class="kv"><span class="grow"><span class="num muted">{i + 1}.</span> {st}</span>
          <button class={`chip press${special === st ? ' on' : ''}`} onClick={() => setSpecial(st)} aria-pressed={special === st}>Spécialités</button>
          <button class="iconbtn press" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Monter ${st}`}>↑</button>
          <button class="iconbtn press" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre ${st}`}>↓</button>
        </div>))}</div>
      <div class="muted">Les articles vont dans le 1er magasin ; les produits de spécialité (tahini, sauce poisson…) dans celui marqué « Spécialités ». Un article peut aussi changer de magasin dans Courses.</div>
    </Sheet>
  )
}

const AI_STUDIO = 'https://aistudio.google.com/apikey'

function KeySheet({ onClose }: { onClose: () => void }) {
  const cfg = settings.use()
  const [key, setKey] = useState('')
  const [state, setState] = useState<{ busy?: string; ok?: string; err?: string }>({})
  const [change, setChange] = useState(!cfg.geminiKey)
  // Saving only checks the key can list the models (about a second). No answer is generated,
  // so a slow free tier cannot make it time out.
  const save = async (raw: string) => {
    const k = raw.trim().replace(/\s+/g, '')
    if (!k) return
    setState({ busy: 'Vérification…' })
    try {
      const models = await flashModels(k)
      if (!models.length) throw new LucError('Aucun modèle Gemini Flash disponible pour cette clé.')
      settings.set({ ...settings.get(), geminiKey: k, geminiModel: models[0] })
      setKey(''); setChange(false)
      setState({})
    } catch (e) {
      if (e instanceof LucError && e.status === 0) {
        settings.set({ ...settings.get(), geminiKey: k, geminiModel: undefined })
        setKey(''); setChange(false)
        setState({ ok: 'Clé enregistrée. Pas de connexion pour la vérifier : elle le sera à la première question.' })
      } else setState({ err: e instanceof LucError ? e.message : 'Vérification impossible.' })
    }
  }
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t.trim()) { setKey(t.trim()); save(t) } else setState({ err: 'Le presse-papiers est vide : copiez la clé dans AI Studio.' })
    } catch { setState({ err: 'Collage refusé : collez la clé dans le champ ci-dessous.' }) }
  }
  const test = async () => {
    const k = cfg.geminiKey!
    setState({ busy: 'Test… (jusqu’à 45 s si Gemini est chargé)' })
    const t0 = performance.now()
    try {
      const { model } = await withModels(k, cfg.geminiModel, async (m) => {
        const j = await generate(k, m, { contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }], generationConfig: { maxOutputTokens: 20 } }, { timeoutMs: 45000 })
        if (!answerText(j)) throw new LucError('Réponse vide.', 0, true)
        return true
      })
      if (model !== settings.get().geminiModel) settings.set({ ...settings.get(), geminiModel: model })
      setState({ ok: `Ça marche ✓ ${model} a répondu en ${((performance.now() - t0) / 1000).toFixed(1)} s.` })
    } catch (e) { setState({ err: `Ne marche pas : ${e instanceof LucError ? e.message : 'erreur inattendue.'}` }) }
  }
  return (
    <Sheet title="Clé Gemini" onClose={onClose}>
      {!change && cfg.geminiKey ? <>
        <div class="answer ok"><Icon.check />Clé enregistrée{cfg.geminiModel ? ` · ${cfg.geminiModel}` : ''}</div>
        <div class="muted">Elle reste sur ce téléphone, jamais dans les sauvegardes. Si un modèle est chargé, Luc passe au suivant.</div>
        <div class="row"><button class="btn btn-secondary btn-sm grow press" disabled={!!state.busy} onClick={test}>Tester</button><button class="btn btn-secondary btn-sm grow press" onClick={() => { setChange(true); setState({}) }}>Changer</button></div>
        <button class="link" onClick={() => { const { geminiKey: _k, geminiModel: _m, ...rest } = settings.get(); settings.set(rest); setChange(true); setState({}) }}>Effacer la clé</button>
      </> : <>
        <ol class="lines">
          <li>Ouvrez AI Studio, touchez <b>Create API key</b>, puis copiez la clé.</li>
          <li>Revenez ici et touchez <b>Coller la clé</b>.</li>
        </ol>
        <a class="btn btn-secondary press" href={AI_STUDIO} target="_blank" rel="noopener">Ouvrir AI Studio ↗</a>
        {'clipboard' in navigator && 'readText' in navigator.clipboard && <button class="btn btn-primary press" disabled={!!state.busy} onClick={paste}>Coller la clé</button>}
        <div class="row">
          <input class="field grow" type="password" autocomplete="off" spellcheck={false} placeholder="ou collez-la ici" value={key} onInput={(e) => { setKey((e.target as HTMLInputElement).value); setState({}) }} onKeyDown={(e) => { if (e.key === 'Enter') save(key) }} />
          <button class="btn btn-primary btn-sm press" disabled={!key.trim() || !!state.busy} onClick={() => save(key)}>OK</button>
        </div>
        {cfg.geminiKey && <button class="link" onClick={() => { setChange(false); setState({}) }}>Garder la clé actuelle</button>}
      </>}
      {state.busy && <div class="row muted"><span class="spinner" />{state.busy}</div>}
      {state.ok && <div class="answer ok"><Icon.check />{state.ok}</div>}
      {state.err && <div class="answer err">{state.err}</div>}
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
        {row('key', 'Clé Gemini', s.geminiKey ? 'Enregistrée ✓' : 'À ajouter')}
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
