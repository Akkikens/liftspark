import { describe, it, expect } from 'vitest'
import { unitForLocale } from './default-unit.js'

describe('unitForLocale', () => {
  it('starts the US, Canada, Liberia and Myanmar in pounds', () => {
    for (const tag of ['en-US', 'en_US', 'es-US', 'fr-CA', 'en-CA', 'en-LR', 'my-MM', 'zh-Hans-US']) expect(unitForLocale(tag)).toBe('lb')
  })
  it('starts everywhere else, and a tag without a region, in kilograms', () => {
    for (const tag of ['en', 'en-GB', 'de-DE', 'pt-BR', 'es-MX', 'ja-JP', '', null, undefined, 42]) expect(unitForLocale(tag)).toBe('kg')
  })
})
