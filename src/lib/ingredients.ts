// Splits a mise en place line into the ingredients it names, with their amounts.
// "Marinade in the dish: onion 80 g (1 small) grated, garlic 6 g (2 cloves)"
//   → [{ name: "Onion", amount: "80 g" }, { name: "Garlic", amount: "6 g" }]
// Used by "Il me manque…" (names) and the shopping list (names and amounts).

const F = '½⅓⅔¼¾⅛⅜⅝⅞'
const DIGIT = new RegExp(`[\\d${F}]`)
const AMOUNT = new RegExp(`\\s*(?:~|about\\s)?[\\d${F}]`)
const LEAD = new RegExp(`^([\\d${F}][\\d${F}./\\s–-]*)\\s*(g|kg|ml|l|lbs?|oz|tsp|tbsp|cups?|cans?|large|medium|small|cloves?|bunch(?:es)?|packs?|packages?|bags?|heads?|x)?\\b\\s*`, 'i')
const SKIP = /^(?:salted water|water|ice water|rinse|halve|dice|slice|chop|optional|to taste)$/i

export interface Piece { name: string; amount: string }

const VERB = /^(?:cut|soak|more|rinse|pat|mix|whisk|toss|serve|heat|boil|reserve|save|keep|set|place|put|add|use|stir|drain|peel|trim|wash|zest|juice|dry|season)\b/i

export function piecesIn(line: string): Piece[] {
  const out: Piece[] = []
  // "Celery 100 g: rinse, slice; green onions 50 g: slice" holds several ingredients, each with its prep.
  for (let seg of line.replace(/\([^)]*\)/g, ' ').split(';')) {
    const colon = seg.indexOf(':')
    // "Dressing in bowl: …" names a group; "Celery 100 g: rinse" is followed by its prep.
    if (colon > 0) seg = DIGIT.test(seg.slice(0, colon)) ? seg.slice(0, colon) : seg.slice(colon + 1)
    let amounted = false
    for (const raw of seg.split(/[,+]|\sand\s/)) {
      let piece = raw.trim(), amount = ''
      const pinch = piece.match(/^(?:big\s)?pinch(?:es)?\s+(?:of\s)?/i)
      if (pinch) { piece = piece.slice(pinch[0].length); amount = 'pinch' }
      const at = piece.search(AMOUNT)
      if (at === 0) {
        // "2 cans kidney beans": amount first.
        const m = piece.match(LEAD)
        if (m) { amount = m[0].trim(); piece = piece.slice(m[0].length) }
      } else if (at > 0) {
        amount = piece.slice(at).trim().match(new RegExp(`^(?:~|about\\s)?[\\d${F}][\\d${F}./\\s–-]*\\s*[a-z]*`, 'i'))?.[0].trim() ?? ''
        piece = piece.slice(0, at)
      }
      piece = piece.replace(/^(?:optional|a|an|the)\s+/i, '').replace(/\s+(?:pressed|grated|chopped|minced|sliced|diced|crushed|to serve|for\b.*)$/i, '').trim()
      // After an ingredient with an amount, a bare lowercase phrase is its prep ("…, thin-sliced cutlets").
      const prep = !amount && amounted && /^[a-z]/.test(piece)
      if (amount) amounted = true
      if (prep || piece.length < 2 || SKIP.test(piece) || VERB.test(piece) || /^salted water/i.test(piece) || !/[a-z]/i.test(piece)) continue
      const name = piece.charAt(0).toUpperCase() + piece.slice(1)
      if (!out.some((x) => x.name.toLowerCase() === name.toLowerCase())) out.push({ name, amount: amount === 'pinch' ? '' : amount })
    }
  }
  return out
}

export const ingredientsIn = (line: string): string[] => piecesIn(line).map((p) => p.name)
