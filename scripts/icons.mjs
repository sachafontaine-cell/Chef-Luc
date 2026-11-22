// Draws the app icons (run once: node scripts/icons.mjs). Needs Playwright's Chromium.
// Same scheme as the other Fontaine apps: full-bleed navy, gold, with a fleur-de-lys.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const NAVY = '#0D235A', GOLD = '#E0A21C'
const fleur = `<path d="M50 2 C67 20 68 42 50 62 C32 42 33 20 50 2 Z"/>
  <path d="M46 58 C29 63 10 54 11 38 C12 25 30 22 34 33 C37 42 30 46 26 42 C28 52 38 54 47 50 Z"/>
  <path d="M54 58 C71 63 90 54 89 38 C88 25 70 22 66 33 C63 42 70 46 74 42 C72 52 62 54 53 50 Z"/>
  <rect x="28" y="59" width="44" height="9" rx="4"/>
  <path d="M43 67 L36 90 C45 86 49 79 50 73 C51 79 55 86 64 90 L57 67 Z"/>`
const hat = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="${NAVY}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -262)">
    <path d="M150 300c-46-6-80-42-80-88 0-50 40-90 90-90 12 0 24 2 34 7 16-34 50-57 90-57s74 23 90 57c10-5 22-7 34-7 50 0 90 40 90 90 0 46-34 82-80 88v82H150z" transform="translate(-28 0)" fill="${GOLD}"/>
    <rect x="122" y="398" width="268" height="44" rx="14" fill="${GOLD}"/>
    <g transform="translate(201 218) scale(1.1)" fill="${NAVY}">${fleur}</g>
  </g></svg>`
const b = await chromium.launch(), p = await b.newPage()
for (const [file, size, scale] of [['icon-512.png', 512, 0.86], ['icon-192.png', 192, 0.86], ['apple-touch-icon.png', 180, 0.84], ['favicon.png', 64, 0.92], ['icon-maskable.png', 512, 0.66]]) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<body style="margin:0">${hat(scale).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`)
  await p.screenshot({ path: 'public/' + file })
}
await b.close()
