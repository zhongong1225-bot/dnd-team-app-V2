import { describe, it, expect } from 'vitest'
import { isDiceValue, formatDiceValue, diceValueExpression, isFormulaValue } from './formulas'
import { computeBuffStats } from '../hooks/useBuffCalculator'

const baseChar = {
  id: 'c1',
  name: '测试',
  classes: [{ className: '战士', level: 5 }],
  abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
}

function tempHpBuff(value) {
  return {
    id: 'b1',
    name: '临时生命',
    enabled: true,
    effects: [{ effectType: 'temp_hp', value }],
  }
}

describe('isDiceValue / formatDiceValue', () => {
  it('识别骰子形态对象', () => {
    expect(isDiceValue({ diceCount: 2, diceSides: 6, diceBonus: 3, rolled: 9 })).toBe(true)
  })

  it('不把普通数字/公式/数组当骰子', () => {
    expect(isDiceValue(5)).toBe(false)
    expect(isDiceValue({ ref: 'level', mult: 1 })).toBe(false)
    expect(isDiceValue([1, 2])).toBe(false)
    expect(isDiceValue(null)).toBe(false)
  })

  it('骰子形态与公式形态互斥', () => {
    const dice = { diceCount: 1, diceSides: 6 }
    expect(isDiceValue(dice)).toBe(true)
    expect(isFormulaValue(dice)).toBe(false)
  })

  it('格式化骰子表达式', () => {
    expect(formatDiceValue({ diceCount: 2, diceSides: 6, diceBonus: 0 })).toBe('2d6')
    expect(formatDiceValue({ diceCount: 1, diceSides: 8, diceBonus: 3 })).toBe('1d8+3')
    expect(formatDiceValue({ diceCount: 3, diceSides: 4, diceBonus: -2 })).toBe('3d4-2')
    expect(diceValueExpression({ diceCount: 1, diceSides: 6 })).toBe('1d6')
  })

  it('非骰子返回空串', () => {
    expect(formatDiceValue(5)).toBe('')
  })
})

describe('computeBuffStats temp_hp 骰子形态', () => {
  it('已掷骰子：临时生命取记下的结果', () => {
    const stats = computeBuffStats(baseChar, [tempHpBuff({ diceCount: 2, diceSides: 6, diceBonus: 0, rolled: 9 })], [])
    expect(stats.tempHp).toBe(9)
  })

  it('未掷骰子：临时生命按 0', () => {
    const stats = computeBuffStats(baseChar, [tempHpBuff({ diceCount: 2, diceSides: 6, diceBonus: 0, rolled: null })], [])
    expect(stats.tempHp).toBe(0)
  })

  it('骰子与固定值并存：取最大', () => {
    const stats = computeBuffStats(baseChar, [
      tempHpBuff({ diceCount: 2, diceSides: 6, rolled: 4 }),
      { id: 'b2', name: '固定', enabled: true, effects: [{ effectType: 'temp_hp', value: 7 }] },
    ], [])
    expect(stats.tempHp).toBe(7)
  })

  it('老数字值不受影响', () => {
    const stats = computeBuffStats(baseChar, [tempHpBuff(12)], [])
    expect(stats.tempHp).toBe(12)
  })
})
