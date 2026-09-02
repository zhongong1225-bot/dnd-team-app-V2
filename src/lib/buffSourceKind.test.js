import { describe, it, expect } from 'vitest'
import { getColumnKeyForBuff, getBuffSourceKindLabel } from './buffSourceKind'

const transformEffect = { effectType: 'creature_transform', value: { creatureId: 'creature_x' } }

describe('buffSourceKind 分栏（房规：变身 BUFF 归临时栏）', () => {
  it('含变身效果的 BUFF 归入临时栏（effects 数组形式）', () => {
    expect(getColumnKeyForBuff({ name: '变身: 成年银龙', effects: [transformEffect] })).toBe('temporary')
  })

  it('旧版顶层 effectType 形式的变身 BUFF 也归临时栏', () => {
    expect(getColumnKeyForBuff({ name: '变身', effectType: 'creature_transform', value: { creatureId: 'c' } })).toBe('temporary')
  })

  it('即使 sourceKind 被标为冒险，变身 BUFF 仍归临时栏', () => {
    expect(getColumnKeyForBuff({ sourceKind: 'adventure', effects: [transformEffect] })).toBe('temporary')
  })

  it('变身 BUFF 的小标签显示"临时"', () => {
    expect(getBuffSourceKindLabel({ sourceKind: 'adventure', effects: [transformEffect] })).toBe('临时')
  })

  it('普通冒险 BUFF 不受影响', () => {
    expect(getColumnKeyForBuff({ sourceKind: 'adventure', effects: [{ effectType: 'ac_bonus', value: 1 }] })).toBe('adventure')
    expect(getColumnKeyForBuff({ effects: [{ effectType: 'ac_bonus', value: 1 }] })).toBe('adventure')
  })

  it('系统来源优先：专长/装备变身 BUFF 仍归系统栏', () => {
    expect(getColumnKeyForBuff({ fromFeat: 'f1', effects: [transformEffect] })).toBe('feat')
    expect(getColumnKeyForBuff({ fromItem: 'i1', effects: [transformEffect] })).toBe('equipment')
  })
})
