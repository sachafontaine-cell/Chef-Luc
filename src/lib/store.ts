// A tiny shared value: read it anywhere, components re-render when it changes, and (when
// given a key) it is written to the phone so it survives closing the app.
import { useEffect, useState } from 'preact/hooks'

export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(l: () => void): () => void
  use(): T
}

const PREFIX = 'chef-luc:'

export function readSaved<T>(key: string): T | undefined {
  try { const s = localStorage.getItem(PREFIX + key); return s == null ? undefined : (JSON.parse(s) as T) } catch { return undefined }
}
function writeSaved(key: string, v: unknown) {
  try { if (v === undefined || v === null) localStorage.removeItem(PREFIX + key); else localStorage.setItem(PREFIX + key, JSON.stringify(v)) } catch { /* storage full or blocked */ }
}

export function createStore<T>(initial: T, key?: string): Store<T> {
  let value: T = (key ? readSaved<T>(key) : undefined) ?? initial
  const listeners = new Set<() => void>()
  const store: Store<T> = {
    get: () => value,
    set(next) {
      const v = typeof next === 'function' ? (next as (p: T) => T)(value) : next
      if (v === value) return
      value = v
      if (key) writeSaved(key, v)
      listeners.forEach((l) => l())
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l) } },
    use() {
      const [, force] = useState(0)
      useEffect(() => store.subscribe(() => force((n) => n + 1)), [])
      return value
    },
  }
  return store
}
