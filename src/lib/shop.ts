// The Courses tab's own memory: which dinners are picked, extra recipes, what you already have,
// store changes, and the batch-prep tips (one AI call per set of recipes).
import { createStore } from './store'

export interface ShopState {
  /** Dinner key (date|dish) → picked or not; unset = the default. */
  picked: Record<string, boolean>
  /** Recipes added by hand (sides, desserts…), by number. */
  extras: number[]
  /** Extras already sent to Cozi. */
  extrasSent: number[]
  /** Items ticked "j'ai déjà" for this list. */
  have: string[]
  /** Pantry items added back to this list. */
  need: string[]
  /** Store chosen for an ingredient, remembered for next time. */
  storeFor: Record<string, string>
  prep?: { key: string; at: number; tips: string[] }
}
const EMPTY: ShopState = { picked: {}, extras: [], extrasSent: [], have: [], need: [], storeFor: {} }
export const shop = createStore<ShopState>(EMPTY, 'shop')
shop.set({ ...EMPTY, ...(shop.get() as Partial<ShopState>) })

export const dinnerKey = (d: { date: string; dish: string }) => `${d.date}|${d.dish}`
const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
export const toggleHave = (key: string) => shop.set({ ...shop.get(), have: flip(shop.get().have, key) })
export const toggleNeed = (key: string) => shop.set({ ...shop.get(), need: flip(shop.get().need, key) })
export const setPicked = (key: string, on: boolean) => shop.set({ ...shop.get(), picked: { ...shop.get().picked, [key]: on } })
export const toggleExtra = (n: number) => shop.set({ ...shop.get(), extras: flip(shop.get().extras, n) })
export const setStore = (key: string, store: string) => shop.set({ ...shop.get(), storeFor: { ...shop.get().storeFor, [key]: store } })
/** After sending: start the next list clean. */
export function afterSend(extras: number[]) {
  const s = shop.get()
  shop.set({ ...s, picked: {}, have: [], need: [], extras: [], extrasSent: [...new Set([...s.extrasSent, ...extras])] })
}
