// Splits a mise en place line into the ingredients it names, for the "I don't have this" button
// (and, in step 3, the shopping list).
// "Marinade in the dish: onion 80 g (1 small) grated, garlic 6 g (2 cloves)" → ["onion", "garlic"].

const F = '½⅓⅔¼¾⅛⅜⅝⅞'
const AMOUNT = new RegExp(`\\s*\\(?\\s*(?:~|about\\s)?[\\d${F}]`)

export function ingredientsIn(line: string): string[] {
  let s = line
  // "Dressing in bowl: …" names a group, not an ingredient. "Celery 100 g: rinse" names one.
  const colon = s.indexOf(':')
  if (colon > 0 && !new RegExp(`[\\d${F}]`).test(s.slice(0, colon))) s = s.slice(colon + 1)
  const out: string[] = []
  for (const raw of s.replace(/\([^)]*\)/g, ' ').split(/[,;+]|\sand\s|\bor\b/)) {
    let piece = raw.split(':')[0].trim()
    const at = piece.search(AMOUNT)
    if (at === 0) {
      // "2 cans kidney beans": amount first.
      piece = piece.replace(new RegExp(`^[\\d${F}./\\s-]+(?:g|kg|ml|l|tsp|tbsp|cups?|cans?|large|medium|small|cloves?|bunch(?:es)?|packs?|bags?|x)?\\b\\s*`, 'i'), '')
    } else if (at > 0) piece = piece.slice(0, at)
    piece = piece.replace(/^(?:optional|pinch|big pinch|a|an|the)\s+/i, '').replace(/\s+(?:pressed|grated|chopped|minced|sliced|diced|crushed|for\b.*)$/i, '').trim()
    if (piece.length < 2 || /^(?:salted water|water|rinse|halve|dice|slice|chop)$/i.test(piece)) continue
    const name = piece.charAt(0).toUpperCase() + piece.slice(1)
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name)
  }
  return out
}
