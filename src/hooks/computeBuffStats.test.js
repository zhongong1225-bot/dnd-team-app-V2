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
})
