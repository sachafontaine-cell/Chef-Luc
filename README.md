# Chef Luc

Phone-first cooking helper for the Fontaine kitchen (Pixel 7, Chrome). Installable, works offline.
Cooking a recipe needs no AI and no network.

**Open it:** https://sachafontaine-cell.github.io/Chef-Luc/ then Chrome ⋮ → *Installer l'application*.

## What is in
- **Recettes**: 168 cards, search by title or ingredient, protein chips, sort (default: not cooked lately), tonight's dinner on top.
- **Cuisiner**: tools, mise en place to check off, steps that collapse when done, timers from the times
  written in a step, screen kept on, portions (adults, kids by age, lunches; light 0.8×, generous 1.2×).
  Closing the app loses nothing. No AI needed to cook.
- **Chef Luc (Gemini, optional)**: ⇄ on a mise line ("Il me manque…") and *Demander à Luc*. A proposed change can be
  used **Juste ce soir**, saved to the recipe (new version, undo on the recipe page) or turned into a rule
  (both confirmed first).
- **Épicerie**: the coming dinners from the Fontaine Control Center, extra recipes, batch-prep ideas (one AI call),
  the merged list by store (pantry left out), sent to Cozi in one tap, or copied / shared. Dinners already sent from
  either app are marked and need a confirmation to resend.
- **Réglages**: rules, Gemini key, family (birthdays), tools, pantry, store order, backup.
- **New recipes**: Recettes → **+**. Paste a recipe or photograph it; Luc writes the card with your rules; after a check it is saved
  in the family recipe file in Drive ("Recipes AI-ready"), and a main dish joins the Control Center's Recettes sheet.

## Where to change what
| Thing | Change it in |
|---|---|
| Recipes | The newest `chef_luc_recipes_vN.json` in Drive ("Recipes AI-ready"): the app picks it up by itself. The built-in copy (`src/data/recipes.json`, `BUNDLED_VERSION` in `src/lib/recipes.ts`, photos in `public/thumbs/`) only matters for a first install offline |
| Dinners of the week | Fontaine Control Center → Repas |
| Portions for one cooking session | The Portions sheet (recipe page or Cook mode) |
| Rules, family, tools, pantry, stores, Gemini key | Réglages |
| A recipe's saved changes | "Garder dans la recette" replaces its text in the recipe file in Drive (family script v1.6.0); no history is kept |
| Dish tags, menu, who cooks | Fontaine Control Center (Recettes sheet, Repas) |

The Gemini key and everything typed in Réglages stay on the phone (backup file: Réglages → Sauvegarde, without the key).

No family data lives in this public repository.

## Develop
`npm install`, `npm run dev`, `npm test`, `npm run build`. Every push to `main` tests, builds and publishes to GitHub Pages.
