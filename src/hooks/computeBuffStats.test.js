import { describe, it, expect } from 'vitest'
import { computeBuffStats } from './useBuffCalculator.js'
import chars from '../../tools/supabase-export/characters.json'

function getMergedBuffsForCalculator(data) {
  return [
    ...(data.buffs || []),
    ...(data.buffStash || []),
  ]
}

describe('布兰卡属性计算', () => {
  it('不应把所有属性降到 1', () => {
    const char = chars.find((c) => c.data?.name === '布兰卡·冯·洛维奇')
    expect(char).toBeTruthy()
    const data = char.data
    const buffs = getMergedBuffsForCalculator(data)
    const stats = computeBuffStats(data, buffs)
    console.log('base abilities:', data.abilities)
    console.log('final abilities:', stats.abilities)
    expect(stats.abilities.str).toBeGreaterThan(1)
    expect(stats.abilities.dex).toBeGreaterThan(1)
  })

  it('部分 ability_override 只覆盖指定属性', () => {
    const data = {
      abilities: { str: 10, dex: 16, con: 14, int: 18, wis: 16, cha: 10 },
      xp: 101000,
      buffs: [
        {
          source: '测试',
          effects: [{ effectType: 'ability_override', value: { wis: 20 } }],
        },
      ],
    }
    const stats = computeBuffStats(data, data.buffs)
    expect(stats.abilities.wis).toBe(20)
    expect(stats.abilities.int).toBe(18)
    expect(stats.abilities.str).toBe(10)
  })

  it('ability_adjustment 复合效果展开后参与属性计算（智力-2/感知+2）', () => {
    const data = {
      abilities: { str: 10, dex: 10, con: 10, int: 12, wis: 14, cha: 10 },
      xp: 0,
      buffs: [
        {
          source: '穿越熵之海',
          effects: [{
            effectType: 'ability_adjustment',
            value: { proficiency: {}, override: {}, increase: { int: -2, wis: 2 } },
          }],
        },
      ],
    }
    const stats = computeBuffStats(data, data.buffs)
    expect(stats.abilities.int).toBe(10)
    expect(stats.abilities.wis).toBe(16)
  })
})

describe('移动速度效果的各种写法', () => {
  const baseChar = { abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, speed: 30 }
  const statsFor = (value) => computeBuffStats(baseChar, [{ source: '测试', effects: [{ effectType: 'speed_bonus', value }] }])

  it('纯数字加在步行速度上', () => {
    expect(statsFor(10).speedBonus).toBe(10)
  })

  it('只有 bonus 没有 type 时按步行速度处理', () => {
    expect(statsFor({ bonus: 30 }).speedBonus).toBe(30)
  })

  it('type 为 walk 时加在步行速度上', () => {
    expect(statsFor({ type: 'walk', bonus: 5 }).speedBonus).toBe(5)
  })

  it('type 为 swim 时加在游泳速度上，不影响步行', () => {
    const stats = statsFor({ type: 'swim', bonus: 10 })
    expect(stats.swimSpeedBonus).toBe(10)
    expect(stats.speedBonus).toBe(0)
  })

  it('攀爬 bonus 为 0 表示等于行走速度', () => {
    const stats = statsFor({ type: 'climb', bonus: 0 })
    expect(stats.climbEqualsWalk).toBe(true)
    expect(stats.climbSpeedBonus).toBe(0)
  })

  it('游泳 bonus 为 0 表示等于行走速度', () => {
    const stats = statsFor({ type: 'swim', bonus: 0 })
    expect(stats.swimEqualsWalk).toBe(true)
    expect(stats.swimSpeedBonus).toBe(0)
  })

  it('攀爬有具体数值时不设等于行走速度标记', () => {
    const stats = statsFor({ type: 'climb', bonus: 20 })
    expect(stats.climbSpeedBonus).toBe(20)
    expect(stats.climbEqualsWalk).toBe(false)
  })
})

describe('双武器战斗与双持客效果聚合', () => {
  const statsWith = (effect) => computeBuffStats(
    { level: 5, abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } },
    [{ id: 'b1', name: '测试', enabled: true, effects: [effect] }],
  )
  const eff = (effectType, value) => ({ effectType, category: 'offense', scope: 'global', scopeDetail: [], value })

  it('two_weapon_fighting_bonus 聚合为布尔', () => {
    expect(statsWith(eff('two_weapon_fighting_bonus', true)).twoWeaponFightingBonus).toBe(true)
  })

  it('offhand_ignores_light 聚合为布尔', () => {
    expect(statsWith(eff('offhand_ignores_light', true)).offhandIgnoresLight).toBe(true)
  })

  it('未挂效果时为 falsy', () => {
    const stats = computeBuffStats({ level: 5, abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, [])
    expect(stats.twoWeaponFightingBonus).toBeFalsy()
    expect(stats.offhandIgnoresLight).toBeFalsy()
  })

  it('value 为 false 时不聚合', () => {
    expect(statsWith(eff('offhand_ignores_light', false)).offhandIgnoresLight).toBeFalsy()
  })

  it("兼容字符串 'true' 写法", () => {
    expect(statsWith(eff('two_weapon_fighting_bonus', 'true')).twoWeaponFightingBonus).toBe(true)
  })

  it('对象形状不授予标记：布尔效果只认严格布尔值，{ addAbilityMod: true } 这类旧配置不生效', () => {
    expect(statsWith(eff('two_weapon_fighting_bonus', { value: true })).twoWeaponFightingBonus).toBeFalsy()
  })
})
