// Chef Luc's sheet: "Il me manque…" (swap an ingredient) and "Demander à Luc".
// Any change he proposes is shown first, then the cook picks: tonight only, save to the
// recipe (new version, confirmed), or make it a rule (confirmed).
import { useEffect, useRef, useState } from 'preact/hooks'
import { Icon, Sheet } from '../ui'
import { settings } from '../lib/settings'
import { answerText, generate, LucError, withModels } from '../lib/gemini'
import { askBody, parseReply, readJson, swapQuestion, type Context, type Option, type Reply, type Turn } from '../lib/luc'
import { ingredientsIn } from '../lib/ingredients'
import { addTonight } from '../lib/session'
import { recipe as baseRecipe } from '../lib/recipes'
import { saveVersion } from '../lib/versions'
import { go } from '../lib/engine'

export type LucMode = { kind: 'ask' } | { kind: 'swap'; line: number }

type Stage =
  | { s: 'pick' }
  | { s: 'write' }
  | { s: 'wait'; q: string }
  | { s: 'error'; q: string; msg: string }
  | { s: 'reply'; q: string; reply: Reply; pick: number }
  | { s: 'save'; q: string; reply: Reply; pick: number; summary: string }
  | { s: 'rule'; q: string; reply: Reply; pick: number; rule: string }
  | { s: 'done'; msg: string }

/** The RULES text area gets new rules at the end, under one heading. */
export function addRule(rules: string, rule: string): string {
  const line = '- ' + rule.trim().replace(/^-\s*/, '')
  const head = 'ADDED RULES'
  return rules.includes(head) ? `${rules.trimEnd()}\n${line}` : `${rules.trimEnd()}\n\n${head}\n${line}`
}

function Changes({ option, ctx }: { option: Option; ctx: Context }) {
  const r = ctx.recipe
  return (
    <div class="changes">
      {(option.patch.mise ?? []).map((e) => <div class="change">
        <div class="label">Mise en place {e.i + 1}{e.i >= r.mise.length ? ' (nouvelle)' : ''}</div>
        {r.mise[e.i] && <div class="old">{r.mise[e.i]}</div>}
        <div class="new">{e.text}</div>
      </div>)}
      {(option.patch.steps ?? []).map((e) => <div class="change">
        <div class="label">Étape {e.i + 1}{e.i >= r.steps.length ? ' (nouvelle)' : ''}</div>
        {r.steps[e.i] && <div class="old">{r.steps[e.i].text}</div>}
        <div class="new">{e.label && <b>{e.label}. </b>}{e.text}</div>
      </div>)}
    </div>
  )
}

