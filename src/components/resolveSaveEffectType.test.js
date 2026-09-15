import { describe, it, expect } from 'vitest'
import { resolveSaveEffectType } from './BuffForm.jsx'
import { BUFF_TYPES } from '../data/buffTypes'

const ABILITY_FIRST = BUFF_TYPES.ability.effects[0].key

describe('resolveSaveEffectType 保留未知 effectType（不改写、不丢弃）', () => {
  it('未知但非空的 effectType 应原样保留，而非被改写成类别首个效果', () => {
    const mod = { category: 'ability', effectType: 'legacy_homebrew_foo', value: 5 }
    expect(resolveSaveEffectType(mod, BUFF_TYPES)).toBe('legacy_homebrew_foo')
  })

  it('未知类型即使被归到 offense 类别也保留原 effectType', () => {
    const mod = { category: 'offense', effectType: 'some_future_type', value: 1 }
    expect(resolveSaveEffectType(mod, BUFF_TYPES)).toBe('some_future_type')
  })

  it('已知类型正常保留', () => {
    const mod = { category: 'ability', effectType: ABILITY_FIRST, value: 1 }
    expect(resolveSaveEffectType(mod, BUFF_TYPES)).toBe(ABILITY_FIRST)
  })

  it('空 effectType 仍回退类别首个（交由下游 filter 处理空类别占位）', () => {
    const mod = { category: 'ability', effectType: '', value: 0 }
    expect(resolveSaveEffectType(mod, BUFF_TYPES)).toBe(ABILITY_FIRST)
  })

  it('空类别+空类型解析为空字符串（占位模块保存时被丢弃）', () => {
    const mod = { category: '', effectType: '', value: 0 }
    expect(resolveSaveEffectType(mod, BUFF_TYPES)).toBe('')
  })
})
