# Chef Luc

Phone-first cooking helper for the Fontaine kitchen (Pixel 7, Chrome). Installable, works offline.
Cooking a recipe needs no AI and no network.

**Open it:** https://sachafontaine-cell.github.io/Chef-Luc/ then Chrome ⋮ → *Installer l'application*.

## What is in (step 1)
- **Recettes**: 168 cards, search by title or ingredient, categories, sort by active time or fewest dishes.
- **Cuisiner**: tools, mise en place to check off, steps that collapse when done, timers from the times
  written in a step (several at once), screen kept on, portions (adults, kids, lunches; light 0.8×, generous 1.2×).
  Closing the app loses nothing.

Coming: settings + Gemini swaps and questions (step 2), week menu from the Control Center and the Cozi
shopping list (step 3).

## Where to change what
| Thing | Change it in |
|---|---|
| Recipes | Replace `src/data/recipes.json` with the newest `chef_luc_recipes_v*.json`, photos in `public/thumbs/` |
| Dinners of the week | Fontaine Control Center → Repas |
| Portions for one cooking session | The Portions sheet (recipe page or Cook mode) |

No family data lives in this public repository.

## Develop
`npm install`, `npm run dev`, `npm test`, `npm run build`. Every push to `main` tests, builds and publishes to GitHub Pages.