export function LucSheet({ mode, ctx, onClose }: { mode: LucMode; ctx: Context; onClose: () => void }) {
  const cfg = settings.use()
  const line = mode.kind === 'swap' ? ctx.recipe.mise[mode.line] ?? '' : ''
  const found = mode.kind === 'swap' ? ingredientsIn(line) : []
  const [stage, setStage] = useState<Stage>(mode.kind === 'swap' && found.length !== 1 ? { s: 'pick' } : mode.kind === 'ask' ? { s: 'write' } : { s: 'wait', q: '' })
  const [text, setText] = useState('')
  const [prev, setPrev] = useState<Turn | undefined>()
  const input = useRef<HTMLTextAreaElement>(null)
  const busy = useRef(false)

  const run = async (q: string) => {
    if (busy.current || !q.trim()) return
    if (!cfg.geminiKey) return setStage({ s: 'error', q, msg: 'nokey' })
    if (navigator.onLine === false) return setStage({ s: 'error', q, msg: 'Pas de connexion internet. La recette, elle, marche hors ligne.' })
    busy.current = true
    setStage({ s: 'wait', q })
    try {
      const key = cfg.geminiKey
      const body = askBody(cfg, ctx, q, prev)
      const { out, model } = await withModels(key, cfg.geminiModel, (m) => generate(key, m, body))
      if (model !== settings.get().geminiModel) settings.set({ ...settings.get(), geminiModel: model })
      const reply = parseReply(readJson(answerText(out)), ctx.recipe)
      if (!reply.answer && !reply.options.length) throw new LucError("Luc n'a pas répondu. Réessayez.")
      setPrev({ q, a: reply.answer })
      setStage({ s: 'reply', q, reply, pick: 0 })
    } catch (e) {
      setStage({ s: 'error', q, msg: e instanceof LucError ? e.message : 'Erreur inattendue.' })
    } finally { busy.current = false }
  }
  const swap = (ingredient: string) => run(swapQuestion(ingredient, mode.kind === 'swap' ? mode.line : 0))
  const ask = () => { const q = text.trim(); if (!q) return; setText(''); run(q) }

  // One ingredient on the line: no need to ask which.
  useEffect(() => { if (mode.kind === 'swap' && found.length === 1) swap(found[0]) }, [])
  useEffect(() => { if (stage.s === 'write' || stage.s === 'reply') input.current?.focus({ preventScroll: true }) }, [stage.s])

  const base = baseRecipe(ctx.recipe.number)!
  const title = mode.kind === 'swap' ? 'Il me manque…' : 'Demander à Luc'
  const shown = (q: string) => (q.startsWith("I don't have: ") ? 'Il me manque : ' + q.slice(14).split(' (mise')[0] : q)

  let body, foot
  if (stage.s === 'pick') {
    body = <>
      <div class="muted">{line}</div>
      {found.length > 0 && <div class="chips">{found.map((f) => <button class="chip press" onClick={() => swap(f)}>{f}</button>)}</div>}
      <div class="row"><input class="field grow" placeholder="Autre ingrédient" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') swap(text) }} enterkeyhint="send" /><button class="send press" disabled={!text.trim()} onClick={() => swap(text)} aria-label="Envoyer">›</button></div>
    </>
  } else if (stage.s === 'save') {
    const o = stage.reply.options[stage.pick]
    body = <>
      <div class="text">Enregistrer dans « {ctx.recipe.title} » ? Cela crée une nouvelle version ; l'ancienne reste disponible sur la page de la recette.</div>
      <Changes option={o} ctx={ctx} />
      <label class="stack"><span class="label">Nom de la version</span><input class="field" value={stage.summary} onInput={(e) => setStage({ ...stage, summary: (e.target as HTMLInputElement).value })} /></label>
    </>
    foot = <><button class="btn btn-secondary grow press" onClick={() => setStage({ ...stage, s: 'reply' })}>Annuler</button><button class="btn btn-primary grow press" onClick={() => { saveVersion(base, o.patch, stage.summary); setStage({ s: 'done', msg: 'Recette enregistrée (nouvelle version).' }) }}>Confirmer</button></>
  } else if (stage.s === 'rule') {
    body = <>
      <div class="text">Ajouter cette règle à vos règles de Chef Luc ? Elle s'appliquera à toutes les recettes.</div>
      <textarea class="field area" rows={3} value={stage.rule} onInput={(e) => setStage({ ...stage, rule: (e.target as HTMLTextAreaElement).value })} />
    </>
    foot = <><button class="btn btn-secondary grow press" onClick={() => setStage({ ...stage, s: 'reply' })}>Annuler</button><button class="btn btn-primary grow press" disabled={!stage.rule.trim()} onClick={() => { settings.set({ ...settings.get(), rules: addRule(settings.get().rules, stage.rule) }); setStage({ s: 'done', msg: 'Règle ajoutée.' }) }}>Confirmer</button></>
  } else if (stage.s === 'done') {
    body = <div class="answer ok"><Icon.check />{stage.msg}</div>
    foot = <button class="btn btn-primary grow press" onClick={onClose}>OK</button>
  } else {
    const q = 'q' in stage ? stage.q : ''
    body = <>
      {q && <div class="bubble">{shown(q)}</div>}
      {stage.s === 'wait' && <div class="row muted"><span class="spinner" />Luc réfléchit…</div>}
      {stage.s === 'error' && (stage.msg === 'nokey'
        ? <div class="answer err">Ajoutez d'abord votre clé Gemini.<button class="btn btn-secondary btn-sm press" onClick={() => { onClose(); go('#/settings') }}>Aller aux Réglages</button></div>
        : <div class="answer err">{stage.msg}<button class="btn btn-secondary btn-sm press" onClick={() => run(stage.q)}>Réessayer</button></div>)}
      {stage.s === 'reply' && <>
        {stage.reply.answer && <div class="answer">{stage.reply.answer}</div>}
        {stage.reply.options.length > 1 && <div class="stack">{stage.reply.options.map((o, i) => (
          <button class={`option press${stage.pick === i ? ' on' : ''}`} aria-pressed={stage.pick === i} onClick={() => setStage({ ...stage, pick: i })}>
            <b>{o.title}</b>{o.why && <span class="muted">{o.why}</span>}
          </button>))}</div>}
        {stage.reply.options[stage.pick] && (() => {
          const o = stage.reply.options[stage.pick]
          const edits = (o.patch.mise?.length ?? 0) + (o.patch.steps?.length ?? 0)
          return <div class="card card-pad stack">
            {stage.reply.options.length === 1 && <div><b>{o.title}</b>{o.why && <div class="muted">{o.why}</div>}</div>}
            {edits > 0 && <Changes option={o} ctx={ctx} />}
            <div class="choices">
              {edits > 0 && <button class="btn btn-primary press" onClick={() => { addTonight(o.patch); setStage({ s: 'done', msg: 'Appliqué pour ce soir.' }) }}>Juste ce soir</button>}
              {edits > 0 && <button class="btn btn-secondary press" onClick={() => setStage({ ...stage, s: 'save', summary: o.title })}>Enregistrer dans la recette…</button>}
              <button class="btn btn-secondary press" onClick={() => setStage({ ...stage, s: 'rule', rule: o.rule || o.title })}>En faire une règle…</button>
            </div>
          </div>
        })()}
      </>}
      {(stage.s === 'write' || stage.s === 'reply' || stage.s === 'error') && (
        <div class="row ask">
          <textarea ref={input} class="field area grow" rows={2} placeholder={stage.s === 'write' ? 'Ex. : je peux remplacer le four par le BBQ ?' : 'Autre question'} value={text}
            onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} enterkeyhint="send" />
          <button class="send press" disabled={!text.trim()} onClick={ask} aria-label="Envoyer">›</button>
        </div>
      )}
    </>
  }
  return <Sheet title={title} onClose={onClose} foot={foot}>{body}</Sheet>
}
