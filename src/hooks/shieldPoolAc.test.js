import { describe, it, expect } from 'vitest'
import { computeBuffStats } from './useBuffCalculator'
import { getMergedBuffsForCalculator } from '../lib/effects/effectMapping'

const ARMOR_INV_ID = 'inv-pool-armor'

const poolEffect = (max, threshold) => ({
  effectType: 'shield_pool',
  category: 'defense',
  scope: 'global',
  scopeDetail: [],
  value: { max, threshold, recoverOn: 'none', bonusEffects: [] },
})

/**
 * 身体甲附注「AC 16+敏捷」，敏捷 16（调整值 +3）。
 * 无护盾池接管时 getAC 给出 base 16 / total 19。
 */
const buildChar = (current, overrides = {}) => ({
  id: 'test-pool-ac',
  level: 1,
  xp: 0,
  abilities: { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 },
  buffs: [],
  inventory: [
    {
      id: ARMOR_INV_ID,
      name: '测试护盾甲',
      类型: '盔甲',
      附注: 'AC 16+敏捷',
      effects: [poolEffect(20, 12)],
    },
  ],
  equippedWorn: [{ id: 'body', inventoryId: ARMOR_INV_ID }],
  equippedHeld: [],
  equipment: {},
  shieldPoolStates: { [`equipment:${ARMOR_INV_ID}`]: { current } },
  ...overrides,
})

const statsOf = (char) => computeBuffStats(char, getMergedBuffsForCalculator(char), [])

describe('护盾池接管 AC 基准', () => {
  it('满池：基准取层数 20，敏捷照常叠加', () => {
    const s = statsOf(buildChar(20))
    expect(s.acBaseSource).toBe('shield_pool')
    expect(s.acBase).toBe(23) // 20 层 + 3 敏捷
    expect(s.ac).toBe(23)
  })

  it('中途 14 层：基准随层数下降，敏捷不被抹掉', () => {
    const s = statsOf(buildChar(14))
    expect(s.acBase).toBe(17) // 14 + 3
    expect(s.ac).toBe(17)
  })

  it('恰好等于阈值 12：仍按层数计', () => {
    const s = statsOf(buildChar(12))
    expect(s.acBase).toBe(15) // 12 + 3
  })

  it('低于阈值：基准封底在阈值 12', () => {
    const s = statsOf(buildChar(5))
    expect(s.acBase).toBe(15) // max(5,12) + 3
  })

  it('归零：基准仍是阈值 12，不退回 10 也不回到附注 16', () => {
    const s = statsOf(buildChar(0))
    expect(s.acBase).toBe(15)
    expect(s.ac).toBe(15)
  })

  it('护盾池不再伪装成 ac_bonus 注入，避免与基准重复计算', () => {
    const s = statsOf(buildChar(14))
    expect(s.acBonus).toBe(0)
  })

  it('与 BUFF 的 ac_bonus 正常叠加', () => {
    const char = buildChar(14)
    char.buffs = [{
      id: 'b-ac',
      source: '测试增益',
      enabled: true,
      effects: [{ effectType: 'ac_bonus', category: 'defense', scope: 'global', scopeDetail: [], value: 2 }],
    }]
    const s = statsOf(char)
    expect(s.acBonus).toBe(2)
    expect(s.ac).toBe(19) // 14 + 3 + 2
  })

  it('armor_override 优先级高于护盾池', () => {
    const char = buildChar(14)
    char.buffs = [{
      id: 'b-override',
      source: '测试覆盖',
      enabled: true,
      effects: [{
        effectType: 'armor_override',
        category: 'defense',
        scope: 'global',
        scopeDetail: [],
        value: { base: 18, applyDexMod: true, enableBase: true, enableExtra: false },
      }],
    }]
    const s = statsOf(char)
    expect(s.acBaseSource).toBe('armor_override')
    expect(s.acBase).toBe(21) // 18 + 3
  })

  it('多个护盾池取最高的解析基准', () => {
    const char = buildChar(14)
    char.buffs = [{
      id: 'b-pool',
      source: '测试护盾池',
      enabled: true,
      effects: [poolEffect(20, 10)],
    }]
    char.shieldPoolStates = {
      ...char.shieldPoolStates,
      'manual:测试护盾池': { current: 18 },
    }
    const s = statsOf(char)
    expect(s.acBase).toBe(21) // max(14, 18) + 3
  })
})
