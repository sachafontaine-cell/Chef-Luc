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
      throw new LucError(`Gemini : erreur ${r.status}${short ? ` (${short})` : ''}`, r.status, r.status >= 500)
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

/** Flash models this key can use, newest first (stable before "latest", "lite" last). */
export async function flashModels(key: string): Promise<string[]> {
  let r: Response
  try { r = await fetch(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`) } catch { throw new LucError('Pas de connexion internet.') }
  if (r.status === 400 || r.status === 403) throw new LucError('Clé refusée. Recopiez-la depuis AI Studio.', r.status)
  if (!r.ok) throw new LucError(`Gemini : erreur ${r.status}`, r.status)
  const j = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] }
  const names = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''))
  const v = (n: string) => parseFloat(n.slice(7)) || 0
  const stable = names.filter((n) => /^gemini-[\d.]+-flash$/.test(n)).sort((a, b) => v(b) - v(a))
  const lite = names.filter((n) => /^gemini-[\d.]+-flash-lite$/.test(n)).sort((a, b) => v(b) - v(a))
  return [...stable.slice(0, 3), ...(names.includes('gemini-flash-latest') ? ['gemini-flash-latest'] : []), ...lite.slice(0, 1)]
}

/** One call, trying up to three models when one is busy. Returns the model that answered. */
export async function withModels<T>(key: string, preferred: string | undefined, run: (model: string) => Promise<T>): Promise<{ out: T; model: string }> {
  let order: string[] = preferred ? [preferred] : []
  try { order = [...new Set([...order, ...(await flashModels(key))])] } catch (e) { if (!order.length) throw e }
  if (!order.length) throw new LucError('Aucun modèle Gemini Flash disponible pour cette clé.')
  let last: unknown
  for (const model of order.slice(0, 3)) {
    try { return { out: await run(model), model } } catch (e) {
      last = e
      // Busy, slow, out of free quota or missing: the next model may answer. Anything else stops here.
      if (!(e instanceof LucError && e.retry)) throw e
    }
  }
  throw last
}
