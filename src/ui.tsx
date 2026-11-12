import type { ComponentChildren } from 'preact'
import { useEffect } from 'preact/hooks'

const svg = (d: ComponentChildren, fill = false) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>
)
export const Icon = {
  book: () => svg(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" /></>),
  pot: () => svg(<><path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /><path d="M2 10h20M9 6c0-1.5 1.5-1.5 1.5-3M13.5 6c0-1.5 1.5-1.5 1.5-3" /></>),
  cart: () => svg(<><path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /></>),
  gear: () => svg(<><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>),
  search: () => svg(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  sliders: () => svg(<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
  back: () => svg(<path d="M15 5l-7 7 7 7" />),
  check: () => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  timer: () => svg(<><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 2M9.5 3h5" /></>),
  sun: () => svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3L7 7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7" /></>),
  x: () => svg(<path d="M6 6l12 12M18 6L6 18" />),
  people: () => svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17.5" cy="9" r="2.4" /><path d="M16.5 14.2c2.6.3 4.5 2.5 4.5 5.3" /></>),
  sink: () => svg(<><path d="M3 13h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" /><path d="M12 13V6a2.5 2.5 0 0 1 5 0v1" /></>),
}

/** A panel that slides up from the bottom; tap outside (or Fermer) to close. */
export function Sheet({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ComponentChildren; foot?: ComponentChildren }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="sheet-head"><span class="grabber" /><div class="row"><h2 class="title grow">{title}</h2><button class="btn-ghost press" onClick={onClose}>Fermer</button></div></div>
        <div class="sheet-body">{children}</div>
        {foot && <div class="sheet-foot">{foot}</div>}
      </div>
    </div>
  )
}

export function Chips<T extends string>({ options, value, onToggle }: { options: [T, string][]; value: T[]; onToggle: (v: T) => void }) {
  return <div class="chips">{options.map(([k, label]) => <button class={`chip press${value.includes(k) ? ' on' : ''}`} aria-pressed={value.includes(k)} onClick={() => onToggle(k)}>{label}</button>)}</div>
}

export function Stepper({ label, hint, value, min, max, step = 1, show, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step?: number; show?: (v: number) => string; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)))
  return (
    <div class="stepper">
      <div class="grow"><div class="stepper-label">{label}</div>{hint && <div class="muted">{hint}</div>}</div>
      <button class="round press" aria-label={`Moins : ${label}`} disabled={value <= min} onClick={() => set(value - step)}>−</button>
      <span class="stepper-value num">{show ? show(value) : value}</span>
      <button class="round press" aria-label={`Plus : ${label}`} disabled={value >= max} onClick={() => set(value + step)}>+</button>
    </div>
  )
}
