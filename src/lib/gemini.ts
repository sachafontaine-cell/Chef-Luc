// Gemini (free tier, Flash). The key is pasted in Réglages and stays on this phone.
// When the newest model is overloaded (common on the free tier), the next one is tried.

const API = 'https://generativelanguage.googleapis.com/v1beta'

export class LucError extends Error {
  constructor(message: string, readonly status = 0, readonly retry = false) { super(message) }
}

/** Quick answers: little "thinking" (it only adds waiting). */
function thinkingFor(model: string): object | undefined {
  if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 }
  if (/^gemini-[3-9]|flash-latest/.test(model)) return { thinkingLevel: 'low' }
  return undefined
}

export async function generate(key: string, model: string, body: Record<string, unknown>, opts: { timeoutMs?: number; thinking?: boolean } = {}): Promise<any> {
  const gen = { ...(body.generationConfig as object | undefined) } as Record<string, unknown>
  const thinking = opts.thinking !== false ? thinkingFor(model) : undefined
  if (thinking) gen.thinkingConfig = thinking
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45000)
  let r: Response
  try {
    r = await fetch(`${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, generationConfig: gen }), signal: ctrl.signal,
    })
    if (!r.ok) {
      let msg = ''
      try { msg = String((await r.json())?.error?.message ?? '') } catch { /* not JSON */ }
      if (r.status === 400 && thinking && /think/i.test(msg)) return generate(key, model, body, { ...opts, thinking: false })
      const short = msg.split(/(?<=\.)\s/)[0].slice(0, 120)
      if (r.status === 429) throw new LucError('Limite gratuite atteinte pour le moment. Réessayez dans une minute.', 429, true)
      if (r.status === 400 && /api key/i.test(msg)) throw new LucError('Clé Gemini refusée. Vérifiez-la dans Réglages.', 400)
      if (r.status === 403) throw new LucError('Clé Gemini refusée (restriction ou API non activée). Vérifiez-la dans Réglages.', 403)
      if (r.status === 404) throw new LucError(`Modèle ${model} indisponible pour cette clé.`, 404, true)
      if (r.status >= 500) throw new LucError('Gemini est surchargé en ce moment.', r.status, true)
      throw new LucError(`Gemini : erreur ${r.status}${short ? ` (${short})` : ''}`, r.status)
    }
    return await r.json()
  } catch (e) {
    if (e instanceof LucError) throw e
    if (ctrl.signal.aborted) throw new LucError('Gemini met trop de temps à répondre.', 0, true)
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new LucError('Pas de connexion internet.', 0)
    throw new LucError('Connexion à Gemini perdue.', 0, true)
  } finally { clearTimeout(timer) }
}

/** The text of an answer, without the model's hidden reasoning. */
export function answerText(j: any): string {
  return (j?.candidates?.[0]?.content?.parts ?? []).filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('')
}

/** Flash models this key can use, best first: stable, then "latest", "lite", then previews. */
export async function flashModels(key: string): Promise<string[]> {
  let r: Response
  try { r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`) } catch { throw new LucError('Pas de connexion internet.') }
  if (r.status === 400 || r.status === 403) throw new LucError('Clé refusée. Recopiez-la depuis AI Studio.', r.status)
  if (!r.ok) throw new LucError(`Gemini : erreur ${r.status}`, r.status)
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
  const v = (n: string) => parseFloat(n.slice(7)) || 0
  const pick = (re: RegExp) => names.filter((n) => re.test(n)).sort((a, b) => v(b) - v(a))
  return [...new Set([
    ...pick(/^gemini-[\d.]+-flash$/).slice(0, 3),
    ...names.filter((n) => n === 'gemini-flash-latest'),
    ...pick(/^gemini-[\d.]+-flash-lite$/).slice(0, 2),
    ...names.filter((n) => n === 'gemini-flash-lite-latest'),
    ...pick(/^gemini-[\d.]+-flash(-lite)?-preview(-[\d-]+)?$/).slice(0, 2),
  ])]
}

// ---- Model health. The free tier often overloads one model ("high demand") while others answer.
// A busy model is skipped for 15 minutes; the one that last answered is tried first.
const HEALTH = 'chef-luc:models'
interface Health { busy: Record<string, number>; good?: string }
const readHealth = (): Health => { try { return { busy: {}, ...JSON.parse(localStorage.getItem(HEALTH) ?? '{}') } } catch { return { busy: {} } } }
const writeHealth = (h: Health) => { try { localStorage.setItem(HEALTH, JSON.stringify(h)) } catch { /* no storage */ } }
const markBusy = (m: string, now: number) => { const h = readHealth(); h.busy[m] = now + 15 * 60000; if (h.good === m) h.good = undefined; writeHealth(h) }
const markGood = (m: string) => { const h = readHealth(); delete h.busy[m]; h.good = m; writeHealth(h) }

/** Models to try: the one that last worked, the saved one, the others; busy ones last. */
export function modelOrder(preferred: string | undefined, available: string[], now = Date.now()): string[] {
  const h = readHealth()
  const pool = [...new Set([h.good, preferred, ...available].filter((m): m is string => !!m && (!available.length || available.includes(m) || m === preferred)))]
  const busy = (m: string) => (h.busy[m] ?? 0) > now
  return [...pool.filter((m) => !busy(m)), ...pool.filter(busy).sort((a, b) => h.busy[a] - h.busy[b])]
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Tunable for tests. */
export const RETRY = { pauseMs: 2500, maxModels: 6 }

/** One call, moving to the next model while one is busy. Returns the model that answered. */
export async function withModels<T>(key: string, preferred: string | undefined, run: (model: string) => Promise<T>): Promise<{ out: T; model: string }> {
  let available: string[] = []
  try { available = await flashModels(key) } catch (e) { if (!preferred) throw e }
  const order = modelOrder(preferred, available).slice(0, RETRY.maxModels)
  if (!order.length) throw new LucError('Aucun modèle Gemini Flash disponible pour cette clé.')
  let last: unknown
  // Every model once; if all were busy, one more try of the first after a short pause.
  for (const [i, model] of [...order, order[0]].entries()) {
    if (i === order.length) await pause(RETRY.pauseMs)
    try { const out = await run(model); markGood(model); return { out, model } } catch (e) {
      last = e
      // Busy, slow, out of free quota or missing: the next model may answer. Anything else stops here.
      if (!(e instanceof LucError && e.retry)) throw e
      markBusy(model, Date.now())
    }
  }
  const e = last as LucError
  if ([429, 500, 502, 503, 504].includes(e.status)) throw new LucError(`Gemini est surchargé en ce moment (${order.length} modèle${order.length > 1 ? 's' : ''} essayé${order.length > 1 ? 's' : ''}). Réessayez dans une minute.`, e.status, true)
  throw e
}
