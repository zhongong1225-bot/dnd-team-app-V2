import { describe, it, expect } from 'vitest'
import { deriveCooldownFromRecovery } from './recoveryCooldown'

describe('deriveCooldownFromRecovery', () => {
  it('旧字符串格式：long_rest → long_rest', () => {
    expect(deriveCooldownFromRecovery({ method: 'long_rest' })).toBe('long_rest')
  })

  it('旧字符串格式：short_rest → short_rest', () => {
    expect(deriveCooldownFromRecovery({ method: 'short_rest' })).toBe('short_rest')
  })

  it('数组格式：仅长休 → long_rest（原字符串比较会误判为 none）', () => {
    expect(deriveCooldownFromRecovery({ method: ['long_rest'] })).toBe('long_rest')
  })

  it('数组格式：仅短休 → short_rest', () => {
    expect(deriveCooldownFromRecovery({ method: ['short_rest'] })).toBe('short_rest')
  })

  it('数组格式：短休+长休并存 → 取最短 short_rest', () => {
    expect(deriveCooldownFromRecovery({ method: ['long_rest', 'short_rest'] })).toBe('short_rest')
    expect(deriveCooldownFromRecovery({ method: ['short_rest', 'long_rest'] })).toBe('short_rest')
  })

  it('黎明/吸能等非休息方式 → none（二元冷却只在休息重置）', () => {
    expect(deriveCooldownFromRecovery({ method: ['dawn'] })).toBe('none')
    expect(deriveCooldownFromRecovery({ method: ['absorb_energy'] })).toBe('none')
    expect(deriveCooldownFromRecovery({ method: ['dawn', 'long_rest'] })).toBe('long_rest')
  })

  it('缺失/空/非法输入 → none', () => {
    expect(deriveCooldownFromRecovery(undefined)).toBe('none')
    expect(deriveCooldownFromRecovery(null)).toBe('none')
    expect(deriveCooldownFromRecovery({})).toBe('none')
    expect(deriveCooldownFromRecovery({ method: [] })).toBe('none')
    expect(deriveCooldownFromRecovery({ method: 'none' })).toBe('none')
  })
})
