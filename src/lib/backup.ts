// One file with everything typed or saved on this phone: rules, family, tools, pantry, stores and
// recipe versions. The Gemini key is left out on purpose (a backup file gets passed around).
import { defaultSettings, settings, type Settings } from './settings'
import { versions, type History } from './versions'

export interface Backup { app: 'chef-luc'; format: 1; at: string; settings: Omit<Settings, 'geminiKey' | 'geminiModel'>; versions: Record<string, History> }

export function makeBackup(now = new Date()): Backup {
  const { geminiKey: _k, geminiModel: _m, ...rest } = settings.get()
  return { app: 'chef-luc', format: 1, at: now.toISOString(), settings: rest, versions: versions.get() }
}

const isText = (v: unknown) => typeof v === 'string'
const isTextList = (v: unknown) => Array.isArray(v) && v.every(isText)

/** Checks a file before anything is replaced. Returns what it would restore, or why not. */
export function readBackup(raw: unknown): { ok: true; data: Backup } | { ok: false; why: string } {
  const b = raw as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== 'chef-luc') return { ok: false, why: "Ce fichier n'est pas une sauvegarde Chef Luc." }
  if (b.format !== 1) return { ok: false, why: 'Sauvegarde d’une version plus récente de Chef Luc : mettez l’app à jour.' }
  const s = b.settings as Partial<Settings> | undefined
  if (!s || !isText(s.rules) || !Array.isArray(s.family) || !isTextList(s.tools) || !isTextList(s.pantry) || !isTextList(s.stores)) return { ok: false, why: 'Sauvegarde incomplète ou abîmée.' }
  const v = b.versions
  if (!v || typeof v !== 'object' || Object.values(v).some((h) => !h || !Array.isArray(h.list) || typeof h.active !== 'number')) return { ok: false, why: 'Versions de recettes illisibles.' }
  return { ok: true, data: b as Backup }
}

/** Replaces this phone's data with the backup; the Gemini key on this phone is kept. */
export function restoreBackup(b: Backup) {
  const keep = settings.get()
  settings.set({ ...defaultSettings(), ...b.settings, geminiKey: keep.geminiKey, geminiModel: keep.geminiModel })
  versions.set(b.versions)
}

export const backupName = (now = new Date()) => `chef-luc-sauvegarde-${now.toISOString().slice(0, 10)}.json`
