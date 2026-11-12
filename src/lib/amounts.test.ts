import { describe, expect, it } from 'vitest'
import { fraction, parseNum, scaleText } from './amounts'

describe('reading numbers', () => {
  it('reads whole, decimal and fraction amounts', () => {
    expect(parseNum('800')).toBe(800)
    expect(parseNum('0.5')).toBe(0.5)
    expect(parseNum('2½')).toBe(2.5)
    expect(parseNum('¾')).toBe(0.75)
  })
  it('writes kitchen fractions', () => {
    expect(fraction(1.4)).toBe('1⅓')
    expect(fraction(0.35)).toBe('⅓')
    expect(fraction(2.98)).toBe('3')
    expect(fraction(0.05)).toBe('¼')
  })
})

describe('scaling ingredient lines', () => {
  const up = (t: string) => scaleText(t, 1.4, 'ingredient')
  it('leaves the card untouched at ×1', () => {
    const line = 'Boneless chicken thighs 800 g (1¾ lb)'
    expect(scaleText(line, 1, 'ingredient')).toBe(line)
  })
  it('scales grams with the measure in brackets', () => {
    expect(up('Boneless chicken thighs 800 g (1¾ lb)')).toBe('Boneless chicken thighs 1100 g (2½ lb)')
    expect(up('Jasmine rice 450 g (2½ rice cups)')).toBe('Jasmine rice 630 g (3½ rice cups)')
    expect(up('cayenne 0.5 g (¼ tsp)')).toBe('cayenne 0.7 g (⅓ tsp)')
  })
  it('scales counts', () => {
    expect(up('Kidney beans 2 cans: rinse')).toBe('Kidney beans 3 cans: rinse')
    expect(up('garlic 6 g (2 cloves) pressed')).toBe('garlic 8.5 g (3 cloves) pressed')
    expect(up('eggs 3')).toBe('eggs 4')
  })
  it('never touches sizes, times, temperatures or recipe numbers', () => {
    expect(up('Cheddar 225 g (8 oz): 1 cm cubes')).toBe('Cheddar 320 g (11 oz): 1 cm cubes')
    expect(up('soak 30 min in a 12" skillet at 375°F')).toBe('soak 30 min in a 12" skillet at 375°F')
    expect(up('Isopropyl alcohol 70% 10 g (2 tsp)')).toBe('Isopropyl alcohol 70% 14 g (2¾ tsp)')
    expect(up('Serve with Cucumber Salad (032)')).toBe('Serve with Cucumber Salad (032)')
    expect(up('9×13 baking dish')).toBe('9×13 baking dish')
  })
  it('halves cleanly', () => {
    expect(scaleText('Rotini 160 g (2 cups dry); salted water', 0.5, 'ingredient')).toBe('Rotini 80 g (1 cups dry); salted water')
  })
})

describe('scaling steps', () => {
  const up = (t: string) => scaleText(t, 1.4, 'step')
  it('scales amounts written in a step', () => {
    expect(up('Pat 600 g chicken dry on board')).toBe('Pat 840 g chicken dry on board')
  })
  it('keeps the rice cooker water line in step with the rice', () => {
    expect(up('rinse 2½ rice cups jasmine rice, add water to line 2½ (White scale)')).toBe('rinse 3½ rice cups jasmine rice, add water to line 3½ (White scale)')
  })
  it('leaves times, temperatures, step numbers and batches alone', () => {
    const t = 'Convection bake 375°F (190°C) 30 min, basting at 15 min. Do steps 2–4 meanwhile, in 2 batches.'
    expect(up(t)).toBe(t)
  })
})
