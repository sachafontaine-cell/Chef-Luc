// Timer sounds. Two short sound files are built in memory (nothing to download):
//  - a near-silent loop that plays while a timer runs. Android keeps a page that is playing
//    audio awake, which lets the timer ring after the screen locks;
//  - the alarm itself, looped until the cook stops it.

function wav(seconds: number, sample: (t: number) => number, rate = 8000): string {
  const n = Math.floor(seconds * rate), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)) }
  text(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); text(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample(i / rate))) * 32767, true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

// Three beeps, a pause, repeat.
const beep = (t: number) => {
  const inBeep = t < 0.9 && t % 0.3 < 0.18
  return inBeep ? Math.sin(2 * Math.PI * 1760 * t) * 0.5 + Math.sin(2 * Math.PI * 880 * t) * 0.4 : 0
}

let quiet: HTMLAudioElement | undefined, ring: HTMLAudioElement | undefined
function players() {
  if (!quiet) {
    quiet = new Audio(wav(2, (t) => Math.sin(2 * Math.PI * 40 * t) * 0.0004)); quiet.loop = true
    ring = new Audio(wav(1.6, beep)); ring.loop = true
  }
  return { quiet: quiet!, ring: ring! }
}
const play = (a: HTMLAudioElement) => { if (a.paused) a.play().catch(() => { /* no tap yet in this visit: the screen still shows it */ }) }
const stop = (a: HTMLAudioElement) => { if (!a.paused) { a.pause(); a.currentTime = 0 } }

let buzz: ReturnType<typeof setInterval> | undefined

/** Call whenever the timers change: `running` = at least one counting down, `ringing` = at least one finished. */
export function setSound(running: boolean, ringing: boolean) {
  if (typeof Audio === 'undefined') return
  if (!running && !ringing && !quiet) return
  const p = players()
  if (ringing) play(p.ring); else stop(p.ring)
  if (running && !ringing) play(p.quiet); else stop(p.quiet)
  if (ringing && !buzz) {
    const pulse = () => { try { navigator.vibrate?.([400, 150, 400, 150, 400]) } catch { /* not supported */ } }
    pulse(); buzz = setInterval(pulse, 2000)
  } else if (!ringing && buzz) {
    clearInterval(buzz); buzz = undefined
    try { navigator.vibrate?.(0) } catch { /* not supported */ }
  }
  try {
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = running || ringing ? new MediaMetadata({ title: ringing ? 'Minuteur terminé' : 'Minuteur en cours', artist: 'Chef Luc' }) : null
  } catch { /* not supported */ }
}

/** Ask once, on the first timer, so a finished timer can also show on the lock screen. */
export function askNotify() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}) } catch { /* not supported */ }
}

export async function notify(id: string, label: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.showNotification('Minuteur terminé', { body: label, tag: 'timer-' + id, requireInteraction: true, icon: import.meta.env.BASE_URL + 'icon-192.png', badge: import.meta.env.BASE_URL + 'icon-192.png' })
  } catch { /* notifications are a bonus */ }
}
export async function clearNotify(id: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const list = (await reg?.getNotifications({ tag: 'timer-' + id })) || []
    list.forEach((n) => n.close())
  } catch { /* fine */ }
}
