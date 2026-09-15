import { describe, it, expect } from 'vitest'
import {
  normalizeChargeItemValue,
  resolveChargeItemCharges,
  formatChargeItemBrief,
  getMaxSpendableAmount,
} from './chargeItemModel'
import { isFormulaValue } from './formulas'

// 公式上下文形态（prof 为数字 → buildChargeFormulaContext 直接采用）
const ctx = { level: 5, prof: 3, abilities: { cha: 16 }, classLevels: { 魔契师: 5 }, speed: 30 }

describe('充能数支持公式引用', () => {
  it('归一化保留公式对象，不压成数字', () => {
    const norm = normalizeChargeItemValue({
      resourceType: 'charges',
      charges: { ref: 'proficiency', mult: 2, add: 1 },
    })
    expect(isFormulaValue(norm.charges)).toBe(true)
    expect(norm.charges.ref).toBe('proficiency')
    expect(norm.charges.mult).toBe(2)
    expect(norm.charges.add).toBe(1)
  })

  it('普通数字充能照常归一化', () => {
    const norm = normalizeChargeItemValue({ resourceType: 'charges', charges: 7 })
    expect(norm.charges).toBe(7)
  })

  it('公式按上下文求值：熟练×2+1（prof=3）→ 7', () => {
    const value = { resourceType: 'charges', charges: { ref: 'proficiency', mult: 2, add: 1 } }
    expect(resolveChargeItemCharges(value, ctx)).toBe(7)
  })

  it('公式引用等级：level=5 → 5', () => {
    const value = { resourceType: 'charges', charges: { ref: 'level' } }
    expect(resolveChargeItemCharges(value, ctx)).toBe(5)
  })

  it('公式引用属性调整值：魅力16 → +3', () => {
    const value = { resourceType: 'charges', charges: { ref: 'abilityModifier', ability: 'cha' } }
    expect(resolveChargeItemCharges(value, ctx)).toBe(3)
  })

  it('无 char 时公式求值退化为 0 下限，不报 NaN', () => {
    const value = { resourceType: 'charges', charges: { ref: 'proficiency', mult: 2, add: 1 } }
    expect(resolveChargeItemCharges(value, null)).toBe(1)
  })

  it('摘要：有 char 显示换算数字，无 char 显示公式文案', () => {
    const value = { resourceType: 'charges', charges: { ref: 'proficiency', mult: 2, add: 1 } }
    expect(formatChargeItemBrief(value, ctx)).toContain('7')
    const noChar = formatChargeItemBrief(value, null)
    expect(noChar).not.toContain('NaN')
    expect(noChar.length).toBeGreaterThan(0)
  })

  it('最大可消耗量按公式换算结果走', () => {
    const norm = normalizeChargeItemValue({
      resourceType: 'charges',
      charges: { ref: 'proficiency', mult: 2, add: 1 },
    })
    expect(getMaxSpendableAmount(norm, ctx)).toBe(7)
  })
})
