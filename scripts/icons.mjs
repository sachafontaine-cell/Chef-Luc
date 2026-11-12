// Draws the app icons (run once: node scripts/icons.mjs). Needs Playwright's Chromium.
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
const hat = (scale, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${bg}
  <g transform="translate(256 262) scale(${scale}) translate(-256 -256)">
    <path d="M150 300c-46-6-80-42-80-88 0-50 40-90 90-90 12 0 24 2 34 7 16-34 50-57 90-57s74 23 90 57c10-5 22-7 34-7 50 0 90 40 90 90 0 46-34 82-80 88v82H150z" transform="translate(-28 0)" fill="#F7F3EA"/>
    <rect x="122" y="398" width="268" height="44" rx="14" fill="#D9A21B"/>
    <path d="M200 300v60M256 290v70M312 300v60" stroke="#14213D" stroke-width="12" stroke-linecap="round" opacity=".28"/>
  </g></svg>`
const round = '<rect width="512" height="512" rx="112" fill="#14213D"/>', full = '<rect width="512" height="512" fill="#14213D"/>'
const b = await chromium.launch(), p = await b.newPage()
for (const [file, size, svg] of [['icon-512.png', 512, hat(0.82, round)], ['icon-192.png', 192, hat(0.82, round)], ['apple-touch-icon.png', 180, hat(0.8, full)], ['favicon.png', 64, hat(0.86, round)], ['icon-maskable.png', 512, hat(0.62, full)]]) {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<body style="margin:0;background:transparent">${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body>`)
  await p.screenshot({ path: 'public/' + file, omitBackground: true })
}
await b.close()
